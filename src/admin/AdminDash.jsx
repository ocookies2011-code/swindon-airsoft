// admin/AdminDash.jsx — dashboard overview with stats
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { GmtClock, fmtDate, sendEventReminderEmail } from "../utils";

function AdminDash({ data, setSection, isSuperAdmin }) {
  const allBookings = data.events.flatMap(e => e.bookings);
  const revenue = allBookings.filter(b => !b.squareOrderId?.startsWith("ADMIN-MANUAL-")).reduce((s, b) => s + b.total, 0);
  const checkins = allBookings.filter(b => b.checkedIn).length;
  const players = data.users.filter(u => u.role === "player").length;
  const [pendingUkara, setPendingUkara] = React.useState(0);
  React.useEffect(() => {
    const fetch = () => supabase.from("ukara_applications").select("id", { count: "exact", head: true }).eq("status", "pending")
      .then(({ count }) => setPendingUkara(count || 0)).catch(() => {});
    fetch();
    const iv = setInterval(fetch, 120000);
    return () => clearInterval(iv);
  }, []);

  const unsigned = data.users.filter(u => u.role === "player" && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear())).length;
  const activeEvents = data.events.filter(e => e.published && new Date(e.date) >= new Date()).length;
  const pendingWaivers = data.users.filter(u => u.waiverPending).length;

  // Weekly bookings bar chart
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const weekCounts = [0, 0, 0, 0, 0, 0, 0];
  allBookings.forEach(b => {
    const weekday = new Date(b.date).getDay();
    weekCounts[(weekday + 6) % 7]++;
  });
  const maxBar = Math.max(...weekCounts, 1);

  const LOW_STOCK_THRESHOLD = 5;
  const shopProducts = data.shop || [];
  const outOfStock = shopProducts.filter(p => p.stock < 1 && !p.variants?.length);
  const lowStock = shopProducts.filter(p => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD && !p.variants?.length);
  const outOfStockVariants = shopProducts.filter(p => p.variants?.length > 0 && p.variants.every(v => Number(v.stock) < 1));
  const lowStockVariants = shopProducts.filter(p => p.variants?.length > 0 && p.variants.some(v => Number(v.stock) > 0 && Number(v.stock) <= LOW_STOCK_THRESHOLD));

  // Failed payments count for dashboard alert
  const [failedPayCount, setFailedPayCount] = React.useState(0);
  React.useEffect(() => {
    supabase.from('failed_payments').select('id', { count: 'exact', head: true })
      .then(({ count }) => { if (count) setFailedPayCount(count); })
      .catch(() => {});
  }, []);

  const alerts = [
    unsigned > 0 && { msg: `${unsigned} player(s) with unsigned waivers.`, section: "unsigned-waivers", color: "red" },
    pendingWaivers > 0 && { msg: `${pendingWaivers} waiver change request(s) pending approval.`, section: "waivers", color: "red" },
    data.users.filter(u => u.deleteRequest).length > 0 && { msg: `${data.users.filter(u => u.deleteRequest).length} account deletion request(s).`, section: "players", color: "red" },
    data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length > 0 && { msg: `${data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length} VIP application(s) awaiting review.`, section: "players", color: "red" },
    outOfStock.length > 0 && { msg: outOfStock.length + " product(s) OUT OF STOCK: " + outOfStock.slice(0,3).map(p=>p.name).join(", ") + (outOfStock.length>3 ? " +" + (outOfStock.length-3) + " more" : "") + ".", section: "shop", color: "red", icon: "⚠" },
    outOfStockVariants.length > 0 && { msg: outOfStockVariants.length + " variant product(s) fully out of stock: " + outOfStockVariants.slice(0,2).map(p=>p.name).join(", ") + (outOfStockVariants.length>2 ? " +" + (outOfStockVariants.length-2) + " more" : "") + ".", section: "shop", color: "red", icon: "⚠" },
    lowStock.length > 0 && { msg: lowStock.length + " product(s) running low (≤" + LOW_STOCK_THRESHOLD + "): " + lowStock.slice(0,3).map(p=>p.name+" ("+p.stock+")").join(", ") + (lowStock.length>3 ? " +" + (lowStock.length-3) + " more" : "") + ".", section: "shop", color: "gold", icon: "⚠️" },
    lowStockVariants.length > 0 && { msg: lowStockVariants.length + " variant product(s) have low stock variants.", section: "shop", color: "gold", icon: "⚠️" },
    new Date().getMonth() === 11 && { msg: `⏰ All player waivers expire 31 Dec ${new Date().getFullYear()} — players will need to re-sign on 1 Jan.`, section: "unsigned-waivers", color: "gold", icon: "⚠" },
    failedPayCount > 0 && { msg: `${failedPayCount} failed payment record${failedPayCount !== 1 ? "s" : ""} — review in Failed Payments.`, section: "failed-payments", color: "red", icon: "💳" },
  ].filter(Boolean);

  // Quick action state
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  // Find next upcoming event (for quick reminder)
  const nextEvent = data.events
    .filter(e => e.published && new Date(e.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const sendRemindersNow = async () => {
    if (!nextEvent) return;
    setReminderBusy(true);
    setReminderResult(null);
    try {
      const bookedUsers = nextEvent.bookings.map(b => {
        const u = data.users.find(u => u.id === b.userId);
        return u ? { ...u, bookingType: b.type, bookingTotal: b.total } : null;
      }).filter(Boolean);
      if (bookedUsers.length === 0) { setReminderResult({ sent: 0, failed: 0 }); return; }
      const results = await sendEventReminderEmail({ ev: nextEvent, bookedUsers });
      setReminderResult(results);
    } catch (e) {
      setReminderResult({ error: e.message });
    } finally { setReminderBusy(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Dashboard</div><div className="page-sub">Operations overview · All times GMT</div></div>
        <GmtClock />
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 12, textTransform: "uppercase" }}>⚡ Quick Actions</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>, label: "New Event", sub: "Create & publish", action: () => setSection("events"), color: "var(--accent)", textColor: "#000" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>, label: "Players", sub: `${data.users.filter(u=>u.role==="player").length} registered`, action: () => setSection("players"), color: "rgba(79,195,247,.12)", textColor: "#4fc3f7", border: "rgba(79,195,247,.3)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, label: "Shop Orders", sub: "Manage orders", action: () => setSection("shop"), color: "rgba(200,150,0,.1)", textColor: "var(--gold)", border: "rgba(200,150,0,.3)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={unsigned > 0 ? "#f48fb1" : "#81c784"} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, label: "Waivers", sub: unsigned > 0 ? `${unsigned} unsigned` : "All signed", action: () => setSection("unsigned-waivers"), color: unsigned > 0 ? "rgba(220,50,50,.12)" : "rgba(100,180,50,.08)", textColor: unsigned > 0 ? "var(--red)" : "var(--accent)", border: unsigned > 0 ? "rgba(220,50,50,.3)" : "rgba(100,180,50,.2)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: "VIP Queue", sub: data.users.filter(u=>u.vipApplied&&u.vipStatus!=="active").length > 0 ? `${data.users.filter(u=>u.vipApplied&&u.vipStatus!=="active").length} pending` : "No pending", action: () => setSection("players"), color: "rgba(200,150,0,.1)", textColor: "var(--gold)", border: "rgba(200,150,0,.3)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1m0 8v1"/></svg>, label: "Revenue", sub: "View report", action: () => setSection("revenue"), color: "rgba(100,180,50,.08)", textColor: "var(--accent)", border: "rgba(100,180,50,.2)", superAdminOnly: true },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, label: "Settings", sub: "Site config", action: () => setSection("settings"), color: "rgba(150,150,150,.08)", textColor: "var(--muted)", border: "rgba(150,150,150,.2)" },
          ].filter(qa => !qa.superAdminOnly || isSuperAdmin).map(qa => (
            <button key={qa.label} onClick={qa.action}
              style={{ background: qa.color, border: `1px solid ${qa.border || "rgba(200,255,0,.25)"}`, padding: "12px 18px", cursor: "pointer", minWidth: 120, textAlign: "left", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = ".8"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center" }}>{qa.icon}</div>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 13, letterSpacing: ".1em", color: qa.textColor, textTransform: "uppercase" }}>{qa.label}</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{qa.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── EVENT REMINDER QUICK SEND ── */}
      {nextEvent && (
        <div style={{ background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.15)", padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 13, letterSpacing: ".12em", color: "#c8ff00", textTransform: "uppercase" }}>📅 Next Event: {nextEvent.title}</div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
              {new Date(nextEvent.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {nextEvent.bookings.length} player(s) booked
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {reminderResult && !reminderResult.error && (
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--accent)" }}>
                ✓ {reminderResult.sent} sent{reminderResult.failed > 0 ? `, ${reminderResult.failed} failed` : ""}
              </span>
            )}
            {reminderResult?.error && (
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--red)" }}>✗ {reminderResult.error}</span>
            )}
            <button className="btn btn-sm btn-primary" onClick={sendRemindersNow} disabled={reminderBusy || nextEvent.bookings.length === 0}
              style={{ fontSize: 11, letterSpacing: ".1em" }}>
              {reminderBusy ? "Sending…" : "📧 Send Reminders"}
            </button>
          </div>
        </div>
      )}

      <div className="grid-6 mb-2">
        {[
          { label: "Total Revenue", val: `£${revenue.toFixed(0)}`, sub: "From bookings", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1m0 8v1"/></svg>, color: "", superAdminOnly: true },
          { label: "Bookings", val: allBookings.length, sub: `${data.events.length} events`, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9" y1="14.5" x2="15" y2="14.5"/></svg>, color: "gold" },
          { label: "Registered Players", val: players, sub: "Active accounts", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, color: "blue" },
          { label: "Unsigned Waivers", val: unsigned, sub: unsigned > 0 ? "Action required" : "All clear", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={unsigned > 0 ? "#f48fb1" : "#81c784"} strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, color: unsigned > 0 ? "red" : "", subColor: unsigned > 0 ? "red" : "" },
          { label: "Active Events", val: activeEvents, sub: "Upcoming", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, color: "teal" },
          { label: "Check-Ins", val: checkins, sub: "All events", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>, color: "purple" },
        ].filter(s => !s.superAdminOnly || isSuperAdmin).map(({ label, val, sub, icon, color, subColor }) => (
          <div key={label} className={`stat-card ${color}`}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-val">{val}</div>
            <div className="stat-label">{label}</div>
            <div className={`stat-sub ${subColor || ""}`}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 14 }}>WEEKLY BOOKINGS</div>
          <div style={{ fontSize: 11, color: "var(--subtle)", marginBottom: 10 }}>Last 7 days</div>
          <div className="bar-chart">
            {weekCounts.map((c, i) => (
              <div key={i} className="bar" style={{ height: (c / maxBar * 72 + (c > 0 ? 8 : 4)) + "px" }} title={`${days[i]}: ${c}`} />
            ))}
          </div>
          <div className="bar-labels">{days.map((d, i) => <div key={i} className="bar-label">{d}</div>)}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 14 }}>ALERTS</div>
          {alerts.length === 0 ? (
            <div className="alert alert-green">✓ All clear — no actions required</div>
          ) : (
            alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: a.color === "gold" ? "rgba(200,150,0,.08)" : "#2d0d0d", border: `1px solid ${a.color === "gold" ? "rgba(200,150,0,.4)" : "#6b2222"}`, borderRadius: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: a.color === "gold" ? "var(--gold)" : "var(--red)" }}>{a.icon || "●"} {a.msg}</span>
                <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => setSection(a.section)}>View →</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Admin Check-In ────────────────────────────────────────
// ── Admin Bookings & Check-In (merged) ────────────────────

export { AdminDash };
