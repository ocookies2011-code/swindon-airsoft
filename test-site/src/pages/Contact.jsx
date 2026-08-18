import React, { useState } from 'react'
import { Photo, PHOTOS } from '../components/common'

const DEPARTMENTS = [
  { name: 'Bookings', description: 'Booked the wrong date, want to enquire about booking' },
  { name: 'Website Issues', description: '' },
  { name: 'Data Protection Enquiry', description: '' },
  { name: 'Group Bookings', description: '' },
  { name: 'Field Rental', description: '' },
  { name: 'UKARA', description: 'For any UKARA related questions' },
]

export default function Contact() {
  const [sent, setSent] = useState(false)
  const [dept, setDept] = useState('')

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
              <p>Manor Hl, Swindon, SN5 4EG<br />What3Words: ///massaged.flasks.blunders<br />Just off Junction 16 of the M4</p>
            </div>
            <div className="contact-block">
              <div className="tag">Direct</div>
              <p>
                <a href="mailto:swindonairsoftfield@gmail.com">swindonairsoftfield@gmail.com</a><br />
                <a href="tel:+447491441666">+44 7491 441 666</a>
              </p>
            </div>
            <div className="contact-block">
              <div className="tag">Social</div>
              <p>
                <a href="https://www.facebook.com/SwindonAirsoft" target="_blank" rel="noreferrer">Facebook</a>
                {' · '}
                <a href="https://chat.whatsapp.com/IHjQNgqo3ThC6B6auiOO6d" target="_blank" rel="noreferrer">WhatsApp Group</a>
              </p>
            </div>
            <div className="contact-block">
              <div className="tag">Departments</div>
              {DEPARTMENTS.map(d => (
                <p key={d.name} style={{ marginBottom: 8 }}>
                  <b style={{ color: 'var(--paper)' }}>{d.name}</b>
                  {d.description && <><br /><span style={{ fontSize: 12.5 }}>{d.description}</span></>}
                </p>
              ))}
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
                <label>Department
                  <select value={dept} onChange={e => setDept(e.target.value)} required>
                    <option value="">— Select department —</option>
                    {DEPARTMENTS.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </label>
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
