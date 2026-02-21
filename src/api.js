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
      await supabase.from('event_extras').insert(
        extras.map((ex, i) => ({ ...ex, event_id: data.id, sort_order: i }))
      )
    }
    return data
  },

  async update(id, patch) {
    const { extras, bookings, ...evData } = patch
    const { error } = await supabase
      .from('events').update(toSnakeEvent(evData)).eq('id', id)
    if (error) throw error
    if (extras !== undefined) {
      // Replace all extras
      await supabase.from('event_extras').delete().eq('event_id', id)
      if (extras.length) {
        await supabase.from('event_extras').insert(
          extras.map((ex, i) => ({
            event_id: id, name: ex.name, price: ex.price,
            no_post: ex.noPost ?? ex.no_post ?? false, sort_order: i
          }))
        )
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
      event_id:    booking.eventId,
      user_id:     booking.userId,
      user_name:   booking.userName,
      ticket_type: booking.type,
      qty:         booking.qty,
      extras:      booking.extras,
      total:       booking.total,
    }).select().single()
    if (error) throw error
    return data
  },

  async checkIn(bookingId, userId) {
    // Mark booking as checked in
    const { error: bErr } = await supabase
      .from('bookings').update({ checked_in: true }).eq('id', bookingId)
    if (bErr) throw bErr

    // Recalculate from actual checked-in bookings — never trust a stale counter
    const { data: checkedInBookings, error: cErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', userId)
      .eq('checked_in', true)
    if (cErr) throw cErr

    const actualCount = checkedInBookings.length
    const { error: pErr } = await supabase
      .from('profiles').update({ games_attended: actualCount }).eq('id', userId)
    if (pErr) throw pErr
    return actualCount
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
    const { data, error } = await supabase
      .from('shop_products').insert(toSnakeProduct(product)).select().single()
    if (error) throw error
    return normaliseProduct(data)
  },

  async update(id, patch) {
    const { data, error } = await supabase
      .from('shop_products').update(toSnakeProduct(patch)).eq('id', id).select().single()
    if (error) throw error
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
    return data.map(i => ({ id: i.id, q: i.question, a: i.answer }))
  },

  async create(item) {
    const { data, error } = await supabase
      .from('qa_items').insert({ question: item.q, answer: item.a }).select().single()
    if (error) throw error
    return { id: data.id, q: data.question, a: data.answer }
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
    const { error } = await supabase
      .from('site_settings').upsert({ key, value })
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
    extras: (ev.event_extras || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(ex => ({ id: ex.id, name: ex.name, price: Number(ex.price), noPost: ex.no_post })),
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
  return {
    id:          p.id,
    name:        p.name,
    description: p.description,
    price:       Number(p.price),
    salePrice:   p.sale_price ? Number(p.sale_price) : null,
    onSale:      p.on_sale,
    image:       p.image,
    stock:       p.stock,
    noPost:      p.no_post,
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
  return {
    title:          ev.title,
    date:           ev.date,
    time:           ev.time,
    location:       ev.location,
    description:    ev.description,
    walk_on_slots:  ev.walkOnSlots,
    rental_slots:   ev.rentalSlots,
    walk_on_price:  ev.walkOnPrice,
    rental_price:   ev.rentalPrice,
    banner:         ev.banner,
    map_embed:      ev.mapEmbed,
    published:      ev.published,
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
    stock:       p.stock,
    no_post:     p.noPost,
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
      customer_name:  order.customerName,
      customer_email: order.customerEmail || '',
      user_id:        order.userId || null,
      items:          order.items,
      subtotal:       order.subtotal,
      postage:        order.postage,
      total:          order.total,
      postage_name:   order.postageName || '',
      status:         'pending',
    }).select().single()
    if (error) throw error
    return data
  },

  async updateStatus(id, status) {
    const { error } = await supabase.from('shop_orders').update({ status }).eq('id', id)
    if (error) throw error
  }
}
