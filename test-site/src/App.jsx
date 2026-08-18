import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import logoMono from './assets/logo-mono.png'

// Real photography (Unsplash, free license) — treated with a consistent
// duotone (see .photo in styles.css) so shots from different photographers
// read as one cohesive brand rather than assorted stock images.
const PHOTOS = {
  hero:   'https://images.unsplash.com/photo-1541513982013-5dc4f56697f9?auto=format&fit=crop&w=2400&q=80',
  ground: 'https://images.unsplash.com/photo-1569242840838-2a6bdd402fe4?auto=format&fit=crop&w=1600&q=80',
  note1:  'https://images.unsplash.com/photo-1615589184136-9f1818682216?auto=format&fit=crop&w=900&q=80',
  note2:  'https://images.unsplash.com/photo-1598744591141-0370fe5aec26?auto=format&fit=crop&w=900&q=80',
  note3:  'https://images.unsplash.com/photo-1566566716921-b50e82140547?auto=format&fit=crop&w=900&q=80',
}

function useInView() {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}

function Reveal({ children, as: Tag = 'div', ...rest }) {
  const [ref, inView] = useInView()
  return <Tag ref={ref} className={`reveal${inView ? ' in-view' : ''}`} {...rest}>{children}</Tag>
}

function Photo({ src, alt }) {
  return (
    <div className="photo">
      <img src={src} alt={alt} loading="lazy" />
    </div>
  )
}

function daysUntil(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.ceil((d - new Date()) / 86400000)
  return diff
}

export default function App() {
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
          .select('id, title, date, time, location, walk_on_slots, rental_slots, published')
          .eq('published', true)
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(6)
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
  }, [])

  const nextEvent = events && events.length > 0 ? events[0] : null

  return (
    <>
      <header className="topbar">
        <div className="topbar-mark"><img src={logoMono} alt="Swindon Airsoft" className="topbar-logo" /> SWINDON AIRSOFT</div>
        <nav className="topbar-nav">
          <a href="#ground">The Ground</a>
          <a href="#fixtures">Fixtures</a>
          <a href="#notes">Loadout</a>
        </nav>
      </header>

      <section className="hero">
        <Photo src={PHOTOS.hero} alt="" />
        <div className="hero-inner">
          <div className="hero-tag">Wiltshire · Outdoor Field</div>
          <h1>NO RESPAWNS.<br /><span className="accent">JUST INSTINCT.</span></h1>
          <p className="hero-sub">Full-contact woodland skirmish, marshalled properly. Bring your kit or rent ours — either way, the ground doesn't care who you are.</p>
          <div className="hero-actions">
            <a className="blaze-btn" href="#fixtures">Book In →</a>
            {nextEvent && (
              <div className="hero-next">
                Next Up<br /><b>{nextEvent.title}</b> — {daysUntil(nextEvent.date) === 0 ? 'TODAY' : `${daysUntil(nextEvent.date)}D OUT`}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="stats">
        <div className="stat"><div className="n">2019</div><div className="l">Running Since</div></div>
        <div className="stat"><div className="n">30+</div><div className="l">Acres of Ground</div></div>
        <div className="stat"><div className="n">100%</div><div className="l">Marshalled Games</div></div>
        <div className="stat"><div className="n">UKARA</div><div className="l">Defence Eligible</div></div>
      </div>

      <section id="ground">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Terrain</span>
            <h2>The Ground</h2>
          </div>
          <div className="ground">
            <Reveal className="ground-photo"><Photo src={PHOTOS.ground} alt="Woodland terrain" /></Reveal>
            <Reveal className="ground-copy">
              <p>Dense treeline, built CQB structures, and open flanks that punish anyone who rushes them. Read the terrain or get read — there's no third option.</p>
              <p>Marshals on every game, clear calling, and a briefing that actually covers the ruleset. First time out or years in, you're playing on the same terms as everyone else.</p>
              <ul className="ground-list">
                <li>Terrain <span className="v">Woodland + CQB</span></li>
                <li>Marshals <span className="v">Every Game</span></li>
                <li>Entry <span className="v">UKARA-Friendly</span></li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="fixtures">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Upcoming</span>
            <h2>Fixtures</h2>
          </div>
          <div className="fixtures-list">
            {events === null && <div className="empty-note">Loading fixtures…</div>}
            {events && events.length === 0 && !loadError && <div className="empty-note">Nothing published yet — check back shortly.</div>}
            {loadError && <div className="error-note">Couldn't reach the fixture list just now.</div>}
            {events && events.map((ev, i) => {
              const c = counts[ev.id]
              const totalSlots = (ev.walk_on_slots || 0) + (ev.rental_slots || 0)
              const booked = c ? (Number(c.total_booked) || 0) : null
              const pct = booked !== null && totalSlots > 0 ? Math.min(100, Math.round((booked / totalSlots) * 100)) : null
              const isFull = pct !== null && pct >= 100
              return (
                <Reveal as="div" className="fixture" key={ev.id}>
                  <div className="fixture-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="fixture-main">
                    <h3>{ev.title}</h3>
                    <div className="date">{new Date(ev.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {ev.time || ''}{ev.location ? ` · ${ev.location}` : ''}</div>
                  </div>
                  <div className="fixture-slots">
                    <span className="n">{pct === null ? '—' : isFull ? 'FULL' : `${totalSlots - booked} LEFT`}</span>
                    {pct !== null && <div className="bar"><div className={`bar-fill${isFull ? ' full' : ''}`} style={{ width: `${pct}%` }} /></div>}
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section id="notes">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Before You Come</span>
            <h2>Loadout Check</h2>
          </div>
          <div className="notes-grid">
            <Reveal as="div" className="note">
              <Photo src={PHOTOS.note1} alt="" />
              <div className="note-body">
                <div className="tag">First Timer</div>
                <h4>No Kit? No Problem</h4>
                <p>Rentals cover everything you need. Full safety brief before anyone sets foot on the ground.</p>
              </div>
            </Reveal>
            <Reveal as="div" className="note">
              <Photo src={PHOTOS.note2} alt="" />
              <div className="note-body">
                <div className="tag">Non-Negotiable</div>
                <h4>Eye Protection</h4>
                <p>Full-seal only. Layer up for woodland — the ground holds damp longer than the forecast suggests.</p>
              </div>
            </Reveal>
            <Reveal as="div" className="note">
              <Photo src={PHOTOS.note3} alt="" />
              <div className="note-body">
                <div className="tag">Working Toward It</div>
                <h4>UKARA Counts</h4>
                <p>Every game counts toward your play total from day one. Ask at the gate if you're building your defence.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <h2>GET MUDDY.<br /><span className="accent">GET GOOD.</span></h2>
          <a className="blaze-btn" href="#fixtures">See What's On →</a>
        </div>
      </section>

      <footer>
        <div className="wrap foot-inner">
          <img src={logoMono} alt="Swindon Airsoft" className="foot-logo" />
          <div className="foot-row">
            <span>Swindon Airsoft — Field Concept · Design Draft, Not Live</span>
            <span>Wiltshire, England</span>
          </div>
        </div>
      </footer>
    </>
  )
}
