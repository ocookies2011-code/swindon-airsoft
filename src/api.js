// ============================================================
// api.js — All Supabase database operations
// ============================================================
import { supabase } from './supabaseClient'

// ── Global API timeout ───────────────────────────────────────
// Every exported api object method is wrapped with withApiTimeout
// so stale connections after browser sleep always fail in 10s
// rather than hanging the UI forever.
const API_TIMEOUT_MS = 10000
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
    const { data, error } = await supabase
      .from('profiles').select('*').order('join_date')
    if (error) throw error
    return data
  },

  async update(id, patch) {
    const { error } = await supabase
      .from('profiles').update(patch).eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    // Deletes auth user too via cascade
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) throw error
  },

  async uploadProfilePic(userId, file) {
    const ext = file.name.split('.').pop()
    const path = `profiles/${userId}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    await supabase.from('profiles').update({ profile_pic: data.publicUrl }).eq('id', userId)
    return data.publicUrl
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
    const ext = file.name.split('.').pop()
    const path = `events/${eventId}/banner.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
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
    const { error } = await supabase
      .from('bookings').update({
        ticket_type: patch.type,
        qty:         patch.qty,
        total:       patch.total,
        checked_in:  patch.checkedIn,
      }).eq('id', bookingId)
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
export const settings = wrapWithTimeout({
  async get(key) {
    const { data, error } = await supabase
      .from('site_settings').select('value').eq('key', key).single()
    if (error) return ''
    return data.value
  },

  async set(key, value) {
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
    vipOnly:      ev.vip_only ?? false,
    extras: (ev.event_extras || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(ex => {
        let name = ex.name, productId = ex.product_id || null, variantId = ex.variant_id || null
        try {
          const parsed = JSON.parse(ex.name)
          if (parsed?.n) { name = parsed.n; productId = parsed.pid || productId; variantId = parsed.vid || variantId }
        } catch {}
        return { id: ex.id, name, price: Number(ex.price), noPost: ex.no_post, productId, variantId }
      }),
    bookings: (ev.bookings || []).map(b => ({
      id:        b.id,
      userId:    b.user_id,
      userName:  b.user_name,
      type:      b.ticket_type,
      qty:       b.qty,
      extras:    b.extras,
      total:     Number(b.total),
      checkedIn: b.checked_in,
      date:      b.created_at,
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
    noPost:      p.no_post,
    gameExtra:   p.game_extra || false,
    costPrice:   p.cost_price ? Number(p.cost_price) : null,
    category:    p.category || '',
    supplierCode: p.supplier_code || '',
    variants,
  }
}

export function normaliseProfile(p) {
  return {
    id:                 p.id,
    name:               p.name,
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
    no_post:     p.noPost,
    game_extra:  p.gameExtra || false,
    cost_price:  p.costPrice ?? null,
    category:     p.category || '',
    supplier_code: p.supplierCode || '',
    variants:    (p.variants || []).map(v => ({ ...v, supplier_code: v.supplierCode || '' })),
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
  }
})

// ── Suppliers ────────────────────────────────────────────────
export const suppliers = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('suppliers').select('*').order('name')
    if (error) throw error
    return data || []
  },
  async create(s) {
    const { data, error } = await supabase.from('suppliers').insert({
      name:    s.name,
      contact: s.contact || '',
      email:   s.email || '',
      phone:   s.phone || '',
      notes:   s.notes || '',
    }).select().single()
    if (error) throw error
    return data
  },
  async update(id, s) {
    const { error } = await supabase.from('suppliers').update({
      name:    s.name,
      contact: s.contact || '',
      email:   s.email || '',
      phone:   s.phone || '',
      notes:   s.notes || '',
    }).eq('id', id)
    if (error) throw error
  },
  async delete(id) {
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) throw error
  },
})

// ── Purchase Orders ───────────────────────────────────────────
export const purchaseOrders = wrapWithTimeout({
  async getAll() {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(po => ({
      ...po,
      items: po.purchase_order_items || [],
    }))
  },
  async create(po) {
    const { data, error } = await supabase.from('purchase_orders').insert({
      supplier_id:   po.supplierId || null,
      supplier_name: po.supplierName || '',
      status:        po.status || 'draft',
      notes:         po.notes || '',
      total:         po.total || 0,
    }).select().single()
    if (error) throw error
    // Insert items
    if (po.items?.length) {
      const rows = po.items.map(item => ({
        purchase_order_id: data.id,
        product_id:        item.productId || null,
        product_name:      item.productName || '',
        supplier_code:     item.supplierCode || '',
        qty_ordered:       Number(item.qtyOrdered) || 0,
        qty_received:      0,
        unit_cost:         Number(item.unitCost) || 0,
      }))
      const { error: itemErr } = await supabase.from('purchase_order_items').insert(rows)
      if (itemErr) throw itemErr
    }
    return data
  },
  async updateStatus(id, status) {
    const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', id)
    if (error) throw error
  },
  async receiveItem(itemId, qtyReceived, productId, variantId, qtyPreviouslyReceived) {
    // 1. Update the PO item received qty
    const { error } = await supabase.from('purchase_order_items')
      .update({ qty_received: qtyReceived }).eq('id', itemId)
    if (error) throw error

    // 2. Work out how many NEW units are being added this time
    const delta = qtyReceived - (qtyPreviouslyReceived || 0)
    if (delta <= 0 || !productId) return

    // 3. Add to shop stock
    if (variantId) {
      // Variant product — fetch current variants JSON, bump the matching variant's stock
      const { data: prod, error: fetchErr } = await supabase
        .from('shop_products').select('variants').eq('id', productId).single()
      if (fetchErr) throw fetchErr
      const variants = (prod.variants || []).map(v =>
        v.id === variantId ? { ...v, stock: (Number(v.stock) || 0) + delta } : v
      )
      const { error: updErr } = await supabase
        .from('shop_products').update({ variants }).eq('id', productId)
      if (updErr) throw updErr
    } else {
      // Simple product — use rpc increment or plain update with addition
      const { data: prod, error: fetchErr } = await supabase
        .from('shop_products').select('stock').eq('id', productId).single()
      if (fetchErr) throw fetchErr
      const { error: updErr } = await supabase
        .from('shop_products').update({ stock: (Number(prod.stock) || 0) + delta }).eq('id', productId)
      if (updErr) throw updErr
    }
  },
  async delete(id) {
    const { error: itemErr } = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id)
    if (itemErr) throw itemErr
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    if (error) throw error
  },
})

// ── Square Refunds ────────────────────────────────────────
// Calls the /api/square-refund Supabase Edge Function (server-side).
// The Edge Function holds the Square Access Token securely.
// amount = number in GBP (e.g. 12.50), null = full refund.
export async function squareRefund({ squarePaymentId, amount, locationId }) {
  const res = await fetch('/api/square-refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentId: squarePaymentId,
      amount: amount ? Math.round(Number(amount) * 100) : null, // pence
      locationId,
      reason: 'Refund from Swindon Airsoft',
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'Square refund failed: ' + res.status)
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
export const visits = wrapWithTimeout({
  async track({ page, userId, userName, sessionId }) {
    // Fire-and-forget — never throw, never block the UI
    try {
      let city = null, country = null, lat = null, lon = null;
      try {
        const geo = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
        if (geo.ok) {
          const g = await geo.json();
          city    = g.city    || null;
          country = g.country_name || null;
          lat     = g.latitude  || null;
          lon     = g.longitude || null;
        }
      } catch { /* geo unavailable */ }

      await supabase.from('page_visits').insert({
        page,
        user_id:    userId    || null,
        user_name:  userName  || null,
        session_id: sessionId || null,
        city,
        country,
        lat,
        lon,
        user_agent: navigator.userAgent || null,
        referrer:   document.referrer   || null,
      });
    } catch { /* never break the site */ }
  },

  async getAll() {
    const { data, error } = await supabase
      .from('page_visits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000)
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
