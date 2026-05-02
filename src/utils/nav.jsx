// utils/nav.jsx — PublicNav — MILITARY THEME (all original logic preserved)
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { SA_LOGO_SRC } from "../assets/logoImage";
import { SiteSearch } from "./SiteSearch";

function PublicNav({ page, setPage, cu, setCu, setAuthModal, shopClosed, data }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef  = useRef(null);
  const staffMenuRef = useRef(null);
  const userMenuRef  = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      const inLinks = dropdownRef.current?.contains(e.target);
      const inStaff = staffMenuRef.current?.contains(e.target);
      const inUser  = userMenuRef.current?.contains(e.target);
      if (!inLinks && !inStaff && !inUser) setOpenDropdown(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allLinks = [
    { id: "home",   label: "Home",   icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id: "events", label: "Events", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M6 2v4M14 2v4M2 8h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    { id: "shop", label: "Shop", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 5h14l-1.5 9H4.5L3 5z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="17" r="1" fill="currentColor"/><circle cx="14" cy="17" r="1" fill="currentColor"/><path d="M1 2h3l1 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
      children: [
        { id: "shop",          label: "Shop",          icon: <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#c8ff00" strokeWidth="1.4"><path d="M3 5h14l-1.5 9H4.5L3 5z"/><circle cx="8" cy="17" r="1" fill="#c8ff00" stroke="none"/><circle cx="14" cy="17" r="1" fill="#c8ff00" stroke="none"/><path d="M1 2h3l1 3" strokeLinecap="round"/></svg> },
        { id: "gift-vouchers", label: "Gift Vouchers", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a000" strokeWidth="2"><rect x="2" y="9" width="20" height="13" rx="1"/><path d="M12 9V22M2 14h20M7 9c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeLinecap="round"/></svg> },
      ]
    },
    { id: "leaderboard", label: "Leaderboard", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="1" y="10" width="4" height="9" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="6" width="4" height="13" stroke="currentColor" strokeWidth="1.4"/><rect x="15" y="13" width="4" height="6" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id: "news",        label: "News",        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg> },
    { id: "gallery",     label: "Gallery",     icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4"/><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14l4-4 4 4 3-3 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    {
      id: "about", label: "About", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4"/><path d="M10 9v6M10 7v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
      children: [
        { id: "about",   label: "About Us",       icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8v.5" strokeLinecap="round"/></svg> },
        { id: "qa",      label: "Q&A / Rules",    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
        { id: "staff",   label: "Staff",          icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
        { id: "contact", label: "Contact",        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
        { id: "ukara",   label: "UKARA",          icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
        { id: "terms",   label: "Terms & Privacy",icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
      ]
    },
  ];

  const aboutPages = ["about","qa","staff","contact","terms","ukara"];
  const shopPages  = ["shop","gift-vouchers"];

  const go = (id) => {
    if (id === "admin" && cu?.role !== "admin") return;
    setPage(id);
    setDrawerOpen(false);
  };

  const signOut = () => {
    supabase.auth.signOut().catch(() => {});
    Object.keys(localStorage).filter(k => k.startsWith("sb-")).forEach(k => localStorage.removeItem(k));
    window.location.href = window.location.pathname;
  };

  return (
    <>
      {/* ── DESKTOP NAV ── */}
      <nav style={{ background:"#040604", borderBottom:"2px solid #2a4018", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 24px rgba(0,0,0,.9)" }}>
        <div style={{ display:"flex", alignItems:"center", height:68, padding:"0 24px", maxWidth:1280, margin:"0 auto", gap:8 }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", marginRight:16, flexShrink:0, cursor:"pointer" }} onClick={() => go("home")}>
            <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:52, width:"auto", objectFit:"contain", filter:"drop-shadow(0 0 6px rgba(200,255,0,.2))" }} />
          </div>

          {/* Desktop links */}
          <div className="pub-nav-links" ref={dropdownRef} style={{ flex:"0 0 auto", overflow:"visible" }}>
            {allLinks.map(l => (
              l.children ? (
                <div key={l.id} className="pub-nav-link-wrap">
                  <button
                    className={`pub-nav-link ${(l.id === "about" ? aboutPages : shopPages).includes(page) ? "active" : ""}`}
                    onClick={() => setOpenDropdown(v => v === l.id ? null : l.id)}
                  >
                    {l.label} <span style={{ fontSize:9, opacity:.6, marginLeft:2 }}>{openDropdown === l.id ? "▴" : "▾"}</span>
                  </button>
                  <div className="pub-nav-dropdown" style={openDropdown === l.id ? { display:"block" } : {}}>
                    {l.children.map(c => (
                      <button key={c.id} className={`pub-nav-dropdown-item ${page === c.id ? "active" : ""}`}
                        onClick={() => { go(c.id); setOpenDropdown(null); }}>
                        {c.icon} {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button key={l.id} className={`pub-nav-link ${page === l.id ? "active" : ""}`} onClick={() => go(l.id)}>
                  {l.label}
                </button>
              )
            ))}
          </div>

          {/* Global search — takes remaining space between links and auth buttons */}
          <div className="pub-nav-search" style={{ flex:"1 1 auto", maxWidth:280, minWidth:120, margin:"0 12px" }}>
            <SiteSearch data={data} setPage={setPage} />
          </div>

          {/* Desktop actions */}
          <div style={{ flex:"0 0 auto", display:"flex", gap:8, alignItems:"center" }}>
            {cu ? (
              <>
                {/* Staff/Marshal dropdown — shown to admins and marshals */}
                {/* User profile dropdown */}
                <div style={{ position:"relative" }} ref={userMenuRef}>
                  <button
                    onClick={() => setOpenDropdown(v => v === "user-menu" ? null : "user-menu")}
                    style={{ background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.25)", color:"var(--accent)", display:"inline-flex", alignItems:"center", gap:6, padding:"5px 12px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase" }}>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    {cu.name.split(" ")[0]}
                    <span style={{ fontSize:9, opacity:.6 }}>{openDropdown === "user-menu" ? "▴" : "▾"}</span>
                  </button>
                  {openDropdown === "user-menu" && (
                    <div style={{ position:"absolute", top:"calc(100% + 6px)", right:0, background:"#0d1209", border:"1px solid #2a4018", minWidth:180, zIndex:200, boxShadow:"0 8px 24px rgba(0,0,0,.8)" }}>
                      <div style={{ padding:"10px 16px 8px", borderBottom:"1px solid #1a2808" }}>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13, color:"#fff", letterSpacing:".06em" }}>{cu.name}</div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--muted)", marginTop:2 }}>{cu.email}</div>
                      </div>
                      <button className="pub-nav-dropdown-item" style={{ width:"100%", display:"flex", alignItems:"center", gap:10, color:"#c8d8f8" }} onClick={() => { go("profile"); setOpenDropdown(null); }}>
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="4" stroke="#4fc3f7" strokeWidth="1.4"/><path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#4fc3f7" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        My Profile
                      </button>
                      {cu.role === "admin" && (
                        <button className="pub-nav-dropdown-item" style={{ width:"100%", display:"flex", alignItems:"center", gap:10, color:"#c8d8f8" }} onClick={() => { go("admin"); setOpenDropdown(null); }}>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="#4fc3f7" strokeWidth="1.4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" stroke="#4fc3f7" strokeWidth="1.4" strokeLinecap="round"/></svg>
                          Admin Panel
                        </button>
                      )}
                      {(cu.canMarshal || cu.role === "admin") && (
                        <button className="pub-nav-dropdown-item" style={{ width:"100%", display:"flex", alignItems:"center", gap:10, color:"#a5d6a7" }} onClick={() => { go("marshal-schedule"); setOpenDropdown(null); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14l2 2 4-4"/></svg>
                          Marshal Schedule
                        </button>
                      )}
                      {(cu.canMarshal || cu.role === "admin") && (
                        <button className="pub-nav-dropdown-item" style={{ width:"100%", display:"flex", alignItems:"center", gap:10, color:"#a5d6a7" }} onClick={() => { go("marshal"); setOpenDropdown(null); }}>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="1.5" stroke="#00c864" strokeWidth="1.4"/><circle cx="10" cy="11" r="3" stroke="#00c864" strokeWidth="1.4"/><path d="M7 5l1-2h4l1 2" stroke="#00c864" strokeWidth="1.4" strokeLinecap="round"/></svg>
                          Marshal Check-In
                        </button>
                      )}
                      <div style={{ borderTop:"1px solid #1a2808", marginTop:4, paddingTop:4 }}>
                        <button className="pub-nav-dropdown-item" style={{ width:"100%", display:"flex", alignItems:"center", gap:10, color:"#ef5350" }} onClick={signOut}>
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13 3h4v14h-4M9 14l4-4-4-4M13 10H4" stroke="#ef5350" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button className="btn btn-sm btn-ghost" onClick={() => setAuthModal("login")} style={{ fontSize:12, letterSpacing:".12em" }}>LOGIN</button>
                <button className="btn btn-sm btn-primary" onClick={() => setAuthModal("register")} style={{ fontSize:12, letterSpacing:".12em" }}>REGISTER</button>
              </>
            )}
          </div>

          {/* Hamburger */}
          <button className="pub-nav-hamburger" onClick={() => setDrawerOpen(true)}>☰</button>
        </div>
      </nav>

      {/* ── MOBILE DRAWER ── */}
      <div className={`pub-nav-drawer ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)}>
        <div className="pub-nav-drawer-panel" onClick={e => e.stopPropagation()}>
          <div className="pub-nav-drawer-logo" style={{ display:"flex", alignItems:"center" }}>
            <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:52, width:"auto", objectFit:"contain" }} />
          </div>

          {/* Mobile search */}
          <div style={{ padding:"8px 16px 12px", borderBottom:"1px solid #1a2808" }}>
            <SiteSearch data={data} setPage={(p) => { setPage(p); setDrawerOpen(false); }} />
          </div>
          {allLinks.map(l => (
            l.children ? (
              <div key={l.id}>
                <div style={{ padding:"10px 20px 4px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:9, fontWeight:600, letterSpacing:".25em", color:"var(--muted)", textTransform:"uppercase", display:"flex", alignItems:"center", gap:6 }}>
                  {l.icon} {l.label}
                </div>
                {l.children.map(c => (
                  <button key={c.id} className={`pub-nav-drawer-link ${page === c.id ? "active" : ""}`} onClick={() => go(c.id)} style={{ paddingLeft:32 }}>
                    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, width:20, display:"inline-block" }}>{c.icon}</span> {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <button key={l.id} className={`pub-nav-drawer-link ${page === l.id ? "active" : ""}`} onClick={() => go(l.id)}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}>{l.icon}</span> {l.label}
              </button>
            )
          ))}
          <hr className="pub-nav-drawer-divider" />
          {cu ? (
            <>
              {cu.role === "admin" && (
                <button className="pub-nav-drawer-link" onClick={() => go("admin")}>
                  <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Admin Panel
                </button>
              )}
              {(cu.canMarshal || cu.role === "admin") && (
                <button className="pub-nav-drawer-link" style={{ color:"#a5d6a7" }} onClick={() => go("marshal-schedule")}>
                  <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14l2 2 4-4"/></svg></span> Marshal Schedule
                </button>
              )}
              {(cu.canMarshal || cu.role === "admin") && (
                <button className="pub-nav-drawer-link" style={{ color:"#00c864" }} onClick={() => go("marshal")}>
                  <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M7 5l1-2h4l1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Marshal Check-In
                </button>
              )}
              <button className="pub-nav-drawer-link" onClick={() => go("profile")}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> {cu.name}
              </button>
              <button className="pub-nav-drawer-link" style={{ color:"var(--red)" }} onClick={signOut}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13 3h4v14h-4M9 14l4-4-4-4M13 10H4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span> Sign Out
              </button>
            </>
          ) : (
            <>
              <button className="pub-nav-drawer-link" onClick={() => { setAuthModal("login"); setDrawerOpen(false); }}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="4" y="8" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M7 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Login
              </button>
              <button className="pub-nav-drawer-link" onClick={() => { setAuthModal("register"); setDrawerOpen(false); }}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M14 14l4 4M2 18c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M15 7v4M17 9h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Register
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {[
            { id:"home",        icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.4"/></svg>, label:"Home" },
            { id:"events",      icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M6 2v4M14 2v4M2 8h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, label:"Events" },
            { id:"shop",        icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14l-1.5 9H4.5L3 5z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="17" r="1" fill="currentColor"/><circle cx="14" cy="17" r="1" fill="currentColor"/><path d="M1 2h3l1 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, label:"Shop" },
            { id:"leaderboard", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="1" y="10" width="4" height="9" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="6" width="4" height="13" stroke="currentColor" strokeWidth="1.4"/><rect x="15" y="13" width="4" height="6" stroke="currentColor" strokeWidth="1.4"/></svg>, label:"Ranks" },
            { id:"news", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>, label:"News" },
            { id:"profile",     icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, label:"Profile" },
          ].map(b => (
            <button key={b.id} className={`bottom-nav-btn ${page === b.id ? "active" : ""}`} onClick={() => go(b.id)}>
              <span className="bottom-nav-icon" style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>{b.icon}</span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

export { PublicNav };
