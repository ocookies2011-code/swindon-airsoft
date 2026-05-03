// admin/AdminPanel.jsx — sidebar shell + section routing
// Imports all admin sub-panels and re-exports public-facing pages
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { GmtClock } from "../utils";
import { SA_LOGO_SRC } from "../assets/logoImage";

import { AdminDash }               from "./AdminDash";
import { AdminEventsBookings }     from "./AdminEventsBookings";
import { AdminPlayers }            from "./AdminPlayers";
import { AdminOrdersInline }       from "./AdminOrders";
import { AdminShop }               from "./AdminShop";
import { AdminWaivers }            from "./AdminWaivers";
import { AdminUkaraApplications }  from "./AdminUkaraApplications";
import { AdminDiscountCodes }      from "./AdminDiscountCodes";
import { AdminGiftVouchers }       from "./AdminGiftVouchers";
import { AdminRevenue }            from "./AdminRevenue";
import { AdminGallery }            from "./AdminGallery";
import { AdminQA }                 from "./AdminQA";
import { AdminStaff }              from "./AdminStaff";
import { AdminMarshalSchedule }    from "./AdminMarshalSchedule";
import { AdminContactDepts }       from "./AdminContactDepts";
import { AdminLeaderboard }        from "./AdminLeaderboard";
import { AdminMessages }           from "./AdminMessages";
import { AdminCash }               from "./AdminCash";
import { AdminSettings }           from "./AdminSettings";
import { AdminVisitorStats }       from "./AdminVisitorStats";
import { AdminAuditLog }           from "./AdminAuditLog";
import { AdminCheatReports }       from "./AdminCheatReports";
import { AdminNews }              from "./AdminNews";
import { EmailTestCard }           from "./EmailTestCard";

// Public-facing pages that live in /pages but were originally in AdminPanel.jsx
import { AboutPage }       from "../pages/AboutPage";
import { StaffPage }       from "../pages/StaffPage";
import { ContactPage }     from "../pages/ContactPage";
import { PlayerWaitlist }  from "../pages/PlayerWaitlist";
import { TermsPage }       from "../pages/TermsPage";

const SUPERADMIN_EMAIL = "c-pullen@outlook.com";

function AdminPanel({ data, cu, save, updateUser, updateEvent, showToast, setPage, refresh }) {
  const getInitialSection = () => {
    const parts = window.location.hash.replace("#","").split("/");
    const ADMIN_SECTIONS = ["dashboard","events","waivers","unsigned-waivers","players","shop",
      "leaderboard-admin","revenue","visitor-stats","gallery-admin","qa-admin","staff-admin",
      "contact-admin","messages","news-admin","marshal-admin","cash","discount-codes","gift-vouchers","settings","audit-log","cheat-reports","ukara-admin"];
    return parts[0] === "admin" && ADMIN_SECTIONS.includes(parts[1]) ? parts[1] : "dashboard";
  };
  const [section, setSectionState] = useState(getInitialSection);
  const setSection = (s) => {
    setSectionState(s);
    window.location.hash = "admin/" + s;
  };

  const isMain = cu.role === "admin";
  const isSuperAdmin = cu.email === SUPERADMIN_EMAIL;

  const hasPerm = (p) => isMain || cu.permissions?.includes(p) || cu.permissions?.includes("all");

  const pendingWaivers = data.users.filter(u => u.waiverPending).length;
  const pendingVip = data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length;  const deleteReqs = data.users.filter(u => u.deleteRequest).length;
  const [pendingOrders, setPendingOrders] = useState(0);
  useEffect(() => {
    const fetchPending = () =>
      supabase.from("shop_orders").select("id", { count: "exact", head: true })
        .not("status", "in", "(completed,cancelled)")
        .then(({ count }) => setPendingOrders(count || 0))
        .catch(() => {});
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchPending(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const [pendingReports, setPendingReports] = useState(0);
  useEffect(() => {
    const fetchReports = () => {
      supabase.from("cheat_reports").select("id", { count: "exact", head: true }).eq("status", "pending")
        .then(({ count }) => setPendingReports(count || 0))
        .catch(() => {});
    };
    fetchReports();
    const onVisible = () => { if (document.visibilityState === "visible") fetchReports(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const [pendingUkara, setPendingUkara] = React.useState(0);
  React.useEffect(() => {
    const fetch = () => supabase.from("ukara_applications").select("id", { count: "exact", head: true }).eq("status", "pending")
      .then(({ count }) => setPendingUkara(count || 0)).catch(() => {});
    fetch();
    const iv = setInterval(fetch, 120000);
    return () => clearInterval(iv);
  }, []);

  const unsigned = data.users.filter(u => u.role === "player" && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear())).length;
  const _now = new Date();
  const _activeEvts = data.events.filter(e => e.published && new Date(e.date + "T" + (e.endTime || e.time || "23:59") + ":00") > _now);
  const upcomingEvents = _activeEvts.length;
  const totalBookings  = _activeEvts.flatMap(e => e.bookings).reduce((sum, b) => sum + (b.qty || 1), 0);
  const checkins = data.events.flatMap(e => e.bookings).filter(b => b.checkedIn).length;

  const NAV = [
    // ── OVERVIEW ─────────────────────────────────────────
    { id: "dashboard",        label: "Dashboard",         icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, group: "OVERVIEW" },

    // ── OPERATIONS ───────────────────────────────────────
    { id: "events",            label: "Events & Bookings", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, badge: totalBookings, badgeColor: "blue", group: "OPERATIONS" },
    { id: "players",           label: "Players",           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>, badge: (pendingWaivers + pendingVip + deleteReqs) || null, badgeColor: pendingWaivers > 0 ? "gold" : pendingVip > 0 ? "gold" : "", group: "OPERATIONS" },
    { id: "cheat-reports",     label: "Cheat Reports",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, badge: pendingReports || null, badgeColor: "red", group: "OPERATIONS" },
    { id: "ukara-admin",       label: "UKARA",             icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, badge: pendingUkara || null, badgeColor: "purple", group: "OPERATIONS" },
    { id: "staff-admin",       label: "Staff",             icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, group: "OPERATIONS" },

    // ── COMMERCE ─────────────────────────────────────────
    { id: "shop",              label: "Shop",              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, badge: pendingOrders, badgeColor: "red", group: "COMMERCE" },
    { id: "discount-codes",    label: "Discount Codes",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>, group: "COMMERCE" },
    { id: "gift-vouchers",      label: "Gift Vouchers",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8a000" strokeWidth="2"><rect x="2" y="9" width="20" height="13" rx="1"/><path d="M12 9V22M2 14h20M7 9c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeLinecap="round"/></svg>, group: "COMMERCE" },

    // ── CONTENT ──────────────────────────────────────────
    { id: "gallery-admin",     label: "Gallery",           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, group: "CONTENT" },
    { id: "qa-admin",          label: "Q&A",               icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, group: "CONTENT" },
    { id: "messages",          label: "Site Messages",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f48fb1" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>, group: "CONTENT" },
    { id: "news-admin",        label: "News & Updates",   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>, group: "CONTENT" },
    { id: "marshal-admin",     label: "Marshal Schedule",  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14l2 2 4-4"/></svg>, group: "CONTENT" },
    { id: "contact-admin",     label: "Contact Depts",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, group: "CONTENT" },

    // ── ANALYTICS ────────────────────────────────────────
    { id: "leaderboard-admin", label: "Leaderboard",       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><polyline points="18 20 18 10"/><polyline points="12 20 12 4"/><polyline points="6 20 6 14"/></svg>, group: "ANALYTICS" },
    { id: "visitor-stats",     label: "Visitor Stats",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, group: "ANALYTICS" },
    ...(isSuperAdmin ? [{ id: "revenue", label: "Revenue", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1m0 8v1"/></svg>, group: "ANALYTICS" }] : []),

    // ── SYSTEM ───────────────────────────────────────────
    { id: "settings",          label: "Settings",          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, group: "SYSTEM" },
    // { id: "cash", label: "Cash Sales", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>, group: "COMMERCE" }, // hidden — terminal sales now go to shop_orders automatically
    ...(isSuperAdmin ? [{ id: "audit-log", label: "Audit Log", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef9a9a" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>, group: "SYSTEM" }] : []),
  ];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-shell">
      {/* Mobile overlay */}
      <div className={`admin-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sb-logo">
          <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:40, width:"auto", objectFit:"contain", display:"block" }} />
          <div className="sb-time"><GmtClock /></div>
        </div>
        <div style={{ padding: "8px 8px 0" }}>
          {NAV.map((item, idx) => {
            const showGroup = item.group && (idx === 0 || NAV[idx - 1]?.group !== item.group);
            return (
              <div key={item.id}>
                {showGroup && <div className="sb-label" style={{ marginTop: idx > 0 ? 16 : 8 }}>{item.group}</div>}
                <div className={`sb-item ${section === item.id ? "active" : ""}`} onClick={() => { setSection(item.id); setSidebarOpen(false); }}>
                  <span className="sb-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge > 0 && <span className={`sb-badge ${item.badgeColor || ""}`}>{item.badge}</span>}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 16, padding: "0 0 16px" }}>
            <div className="sb-label">SYSTEM</div>
            <div className="sb-item" onClick={() => setPage("home")}>
              <span className="sb-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef9a9a" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span><span>Exit Admin</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen(v => !v)} style={{ background: sidebarOpen ? "var(--accent)" : "none", border: "1px solid var(--border)", color: sidebarOpen ? "#000" : "var(--text)", padding: "6px 12px", borderRadius: 4, fontSize: 18, lineHeight: 1, cursor: "pointer", transition: "all .15s" }}>☰</button>
            <div style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--muted)" }}>⚙ ADMIN</span>
              <span style={{ color: "var(--border)" }}>·</span>
              <span style={{ color: "var(--text)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".06em", textTransform: "uppercase" }}>{NAV.find(n => n.id === section)?.label || section}</span>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span className="admin-hide-mobile" style={{ fontSize: 12 }}><GmtClock /></span>
            <button className="btn btn-sm btn-ghost" onClick={() => setPage("home")}>← Site</button>
          </div>
        </div>
        <div className="admin-content">
          {section === "dashboard" && <AdminDash data={data} setSection={setSection} isSuperAdmin={isSuperAdmin} />}
          <div style={{ display: section === "events" ? "block" : "none" }}><AdminEventsBookings data={data} save={save} updateEvent={updateEvent} updateUser={updateUser} showToast={showToast} cu={cu} /></div>
          {section === "waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} cu={cu} />}
          {section === "unsigned-waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} filterUnsigned cu={cu} />}
          <div style={{ display: section === "players" ? "block" : "none" }}><AdminPlayers data={data} save={save} updateUser={updateUser} showToast={showToast} cu={cu} /></div>
          {section === "cheat-reports" && <AdminCheatReports data={data} showToast={showToast} cu={cu} />}
          <div style={{ display: section === "shop" ? "block" : "none" }}><AdminShop data={data} save={save} showToast={showToast} cu={cu} /></div>
          {section === "leaderboard-admin" && <AdminLeaderboard data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "revenue" && isSuperAdmin && <AdminRevenue data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "visitor-stats" && <AdminVisitorStats />}
          {section === "gallery-admin" && <AdminGallery data={data} save={save} showToast={showToast} />}
          {section === "qa-admin" && <AdminQA data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "staff-admin" && <AdminStaff showToast={showToast} cu={cu} />}
          {section === "contact-admin" && <AdminContactDepts showToast={showToast} save={save} cu={cu} />}
          {section === "messages" && <AdminMessages data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "news-admin" && <AdminNews showToast={showToast} cu={cu} />}
          {section === "marshal-admin" && <AdminMarshalSchedule data={data} cu={cu} showToast={showToast} />}
          {section === "cash" && <AdminCash data={data} cu={cu} showToast={showToast} />}
          {section === "discount-codes" && <AdminDiscountCodes data={data} showToast={showToast} cu={cu} />}
          {section === "gift-vouchers" && <AdminGiftVouchers showToast={showToast} cu={cu} />}
          {section === "settings" && <AdminSettings showToast={showToast} cu={cu} />}
          {section === "audit-log" && isSuperAdmin && <AdminAuditLog />}
          {section === "ukara-admin" && <AdminUkaraApplications showToast={showToast} cu={cu} />}
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────


export {
  AdminPanel,
  // Re-export public pages for AppInner compatibility
  AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage,
};
