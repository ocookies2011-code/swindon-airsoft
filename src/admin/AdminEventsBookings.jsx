// admin/AdminEventsBookings.jsx — events + bookings management
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { AdminTrackStatusCell, DesignationInsignia, GmtClock, QRCode, QRScanner, RankInsignia, TrackingBlock, WaiverModal, detectCourier, fmtDate, fmtErr, gmtShort, renderMd, resetSquareConfig, sendAdminBookingNotification, sendEventReminderEmail, sendNewEventEmail, sendTicketEmail, sendWaitlistNotifyEmail, stockLabel, uid, useMobile } from "../utils";;
import { squareRefund, waitlistApi, holdApi, normaliseProfile } from "../api";

import { diffFields, logAction } from "./adminHelpers";

function AdminEventsBookings({ data, save, updateEvent, updateUser, showToast, cu }) {
  const [waitlistView, setWaitlistView] = useState(null); // { ev, entries }
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState({}); // bookingId -> true while sending

  const openWaitlist = async (ev) => {
    setWaitlistLoading(true);
    try {
      const entries = await waitlistApi.getByEvent(ev.id);
      setWaitlistView({ ev, entries });
    } catch (e) { showToast("Failed to load waitlist: " + e.message, "red"); }
    finally { setWaitlistLoading(false); }
  };

  const emailWaitlist = async (ev, entries) => {
    if (!entries.length) return;
    showToast("Emailing waitlist…", "gold");
    let sent = 0, failed = 0;
    // Group by ticket type — only notify + hold first person per type
    const byType = {};
    for (const w of entries) {
      if (!byType[w.ticket_type]) byType[w.ticket_type] = [];
      byType[w.ticket_type].push(w);
    }
    for (const [ticketType, group] of Object.entries(byType)) {
      const first = group[0];
      if (!first.user_email) { failed++; continue; }
      try {
        // Create a 30-min hold for the first person in each ticket type
        await holdApi.createHold({ eventId: ev.id, ticketType, userId: first.user_id, userName: first.user_name, userEmail: first.user_email });
        await sendWaitlistNotifyEmail({ toEmail: first.user_email, toName: first.user_name, ev, ticketType });
        sent++;
      } catch { failed++; }
    }
    showToast(`📧 Waitlist emailed: ${sent} sent${failed > 0 ? `, ${failed} failed` : ""}. Slots held for 30 mins.`);
  };

  const resendTicket = async (b, ev) => {
    const player = data.users.find(u => u.id === b.userId);
    if (!player?.email) { showToast("No email address found for this player.", "red"); return; }
    setResendBusy(prev => ({ ...prev, [b.id]: true }));
    try {
      await sendTicketEmail({
        cu: player,
        ev,
        bookings: [{ id: b.id, type: b.type, qty: b.qty, total: b.total }],
        extras: b.extras || {},
      });
      showToast(`📧 Ticket resent to ${player.email}`);
    } catch (e) {
      showToast("Failed to resend ticket: " + e.message, "red");
    } finally {
      setResendBusy(prev => ({ ...prev, [b.id]: false }));
    }
  };

  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="events" && ["events","checkin"].includes(p[2]) ? p[2] : "events";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/events/" + t; };

  // ── Events state ──
  const [modal, setModal] = useState(null);
  const [viewId, setViewId] = useState(null);
  const blank = { title: "", date: "", time: "09:00", endTime: "17:00", location: "", description: "", walkOnSlots: 40, rentalSlots: 20, walkOnPrice: 25, rentalPrice: 35, banner: "", mapEmbed: "", extras: [], published: true, vipOnly: false };
  const [form, setForm] = useState(blank);
  const bannerFileRef = useRef(null); // holds the raw File object so we don't rely on fetch(data:URL)
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));
  const f = setField;

  // ── Check-in state ──
  const [evId, setEvId] = useState(() => {
    const now = new Date();
    const upcoming = data.events
      .filter(ev => new Date(ev.date + "T" + (ev.endTime || ev.time || "23:59") + ":00") > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return (upcoming[0] || data.events[0])?.id || "";
  });
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);

  // ── Booking action state (edit / view / delete / refund) ──
  const [editBooking, setEditBooking] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [viewBooking, setViewBooking] = useState(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [refundModal, setRefundModal] = useState(null);
  const [refundAmt, setRefundAmt] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refunding, setRefunding] = useState(false);

  const openEdit = (b) => setEditBooking({
    id: b.id, userId: b.userId, userName: b.userName,
    eventTitle: b.eventTitle || b.eventObj?.title, eventObj: b.eventObj,
    eventId: b.eventObj?.id || null,
    newEventId: null,
    type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn,
    _orig: { type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn, eventId: b.eventObj?.id || null, eventTitle: b.eventTitle || b.eventObj?.title },
  });

  const saveEdit = async () => {
    setBookingBusy(true);
    try {
      await api.bookings.update(editBooking.id, editBooking);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Booking updated!");
      const BLABELS = { type: "Type", qty: "Qty", total: "Total", checkedIn: "Checked in" };
      const bDiff = diffFields(
        editBooking._orig || {},
        { type: editBooking.type, qty: editBooking.qty, total: editBooking.total, checkedIn: editBooking.checkedIn },
        BLABELS
      );
      const transferNote = editBooking.newEventId
        ? ` | Event transferred from "${editBooking._orig.eventTitle}" to "${data.events.find(e => e.id === editBooking.newEventId)?.title || editBooking.newEventId}"`
        : "";
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Booking updated", detail: `${editBooking.userName} @ ${editBooking.eventTitle}${bDiff ? ` | ${bDiff}` : ""}${transferNote || (!bDiff ? " (no field changes)" : "")}` });
      setEditBooking(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBookingBusy(false); }
  };

  const confirmDelete = async () => {
    setBookingBusy(true);
    try {
      const { error } = await supabase.from("bookings").delete().eq("id", delConfirm.id);
      if (error) throw new Error(error.message);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Booking deleted!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Booking deleted", detail: `Booking ID: ${delConfirm.id} — ${delConfirm.userName || ""}` });
      setDelConfirm(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBookingBusy(false); }
  };

  const doRefundBooking = async () => {
    const { booking } = refundModal;
    const amt = parseFloat(refundAmt);
    if (isNaN(amt) || amt <= 0) { showToast("Enter a valid refund amount", "red"); return; }
    if (amt > booking.total) { showToast("Refund amount exceeds booking total", "red"); return; }
    if (!booking.squareOrderId) { showToast("No Square payment ID on this booking — refund manually in your Square Dashboard.", "red"); return; }
    setRefunding(true);
    try {
      const locationId = await api.settings.get("square_location_id");
      const isFullRefund = Math.abs(amt - booking.total) < 0.01;
      await squareRefund({ squarePaymentId: booking.squareOrderId, amount: isFullRefund ? null : amt, locationId });
      await supabase.from("bookings").update({
        refund_amount: amt,
        refund_note: refundNote || null,
        refunded_at: new Date().toISOString(),
      }).eq("id", booking.id);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast(`✅ Refund of £${amt.toFixed(2)} issued via Square!`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Booking refunded", detail: `Booking ID: ${booking.id} — ${booking.userName} | Refund: £${amt.toFixed(2)}${refundNote ? ` | Note: ${refundNote}` : ""}` });
      setRefundModal(null); setRefundAmt(""); setRefundNote("");
    } catch (e) { showToast("❌ Refund failed: " + (e.message || String(e)), "red"); }
    finally { setRefunding(false); }
  };

  const ev = data.events.find(e => e.id === evId);
  const checkedInCount = ev ? ev.bookings.filter(b => b.checkedIn).length : 0;

  const allBookings = data.events.flatMap(ev =>
    ev.bookings.map(b => ({ ...b, eventTitle: ev.title, eventDate: ev.date, eventObj: ev }))
  );

  // ── Check-in logic ──
  const doCheckin = async (booking, evObj) => {
    if (!booking?.id || !booking?.userId) {
      showToast("Invalid booking data", "red"); return;
    }
    // Block check-in before event date
    const today = new Date().toISOString().slice(0, 10);
    if (evObj?.date && today < evObj.date) {
      showToast(`❌ Check-in not open yet — event is on ${fmtDate(evObj.date)}`, "red"); return;
    }
    try {
      const actualCount = await api.bookings.checkIn(booking.id, booking.userId);
      const evList = await api.events.getAll();
      save({ events: evList });
      const checkedInUser = data.users.find(x => x.id === booking.userId);
      if (checkedInUser) updateUser(checkedInUser.id, { gamesAttended: actualCount });
      showToast(`✅ ${booking.userName} checked in! Games: ${actualCount}`);
    } catch (e) {
      showToast("Check-in failed: " + e.message, "red");
    }
  };

  const manualCheckin = () => {
    if (!ev || !manual.trim()) return;
    const foundBooking = ev.bookings.find(x =>
      x.userName.toLowerCase().includes(manual.toLowerCase()) || x.id === manual.trim()
    );
    if (!foundBooking) { showToast("Booking not found", "red"); return; }
    if (foundBooking.checkedIn) { showToast("Already checked in", "gold"); return; }
    doCheckin(foundBooking, ev); setManual("");
  };

  const onQRScan = (code) => {
    setScanning(false);
    for (const evObj of data.events) {
      const scannedBooking = evObj.bookings.find(x => x.id === code);
      if (scannedBooking) {
        if (scannedBooking.checkedIn) { showToast(`${scannedBooking.userName} already checked in`, "gold"); return; }
        doCheckin(scannedBooking, evObj); return;
      }
    }
    showToast("QR code not recognised", "red");
  };

  const downloadList = () => {
    if (!ev) return;
    const rows = ["Name,Type,Qty,Total,Checked In",
      ...ev.bookings.map(b => `${b.userName},${b.type},${b.qty},${b.total.toFixed(2)},${b.checkedIn}`)
    ].join("\n");
    const downloadLink = document.createElement("a");
    downloadLink.href = "data:text/csv," + encodeURIComponent(rows);
    downloadLink.download = ev.title + "-players.csv"; downloadLink.click();
    showToast("Player list downloaded!");
  };

  // ── Events logic ──
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setSavingEvent(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const printPlayerList = (ev) => {
    const bookings = ev.bookings || [];
    const ticketTypes = {};
    const extraCounts = {};
    bookings.forEach(b => {
      ticketTypes[b.type] = (ticketTypes[b.type] || 0) + (b.qty || 1);
      if (b.extras) Object.entries(b.extras).forEach(([k, v]) => {
        if (!v) return;
        const [xId, vId] = k.includes(":") ? k.split(":") : [k, null];
        let exDef = ev.extras?.find(e => e.id === xId);
        let shopP = exDef ? (data?.shop || []).find(p => p.id === exDef.productId) : (data?.shop || []).find(p => p.id === xId);
        if (!shopP && vId) shopP = (data?.shop || []).find(p => (p.variants||[]).some(vv => vv.id === vId));
        const varDef = vId && shopP ? (shopP.variants || []).find(vv => vv.id === vId) : null;
        let label;
        if (exDef) { label = varDef ? `${exDef.name} — ${varDef.name}` : exDef.name; }
        else if (shopP) { label = varDef ? `${shopP.name} — ${varDef.name}` : shopP.name; }
        else { const fallbackEx = ev.extras?.find(e => e.productId === xId); label = fallbackEx ? fallbackEx.name : xId; }
        extraCounts[label] = (extraCounts[label] || 0) + (typeof v === 'number' ? v : 1);
      });
    });
    const rows = bookings.map(b => {
      const extrasText = b.extras
        ? Object.entries(b.extras).filter(([,v]) => v > 0).map(([k, v]) => {
            const [xId, vId] = k.includes(":") ? k.split(":") : [k, null];
            let exDef = ev.extras?.find(e => e.id === xId);
            let shopP = exDef ? (data?.shop || []).find(p => p.id === exDef.productId) : (data?.shop || []).find(p => p.id === xId);
            if (!shopP && vId) shopP = (data?.shop || []).find(p => (p.variants||[]).some(vv => vv.id === vId));
            const varDef = vId && shopP ? (shopP.variants || []).find(vv => vv.id === vId) : null;
            let label;
            if (exDef) { label = varDef ? `${exDef.name} — ${varDef.name}` : exDef.name; }
            else if (shopP) { label = varDef ? `${shopP.name} — ${varDef.name}` : shopP.name; }
            else { const fallbackEx = ev.extras?.find(e => e.productId === xId); label = fallbackEx ? fallbackEx.name : xId; }
            return `${label} ×${v}`;
          }).join(", ")
        : "—";
      return `
      <tr>
        <td>${b.userName || 'Unknown'}</td>
        <td>${b.type}</td>
        <td>${b.qty || 1}</td>
        <td>${b.checkedIn ? '✓' : ''}</td>
        <td style="font-size:11px">${extrasText || '—'}</td>
      </tr>`;
    }).join('');
    const ticketSummary = Object.entries(ticketTypes).map(([t,c])=>`<span style="margin-right:16px"><strong>${c}</strong> × ${t}</span>`).join('');
    const extraSummary = Object.entries(extraCounts).length ? Object.entries(extraCounts).map(([k,v])=>`<span style="margin-right:16px"><strong>${v}</strong> × ${k}</span>`).join('') : 'None';
    const win = window.open('','_blank','width=900,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>Player List — ${ev.title}</title><style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:Arial,sans-serif;padding:32px;color:#111;}
      h1{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
      .meta{font-size:13px;color:#555;margin-bottom:20px;}
      .summary{background:#f5f5f5;border:1px solid #ddd;padding:14px 16px;border-radius:4px;margin-bottom:20px;}
      .summary h3{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px;}
      .summary p{font-size:14px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th{background:#111;color:#fff;padding:8px 12px;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;}
      td{padding:8px 12px;border-bottom:1px solid #eee;}
      tr:nth-child(even) td{background:#fafafa;}
      .footer{margin-top:20px;font-size:11px;color:#aaa;text-align:right;}
      @media print{body{padding:16px;}}
    </style></head><body>
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" style="height:44px;width:auto;display:block;margin-bottom:8px;" />
      <h1>Player List — ${ev.title}</h1>
      <div class="meta">${new Date(ev.date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${bookings.length} player(s) booked</div>
      <div class="summary">
        <h3>Ticket Types</h3><p>${ticketSummary || 'None'}</p>
        <h3 style="margin-top:10px">Game Day Extras</h3><p>${extraSummary}</p>
      </div>
      <table>
        <thead><tr><th>Player</th><th>Ticket Type</th><th>Qty</th><th>Checked In</th><th>Extras</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Printed ${new Date().toLocaleString('en-GB')} · Swindon Airsoft</div>
      <script>window.onload=()=>window.print();<\/script>
    </body></html>`);
    win.document.close();
  };

  const withTimeout = (promise, ms = 30000) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out after 30s — check your internet connection and Supabase is reachable")), ms))]);

  const saveEvent = async () => {
    if (!form.title || !form.date) { showToast("Title and date required", "red"); return; }
    setSavingEvent(true);
    try {
      const { _descTab, _emailUsers, ...formToSave } = form;
      if (modal === "new") {
        const created = await withTimeout(api.events.create(formToSave));
        // Upload banner using the resized File stored in bannerFileRef
        if (created?.id && bannerFileRef.current) {
          try {
            await api.events.uploadBanner(created.id, bannerFileRef.current);
          } catch (bannerErr) {
            console.warn("Banner upload failed:", bannerErr);
            showToast("Event saved but banner upload failed: " + bannerErr.message, "gold");
          } finally {
            bannerFileRef.current = null;
          }
        }
        // Email all users if checkbox was ticked
        if (form._emailUsers && created) {
          const evToSend = { ...formToSave, id: created.id };
          showToast("Sending announcement emails…", "gold");
          try {
            const results = await sendNewEventEmail({ ev: evToSend, users: data.users });
            showToast(`📧 Emails sent: ${results.sent} delivered${results.failed > 0 ? `, ${results.failed} failed` : ""}`, results.failed > 0 ? "gold" : "");
          } catch (emailErr) {
            showToast("Event saved but emails failed: " + emailErr.message, "gold");
          }
        }
      } else {
        await withTimeout(api.events.update(formToSave.id, formToSave));
        // Upload banner using the resized File stored in bannerFileRef
        if (form.id && bannerFileRef.current) {
          try {
            await api.events.uploadBanner(form.id, bannerFileRef.current);
          } catch (bannerErr) {
            console.warn("Banner upload failed:", bannerErr);
            showToast("Event saved but banner upload failed: " + bannerErr.message, "gold");
          } finally {
            bannerFileRef.current = null;
          }
        }
      }
      const evList = await withTimeout(api.events.getAll());
      save({ events: evList });
      showToast("Event saved!");
      if (!formToSave.id) {
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event created", detail: `Title: ${formToSave.title} | Date: ${formToSave.date || "?"} | Capacity: ${formToSave.capacity || "?"} | Price: £${Number(formToSave.price || 0).toFixed(2)} | Published: ${formToSave.published ? "yes" : "no"}` });
      } else {
        const origEv = data.events?.find(e => e.id === formToSave.id);
        const EVLABELS = { title: "Title", date: "Date", capacity: "Capacity", price: "Price", published: "Published", location: "Location" };
        const evBefore = { title: origEv?.title, date: origEv?.date, capacity: origEv?.capacity, price: origEv?.price, published: origEv?.published, location: origEv?.location };
        const evAfter  = { title: formToSave.title, date: formToSave.date, capacity: formToSave.capacity, price: formToSave.price, published: formToSave.published, location: formToSave.location };
        const evDiff = diffFields(evBefore, evAfter, EVLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event updated", detail: `${formToSave.title}${evDiff ? ` | ${evDiff}` : " (no changes)"}` });
      }
      setModal(null);
    } catch (e) {
      console.error("saveEvent failed:", e);
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
      setSavingEvent(false);
    }
  };

  // ── Add Booking (admin) ──
  const [addBookingModal, setAddBookingModal] = useState(false);
  const [addBookingForm, setAddBookingForm] = useState({ userId: "", type: "walkOn", qty: 1, extras: {} });
  const [addBookingBusy, setAddBookingBusy] = useState(false);
  const abf = (k, v) => setAddBookingForm(p => ({ ...p, [k]: v }));

  const submitAddBooking = async () => {
    const targetEv = data.events.find(e => e.id === evId);
    const player = data.users.find(u => u.id === addBookingForm.userId);
    if (!player) { showToast("Select a player", "red"); return; }
    if (!targetEv) { showToast("Select an event", "red"); return; }
    setAddBookingBusy(true);
    try {
      const ticketPrice = addBookingForm.type === "walkOn" ? targetEv.walkOnPrice : targetEv.rentalPrice;
      const extrasTotal = Object.entries(addBookingForm.extras).filter(([,v]) => v > 0).reduce((s, [key, qty]) => {
        const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
        const ex = targetEv.extras.find(e => e.id === extraId);
        const lp = (data.shop || []).find(p => p.id === ex?.productId);
        const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        const price = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
        return s + price * qty;
      }, 0);
      const newBooking = await api.bookings.create({
        eventId: targetEv.id,
        userId: player.id,
        userName: player.name,
        type: addBookingForm.type,
        qty: addBookingForm.qty,
        extras: Object.fromEntries(Object.entries(addBookingForm.extras).filter(([,v]) => v > 0)),
        total: 0, // Manual bookings don't count toward revenue
        squareOrderId: "ADMIN-MANUAL-" + Date.now(),
      });
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast(`Booking added for ${player.name}!`);
      setAddBookingModal(false);
      setAddBookingForm({ userId: "", type: "walkOn", qty: 1, extras: {} });
      // Send ticket confirmation email using real booking ID
      try {
        const emailBookings = [{ id: newBooking.id, type: addBookingForm.type, qty: addBookingForm.qty, total: 0 }];
        await sendTicketEmail({ cu: player, ev: targetEv, bookings: emailBookings, extras: Object.fromEntries(Object.entries(addBookingForm.extras).filter(([,v]) => v > 0)) });
        showToast("📧 Confirmation email sent to " + player.email);
        // Notify admin — fire-and-forget
        api.settings.get("contact_email").then(adminEmail => {
          if (adminEmail) sendAdminBookingNotification({
            adminEmail,
            cu: player,
            ev: targetEv,
            bookings: emailBookings,
            total: 0,
          }).catch(() => {});
        }).catch(() => {});
      } catch (emailErr) {
        showToast("Email failed: " + (emailErr?.message || String(emailErr)), "red");
      }
    } catch (e) {
      showToast("Failed: " + (e.message || String(e)), "red");
    } finally {
      setAddBookingBusy(false);
    }
  };

  const clone = async (ev) => {
    try {
      // Strip all DB-generated fields; only keep content fields
      const cloneData = {
        title:        ev.title + " (Copy)",
        date:         ev.date,
        time:         ev.time,
        location:     ev.location,
        description:  ev.description,
        walkOnSlots:  ev.walkOnSlots,
        rentalSlots:  ev.rentalSlots,
        walkOnPrice:  ev.walkOnPrice,
        rentalPrice:  ev.rentalPrice,
        published:    false,
        vipOnly:      ev.vipOnly || false,
        mapEmbed:     ev.mapEmbed || "",
        // Only carry URL banners — strip base64
        banner:       (ev.banner && !ev.banner.startsWith("data:")) ? ev.banner : "",
        // Strip old extra IDs so DB assigns new ones
        extras:       (ev.extras || []).map(({ id: _id, ...ex }) => ex),
      };
      await api.events.create(cloneData);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("✓ Event cloned as draft!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event cloned", detail: ev.title });
    } catch (e) {
      console.error("Clone failed:", e);
      showToast("Clone failed: " + (e.message || String(e)), "red");
    }
  };

  const [delEventConfirm, setDelEventConfirm] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const deleteEvent = async () => {
    if (!delEventConfirm) return;
    setDeletingEvent(true);
    try {
      await api.events.delete(delEventConfirm.id);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Event deleted!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event deleted", detail: delEventConfirm.title || delEventConfirm.id });
      setDelEventConfirm(null);
    } catch (e) {
      showToast("Delete failed: " + e.message, "red");
    } finally {
      setDeletingEvent(false);
    }
  };

  const viewEv = viewId ? data.events.find(e => e.id === viewId) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Events &amp; Bookings</div>
          <div className="page-sub">{data.events.length} events · {allBookings.length} bookings · {allBookings.filter(b => b.checkedIn).length} checked in</div>
        </div>
        <div className="gap-2">
          {tab === "events" && <button className="btn btn-primary" onClick={() => { setForm(blank); bannerFileRef.current = null; setModal("new"); }}>+ New Event</button>}
          {tab === "checkin" && <>
            <button className="btn btn-primary" onClick={() => setScanning(true)}>📷 Scan QR</button>
            <button className="btn btn-ghost" onClick={downloadList}>⬇ Export</button>
          </>}
        </div>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "events" ? "active" : ""}`} onClick={() => setTab("events")}>📅 Events</button>
        <button className={`nav-tab ${tab === "checkin" ? "active" : ""}`} onClick={() => setTab("checkin")}>✅ Check-In</button>
      </div>

      {/* ── EVENTS TAB ── */}
      {tab === "events" && (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Event</th><th>Date / Time</th><th>Slots</th><th>Booked</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.events.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No events yet</td></tr>}
            {(() => {
              const now = new Date();
              const upcoming = data.events.filter(ev => new Date(ev.date + "T" + (ev.endTime || ev.time || "23:59") + ":00") > now);
              const past     = data.events.filter(ev => new Date(ev.date + "T" + (ev.endTime || ev.time || "23:59") + ":00") <= now);
              const renderRow = (ev, isPast) => {
                const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
                return (
                  <tr key={ev.id} style={{ opacity: isPast ? 0.55 : 1 }}>
                    <td>
                      <button style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 13 }}
                        onClick={() => setViewId(ev.id)}>{ev.title}</button>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{fmtDate(ev.date)} {ev.time}</td>
                    <td>{ev.walkOnSlots + ev.rentalSlots}</td>
                    <td>{booked}</td>
                    <td>
                      {isPast
                        ? <span className="tag" style={{ background: "rgba(80,80,80,.2)", color: "#666", border: "1px solid #333" }}>Ended</span>
                        : ev.published
                          ? <span className="tag tag-green">Live</span>
                          : <span className="tag tag-red">Draft</span>
                      }
                    </td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...ev }); setModal(ev.id); }}>Edit</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => clone(ev)}>Clone</button>
                        {!isPast && ev.published && ev.bookings.length > 0 && (
                          <button className="btn btn-sm btn-ghost" style={{ color: "var(--accent)", borderColor: "rgba(200,255,0,.3)" }}
                            onClick={async () => {
                              showToast("Sending reminders…", "gold");
                              try {
                                const bookedUsers = ev.bookings.map(b => {
                                  const u = data.users.find(u => u.id === b.userId);
                                  return u ? { ...u, bookingType: b.type } : null;
                                }).filter(Boolean);
                                const r = await sendEventReminderEmail({ ev, bookedUsers });
                                showToast(`📧 Reminders: ${r.sent} sent${r.failed > 0 ? `, ${r.failed} failed` : ""}`, r.failed > 0 ? "gold" : "");
                              } catch(e) { showToast("Failed: " + e.message, "red"); }
                            }}>📧 Remind</button>
                        )}
                        <button className="btn btn-sm btn-ghost" style={{ fontSize:10 }}
                          onClick={() => openWaitlist(ev)} disabled={waitlistLoading} title="View waitlist">
                          🔔{ev.waitlistCount > 0 ? ` ${ev.waitlistCount}` : ""}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDelEventConfirm(ev)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              };
              return (
                <>
                  {upcoming.map(ev => renderRow(ev, false))}
                  {past.length > 0 && upcoming.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "10px 12px 6px", borderTop: "1px solid var(--border)", background: "rgba(0,0,0,.2)" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", textTransform: "uppercase" }}>Past Events</span>
                      </td>
                    </tr>
                  )}
                  {past.map(ev => renderRow(ev, true))}
                </>
              );
            })()}
          </tbody>
        </table></div>
      )}

      {/* ── CHECK-IN TAB ── */}
      {tab === "checkin" && (
        <div>

          <div className="grid-2 mb-2">
            <div className="form-group" style={{ margin: 0 }}>
              <label>Select Event</label>
              <select value={evId} onChange={e => setEvId(e.target.value)}>
                {(() => {
                  const now = new Date();
                  const upcoming = data.events
                    .filter(ev => new Date(ev.date + "T" + (ev.endTime || ev.time || "23:59") + ":00") > now)
                    .sort((a, b) => new Date(a.date) - new Date(b.date));
                  if (upcoming.length === 0)
                    return <option value="">— No upcoming events —</option>;
                  return upcoming.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title} — {fmtDate(ev.date)}</option>
                  ));
                })()}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5, letterSpacing: ".06em", textTransform: "uppercase" }}>Name / Booking ID</div>
                <input value={manual} onChange={e => setManual(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && manualCheckin()}
                  placeholder="Search player name or paste booking ID" />
              </div>
              <button className="btn btn-primary" onClick={manualCheckin}>Check In</button>
            </div>
          </div>

          {ev && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{ev.title} — {fmtDate(ev.date)}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="text-green" style={{ fontSize: 13, fontWeight: 700 }}>
                    {checkedInCount} / {ev.bookings.length} checked in
                  </span>
                  <div className="progress-bar" style={{ width: 100 }}>
                    <div className="progress-fill" style={{ width: ev.bookings.length ? (checkedInCount / ev.bookings.length * 100) + "%" : "0%" }} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => { setAddBookingForm({ userId: "", type: "walkOn", qty: 1, extras: {} }); setAddBookingModal(true); }}>+ Add Booking</button>
                </div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead>
                  <tr><th>Player</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Booked</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {ev.bookings.length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>No bookings for this event</td></tr>
                  )}
                  {[...ev.bookings].sort((a, b) => new Date(b.date) - new Date(a.date)).map(b => {
                    // Build a resolved extras list regardless of key format stored in b.extras.
                    // Keys may be: eventExtraId, eventExtraId:variantId, or raw productId:variantId.
                    const resolvedExtras = [];
                    if (b.extras && typeof b.extras === "object") {
                      Object.entries(b.extras).filter(([, v]) => v > 0).forEach(([key, qty]) => {
                        const [baseId, variantId] = key.includes(":") ? key.split(":") : [key, null];
                        // 1. Match event extra by its own id
                        let exDef    = ev.extras?.find(e => e.id === baseId);
                        // 2. Match shop product — via event extra's productId, or directly by baseId
                        let shopProd = exDef
                          ? (data.shop || []).find(p => p.id === exDef.productId)
                          : (data.shop || []).find(p => p.id === baseId);
                        // 3. If still no shopProd, search by variantId across all products
                        if (!shopProd && variantId)
                          shopProd = (data.shop || []).find(p => (p.variants || []).some(vv => vv.id === variantId));
                        // 4. If no exDef yet, try matching event extra by productId
                        if (!exDef && shopProd)
                          exDef = ev.extras?.find(e => e.productId === shopProd.id);
                        const varDef = variantId && shopProd
                          ? (shopProd.variants || []).find(vv => vv.id === variantId)
                          : null;
                        const name  = exDef?.name || shopProd?.name || baseId;
                        const label = varDef ? `${name} — ${varDef.name}` : name;
                        resolvedExtras.push({ key, label, qty });
                      });
                    }
                    const bookedExtras = resolvedExtras; // keep name for compat below

                    const downloadTicket = () => {
                      const extrasHtml = resolvedExtras.length > 0
                        ? `<tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee;width:140px">Extras</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${resolvedExtras.map(({ label, qty }) => `${label} ×${qty}`).join(", ")}</td></tr>`
                        : "";
                      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                        <title>Ticket — ${b.userName}</title>
                        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
                        <style>
                          body{font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;color:#222}
                          h1{font-size:20px;margin:0 0 4px}
                          .header{border-bottom:3px solid #222;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start}
                          table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px}
                          .ref{font-family:monospace;font-size:11px;color:#888;margin-top:4px}
                          .badge{display:inline-block;background:#000;color:#c8ff00;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:.1em;margin-bottom:20px}
                          .qr{text-align:center;margin:24px 0}
                          .footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
                          @media print{body{padding:16px}}
                        </style></head>
                        <body>
                          <div class="header">
                            <div>
                              <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" style="height:52px;width:auto;display:block;margin-bottom:4px;" />
                              <div style="font-size:13px;color:#666">Field Pass / Booking Confirmation</div>
                            </div>
                            <div class="badge">CONFIRMED</div>
                          </div>
                          <table>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee;width:140px">Player</td><td style="padding:8px 14px;border-bottom:1px solid #eee;font-weight:700">${b.userName}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Event</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${ev.title}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Date</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${fmtDate(ev.date)} @ ${ev.time} GMT</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Location</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${ev.location || "Swindon Airsoft Field"}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Ticket Type</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${b.type === "walkOn" ? "Walk-On" : "Rental Package"} ×${b.qty}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Total Paid</td><td style="padding:8px 14px;border-bottom:1px solid #eee;font-weight:700">£${b.total.toFixed(2)}</td></tr>
                            ${extrasHtml}
                          </table>
                          <div class="qr">
                            <div id="qr"></div>
                            <div class="ref">Booking Ref: ${b.id.toUpperCase()}</div>
                          </div>
                          <div style="font-size:12px;color:#444;background:#f9f9f9;padding:12px;border-left:3px solid #222">
                            Please bring this ticket (printed or on your phone) to the field. Staff will scan the QR code or check your booking reference at the gate.
                          </div>
                          <div class="footer">Generated by Swindon Airsoft Admin · ${new Date().toLocaleString("en-GB")}</div>
                          <script>new QRCode(document.getElementById("qr"),{text:"${b.id}",width:160,height:160,colorDark:"#000000",colorLight:"#ffffff"});<\/script>
                        </body></html>`;
                      const blob = new Blob([html], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `ticket-${b.userName.replace(/\s+/g,"-").toLowerCase()}-${ev.date}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    };

                    return (
                      <tr key={b.id} style={{ background: b.checkedIn ? "#1a0e08" : "transparent" }}>
                        <td style={{ fontWeight: 600 }}>{b.userName}</td>
                        <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                        <td>{b.qty}</td>
                        <td style={{ fontSize: 11 }}>
                          {resolvedExtras.length === 0
                            ? <span style={{ color: "var(--muted)" }}>—</span>
                            : resolvedExtras.map(({ key, label, qty }) => (
                                <div key={key} style={{ fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap", color: "var(--accent)" }}>
                                  {label} ×{qty}
                                </div>
                              ))
                          }
                        </td>
                        <td className="text-green">£{b.total.toFixed(2)}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{gmtShort(b.date)}</td>
                        <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                        <td>
                          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                            {!b.checkedIn
                              ? <button className="btn btn-sm btn-primary" onClick={() => doCheckin(b, ev)}>✓ In</button>
                              : <span className="text-muted" style={{ fontSize: 11 }}>✓ Done</span>
                            }
                            <button className="btn btn-sm btn-ghost" onClick={() => setViewBooking({ ...b, eventObj: ev, eventTitle: ev.title })}>View</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => openEdit({ ...b, eventTitle: ev.title, eventObj: ev })}>Edit</button>
                            {b.squareOrderId && b.total > 0 && (
                              <button className="btn btn-sm" style={{ background:"rgba(255,152,0,.12)", border:"1px solid rgba(255,152,0,.35)", color:"#ff9800", fontSize:10, padding:"3px 7px", cursor:"pointer", borderRadius:2, fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".08em", whiteSpace:"nowrap" }}
                                onClick={() => { setRefundModal({ booking: b }); setRefundAmt(b.total.toFixed(2)); setRefundNote(""); }}>£ Refund</button>
                            )}
                            <button className="btn btn-sm btn-danger" onClick={() => setDelConfirm(b)}>Del</button>
                            <button onClick={downloadTicket} style={{ background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.25)", color:"#c8ff00", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, fontSize:10, letterSpacing:".1em", padding:"3px 8px", cursor:"pointer", borderRadius:2, whiteSpace:"nowrap" }}>
                              ⬇ Ticket
                            </button>
                            <button
                              onClick={() => resendTicket(b, ev)}
                              disabled={resendBusy[b.id]}
                              style={{ background:"rgba(79,195,247,.08)", border:"1px solid rgba(79,195,247,.25)", color: resendBusy[b.id] ? "#555" : "#4fc3f7", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, fontSize:10, letterSpacing:".1em", padding:"3px 8px", cursor: resendBusy[b.id] ? "default" : "pointer", borderRadius:2, whiteSpace:"nowrap" }}
                            >
                              {resendBusy[b.id] ? "…" : "📧 Resend"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}

          {/* ── Edit Booking Modal ── */}
          {editBooking && (
            <div className="overlay" onClick={() => setEditBooking(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()}>
                <div className="modal-title">✏️ Edit Booking</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                  {editBooking.userName} — {editBooking.eventTitle}
                </div>
                <div className="form-group">
                  <label>Transfer to Different Event</label>
                  <select
                    value={editBooking.newEventId || editBooking.eventId || ""}
                    onChange={e => {
                      const val = e.target.value;
                      setEditBooking(p => ({ ...p, newEventId: val === p.eventId ? null : val }));
                    }}
                  >
                    {data.events
                      .slice()
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                      .map(ev => (
                        <option key={ev.id} value={ev.id}>
                          {ev.id === editBooking.eventId ? "★ " : ""}{ev.title} — {new Date(ev.date).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                        </option>
                      ))
                    }
                  </select>
                  {editBooking.newEventId && editBooking.newEventId !== editBooking.eventId && (
                    <div style={{ marginTop:6, padding:"6px 10px", background:"rgba(255,160,0,.1)", border:"1px solid rgba(255,160,0,.35)", borderRadius:3, fontSize:12, color:"#ffc060" }}>
                      ⚠️ This booking will be moved from <strong>{editBooking._orig.eventTitle}</strong> to <strong>{data.events.find(e => e.id === editBooking.newEventId)?.title}</strong>.
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Ticket Type</label>
                  <select value={editBooking.type} onChange={e => setEditBooking(p => ({ ...p, type: e.target.value }))}>
                    <option value="walkOn">Walk-On</option>
                    <option value="rental">Rental</option>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Quantity</label>
                    <input type="number" min={1} value={editBooking.qty}
                      onChange={e => setEditBooking(p => ({ ...p, qty: +e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Total (£)</label>
                    <input type="number" step="0.01" min={0} value={editBooking.total}
                      onChange={e => setEditBooking(p => ({ ...p, total: +e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" id="ci-edit-checkin" checked={editBooking.checkedIn}
                    onChange={e => setEditBooking(p => ({ ...p, checkedIn: e.target.checked }))} />
                  <label htmlFor="ci-edit-checkin" style={{ cursor: "pointer", fontSize: 13 }}>Checked In</label>
                </div>
                <div className="gap-2 mt-2">
                  <button className="btn btn-primary" disabled={bookingBusy} onClick={saveEdit}>
                    {bookingBusy ? "Saving…" : "Save Changes"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditBooking(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ── View Booking Modal ── */}
          {viewBooking && (() => {
            const cb = viewBooking;
            const evObj = cb.eventObj || data.events.find(e => e.id === cb.eventId) || null;
            const extras = Object.entries(cb.extras || {}).filter(([,v]) => v > 0);
            const ticketLabel = cb.type === "walkOn" ? "Walk-On" : "Rental Package";
            const ticketPrice = cb.type === "walkOn" ? evObj?.walkOnPrice : evObj?.rentalPrice;
            // Fall back to total when price can't be determined
            const ticketLineTotal = ticketPrice != null
              ? (Number(ticketPrice) * cb.qty).toFixed(2)
              : cb.total?.toFixed(2) ?? "—";
            return (
              <div className="overlay" onClick={() => setViewBooking(null)}>
                <div className="modal-box wide" onClick={e => e.stopPropagation()}>
                  <div className="modal-title">🎟 Booking Details</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,180px),1fr))", gap:"10px 24px", background:"#0d0d0d", border:"1px solid #2a2a2a", padding:16, marginBottom:16, fontSize:13 }}>
                    <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>PLAYER</span><div style={{ fontWeight:700, marginTop:3 }}>{cb.userName}</div></div>
                    <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>EVENT</span><div style={{ fontWeight:700, marginTop:3 }}>{cb.eventTitle || evObj?.title}</div></div>
                    <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>DATE</span><div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, marginTop:3 }}>{gmtShort(cb.date)}</div></div>
                    <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>STATUS</span><div style={{ marginTop:3 }}>{cb.checkedIn ? <span className="tag tag-green">✓ Checked In</span> : <span className="tag tag-blue">Booked</span>}</div></div>
                  </div>
                  <div style={{ border:"1px solid #2a2a2a", marginBottom:16 }}>
                    <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #2a2a2a" }}>ORDER</div>
                    <div style={{ padding:"0 14px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 }}>
                        <span>{ticketLabel} ×{cb.qty}</span>
                        <span style={{ color:"var(--accent)", fontFamily:"'Oswald','Barlow Condensed',sans-serif" }}>£{ticketLineTotal}</span>
                      </div>
                      {extras.map(([key, qty]) => {
                        const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
                        // 1. Match event extra by its own id
                        let exDef    = evObj?.extras?.find(e => e.id === extraId);
                        // 2. Match shop product via event extra's productId, or directly by extraId
                        let shopProd = exDef
                          ? (data?.shop || []).find(p => p.id === exDef.productId)
                          : (data?.shop || []).find(p => p.id === extraId);
                        // 3. Search by variantId across all products
                        if (!shopProd && variantId)
                          shopProd = (data?.shop || []).find(p => (p.variants || []).some(vv => vv.id === variantId));
                        // 4. Match event extra by productId if still missing
                        if (!exDef && shopProd)
                          exDef = evObj?.extras?.find(e => e.productId === shopProd.id);
                        const varDef    = variantId && shopProd
                          ? (shopProd.variants || []).find(vv => vv.id === variantId)
                          : null;
                        const name      = exDef?.name || shopProd?.name || extraId;
                        const label     = varDef ? `${name} — ${varDef.name}` : name;
                        const unitPrice = varDef ? Number(varDef.price) : (shopProd ? Number(shopProd.price) : 0);
                        return (
                          <div key={key} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 }}>
                            <span style={{ color:"var(--muted)" }}>+ {label} ×{qty}</span>
                            <span style={{ color:"var(--accent)", fontFamily:"'Oswald','Barlow Condensed',sans-serif" }}>£{(unitPrice * qty).toFixed(2)}</span>
                          </div>
                        );
                      })}
                      <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", fontSize:16, fontFamily:"'Oswald','Barlow Condensed',sans-serif" }}>
                        <span>TOTAL</span>
                        <span style={{ color:"var(--accent)" }}>£{cb.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="gap-2">
                    <button className="btn btn-ghost" onClick={() => setViewBooking(null)}>Close</button>
                    <button className="btn btn-ghost" onClick={() => { setViewBooking(null); openEdit(cb); }}>Edit Booking</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Delete Confirm Modal ── */}
          {delConfirm && (
            <div className="overlay" onClick={() => setDelConfirm(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()}>
                <div className="modal-title">🗑 Delete Booking?</div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 20px" }}>
                  Delete <strong style={{ color: "var(--text)" }}>{delConfirm.userName}</strong>'s booking for <strong style={{ color: "var(--text)" }}>{delConfirm.eventTitle || delConfirm.eventObj?.title}</strong>? This cannot be undone.
                </p>
                <div className="gap-2">
                  <button className="btn btn-danger" disabled={bookingBusy} onClick={confirmDelete}>
                    {bookingBusy ? "Deleting…" : "Yes, Delete"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setDelConfirm(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Refund Modal ── */}
          {refundModal && (
            <div className="overlay" onClick={() => !refunding && setRefundModal(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()}>
                <div className="modal-title">💸 Refund Booking</div>
                <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", padding:"12px 14px", borderRadius:4, marginBottom:16 }}>
                  <div style={{ fontWeight:700 }}>{refundModal.booking.userName}</div>
                  <div style={{ color:"var(--muted)", marginTop:2, fontSize:13 }}>{refundModal.booking.eventTitle} — {refundModal.booking.type === "walkOn" ? "Walk-On" : "Rental"} ×{refundModal.booking.qty}</div>
                  <div style={{ color:"var(--muted)", fontSize:11, marginTop:2 }}>Square ref: {refundModal.booking.squareOrderId}</div>
                </div>
                <div className="form-group">
                  <label>Refund Amount (£)</label>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input type="number" step="0.01" min="0.01" max={refundModal.booking.total}
                      value={refundAmt} onChange={e => setRefundAmt(e.target.value)} autoFocus style={{ maxWidth:120 }} />
                    <button className="btn btn-sm btn-ghost" onClick={() => setRefundAmt(refundModal.booking.total.toFixed(2))}>Full £{refundModal.booking.total.toFixed(2)}</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Note (optional)</label>
                  <input value={refundNote} onChange={e => setRefundNote(e.target.value)} placeholder="e.g. Event cancelled, player request" />
                </div>
                <p style={{ fontSize:12, color:"var(--red)", marginBottom:16 }}>⚠️ This will immediately issue a refund via Square. This cannot be undone.</p>
                <div className="gap-2">
                  <button className="btn btn-sm" style={{ background:"var(--red)", color:"#fff", border:"none", opacity: refunding ? .6 : 1 }}
                    onClick={doRefundBooking} disabled={refunding}>
                    {refunding ? "⏳ Processing…" : `✓ Confirm Refund · £${parseFloat(refundAmt||0).toFixed(2)}`}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setRefundModal(null)} disabled={refunding}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Event view modal */}
      {viewEv && (
        <div className="overlay" onClick={() => setViewId(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:4 }}>
              <div className="modal-title" style={{ margin:0 }}>📅 {viewEv.title}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => printPlayerList(viewEv)}>🖨️ Print Player List</button>
            </div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>{fmtDate(viewEv.date)} @ {viewEv.time} GMT | {viewEv.location} · {viewEv.bookings.length} booked</p>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Booked</th><th>Status</th></tr></thead>
              <tbody>
                {[...viewEv.bookings].sort((a, b) => new Date(b.date) - new Date(a.date)).map(b => (
                  <tr key={b.id}>
                    <td>{b.userName}</td>
                    <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                    <td>{b.qty}</td>
                    <td style={{fontSize:11}}>
                      {(() => {
                        const entries = b.extras ? Object.entries(b.extras).filter(([,v])=>v>0) : [];
                        if (!entries.length) return <span style={{color:"var(--muted)"}}>—</span>;
                        return entries.map(([k,v]) => {
                          const [xId, vId] = k.includes(":") ? k.split(":") : [k, null];
                          // Primary: match by extra ID on the current event
                          let exDef = viewEv.extras?.find(e => e.id === xId);
                          // Fallback: if ID not found (e.g. event extras were re-saved with new IDs),
                          // try matching via productId from shop using xId as productId
                          let shopP = exDef ? (data.shop||[]).find(p => p.id === exDef.productId) : (data.shop||[]).find(p => p.id === xId);
                          // Also try matching via variantId if no product found yet
                          if (!shopP && vId) shopP = (data.shop||[]).find(p => (p.variants||[]).some(vv => vv.id === vId));
                          const varDef = vId && shopP ? (shopP.variants||[]).find(vv => vv.id === vId) : null;
                          let label;
                          if (exDef) {
                            label = varDef ? `${exDef.name} — ${varDef.name}` : exDef.name;
                          } else if (shopP) {
                            label = varDef ? `${shopP.name} — ${varDef.name}` : shopP.name;
                          } else {
                            // Last resort: find any event extra whose productId matches xId
                            const fallbackEx = viewEv.extras?.find(e => e.productId === xId);
                            label = fallbackEx ? fallbackEx.name : xId;
                          }
                          return <div key={k} style={{color:"var(--accent)",whiteSpace:"nowrap"}}>{label} ×{v}</div>;
                        });
                      })()}
                    </td>
                    <td className="text-green">£{b.total.toFixed(2)}</td>
                    <td className="mono" style={{ fontSize:11 }}>{gmtShort(b.date)}</td>
                    <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                  </tr>
                ))}
                {viewEv.bookings.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No bookings</td></tr>}
              </tbody>
            </table></div>
            <button className="btn btn-ghost mt-2" onClick={() => setViewId(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Event edit/new modal */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === "new" ? "➕ New Event" : "✏️ Edit Event"}</div>
            <div className="form-row">
              <div className="form-group"><label>Title</label><input value={form.title} onChange={e => f("title", e.target.value)} /></div>
              <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => f("date", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Start Time (GMT)</label><input type="time" value={form.time} onChange={e => f("time", e.target.value)} /></div>
              <div className="form-group"><label>End Time (GMT)</label><input type="time" value={form.endTime||""} onChange={e => f("endTime", e.target.value)} /></div>
              <div className="form-group"><label>Location</label><input value={form.location} onChange={e => f("location", e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <div style={{ border:"1px solid var(--border)", borderRadius:4, overflow:"hidden" }}>
                {/* Toolbar */}
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", padding:"6px 8px", background:"#1a1a1a", borderBottom:"1px solid var(--border)" }}>
                  {[
                    { label:"B", title:"Bold", wrap:["**","**"] },
                    { label:"I", title:"Italic", wrap:["*","*"] },
                    { label:"H2", title:"Heading 2", line:"## " },
                    { label:"H3", title:"Heading 3", line:"### " },
                    { label:"•", title:"Bullet list", line:"- " },
                    { label:"—", title:"Divider", insert:"\n---\n" },
                  ].map(btn => (
                    <button key={btn.label} title={btn.title} type="button"
                      style={{ background:"#2a2a2a", border:"1px solid #333", color:"#ccc", width:30, height:26, fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:2 }}
                      onClick={() => {
                        const ta = document.getElementById("evt-desc-ta");
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        const val = form.description;
                        let newVal, cursor;
                        if (btn.wrap) {
                          newVal = val.slice(0,start) + btn.wrap[0] + val.slice(start,end) + btn.wrap[1] + val.slice(end);
                          cursor = end + btn.wrap[0].length + btn.wrap[1].length;
                        } else if (btn.line) {
                          const lineStart = val.lastIndexOf("\n", start-1)+1;
                          newVal = val.slice(0,lineStart) + btn.line + val.slice(lineStart);
                          cursor = start + btn.line.length;
                        } else {
                          newVal = val.slice(0,start) + btn.insert + val.slice(end);
                          cursor = start + btn.insert.length;
                        }
                        f("description", newVal);
                        setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
                      }}
                    >{btn.label}</button>
                  ))}
                  <span style={{ fontSize:10, color:"#555", marginLeft:4, alignSelf:"center" }}>Markdown supported · **bold** *italic* ## heading - list ---</span>
                </div>
                {/* Editor / Preview toggle */}
                {(() => {
                  const [descTab, setDescTab] = [form._descTab||"edit", v => f("_descTab", v)];
                  return (
                    <>
                      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"#111" }}>
                        {["edit","preview"].map(t => (
                          <button key={t} type="button" onClick={() => setDescTab(t)}
                            style={{ padding:"5px 16px", fontSize:11, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", background:"none", border:"none", borderBottom: descTab===t ? "2px solid var(--accent)" : "2px solid transparent", color: descTab===t ? "var(--accent)" : "#555", cursor:"pointer" }}>
                            {t==="edit"?"✏ EDIT":"👁 PREVIEW"}
                          </button>
                        ))}
                      </div>
                      {descTab !== "preview"
                        ? <textarea id="evt-desc-ta" rows={8} value={form.description} onChange={e => f("description", e.target.value)} style={{ width:"100%", background:"#111", border:"none", padding:"10px", resize:"vertical", color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:"none" }} />
                        : <div style={{ minHeight:160, padding:"10px 14px", background:"#0d0d0d", color:"var(--muted)", fontSize:14, lineHeight:1.8 }} dangerouslySetInnerHTML={{ __html: renderMd(form.description) || "<span style='color:#444'>Nothing to preview yet...</span>" }} />
                      }
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Walk-On Slots</label><input type="number" value={form.walkOnSlots} onChange={e => f("walkOnSlots", +e.target.value)} /></div>
              <div className="form-group"><label>Rental Slots</label><input type="number" value={form.rentalSlots} onChange={e => f("rentalSlots", +e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Walk-On Price (£)</label><input type="number" value={form.walkOnPrice} onChange={e => f("walkOnPrice", +e.target.value)} /></div>
              <div className="form-group"><label>Rental Price (£)</label><input type="number" value={form.rentalPrice} onChange={e => f("rentalPrice", +e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Banner Image</label>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "inline-block", cursor: "pointer", marginBottom: 8 }}>
                    <div className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📁 Upload Image</div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files[0]; if (!file) return;
                      // Store original file immediately — no async race condition
                      bannerFileRef.current = file;
                      // Generate preview data URL for display only
                      const reader = new FileReader();
                      reader.onload = ev => f("banner", ev.target.result);
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, lineHeight: 1.6 }}>
                    Displayed at <strong style={{ color:"var(--accent)" }}>full width × 220px</strong> — recommended image size <strong style={{ color:"var(--accent)" }}>1200 × 400px</strong> (3:1 ratio). Uploads are auto-resized to max 1200px wide.
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Or paste a URL:</div>
                  <input value={form.banner && form.banner.startsWith("data:") ? "" : (form.banner || "")}
                    onChange={e => { bannerFileRef.current = null; f("banner", e.target.value); }} placeholder="https://..." />
                </div>
                {form.banner && (
                  <div style={{ position: "relative" }}>
                    <img src={form.banner} style={{ width: 100, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} alt="" />
                    <button onClick={() => { bannerFileRef.current = null; f("banner", ""); }} style={{ position: "absolute", top: -6, right: -6, background: "var(--red)", border: "none", color: "#fff", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                )}
              </div>
            </div>
            <div className="form-group"><label>Map Embed HTML (optional)</label><textarea rows={2} value={form.mapEmbed} onChange={e => f("mapEmbed", e.target.value)} placeholder='<iframe src="..." ...></iframe>' /></div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="checkbox" id="epub" checked={form.published} onChange={e => f("published", e.target.checked)} />
                <label htmlFor="epub" style={{ cursor:"pointer", fontSize:13 }}>Published (visible to players)</label>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="checkbox" id="eviponly" checked={form.vipOnly || false} onChange={e => f("vipOnly", e.target.checked)} />
                <label htmlFor="eviponly" style={{ cursor:"pointer", fontSize:13 }}>
                  <span style={{ color:"var(--gold)", fontWeight:700 }}>⭐ VIP Members Only</span>
                  <span style={{ color:"var(--muted)", fontSize:11, marginLeft:6 }}>— visible to all but only VIPs can book</span>
                </label>
              </div>
            </div>

            {/* ── Game Day Extras ── */}
            <div style={{ border:"1px solid #2a2a2a", borderLeft:"3px solid var(--accent)", marginBottom:16 }}>
              <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #2a2a2a" }}>
                GAME DAY EXTRAS — tick shop products to offer on this event
              </div>
              <div style={{ padding:14 }}>
                {data.shop.filter(p => p.gameExtra).length === 0 && (
                  <div style={{ fontSize:12, color:"var(--muted)" }}>No products marked as Game Day Extra yet. Tick "Available as Game Day Extra" on a product in the Shop section.</div>
                )}
                {data.shop.filter(p => p.gameExtra).map(p => {
                  const existingExtra = (form.extras || []).find(ex => ex.productId === p.id);
                  const isEnabled = existingExtra && existingExtra.enabled !== false;
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #1a1a1a" }}>
                      <input type="checkbox" checked={!!isEnabled} onChange={e => {
                        const extras = form.extras || [];
                        if (e.target.checked) {
                          if (existingExtra) {
                            // Re-enable existing row
                            f("extras", extras.map(ex => ex.productId === p.id ? { ...ex, enabled: true } : ex));
                          } else {
                            f("extras", [...extras, { id: uid(), name: p.name, price: p.price, noPost: p.noPost, productId: p.id, variantId: null, enabled: true }]);
                          }
                        } else {
                          // Disable rather than remove — preserves the row in DB
                          f("extras", extras.map(ex => ex.productId === p.id ? { ...ex, enabled: false } : ex));
                        }
                      }} />
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{p.name}</span>
                        {p.noPost && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:6 }}>Collect Only</span>}
                        <span style={{ fontSize:11, color:"var(--muted)", marginLeft:8 }}>£{p.price} · stock: {p.stock}</span>
                        {p.variants?.length > 0 && <span style={{ fontSize:11, color:"var(--accent)", marginLeft:8 }}>{p.variants.length} variants</span>}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>

            {modal === "new" && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="email-announce"
                  checked={!!form._emailUsers}
                  onChange={e => f("_emailUsers", e.target.checked)}
                  style={{ accentColor: "#c8ff00", width: 16, height: 16 }}
                />
                <label htmlFor="email-announce" style={{ cursor: "pointer", fontSize: 13, color: "#8aaa60" }}>
                  📧 Send announcement email to all players <span style={{ color: "#3a5010", fontSize: 11 }}>({(data.users||[]).filter(u => u.email && u.role !== "admin").length} recipients)</span>
                </label>
              </div>
            )}
            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEvent} disabled={savingEvent}>{savingEvent ? "Saving…" : "Save Event"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scanning && <QRScanner onScan={onQRScan} onClose={() => setScanning(false)} />}

      {/* ── Waitlist View Modal ── */}
      {waitlistView && (
        <div className="overlay" onClick={() => setWaitlistView(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔔 Waitlist — {waitlistView.ev.title}</div>
            {waitlistView.entries.length === 0 ? (
              <div style={{ textAlign:"center", color:"var(--muted)", padding:"24px 0", fontSize:13 }}>No one on the waitlist for this event.</div>
            ) : (
              <>
                <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>
                  {waitlistView.entries.length} player(s) waiting · First in line gets notified when a slot opens.
                </div>
                <div className="table-wrap"><table className="data-table">
                  <thead><tr><th>#</th><th>Player</th><th>Email</th><th>Type</th><th>Joined</th><th></th></tr></thead>
                  <tbody>
                    {waitlistView.entries.map((w, i) => (
                      <tr key={w.id}>
                        <td style={{ color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{i + 1}</td>
                        <td style={{ fontWeight:600 }}>{w.user_name}</td>
                        <td style={{ fontSize:11 }}>{w.user_email}</td>
                        <td>{w.ticket_type === "walkOn" ? "🎯 Walk-On" : "🪖 Rental"}</td>
                        <td style={{ fontSize:11, fontFamily:"'Share Tech Mono',monospace" }}>{new Date(w.created_at).toLocaleDateString("en-GB")}</td>
                        <td>
                          <button className="btn btn-sm btn-ghost" style={{ color:"var(--red)", fontSize:11 }}
                            onClick={async () => {
                              try {
                                await waitlistApi.removeEntry(w.id);
                                setWaitlistView(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== w.id) }));
                                showToast("Removed from waitlist.");
                              } catch(e) { showToast("Failed: " + e.message, "red"); }
                            }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <div className="gap-2" style={{ marginTop:16 }}>
                  <button className="btn btn-primary" style={{ fontSize:11 }}
                    onClick={() => emailWaitlist(waitlistView.ev, waitlistView.entries)}>
                    📧 Email All Waitlisted Players
                  </button>
                  <button className="btn btn-ghost" onClick={() => setWaitlistView(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add Booking Modal ── */}
      {addBookingModal && (() => {
        const targetEv = data.events.find(e => e.id === evId);
        const players = [...(data.users || [])].filter(u => u.role !== "admin").sort((a,b) => a.name.localeCompare(b.name));
        const selectedPlayer = players.find(p => p.id === addBookingForm.userId);
        const ticketPrice = addBookingForm.type === "walkOn" ? (targetEv?.walkOnPrice || 0) : (targetEv?.rentalPrice || 0);
        // Calculate extras total for price preview
        const extrasPreviewTotal = Object.entries(addBookingForm.extras).filter(([,v]) => v > 0).reduce((s, [key, qty]) => {
          const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
          const ex = targetEv?.extras?.find(e => e.id === extraId);
          const lp = (data.shop || []).find(p => p.id === ex?.productId);
          const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
          const price = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
          return s + price * qty;
        }, 0);
        const previewTotal = ticketPrice * addBookingForm.qty + extrasPreviewTotal;

        return (
          <div className="overlay" onClick={() => !addBookingBusy && setAddBookingModal(false)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()}>
              <div className="modal-title">➕ Add Booking — {targetEv?.title}</div>

              {/* Player picker */}
              <div className="form-group">
                <label>Player</label>
                <select value={addBookingForm.userId} onChange={e => abf("userId", e.target.value)}
                  style={{ fontSize: 13 }}>
                  <option value="">— Select a registered player —</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.vipStatus === "active" ? " ⭐ VIP" : ""} — {p.email || "no email"}
                    </option>
                  ))}
                </select>
                {selectedPlayer && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace" }}>
                    Waiver: {selectedPlayer.waiverSigned === true && selectedPlayer.waiverYear === new Date().getFullYear()
                      ? <span style={{ color: "var(--accent)" }}>✓ Signed {selectedPlayer.waiverYear}</span>
                      : <span style={{ color: "var(--red)" }}>✗ Not signed</span>}
                    {" · "} UKARA: {selectedPlayer.ukara || "—"}
                  </div>
                )}
              </div>

              {/* Ticket type + qty */}
              <div className="form-row">
                <div className="form-group">
                  <label>Ticket Type</label>
                  <select value={addBookingForm.type} onChange={e => abf("type", e.target.value)}>
                    <option value="walkOn">🎯 Walk-On — £{targetEv?.walkOnPrice}</option>
                    <option value="rental">🪖 Rental Package — £{targetEv?.rentalPrice}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" min={1} max={10} value={addBookingForm.qty}
                    onChange={e => abf("qty", Math.max(1, +e.target.value))} />
                </div>
              </div>

              {/* Game day extras */}
              {targetEv?.extras?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".1em" }}>GAME DAY EXTRAS</label>
                  <div style={{ border: "1px solid #2a2a2a", marginTop: 6 }}>
                    {targetEv.extras.map(ex => {
                      const lp = (data.shop || []).find(p => p.id === ex.productId);
                      const hasVariants = lp?.variants?.length > 0;
                      return (
                        <div key={ex.id} style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a1a" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: hasVariants ? 8 : 0 }}>
                            {ex.name}
                            {lp && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>£{lp.price}</span>}
                          </div>
                          {hasVariants ? lp.variants.map(v => {
                            const key = ex.id + ":" + v.id;
                            const qty = addBookingForm.extras[key] || 0;
                            return (
                              <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>{v.name} — £{Number(v.price).toFixed(2)}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [key]: Math.max(0, qty - 1) })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>−</button>
                                  <span style={{ minWidth: 20, textAlign: "center", fontFamily: "'Oswald','Barlow Condensed',sans-serif" }}>{qty}</span>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [key]: qty + 1 })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>+</button>
                                </div>
                              </div>
                            );
                          }) : (() => {
                            const qty = addBookingForm.extras[ex.id] || 0;
                            return (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "var(--accent)" }}>£{lp ? lp.price : ex.price}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [ex.id]: Math.max(0, qty - 1) })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>−</button>
                                  <span style={{ minWidth: 20, textAlign: "center", fontFamily: "'Oswald','Barlow Condensed',sans-serif" }}>{qty}</span>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [ex.id]: qty + 1 })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>+</button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Price preview */}
              <div style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {addBookingForm.type === "walkOn" ? "Walk-On" : "Rental"} ×{addBookingForm.qty}
                  {extrasPreviewTotal > 0 && ` + extras`}
                </span>
                <span style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 20, color: "var(--accent)" }}>£{previewTotal.toFixed(2)}</span>
              </div>

              <div className="gap-2">
                <button className="btn btn-primary" onClick={submitAddBooking} disabled={addBookingBusy || !addBookingForm.userId}>
                  {addBookingBusy ? "Adding…" : "✓ Add Booking"}
                </button>
                <button className="btn btn-ghost" onClick={() => setAddBookingModal(false)} disabled={addBookingBusy}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {delEventConfirm && (
        <div className="overlay" onClick={() => !deletingEvent && setDelEventConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Event?</div>
            <p style={{ fontSize:13, color:"var(--muted)", margin:"12px 0 4px" }}>
              Permanently delete <strong style={{ color:"var(--text)" }}>{delEventConfirm.title}</strong>?
            </p>
            <p style={{ fontSize:12, color:"var(--red)", marginBottom:20 }}>
              ⚠️ This will also delete all {delEventConfirm.bookings?.length || 0} booking(s) for this event. This cannot be undone.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingEvent} onClick={deleteEvent}>
                {deletingEvent ? "Deleting…" : "Yes, Delete Event"}
              </button>
              <button className="btn btn-ghost" disabled={deletingEvent} onClick={() => setDelEventConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Admin Cheat Reports ────────────────────────────────────

export { AdminEventsBookings };
