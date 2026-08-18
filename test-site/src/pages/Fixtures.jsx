import React from 'react'
import { useFixtures } from '../useFixtures'

export default function Fixtures() {
  const { events, counts, loadError } = useFixtures(50)

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="section-tag">Live from the booking system</span>
          <h1>Fixtures</h1>
          <p className="page-hero-sub">Every published game on the calendar, with real slot counts. Rentals include a full loadout — bring nothing but yourself.</p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="fixtures-list fixtures-list-full">
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
                <div className="fixture fixture-detailed" key={ev.id}>
                  <div className="fixture-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="fixture-main">
                    <h3>{ev.title}</h3>
                    <div className="date">{new Date(ev.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {ev.time || ''}{ev.location ? ` · ${ev.location}` : ''}</div>
                    {ev.description && <p className="fixture-desc">{ev.description}</p>}
                    <div className="fixture-prices">
                      {ev.walk_on_price != null && <span>Walk-On <b>£{Number(ev.walk_on_price).toFixed(0)}</b></span>}
                      {ev.rental_price != null && <span>Rental <b>£{Number(ev.rental_price).toFixed(0)}</b></span>}
                    </div>
                  </div>
                  <div className="fixture-slots">
                    <span className="n">{pct === null ? '—' : isFull ? 'FULL' : `${totalSlots - booked} LEFT`}</span>
                    {pct !== null && <div className="bar"><div className={`bar-fill${isFull ? ' full' : ''}`} style={{ width: `${pct}%` }} /></div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="faq">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Before You Book</span>
            <h2>Quick Answers</h2>
          </div>
          <div className="faq-grid">
            <div className="faq-item">
              <h4>What's the difference between Walk-On and Rental?</h4>
              <p>Walk-On is for players with their own gun, mags, and eye protection. Rental covers everything — gun, mask, gloves, and BBs — for first-timers or anyone travelling light.</p>
            </div>
            <div className="faq-item">
              <h4>Can I cancel a booking?</h4>
              <p>Yes — cancellations go through admin review rather than being processed instantly. You'll get an email once it's actioned, either as a refund or game-day credit depending on notice given.</p>
            </div>
            <div className="faq-item">
              <h4>Do I need UKARA already?</h4>
              <p>No — first-timers are welcome. Every game you play here counts toward your UKARA play total from day one.</p>
            </div>
            <div className="faq-item">
              <h4>What if a fixture shows FULL?</h4>
              <p>Get in touch — we run a waitlist, and a slot freeing up (cancellation, no-show) fills automatically from whoever's next in line.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
