// ============================================================
// api.js — All Supabase database operations
// ============================================================
import { supabase } from './supabaseClient'

// ── Global API timeout ───────────────────────────────────────
// Every exported api object method is wrapped with withApiTimeout
// so stale connections after browser sleep always fail in 10s
// rather than hanging the UI forever.
const API_TIMEOUT_MS = 30000
function withApiTimeout(promise) {
  let timer
  const race = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), API_TIMEOUT_MS)
  })
  return Promise.race([promise, race]).finally(() => clearTimeout(timer))
}
function wrapWithTimeout(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'function' ? (...a) => withApiTimeout(v(...a)) : v
  }
  return out
}


// ── Auth ─────────────────────────────────────────────────────
export const auth = wrapWithTimeout({
  async signUp({ email, password, name, phone }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, phone } }
    })
    if (error) throw error
    if (data.user) {
      // Retry upsert a few times — auth trigger may not have fired yet
      let attempts = 0
      while (attempts < 5) {
        await new Promise(r => setTimeout(r, 500))
        const { error: upsertErr } = await supabase.from('profiles').upsert({
          id: data.user.id,
          name,
          email,
          phone: phone || '',
          role: 'player',
          games_attended: 0,
        }, { onConflict: 'id' })
        if (!upsertErr) break
        attempts++
        if (attempts === 5) console.warn('Profile upsert failed after retries:', upsertErr)
      }
    }
    return data
  },

  async signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session
  },

  onAuthChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
})

// ── Profiles ──────────────────────────────────────────────────
export const profiles = wrapWithTimeout({
  async getById(id) {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getAll() {
    // Security: This returns all profiles including PII (phone, address, waiverData).
    // Access is controlled by Supabase RLS — ensure your policy restricts this to admin role only.
    // Non-admin users will get an empty array or error from RLS, which is handled gracefully.
    const { data, error } = await supabase
      .from('profiles').select('*').order('join_date')
    if (error) throw error
    return data || []
  },

  async update(id, patch) {
    const { error } = await supabase
      .from('profiles').update(patch).eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    // Deletes auth user via Supabase Edge Function.
    // The Edge Function must be deployed with --no-verify-jwt and verify the
    // caller's admin role itself (see supabase/functions/delete-user/index.ts below).
    // We pass both the anon key (apikey header) and the user JWT (Authorization)
    // so the gateway lets the request through, and the function can verify it.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated — please log in again')

    // supabase.supabaseKey is the anon key — needed as the gateway apikey header
    const anonKey = supabase.supabaseKey
    const res = await fetch(
      `${supabase.supabaseUrl}/functions/v1/delete-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ userId: id }),
      }
    )
    const text = await res.text()
    const result = text ? JSON.parse(text) : {}
    if (!res.ok || result.error) throw new Error(result.error || `Delete failed (${res.status})`)
  },

  async uploadProfilePic(userId, file) {
    // Always store as avatar.jpg regardless of source format — ensures old files are replaced, never orphaned
    const path = `profiles/${userId}/avatar.jpg`
    const { error: upErr } = await supabase.storage.from('images').upload(path, file, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) throw upErr
    // Bust cache by appending a timestamp query param
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    const urlWithBust = `${data.publicUrl}?t=${Date.now()}`
    await supabase.from('profiles').update({ profile_pic: urlWithBust }).eq('id', userId)
    return urlWithBust
  },

  async uploadVipId(userId, file, slot) {
    // slot: 0 or 1  (up to 2 government ID images per player)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `vip-id/${userId}/id_${slot}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: false })
    if (error) throw new Error(error.message)
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    return data.publicUrl
  },

  async saveVipIdImages(userId, urls) {
    const { error } = await supabase.from('profiles')
      .update({ vip_id_images: urls })
      .eq('id', userId)
    if (error) throw new Error(error.message)
  },
})

// ── Events ────────────────────────────────────────────────────
export const events = wrapWithTimeout({
  async getAll() {
    const { data: evs, error } = await supabase
      .from('events').select('*, event_extras(*), bookings(*)').order('date')
    if (error) throw error
    // Normalise to camelCase shape the app expects
    return evs.map(normaliseEvent)
  },

  async create(ev) {
    const { extras, ...evData } = ev
    const { data, error } = await supabase
      .from('events').insert(toSnakeEvent(evData)).select().single()
    if (error) throw error
    if (extras?.length) {
      const extraRows = extras.map((ex, i) => ({
        event_id:   data.id,
        name:       JSON.stringify({ n: ex.name, pid: ex.productId || null, vid: ex.variantId || null }),
        price:      Number(ex.price) || 0,
        no_post:    ex.noPost ?? false,
        sort_order: i,
        enabled:    ex.enabled !== false,
      }))
      const { error: extErr } = await supabase.from('event_extras').insert(extraRows)
      if (extErr) console.warn('event_extras insert warning:', extErr.message) // non-fatal
    }
    return data
  },

  async update(id, patch) {
    const { extras, bookings, ...evData } = patch
    // Write event row — strip unknown columns with progressive retry
    const eventRow = toSnakeEvent(evData)
    // Remove extras_json — not a guaranteed column, data lives in event_extras rows
    delete eventRow.extras_json
    const { error } = await supabase.from('events').update(eventRow).eq('id', id)
    if (error) throw error

    // Verify map_embed actually saved — column may not exist in DB yet
    if (eventRow.map_embed !== undefined && eventRow.map_embed !== null) {
      const { data: check } = await supabase.from('events').select('map_embed').eq('id', id).single()
      if (check && check.map_embed !== eventRow.map_embed) {
        throw new Error('map_embed column is missing from your events table in Supabase. Run this SQL in your Supabase SQL Editor:\n\nALTER TABLE events ADD COLUMN IF NOT EXISTS map_embed text;')
      }
    }
    if (extras !== undefined) {
      await supabase.from('event_extras').delete().eq('event_id', id)
      if (extras.length) {
        // Always encode productId/variantId in name field — works without migration
        const rows = extras.map((ex, i) => ({
          event_id:   id,
          name:       JSON.stringify({ n: ex.name, pid: ex.productId || null, vid: ex.variantId || null }),
          price:      Number(ex.price) || 0,
          no_post:    ex.noPost ?? ex.no_post ?? false,
          sort_order: i,
          enabled:    ex.enabled !== false,
        }))
        const { error: ie } = await supabase.from('event_extras').insert(rows)
        if (ie) throw ie
      }
    }
  },

  async delete(id) {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error
  },

  async uploadBanner(eventId, file) {
    // Resize to max 1200px before uploading
    const resized = await new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const MAX = 1200
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => {
          if (blob) resolve(new File([blob], 'banner.jpg', { type: 'image/jpeg' }))
          else reject(new Error('canvas.toBlob failed'))
        }, 'image/jpeg', 0.85)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })

    // Delete any existing banner files for this event first
    // (prevents CDN cache serving stale images at the old path)
    try {
      const { data: existing } = await supabase.storage.from('images').list(`events/${eventId}`)
      if (existing?.length) {
        const oldPaths = existing.map(f => `events/${eventId}/${f.name}`)
        await supabase.storage.from('images').remove(oldPaths)
      }
    } catch { /* non-fatal — proceed with upload regardless */ }

    // Use a timestamped filename so the CDN never serves a cached old version
    const ts = Date.now()
    const path = `events/${eventId}/banner_${ts}.jpg`
    const { error } = await supabase.storage.from('images').upload(path, resized, { contentType: 'image/jpeg' })
    if (error) throw error
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    await supabase.from('events').update({ banner: data.publicUrl }).eq('id', eventId)
    return data.publicUrl
  }
})

// ── Bookings ──────────────────────────────────────────────────
export const bookings = wrapWithTimeout({
  async create(booking) {
    const { data, error } = await supabase.from('bookings').insert({
      event_id:       booking.eventId,
      user_id:        booking.userId,
      user_name:      booking.userName,
      ticket_type:    booking.type,
      qty:            booking.qty,
      extras:         booking.extras,
      total:          booking.total,
      square_order_id: booking.squareOrderId || null,
    }).select().single()
    if (error) throw error
    return data
  },

  async checkIn(bookingId, userId) {
    const { error: bErr } = await supabase
      .from('bookings').update({ checked_in: true }).eq('id', bookingId)
    if (bErr) throw bErr
    const { data: checkedInBookings, error: cErr } = await supabase
      .from('bookings').select('id').eq('user_id', userId).eq('checked_in', true)
    if (cErr) throw cErr
    const actualCount = checkedInBookings.length
    const { error: pErr } = await supabase
      .from('profiles').update({ games_attended: actualCount }).eq('id', userId)
    if (pErr) throw pErr
    return actualCount
  },

  async update(bookingId, patch) {
    const fields = {
      ticket_type: patch.type,
      qty:         patch.qty,
      total:       patch.total,
      checked_in:  patch.checkedIn,
    }
    // Allow transferring a booking to a different event
    if (patch.newEventId) fields.event_id = patch.newEventId
    const { error } = await supabase
      .from('bookings').update(fields).eq('id', bookingId)
    if (error) throw error
  },

  async delete(bookingId) {
    const { error } = await supabase
      .from('bookings').delete().eq('id', bookingId)
    if (error) throw error
  }
})

// ── Shop ──────────────────────────────────────────────────────
export const shop = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('shop_products').select('*').order('sort_order')
    if (error) throw error
    return data.map(normaliseProduct)
  },

  async create(product) {
    const snake = toSnakeProduct(product)
    const { data, error } = await supabase
      .from('shop_products').insert(snake).select().single()
    if (error) {
      // Retry stripping columns that may not exist in DB yet
      const { variants: _v, game_extra: _g, images: _i, category: _c, cost_price: _cp, ...snakeCore } = snake
      const { data: d2, error: e2 } = await supabase
        .from('shop_products').insert(snakeCore).select().single()
      if (e2) throw new Error('Product create failed: ' + e2.message)
      return normaliseProduct(d2)
    }
    return normaliseProduct(data)
  },

  async update(id, patch) {
    const snake = toSnakeProduct(patch)
    const { data, error } = await supabase
      .from('shop_products').update(snake).eq('id', id).select().single()
    if (error) {
      // Retry stripping columns that may not exist in DB yet
      const { variants: _v, game_extra: _g, images: _i, category: _c, cost_price: _cp, ...snakeCore } = snake
      const { data: d2, error: e2 } = await supabase
        .from('shop_products').update(snakeCore).eq('id', id).select().single()
      if (e2) throw new Error('Product save failed: ' + e2.message)
      if (!d2) throw new Error('Product save failed — no data returned.')
      return normaliseProduct(d2)
    }
    if (!data) throw new Error('Product save failed — no data returned.')
    return normaliseProduct(data)
  },

  async delete(id) {
    const { error } = await supabase.from('shop_products').delete().eq('id', id)
    if (error) throw error
  },

  async reorder(orderedIds) {
    // Bulk update sort_order for each product
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from('shop_products').update({ sort_order: i }).eq('id', id)
      )
    )
  },

  async uploadImage(productId, file) {
    const ext = file.name.split('.').pop()
    const path = `shop/${productId}/image.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    await supabase.from('shop_products').update({ image: data.publicUrl }).eq('id', productId)
    return data.publicUrl
  },

  async uploadProductImage(productId, file) {
    const ext = file.name.split('.').pop()
    const uniqueId = Date.now() + '_' + Math.random().toString(36).slice(2,7)
    const path = `shop/${productId}/${uniqueId}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    return data.publicUrl
  }
})

// ── Postage ───────────────────────────────────────────────────
export const postage = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('postage_options').select('*').order('sort_order')
    if (error) throw error
    return data
  },

  async create(opt) {
    const { data, error } = await supabase
      .from('postage_options').insert({ name: opt.name, price: opt.price }).select().single()
    if (error) throw error
    return data
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('postage_options').update({ name: patch.name, price: patch.price }).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('postage_options').delete().eq('id', id)
    if (error) throw error
  }
})

// ── Gallery ───────────────────────────────────────────────────
export const gallery = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('gallery_albums')
      .select('*, gallery_images(*)')
      .order('sort_order')
    if (error) throw error
    return data.map(a => ({
      id: a.id, title: a.title,
      images: (a.gallery_images || []).sort((x, y) => x.sort_order - y.sort_order).map(i => i.url)
    }))
  },

  async createAlbum(title) {
    const { data, error } = await supabase
      .from('gallery_albums').insert({ title }).select().single()
    if (error) throw error
    return { ...data, images: [] }
  },

  async addImageUrl(albumId, url) {
    const { error } = await supabase
      .from('gallery_images').insert({ album_id: albumId, url })
    if (error) throw error
  },

  async uploadImage(albumId, file) {
    const path = `gallery/${albumId}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('images').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    const { error: insertErr } = await supabase
      .from('gallery_images').insert({ album_id: albumId, url: data.publicUrl })
    if (insertErr) throw insertErr
    return data.publicUrl
  },

  async removeImage(albumId, url) {
    const { error } = await supabase
      .from('gallery_images').delete().eq('album_id', albumId).eq('url', url)
    if (error) throw error
  },

  async deleteAlbum(albumId) {
    const { error: imgErr } = await supabase
      .from('gallery_images').delete().eq('album_id', albumId)
    if (imgErr) throw imgErr
    const { error } = await supabase
      .from('gallery_albums').delete().eq('id', albumId)
    if (error) throw error
  }
})

// ── Q&A ───────────────────────────────────────────────────────
export const qa = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase.from('qa_items').select('id, question, answer, sort_order').order('created_at', { ascending: true })
    if (error) throw error
    const sorted = (data || []).slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    return sorted.map(i => ({ id: i.id, q: i.question, a: i.answer, image: '', sort_order: i.sort_order }))
  },

  async create(item) {
    const { error } = await supabase
      .from('qa_items').insert({ question: item.q, answer: item.a })
    if (error) {
      console.error('qa.create error:', JSON.stringify(error))
      throw new Error(error.message || error.code || JSON.stringify(error))
    }
  },

  async update(id, item) {
    const { error } = await supabase
      .from('qa_items').update({ question: item.q, answer: item.a }).eq('id', id)
    if (error) {
      console.error('qa.update error:', JSON.stringify(error))
      throw new Error(error.message || error.code || JSON.stringify(error))
    }
  },

  async delete(id) {
    const { error } = await supabase.from('qa_items').delete().eq('id', id)
    if (error) {
      console.error('qa.delete error:', JSON.stringify(error))
      throw new Error(error.message || error.code || JSON.stringify(error))
    }
  }
})

// ── Site settings ─────────────────────────────────────────────
// Keys that must NEVER be stored in the DB or returned to the client
const SENSITIVE_SETTING_KEYS = ['square_access_token']

export const settings = wrapWithTimeout({
  async get(key) {
    // Security: sensitive keys must live in Edge Function env vars, not this table
    if (SENSITIVE_SETTING_KEYS.includes(key)) {
      console.error(`Security: attempted to read sensitive key "${key}" from DB — use Edge Function env vars instead`)
      return ''
    }
    const { data, error } = await supabase
      .from('site_settings').select('value').eq('key', key).single()
    if (error) return ''
    return data.value
  },

  async set(key, value) {
    // Security: block storing sensitive values in the DB
    if (SENSITIVE_SETTING_KEYS.includes(key)) {
      throw new Error(`Security: "${key}" must be stored in Edge Function environment variables, not the database.`)
    }
    // upsert with explicit conflict target — works regardless of whether row exists
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) throw error
  }
})

// ── Cash Sales ────────────────────────────────────────────────
export const cashSales = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('cash_sales').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(sale) {
    const { data, error } = await supabase.from('cash_sales').insert({
      customer_name:  sale.customerName || 'Walk-in',
      customer_email: sale.customerEmail || '',
      user_id:        sale.userId || null,
      items:          sale.items,
      total:          sale.total,
      recorded_by:    sale.recordedBy || null,
    }).select().single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error } = await supabase.from('cash_sales').delete().eq('id', id)
    if (error) throw error
  }
})
function normaliseEvent(ev) {
  return {
    id:           ev.id,
    title:        ev.title,
    date:         ev.date,
    time:         ev.time?.slice(0, 5) ?? '09:00',
    endTime:      ev.end_time?.slice(0, 5) ?? '',
    location:     ev.location,
    description:  ev.description,
    walkOnSlots:  ev.walk_on_slots,
    rentalSlots:  ev.rental_slots,
    walkOnPrice:  Number(ev.walk_on_price),
    rentalPrice:  Number(ev.rental_price),
    banner:       ev.banner,
    mapEmbed:     ev.map_embed,
    published:    ev.published,
    vipOnly:            ev.vip_only ?? false,
    shopifyWalkOnVariantId: ev.shopify_walkon_variant_id || null,
    shopifyRentalVariantId: ev.shopify_rental_variant_id || null,
    extras: (ev.event_extras || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(ex => {
        let name = ex.name, productId = ex.product_id || null, variantId = ex.variant_id || null
        try {
          const parsed = JSON.parse(ex.name)
          if (parsed?.n) { name = parsed.n; productId = parsed.pid || productId; variantId = parsed.vid || variantId }
        } catch {}
        return { id: ex.id, name, price: Number(ex.price), noPost: ex.no_post, productId, variantId, enabled: ex.enabled !== false }
      }),
    bookings: (ev.bookings || []).map(b => ({
      id:            b.id,
      userId:        b.user_id,
      userName:      b.user_name,
      type:          b.ticket_type,
      qty:           b.qty,
      extras:        b.extras,
      total:         Number(b.total),
      checkedIn:     b.checked_in,
      date:          b.created_at,
      squareOrderId: b.square_order_id || null,
      adminNotes:   b.admin_notes || '',
    }))
  }
}

function normaliseProduct(p) {
  const variants = (Array.isArray(p.variants) ? p.variants : []).map(v => ({ ...v, supplierCode: v.supplierCode || v.supplier_code || '' }))
  // If variants exist, total stock = sum of variant stocks
  const variantStock = variants.length > 0
    ? variants.reduce((s, v) => s + (Number(v.stock) || 0), 0)
    : null
  return {
    id:          p.id,
    name:        p.name,
    description: p.description,
    price:       Number(p.price),
    salePrice:   p.sale_price ? Number(p.sale_price) : null,
    onSale:      p.on_sale,
    image:       p.image,
    images:      Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []),
    stock:       variantStock !== null ? variantStock : p.stock,
    baseStock:   p.stock, // raw DB stock (only used when no variants)
    noPost:         p.no_post,
    gameExtra:      p.game_extra || false,
    hiddenFromShop: p.hidden_from_shop || false,
    category:    p.category || '',
    supplierCode: p.supplier_code || '',
    variants,
  }
}

export function normaliseProfile(p) {
  return {
    id:                 p.id,
    name:               p.name,
    callsign:           p.callsign || "",
    email:              p.email,
    phone:              p.phone,
    address:            p.address,
    role:               p.role,
    gamesAttended:      p.games_attended,
    waiverSigned:       p.waiver_signed,
    waiverYear:         p.waiver_year,
    waiverData:         p.waiver_data,
    extraWaivers:       p.extra_waivers || [],
    waiverPending:      p.waiver_pending,
    vipStatus:          p.vip_status,
    vipApplied:         p.vip_applied,
    vipExpiresAt:       p.vip_expires_at || null,
    ukara:              p.ukara,
    ukaraExpiresAt:     p.ukara_expires_at || null,
    credits:            Number(p.credits),
    leaderboardOptOut:  p.leaderboard_opt_out,
    profilePic:         p.profile_pic,
    deleteRequest:      p.delete_request,
    permissions:        p.permissions,
    joinDate:           p.join_date,
    adminNotes:         p.admin_notes || '',
    vipIdImages:        p.vip_id_images || [],
    cardStatus:         p.card_status    || 'none',
    cardReason:         p.card_reason    || '',
    cardIssuedAt:       p.card_issued_at || null,
    canMarshal:         p.can_marshal    || false,
    publicProfile:      p.public_profile ?? false,
    bio:                p.bio            || '',
    customRank:         p.custom_rank    || null,
    designation:        p.designation    || null,
    birthDate:          p.birth_date     || null,
    birthdayCreditYear: p.birthday_credit_year || null,
    nationality:        p.nationality || 'GB',
    createdAt:          p.created_at  || null,
  }
}

function toSnakeEvent(ev) {
  // Strip base64 banners — too large for DB text column; only store URLs
  const banner = ev.banner && ev.banner.startsWith('data:') ? null : (ev.banner || null)
  return {
    title:          ev.title,
    date:           ev.date,
    time:           ev.time,
    end_time:       ev.endTime || null,
    location:       ev.location,
    description:    ev.description,
    walk_on_slots:  Number(ev.walkOnSlots) || 0,
    rental_slots:   Number(ev.rentalSlots) || 0,
    walk_on_price:  Number(ev.walkOnPrice) || 0,
    rental_price:   Number(ev.rentalPrice) || 0,
    banner:         banner,
    map_embed:      ev.mapEmbed || null,
    published:      ev.published ?? true,
    vip_only:       ev.vipOnly ?? false,
    shopify_walkon_variant_id: ev.shopifyWalkOnVariantId || null,
    shopify_rental_variant_id: ev.shopifyRentalVariantId || null,
  }
}

function toSnakeProduct(p) {
  return {
    name:        p.name,
    description: p.description,
    price:       p.price,
    sale_price:  p.salePrice,
    on_sale:     p.onSale,
    image:       p.images && p.images.length > 0 ? p.images[0] : (p.image || null),
    images:      p.images || [],
    stock:       p.variants && p.variants.length > 0 ? 0 : p.stock,
    no_post:          p.noPost,
    game_extra:       p.gameExtra || false,
    hidden_from_shop: p.hiddenFromShop || false,
    category:     p.category || '',
    supplier_code: p.supplierCode || '',
    variants:    p.variants || [],
    // Note: _descTab is a UI-only field, never saved
  }
}

// ── Shop Orders ───────────────────────────────────────────────
export const shopOrders = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('shop_orders').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(order) {
    const { data, error } = await supabase.from('shop_orders').insert({
      customer_name:    order.customerName,
      customer_email:   order.customerEmail || '',
      customer_address: order.customerAddress || '',
      user_id:          order.userId || null,
      items:            order.items,
      subtotal:         order.subtotal,
      postage:          order.postage,
      total:            order.total,
      postage_name:     order.postageName || '',
      status:           'pending',
      square_order_id:  order.squareOrderId || null,
      valid_defence:    order.validDefence  || null,
      discount_code:    order.discountCode  || null,
      discount_saving:  order.discountSaving != null ? Number(order.discountSaving) : null,
    }).select().single()
    if (error) throw error
    return data
  },

  async updateStatus(id, status, tracking) {
    const patch = { status }
    if (tracking) patch.tracking_number = tracking
    const { error } = await supabase.from('shop_orders').update(patch).eq('id', id)
    if (error) throw error
  },

  async saveRefund(id, amount, note) {
    const patch = {
      refund_amount: amount,
      refund_note:   note || null,
      refunded_at:   new Date().toISOString(),
      status:        'refunded',
    }
    const { error } = await supabase.from('shop_orders').update(patch).eq('id', id)
    if (error) throw error
  },

  async getByUserId(userId) {
    const { data, error } = await supabase
      .from('shop_orders').select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async requestReturn(id, reason) {
    const { error } = await supabase.from('shop_orders').update({
      status: 'return_requested',
      return_reason: reason || null,
    }).eq('id', id)
    if (error) throw error
  },

  async updateReturnTracking(id, trackingNumber) {
    const { error } = await supabase.from('shop_orders').update({
      return_tracking: trackingNumber || null,
    }).eq('id', id)
    if (error) throw error
  },
})

// ── Suppliers ────────────────────────────────────────────────

// ── Square Refunds ────────────────────────────────────────
// Calls the square-refund Supabase Edge Function (server-side).
// The Edge Function holds the Square Access Token securely.
// amount = number in GBP (e.g. 12.50), null = full refund.
export async function squareRefund({ squarePaymentId, amount, locationId }) {
  const { data, error } = await supabase.functions.invoke('square-refund', {
    body: {
      paymentId: squarePaymentId,
      amount: amount ? Math.round(Number(amount) * 100) : null,
      locationId,
      reason: 'Refund from Swindon Airsoft',
    },
  })
  if (error || !data) throw new Error(error?.message || 'Square refund failed')
  if (data.error) throw new Error(data.error)
  return data
}

// ── Staff ─────────────────────────────────────────────────
export const staff = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('rank_order', { ascending: true })
    if (error) throw error
    return data || []
  },

  async create(member) {
    const { data, error } = await supabase
      .from('staff')
      .insert({
        name:        member.name,
        job_title:   member.jobTitle,
        bio:         member.bio || '',
        photo:       member.photo || '',
        rank_order:  member.rankOrder ?? 99,
      })
      .select().single()
    if (error) throw error
    return data
  },

  async update(id, member) {
    const { error } = await supabase
      .from('staff')
      .update({
        name:       member.name,
        job_title:  member.jobTitle,
        bio:        member.bio || '',
        photo:      member.photo || '',
        rank_order: member.rankOrder ?? 99,
      })
      .eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    const { error } = await supabase.from('staff').delete().eq('id', id)
    if (error) throw error
  },

  async uploadPhoto(staffId, file) {
    const ext  = file.name.split('.').pop()
    const path = `staff/${staffId}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    await supabase.from('staff').update({ photo: data.publicUrl }).eq('id', staffId)
    return data.publicUrl
  },
})


// ── Page Visits ───────────────────────────────────────────
// Architecture:
//  - Every page navigation inserts one raw row (audit log — never truncated)
//  - getStats(days) fetches only lightweight columns with the date filter
//    applied SERVER-SIDE, so the old 5000-row client cap is never hit
//  - Unique visits = distinct session_ids (one per browser tab session)
//  - getAllTimeCounts() returns total rows + unique sessions across all time
// ── Geo lookup cache (session-scoped, never sent to server) ──────────────────
// Reset on every page load so a new API order is always tried fresh.
// Result is cached in memory once a successful lookup completes.
let _geoCache     = undefined;
let _geoFailCount = 0;
const GEO_MAX_RETRIES = 3;

async function _lookupGeo() {
  if (_geoCache !== undefined && _geoCache !== null) return _geoCache;
  if (_geoCache === null && _geoFailCount >= GEO_MAX_RETRIES) return null;

  // City name → accurate coordinates. API coords are ignored for GB visitors
  // since ISP routing makes them consistently wrong.
  const KNOWN_CITY_COORDS = {
    "swindon":[51.558,-1.782],"london":[51.507,-0.128],"reading":[51.454,-0.971],
    "bristol":[51.454,-2.588],"birmingham":[52.480,-1.902],"manchester":[53.480,-2.242],
    "leeds":[53.800,-1.549],"sheffield":[53.381,-1.470],"liverpool":[53.408,-2.991],
    "edinburgh":[55.953,-3.189],"glasgow":[55.864,-4.252],"cardiff":[51.481,-3.180],
    "oxford":[51.752,-1.258],"cambridge":[52.205,0.119],"coventry":[52.408,-1.510],
    "leicester":[52.637,-1.135],"nottingham":[52.954,-1.150],"newcastle":[54.978,-1.618],
    "southampton":[50.910,-1.404],"portsmouth":[50.805,-1.087],"exeter":[50.726,-3.527],
    "york":[53.958,-1.082],"bath":[51.381,-2.360],"brighton":[50.827,-0.137],
    "norwich":[52.628,1.299],"plymouth":[50.375,-4.143],"worcester":[52.193,-2.220],
    "chester":[53.193,-2.893],"derby":[52.922,-1.478],"lincoln":[53.235,-0.540],
    "peterborough":[52.573,-0.237],"luton":[51.879,-0.418],"northampton":[52.240,-0.898],
    "milton keynes":[52.041,-0.759],"colchester":[51.896,0.903],"ipswich":[52.059,1.155],
    "stoke":[53.003,-2.180],"wolverhampton":[52.586,-2.128],"swansea":[51.621,-3.944],
    "hereford":[52.056,-2.716],"wrexham":[53.046,-2.994],"dumbarton":[55.943,-4.571],
    "farnborough":[51.295,-0.758],"salisbury":[51.068,-1.796],"cheltenham":[51.900,-2.077],
    "gloucester":[51.864,-2.244],"shrewsbury":[52.707,-2.752],"wigan":[53.544,-2.637],
    "bolton":[53.578,-2.429],"blackpool":[53.817,-3.036],"preston":[53.763,-2.703],
    "huddersfield":[53.645,-1.785],"bradford":[53.795,-1.752],"wakefield":[53.683,-1.506],
    "hull":[53.745,-0.336],"middlesbrough":[54.574,-1.235],"sunderland":[54.906,-1.381],
    "durham":[54.776,-1.576],"carlisle":[54.896,-2.934],"inverness":[57.477,-4.225],
    "aberdeen":[57.149,-2.094],"dundee":[56.462,-2.970],"stirling":[56.117,-3.937],
    "newport":[51.588,-2.998],"bangor":[53.228,-4.129],"aberystwyth":[52.415,-4.082],
  };

  try {
    // Call our Supabase edge function — runs server-side so no browser CSP blocks it,
    // and the real client IP is forwarded via x-forwarded-for headers.
    const res = await fetch(
      `${supabase.supabaseUrl}/functions/v1/geo-lookup`,
      {
        headers: { 'apikey': supabase.supabaseKey },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) throw new Error(`geo-lookup ${res.status}`)
    const g = await res.json()
    if (g.error || !g.country) throw new Error(g.error || 'no country')

    // For GB: ignore API coords — resolve purely from city name
    if (g.country === 'GB') {
      g.lat = null; g.lon = null
      if (g.city) {
        const key = g.city.toLowerCase().trim()
          .replace(/\s*\(.*?\)\s*/g, '')
          .replace(/-upon-\w+|-on-\w+|-under-\w+/gi, '')
          .trim()
        const known = KNOWN_CITY_COORDS[key] || KNOWN_CITY_COORDS[key.split(' ')[0]]
        if (known) { g.lat = known[0]; g.lon = known[1] }
      }
    } else if (g.city) {
      const known = KNOWN_CITY_COORDS[g.city.toLowerCase()]
      if (known) { g.lat = known[0]; g.lon = known[1] }
    }

    _geoCache = { country: g.country, city: g.city || null, lat: g.lat || null, lon: g.lon || null }
    _geoFailCount = 0
    return _geoCache
  } catch {
    _geoCache = null
    _geoFailCount++
    return null
  }
}


export const visits = wrapWithTimeout({
  // ── track ────────────────────────────────────────────────────────────────────
  // One row per logged-in user (conflict on user_id), or one row per browser
  // session (conflict on session_id) for anonymous visitors.
  // Each visit updates the last-seen page, timestamp, and visit count in-place
  // rather than inserting a new row — keeps the table lean indefinitely.
  //
  // Required Supabase migration (run once in SQL editor):
  //
  //   ALTER TABLE page_visits
  //     ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz DEFAULT now(),
  //     ADD COLUMN IF NOT EXISTS visit_count   int         DEFAULT 1;
  //
  //   -- Unique constraints so the select-then-update logic works correctly
  //   ALTER TABLE page_visits
  //     ADD CONSTRAINT IF NOT EXISTS page_visits_user_id_key    UNIQUE (user_id);
  //   ALTER TABLE page_visits
  //     ADD CONSTRAINT IF NOT EXISTS page_visits_session_id_key UNIQUE (session_id);
  //
  //   -- Clean up old duplicate rows (keep most recent per user/session):
  //   DELETE FROM page_visits a USING page_visits b
  //     WHERE a.id < b.id AND a.user_id IS NOT NULL AND a.user_id = b.user_id;
  //   DELETE FROM page_visits a USING page_visits b
  //     WHERE a.id < b.id AND a.user_id IS NULL AND a.session_id = b.session_id;
  //
  async track({ page, userId, userName, sessionId }) {
    try {
      const now = new Date().toISOString();
      if (!page) return;

      // One row per (user_id, page) for logged-in users,
      // or one row per (session_id, page) for anonymous visitors.
      // This ensures per-page visit counts are accurate.
      let existingQuery = supabase
        .from('page_visits')
        .select('id, country, city, lat, lon, visit_count');

      if (userId) {
        existingQuery = existingQuery.eq('user_id', userId).eq('page', page);
      } else if (sessionId) {
        existingQuery = existingQuery.eq('session_id', sessionId).eq('page', page).is('user_id', null);
      } else {
        return;
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        // Row exists for this user+page — increment counter and refresh geo
        await supabase.from('page_visits').update({
          last_seen_at: now,
          user_agent:   navigator.userAgent || null,
          ...(userId ? { user_name: userName || null, session_id: sessionId || null } : {}),
          visit_count:  (existing.visit_count || 1) + 1,
        }).eq('id', existing.id);

        // Always re-run geo and overwrite — fixes stale/bad coords from old API
        _lookupGeo().then(geo => {
          if (!geo) return;
          supabase.from('page_visits').update({
            country: geo.country || null,
            city:    geo.city    || null,
            lat:     geo.lat     || null,
            lon:     geo.lon     || null,
          }).eq('id', existing.id).then(() => {}).catch(() => {});
        }).catch(() => {});
      } else {
        // New row — insert with geo filled in once lookup resolves
        const { data: newRow } = await supabase.from('page_visits').insert({
          ...(userId ? { user_id: userId, user_name: userName || null, session_id: sessionId || null }
                     : { session_id: sessionId, user_id: null, user_name: null }),
          page,
          last_seen_at: now,
          visit_count:  1,
          user_agent:   navigator.userAgent || null,
          referrer:     document.referrer   || null,
        }).select('id').single();

        if (newRow?.id) {
          _lookupGeo().then(geo => {
            if (!geo) return;
            supabase.from('page_visits').update({
              country: geo.country || null,
              city:    geo.city    || null,
              lat:     geo.lat     || null,
              lon:     geo.lon     || null,
            }).eq('id', newRow.id).then(() => {}).catch(() => {});
          }).catch(() => {});
        }
      }
    } catch { /* never break the site */ }
  },

  // Backfill user_id + user_name on anonymous session rows when auth resolves.
  // With per-page tracking there are multiple anon rows per session (one per page visited).
  // We promote each one to the user, merging with any existing user+page row.
  async backfillUser({ sessionId, userId, userName }) {
    if (!sessionId || !userId) return;
    try {
      const { data: anonRows } = await supabase
        .from('page_visits')
        .select('id, visit_count, country, city, page, last_seen_at')
        .eq('session_id', sessionId)
        .is('user_id', null);

      if (!anonRows?.length) return;

      for (const anonRow of anonRows) {
        const { data: userRow } = await supabase
          .from('page_visits')
          .select('id, visit_count, country, city')
          .eq('user_id', userId)
          .eq('page', anonRow.page)
          .maybeSingle();

        if (userRow) {
          // Merge: add anon count into existing user+page row, then delete anon row
          await supabase.from('page_visits').update({
            user_name:   userName || null,
            visit_count: (userRow.visit_count || 1) + (anonRow.visit_count || 1),
            ...(!userRow.country && anonRow.country ? { country: anonRow.country, city: anonRow.city } : {}),
          }).eq('id', userRow.id);
          await supabase.from('page_visits').delete().eq('id', anonRow.id);
        } else {
          // No existing user row for this page — promote the anon row
          await supabase.from('page_visits').update({
            user_id:   userId,
            user_name: userName || null,
          }).eq('id', anonRow.id);
        }
      }
    } catch { /* non-fatal */ }
  },

  // Primary stats fetch — date filtered ON THE SERVER.
  // Fetches up to 10,000 rows for chart/breakdown data.
  // For headline totals on "all time", getAllTimeCounts() is used instead.
  // Pass days=0 to get all-time data with no lower date bound.
  async getStats(days = 7) {
    let q = supabase
      .from('page_visits')
      .select('id, page, user_id, user_name, session_id, referrer, country, city, lat, lon, user_agent, visit_count, last_seen_at, created_at')
      .order('last_seen_at', { ascending: false })
      .limit(10000);
    if (days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      q = q.gte('last_seen_at', since.toISOString());
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // Two cheap queries for the all-time headline numbers.
  // Uses server-side COUNT — not affected by row fetch limits.
  async getAllTimeCounts() {
    // Use a single SQL RPC for all counts — much faster than fetching rows client-side
    const { data, error } = await supabase.rpc('get_visit_counts');
    if (!error && data) {
      return { totalRows: data.total_rows, uniqueSessions: data.unique_sessions };
    }
    // Fallback: simple row count only
    const { count } = await supabase.from('page_visits').select('*', { count: 'exact', head: true });
    return { totalRows: count ?? 0, uniqueSessions: 0 };
  },

  // Legacy — kept for backwards compat; main stats use getStats() now
  async getAll() {
    const { data, error } = await supabase
      .from('page_visits')
      .select('id, page, user_id, user_name, session_id, referrer, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  },
})

// ── Discount Codes ────────────────────────────────────────
// Supabase table: discount_codes
// Columns: id, code (text unique), type ('percent'|'fixed'), value (numeric),
//          max_uses (int nullable), max_uses_per_user (int nullable),
//          uses (int default 0), expires_at (timestamptz nullable),
//          assigned_user_ids (uuid[] default '{}'),
//          scope ('all'|'shop'|'events'), active (bool default true), created_at
// Supabase table: discount_code_redemptions
// Columns: id, code_id (uuid fk), user_id (uuid), user_name (text),
//          scope (text), amount_saved (numeric), created_at
export const discountCodes = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(code) {
    const { data, error } = await supabase
      .from('discount_codes')
      .insert({
        code:                code.code.toUpperCase().trim(),
        type:                code.type,           // 'percent' | 'fixed'
        value:               Number(code.value),
        max_uses:            code.maxUses ? Number(code.maxUses) : null,
        max_uses_per_user:   code.maxUsesPerUser ? Number(code.maxUsesPerUser) : null,
        uses:                0,
        expires_at:          code.expiresAt || null,
        assigned_user_ids:   code.assignedUserIds || [],
        scope:               code.scope || 'all',
        active:              code.active ?? true,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id, patch) {
    const { error } = await supabase
      .from('discount_codes')
      .update({
        code:               patch.code?.toUpperCase().trim(),
        type:               patch.type,
        value:              Number(patch.value),
        max_uses:           patch.maxUses ? Number(patch.maxUses) : null,
        max_uses_per_user:  patch.maxUsesPerUser ? Number(patch.maxUsesPerUser) : null,
        expires_at:         patch.expiresAt || null,
        assigned_user_ids:  patch.assignedUserIds || [],
        scope:              patch.scope || 'all',
        active:             patch.active,
      })
      .eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    // Delete redemption history first, then the code
    await supabase.from('discount_code_redemptions').delete().eq('code_id', id)
    const { error } = await supabase.from('discount_codes').delete().eq('id', id)
    if (error) throw error
  },

  // Fetch redemption history for all codes (admin view)
  async getRedemptions() {
    const { data, error } = await supabase
      .from('discount_code_redemptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error
    return data || []
  },

  // Validate a code without redeeming it — used for live preview at checkout
  async validate(code, userId, scope) {
    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .eq('active', true)
      .single()
    if (error || !data) throw new Error('Invalid or inactive discount code.')
    if (data.expires_at && new Date(data.expires_at) < new Date())
      throw new Error('This discount code has expired.')
    if (data.max_uses !== null && data.uses >= data.max_uses)
      throw new Error('This discount code has reached its usage limit.')
    if (data.assigned_user_ids?.length > 0) {
      if (!userId || !data.assigned_user_ids.includes(userId))
        throw new Error('This discount code is not valid for your account.')
    }
    // Scope check
    if (data.scope && data.scope !== 'all' && scope && data.scope !== scope)
      throw new Error(`This code is only valid for ${data.scope === 'shop' ? 'shop orders' : 'event bookings'}.`)
    // Per-user limit check
    if (data.max_uses_per_user && userId) {
      const { count } = await supabase
        .from('discount_code_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('code_id', data.id)
        .eq('user_id', userId)
      if ((count || 0) >= data.max_uses_per_user)
        throw new Error(`You have already used this code the maximum number of times (${data.max_uses_per_user}).`)
    }
    return data
  },

  // Called at checkout — validates, records redemption, increments use count,
  // and auto-deactivates if limit is now reached.
  async redeem(code, userId, userName, scope, amountSaved) {
    const data = await discountCodes.validate(code, userId, scope)

    const newUses = data.uses + 1
    const exhausted = data.max_uses !== null && newUses >= data.max_uses

    // Increment use count — auto-deactivate if exhausted
    const { error: incErr } = await supabase
      .from('discount_codes')
      .update({ uses: newUses, ...(exhausted ? { active: false } : {}) })
      .eq('id', data.id)
    if (incErr) throw incErr

    // Record redemption history (non-fatal if table missing)
    try {
      await supabase.from('discount_code_redemptions').insert({
        code_id:      data.id,
        user_id:      userId || null,
        user_name:    userName || null,
        scope:        scope || 'unknown',
        amount_saved: Number(amountSaved) || 0,
      })
    } catch { /* non-fatal */ }

    return data
  },
})

// ── Gift Vouchers ─────────────────────────────────────────
function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to avoid confusion
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `GV-${seg()}-${seg()}-${seg()}`
}

export const giftVouchers = wrapWithTimeout({
  async purchase({ amount, purchaserId, purchaserName, purchaserEmail, recipientEmail, recipientName, message, squarePaymentId }) {
    const code = generateVoucherCode()
    const { data, error } = await supabase
      .from('gift_vouchers')
      .insert({
        code,
        amount,
        balance: amount,
        purchaser_id:    purchaserId,
        purchaser_name:  purchaserName,
        purchaser_email: purchaserEmail,
        recipient_email: recipientEmail.toLowerCase().trim(),
        recipient_name:  recipientName || null,
        message:         message || null,
        square_payment_id: squarePaymentId,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  // Validate a voucher code at checkout — returns { code, balance, amount, type, value } or throws
  async validate(code) {
    const { data, error } = await supabase
      .from('gift_vouchers')
      .select('id, code, balance, amount, is_disabled')
      .eq('is_disabled', false)
      .gt('balance', 0)
      .ilike('code', code.trim())
      .single()
    if (error || !data) throw new Error('Voucher not found or has no remaining balance.')
    return {
      code:    data.code,
      balance: Number(data.balance),
      amount:  Number(data.amount),
      type:    'fixed',
      value:   data.balance, // matches discountCodes shape so checkout maths works unchanged
    }
  },

  // Deduct from balance after a successful payment — uses a DB RPC for safety
  async redeem(code, amount, userId, userName, context) {
    const { data, error } = await supabase.rpc('redeem_gift_voucher', {
      p_code:      code,
      p_amount:    amount,
      p_user_id:   userId,
      p_user_name: userName,
      p_context:   context,
    })
    if (error) throw new Error(error.message)
    if (!data.ok) throw new Error(data.error)
    return data
  },

  async listAll() {
    const { data, error } = await supabase
      .from('gift_vouchers')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  async disable(id) {
    const { error } = await supabase
      .from('gift_vouchers')
      .update({ is_disabled: true })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },
})

// ── Event Waitlist ────────────────────────────────────────
export const waitlistApi = {
  join: async ({ eventId, userId, userName, userEmail, ticketType }) => {
    // Prevent duplicate entries
    const { data: existing } = await supabase
      .from('event_waitlist')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('ticket_type', ticketType)
      .maybeSingle();
    if (existing) return existing;
    const { data, error } = await supabase
      .from('event_waitlist')
      .insert({ event_id: eventId, user_id: userId, user_name: userName, user_email: userEmail, ticket_type: ticketType })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  leave: async ({ eventId, userId, ticketType }) => {
    const { error } = await supabase
      .from('event_waitlist')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('ticket_type', ticketType);
    if (error) throw new Error(error.message);
  },
  getByEvent: async (eventId) => {
    const { data, error } = await supabase
      .from('event_waitlist')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },
  getByUser: async (userId) => {
    const { data, error } = await supabase
      .from('event_waitlist')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },
  removeEntry: async (id) => {
    const { error } = await supabase.from('event_waitlist').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ── Player Loadouts ───────────────────────────────────────────
export const loadouts = wrapWithTimeout({
  async getMyLoadout(userId) {
    const { data, error } = await supabase
      .from('player_loadouts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async save(userId, loadout) {
    const { error } = await supabase
      .from('player_loadouts')
      .upsert({ ...loadout, user_id: userId }, { onConflict: 'user_id' })
    if (error) throw error
  },

  async getPublic(userId) {
    const { data, error } = await supabase
      .from('public_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getAllPublic() {
    const { data, error } = await supabase
      .from('public_profiles')
      .select('id, name, callsign, profile_pic, games_attended, vip_status, join_date, bio')
      .order('games_attended', { ascending: false })
    if (error) throw error
    return data || []
  },
})


// ── Waitlist Holds (30-min slot reservation) ─────────────────
export const holdApi = {
  async createHold({ eventId, ticketType, userId, userName, userEmail }) {
    // Clear any expired or existing hold for this event+type first
    await supabase.from('waitlist_holds')
      .delete()
      .eq('event_id', eventId)
      .eq('ticket_type', ticketType);
    const heldUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('waitlist_holds')
      .insert({ event_id: eventId, ticket_type: ticketType, user_id: userId, user_name: userName, user_email: userEmail, held_until: heldUntil })
      .select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async getHold(eventId, ticketType) {
    const { data, error } = await supabase.from('waitlist_holds')
      .select('*')
      .eq('event_id', eventId)
      .eq('ticket_type', ticketType)
      .maybeSingle();
    if (error) return null;
    if (!data) return null;
    // If expired, treat as no hold
    if (new Date(data.held_until) < new Date()) {
      // Clean it up silently
      supabase.from('waitlist_holds').delete().eq('id', data.id).then(() => {}).catch(() => {});
      return null;
    }
    return data;
  },
  async clearHold(eventId, ticketType) {
    await supabase.from('waitlist_holds')
      .delete()
      .eq('event_id', eventId)
      .eq('ticket_type', ticketType);
  },
};

// ── UKARA Applications ─────────────────────────────────────────
export const ukaraApplications = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('ukara_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getByUser(userId) {
    const { data, error } = await supabase
      .from('ukara_applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async insert(app) {
    const { data, error } = await supabase
      .from('ukara_applications')
      .insert(app)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, patch) {
    const { error } = await supabase
      .from('ukara_applications')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  },

  async approve(id, ukaraId) {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const { data, error } = await supabase
      .from('ukara_applications')
      .update({
        status: 'approved',
        ukara_id: ukaraId,
        approved_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        renewal_requested: false,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async decline(id, adminNotes) {
    const { error } = await supabase
      .from('ukara_applications')
      .update({ status: 'declined', admin_notes: adminNotes || '' })
      .eq('id', id);
    if (error) throw error;
  },

  async requestRenewal(id) {
    const { error } = await supabase
      .from('ukara_applications')
      .update({ renewal_requested: true })
      .eq('id', id);
    if (error) throw error;
  },

  async processRenewal(id, squarePaymentId) {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const { error } = await supabase
      .from('ukara_applications')
      .update({
        renewal_requested: false,
        renewal_paid_at: now.toISOString(),
        approved_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: 'approved',
        renewal_square_payment_id: squarePaymentId || null,
      })
      .eq('id', id);
    if (error) throw error;
  },

  async uploadGovId(userId, appId, file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `ukara/${appId}/gov_id_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('images').getPublicUrl(path);
    return data.publicUrl;
  },

  async uploadFacePhoto(userId, appId, file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `ukara/${appId}/face_photo_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('images').getPublicUrl(path);
    return data.publicUrl;
  },
});

// ── News & Updates ────────────────────────────────────────────────────────────
export const news = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('news_posts')
      .select('*')
      .eq('published', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getAdmin() {
    const { data, error } = await supabase
      .from('news_posts')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(post) {
    const { data, error } = await supabase
      .from('news_posts')
      .insert({ ...post, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id, patch) {
    const { error } = await supabase
      .from('news_posts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    const { error } = await supabase
      .from('news_posts')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
})
