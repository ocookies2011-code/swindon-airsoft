// pages/ProfilePage.jsx — authenticated player profile + tabs
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { DesignationInsignia, QRCode, RankInsignia, SquareCheckoutButton, WaiverModal, fmtDate, fmtErr, gmtShort, loadSquareConfig, sendCancellationEmail, sendWaitlistNotifyEmail, sendWelcomeEmail, uid, useMobile } from "../utils";
import { LoadoutTab } from "./LoadoutTab";
import { ReportCheatTab } from "./ReportCheatTab";
import { PlayerOrders } from "./PlayerOrders";
import { PlayerWaitlist } from "./PlayerWaitlist";

function ProfilePage({ data, cu, updateUser, showToast, save, setPage }) {
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="profile" && ["profile","waiver","bookings","orders","waitlist","vip","loadout","report"].includes(p[1]) ? p[1] : "profile";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "profile/" + t; };

  // Parse stored address string back into structured fields
  const parseAddress = (addr) => {
    const parts = (addr || "").split("\n");
    return {
      line1:    parts[0] || "",
      line2:    parts[1] || "",
      city:     parts[2] || "",
      county:   parts[3] || "",
      postcode: parts[4] || "",
    };
  };
  const composeAddress = (a) =>
    [a.line1, a.line2, a.city, a.county, a.postcode].map(s => s.trim()).filter(Boolean).join("\n");

  const [edit, setEdit] = useState({
    name: cu.name,
    callsign: cu.callsign || "",
    nationality: cu.nationality || 'GB',
    email: cu.email || "",
    phone: cu.phone || "",
    ...parseAddress(cu.address),
  });
  const [emailSaving, setEmailSaving] = useState(false);

  const changeEmail = async () => {
    if (!edit.email || !edit.email.includes("@")) { showToast("Valid email required", "red"); return; }
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: edit.email });
      if (error) throw error;
      await updateUser(cu.id, { email: edit.email });
      showToast("Check your new email for a confirmation link!");
    } catch (e) {
      showToast("Email update failed: " + e.message, "red");
    } finally { setEmailSaving(false); }
  };
  const setAddr = (field, val) => setEdit(p => ({ ...p, [field]: val }));

  const [waiverModal, setWaiverModal] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const waiverValid = (cu.waiverSigned === true && cu.waiverYear === new Date().getFullYear()) || cu.role === "admin";
  const myBookings = data.events.flatMap(ev => ev.bookings.filter(b => b.userId === cu.id).map(b => ({ ...b, eventTitle: ev.title, eventDate: ev.date, eventObj: ev })));

  // Count actual checked-in games from booking records — source of truth
  const actualGamesAttended = myBookings.filter(b => b.checkedIn).length;

  // ── Booking cancellation ──
  const [cancelModal, setCancelModal] = useState(null); // booking object
  const [cancelling, setCancelling] = useState(false);

  const doCancel = async () => {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      const b = cancelModal;
      const eventDate = new Date(b.eventDate);
      const hoursUntil = (eventDate - new Date()) / 36e5;
      const isRental = b.type === "rental";
      const within48 = hoursUntil < 48;
      const within24 = hoursUntil < 24;

      // 24h no-cancel guard — should be blocked by UI but double-check server-side
      if (within24) {
        showToast("Cancellations are not permitted within 24 hours of the event.", "red");
        setCancelling(false);
        return;
      }

      // Calculate refund
      let refundAmount = Number(b.total);
      if (isRental) refundAmount = refundAmount * 0.9; // 10% charge on rentals
      refundAmount = Math.round(refundAmount * 100) / 100;

      if (within48) {
        // Within 48h (but outside 24h) — always give credits
        const newCredits = (Number(cu.credits) || 0) + refundAmount;
        await supabase.from("profiles").update({ credits: newCredits }).eq("id", cu.id);
        updateUser(cu.id, { credits: newCredits });
      } else if (b.squareOrderId) {
        // Outside 48h — try Square refund via edge function
        try {
          const locationId = await api.settings.get("square_location_id");
          await squareRefund({ squarePaymentId: b.squareOrderId, amount: refundAmount, locationId });
        } catch {
          // Square refund failed — fall back to credits
          const newCredits = (Number(cu.credits) || 0) + refundAmount;
          await supabase.from("profiles").update({ credits: newCredits }).eq("id", cu.id);
          updateUser(cu.id, { credits: newCredits });
        }
      } else {
        // No Square payment ID (manual/admin booking) — give credits
        const newCredits = (Number(cu.credits) || 0) + refundAmount;
        await supabase.from("profiles").update({ credits: newCredits }).eq("id", cu.id);
        updateUser(cu.id, { credits: newCredits });
      }

      // Delete booking
      await api.bookings.delete(b.id);
      save({ events: data.events.map(ev => ({ ...ev, bookings: ev.bookings.filter(bk => bk.id !== b.id) })) });

      // Create a 30-min hold for the first person on the waitlist for this ticket type
      try {
        const freedType = b.type;
        const wl = await waitlistApi.getByEvent(b.eventObj.id);
        const first = wl.find(w => w.ticket_type === freedType);
        if (first?.user_email) {
          // Create the hold so the slot is reserved for them for 30 minutes
          await holdApi.createHold({
            eventId: b.eventObj.id,
            ticketType: freedType,
            userId: first.user_id,
            userName: first.user_name,
            userEmail: first.user_email,
          });
          sendWaitlistNotifyEmail({ toEmail: first.user_email, toName: first.user_name, ev: b.eventObj, ticketType: freedType }).catch(() => {});
        }
      } catch { /* non-fatal */ }

      const isCredits = within48 || !b.squareOrderId;
      showToast(
        isRental && within48
          ? `Booking cancelled. £${refundAmount.toFixed(2)} game credits added (10% rental fee applied, within 48h).`
          : isRental
          ? `Booking cancelled. £${refundAmount.toFixed(2)} refunded (10% rental fee applied).`
          : within48
          ? `Booking cancelled. £${refundAmount.toFixed(2)} added as game credits (within 48h of event).`
          : `Booking cancelled. £${refundAmount.toFixed(2)} refunded.`
      );

      // Send cancellation confirmation email (fire & forget)
      if (cu.email) {
        sendCancellationEmail({
          cu,
          eventTitle: b.eventTitle,
          eventDate:  b.eventDate,
          ticketType: b.type,
          refundAmount,
          isCredits,
          isRental,
        }).then(() => showToast("📧 Cancellation confirmation sent.")).catch(() => {});
      }

      setCancelModal(null);
    } catch (e) {
      showToast("Cancellation failed: " + (e.message || String(e)), "red");
    } finally { setCancelling(false); }
  };
  // Use the higher of stored count vs actual (in case bookings haven't all loaded)
  const gamesAttended = Math.max(cu.gamesAttended || 0, actualGamesAttended);
  const canApplyVip = gamesAttended >= 3 && cu.vipStatus === "none" && !cu.vipApplied;

  const [picUploading, setPicUploading] = useState(false);
  const handlePic = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setPicUploading(true);
    try {
      const url = await api.profiles.uploadProfilePic(cu.id, file);
      updateUser(cu.id, { profilePic: url });
      showToast("Profile picture updated!");
    } catch (err) {
      showToast("Upload failed: " + err.message, "red");
    } finally { setPicUploading(false); }
  };

  const saveProfile = async () => {
    try {
      await updateUser(cu.id, {
        name:        edit.name,
        callsign:    edit.callsign,
        phone:       edit.phone,
        address:     composeAddress(edit),
        nationality: edit.nationality,
      });
      showToast("Profile updated!");
    } catch(e) {
      showToast("Failed to save: " + (e.message || "unknown error"), "red");
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px solid var(--accent)", overflow: "hidden", background: "var(--bg4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>
              {cu.profilePic ? <img src={cu.profilePic} onError={e=>{e.target.style.display='none';}} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : cu.name[0]}
            </div>
            <label style={{ position: "absolute", bottom: 0, right: 0, background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: picUploading ? "wait" : "pointer", fontSize: 12, opacity: picUploading ? 0.6 : 1 }}>
              {picUploading ? "..." : <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M7 5l1-2h4l1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}<input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePic} disabled={picUploading} />
            </label>
          </div>
          <div>
            <div className="page-title">{cu.name}</div>
            <div className="gap-2 mt-1">
              {cu.vipStatus === "active" && <span className="tag tag-gold">⭐ VIP</span>}
              <span className="tag tag-green">{gamesAttended} Games</span>
              {cu.credits > 0 && <span className="tag tag-blue">£{cu.credits} Credits</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="nav-tabs profile-tabs">
        {[["profile","👤 Profile"],["waiver","📋 Waiver"],["bookings","🎟 Bookings"],...(!data.shopClosed ? [["orders","📦 Orders"]] : []),["waitlist","🔔 Waitlist"],["vip","⭐ VIP"],["loadout","🎒 Loadout"],["report","🚩 Report Player"]].map(([t, label]) => (
          <button key={t} className={`nav-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      <select
        className="profile-tab-select"
        value={tab}
        onChange={e => setTab(e.target.value)}
      >
        <option value="profile">👤 Profile</option>
        <option value="waiver">📋 Waiver</option>
        <option value="bookings">🎟 Bookings</option>
        {!data.shopClosed && <option value="orders">📦 Orders</option>}
        <option value="waitlist">🔔 Waitlist</option>
        <option value="vip">⭐ VIP</option>
        <option value="loadout">🎒 Loadout</option>
        <option value="report">🚩 Report Player</option>
      </select>

      {tab === "profile" && (
        <div className="card">
          {/* Card status — always visible */}
          {(() => {
            const cs = cu.cardStatus || "none";
            const isGreen = cs === "none";
            return (
              <div style={{
                background: isGreen ? "rgba(200,255,0,.07)" : cs === "yellow" ? "rgba(200,160,0,.1)" : cs === "red" ? "rgba(220,30,30,.1)" : "rgba(60,60,60,.2)",
                border: `1px solid ${isGreen ? "rgba(200,255,0,.25)" : cs === "yellow" ? "rgba(200,160,0,.45)" : cs === "red" ? "rgba(220,30,30,.45)" : "#555"}`,
                padding: "14px 16px", marginBottom: 20, borderRadius: 4,
                display: "flex", alignItems: "flex-start", gap: 12
              }}>
                <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
                  {isGreen ? "🟢" : cs === "yellow" ? "🟡" : cs === "red" ? "🔴" : "⚫"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: ".06em", marginBottom: 4,
                    color: isGreen ? "var(--accent)" : cs === "yellow" ? "var(--gold)" : cs === "red" ? "var(--red)" : "#ccc" }}>
                    {isGreen       && "Green Card — All Clear"}
                    {cs === "yellow" && "Yellow Card — Formal Warning"}
                    {cs === "red"    && "Red Card — Temporary Ban"}
                    {cs === "black"  && "Black Card — Account Suspended"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
                    {isGreen       && "Your account is in good standing. You are welcome to book events."}
                    {cs === "yellow" && "You have received a formal warning from staff. Please review site rules — continued violations may result in a Red Card ban."}
                    {cs === "red"    && "You have been issued a 1 game day ban. Event booking is currently disabled. Please contact us to resolve this."}
                    {cs === "black"  && "Your account has been suspended. Please contact the site owner directly to discuss reinstatement."}
                    {!isGreen && cu.cardReason && (
                      <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(0,0,0,.25)", borderRadius: 3, fontStyle: "italic" }}>
                        Reason: {cu.cardReason}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="form-row">
            <div className="form-group"><label>Full Name</label><input value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="form-group"><label>Phone</label><input value={edit.phone} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} placeholder="07700 000000" /></div>
          </div>
          {/* Date of Birth — read-only, taken from signed waiver — cannot be changed to prevent gaming birthday perk */}
          {cu.waiverData?.dob && (
            <div className="form-group">
              <label>Date of Birth</label>
              <input type="date" value={cu.waiverData.dob} readOnly disabled style={{ maxWidth: 200, opacity: 0.6, cursor: "not-allowed" }} />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Taken from your signed waiver. Used for age verification and your VIP birthday free game day perk.</div>
            </div>
          )}
          <div className="form-group">
            <label>Player Callsign <span style={{ color:"var(--muted)", fontWeight:400, letterSpacing:0, textTransform:"none" }}>(shown on leaderboard instead of your real name)</span></label>
            <input
              value={edit.callsign}
              onChange={e => setEdit(p => ({ ...p, callsign: e.target.value }))}
              placeholder="e.g. Ghost, Viper, Sgt. Chaos…"
              maxLength={30}
              style={{ maxWidth:320 }}
            />
            <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>Leave blank to use your real name on the leaderboard.</div>
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <div className="gap-2">
              <input value={edit.email} onChange={e => setEdit(p => ({ ...p, email: e.target.value }))} placeholder="your@email.com" type="email" style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={changeEmail} disabled={emailSaving} style={{ flexShrink: 0 }}>{emailSaving ? "Saving..." : "Update Email"}</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Changing your email requires confirmation via a link sent to your new address.</div>
          </div>

          <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "var(--muted)", textTransform: "uppercase", fontFamily: "'Oswald','Barlow Condensed', sans-serif" }}>Delivery Address</div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 2, padding: "14px 16px", marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Address Line 1</label>
              <input autoComplete="off" value={edit.line1} onChange={e => setAddr("line1", e.target.value)} placeholder="House number and street name" />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Address Line 2 <span style={{ color: "var(--subtle)", fontWeight: 400, letterSpacing: 0 }}>(optional)</span></label>
              <input autoComplete="off" value={edit.line2} onChange={e => setAddr("line2", e.target.value)} placeholder="Flat, apartment, unit, etc." />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Town / City</label>
                <input autoComplete="off" value={edit.city} onChange={e => setAddr("city", e.target.value)} placeholder="Swindon" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>County <span style={{ color: "var(--subtle)", fontWeight: 400, letterSpacing: 0 }}>(optional)</span></label>
                <input autoComplete="off" value={edit.county} onChange={e => setAddr("county", e.target.value)} placeholder="Wiltshire" />
              </div>
            </div>
            <div className="form-group mt-1" style={{ marginBottom: 0 }}>
              <label>Postcode</label>
              <input autoComplete="off" value={edit.postcode} onChange={e => setAddr("postcode", e.target.value.toUpperCase())} placeholder="SN1 1AA" style={{ maxWidth: 160 }} />
            </div>
          </div>

          <div className="form-group">
            <label>Nationality Flag <span style={{ color:"var(--muted)", fontWeight:400, letterSpacing:0, textTransform:"none" }}>(shown on leaderboard)</span></label>
            {(() => {
              const NATIONS = [
                ["GB","United Kingdom"],["US","United States"],["AU","Australia"],
                ["CA","Canada"],["NZ","New Zealand"],["IE","Ireland"],
                ["ZA","South Africa"],["DE","Germany"],["FR","France"],
                ["ES","Spain"],["IT","Italy"],["NL","Netherlands"],
                ["BE","Belgium"],["SE","Sweden"],["NO","Norway"],
                ["DK","Denmark"],["FI","Finland"],["PL","Poland"],
                ["PT","Portugal"],["GR","Greece"],["CH","Switzerland"],
                ["AT","Austria"],["CZ","Czech Republic"],["JP","Japan"],
                ["KR","South Korea"],["SG","Singapore"],["MY","Malaysia"],
                ["BR","Brazil"],["MX","Mexico"],["AR","Argentina"],
                ["IN","India"],["PH","Philippines"],["TH","Thailand"],
              ];
              const selected = NATIONS.find(([c]) => c === edit.nationality) || NATIONS[0];
              return (
                <>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, maxWidth:460 }}>
                    {NATIONS.map(([code, name]) => {
                      const isSel = edit.nationality === code;
                      return (
                        <button key={code} type="button" onClick={() => setEdit(p => ({ ...p, nationality: code }))} title={name}
                          style={{ background:isSel?"rgba(200,255,0,.12)":"transparent", border:`2px solid ${isSel?"var(--accent)":"var(--border)"}`, borderRadius:3, padding:"3px 5px", cursor:"pointer", display:"inline-flex", alignItems:"center", transition:"all .12s" }}
                        >
                          <img src={`https://flagcdn.com/32x24/${code.toLowerCase()}.png`} srcSet={`https://flagcdn.com/64x48/${code.toLowerCase()}.png 2x`} width={32} height={24} alt={name} style={{ display:"block", borderRadius:1, objectFit:"cover" }}/>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:8, display:"flex", alignItems:"center", gap:8 }}>
                    <img src={`https://flagcdn.com/32x24/${selected[0].toLowerCase()}.png`} width={24} height={18} alt={selected[1]} style={{ borderRadius:2, objectFit:"cover" }}/>
                    <span>Selected: <strong style={{ color:"var(--text)" }}>{selected[1]}</strong></span>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="gap-2">
            <button className="btn btn-primary" onClick={saveProfile}>Save</button>
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => {
              const myBookings = (data.events || []).flatMap(ev =>
                (ev.bookings || []).filter(b => b.userId === cu.id).map(b => ({
                  event: ev.title, date: ev.date, type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn
                }))
              ).sort((a,b) => new Date(b.date) - new Date(a.date));
              const payload = {
                exportDate: new Date().toISOString(),
                exportType: "GDPR Data Portability Export",
                notice: "This file contains all personal data held about you on the Swindon Airsoft platform.",
                profile: { name: cu.name, email: cu.email, phone: cu.phone||"", address: cu.address||"", joinDate: cu.joinDate||"", gamesAttended: cu.gamesAttended, vipStatus: cu.vipStatus, ukara: cu.ukara||"", credits: cu.credits },
                bookings: myBookings,
              };
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" }));
              a.download = `swindon-airsoft-my-data-${Date.now()}.json`;
              a.click();
            }}>⬇ Download My Data (GDPR)</button>

            <button className="btn btn-danger" onClick={() => setDelConfirm(true)}>Request Account Deletion</button>
          </div>
          {delConfirm && (
            <div className="alert alert-red mt-2">
              <div style={{ marginBottom: 10, fontSize: 13 }}>This will flag your account for deletion. You'll lose access. Confirm?</div>
              <div className="gap-2">
                <button className="btn btn-danger btn-sm" onClick={() => { updateUser(cu.id, { deleteRequest: true }); showToast("Deletion request sent", "red"); setDelConfirm(false); }}>Confirm</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDelConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "waiver" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Waiver Status</div>
              {waiverValid ? <span className="tag tag-green">✓ Signed {cu.waiverYear}</span> : <span className="tag tag-red">✗ Not Signed</span>}
            </div>
            {waiverValid
              ? <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setWaiverModal("edit")}>Request Changes</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setWaiverModal("addPlayer")}>+ Add Player Waiver</button>
                </div>
              : <button className="btn btn-primary btn-sm" onClick={() => setWaiverModal("new")}>Sign Waiver {new Date().getFullYear()}</button>}
          </div>
          {cu.waiverPending && (
            <div className="alert alert-gold" style={{ marginBottom:12 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>⏳ Changes pending admin approval</div>
              {cu.waiverPending._removeExtra ? (
                <div style={{ fontSize:12 }}>Requesting removal of player waiver: <strong>{cu.waiverPending._playerName}</strong></div>
              ) : cu.waiverPending.waiverData ? (
                <div style={{ fontSize:12 }}>
                  Updated waiver submitted for <strong>{cu.waiverPending.waiverData.name}</strong>
                  {cu.waiverPending.extraWaivers?.length > 0 && ` + ${cu.waiverPending.extraWaivers.length} additional player(s)`}
                </div>
              ) : (
                <div style={{ fontSize:12 }}>Waiver changes submitted — awaiting review</div>
              )}
            </div>
          )}
          {cu.waiverData && (() => {
            const allWaivers = [cu.waiverData, ...(cu.extraWaivers || [])];
            return (
              <div style={{ marginTop: 12 }}>
                {/* Player tabs if multiple waivers */}
                {allWaivers.length > 1 && (
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:12 }}>
                    {allWaivers.map((w, i) => (
                      <button key={i} style={{
                        padding:"4px 12px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700,
                        fontSize:11, letterSpacing:".1em", textTransform:"uppercase",
                        background:"var(--accent)", color:"#000", border:"none", borderRadius:2, cursor:"default"
                      }}>
                        {w.name || `Player ${i+1}`}{i === 0 ? " ★" : ""}
                      </button>
                    ))}
                  </div>
                )}
                {allWaivers.map((w, i) => (
                  <div key={i} style={{ marginBottom: i < allWaivers.length - 1 ? 20 : 0, paddingBottom: i < allWaivers.length - 1 ? 20 : 0, borderBottom: i < allWaivers.length - 1 ? "1px solid #1e2e12" : "none" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      {allWaivers.length > 1 && (
                        <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase" }}>
                          PLAYER {i + 1}{i === 0 ? " (PRIMARY)" : " (ADDITIONAL)"}
                        </div>
                      )}
                      {i > 0 && (
                        <button onClick={async () => {
                          if (!window.confirm("Request removal of this additional player waiver? An admin will need to approve before it's deleted.")) return;
                          // Store removal request in waiverPending as a special marker
                          const removalRequest = { _removeExtra: true, _extraIndex: i - 1, _playerName: w.name, _requestedAt: new Date().toISOString() };
                          await updateUser(cu.id, { waiverPending: removalRequest });
                          showToast("Removal request submitted — awaiting admin approval.");
                        }} style={{ background:"none", border:"1px solid var(--red)", color:"var(--red)", fontSize:11, padding:"2px 10px", cursor:"pointer", fontFamily:"'Oswald','Barlow Condensed',sans-serif", letterSpacing:".08em" }}>
                          🗑 REQUEST REMOVAL
                        </button>
                      )}
                    </div>
                    {[["Name", w.name], ["DOB", w.dob], ["Address", [w.addr1, w.addr2, w.city, w.county, w.postcode].filter(Boolean).join(", ") || "—"], ["Emergency", w.emergencyName ? `${w.emergencyName} · ${w.emergencyPhone}` : "—"], ["Medical", w.medical || "None"], ["Minor", w.isChild ? `Yes — Guardian: ${w.guardian}` : "No"], ["Signed", gmtShort(w.date)]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                        <span className="text-muted" style={{ minWidth: 130 }}>{k}:</span><span>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
          {waiverModal && <WaiverModal cu={cu} updateUser={(id, patch) => {
            const waiver = patch.waiverData || (patch.extraWaivers && patch.extraWaivers[patch.extraWaivers.length - 1]);
            if (waiver && waiver.emergencyName) {
              const playerName = (waiver.name || cu?.waiverData?.name || "").trim().toLowerCase();
              const emergencyName = waiver.emergencyName.trim().toLowerCase();
              if (playerName && emergencyName === playerName) {
                showToast("Emergency contact must be a different person — not the player themselves.", "red");
                return Promise.resolve();
              }
            }
            return updateUser(id, patch);
          }} onClose={() => setWaiverModal(false)} showToast={showToast} editMode={waiverModal === "edit"} existing={cu.waiverData} />}
        </div>
      )}

      {tab === "bookings" && (() => {
        const openTicket = (b) => {
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(b.id)}&bgcolor=0d0d0d&color=c8ff00&qzone=1`;
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FIELD PASS — ${b.eventTitle || "EVENT"}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
@media print { .noprint{display:none!important} body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important} }
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=Share+Tech+Mono&display=swap');
body { font-family:'Oswald','Barlow Condensed',sans-serif; background:#080b06; color:#fff; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; }
.ticket { width:520px; max-width:100%; background:#111; border:1px solid #1e2e12; position:relative; overflow:hidden; }
.ticket::before { content:''; position:absolute; inset:0; background-image:radial-gradient(ellipse at 20% 30%,rgba(30,50,10,.25) 0%,transparent 50%),radial-gradient(ellipse at 70% 70%,rgba(20,40,5,.2) 0%,transparent 40%); pointer-events:none; z-index:0; }
.ticket > * { position:relative; z-index:1; }
.corner { position:absolute; width:18px; height:18px; z-index:2; }
.corner.tl { top:7px; left:7px; border-top:2px solid #c8ff00; border-left:2px solid #c8ff00; }
.corner.tr { top:7px; right:7px; border-top:2px solid #c8ff00; border-right:2px solid #c8ff00; }
.corner.bl { bottom:7px; left:7px; border-bottom:2px solid #c8ff00; border-left:2px solid #c8ff00; }
.corner.br { bottom:7px; right:7px; border-bottom:2px solid #c8ff00; border-right:2px solid #c8ff00; }
.hdr { background:linear-gradient(135deg,#0d1400,#111 60%,#0a1000); padding:18px 22px 14px; border-bottom:1px solid #1e1e1e; }
.brand { font-size:9px; letter-spacing:.2em; color:#7aaa30; font-weight:800; text-transform:uppercase; margin-bottom:8px; }
.evname { font-size:26px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; line-height:1; margin-bottom:5px; }
.evdate { font-family:'Share Tech Mono',monospace; font-size:11px; color:#4a6820; letter-spacing:.1em; }
.tear { display:flex; align-items:center; height:24px; }
.notch { width:14px; height:28px; background:#080b06; flex-shrink:0; }
.notch.l { border-radius:0 14px 14px 0; margin-left:-1px; }
.notch.r { border-radius:14px 0 0 14px; margin-right:-1px; }
.tearline { flex:1; border-top:1px dashed #283810; }
.body { padding:14px 22px 18px; display:flex; gap:16px; align-items:center; }
.fields { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:12px 16px; }
.lbl { font-size:8px; letter-spacing:.22em; color:#4a6820; font-weight:800; text-transform:uppercase; margin-bottom:3px; }
.val { font-size:17px; font-weight:800; letter-spacing:.04em; color:#c8e878; }
.val.status-ok { color:#c8ff00; }
.val.status-pending { color:#4fc3f7; }
.qrside { text-align:center; flex-shrink:0; }
.qrwrap { background:#07100304; border:2px solid #2a3a10; padding:8px; display:inline-block; }
.qrlbl { font-size:8px; color:#3a5818; margin-top:5px; letter-spacing:.18em; text-transform:uppercase; }
.footer { background:rgba(4,8,1,.85); border-top:1px solid #1a2808; padding:6px 22px; display:flex; justify-content:space-between; align-items:center; }
.foottxt { font-family:'Share Tech Mono',monospace; font-size:8px; letter-spacing:.15em; color:#283810; }
.bars { display:flex; gap:2px; align-items:center; }
.bar { background:#1e2c08; width:2px; border-radius:1px; }
.printbtn { margin-top:20px; background:#c8ff00; color:#000; border:none; padding:12px 32px; font-family:'Oswald','Barlow Condensed',sans-serif; font-size:14px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
</style></head><body>
<div class="ticket">
  <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
  <div class="hdr">
    <div class="brand">⬡ SWINDON AIRSOFT &nbsp;◆&nbsp; FIELD PASS // ${new Date().getFullYear()}</div>
    <div class="evname">${b.eventTitle || "EVENT"}</div>
    <div class="evdate">📅 ${b.eventDate ? new Date(b.eventDate).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : ""}</div>
  </div>
  <div class="tear"><div class="notch l"></div><div class="tearline"></div><div class="notch r"></div></div>
  <div class="body">
    <div class="fields">
      <div><div class="lbl">Kit Type</div><div class="val">${b.type === "walkOn" ? "Walk-On" : "Rental"}</div></div>
      <div><div class="lbl">Units</div><div class="val">${b.qty}</div></div>
      <div><div class="lbl">Levy</div><div class="val">${b.total > 0 ? "£" + Number(b.total).toFixed(2) : "N/A"}</div></div>
      <div><div class="lbl">Ref</div><div class="val">${b.id.slice(0,8).toUpperCase()}</div></div>
      <div><div class="lbl">Status</div><div class="val ${b.checkedIn ? "status-ok" : "status-pending"}">${b.checkedIn ? "CLEARED" : "PENDING"}</div></div>
      <div><div class="lbl">Player</div><div class="val" style="font-size:13px">${cu.name || ""}</div></div>
    </div>
    <div class="qrside">
      <div class="qrwrap"><img src="${qrUrl}" width="120" height="120" alt="QR"></div>
      <div class="qrlbl">Scan on arrival</div>
    </div>
  </div>
  <div class="footer">
    <div class="foottxt">MISSION ID: ${b.id.toUpperCase()}</div>
    <div class="bars">${Array.from({length:28},(_,i)=>`<div class="bar" style="height:${8+Math.sin(i*1.3)*6}px"></div>`).join("")}</div>
  </div>
</div>
<button class="printbtn noprint" onclick="window.print()">🖨 PRINT / SAVE AS PDF</button>
</body></html>`;
          const w = window.open("","_blank");
          if (w) { w.document.write(html); w.document.close(); }
        };

        return (
          <div className="card">
            {myBookings.length === 0 ? (
              <div style={{ textAlign:"center", color:"var(--muted)", padding:40 }}>No bookings yet.</div>
            ) : (
              <>
                <div style={{ marginBottom:16, fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>
                  {myBookings.length} booking{myBookings.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {myBookings
                    .sort((a,b) => new Date(b.eventDate) - new Date(a.eventDate))
                    .map(b => {
                      const isPast = new Date(b.eventDate) < new Date();
                      const hoursUntil = (new Date(b.eventDate) - new Date()) / 36e5;
                      const canCancel = !isPast && !b.checkedIn && hoursUntil > 24;
                      return (
                        <div key={b.id} style={{
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                          padding:"10px 14px", background:"var(--surface)",
                          borderLeft:`3px solid ${b.checkedIn ? "#c8ff00" : isPast ? "#1e2e12" : "#4fc3f7"}`,
                          gap:12, flexWrap:"wrap",
                        }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".04em", color: isPast ? "var(--muted)" : "#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                              {b.eventTitle}
                            </div>
                            <div style={{ fontSize:11, color:"var(--muted)", display:"flex", gap:10, flexWrap:"wrap" }}>
                              <span>📅 {fmtDate(b.eventDate)}</span>
                              <span>{b.type === "walkOn" ? "Walk-On" : "Rental"} × {b.qty}</span>
                              {b.total > 0 && <span>£{Number(b.total).toFixed(2)}</span>}
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                            <span style={{
                              fontSize:10, fontWeight:800, fontFamily:"'Oswald','Barlow Condensed',sans-serif",
                              letterSpacing:".12em", padding:"2px 8px", textTransform:"uppercase",
                              background: b.checkedIn ? "rgba(200,255,0,.1)" : isPast ? "rgba(255,255,255,.04)" : "rgba(79,195,247,.1)",
                              color: b.checkedIn ? "#c8ff00" : isPast ? "#555" : "#4fc3f7",
                              border: `1px solid ${b.checkedIn ? "rgba(200,255,0,.2)" : isPast ? "#1e2e12" : "rgba(79,195,247,.2)"}`,
                            }}>
                              {b.checkedIn ? "✓ Attended" : isPast ? "Missed" : "Booked"}
                            </span>
                            <button
                              onClick={() => openTicket(b)}
                              title="View / Print Ticket"
                              style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.2)", color:"#c8ff00", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".1em", padding:"3px 10px", cursor:"pointer", textTransform:"uppercase" }}>
                              🎟 Ticket
                            </button>
                            {canCancel && (
                              <button onClick={() => setCancelModal(b)} style={{ background:"transparent", border:"1px solid #6b2222", color:"#ef4444", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".12em", padding:"3px 10px", cursor:"pointer", textTransform:"uppercase" }}>
                                ✕ Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              </>
            )}
          </div>
        );
      })()}
      {/* Cancel booking modal */}
      {cancelModal && (() => {
        const b = cancelModal;
        const hoursUntil = (new Date(b.eventDate) - new Date()) / 36e5;
        const within24 = hoursUntil < 24;
        const within48 = hoursUntil < 48;
        const isRental = b.type === "rental";
        const originalTotal = Number(b.total);
        const refundAmount = Math.round(originalTotal * (isRental ? 0.9 : 1) * 100) / 100;
        const rentalFee = Math.round((originalTotal - refundAmount) * 100) / 100;

        // Policy tiers
        const policyTiers = [
          { label: "More than 48 hours", condition: !within48, color:"#c8ff00", bg:"rgba(200,255,0,.04)", border:"rgba(200,255,0,.15)",
            desc: isRental ? `90% refund (£${refundAmount.toFixed(2)}) to original payment method — 10% rental fee retained` : `Full refund (£${refundAmount.toFixed(2)}) to original payment method` },
          { label: "24–48 hours before", condition: within48 && !within24, color:"var(--gold)", bg:"rgba(200,150,0,.04)", border:"rgba(200,150,0,.2)",
            desc: isRental ? `90% refund (£${refundAmount.toFixed(2)}) as Game Day Credits — 10% rental fee retained` : `Full refund (£${refundAmount.toFixed(2)}) as Game Day Credits` },
          { label: "Under 24 hours", condition: within24, color:"var(--red)", bg:"rgba(255,60,60,.04)", border:"rgba(255,60,60,.2)",
            desc: "Cancellations not permitted within 24 hours of the event" },
        ];

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div style={{ background:"#0d0d0d", border:"1px solid #6b2222", maxWidth:460, width:"100%", padding:28 }}>
              <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:".12em", color:"#ef4444", textTransform:"uppercase", marginBottom:6 }}>⚠ CANCEL BOOKING</div>
              <div style={{ fontWeight:700, fontSize:15, color:"var(--text)", marginBottom:4 }}>{b.eventTitle}</div>
              <div style={{ fontSize:12, color:"var(--muted)", marginBottom:16 }}>{fmtDate(b.eventDate)} · {b.type === "rental" ? "Rental" : "Walk-On"} × {b.qty} · Paid £{originalTotal.toFixed(2)}</div>

              {/* Policy tiers */}
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
                {policyTiers.map(tier => (
                  <div key={tier.label} style={{ background: tier.condition ? tier.bg : "transparent", border:`1px solid ${tier.condition ? tier.border : "rgba(255,255,255,.06)"}`, padding:"10px 12px", display:"flex", alignItems:"flex-start", gap:10 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background: tier.condition ? tier.color : "#333", flexShrink:0, marginTop:4 }} />
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color: tier.condition ? tier.color : "#444", fontFamily:"'Oswald','Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase", marginBottom:2 }}>{tier.label}</div>
                      <div style={{ fontSize:11, color: tier.condition ? "var(--text)" : "#444" }}>{tier.desc}</div>
                    </div>
                    {tier.condition && <div style={{ marginLeft:"auto", fontSize:10, fontWeight:800, color:tier.color, fontFamily:"'Oswald','Barlow Condensed',sans-serif", letterSpacing:".08em", flexShrink:0 }}>← YOU ARE HERE</div>}
                  </div>
                ))}
              </div>

              {!within24 && (
                <div style={{ background:"#1a0a0a", border:"1px solid #3a1515", padding:14, marginBottom:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                    <span style={{ color:"var(--muted)" }}>Booking total</span>
                    <span style={{ fontFamily:"'Share Tech Mono',monospace" }}>£{originalTotal.toFixed(2)}</span>
                  </div>
                  {isRental && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                      <span style={{ color:"var(--red)" }}>Rental fee (10%)</span>
                      <span style={{ color:"var(--red)", fontFamily:"'Share Tech Mono',monospace" }}>−£{rentalFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ borderTop:"1px solid #3a1515", paddingTop:10, display:"flex", justifyContent:"space-between", fontSize:16, fontWeight:800 }}>
                    <span style={{ color:"var(--muted)" }}>{within48 ? "Credits added" : "Refund"}</span>
                    <span style={{ color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace" }}>£{refundAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted)", marginTop:8, fontFamily:"'Share Tech Mono',monospace" }}>
                    {within48 ? "⏱ Added to your account instantly as Game Day Credits" : "✓ Refunded to original payment method within 3–5 business days"}
                  </div>
                </div>
              )}

              {within24 ? (
                <div style={{ display:"flex", justifyContent:"flex-end" }}>
                  <button onClick={() => setCancelModal(null)} className="btn btn-ghost">Close</button>
                </div>
              ) : (
                <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                  <button onClick={() => setCancelModal(null)} disabled={cancelling} className="btn btn-ghost">Keep Booking</button>
                  <button onClick={doCancel} disabled={cancelling} style={{ background:"#6b2222", border:"1px solid #ef4444", color:"#fca5a5", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".1em", padding:"8px 20px", cursor:cancelling?"wait":"pointer", textTransform:"uppercase" }}>
                    {cancelling ? "Cancelling…" : "Confirm Cancellation"}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {tab === "orders" && <PlayerOrders cu={cu} />}
      {tab === "waitlist" && <PlayerWaitlist cu={cu} showToast={showToast} />}

      {tab === "vip" && (() => {
        const THREE_WEEKS = 21 * 24 * 60 * 60 * 1000;
        const expiry      = cu.vipExpiresAt ? new Date(cu.vipExpiresAt) : null;
        const now         = new Date();
        const thisYear    = now.getFullYear();
        const isExpired   = expiry && expiry < now;
        const nearExpiry  = expiry && !isExpired && (expiry - now) < THREE_WEEKS;

        // Birthday free game day — waiver DOB only, cannot be gamed
        const bdRaw = cu.waiverData?.dob;
        const bd = bdRaw ? new Date(bdRaw) : null;
        const bdThisYear = bd ? new Date(thisYear, bd.getMonth(), bd.getDate()) : null;
        const bdDiffDays = bdThisYear ? Math.round((bdThisYear - now) / 86400000) : null;
        const isBirthdayWindow = bdDiffDays !== null && bdDiffDays >= -7 && bdDiffDays <= 7;
        const birthdayCreditAwarded = cu.birthdayCreditYear === thisYear;
        const birthdayComingUp = bdDiffDays !== null && bdDiffDays > 7 && bdDiffDays <= 30;

        return (
        <div className="card">
          {/* Birthday credit banner */}
          {cu.vipStatus === "active" && birthdayCreditAwarded && isBirthdayWindow && (
            <div style={{ background: "rgba(200,160,0,.12)", border: "1px solid rgba(200,160,0,.4)", borderRadius: 6, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ fontSize: 32 }}>🎂</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "var(--gold)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".06em" }}>Happy Birthday from Swindon Airsoft! 🎉</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>As a VIP member, we've added a <strong style={{ color: "var(--gold)" }}>FREE GAME DAY</strong> to your account — enjoy it on us! Book any game day and it's on the house.</div>
              </div>
            </div>
          )}
          {cu.vipStatus === "active" && birthdayComingUp && !birthdayCreditAwarded && bd && (
            <div style={{ background: "rgba(200,160,0,.06)", border: "1px solid rgba(200,160,0,.2)", borderRadius: 6, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 24 }}>🎂</span>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Your birthday is in <strong style={{ color: "var(--gold)" }}>{bdDiffDays} days</strong> — as a VIP, you'll automatically receive a <strong style={{ color: "var(--gold)" }}>FREE GAME DAY</strong> added to your account!
              </div>
            </div>
          )}
          {cu.vipStatus === "active" && !bd && (
            <div style={{ background: "rgba(200,160,0,.06)", border: "1px solid rgba(200,160,0,.2)", borderRadius: 6, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 22 }}>🎂</span>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                <strong style={{ color: "var(--gold)" }}>VIP Birthday Perk:</strong> Once you've signed a waiver with your date of birth, you'll automatically receive a <strong style={{ color: "var(--gold)" }}>free game day</strong> each year around your birthday!
              </div>
            </div>
          )}

          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, fontFamily: "'Oswald','Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: ".05em" }}>VIP Membership</div>
          <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>VIP members receive 10% off all game days and 10% off at Airsoft Armoury UK (airsoftarmoury.uk), a free game day on their birthday, plus UKARA ID registration. Annual membership costs <strong style={{ color: "var(--gold)" }}>£40/year</strong>.</p>
          {[
            { label: "Games Attended", value: `${gamesAttended} / 3 required`, ok: gamesAttended >= 3 },
            { label: "VIP Status", value: cu.vipStatus === "active" ? "Active" : cu.vipApplied ? "Application Pending" : "Not Applied", ok: cu.vipStatus === "active" },
            cu.vipStatus === "active" && expiry && { label: "Expires", value: expiry.toLocaleDateString("en-GB"), ok: !isExpired },
            { label: "UKARA ID", value: cu.ukara || "Not assigned", ok: !!cu.ukara },
            { label: "VIP Discount", value: "10% off game days & Airsoft Armoury UK", ok: cu.vipStatus === "active" },
            cu.vipStatus === "active" && bd && { label: "Birthday Perk", value: birthdayCreditAwarded ? `Free game day awarded ${thisYear} 🎂` : `Free game day in birthday week`, ok: true },
          ].filter(Boolean).map(({ label, value, ok }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "var(--bg4)", borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
              <span className="text-muted">{label}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{value} <span style={{ color: ok ? "var(--accent)" : "var(--red)" }}>{ok ? "✓" : "✗"}</span></span>
            </div>
          ))}
          {/* Active — near expiry: show renew button */}
          {cu.vipStatus === "active" && nearExpiry && (
            <div style={{ background: "rgba(200,160,0,.08)", border: "1px solid rgba(200,160,0,.3)", padding: "14px 16px", marginTop: 8, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--gold)", marginBottom: 6 }}>
                ⚠ VIP expires {expiry.toLocaleDateString("en-GB")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Renew now to keep your discount and UKARA registration.</div>
              <button className="btn btn-gold" style={{ width: "100%" }} onClick={() => setPage("vip")}>
                Renew VIP — £40/year →
              </button>
            </div>
          )}
          {/* Active — not near expiry */}
          {cu.vipStatus === "active" && !nearExpiry && (
            <div className="alert alert-gold mt-2">⭐ You are an active VIP member!</div>
          )}
          {/* Expired */}
          {cu.vipStatus === "expired" && (
            <div style={{ background: "rgba(200,0,0,.07)", border: "1px solid rgba(200,0,0,.25)", padding: "14px 16px", marginTop: 8, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--red)", marginBottom: 6 }}>✗ VIP Membership Expired</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Your membership has lapsed. Renew to restore your benefits.</div>
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setPage("vip")}>
                Renew VIP — £40/year →
              </button>
            </div>
          )}
          {/* Player-visible card status */}
          {cu.cardStatus && cu.cardStatus !== "none" && (
            <div style={{
              background: `rgba(${cu.cardStatus==="yellow"?"200,160,0":cu.cardStatus==="red"?"220,30,30":"80,80,80"},.1)`,
              border: `1px solid rgba(${cu.cardStatus==="yellow"?"200,160,0":cu.cardStatus==="red"?"220,30,30":"80,80,80"},.35)`,
              padding:"14px 16px", marginTop:10, marginBottom:4, borderRadius:4
            }}>
              <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:6,
                color: cu.cardStatus==="yellow" ? "var(--gold)" : cu.cardStatus==="red" ? "var(--red)" : "#bbb" }}>
                {cu.cardStatus === "yellow" && "🟡 Yellow Card — Formal Warning"}
                {cu.cardStatus === "red"    && "🔴 Red Card — Temporary Ban"}
                {cu.cardStatus === "black"  && "⚫ Black Card — Account Suspended"}
              </div>
              <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
                {cu.cardStatus === "yellow" && "You have received a formal warning. Please review site rules — further violations may result in a game day ban."}
                {cu.cardStatus === "red"    && "You are temporarily banned for 1 game day. Event booking has been disabled. Contact us to resolve this."}
                {cu.cardStatus === "black"  && "Your account is suspended pending review by the site owner. Please contact us directly."}
                {cu.cardReason && <div style={{ marginTop:6, fontStyle:"italic" }}>Reason: {cu.cardReason}</div>}
              </div>
            </div>
          )}

          {canApplyVip && cu.vipStatus !== "expired" && (
            <button className="btn btn-gold mt-2" style={{ width:"100%" }} onClick={() => setPage("vip")}>
              Apply &amp; Pay for VIP Membership — £40/year →
            </button>
          )}
          {cu.vipApplied && cu.vipStatus !== "active" && <div className="alert alert-blue mt-2">⏳ Application pending admin review</div>}
          {!canApplyVip && !cu.vipApplied && cu.vipStatus === "none" && (
            <div className="alert alert-gold mt-2">Need {Math.max(0, 3 - gamesAttended)} more game(s) to be eligible for VIP.</div>
          )}
        </div>
        );
      })()}

      {tab === "loadout" && <LoadoutTab cu={cu} showToast={showToast} />}
      {tab === "report"  && <ReportCheatTab cu={cu} showToast={showToast} />}
    </div>
  );
}

// ── Report a Cheater tab (inside ProfilePage) ──────────────

export { ProfilePage };
