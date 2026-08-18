import React from 'react'
import { Link } from 'react-router-dom'
import { Photo, Reveal, PHOTOS } from '../components/common'
import { useFixtures, daysUntil } from '../useFixtures'

export default function Home() {
  const { events, counts, loadError } = useFixtures(3)
  const nextEvent = events && events.length > 0 ? events[0] : null

  return (
    <>
      <section className="hero">
        <Photo src={PHOTOS.hero} alt="" />
        <div className="hero-inner">
          <div className="hero-tag">Wiltshire · Outdoor Field</div>
          <h1>NO RESPAWNS.<br /><span className="accent">JUST INSTINCT.</span></h1>
          <p className="hero-sub">Full-contact woodland skirmish, marshalled properly. Bring your kit or rent ours — either way, the ground doesn't care who you are.</p>
          <div className="hero-actions">
            <Link className="blaze-btn" to="/fixtures">Book In →</Link>
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
              <Link className="text-link" to="/rules">Full rules & kit requirements →</Link>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="fixtures-teaser">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Upcoming</span>
            <h2>Next Up</h2>
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
          <Link className="text-link" to="/fixtures">See the full fixture list →</Link>
        </div>
      </section>

      <section id="gallery-teaser">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">From the Field</span>
            <h2>Gallery</h2>
          </div>
          <div className="gallery-teaser-grid">
            <Reveal><Photo src={PHOTOS.gallery1} alt="" /></Reveal>
            <Reveal><Photo src={PHOTOS.gallery2} alt="" /></Reveal>
            <Reveal><Photo src={PHOTOS.gallery3} alt="" /></Reveal>
          </div>
          <Link className="text-link" to="/gallery">Full gallery →</Link>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <h2>GET MUDDY.<br /><span className="accent">GET GOOD.</span></h2>
          <Link className="blaze-btn" to="/fixtures">See What's On →</Link>
        </div>
      </section>
    </>
  )
}
