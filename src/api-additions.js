// ── News & Updates ────────────────────────────────────────────
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

// ── Marshal Schedules ─────────────────────────────────────────
export const marshalSchedules = wrapWithTimeout({
  async getByEvent(eventId) {
    const { data, error } = await supabase
      .from('marshal_schedules')
      .select('*, profile:profiles(id, name, callsign, profile_pic, can_marshal)')
      .eq('event_id', eventId)
    if (error) throw error
    return data || []
  },

  async getAll() {
    const { data, error } = await supabase
      .from('marshal_schedules')
      .select('*, profile:profiles(id, name, callsign, profile_pic, can_marshal), event:events(id, title, date)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async upsert(eventId, userId, status, role, notes) {
    const { error } = await supabase
      .from('marshal_schedules')
      .upsert(
        { event_id: eventId, user_id: userId, status, role, notes: notes || '', updated_at: new Date().toISOString() },
        { onConflict: 'event_id,user_id' }
      )
    if (error) throw error
  },

  async delete(id) {
    const { error } = await supabase
      .from('marshal_schedules')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
})
