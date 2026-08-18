import React from 'react'
import { Photo } from '../components/common'
import { PHOTOS } from '../components/common'

export default function Rules() {
  return (
    <>
      <section className="page-hero page-hero-photo">
        <Photo src={PHOTOS.rulesBanner} alt="" />
        <div className="wrap page-hero-inner">
          <span className="section-tag">Read This First</span>
          <h1>Rules &amp; Kit</h1>
          <p className="page-hero-sub">Nobody enjoys a briefing, but everyone enjoys a fair game. This is the whole thing — five minutes, no surprises on the day.</p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="rules-grid">
            <div className="rule-block">
              <div className="rule-num">01</div>
              <h3>Eye Protection</h3>
              <p>Full-seal eye protection only — no shooting glasses, no gaps at the temple. Mesh masks are fine if they're full-seal. This is checked at the gate, every game, no exceptions, no "just for this round."</p>
            </div>
            <div className="rule-block">
              <div className="rule-num">02</div>
              <h3>FPS Limits</h3>
              <p>AEGs capped at 350 FPS on 0.20g BBs measured at the chrono station. Snipers get a bolt-action allowance up to 500 FPS with a minimum engagement distance of 20m — enforced, not just suggested.</p>
            </div>
            <div className="rule-block">
              <div className="rule-num">03</div>
              <h3>Hit Calling</h3>
              <p>Any hit anywhere on the body or gun counts — call it loud, raise a hand, and get to safe zone. Blind-firing and spraying without looking are both bannable on the spot.</p>
            </div>
            <div className="rule-block">
              <div className="rule-num">04</div>
              <h3>Minimum Engagement Distance</h3>
              <p>10m for full-auto AEGs. Full-auto below that gets you a warning first time, a walk second time. This is the rule marshals watch closest — it's the one that actually hurts people.</p>
            </div>
            <div className="rule-block">
              <div className="rule-num">05</div>
              <h3>Safety Flags</h3>
              <p>Barrel bags or safety flags on at all times outside the game area — car park, gate, clubhouse. Guns come out of the bag only once you're through to the briefing point.</p>
            </div>
            <div className="rule-block">
              <div className="rule-num">06</div>
              <h3>Marshal Calls Are Final</h3>
              <p>Disagree after the game, not during it. A marshal's call in the moment stands — arguing on the field holds up everyone else's day, not just yours.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="kit">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">What To Bring</span>
            <h2>Loadout Check</h2>
          </div>
          <div className="notes-grid">
            <div className="note">
              <Photo src={PHOTOS.note1} alt="" />
              <div className="note-body">
                <div className="tag">Own Kit</div>
                <h4>Walk-On Players</h4>
                <p>Your gun (350 FPS max), full-seal eyewear, mags, BBs (bio only), and layers for woodland — the ground holds damp longer than the forecast suggests.</p>
              </div>
            </div>
            <div className="note">
              <Photo src={PHOTOS.note2} alt="" />
              <div className="note-body">
                <div className="tag">First Timer</div>
                <h4>Rental Players</h4>
                <p>Just yourself. Gun, mask, gloves, and BBs are covered — turn up in sturdy boots and clothes you don't mind getting muddy.</p>
              </div>
            </div>
            <div className="note">
              <Photo src={PHOTOS.note3} alt="" />
              <div className="note-body">
                <div className="tag">Working Toward It</div>
                <h4>UKARA Defence</h4>
                <p>Every game counts toward your play total from day one, rental or own kit. Ask at the gate for a signed record if you need it for your application.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="closing closing-small">
        <div className="wrap">
          <h2>QUESTIONS BEFORE<br /><span className="accent">YOUR FIRST GAME?</span></h2>
          <p className="closing-sub">Get in touch — we'd rather answer it now than sort it out at the gate.</p>
        </div>
      </section>
    </>
  )
}
