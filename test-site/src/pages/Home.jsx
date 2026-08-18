import React from 'react'
import { Link } from 'react-router-dom'
import { Photo, PHOTOS } from '../components/common'
import { useFixtures, daysUntil } from '../useFixtures'

export default function Home() {
  const { events } = useFixtures(1)
  const nextEvent = events && events.length > 0 ? events[0] : null

  return (
    <>
      {/* Photo hero with bold headline overlay + red CTA — matches the
          military-recruitment reference structure */}
      <div className="hero-frame">
      <section className="hero">
        <Photo src={PHOTOS.hero} alt="" />
        <div className="hero-inner">
          {nextEvent && (
            <div className="hero-next">
              <span className="hero-next-label">Next Fixture</span>
              <span className="hero-next-title">{nextEvent.title}</span>
              <span className="hero-next-when">{daysUntil(nextEvent.date) === 0 ? 'Today' : `${daysUntil(nextEvent.date)} days out`}</span>
            </div>
          )}
          <h1 className="hero-headline">PLAYING AIRSOFT<br />IS MORE THAN<br /><span className="accent">A GAME</span></h1>
          <p className="hero-copy">If there's a shot to take or a flank to hold, we'd rather you found out here — marshalled, fair, and on real ground.</p>
          <Link className="btn-red" to="/fixtures">JOIN US →</Link>
        </div>
      </section>
      </div>

      {/* Photo tile row — same shape as the reference's thumbnail strip */}
      <section className="portal">
        <div className="portal-grid">
          <Link className="portal-tile" to="/fixtures">
            <Photo src={PHOTOS.gallery1} alt="" />
            <div className="portal-cap">Fixtures</div>
          </Link>
          <Link className="portal-tile" to="/rules">
            <Photo src={PHOTOS.rulesBanner} alt="" />
            <div className="portal-cap">Rules &amp; Kit</div>
          </Link>
          <Link className="portal-tile" to="/gallery">
            <Photo src={PHOTOS.gallery2} alt="" />
            <div className="portal-cap">Gallery</div>
          </Link>
          <Link className="portal-tile" to="/contact">
            <Photo src={PHOTOS.contactBanner} alt="" />
            <div className="portal-cap">Contact</div>
          </Link>
        </div>
      </section>

      {/* Welcome / about strip with red section header bar, matching the
          reference's "Welcome To Our Academy" block */}
      <section className="welcome">
        <div className="section-band"><span>Welcome To The Field</span></div>
        <div className="wrap welcome-grid">
          <div className="welcome-photo"><Photo src={PHOTOS.ground} alt="" /></div>
          <div className="welcome-copy">
            <p>Located just off Junction 16 of the M4 — run by airsofters, for airsofters. Whether you're seasoned or brand new to the sport, we've got you covered.</p>
            <p>Gates open 08:00 with a free tea or coffee, chrono at 08:45, morning brief at 09:30, first game on at 10:00. We stop for lunch around 12:30, then it's back into it until end of day.</p>
            <div className="welcome-contact">
              <div>
                <div className="tag">Find Us</div>
                <p>Manor Hl, Swindon, SN5 4EG<br />A marshal greets you on arrival</p>
              </div>
              <div>
                <div className="tag">Age Policy</div>
                <p>12+ with a parent playing, 14+ with written consent<br />18+ books independently</p>
              </div>
            </div>
            <Link className="btn-red btn-red-small" to="/fixtures">Book In →</Link>
          </div>
        </div>
      </section>

      <div className="stats">
        <div className="stat"><div className="n">12+</div><div className="l">Minimum Age</div></div>
        <div className="stat"><div className="n">350 FPS</div><div className="l">Rifle Limit</div></div>
        <div className="stat"><div className="n">100%</div><div className="l">Marshalled Games</div></div>
        <div className="stat"><div className="n">UKARA</div><div className="l">Defence Eligible</div></div>
      </div>
    </>
  )
}
