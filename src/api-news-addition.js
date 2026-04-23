// ─────────────────────────────────────────────────────────────────────────────
// PASTE THIS AT THE BOTTOM OF YOUR api.js FILE
// ─────────────────────────────────────────────────────────────────────────────

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
