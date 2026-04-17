// utils/home.jsx — HomePage, CountdownPanel
import React, { useEffect, useState } from "react";
import { useMobile } from "./hooks";
import { fmtDate } from "./helpers";

function HomePage({ data, setPage, onProductClick }) {
  const isMobile = useMobile(700);
  const nextEvent = data.events
    .filter(e => e.published && new Date(e.date + "T" + e.time) > new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const now           = new Date();
  const upcomingEvents = data.events.filter(e => e.published && new Date(e.date + "T" + (e.time || "23:59")) > now);
  const totalPlayers  = data.users.filter(u => u.role === "player").length;
  const totalEvents   = upcomingEvents.length;
  const totalBookings = upcomingEvents.flatMap(e => e.bookings).reduce((s, b) => s + (b.qty || 1), 0);

  return (
    <div>
      {Array.isArray(data.homeMsg) && data.homeMsg.length > 0 && (
        <div className="site-banners">
          {data.homeMsg.map((msg, i) => (
            <div key={i} className="site-banner" style={{
              background: msg.bg || "#0a0f06",
              color: msg.color || "#c8ff00",
              borderColor: msg.color || "#c8ff00",
              borderLeftWidth: 3,
              boxShadow: `inset 0 0 0 1px ${(msg.color || "#c8ff00")}22`,
            }}>
              {msg.icon && <span className="site-banner-icon">{msg.icon}</span>}
              <span className="site-banner-text">{msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* HERO */}
      <div className="hero-bg">
        <div className="hero-bg-img" style={{ backgroundImage:"url('https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1600&q=80&auto=format&fit=crop')" }} />
        <div className="hero-bg-grad" />
        <div style={{ maxWidth:1280, margin:"0 auto", width:"100%", position:"relative", zIndex:1, padding:"0 24px" }}>
          <div className="hero-content">
            {/* ── MILITARY BANNER ── */}
            <div style={{ width:"100%", marginBottom:16 }}>
              <svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" style={{ width:"100%", height:"auto", display:"block", filter:"drop-shadow(0 8px 32px rgba(0,0,0,.8))" }}>
                <defs>
                  {/* Camo pattern */}
                  <pattern id="camo" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                    <rect width="60" height="60" fill="#1a2210"/>
                    <ellipse cx="12" cy="10" rx="10" ry="7" fill="#243015" opacity=".9"/>
                    <ellipse cx="42" cy="22" rx="14" ry="9" fill="#2d3a18" opacity=".8"/>
                    <ellipse cx="28" cy="42" rx="12" ry="8" fill="#1e2a10" opacity=".9"/>
                    <ellipse cx="55" cy="50" rx="8" ry="6" fill="#3a4a20" opacity=".7"/>
                    <ellipse cx="8" cy="48" rx="7" ry="5" fill="#243015" opacity=".8"/>
                    <ellipse cx="50" cy="5" rx="9" ry="6" fill="#2d3a18" opacity=".7"/>
                  </pattern>
                  {/* Battle damage overlay */}
                  <filter id="roughen">
                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise"/>
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G"/>
                  </filter>
                  {/* Grunge texture */}
                  <filter id="grunge" x="-5%" y="-5%" width="110%" height="110%">
                    <feTurbulence type="turbulence" baseFrequency="0.065" numOctaves="3" stitchTiles="stitch" result="t"/>
                    <feColorMatrix type="saturate" values="0" in="t" result="g"/>
                    <feBlend in="SourceGraphic" in2="g" mode="multiply" result="b"/>
                    <feComposite in="b" in2="SourceGraphic" operator="in"/>
                  </filter>
                  <clipPath id="bannerClip">
                    <polygon points="0,0 635,0 640,5 640,215 635,220 5,220 0,215"/>
                  </clipPath>
                </defs>

                {/* Base camo background */}
                <g clipPath="url(#bannerClip)">
                  <rect width="640" height="220" fill="url(#camo)"/>

                  {/* Dark overlay for text contrast */}
                  <rect width="640" height="220" fill="rgba(0,0,0,0.55)"/>

                  {/* Top accent stripe */}
                  <rect x="0" y="0" width="640" height="5" fill="#c8ff00" opacity=".9"/>

                  {/* Bottom accent stripe */}
                  <rect x="0" y="215" width="640" height="5" fill="#c8ff00" opacity=".9"/>

                  {/* Left tactical stripe */}
                  <rect x="0" y="0" width="4" height="220" fill="#c8ff00" opacity=".7"/>

                  {/* Right tactical stripe */}
                  <rect x="636" y="0" width="4" height="220" fill="#c8ff00" opacity=".7"/>

                  {/* Crosshair — top left */}
                  <g opacity=".25" transform="translate(42,38)">
                    <circle cx="0" cy="0" r="18" fill="none" stroke="#c8ff00" strokeWidth="1.5"/>
                    <circle cx="0" cy="0" r="4" fill="none" stroke="#c8ff00" strokeWidth="1"/>
                    <line x1="-24" y1="0" x2="-8" y2="0" stroke="#c8ff00" strokeWidth="1.5"/>
                    <line x1="8"  y1="0" x2="24"  y2="0" stroke="#c8ff00" strokeWidth="1.5"/>
                    <line x1="0" y1="-24" x2="0" y2="-8" stroke="#c8ff00" strokeWidth="1.5"/>
                    <line x1="0" y1="8"  x2="0" y2="24"  stroke="#c8ff00" strokeWidth="1.5"/>
                  </g>

                  {/* Crosshair — bottom right */}
                  <g opacity=".2" transform="translate(596,182)">
                    <circle cx="0" cy="0" r="14" fill="none" stroke="#c8ff00" strokeWidth="1.2"/>
                    <circle cx="0" cy="0" r="3" fill="none" stroke="#c8ff00" strokeWidth="1"/>
                    <line x1="-20" y1="0" x2="-6" y2="0" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="6"  y1="0" x2="20"  y2="0" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="0" y1="-20" x2="0" y2="-6" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="0" y1="6"  x2="0" y2="20"  stroke="#c8ff00" strokeWidth="1.2"/>
                  </g>

                  {/* Dog-tag shape top-right */}
                  <g transform="translate(566, 14)" opacity=".18">
                    <rect x="0" y="0" width="54" height="28" rx="4" fill="none" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="14" y1="0" x2="14" y2="28" stroke="#c8ff00" strokeWidth=".8" opacity=".5"/>
                    <text x="6"  y="11" fontFamily="'Share Tech Mono',monospace" fontSize="5" fill="#c8ff00" letterSpacing=".08em">ZULU-ALPHA</text>
                    <text x="6"  y="18" fontFamily="'Share Tech Mono',monospace" fontSize="4.5" fill="#c8ff00" letterSpacing=".06em">BLOOD: O-POS</text>
                    <text x="6"  y="25" fontFamily="'Share Tech Mono',monospace" fontSize="4.5" fill="#c8ff00" letterSpacing=".06em">UKARA: ACTIVE</text>
                  </g>

                  {/* Bullet holes */}
                  <circle cx="580" cy="58" r="5" fill="#000" opacity=".8"/>
                  <circle cx="580" cy="58" r="5" fill="none" stroke="#333" strokeWidth="1.5"/>
                  <line x1="578" y1="54" x2="574" y2="48" stroke="#222" strokeWidth=".8" opacity=".6"/>
                  <line x1="582" y1="54" x2="587" y2="49" stroke="#222" strokeWidth=".8" opacity=".6"/>
                  <line x1="584" y1="58" x2="590" y2="58" stroke="#222" strokeWidth=".8" opacity=".6"/>
                  <line x1="576" y1="62" x2="570" y2="65" stroke="#222" strokeWidth=".8" opacity=".6"/>

                  <circle cx="60" cy="175" r="4" fill="#000" opacity=".8"/>
                  <circle cx="60" cy="175" r="4" fill="none" stroke="#333" strokeWidth="1.2"/>
                  <line x1="58" y1="171" x2="55" y2="166" stroke="#222" strokeWidth=".7" opacity=".6"/>
                  <line x1="62" y1="171" x2="66" y2="167" stroke="#222" strokeWidth=".7" opacity=".6"/>
                  <line x1="64" y1="175" x2="68" y2="175" stroke="#222" strokeWidth=".7" opacity=".6"/>

                  {/* Grid / tactical overlay lines */}
                  <line x1="0" y1="40" x2="640" y2="40" stroke="#c8ff00" strokeWidth=".4" opacity=".08"/>
                  <line x1="0" y1="180" x2="640" y2="180" stroke="#c8ff00" strokeWidth=".4" opacity=".08"/>
                  <line x1="80" y1="0" x2="80" y2="220" stroke="#c8ff00" strokeWidth=".4" opacity=".06"/>
                  <line x1="560" y1="0" x2="560" y2="220" stroke="#c8ff00" strokeWidth=".4" opacity=".06"/>

                  {/* OP ZULU-ECHO classification stamp — faint */}
                  <text x="320" y="195" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontSize="9" fontWeight="900"
                    fill="none" stroke="#c8ff00" strokeWidth=".5" letterSpacing=".4em" opacity=".2">
                    ✦ CLASSIFIED — OP ZULU-ECHO — AUTHORISED PERSONNEL ONLY ✦
                  </text>

                  {/* TOP LABEL */}
                  <text x="320" y="42" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="11" fontWeight="700"
                    fill="#c8ff00" letterSpacing=".45em" opacity=".9">
                    ◆  TACTICAL AIRSOFT EXPERIENCE  ◆
                  </text>

                  {/* WELCOME TO — outline style */}
                  <text x="320" y="98" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="38" fontWeight="900"
                    fill="none" stroke="#fff" strokeWidth="1.2"
                    letterSpacing=".12em" opacity=".55">
                    WELCOME TO
                  </text>
                  <text x="320" y="98" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="38" fontWeight="900"
                    fill="#fff" letterSpacing=".12em" opacity=".9">
                    WELCOME TO
                  </text>

                  {/* SWINDON — large lime stencil */}
                  <text x="320" y="155" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="72" fontWeight="900"
                    fill="none" stroke="#c8ff00" strokeWidth="2.5"
                    letterSpacing=".08em" opacity=".3">
                    SWINDON
                  </text>
                  <text x="320" y="155" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="72" fontWeight="900"
                    fill="#c8ff00" letterSpacing=".08em"
                    style={{ filter:"drop-shadow(0 0 12px rgba(200,255,0,.6))" }}>
                    SWINDON
                  </text>

                  {/* AIRSOFT — medium white */}
                  <text x="320" y="185" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="30" fontWeight="800"
                    fill="#fff" letterSpacing=".3em" opacity=".85">
                    AIRSOFT
                  </text>

                  {/* Corner bracket marks */}
                  <g stroke="#c8ff00" strokeWidth="2" fill="none" opacity=".6">
                    <polyline points="8,22 8,8 22,8"/>
                    <polyline points="618,8 632,8 632,22"/>
                    <polyline points="8,198 8,212 22,212"/>
                    <polyline points="618,212 632,212 632,198"/>
                  </g>

                </g>
              </svg>
            </div>

            <p className="hero-p">
              Experience the ultimate airsoft gameplay. From intense skirmishes to special ops events, gear up and join the action.
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary" style={{ padding:"13px 32px", fontSize:14 }} onClick={() => setPage("events")}>BOOK NOW</button>
              <button className="btn btn-ghost"   style={{ padding:"13px 28px", fontSize:14 }} onClick={() => setPage("vip")}>BECOME VIP</button>
            </div>
          </div>
        </div>
      </div>
      {/* MISSION COUNTDOWN */}
      {nextEvent && (() => {
        const target = nextEvent.date + "T" + nextEvent.time + ":00";
        return (
          <div style={{ background:"#0a0a0a", padding:"24px" }}>
            <div style={{ maxWidth:1100, margin:"0 auto", position:"relative",
              background:"#111", border:"1px solid #2a2a2a",
              padding:"0" }}>
              {/* bracket corners — top-left */}
              <div style={{ position:"absolute", top:0, left:0, width:16, height:16,
                borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
              {/* bracket corners — bottom-right */}
              <div style={{ position:"absolute", bottom:0, right:0, width:16, height:16,
                borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
              {/* MISSION BRIEFING header */}
              <div style={{ background:"var(--accent)", padding:"6px 16px", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:10, letterSpacing:".4em", color:"#000", fontWeight:800 }}>MISSION BRIEFING</span>
                <span style={{ marginLeft:"auto", fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"rgba(0,0,0,.6)", letterSpacing:".1em" }}>
                  OP-{(nextEvent.id || "ALPHA").slice(0,8).toUpperCase()}
                </span>
              </div>
              <div className="countdown-panel" style={{ border:"none", borderRadius:0, padding:"24px" }}>
                <div className="countdown-panel-info">
                  <div className="countdown-panel-label">▶ NEXT DEPLOYMENT</div>
                  <div className="countdown-panel-title">{nextEvent.title}</div>
                  <div className="countdown-panel-meta">
                    📍 {nextEvent.location}<br />
                    🗓 {fmtDate(nextEvent.date)} · {nextEvent.time} HRS GMT
                  </div>
                  <button className="btn btn-primary mt-2" style={{ padding:"9px 28px", letterSpacing:".2em" }} onClick={() => setPage("events")}>DEPLOY →</button>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end" }}>
                  <div style={{ fontSize:9, letterSpacing:".3em", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginBottom:6 }}>T-MINUS</div>
                  <div className="countdown-panel-timer">
                    <CountdownPanel target={target} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* STAT BAR */}
      <div className="hero-stats">
        <div className="hero-stats-inner">
          {[
            { num: totalPlayers  || "—", label: "ACTIVE OPERATORS" },
            { num: totalEvents   || "—", label: "SCHEDULED OPS"   },
            { num: totalBookings || "—", label: "CONFIRMED BOOTS"  },
            { num: "10%",               label: "VIP DISCOUNT"     },
          ].map(s => (
            <div key={s.label} className="hero-stat" style={{ flex:1 }}>
              <div className="hero-stat-num">{s.num}</div>
              <div className="hero-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURE STRIP */}
      <div style={{ background:"#0d0d0d", borderTop:"1px solid #1a1a1a", borderBottom:"3px solid var(--accent)" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4,1fr)", gap:0, maxWidth:1200, margin:"0 auto" }}>
          {[
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 2L4 7v9c0 7 5.4 13.5 12 15 6.6-1.5 12-8 12-15V7L16 2z" stroke="#c8ff00" strokeWidth="1.5" fill="none"/><path d="M11 16l3 3 7-7" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round"/></svg>, title:"SAFETY FIRST", desc:"Full safety briefings, quality equipment, and experienced marshals on every game day." },
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="12" cy="10" r="4" stroke="#c8ff00" strokeWidth="1.5"/><circle cx="22" cy="10" r="4" stroke="#c8ff00" strokeWidth="1.5"/><path d="M4 26c0-4.4 3.6-8 8-8h8c4.4 0 8 3.6 8 8" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round"/></svg>, title:"ALL SKILL LEVELS", desc:"Whether you're a beginner or veteran, we have game modes for everyone." },
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><polygon points="16,2 19.5,12 30,12 21.5,18.5 24.5,28.5 16,22 7.5,28.5 10.5,18.5 2,12 12.5,12" stroke="#c8ff00" strokeWidth="1.5" fill="none"/></svg>, title:"VIP BENEFITS", desc:"10% off all bookings and shop items. Free game day on your birthday. Exclusive VIP-only events and UKARA registration support." },
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="#c8ff00" strokeWidth="1.5"/><circle cx="16" cy="16" r="6" stroke="#c8ff00" strokeWidth="1.5"/><circle cx="16" cy="16" r="2" fill="#c8ff00"/><line x1="16" y1="2" x2="16" y2="6" stroke="#c8ff00" strokeWidth="1.5"/><line x1="16" y1="26" x2="16" y2="30" stroke="#c8ff00" strokeWidth="1.5"/><line x1="2" y1="16" x2="6" y2="16" stroke="#c8ff00" strokeWidth="1.5"/><line x1="26" y1="16" x2="30" y2="16" stroke="#c8ff00" strokeWidth="1.5"/></svg>, title:"RENTAL GEAR", desc:"Full kit hire available — gun, BBs, and face protection. No prior kit required to play." },
          ].map((feat, i) => (
            <div key={feat.title} className="feature-card" style={{ borderRadius:0, border:"none", borderRight: !isMobile && i < 3 ? "1px solid #2a2a2a" : "none", borderBottom: isMobile && i < 3 ? "1px solid #2a2a2a" : "none", padding:"32px 28px" }}>
              <div style={{ marginBottom:14 }}>{feat.svg}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:17, fontWeight:800, letterSpacing:".08em", color:"#fff", marginBottom:8, textTransform:"uppercase" }}>{feat.title}</div>
              <div style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7 }}>{feat.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="page-content">

        {/* UPCOMING EVENTS */}
        {data.events.filter(e => e.published && new Date(e.date + "T" + (e.endTime || e.time || "23:59") + ":00") > now).length > 0 && (
          <div style={{ marginBottom:48 }}>
            <div className="section-header">
              <div>
                <div className="section-title">UPCOMING <span>EVENTS</span></div>
                <div className="section-sub">Book your next game day</div>
              </div>
              <button className="section-link" onClick={() => setPage("events")}>VIEW ALL →</button>
            </div>
            <div className="grid-3">
              {data.events.filter(e => e.published && new Date(e.date + "T" + (e.endTime || e.time || "23:59") + ":00") > now).slice(0, 3).map(ev => {
                const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
                const total  = ev.walkOnSlots + ev.rentalSlots;
                const spotsLeft = total - booked;
                return (
                  <div key={ev.id} className="event-card" onClick={() => setPage("events")}>
                    <div className="event-banner-img" style={{ position:"relative" }}>
                      {ev.banner
                        ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" />
                        : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1400", position:"relative", overflow:"hidden" }}>
                            <svg width="80" height="80" viewBox="0 0 80 80" opacity="0.12" xmlns="http://www.w3.org/2000/svg"><ellipse cx="15" cy="12" rx="13" ry="9" fill="#c8ff00"/><ellipse cx="52" cy="28" rx="18" ry="11" fill="#c8ff00"/><ellipse cx="35" cy="52" rx="15" ry="10" fill="#c8ff00"/><ellipse cx="68" cy="62" rx="10" ry="8" fill="#c8ff00"/><ellipse cx="10" cy="60" rx="9" ry="7" fill="#c8ff00"/></svg>
                            <div style={{ position:"absolute", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".3em", color:"rgba(200,255,0,.2)", textTransform:"uppercase" }}>SA</div>
                          </div>
                      }
                      <div style={{ position:"absolute", top:12, left:12, display:"flex", flexDirection:"column", gap:4 }}>
                        <span style={{ background:"var(--accent)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>SKIRMISH</span>
                        {ev.vipOnly && <span style={{ background:"var(--gold)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>⭐ VIP ONLY</span>}
                      </div>
                    </div>
                    <div className="event-card-body">
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".06em", textTransform:"uppercase", marginBottom:10, color:"#fff" }}>{ev.title}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:12 }}>
                        <div style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="1" stroke="#6b6b6b" strokeWidth="1.5"/><path d="M5 1v4M11 1v4M1 7h14" stroke="#6b6b6b" strokeWidth="1.5" strokeLinecap="round"/></svg>{fmtDate(ev.date)}</div>
                        <div style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1C5.2 1 3 3.2 3 6c0 3.8 5 9 5 9s5-5.2 5-9c0-2.8-2.2-5-5-5z" stroke="#6b6b6b" strokeWidth="1.5"/><circle cx="8" cy="6" r="1.5" fill="#6b6b6b"/></svg>{ev.location}</div>
                        <div style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="6" r="3" stroke="#6b6b6b" strokeWidth="1.5"/><circle cx="11" cy="6" r="3" stroke="#6b6b6b" strokeWidth="1.5"/><path d="M1 14c0-2.8 2.2-4 5-4h4c2.8 0 5 1.2 5 4" stroke="#6b6b6b" strokeWidth="1.5" strokeLinecap="round"/></svg>{spotsLeft} spots left</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:17, color:"var(--accent)" }}>£{Math.min(ev.walkOnPrice, ev.rentalPrice)}</span>
                        <button className="btn btn-primary" style={{ padding:"7px 16px", fontSize:11 }}>BOOK NOW</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TACTICAL GEAR — only shown when shop is open */}
        {!data.shopClosed && data.shop.filter(p => p.published !== false && !p.hiddenFromShop).length > 0 && (
          <div style={{ marginBottom:48 }}>
            <div className="section-header">
              <div>
                <div className="section-title">TACTICAL <span>GEAR</span></div>
                <div className="section-sub">BBs, gas, pyro and more</div>
              </div>
              <button className="section-link" onClick={() => setPage("shop")}>SHOP ALL →</button>
            </div>
            <div className="grid-4">
              {data.shop.filter(p => p.published !== false && !p.hiddenFromShop).slice(0, 4).map(prod => {
                const hasV = prod.variants?.length > 0;
                const lowestVariant = hasV ? Math.min(...prod.variants.map(v => Number(v.price))) : null;
                const displayPrice = hasV
                  ? lowestVariant
                  : (prod.onSale && prod.salePrice ? prod.salePrice : prod.price);
                const priceLabel = hasV ? `From £${displayPrice}` : `£${Number(displayPrice).toFixed(2)}`;
                return (
                <div key={prod.id} className="shop-card" onClick={() => onProductClick ? onProductClick(prod) : setPage("shop")} style={{ cursor:"pointer" }}>
                  <div className="shop-img">
                    {prod.image ? <img src={prod.image} alt={prod.name} /> : <span style={{ fontSize:32, opacity:.3 }}>📦</span>}
                  </div>
                  <div className="shop-body">
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:".12em", color:"var(--muted)", textTransform:"uppercase", fontFamily:"'Barlow Condensed',sans-serif", marginBottom:4 }}>{prod.category || "GEAR"}</div>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:6, color:"#fff" }}>{prod.name}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)" }}>{priceLabel}</div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* VIP BANNER */}
      <div style={{ background:"linear-gradient(180deg,#0c1009 0%,#080d05 100%)", borderTop:"2px solid #2a3a10", borderBottom:"2px solid #2a3a10", padding:"52px 20px", position:"relative", overflow:"hidden" }}>
        {/* Scanlines */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.08) 3px,rgba(0,0,0,.08) 4px)", pointerEvents:"none" }} />
        {/* Corner brackets */}
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:24, height:24, zIndex:2,
            top:v==="top"?12:"auto", bottom:v==="bottom"?12:"auto",
            left:h==="left"?12:"auto", right:h==="right"?12:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:700, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".35em", color:"#3a5010", marginBottom:12, textTransform:"uppercase" }}>◈ — MEMBERSHIP — ◈</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(26px,5vw,44px)", letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:18 }}>
            BECOME A <span style={{ color:"#c8ff00", textShadow:"0 0 24px rgba(200,255,0,.3)" }}>VIP OPERATIVE</span>
          </div>
          <p style={{ fontSize:14, color:"#7a9a50", marginBottom:28, lineHeight:1.8, fontFamily:"'Share Tech Mono',monospace", letterSpacing:".03em" }}>
            After 3 game days, unlock VIP membership for just £40/year.<br/>10% off game days · 10% off at Airsoft Armoury UK · Free birthday game day · Exclusive events · UKARA registration support.
          </p>
          <button style={{ background:"#c8ff00", color:"#000", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".2em", padding:"13px 40px", border:"none", cursor:"pointer", textTransform:"uppercase", transition:"background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background="#d8ff33"}
            onMouseLeave={e => e.currentTarget.style.background="#c8ff00"}
            onClick={() => setPage("vip")}>▸ LEARN MORE</button>
        </div>
      </div>

      {/* PARTNER SHOP + TECH SERVICES — two column banner */}
      <div style={{ background:"#0a0d08", borderTop:"1px solid #1a2808", borderBottom:"1px solid #1a2808", padding:"36px 16px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,480px),1fr))", gap:1, background:"#1a2808" }}>

          {/* ── Column 1: Airsoft Armoury UK ── */}
          <div style={{ background:"#0a0d08", padding:"24px", display:"flex", flexDirection:"column", gap:16 }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, border:"2px solid rgba(200,255,0,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🤝</div>
              <div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010", textTransform:"uppercase", marginBottom:3 }}>OFFICIAL FIELD PARTNER</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(16px,4vw,20px)", letterSpacing:".1em", color:"#e8f0d8", textTransform:"uppercase", lineHeight:1 }}>
                  AIRSOFT <span style={{ color:"#c8ff00" }}>ARMOURY UK</span>
                </div>
              </div>
            </div>

            {/* Tagline */}
            <p style={{ fontSize:13, color:"#7a9a50", lineHeight:1.8, margin:0 }}>
              Your one-stop shop for quality airsoft gear — handpicked kit trusted by players at Swindon Airsoft. Order online and pick up on game day, no postage needed.
            </p>

            {/* Category chips */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {["AEGs & GBBs","Pistols & Sidearms","BBs & Ammo","Eye Pro & Helmets","Tactical Vests","Magazines","Accessories","Batteries & Chargers"].map(cat => (
                <span key={cat} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", color:"#5a8030", border:"1px solid #1e2e0a", padding:"3px 8px", textTransform:"uppercase" }}>
                  {cat}
                </span>
              ))}
            </div>

            {/* Key perks */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:6 }}>
              {[
                ["🚚","Click & Collect", "Order online, pick up at the field — no postage cost"],
                ["💸","Exclusive Discount", "Use code COLLECTION at checkout for your deal"],
                ["✅","Field-Tested Stock", "Kit recommended and used by our own players"],
                ["📦","Fast Dispatch",     "Orders placed before 2pm ship same day"],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{ background:"rgba(200,255,0,.03)", border:"1px solid #1a2808", padding:"10px 12px" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, color:"#c8ff00", letterSpacing:".06em", marginBottom:3 }}>{icon} {title}</div>
                  <div style={{ fontSize:11, color:"#4a6030", lineHeight:1.5 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Collection code callout */}
            <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.2)", padding:"12px 16px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
              <div style={{ flexShrink:0 }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010", marginBottom:4 }}>FIELD COLLECTION CODE</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(20px,5vw,26px)", color:"#c8ff00", letterSpacing:".15em" }}>COLLECTION</div>
              </div>
              <div style={{ fontSize:12, color:"#5a8030", lineHeight:1.6, flex:"1 1 140px" }}>
                Enter at checkout to flag your order for field collection. We'll bring it to game day — saving you postage and getting gear in your hands faster.
              </div>
            </div>

            {/* CTA */}
            <a
              href="https://www.airsoftarmoury.uk"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, background:"transparent", border:"2px solid #c8ff00", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".15em", padding:"12px 22px", textDecoration:"none", textTransform:"uppercase", transition:"background .15s, color .15s", alignSelf:"stretch" }}
              onMouseEnter={e => { e.currentTarget.style.background="#c8ff00"; e.currentTarget.style.color="#000"; }}
              onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#c8ff00"; }}
            >
              🛒 SHOP NOW — AIRSOFTARMOURY.UK
            </a>
          </div>

          {/* ── Column 2: Independent Tech Services ── */}
          <div style={{ background:"#0a0d08", padding:"24px", display:"flex", flexDirection:"column", gap:14, position:"relative" }}>
            {/* Top accent line */}
            <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,rgba(79,195,247,.4),transparent)"}}/> 
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, border:"2px solid rgba(79,195,247,.3)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#1a4a5a", textTransform:"uppercase", marginBottom:3 }}>INDEPENDENT TECHNICIAN</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(15px,3.5vw,20px)", letterSpacing:".08em", color:"#e8f0d8", textTransform:"uppercase", lineHeight:1 }}>
                  AIRSOFT <span style={{ color:"#4fc3f7" }}>TECH SERVICES (GBB/AEG)</span>
                </div>
              </div>
            </div>

            {/* Services grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:"4px 12px" }}>
              {[
                "Repairs & full diagnostics","Spring / FPS / air-seal work",
                "Inner barrel & hop-up upgrades","Feeding & power issue fixes",
                "Gearbox rebuilds & re-shims","Mag repair (GBB/AEG)",
                "General service & regrease","Full strip & inspection report",
              ].map(s => (
                <div key={s} style={{ display:"flex", alignItems:"flex-start", gap:7, fontSize:12, color:"#7ab8c8", lineHeight:1.5, padding:"3px 0" }}>
                  <span style={{ color:"#4fc3f7", fontWeight:900, flexShrink:0, marginTop:1 }}>✓</span>
                  {s}
                </div>
              ))}
            </div>

            <p style={{ fontSize:12, color:"#4a7a8a", lineHeight:1.7, margin:0 }}>
              Whether your replica is shooting weak, misfeeding, or making odd noises — it gets a full strip and inspection. You'll be contacted straight away to discuss findings before any work begins.
            </p>

            {/* Rate + CTA */}
            <div style={{ background:"rgba(79,195,247,.05)", border:"1px solid rgba(79,195,247,.15)", padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                <div>
                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(18px,4vw,22px)", color:"#4fc3f7", letterSpacing:".04em" }}>£40</span>
                  <span style={{ fontSize:11, color:"#4a7a8a", marginLeft:6, letterSpacing:".1em" }}>/ HOUR + PARTS</span>
                </div>
                <a
                  href="https://wa.me/447877731973"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display:"inline-flex", alignItems:"center", gap:7, background:"rgba(37,211,102,.12)", border:"1px solid rgba(37,211,102,.35)", color:"#25d366", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".12em", padding:"9px 16px", textDecoration:"none", textTransform:"uppercase", transition:"background .15s", borderRadius:2 }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(37,211,102,.22)"}
                  onMouseLeave={e => e.currentTarget.style.background="rgba(37,211,102,.12)"}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                  WHATSAPP
                </a>
              </div>
              <p style={{ fontSize:11, color:"#336070", lineHeight:1.6, margin:0 }}>
                💡 Please discuss your repair <em>before</em> purchasing parts — shops often don't accept returns and online specs can be misleading.
              </p>
            </div>

            {/* Independent disclaimer */}
            <div style={{ fontSize:10, color:"#2a3a3a", letterSpacing:".05em", lineHeight:1.6, borderTop:"1px solid #0d1a1a", paddingTop:10 }}>
              ⚠ This technician operates independently and is not affiliated with, employed by, or acting on behalf of Swindon Airsoft. All work is arranged directly between the customer and the technician.
            </div>

          </div>

        </div>

        {/* Responsive: stack on mobile */}
        <style>{`
          @media(max-width:700px){
            .partner-grid{grid-template-columns:1fr !important;}
          }
        `}</style>
      </div>

    </div>
  );
}

// Inline countdown for panel
function CountdownPanel({ target }) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const tick = () => setDiff(Math.max(0, new Date(target) - new Date()));
    tick();
    const countdownInterval = setInterval(tick, 1000);
    return () => clearInterval(countdownInterval);
  }, [target]);
  const cdDays = Math.floor(diff / 86400000);
  const cdHours = Math.floor((diff % 86400000) / 3600000);
  const cdMins = Math.floor((diff % 3600000) / 60000);
  const cdSecs = Math.floor((diff % 60000) / 1000);
  return (
    <>
      {[["DAYS", cdDays], ["HRS", cdHours], ["MIN", cdMins], ["SEC", cdSecs]].map(([l, n]) => (
        <div className="countdown-panel-unit" key={l}>
          <div className="countdown-panel-num">{String(n).padStart(2, "0")}</div>
          <div className="countdown-panel-lbl">{l}</div>
        </div>
      ))}
    </>
  );
}

// ── Events Page ───────────────────────────────────────────
// ── Send Ticket Email ────────────────────────────────────────
// ── EmailJS shared helper ────────────────────────────────────
// Keys must be set in .env as VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || "";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";

export { HomePage, CountdownPanel };
