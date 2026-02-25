// ============================================================
// api.js — All Supabase database operations
// ============================================================
import { supabase } from './supabaseClient'

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
  async signUp({ email, password, name, phone }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name } }
    })
    if (error) throw error
    // Update profile with phone after creation
    if (data.user) {
      await supabase.from('profiles').update({ name, phone }).eq('id', data.user.id)
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
}

// ── Profiles ──────────────────────────────────────────────────
export const profiles = {
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
    const { data, error } = await supabase
      .from('profiles').update(patch).eq('id', id).select().single()
    if (error) throw error
    return data
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
  }
}

// ── Events ────────────────────────────────────────────────────
export const events = {
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
}

// ── Bookings ──────────────────────────────────────────────────
export const bookings = {
  async create(booking) {
    const { data, error } = await supabase.from('bookings').insert({
      event_id:       booking.eventId,
      user_id:        booking.userId,
      user_name:      booking.userName,
      ticket_type:    booking.type,
      qty:            booking.qty,
      extras:         booking.extras,
      total:          booking.total,
      paypal_order_id: booking.paypalOrderId || null,
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
}

// ── Shop ──────────────────────────────────────────────────────
export const shop = {
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
      // Retry stripping any columns that don't exist yet
      const { variants: _v, game_extra: _g, ...snakeStripped } = snake
      const { data: d2, error: e2 } = await supabase
        .from('shop_products').insert(snakeStripped).select().single()
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
      // Retry stripping any columns that don't exist yet (game_extra, variants if missing)
      const { variants: _v, game_extra: _g, ...snakeStripped } = snake
      const { data: d2, error: e2 } = await supabase
        .from('shop_products').update(snakeStripped).eq('id', id).select().single()
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

  async uploadImage(productId, file) {
    const ext = file.name.split('.').pop()
    const path = `shop/${productId}/image.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    await supabase.from('shop_products').update({ image: data.publicUrl }).eq('id', productId)
    return data.publicUrl
  }
}

// ── Postage ───────────────────────────────────────────────────
export const postage = {
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
}

// ── Gallery ───────────────────────────────────────────────────
export const gallery = {
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
    await gallery.addImageUrl(albumId, data.publicUrl)
    return data.publicUrl
  },

  async removeImage(albumId, url) {
    const { error } = await supabase
      .from('gallery_images').delete().eq('album_id', albumId).eq('url', url)
    if (error) throw error
  }
}

// ── Q&A ───────────────────────────────────────────────────────
export const qa = {
  async getAll() {
    const { data, error } = await supabase
      .from('qa_items').select('*').order('sort_order')
    if (error) throw error
    return data.map(i => ({ id: i.id, q: i.question, a: i.answer, image: i.image || '' }))
  },

  async create(item) {
    const { data, error } = await supabase
      .from('qa_items').insert({ question: item.q, answer: item.a, image: item.image || null }).select().single()
    if (error) throw error
    return { id: data.id, q: data.question, a: data.answer, image: data.image || '' }
  },

  async update(id, item) {
    const { error } = await supabase.from('qa_items').update({ question: item.q, answer: item.a, image: item.image || null }).eq('id', id)
    if (error) throw error
  },

  async delete(id) {
    const { error } = await supabase.from('qa_items').delete().eq('id', id)
    if (error) throw error
  }
}

// ── Site settings ─────────────────────────────────────────────
export const settings = {
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
}

// ── Cash Sales ────────────────────────────────────────────────
export const cashSales = {
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
  }
}
function normaliseEvent(ev) {
  return {
    id:           ev.id,
    title:        ev.title,
    date:         ev.date,
    time:         ev.time?.slice(0, 5) ?? '09:00',
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
  const variants = Array.isArray(p.variants) ? p.variants : []
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
    stock:       variantStock !== null ? variantStock : p.stock,
    baseStock:   p.stock, // raw DB stock (only used when no variants)
    noPost:      p.no_post,
    gameExtra:   p.game_extra || false,
    variants,
  }
}

function normaliseProfile(p) {
  return {
    id:                 p.id,
    name:               p.name,
    phone:              p.phone,
    address:            p.address,
    role:               p.role,
    gamesAttended:      p.games_attended,
    waiverSigned:       p.waiver_signed,
    waiverYear:         p.waiver_year,
    waiverData:         p.waiver_data,
    waiverPending:      p.waiver_pending,
    vipStatus:          p.vip_status,
    vipApplied:         p.vip_applied,
    ukara:              p.ukara,
    credits:            Number(p.credits),
    leaderboardOptOut:  p.leaderboard_opt_out,
    profilePic:         p.profile_pic,
    deleteRequest:      p.delete_request,
    permissions:        p.permissions,
    joinDate:           p.join_date,
  }
}

export { normaliseProfile }

function toSnakeEvent(ev) {
  // Strip base64 banners — too large for DB text column; only store URLs
  const banner = ev.banner && ev.banner.startsWith('data:') ? null : (ev.banner || null)
  return {
    title:          ev.title,
    date:           ev.date,
    time:           ev.time,
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
    image:       p.image,
    stock:       p.variants && p.variants.length > 0 ? 0 : p.stock,
    no_post:     p.noPost,
    game_extra:  p.gameExtra || false,
    variants:    p.variants || [],
  }
}

// ── Shop Orders ───────────────────────────────────────────────
export const shopOrders = {
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
      paypal_order_id:  order.paypalOrderId || null,
    }).select().single()
    if (error) throw error
    return data
  },

  async updateStatus(id, status) {
    const { error } = await supabase.from('shop_orders').update({ status }).eq('id', id)
    if (error) throw error
  }
}
