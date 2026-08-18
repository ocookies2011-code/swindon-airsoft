import React from 'react'
import { Link } from 'react-router-dom'
import { Photo, PHOTOS } from '../components/common'
import { useFixtures, daysUntil } from '../useFixtures'

export default function Home() {
  const { events } = useFixtures(1)
  const nextEvent = events && events.length > 0 ? events[0] : null

  return (
    <>
      {/* Compact operational strip, not a marketing hero — this is the bit
          a returning player actually uses, so it leads. */}
      <section className="util-bar">
        <div className="wrap util-bar-inner">
          <div className="util-main">
            <span className="hero-tag">Wiltshire · Outdoor Field</span>
            <h1 className="util-title">Swindon Airsoft</h1>
            <p className="util-sub">Full-contact woodland skirmish, marshalled properly. Bring your kit or rent ours.</p>
          </div>
          <div className="util-next">
            {nextEvent ? (
              <>
                <span className="util-next-label">Next Fixture</span>
                <span className="util-next-title">{nextEvent.title}</span>
                <span className="util-next-when">{daysUntil(nextEvent.date) === 0 ? 'Today' : `${daysUntil(nextEvent.date)} days out`}</span>
              </>
            ) : <span className="util-next-label">Loading fixtures…</span>}
            <Link className="blaze-btn util-book-btn" to="/fixtures">Book In →</Link>
          </div>
        </div>
      </section>

      {/* Portal tiles — the main way into the site, not a scroll of sections */}
      <section className="portal">
        <div className="portal-grid">
          <Link className="portal-tile" to="/fixtures">
            <Photo src={PHOTOS.gallery1} alt="" />
            <div className="portal-tile-body">
              <div className="portal-label">Fixtures</div>
              <div className="portal-desc">Live bookings, real slot counts, pricing</div>
              <div className="portal-enter">Enter →</div>
            </div>
          </Link>
          <Link className="portal-tile" to="/rules">
            <Photo src={PHOTOS.rulesBanner} alt="" />
            <div className="portal-tile-body">
              <div className="portal-label">Rules &amp; Kit</div>
              <div className="portal-desc">FPS limits, MED, what to bring</div>
              <div className="portal-enter">Enter →</div>
            </div>
          </Link>
          <Link className="portal-tile" to="/gallery">
            <Photo src={PHOTOS.gallery2} alt="" />
            <div className="portal-tile-body">
              <div className="portal-label">Gallery</div>
              <div className="portal-desc">What a match day actually looks like</div>
              <div className="portal-enter">Enter →</div>
            </div>
          </Link>
          <Link className="portal-tile" to="/contact">
            <Photo src={PHOTOS.contactBanner} alt="" />
            <div className="portal-tile-body">
              <div className="portal-label">Contact</div>
              <div className="portal-desc">Groups, questions, press</div>
              <div className="portal-enter">Enter →</div>
            </div>
          </Link>
        </div>
      </section>

      <div className="stats stats-compact">
        <div className="stat"><div className="n">2019</div><div className="l">Running Since</div></div>
        <div className="stat"><div className="n">30+</div><div className="l">Acres of Ground</div></div>
        <div className="stat"><div className="n">100%</div><div className="l">Marshalled Games</div></div>
        <div className="stat"><div className="n">UKARA</div><div className="l">Defence Eligible</div></div>
      </div>
    </>
  )
}
