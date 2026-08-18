import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import logoMono from '../assets/logo.png'

export default function Nav() {
  const [open, setOpen] = useState(false)
  const links = [
    { to: '/', label: 'Home', end: true },
    { to: '/fixtures', label: 'Fixtures' },
    { to: '/rules', label: 'Rules & Kit' },
    { to: '/gallery', label: 'Gallery' },
    { to: '/contact', label: 'Contact' },
  ]
  return (
    <header className="topbar">
      <NavLink to="/" className="topbar-mark" onClick={() => setOpen(false)}>
        <img src={logoMono} alt="Swindon Airsoft" className="topbar-logo" /> SWINDON AIRSOFT
      </NavLink>
      <nav className="topbar-nav">
        {links.map(l => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => isActive ? 'active' : undefined}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <button className="topbar-burger" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
      {open && (
        <div className="topbar-mobile">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)}>{l.label}</NavLink>
          ))}
        </div>
      )}
    </header>
  )
}
