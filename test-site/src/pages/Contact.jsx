import React, { useState } from 'react'
import { Photo, PHOTOS } from '../components/common'

export default function Contact() {
  const [sent, setSent] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    setSent(true)
  }

  return (
    <>
      <section className="page-hero page-hero-photo">
        <Photo src={PHOTOS.contactBanner} alt="" />
        <div className="wrap page-hero-inner">
          <span className="section-tag">Get In Touch</span>
          <h1>Contact</h1>
          <p className="page-hero-sub">Questions before you book, group bookings, or press — this is where it lands.</p>
        </div>
      </section>

      <section>
        <div className="wrap contact-grid">
          <div className="contact-info">
            <div className="contact-block">
              <div className="tag">Find Us</div>
              <p>Wiltshire, England<br />Full directions sent on booking confirmation</p>
            </div>
            <div className="contact-block">
              <div className="tag">Match Days</div>
              <p>Sundays, most weekends<br />Gates open 08:00 · First brief 08:30</p>
            </div>
            <div className="contact-block">
              <div className="tag">Group Bookings</div>
              <p>Stag parties, corporate days, private hire — get in touch and we'll build a day around your group.</p>
            </div>
          </div>

          <form className="contact-form" onSubmit={submit}>
            {sent ? (
              <div className="contact-sent">
                <div className="tag">Sent</div>
                <p>This is a design concept — the form here doesn't actually send anywhere yet, but this is how it would confirm on the live site.</p>
              </div>
            ) : (
              <>
                <label>Name<input type="text" required /></label>
                <label>Email<input type="email" required /></label>
                <label>Message<textarea rows={5} required /></label>
                <button className="blaze-btn" type="submit">Send →</button>
              </>
            )}
          </form>
        </div>
      </section>
    </>
  )
}
