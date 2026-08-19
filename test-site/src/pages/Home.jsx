import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Photo, PHOTOS } from '../components/common'
import { useFixtures, daysUntil } from '../useFixtures'
import { supabase } from '../supabaseClient'

function useLatestNews() {
  const [post, setPost] = useState(undefined) // undefined = loading, null = none
  useEffect(() => {
    let cancelled = false
    supabase
      .from('news_posts')
      .select('id, title, body, created_at')
      .eq('published', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        setPost(error || !data?.length ? null : data[0])
      })
    return () => { cancelled = true }
  }, [])
  return post
}

export default function Home() {
  const { events } = useFixtures(1)
  const nextEvent = events && events.length > 0 ? events[0] : null
  const news = useLatestNews()

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
          reference's "Welcome To Our Academy" block — nested photo+news
          row on top, contact info + age policy row below */}
      <section className="welcome">
        <div className="section-band"><span>Welcome To The Field</span></div>
        <div className="wrap">
          <div className="welcome-top">
            <div className="welcome-photo"><Photo src={PHOTOS.note1} alt="" /></div>
            <div className="welcome-news">
              <div className="tag">Latest News</div>
              {news === undefined && <p className="welcome-news-body">Loading…</p>}
              {news === null && <p className="welcome-news-body">No news posted yet — check back soon.</p>}
              {news && (
                <>
                  <h4>{news.title}</h4>
                  <p className="welcome-news-body">{news.body.length > 200 ? news.body.slice(0, 200) + '…' : news.body}</p>
                  <Link className="text-link" to="/gallery">Read more →</Link>
                </>
              )}
            </div>
          </div>
          <div className="welcome-bottom">
            <div>
              <div className="tag">Contact Info</div>
              <p>Manor Hl, Swindon, SN5 4EG<br />A marshal greets you on arrival</p>
            </div>
            <div>
              <div className="tag">Age Policy</div>
              <p>12+ with a parent playing, 14+ with written consent<br />18+ books independently</p>
              <Link className="btn-gray" to="/fixtures">Book In →</Link>
            </div>
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
