import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// ── Contour line generator ──────────────────────────────────
// Procedural topographic lines, used both as hero backdrop and as the
// section-divider "elevation reveal" motif — the one visual idea this
// page repeats on purpose.
function contourPath(seed, amplitude, yBase, points = 8) {
  const w = 1200
  let d = `M 0 ${yBase}`
  const step = w / points
  for (let i = 1; i <= points; i++) {
    const x = i * step
    const wobble = Math.sin(i * seed) * amplitude + Math.cos(i * seed * 1.7) * (amplitude * 0.4)
    d += ` L ${x.toFixed(1)} ${(yBase + wobble).toFixed(1)}`
  }
  return d
}

function useInView() {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold: 0.2 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}

function ContourDivider({ lines = 3 }) {
  const [ref, inView] = useInView()
  return (
    <div className={`contour-divider${inView ? ' in-view' : ''}`} ref={ref}>
      <svg viewBox="0 0 1200 90" preserveAspectRatio="none">
        {Array.from({ length: lines }).map((_, i) => (
          <path key={i} d={contourPath(0.9 + i * 0.35, 14 + i * 6, 30 + i * 14, 10)} />
        ))}
      </svg>
    </div>
  )
}

function HeroContours() {
  return (
    <svg className="hero-contours" viewBox="0 0 1200 700" preserveAspectRatio="none">
      {Array.from({ length: 7 }).map((_, i) => (
        <path
          key={i}
          d={contourPath(0.5 + i * 0.22, 26 + i * 8, 90 + i * 78, 14)}
          fill="none"
          stroke="#3C4A30"
          strokeWidth="1"
          opacity={0.16 - i * 0.012}
        />
      ))}
    </svg>
  )
}

function Reveal({ children, as: Tag = 'div', ...rest }) {
  const [ref, inView] = useInView()
  return <Tag ref={ref} className={`reveal${inView ? ' in-view' : ''}`} {...rest}>{children}</Tag>
}

// Deterministic pseudo grid-reference derived from the event id, so each
// fixture reads a real identifier rather than a decorative 01/02/03.
function gridRefFor(id, date) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const east = 100 + (h % 900)
  const north = 100 + (Math.floor(h / 7) % 900)
  return `SU ${east} ${north}`
}

function daysUntil(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const diff = Math.ceil((d - now) / 86400000)
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
      } catch (e) {
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
        <div className="topbar-mark"><span className="dot">●</span> SWINDON AIRSOFT — FIELD CONCEPT</div>
        <nav className="topbar-nav">
          <a href="#ground">The Ground</a>
          <a href="#fixtures">Fixtures</a>
          <a href="#notes">Briefing</a>
        </nav>
      </header>

      <section className="hero">
        <HeroContours />
        <div className="wrap hero-inner">
          <div className="grid-ref">OS GRID SU 148 848 · WILTSHIRE</div>
          <h1><span>SWINDON</span><span>AIRSOFT</span></h1>
          <p className="hero-sub">Woodland skirmish, run properly — real terrain, real cover, marshalled fairly.</p>
          <div className="hero-actions">
            <a className="waypoint-btn" href="#fixtures"><span className="tri">▲</span> Next Muster</a>
            {nextEvent && (
              <div className="hero-next">
                <span className="label">Next Fixture</span><br />
                <b>{nextEvent.title}</b> — {daysUntil(nextEvent.date) === 0 ? 'today' : `${daysUntil(nextEvent.date)}d out`}
              </div>
            )}
          </div>
        </div>
      </section>

      <ContourDivider />

      <section id="ground">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="section-eyebrow">Terrain Briefing</span>
              <h2>The Ground</h2>
            </div>
            <div className="section-meta">Mixed woodland · CQB structures<br />Wiltshire, England</div>
          </div>
          <div className="ground">
            <Reveal className="ground-copy">
              <p>The site reads differently depending on which way you came in — dense treeline to the north, a scatter of built-up CQB positions cutting through the middle ground, and open flanks that punish anyone who rushes them. It rewards players who read terrain rather than players who just run fast.</p>
              <p>Games are marshalled properly: clear calling, fair eliminations, and briefings that actually cover the ruleset rather than rushing through it. New to the hobby or fifteen years in, you're playing the same ground on the same terms.</p>
            </Reveal>
            <Reveal className="ground-stats">
              <div className="ground-stat"><span className="k">Terrain</span><span className="v">Woodland + CQB</span></div>
              <div className="ground-stat"><span className="k">Marshals</span><span className="v">On every game</span></div>
              <div className="ground-stat"><span className="k">Games run since</span><span className="v">2019</span></div>
              <div className="ground-stat"><span className="k">Entry</span><span className="v">UKARA-friendly</span></div>
            </Reveal>
          </div>
        </div>
      </section>

      <ContourDivider />

      <section id="fixtures">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="section-eyebrow">Upcoming</span>
              <h2>Fixtures</h2>
            </div>
            <div className="section-meta">Live from the booking system</div>
          </div>

          <div className="fixtures-list">
            {events === null && <div className="empty-note">Reading the board…</div>}
            {events && events.length === 0 && !loadError && (
              <div className="empty-note">Nothing published yet — check back shortly.</div>
            )}
            {loadError && <div className="error-note">Couldn't reach the fixture list just now.</div>}
            {events && events.map(ev => {
              const c = counts[ev.id]
              const totalSlots = (ev.walk_on_slots || 0) + (ev.rental_slots || 0)
              const booked = c ? (Number(c.total_booked) || 0) : null
              const pct = booked !== null && totalSlots > 0 ? Math.min(100, Math.round((booked / totalSlots) * 100)) : null
              const isFull = pct !== null && pct >= 100
              return (
                <Reveal as="div" className="fixture" key={ev.id}>
                  <div className="fixture-ref">{gridRefFor(ev.id, ev.date)}<span className="small">grid ref</span></div>
                  <div className="fixture-main">
                    <h3>{ev.title}</h3>
                    <div className="date">{new Date(ev.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {ev.time || ''}{ev.location ? ` · ${ev.location}` : ''}</div>
                  </div>
                  <div className="fixture-slots">
                    <span className="n">{pct === null ? '—' : isFull ? 'FULL' : `${totalSlots - booked} left of ${totalSlots}`}</span>
                    {pct !== null && (
                      <div className="bar"><div className={`bar-fill${isFull ? ' full' : ''}`} style={{ width: `${pct}%` }} /></div>
                    )}
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <ContourDivider />

      <section id="notes">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="section-eyebrow">Before You Come</span>
              <h2>Field Notes</h2>
            </div>
          </div>
          <div className="notes-grid">
            <Reveal as="div" className="note">
              <div className="symbol">A</div>
              <h4>First time out</h4>
              <p>Rentals are available if you don't own kit yet — full brief and safety check happens before anyone's on the ground.</p>
            </Reveal>
            <Reveal as="div" className="note">
              <div className="symbol">B</div>
              <h4>What to bring</h4>
              <p>Full-seal eye protection is non-negotiable. Layer for woodland — the ground holds damp longer than the sky suggests.</p>
            </Reveal>
            <Reveal as="div" className="note">
              <div className="symbol">C</div>
              <h4>UKARA</h4>
              <p>Games count toward UKARA play-count from day one. Ask at the gate if you're working toward your defence.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="legend">
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--forest)' }} /> Woodland</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--ember)', borderRadius: '50%' }} /> Muster point</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--moss)' }} /> CQB structure</span>
          </div>
          <div className="foot-bottom">
            <span>SWINDON AIRSOFT — FIELD CONCEPT · DESIGN DRAFT, NOT LIVE</span>
            <span>WILTSHIRE, ENGLAND</span>
          </div>
        </div>
      </footer>
    </>
  )
}
