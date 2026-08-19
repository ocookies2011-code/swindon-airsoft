import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../assets/logo.png'
import { useAuth } from '../useAuth'

export default function Nav() {
  const [open, setOpen] = useState(false)
  const { user, profile } = useAuth()
  const links = [
    { to: '/', label: 'Home', sub: 'Welcome', end: true },
    { to: '/fixtures', label: 'Fixtures', sub: 'Book In' },
    { to: '/rules', label: 'Rules & Kit', sub: 'Read First' },
    { to: '/gallery', label: 'Gallery', sub: 'Photo & Video' },
    { to: '/contact', label: 'Contact', sub: 'Get In Touch' },
    { to: '/account', label: user ? (profile?.name || 'My Account') : 'Sign In', sub: user ? 'My Account' : 'Player Login' },
  ]
  return (
    <>
      <button className="sidebar-burger" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <NavLink to="/" className="sidebar-brand" onClick={() => setOpen(false)}>
          <img src={logo} alt="Swindon Airsoft" className="sidebar-logo" />
        </NavLink>
        <div className="sidebar-social">
          <a href="https://www.facebook.com/SwindonAirsoft" target="_blank" rel="noreferrer" aria-label="Facebook">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </a>
          <a href="https://chat.whatsapp.com/IHjQNgqo3ThC6B6auiOO6d" target="_blank" rel="noreferrer" aria-label="WhatsApp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.4-1.8-.1-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.2-.4.1-.1.1-.3 0-.4-.1-.1-.5-1.3-.7-1.8-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2 1 2.4c.1.1 1.6 2.4 3.8 3.4.5.2.9.4 1.3.5.5.2 1 .1 1.4.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"/></svg>
          </a>
        </div>
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
