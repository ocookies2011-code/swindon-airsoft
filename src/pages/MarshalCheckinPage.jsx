// pages/MarshalCheckinPage.jsx — marshal QR check-in tool
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { QRScanner, useMobile, fmtDate, gmtShort } from "../utils";

function MarshalCheckinPage({ data, showToast, save, updateUser }) {
  const [evId, setEvId] = useState(data.events[0]?.id || "");
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  const ev = data.events.find(e => e.id === evId);
  const checkedInCount = ev ? ev.bookings.filter(b => b.checkedIn).length : 0;

  const doCheckin = async (booking, evObj) => {
    if (!booking?.id || !booking?.userId) { showToast("Invalid booking", "red"); return; }
    // Block check-in before event date
    const today = new Date().toISOString().slice(0, 10);
    if (evObj?.date && today < evObj.date) {
      showToast(`❌ Check-in not open yet — event is on ${fmtDate(evObj.date)}`, "red"); return;
    }
    setBusy(true);
    try {
      const actualCount = await api.bookings.checkIn(booking.id, booking.userId);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast(`✅ ${booking.userName} checked in! Total games: ${actualCount}`);

      // Auto-clear red card after serving their 1-game ban
      const player = data.users?.find(u => u.id === booking.userId);
      if (player?.cardStatus === "red" && updateUser) {
        await updateUser(booking.userId, { cardStatus: "none", cardReason: "" });
        showToast(`🟢 Red card cleared for ${booking.userName} — ban served.`, "gold");
      }
    } catch (e) {
      showToast("Check-in failed: " + e.message, "red");
    } finally { setBusy(false); }
  };

  const manualCheckin = () => {
    if (!ev || !manual.trim()) return;
    const found = ev.bookings.find(x =>
      x.userName.toLowerCase().includes(manual.toLowerCase()) || x.id === manual.trim()
    );
    if (!found) { showToast("Booking not found", "red"); return; }
    if (found.checkedIn) { showToast("Already checked in", "gold"); return; }
    doCheckin(found, ev); setManual("");
  };

  const onQRScan = (code) => {
    setScanning(false);
    for (const evObj of data.events) {
      const b = evObj.bookings.find(x => x.id === code);
      if (b) {
        if (b.checkedIn) { showToast(`${b.userName} already checked in`, "gold"); return; }
        doCheckin(b, evObj); return;
      }
    }
    showToast("QR code not recognised", "red");
  };

  return (
    <div className="page-content" style={{ maxWidth: 700 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".25em", color: "#3a5010", marginBottom: 4 }}>◈ — MARSHAL STATION</div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: ".1em", textTransform: "uppercase", color: "#e8f0d8" }}>PLAYER CHECK-IN</div>
      </div>

      {/* Event selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Select Event</label>
          <select value={evId} onChange={e => setEvId(e.target.value)}>
            {data.events.map(e => <option key={e.id} value={e.id}>{e.title} — {fmtDate(e.date)}</option>)}
          </select>
        </div>
        {ev && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15, color: "#9ab870" }}>
              {checkedInCount} / {ev.bookings.length} checked in
            </div>
            <div className="progress-bar" style={{ flex: 1, minWidth: 80 }}>
              <div className="progress-fill" style={{ width: ev.bookings.length ? (checkedInCount / ev.bookings.length * 100) + "%" : "0%" }} />
            </div>
          </div>
        )}
      </div>

      {/* QR Scan button */}
      <button
        className="btn btn-primary"
        style={{ width: "100%", padding: "16px", fontSize: 16, letterSpacing: ".12em", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        onClick={() => setScanning(true)}
        disabled={busy}
      >
        <span style={{ fontSize: 22 }}>📷</span> SCAN PLAYER QR CODE
      </button>

      {/* Manual search */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>Manual Check-In</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => e.key === "Enter" && manualCheckin()}
            placeholder="Player name or booking ID"
            style={{ flex: 1 }}
            autoComplete="off"
          />
          <button className="btn btn-primary" onClick={manualCheckin} disabled={!manual.trim() || busy}>Check In</button>
        </div>
      </div>

      {/* Player list */}
      {ev && ev.bookings.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 12 }}>Booking List</div>
          {ev.bookings.map(b => {
            // Build extras labels for this booking
            const extrasEntries = Object.entries(b.extras || {}).filter(([,v]) => v > 0);
            const extrasLabels = extrasEntries.map(([k, qty]) => {
              const [xId, vId] = k.includes(":") ? k.split(":") : [k, null];
              // Try to find the extra by its event_extras id
              const exDef = ev.extras?.find(e => e.id === xId);
              let exName = null;
              if (exDef) {
                // name may still be JSON from older records
                try {
                  const parsed = typeof exDef.name === "string" && exDef.name.startsWith("{")
                    ? JSON.parse(exDef.name)
                    : null;
                  exName = parsed?.n || exDef.name;
                } catch { exName = exDef.name; }
              }
              // Fallback: try to find by productId in shop data
              if (!exName) {
                const shopP = (data.shop || []).find(p => p.id === xId);
                if (shopP) {
                  exName = shopP.name;
                  if (vId) {
                    const varDef = (shopP.variants || []).find(v => v.id === vId);
                    if (varDef) exName = `${shopP.name} — ${varDef.name}`;
                  }
                }
              }
              // Last resort: show shortened ID rather than full UUID
              if (!exName) exName = `Extra (${xId.slice(0,8)})`;
              const shopP = exDef ? (data.shop || []).find(p => p.id === exDef.productId) : null;
              const varDef = vId && shopP ? (shopP.variants || []).find(vv => vv.id === vId) : null;
              if (varDef) exName = `${exName} — ${varDef.name}`;
              return `${exName} ×${qty}`;
            });

            return (
            <div key={b.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
              borderBottom: "1px solid #1a2808",
              opacity: b.checkedIn ? 0.5 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 15, color: b.checkedIn ? "#3a5010" : "#b0c090", textTransform: "uppercase", letterSpacing: ".06em" }}>{b.userName}</div>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#3a5010", marginTop: 2 }}>{b.type === "walkOn" ? "WALK-ON" : "RENTAL"} · QTY {b.qty}</div>
                {extrasLabels.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {extrasLabels.map((label, i) => (
                      <span key={i} style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#c8ff00", background: "rgba(200,255,0,.08)", border: "1px solid rgba(200,255,0,.2)", padding: "2px 6px", borderRadius: 2, whiteSpace: "nowrap" }}>
                        + {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {b.checkedIn
                ? <span className="tag tag-green" style={{ flexShrink: 0 }}>✓ IN</span>
                : <button className="btn btn-sm btn-primary" style={{ flexShrink: 0 }} onClick={() => doCheckin(b, ev)} disabled={busy}>✓ Check In</button>
              }
            </div>
            );
          })}
        </div>
      )}

      {scanning && <QRScanner onScan={onQRScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────

export { MarshalCheckinPage };
