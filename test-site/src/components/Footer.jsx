import React from 'react'
import { Link } from 'react-router-dom'
import logoMono from '../assets/logo-mono.png'

export default function Footer() {
  return (
    <footer>
      <div className="wrap foot-inner">
        <img src={logoMono} alt="Swindon Airsoft" className="foot-logo" />
        <nav className="foot-nav">
          <Link to="/">Home</Link>
          <Link to="/fixtures">Fixtures</Link>
          <Link to="/rules">Rules &amp; Kit</Link>
          <Link to="/gallery">Gallery</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <div className="foot-row">
          <span>Swindon Airsoft — Field Concept · Design Draft, Not Live</span>
          <span>Wiltshire, England</span>
        </div>
      </div>
    </footer>
  )
}
