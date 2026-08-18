import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function useFixtures(limit = 20) {
  const [events, setEvents] = useState(null)
  const [counts, setCounts] = useState({})
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const { data, error } = await supabase
          .from('events')
          .select('id, title, date, time, location, walk_on_slots, rental_slots, walk_on_price, rental_price, description, published')
          .eq('published', true)
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(limit)
        if (error) throw error
        if (!cancelled) setEvents(data || [])

        const { data: countData } = await supabase.rpc('get_upcoming_booking_counts')
        if (!cancelled && countData) {
          const map = {}
          countData.forEach(c => { map[c.event_id] = c })
          setCounts(map)
        }
      } catch {
        if (!cancelled) { setLoadError(true); setEvents([]) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [limit])

  return { events, counts, loadError }
}

export function daysUntil(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return Math.ceil((d - new Date()) / 86400000)
}
