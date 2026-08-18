import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../assets/logo.png'

export default function Nav() {
  const [open, setOpen] = useState(false)
  const links = [
    { to: '/', label: 'Home', sub: 'Welcome', end: true },
    { to: '/fixtures', label: 'Fixtures', sub: 'Book In' },
    { to: '/rules', label: 'Rules & Kit', sub: 'Read First' },
    { to: '/gallery', label: 'Gallery', sub: 'Photo & Video' },
    { to: '/contact', label: 'Contact', sub: 'Get In Touch' },
  ]
  return (
    <>
      <button className="sidebar-burger" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <NavLink to="/" className="sidebar-brand" onClick={() => setOpen(false)}>
          <img src={logo} alt="Swindon Airsoft" className="sidebar-logo" />
        </NavLink>
        <nav className="sidebar-nav">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)}
              className={({ isActive }) => isActive ? 'active' : undefined}>
              <span className="sidebar-nav-label">{l.label}</span>
              <span className="sidebar-nav-sub">{l.sub}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
