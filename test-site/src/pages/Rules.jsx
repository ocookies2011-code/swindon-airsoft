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
          <p className="page-hero-sub">The real ruleset — same FPS limits, engagement distances, and policies enforced on site, not a summary.</p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Section 02</span>
            <h2>Age Requirements</h2>
          </div>
          <ul className="rule-list">
            <li>Players must be at least <b>12 years old</b> to participate.</li>
            <li>Players aged <b>12–13</b> must have a parent or guardian present and playing with them on the day.</li>
            <li>Players aged <b>14–17</b> must have written parental or guardian consent before attending.</li>
            <li>Players <b>18 and over</b> may attend and book independently.</li>
            <li>Valid ID or consent documentation may be requested on arrival.</li>
          </ul>
        </div>
      </section>

      <section className="faq">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Section 04</span>
            <h2>FPS Limits &amp; Chronographing</h2>
          </div>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, maxWidth: 640 }}>
            All guns must meet Swindon Airsoft's FPS (Feet Per Second) limits. Every weapon is chronographed before the game begins — anything over limit doesn't go on the field.
          </p>
          <div className="rules-grid">
            <div className="rule-block">
              <h3>Full Auto Rifle</h3>
              <p><b>Limit:</b> 350fps (0.20g)<br /><b>MED:</b> No minimum engagement distance</p>
            </div>
            <div className="rule-block">
              <h3>DMR</h3>
              <p><b>Limit:</b> 450fps (0.20g)<br /><b>MED:</b> 30m minimum engagement distance</p>
            </div>
            <div className="rule-block">
              <h3>Bolt-Action Sniper</h3>
              <p><b>Limit:</b> 500fps (0.20g)<br /><b>MED:</b> 30m minimum engagement distance</p>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 18, maxWidth: 640 }}>
            Players operating a DMR or bolt-action sniper must carry a sidearm and switch to it when inside the MED.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Section 03</span>
            <h2>Code of Conduct</h2>
          </div>
          <ul className="rule-list">
            <li>Follow all marshal instructions immediately and without question.</li>
            <li>Call your hits honestly — this is a self-policing sport.</li>
            <li>Aggressive behaviour, abuse, or threatening conduct toward players or staff results in immediate removal and a permanent ban.</li>
            <li>Alcohol and illegal substances are strictly prohibited on site.</li>
            <li>All weapons must remain holstered or slung when not in the active play area.</li>
            <li>Eye protection must be worn at all times in the game zone — no exceptions.</li>
            <li>As this is a woodland site, boots are a must at all times — no trainers or open footwear.</li>
          </ul>
        </div>
      </section>

      <section className="faq">
        <div className="wrap">
          <div className="section-head">
            <span className="section-tag">Section 07</span>
            <h2>Rental Equipment</h2>
          </div>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 18, maxWidth: 640 }}>
            Rental equipment remains the property of Swindon Airsoft and must be returned in good working order. Players are responsible for rental equipment while it's in their possession — don't disassemble, modify, or tamper with it, including removing batteries. Damage or loss is charged at the following rates:
          </p>
          <div className="rental-rates">
            <div><span>Rifle</span><b>£153</b><small>replacement, or parts required for repair</small></div>
            <div><span>Goggles / Mask</span><b>£23</b><small>£13 for visor replacement only</small></div>
            <div><span>Chest Rig</span><b>£20</b><small>repair charge for any damage</small></div>
            <div><span>Speedloader</span><b>£5</b><small>replacement</small></div>
            <div><span>Magazine</span><b>£16</b><small>per replacement magazine</small></div>
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
                <p>Your gun (chronographed on arrival), full-seal eyewear, mags, bio BBs, and boots. Layer up — the ground holds damp longer than the forecast suggests.</p>
              </div>
            </div>
            <div className="note">
              <Photo src={PHOTOS.note2} alt="" />
              <div className="note-body">
                <div className="tag">First Timer</div>
                <h4>Rental Players</h4>
                <p>Just yourself, boots, and clothes you don't mind getting muddy. Gun, mask, and BBs are covered.</p>
              </div>
            </div>
            <div className="note">
              <Photo src={PHOTOS.note3} alt="" />
              <div className="note-body">
                <div className="tag">Before You Play</div>
                <h4>Sign Your Waiver</h4>
                <p>The digital waiver must be signed before attending — do this from your Profile on the live site before game day.</p>
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
