// pages/EventsPage.jsx — event listing + detail + booking + waitlist
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { normaliseProfile, squareRefund, waitlistApi, holdApi } from "../api";
import { QRCode, SkeletonCard, SquareCheckoutButton, TRACKING_CACHE_KEY, TRACKING_TTL_MS, TRACKING_TTL_SHORT_MS, TrackingBlock, WaiverModal, detectCourier, fmtDate, fmtErr, gmtDate, gmtShort, loadSquareConfig, renderMd, sendAdminBookingNotification, sendCancellationEmail, sendEmail, sendOrderEmail, sendTicketEmail, sendWaitlistNotifyEmail, stockLabel, uid, useMobile } from "../utils";

function EventsPage({ data, cu, updateEvent, updateUser, showToast, setAuthModal, save, setPage }) {
  const getInitDetail = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="events" && p[1] ? p[1] : null;
  };
  const [detail, setDetailState] = useState(getInitDetail);
  const setDetail = (id) => {
    setDetailState(id);
    window.location.hash = id ? "events/" + id : "events";
  };
  const [waiverModal, setWaiverModal] = useState(false);
  const [tab, setTab] = useState("info");
  const [squareError, setSquareError] = useState(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const bookingSafetyRef = useRef(null);
  const [useCredits, setUseCredits] = useState(false);

  // ── Booking cart: { walkOn: qty, rental: qty, extras: { [id]: qty } }
  const [bCart, setBCart] = useState({ walkOn: 0, rental: 0, extras: {} });

  // ── Discount code state (events checkout)
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null); // validated code object
  const [discountError, setDiscountError] = useState('');
  const [discountChecking, setDiscountChecking] = useState(false);

  const ev = detail ? data.events.find(e => e.id === detail) : null;

  const resetCart = () => {
    setBCart({ walkOn: 0, rental: 0, extras: {} });
    setUseCredits(false);
    setDiscountInput('');
    setAppliedDiscount(null);
    setDiscountError('');
  };

  // Clear discount code when cart is emptied
  useEffect(() => {
    const cartIsEmpty = bCart.walkOn === 0 && bCart.rental === 0 && Object.keys(bCart.extras).length === 0;
    if (cartIsEmpty && appliedDiscount) {
      setAppliedDiscount(null);
      setDiscountInput('');
      setDiscountError('');
    }
  }, [bCart, appliedDiscount]);

  // Clean up booking safety timeout on unmount
  useEffect(() => () => { if (bookingSafetyRef.current) clearTimeout(bookingSafetyRef.current); }, []);

  // Waitlist state
  const [waitlistMap, setWaitlistMap] = useState({}); // eventId -> [{...}]
  const [holdMap, setHoldMap]         = useState({}); // "eventId:ticketType" -> hold | null
  const [waitlistBusy, setWaitlistBusy] = useState(false);

  const loadWaitlist = (eventId) => {
    waitlistApi.getByEvent(eventId).then(list => {
      setWaitlistMap(prev => ({ ...prev, [eventId]: list }));
    }).catch(() => {});
    // Also refresh any active holds for this event
    ["walkOn","rental"].forEach(type => {
      holdApi.getHold(eventId, type).then(hold => {
        setHoldMap(prev => ({ ...prev, [`${eventId}:${type}`]: hold }));
      }).catch(() => {});
    });
  };

  useEffect(() => {
    if (detail) loadWaitlist(detail);
  }, [detail]);

  const joinWaitlist = async (eventId, ticketType) => {
    if (!cu) { showToast("Please log in to join the waitlist", "red"); return; }
    if (cu.cardStatus === "red" || cu.cardStatus === "black") {
      showToast("Your account is currently suspended — you cannot join the waitlist.", "red"); return;
    }
    if (!(cu.waiverSigned === true && cu.waiverYear === new Date().getFullYear()) && cu.role !== "admin") {
      showToast("You must have a valid waiver signed this year to join the waitlist.", "red"); return;
    }
    setWaitlistBusy(true);
    try {
      await waitlistApi.join({ eventId, userId: cu.id, userName: cu.name, userEmail: cu.email, ticketType });
      loadWaitlist(eventId);
      showToast("You're on the waitlist! We'll email you if a slot opens.");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setWaitlistBusy(false); }
  };

  const leaveWaitlist = async (eventId, ticketType) => {
    setWaitlistBusy(true);
    try {
      await waitlistApi.leave({ eventId, userId: cu.id, ticketType });
      loadWaitlist(eventId);
      showToast("Removed from waitlist.");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setWaitlistBusy(false); }
  };

  if (ev) {
    const vipIsActive = cu?.vipStatus === "active" && (!cu?.vipExpiresAt || new Date(cu.vipExpiresAt) > new Date());
    const vipDisc   = vipIsActive ? 0.1 : 0;
    const waiverValid = (cu?.waiverSigned === true && cu?.waiverYear === new Date().getFullYear()) || cu?.role === "admin";
    const myBookings  = cu ? ev.bookings.filter(b => b.userId === cu.id) : [];

    // Per-type slots remaining
    const walkOnBooked = ev.bookings.filter(b => b.type === "walkOn").reduce((s,b) => s + b.qty, 0);
    const rentalBooked = ev.bookings.filter(b => b.type === "rental").reduce((s,b) => s + b.qty, 0);
    const walkOnLeft   = ev.walkOnSlots - walkOnBooked;
    const rentalLeft   = ev.rentalSlots - rentalBooked;
    const totalBooked  = walkOnBooked + rentalBooked;
    const totalSlots   = ev.walkOnSlots + ev.rentalSlots;

    // Cart totals
    // VIP discount: 10% on 1 ticket only (cheapest first), but NOT when using credits
    const shopData = data.shop || [];
    const visibleExtras = ev.extras; // show all event extras
    // extras keyed by "extraId" (no variant) or "extraId:variantId"
    const extraKey = (id, variantId) => variantId ? id + ":" + variantId : id;
    const getExtraQty = (id, variantId) => bCart.extras[extraKey(id, variantId)] || 0;
    let extrasTotal = Math.round(visibleExtras.reduce((s, ex) => {
      const lp = shopData.find(p => p.id === ex.productId);
      if (lp?.variants?.length > 0) {
        return s + lp.variants.reduce((vs, v) => vs + getExtraQty(ex.id, v.id) * Number(v.price), 0);
      }
      return s + getExtraQty(ex.id, null) * (lp ? Number(lp.price) : Number(ex.price));
    }, 0) * 100) / 100;
    const availCredits = cu?.credits || 0;
    // Determine if VIP discount can apply: only when NOT using credits
    const vipDiscActive = vipDisc > 0 && !useCredits;
    // VIP discount applies to 1 ticket only — cheapest ticket gets the discount
    const walkOnUnitPrice = ev.walkOnPrice;
    const rentalUnitPrice = ev.rentalPrice;
    const totalTickets = bCart.walkOn + bCart.rental;
    let vipSavings = 0;
    let walkOnTotal = bCart.walkOn * walkOnUnitPrice;
    let rentalTotal = bCart.rental * rentalUnitPrice;
    if (vipDiscActive) {
      // Apply 10% to 1 ticket — whichever type is in the cart (walkOn first, then rental)
      if (totalTickets > 0) {
        if (bCart.walkOn > 0) {
          const saving = Math.round(walkOnUnitPrice * 0.1 * 100) / 100;
          walkOnTotal = (bCart.walkOn * walkOnUnitPrice) - saving;
          vipSavings = saving;
        } else if (bCart.rental > 0) {
          const saving = Math.round(rentalUnitPrice * 0.1 * 100) / 100;
          rentalTotal = (bCart.rental * rentalUnitPrice) - saving;
          vipSavings = saving;
        }
      }
      // Apply 10% to extras regardless of whether a ticket is also in the cart.
      // vipDiscActive is already false when using credits, so no extra guard needed.
      if (extrasTotal > 0) {
        const extrasSaving = Math.round(extrasTotal * 0.1 * 100) / 100;
        extrasTotal = Math.round((extrasTotal - extrasSaving) * 100) / 100;
        vipSavings = Math.round((vipSavings + extrasSaving) * 100) / 100;
      }
    }
    // Round every money value to exactly 2 decimal places (pence-precise).
    // Floating point arithmetic on extras (e.g. 22.5 + 5.99) can silently
    // produce 28.489999999999998, which Square's fraud checks treat as a
    // mismatch between the displayed total and the charged amount — causing
    // CARD_DECLINED_AUTHORIZATION_ERROR specifically when extras are in cart.
    const grandTotal   = Math.round((walkOnTotal + rentalTotal + extrasTotal) * 100) / 100;
    const cartEmpty    = bCart.walkOn === 0 && bCart.rental === 0 && extrasTotal === 0;

    // ── Discount code savings (applied after VIP, before credits)
    let discountSaving = 0;
    if (appliedDiscount && !cartEmpty) {
      if (appliedDiscount.type === 'percent') {
        discountSaving = Math.round(grandTotal * (Number(appliedDiscount.value) / 100) * 100) / 100;
      } else {
        discountSaving = Math.min(Math.round(Number(appliedDiscount.value) * 100) / 100, grandTotal);
      }
    }
    const afterDiscount  = Math.round(Math.max(0, grandTotal - discountSaving) * 100) / 100;
    // Credits apply to game day tickets only — not extras.
    // Cap credits against the ticket subtotal (after VIP discount, before extras).
    const ticketSubtotal = Math.round((walkOnTotal + rentalTotal) * 100) / 100;
    const creditsApplied = useCredits ? Math.round(Math.min(availCredits, ticketSubtotal) * 100) / 100 : 0;
    const payTotal       = Math.round(Math.max(0, afterDiscount - creditsApplied) * 100) / 100;

    const applyDiscountCode = async () => {
      if (!discountInput.trim()) return;
      setDiscountChecking(true);
      setDiscountError('');
      setAppliedDiscount(null);
      try {
        const isVoucher = discountInput.trim().toUpperCase().startsWith('GV-');
        const result = isVoucher
          ? await api.giftVouchers.validate(discountInput.trim())
          : await api.discountCodes.validate(discountInput, cu?.id, 'events');
        setAppliedDiscount(result);
        setDiscountError('');
      } catch (e) {
        setDiscountError(e.message);
      } finally {
        setDiscountChecking(false);
      }
    };
    const setExtra = (id, qty, variantId) => {
      const extraKeyVal = extraKey(id, variantId);
      setBCart(p => {
        const next = { ...p.extras };
        if (qty > 0) next[extraKeyVal] = Math.max(0, qty); else delete next[extraKeyVal];
        return { ...p, extras: next };
      });
    };

    const setWalkOn = (n) => setBCart(p => ({ ...p, walkOn: Math.max(0, Math.min(n, walkOnLeft)) }));
    const setRental = (n) => setBCart(p => ({ ...p, rental: Math.max(0, Math.min(n, rentalLeft)) }));




    const confirmBookingAfterPayment = async (squarePayment) => {
      setBookingBusy(true);
      setSquareError(null);
      const safety = bookingSafetyRef.current = setTimeout(() => setBookingBusy(false), 30000);
      try {
        const extrasSnapshot = Object.fromEntries(Object.entries(bCart.extras).filter(([,v]) => v > 0));

        // ── Waitlist hold check: if a hold exists for this event+ticketType and it's not for this user, block ──
        if (bCart.walkOn > 0) {
          const woHold = await holdApi.getHold(ev.id, "walkOn");
          if (woHold && woHold.user_id !== cu.id) {
            const minsLeft = Math.ceil((new Date(woHold.held_until) - Date.now()) / 60000);
            clearTimeout(safety); setBookingBusy(false);
            setSquareError(`This Walk-On slot is currently reserved for a waitlisted player for ${minsLeft} more minute${minsLeft !== 1 ? "s" : ""}. If they don't book in time, it will open to everyone.`);
            return;
          }
        }
        if (bCart.rental > 0) {
          const rnHold = await holdApi.getHold(ev.id, "rental");
          if (rnHold && rnHold.user_id !== cu.id) {
            const minsLeft = Math.ceil((new Date(rnHold.held_until) - Date.now()) / 60000);
            clearTimeout(safety); setBookingBusy(false);
            setSquareError(`This Rental slot is currently reserved for a waitlisted player for ${minsLeft} more minute${minsLeft !== 1 ? "s" : ""}. If they don't book in time, it will open to everyone.`);
            return;
          }
        }

        const extrasToCheck = Object.entries(extrasSnapshot).filter(([,qty]) => qty > 0);
        if (extrasToCheck.length > 0) {
          const productIds = [...new Set(extrasToCheck.map(([key]) => {
            const [extraId] = key.includes(":") ? key.split(":") : [key, null];
            return visibleExtras.find(e => e.id === extraId)?.productId;
          }).filter(Boolean))];

          if (productIds.length > 0) {
            const { data: freshProducts } = await supabase
              .from('shop_products').select('id, stock, variants').in('id', productIds);

            const stockInsufficient = extrasToCheck.find(([key, qty]) => {
              const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
              const extra = visibleExtras.find(e => e.id === extraId);
              if (!extra?.productId) return false;
              const product = (freshProducts || []).find(p => p.id === extra.productId);
              if (!product) return false;
              if (variantId) {
                const variants = Array.isArray(product.variants) ? product.variants : [];
                const variant = variants.find(v => v.id === variantId);
                return !variant || Number(variant.stock) < qty;
              }
              return Number(product.stock) < qty;
            });

            if (stockInsufficient) {
              const [key] = stockInsufficient;
              const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
              const extra = visibleExtras.find(e => e.id === extraId);
              const name = extra?.name || "an item";
              clearTimeout(safety);
              setBookingBusy(false);
              setSquareError(`Sorry — ${name}${variantId ? " (selected variant)" : ""} just sold out while you were paying. Your payment has been taken — please contact us immediately with your Square payment reference (${squarePayment.id}) and we will refund or substitute.`);
              return;
            }
          }
        }

        // Create booking records in parallel
        // Distribute discount + credits proportionally across walkOn and rental totals
        const preDiscountTotal = grandTotal || 1; // avoid divide-by-zero
        const walkOnShare = grandTotal > 0 ? (walkOnTotal + extrasTotal) / preDiscountTotal : 0;
        const rentalShare = grandTotal > 0 ? (rentalTotal + (bCart.walkOn > 0 ? 0 : extrasTotal)) / preDiscountTotal : 0;
        const totalDeductions = discountSaving + creditsApplied;
        const walkOnPaid = Math.max(0, (walkOnTotal + extrasTotal) - totalDeductions * walkOnShare);
        const rentalPaid = Math.max(0, (rentalTotal + (bCart.walkOn > 0 ? 0 : extrasTotal)) - totalDeductions * rentalShare);

        const bookingPromises = [];
        if (bCart.walkOn > 0) {
          bookingPromises.push(api.bookings.create({
            eventId: ev.id, userId: cu.id, userName: cu.name,
            type: "walkOn", qty: bCart.walkOn,
            extras: extrasSnapshot,
            total: Math.round(walkOnPaid * 100) / 100,
            squareOrderId: squarePayment.id,
          }));
        }
        if (bCart.rental > 0) {
          bookingPromises.push(api.bookings.create({
            eventId: ev.id, userId: cu.id, userName: cu.name,
            type: "rental", qty: bCart.rental,
            extras: bCart.walkOn > 0 ? {} : extrasSnapshot,
            total: Math.round(rentalPaid * 100) / 100,
            squareOrderId: squarePayment.id,
          }));
        }
        await Promise.all(bookingPromises);

        // Clear any waitlist hold for the booked ticket types, then offer slot to next person
        try {
          const typesBooked = [];
          if (bCart.walkOn > 0) typesBooked.push("walkOn");
          if (bCart.rental > 0) typesBooked.push("rental");
          for (const type of typesBooked) {
            // Remove the booker from the waitlist (in case they were next)
            await waitlistApi.leave({ eventId: ev.id, userId: cu.id, ticketType: type }).catch(() => {});
            // Clear the hold
            await holdApi.clearHold(ev.id, type);
            // Cascade: find the new first person on the waitlist (the slot is gone, so only if another slot exists)
            // Since the slot was just taken, no need to offer to next person — slot is filled.
          }
        } catch { /* non-fatal */ }

        // Deduct credits if used
        if (creditsApplied > 0) {
          const newCredits = Math.max(0, availCredits - creditsApplied);
          await supabase.from('profiles').update({ credits: newCredits }).eq('id', cu.id);
          updateUser(cu.id, { credits: newCredits });
        }

        // Record discount code / gift voucher redemption
        if (appliedDiscount) {
          try {
            if (appliedDiscount.code?.toUpperCase().startsWith('GV-')) {
              await api.giftVouchers.redeem(appliedDiscount.code, discountSaving, cu.id, cu.name, 'events');
            } else {
              await api.discountCodes.redeem(appliedDiscount.code, cu.id, cu.name, 'events', discountSaving);
            }
          } catch { /* non-fatal */ }
        }

        // Show success immediately — stock deduction and refresh happen in background
        resetCart();
        showToast("🎉 Booked! Payment confirmed." + (creditsApplied > 0 ? ` £${creditsApplied.toFixed(2)} credits used.` : ""));

        // Send ticket email with real booking IDs
        // Retry up to 3 times with 600ms delays — DB write may not be immediately readable
        try {
          let emailBookings = [];
          for (let attempt = 0; attempt < 3 && emailBookings.length === 0; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 600));
            const { data: freshBookings } = await supabase
              .from('bookings').select('id, ticket_type, qty, total')
              .eq('user_id', cu.id).eq('event_id', ev.id)
              .order('created_at', { ascending: false }).limit(2);
            emailBookings = (freshBookings || []).map(b => ({ id: b.id, type: b.ticket_type, qty: b.qty, total: b.total }));
          }
          if (emailBookings.length > 0) {
            await sendTicketEmail({ cu, ev, bookings: emailBookings, extras: Object.fromEntries(Object.entries(bCart.extras).filter(([,v]) => v > 0)) });
            showToast("📧 Confirmation email sent!");
            // Admin notification — fire-and-forget
            sendAdminBookingNotification({
              adminEmail: data.contactEmail,
              cu, ev,
              bookings: emailBookings,
              total: emailBookings.reduce((s, b) => s + Number(b.total), 0),
            }).catch(() => {});
          } else {
            console.warn("No bookings found for email after retries");
          }
        } catch (emailErr) {
          console.error("Ticket email failed:", emailErr);
          showToast("Booking confirmed but email failed: " + (emailErr?.message || String(emailErr)), "gold");
        }

        // Background: deduct stock (non-blocking but logged)
        const deductPromises = Object.entries(extrasSnapshot)
          .filter(([,qty]) => qty > 0)
          .map(([key, qty]) => {
            const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
            const extra = visibleExtras.find(e => e.id === extraId);
            if (!extra?.productId) return Promise.resolve();
            const rpc = variantId
              ? supabase.rpc("deduct_variant_stock", { product_id: extra.productId, variant_id: variantId, qty })
              : supabase.rpc("deduct_stock", { product_id: extra.productId, qty });
            return rpc.then(({ error }) => {
              if (error) console.error("Stock deduct failed for extra", extra.name, error.message);
            }).catch(err => console.error("Stock deduct RPC error", extra.name, err?.message));
          });

        // Refresh data in background
        Promise.all([
          ...deductPromises,
          api.events.getAll().then(evList => save({ events: evList })).catch(() => {}),
          api.shop.getAll().then(freshShop => save({ shop: freshShop })).catch(() => {}),
        ]);

      } catch (e) {
        const errMsg = "Payment taken but booking failed — please contact us. Error: " + (e.message || String(e));
        setSquareError(errMsg);
        supabase.from('failed_payments').insert({
          customer_name:     cu?.name || "Unknown",
          customer_email:    cu?.email || "",
          user_id:           cu?.id || null,
          items:             [],
          total:             grandTotal || 0,
          payment_method:    "square_online",
          error_message:     errMsg,
          square_payment_id: squarePayment?.id || null,
          recorded_by:       null,
        }).then(({ error }) => { if (error) console.warn("Failed to log payment error:", error.message); });
      } finally {
        clearTimeout(safety);
        setBookingBusy(false);
      }
    };

    const isCardBanned = cu && (cu.cardStatus === "red" || cu.cardStatus === "black");
  
  const isAdmin = cu?.role === "admin";
    const isEventPast = new Date(ev.date + "T" + (ev.endTime || ev.time || "23:59") + ":00") <= new Date();
    const bookingBlocked = isEventPast || !cu || isAdmin || !waiverValid || cartEmpty || (ev.vipOnly && cu?.vipStatus !== "active") || isCardBanned;

    return (
      <div className="page-content">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setDetail(null); setTab("info"); resetCart(); }}>← Back to Events</button>
          <div style={{ display:"flex", gap:8 }}>
            {/* Add to Calendar */}
            <button
              style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".15em", padding:"5px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:6, transition:"border-color .15s, color .15s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#c8ff00";e.currentTarget.style.color="#c8ff00";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3a10";e.currentTarget.style.color="#5a7a30";}}
              onClick={() => {
                const dateStr = ev.date.replace(/-/g,"");
                const startTime = (ev.time || "09:00").replace(":","") + "00";
                const endTime   = (ev.endTime || "17:00").replace(":","") + "00";
                const dtStart   = `${dateStr}T${startTime}`;
                const dtEnd     = `${dateStr}T${endTime}`;
                const desc = (ev.description || "").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").slice(0,200);
                const ics = [
                  "BEGIN:VCALENDAR",
                  "VERSION:2.0",
                  "PRODID:-//Swindon Airsoft//EN",
                  "BEGIN:VEVENT",
                  `DTSTART:${dtStart}`,
                  `DTEND:${dtEnd}`,
                  `SUMMARY:${ev.title} — Swindon Airsoft`,
                  `DESCRIPTION:${desc}`,
                  `LOCATION:${ev.location || "Swindon, Wiltshire"}`,
                  `URL:${window.location.origin}${window.location.pathname}#events/${ev.id}`,
                  "END:VEVENT",
                  "END:VCALENDAR",
                ].join("\r\n");
                const blob = new Blob([ics], { type:"text/calendar;charset=utf-8" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href = url; a.download = `${ev.title.replace(/[^a-z0-9]/gi,"-")}.ics`; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M5 1v4M11 1v4M1 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ADD TO CALENDAR
            </button>
            {/* Share / Copy Link */}
            <button
              style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".15em", padding:"5px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:6, transition:"border-color .15s, color .15s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#c8ff00";e.currentTarget.style.color="#c8ff00";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3a10";e.currentTarget.style.color="#5a7a30";}}
              onClick={async (e) => {
                const shareUrl = `${window.location.origin}${window.location.pathname}#events/${ev.id}`;
                const shareData = { title: `${ev.title} — Swindon Airsoft`, text: `Check out this event: ${ev.title} on ${fmtDate(ev.date)}`, url: shareUrl };
                if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                  try { await navigator.share(shareData); return; } catch {}
                }
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  const btn = e.currentTarget;
                  const orig = btn.innerHTML;
                  btn.innerHTML = "✓ LINK COPIED";
                  btn.style.color = "#c8ff00"; btn.style.borderColor = "#c8ff00";
                  setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; btn.style.borderColor = ""; }, 2000);
                } catch {}
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M14 2l-6 6M7 4H3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              SHARE EVENT
            </button>
          </div>
        </div>

        {/* Banner */}
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
          <div style={{ height:380, background:"linear-gradient(135deg,#150e08,#111827)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", position:"relative" }}>
            {ev.banner ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top" }} alt="" /> : <span style={{ fontSize:28, fontWeight:900, color:"var(--accent)" }}>{ev.title}</span>}
          </div>
          {/* Military-style header */}
          <div style={{
            background:"linear-gradient(135deg,#0d1400 0%,#111 60%,#0a1000 100%)",
            padding:"18px 22px 16px",
            position:"relative",
            overflow:"hidden",
          }}>
            {/* Hex watermark */}
            <div style={{ position:"absolute", right:16, top:8, fontSize:36, opacity:.05, letterSpacing:4, color:"#c8ff00", pointerEvents:"none" }}>⬡⬡⬡⬡⬡</div>
            {/* Corner brackets */}
            {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
              <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:2,
                top:v==="top"?6:"auto", bottom:v==="bottom"?6:"auto",
                left:h==="left"?6:"auto", right:h==="right"?6:"auto",
                borderTop:v==="top"?"2px solid #c8ff00":"none",
                borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
                borderLeft:h==="left"?"2px solid #c8ff00":"none",
                borderRight:h==="right"?"2px solid #c8ff00":"none",
              }} />
            ))}
            <div style={{ fontSize:9, letterSpacing:".22em", color:"#c8ff00", fontWeight:800, fontFamily:"'Oswald','Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:8, display:"flex", gap:10, alignItems:"center" }}>
              <span>⬡ SWINDON AIRSOFT</span>
              <span style={{ color:"#3a5010" }}>◆</span>
              <span style={{ color:"#4a6820" }}>OPERATION BRIEFING</span>
              {myBookings.length > 0 && <span style={{ marginLeft:"auto", background:"rgba(0,100,0,.3)", border:"1px solid #c8ff00", color:"#c8ff00", fontSize:9, padding:"2px 10px", letterSpacing:".15em" }}>✓ DEPLOYED</span>}
            </div>
            <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, textTransform:"uppercase", letterSpacing:".05em", color:"#e8ffb0", lineHeight:1, marginBottom:10, textShadow:"0 0 30px rgba(200,255,0,.1)" }}>
              {ev.title}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
              {[
                { icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="1" stroke="#c8ff00" strokeWidth="1.5"/><path d="M5 1v4M11 1v4M1 7h14" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round"/></svg>, val:fmtDate(ev.date), color:"#c8ff00" },
                { icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#4fc3f7" strokeWidth="1.5"/><path d="M8 5v3.5l2 2" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round"/></svg>, val: ev.endTime ? `${ev.time}–${ev.endTime} GMT` : `${ev.time} GMT`, color:"#4fc3f7" },
                { icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1C5.2 1 3 3.2 3 6c0 3.8 5 9 5 9s5-5.2 5-9c0-2.8-2.2-5-5-5z" stroke="#ce93d8" strokeWidth="1.5"/><circle cx="8" cy="6" r="1.5" fill="#ce93d8"/></svg>, val:ev.location, color:"#ce93d8" },
              ].map(({icon,val,color}) => (
                <span key={val} style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".12em", color, background:"rgba(0,0,0,.4)", border:`1px solid ${color}33`, padding:"3px 10px" }}>
                  {icon} {val}
                </span>
              ))}
              <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:11, letterSpacing:".1em", color: totalBooked/totalSlots > 0.8 ? "#ff6b6b" : "#6a8a40", padding:"3px 0", marginLeft:4 }}>
                {totalBooked >= totalSlots ? "FULL" : totalBooked/totalSlots > 0.8 ? "FILLING FAST" : "AVAILABLE"}
              </span>
            </div>
            {/* Styled progress bar */}
            <div style={{ height:4, background:"#1a2a08", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:Math.min(100, totalBooked/totalSlots*100)+"%", background: totalBooked/totalSlots > 0.8 ? "#ff6b6b" : "#c8ff00", boxShadow: totalBooked/totalSlots > 0.8 ? "0 0 8px #ff6b6b" : "0 0 8px rgba(200,255,0,.5)", borderRadius:2, transition:"width .4s" }} />
            </div>
          </div>
        </div>

        <div className="nav-tabs">
          {["info","map"].map(t => <button key={t} className={`nav-tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
        </div>

        {tab === "info" && (
          <div>
            {/* Description */}
            <div style={{ marginBottom:16, position:"relative", overflow:"hidden",
              background:"radial-gradient(ellipse at 10% 20%,rgba(45,70,15,.45) 0%,transparent 45%),radial-gradient(ellipse at 85% 80%,rgba(30,55,8,.35) 0%,transparent 40%),#0b1007",
              border:"1px solid #2a3a10" }}>
              {/* Scanlines */}
              <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)" }} />
              {/* Corner brackets */}
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:2,
                  top:v==="top"?7:"auto", bottom:v==="bottom"?7:"auto",
                  left:h==="left"?7:"auto", right:h==="right"?7:"auto",
                  borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
                  borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
                }} />
              ))}
              {/* Header strip */}
              <div style={{ background:"linear-gradient(135deg,rgba(8,18,2,.97) 0%,rgba(14,26,4,.92) 100%)", borderBottom:"1px solid #2a3a10", padding:"10px 18px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:10, letterSpacing:".22em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ OPERATION BRIEFING</span>
                <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#4a6820" }}>INTEL DOCUMENT</span>
              </div>
              {/* Content */}
              <div style={{ position:"relative", zIndex:1, padding:"16px 18px", color:"#8aaa50", lineHeight:1.8, fontSize:14 }}
                dangerouslySetInnerHTML={{ __html: renderMd(ev.description) || "<span style='color:#3a5010'>No briefing available.</span>" }}
              />
            </div>

            {/* ── BOOKING CARD ── */}
            <div style={{ position:"relative", overflow:"hidden",
              background:"radial-gradient(ellipse at 15% 25%,rgba(45,70,15,.5) 0%,transparent 42%),radial-gradient(ellipse at 80% 75%,rgba(30,55,8,.4) 0%,transparent 38%),#0b1007",
              border:"1px solid #2a3a10" }}>
              {/* Scanlines */}
              <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)" }} />
              {/* Corner brackets */}
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:3,
                  top:v==="top"?7:"auto", bottom:v==="bottom"?7:"auto",
                  left:h==="left"?7:"auto", right:h==="right"?7:"auto",
                  borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
                  borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
                }} />
              ))}
              {/* Header strip */}
              <div style={{ background:"linear-gradient(135deg,rgba(8,18,2,.97) 0%,rgba(14,26,4,.92) 100%)", borderBottom:"1px solid #2a3a10", padding:"10px 18px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:10, letterSpacing:".22em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ BOOK THIS EVENT</span>
                <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#4a6820" }}>SWINDON AIRSOFT</span>
              </div>
              <div style={{ position:"relative", zIndex:1, padding:"16px 18px" }}>

              {isEventPast && <div className="alert alert-red mb-2" style={{ textAlign:"center", letterSpacing:".08em", fontWeight:700 }}>✕ This event has ended — booking is closed.</div>}
              {!isEventPast && !cu && <div className="alert alert-gold mb-2">You must be <button className="btn btn-sm btn-ghost" style={{ marginLeft:4 }} onClick={() => setAuthModal("login")}>logged in</button> to book.</div>}
              {cu && !waiverValid && <div className="alert alert-red mb-2">⚠️ Waiver required. <button className="btn btn-sm btn-ghost" style={{ marginLeft:8 }} onClick={() => setWaiverModal(true)}>Sign Waiver</button></div>}
              {ev.vipOnly && cu?.vipStatus !== "active" && (
                <div className="alert alert-gold mb-2" style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:18 }}>⭐</span>
                  <div>
                    <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"var(--gold)", letterSpacing:".06em" }}>VIP MEMBERS ONLY EVENT</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>
                      {!cu ? "Log in and" : "You need to"} become a VIP member to book this event.{" "}
                      <button className="btn btn-sm btn-ghost" style={{ padding:"2px 8px", fontSize:11 }} onClick={() => setPage("vip")}>Learn about VIP →</button>
                    </div>
                  </div>
                </div>
              )}
              {vipIsActive && <div className="alert alert-gold mb-2">⭐ VIP 10% discount applied</div>}
              {isAdmin && <div className="alert alert-red mb-2">⚠️ Admin accounts cannot make bookings.</div>}

              {/* Existing bookings */}
              {myBookings.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:9, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, marginBottom:8 }}>YOUR EXISTING BOOKINGS</div>
                  {myBookings.map(b => (
                    <div key={b.id} style={{
                      marginBottom:10, position:"relative", overflow:"hidden",
                      background:"radial-gradient(ellipse at 15% 30%,rgba(45,70,15,.5) 0%,transparent 45%),radial-gradient(ellipse at 80% 70%,rgba(30,55,8,.4) 0%,transparent 40%),#0b1007",
                      border:"1px solid #2a3a10",
                    }}>
                      {/* Scanlines */}
                      <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)" }} />
                      {/* Corner brackets */}
                      {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                        <div key={v+h} style={{ position:"absolute", width:10, height:10, zIndex:2,
                          top:v==="top"?5:"auto", bottom:v==="bottom"?5:"auto",
                          left:h==="left"?5:"auto", right:h==="right"?5:"auto",
                          borderTop:v==="top"?"1px solid #c8ff00":"none", borderBottom:v==="bottom"?"1px solid #c8ff00":"none",
                          borderLeft:h==="left"?"1px solid #c8ff00":"none", borderRight:h==="right"?"1px solid #c8ff00":"none",
                        }} />
                      ))}
                      {/* Header strip */}
                      <div style={{ background:"linear-gradient(135deg,rgba(8,18,2,.95) 0%,rgba(14,26,4,.9) 100%)", borderBottom:"1px dashed #2a3a10", padding:"7px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:9, letterSpacing:".2em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ SWINDON AIRSOFT · FIELD PASS</span>
                        <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#c8ff00", background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 8px" }}>✓ DEPLOYED</span>
                      </div>
                      {/* Body */}
                      <div style={{ position:"relative", zIndex:1, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                        <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:"8px 12px" }}>
                          {[
                            ["KIT", b.type === "walkOn" ? "Walk-On" : "Rental"],
                            ["UNITS", `×${b.qty}`],
                            ["LEVY", b.total > 0 ? `£${b.total.toFixed(2)}` : "N/A"],
                            ["REF", b.id.slice(0,8).toUpperCase()],
                          ].map(([lbl,val]) => (
                            <div key={lbl}>
                              <div style={{ fontSize:7, letterSpacing:".2em", color:"#4a6820", fontWeight:800, fontFamily:"'Oswald','Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:2 }}>{lbl}</div>
                              <div style={{ fontSize:13, fontWeight:800, fontFamily:"'Oswald','Barlow Condensed',sans-serif", color:"#c8e878" }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderLeft:"1px dashed #2a3a10", paddingLeft:12, textAlign:"center", flexShrink:0 }}>
                          <div style={{ background:"#0a0f05", border:"1px solid #2a3a10", padding:5, display:"inline-block" }}>
                            <QRCode value={b.id} size={56} />
                          </div>
                          <div style={{ fontSize:7, color:"#4a6820", marginTop:3, letterSpacing:".15em", fontFamily:"'Oswald','Barlow Condensed',sans-serif", textTransform:"uppercase" }}>Scan in</div>
                        </div>
                      </div>
                      {/* Footer barcode */}
                      <div style={{ background:"rgba(4,8,1,.8)", borderTop:"1px solid #1a2808", padding:"4px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontSize:7, color:"#283810", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>MISSION ID: {b.id.toUpperCase()}</div>
                        <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
                          {Array.from({length:20},(_,i) => <div key={i} style={{ background:"#2a3a10", width:i%3===0?2:1, height:3+Math.abs(Math.sin(i*1.4)*7), borderRadius:1 }} />)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── ADD MORE TICKETS NOTICE ── */}
              {myBookings.length > 0 && (
                <div style={{ background:"rgba(0,80,160,.12)", border:"1px solid rgba(0,140,255,.3)", padding:"10px 14px", marginBottom:12, borderRadius:3, fontSize:12, color:"#80c8ff", lineHeight:1.5 }}>
                  ℹ️ <strong style={{ color:"#a0d8ff" }}>Adding more tickets</strong> — you already have a booking for this event. Any new tickets you buy below will be added to your existing booking.
                </div>
              )}

              {/* ── TICKET BUILDER ── */}
              <div style={{ border:"1px solid #2a3a10", marginBottom:16, background:"rgba(4,8,1,.5)" }}>
                <div style={{ background:"linear-gradient(90deg,rgba(8,18,2,.98) 0%,rgba(12,22,3,.95) 100%)", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"#c8ff00", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, borderBottom:"1px solid #2a3a10", display:"flex", alignItems:"center", gap:8 }}>
                  <span>◈ ADD TICKETS TO ORDER</span>
                  <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                </div>

                {/* Walk-On row */}
                {ev.vipOnly && cu?.vipStatus !== "active" && (
                  <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--muted)", fontSize:13 }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>⭐</div>
                    <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, color:"var(--gold)", fontSize:16, letterSpacing:".06em", marginBottom:4 }}>VIP MEMBERS ONLY</div>
                    <div>Booking is restricted to VIP members for this event.</div>
                    <button className="btn btn-primary" style={{ marginTop:14, padding:"9px 24px" }} onClick={() => setPage("vip")}>Become a VIP →</button>
                  </div>
                )}
                {(!ev.vipOnly || cu?.vipStatus === "active") && (() => {
                  const wlEntries   = waitlistMap[ev.id] || [];
                  const onWalkOnWl  = cu && wlEntries.some(w => w.user_id === cu.id && w.ticket_type === "walkOn");
                  const woHold      = holdMap[`${ev.id}:walkOn`];
                  const woHeldForMe = woHold && cu && woHold.user_id === cu.id;
                  const woHeldForOther = woHold && cu && woHold.user_id !== cu.id;
                  const woMinsLeft  = woHold ? Math.max(0, Math.ceil((new Date(woHold.held_until) - Date.now()) / 60000)) : 0;
                  return (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:"1px solid #2a3a10", background: woHeldForMe ? "rgba(200,255,0,.05)" : "rgba(200,255,0,.02)" }}>
                      <div>
                        <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🎯 Walk-On</div>
                        <div style={{ fontSize:11, color: walkOnLeft === 0 ? "var(--red)" : "var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
                          £{ev.walkOnPrice}{vipDisc > 0 ? ` → £${(ev.walkOnPrice*(1-vipDisc)).toFixed(2)} VIP` : ""} · {walkOnLeft === 0 ? "FULL" : walkOnLeft <= 3 ? "ALMOST FULL" : "AVAILABLE"}
                        </div>
                        {woHeldForMe && (
                          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--accent)", marginTop:3 }}>
                            ⏱ YOUR SLOT — RESERVED {woMinsLeft} MIN LEFT
                          </div>
                        )}
                        {woHeldForOther && walkOnLeft === 0 && (
                          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--gold)", marginTop:3 }}>
                            🔒 HELD FOR WAITLIST — {woMinsLeft} MIN
                          </div>
                        )}
                        {!woHold && walkOnLeft === 0 && wlEntries.filter(w => w.ticket_type === "walkOn").length > 0 && (
                          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--muted)", marginTop:2 }}>
                            {wlEntries.filter(w => w.ticket_type === "walkOn").length} on waitlist
                          </div>
                        )}
                      </div>
                      {walkOnLeft === 0 ? (
                        woHeldForMe ? (
                          // This is the waitlisted player whose slot is being held — show booking controls
                          <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid rgba(200,255,0,.4)", background:"#0a0f05" }}>
                            <button onClick={() => setWalkOn(bCart.walkOn - 1)} disabled={bCart.walkOn === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.walkOn===0?.4:1 }}>−</button>
                            <span style={{ padding:"0 14px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:18, color: bCart.walkOn>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.walkOn}</span>
                            <button onClick={() => setWalkOn(bCart.walkOn + 1)} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer" }}>+</button>
                          </div>
                        ) : woHeldForOther ? (
                          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--gold)", textAlign:"right" }}>🔒 SLOT HELD</span>
                        ) : cu ? (
                          onWalkOnWl ? (
                            <button className="btn btn-sm" onClick={() => leaveWaitlist(ev.id, "walkOn")} disabled={waitlistBusy}
                              style={{ fontSize:10, background:"rgba(200,150,0,.15)", border:"1px solid rgba(200,150,0,.4)", color:"var(--gold)", letterSpacing:".1em" }}>
                              ✓ ON WAITLIST — LEAVE
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-primary" onClick={() => joinWaitlist(ev.id, "walkOn")} disabled={waitlistBusy}
                              style={{ fontSize:10, letterSpacing:".1em" }}>
                              🔔 NOTIFY ME
                            </button>
                          )
                        ) : (
                          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--muted)" }}>Log in to join waitlist</span>
                        )
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid #2a3a10", background:"#0a0f05" }}>
                          <button onClick={() => setWalkOn(bCart.walkOn - 1)} disabled={bCart.walkOn === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.walkOn===0?.4:1 }}>−</button>
                          <span style={{ padding:"0 14px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:18, color: bCart.walkOn>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.walkOn}</span>
                          <button onClick={() => setWalkOn(bCart.walkOn + 1)} disabled={walkOnLeft === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: walkOnLeft===0?.4:1 }}>+</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Rental row */}
                {(!ev.vipOnly || cu?.vipStatus === "active") && (() => {
                  const wlEntries    = waitlistMap[ev.id] || [];
                  const onRentalWl   = cu && wlEntries.some(w => w.user_id === cu.id && w.ticket_type === "rental");
                  const rnHold       = holdMap[`${ev.id}:rental`];
                  const rnHeldForMe  = rnHold && cu && rnHold.user_id === cu.id;
                  const rnHeldForOther = rnHold && cu && rnHold.user_id !== cu.id;
                  const rnMinsLeft   = rnHold ? Math.max(0, Math.ceil((new Date(rnHold.held_until) - Date.now()) / 60000)) : 0;
                  return (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom: ev.extras.length > 0 ? "1px solid #111a0a" : "none", background: rnHeldForMe ? "rgba(200,255,0,.05)" : undefined }}>
                      <div>
                        <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🪖 Rental Package</div>
                        <div style={{ fontSize:11, color: rentalLeft === 0 ? "var(--red)" : "var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
                          £{ev.rentalPrice}{vipDisc > 0 ? ` → £${(ev.rentalPrice*(1-vipDisc)).toFixed(2)} VIP` : ""} · {rentalLeft === 0 ? "FULL" : rentalLeft <= 3 ? "ALMOST FULL" : "AVAILABLE"}
                        </div>
                        {rnHeldForMe && (
                          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--accent)", marginTop:3 }}>
                            ⏱ YOUR SLOT — RESERVED {rnMinsLeft} MIN LEFT
                          </div>
                        )}
                        {rnHeldForOther && rentalLeft === 0 && (
                          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--gold)", marginTop:3 }}>
                            🔒 HELD FOR WAITLIST — {rnMinsLeft} MIN
                          </div>
                        )}
                        {!rnHold && rentalLeft === 0 && wlEntries.filter(w => w.ticket_type === "rental").length > 0 && (
                          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--muted)", marginTop:2 }}>
                            {wlEntries.filter(w => w.ticket_type === "rental").length} on waitlist
                          </div>
                        )}
                      </div>
                      {rentalLeft === 0 ? (
                        rnHeldForMe ? (
                          <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid rgba(200,255,0,.4)", background:"#0a0f05" }}>
                            <button onClick={() => setRental(bCart.rental - 1)} disabled={bCart.rental === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.rental===0?.4:1 }}>−</button>
                            <span style={{ padding:"0 14px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:18, color: bCart.rental>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.rental}</span>
                            <button onClick={() => setRental(bCart.rental + 1)} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer" }}>+</button>
                          </div>
                        ) : rnHeldForOther ? (
                          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--gold)", textAlign:"right" }}>🔒 SLOT HELD</span>
                        ) : cu ? (
                          onRentalWl ? (
                            <button className="btn btn-sm" onClick={() => leaveWaitlist(ev.id, "rental")} disabled={waitlistBusy}
                              style={{ fontSize:10, background:"rgba(200,150,0,.15)", border:"1px solid rgba(200,150,0,.4)", color:"var(--gold)", letterSpacing:".1em" }}>
                              ✓ ON WAITLIST — LEAVE
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-primary" onClick={() => joinWaitlist(ev.id, "rental")} disabled={waitlistBusy}
                              style={{ fontSize:10, letterSpacing:".1em" }}>
                              🔔 NOTIFY ME
                            </button>
                          )
                        ) : (
                          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--muted)" }}>Log in to join waitlist</span>
                        )
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid #2a3a10", background:"#0a0f05" }}>
                          <button onClick={() => setRental(bCart.rental - 1)} disabled={bCart.rental === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.rental===0?.4:1 }}>−</button>
                          <span style={{ padding:"0 14px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:18, color: bCart.rental>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.rental}</span>
                          <button onClick={() => setRental(bCart.rental + 1)} disabled={rentalLeft === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: rentalLeft===0?.4:1 }}>+</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Extras — only shown when buying a ticket in this transaction.
                    Players who already have a booking but no ticket in cart see a notice instead. */}
                {ev.extras.length > 0 && myBookings.length > 0 && bCart.walkOn === 0 && bCart.rental === 0 && (
                  <div style={{ margin:"0 16px 14px", padding:"10px 14px", background:"rgba(200,255,0,.04)", border:"1px solid #2a3a10", fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
                    🎒 <strong style={{ color:"var(--text)" }}>Game day extras</strong> must be purchased together with a ticket. To add extras, please contact us directly.
                  </div>
                )}
                {ev.extras.length > 0 && (bCart.walkOn > 0 || bCart.rental > 0) && (
                  <div style={{ padding:"0 16px 14px" }}>
                    <div style={{ fontSize:9, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, margin:"12px 0 8px" }}>EXTRAS</div>
                    {visibleExtras.map(ex => {
                      const lp = (data.shop || []).find(s => s.id === ex.productId);
                      const liveNoPost = lp ? lp.noPost : ex.noPost;
                      const hasVariants = lp?.variants?.length > 0;
                      return (
                        <div key={ex.id} style={{ padding:"12px 0", borderBottom:"1px solid #111a0a" }}>
                          {/* Extra name header */}
                          <div style={{ fontSize:13, fontWeight:600, color:"#fff", marginBottom:8 }}>
                            {ex.name}
                            {liveNoPost && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:6 }}>Collect Only</span>}
                          </div>
                          {hasVariants ? (
                            /* One counter row per variant */
                            lp.variants.map(v => {
                              const qty = getExtraQty(ex.id, v.id);
                              const stock = Number(v.stock);
                              const outOfStock = stock < 1;
                              return (
                                <div key={v.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", opacity: outOfStock ? 0.4 : 1 }}>
                                  <div>
                                    <span style={{ fontSize:12, color:"var(--text)" }}>{v.name}</span>
                                    <span style={{ fontSize:11, color:"var(--accent)", fontFamily:"'Oswald','Barlow Condensed',sans-serif", marginLeft:10 }}>£{Number(v.price).toFixed(2)}</span>
                                    <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginLeft:8 }}>{stockLabel(stock).text}</span>
                                  </div>
                                  <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#111", flexShrink:0 }}>
                                    <button onClick={() => setExtra(ex.id, qty - 1, v.id)} disabled={qty === 0 || outOfStock} style={{ background:"none", border:"none", color:"var(--text)", padding:"5px 11px", cursor:"pointer", opacity: qty===0?0.3:1 }}>−</button>
                                    <span style={{ padding:"0 10px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:15, color: qty > 0 ? "var(--accent)" : "var(--text)", minWidth:26, textAlign:"center" }}>{qty}</span>
                                    <button onClick={() => setExtra(ex.id, qty + 1, v.id)} disabled={outOfStock || qty >= stock} style={{ background:"none", border:"none", color:"var(--text)", padding:"5px 11px", cursor:"pointer", opacity: (outOfStock||qty>=stock)?0.3:1 }}>+</button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            /* No variants — single counter */
                            (() => {
                              const qty = getExtraQty(ex.id, null);
                              const livePrice = lp ? lp.price : ex.price;
                              const stock = lp ? lp.stock : 999;
                              return (
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                  <span style={{ fontSize:12, color:"var(--accent)", fontFamily:"'Oswald','Barlow Condensed',sans-serif" }}>£{Number(livePrice).toFixed(2)}</span>
                                  <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#111" }}>
                                    <button onClick={() => setExtra(ex.id, qty - 1, null)} disabled={qty === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"6px 12px", cursor:"pointer", opacity: qty===0?0.3:1 }}>−</button>
                                    <span style={{ padding:"0 12px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:16, color: qty > 0 ? "var(--accent)" : "var(--text)", minWidth:30, textAlign:"center" }}>{qty}</span>
                                    <button onClick={() => setExtra(ex.id, qty + 1, null)} disabled={qty >= stock} style={{ background:"none", border:"none", color:"var(--text)", padding:"6px 12px", cursor:"pointer", opacity: qty>=stock?0.3:1 }}>+</button>
                                  </div>
                                </div>
                              );
                            })()
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Order summary */}
              {!cartEmpty && (
                <div style={{ background:"#0d0d0d", border:"1px solid #1e2e12", padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:9, letterSpacing:".25em", color:"var(--muted)", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, marginBottom:12 }}>ORDER SUMMARY</div>
                  {bCart.walkOn > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                      <span className="text-muted">🎯 Walk-On ×{bCart.walkOn}</span>
                      <span>£{walkOnTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {bCart.rental > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                      <span className="text-muted">🪖 Rental ×{bCart.rental}</span>
                      <span>£{rentalTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {visibleExtras.flatMap(ex => {
                    const lp = (data.shop || []).find(s => s.id === ex.productId);
                    if (lp?.variants?.length > 0) {
                      return lp.variants
                        .filter(v => getExtraQty(ex.id, v.id) > 0)
                        .map(v => {
                          const extraQty = getExtraQty(ex.id, v.id);
                          return (
                            <div key={ex.id + ":" + v.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                              <span className="text-muted">{ex.name} — {v.name} ×{extraQty}</span>
                              <span>£{(extraQty * Number(v.price)).toFixed(2)}</span>
                            </div>
                          );
                        });
                    }
                    const extraQty = getExtraQty(ex.id, null);
                    if (!extraQty) return [];
                    const livePrice = lp ? lp.price : ex.price;
                    return [(
                      <div key={ex.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                        <span className="text-muted">{ex.name} ×{extraQty}</span>
                        <span>£{(extraQty * Number(livePrice)).toFixed(2)}</span>
                      </div>
                    )];
                  })}
                  {vipDisc > 0 && !cartEmpty && (
                    <div style={{ fontSize:11, color: useCredits ? "var(--muted)" : "var(--gold)", marginBottom:8, padding:"6px 10px", background: useCredits ? "rgba(255,255,255,.03)" : "rgba(200,160,0,.06)", border:"1px solid", borderColor: useCredits ? "#1e2e12" : "rgba(200,160,0,.2)", borderRadius:3 }}>
                      {useCredits
                        ? "⚠️ VIP discount is not applied when using credits"
                        : totalTickets > 1
                          ? `★ VIP discount: 10% off 1 ticket + extras (−£${vipSavings.toFixed(2)}). Full price applies to remaining ${totalTickets - 1} ticket${totalTickets - 1 > 1 ? "s" : ""}.`
                          : `★ VIP 10% discount applied to ticket & extras — saving £${vipSavings.toFixed(2)}`
                      }
                    </div>
                  )}
                  {/* Discount code input */}
                  {cu && !cartEmpty && !isAdmin && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted)', fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>🏷️ Discount / Voucher Code</div>
                      {!appliedDiscount ? (
                        <div style={{ display: 'flex', gap: 0 }}>
                          <input
                            value={discountInput}
                            onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(''); }}
                            onKeyDown={e => e.key === 'Enter' && applyDiscountCode()}
                            placeholder="ENTER CODE"
                            style={{ flex: 1, background: '#0c1009', border: '1px solid #2a3a10', borderRight: 'none', color: '#c8e878', fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '.12em', padding: '8px 10px', outline: 'none', textTransform: 'uppercase' }}
                            onFocus={e => e.target.style.borderColor = '#4a6820'}
                            onBlur={e => e.target.style.borderColor = '#2a3a10'}
                          />
                          <button onClick={applyDiscountCode} disabled={discountChecking || !discountInput.trim()}
                            style={{ background: discountInput.trim() ? 'rgba(200,255,0,.15)' : 'rgba(200,255,0,.04)', border: '1px solid #2a3a10', color: discountInput.trim() ? '#c8ff00' : '#3a5010', fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: '.1em', padding: '8px 14px', cursor: discountInput.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all .15s' }}>
                            {discountChecking ? '⏳' : 'APPLY'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(200,255,0,.08)', border: '1px solid rgba(200,255,0,.3)', borderLeft: '3px solid #c8ff00' }}>
                          <div>
                            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: '#c8ff00', letterSpacing: '.08em' }}>
                              ✓ {appliedDiscount.code}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                              {appliedDiscount.type === 'percent' ? `${appliedDiscount.value}% off` : `£${Number(appliedDiscount.value).toFixed(2)} off`} applied
                            </div>
                          </div>
                          <button onClick={() => { setAppliedDiscount(null); setDiscountInput(''); setDiscountError(''); }}
                            style={{ background: 'none', border: '1px solid #2a3a10', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '4px 8px', fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700 }}>REMOVE</button>
                        </div>
                      )}
                      {discountError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ {discountError}</div>}
                    </div>
                  )}
                  {appliedDiscount && discountSaving > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: '#c8ff00', background: 'rgba(200,255,0,.05)', padding: '3px 6px', borderRadius: 2 }}>
                      <span>🏷️ Code: {appliedDiscount.code}</span>
                      <span style={{ fontWeight: 700 }}>−£{discountSaving.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Credits toggle */}
                  {cu && availCredits > 0 && !cartEmpty && (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", background:"rgba(0,120,255,.06)", border:"1px solid rgba(0,120,255,.2)", borderRadius:3, marginTop:4, marginBottom:4 }}>
                      <div>
                        <span style={{ fontSize:12, color:"#60a0ff" }}>💳 Account Credits — £{availCredits.toFixed(2)} available</span>
                        <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>Credits apply to tickets only, not game day extras</div>
                        {vipDisc > 0 && <div style={{ fontSize:10, color:"var(--muted)", marginTop:1 }}>Note: using credits disables the VIP discount</div>}
                      </div>
                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                        <input type="checkbox" checked={useCredits} onChange={e => setUseCredits(e.target.checked)} />
                        <span style={{ fontSize:11, color:"var(--muted)" }}>Apply</span>
                      </label>
                    </div>
                  )}
                  {creditsApplied > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4, color:"#60a0ff" }}>
                      <span>Credits applied</span>
                      <span>−£{creditsApplied.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ borderTop:"1px solid #1e2e12", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:22, color:"#fff" }}>
                    <span>TOTAL</span>
                    <span style={{ color:"var(--accent)" }}>£{payTotal.toFixed(2)}</span>
                  </div>
                  {creditsApplied > 0 && payTotal === 0 && (
                    <div style={{ fontSize:11, color:"var(--muted)", textAlign:"center", marginTop:4 }}>Fully covered by credits — no payment needed</div>
                  )}
                </div>
              )}

              {cartEmpty && cu && waiverValid && (
                <div style={{ textAlign:"center", padding:"20px 0", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>
                  ▸ Select tickets above to proceed
                </div>
              )}

              {squareError && <div className="alert alert-red mt-1">⚠️ {squareError}</div>}
              {bookingBusy && <div className="alert alert-blue mt-1">⏳ Confirming your booking…</div>}

              {cu && cu.cardStatus === "yellow" && (
                <div style={{ background:"rgba(200,160,0,.1)", border:"1px solid rgba(200,160,0,.4)", padding:"12px 14px", marginBottom:10, borderRadius:3 }}>
                  <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, color:"var(--gold)", marginBottom:4 }}>🟡 YELLOW CARD — FORMAL WARNING</div>
                  <div style={{ fontSize:12, color:"#c8a030", lineHeight:1.6 }}>You have received a formal warning from staff. Please review the site rules. Further violations may result in a Red Card ban.{cu.cardReason && <><br/><em>Reason: {cu.cardReason}</em></>}</div>
                </div>
              )}
              {cu && isCardBanned && (
                <div style={{ background:"rgba(220,30,30,.1)", border:"1px solid rgba(220,30,30,.4)", padding:"12px 14px", marginBottom:10, borderRadius:3 }}>
                  <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, color:"var(--red)", marginBottom:4 }}>
                    {cu.cardStatus === "red" ? "🔴 RED CARD — TEMPORARY BAN" : "⚫ BLACK CARD — ACCOUNT SUSPENDED"}
                  </div>
                  <div style={{ fontSize:12, color:"#ff8080", lineHeight:1.6 }}>
                    {cu.cardStatus === "red" ? "You are banned for 1 game day. Booking is currently disabled." : "Your account is suspended pending review by the site owner."}
                    {cu.cardReason && <><br/><em>Reason: {cu.cardReason}</em></>}
                  </div>
                </div>
              )}

              {!cu && (
                <button className="btn btn-primary" style={{ width:"100%", padding:"12px", fontSize:14, letterSpacing:".1em" }} onClick={() => setAuthModal("login")}>
                  LOG IN TO BOOK
                </button>
              )}
              {cu && !waiverValid && (
                <button className="btn btn-primary" style={{ width:"100%", padding:"12px", fontSize:14 }} onClick={() => setWaiverModal(true)}>
                  SIGN WAIVER TO CONTINUE
                </button>
              )}
              {!bookingBlocked && payTotal > 0 && (
                <SquareCheckoutButton
                  amount={payTotal}
                  description={`${ev.title} — ${[bCart.walkOn>0 && `${bCart.walkOn}x Walk-On`, bCart.rental>0 && `${bCart.rental}x Rental`].filter(Boolean).join(", ")}`}
                  onSuccess={confirmBookingAfterPayment}
                  disabled={bookingBusy}
                />
              )}
              {!bookingBlocked && payTotal === 0 && !cartEmpty && (
                <button className="btn btn-primary" style={{ width:"100%", padding:"13px", fontSize:14, letterSpacing:".1em" }}
                  disabled={bookingBusy}
                  onClick={() => confirmBookingAfterPayment({ id: "CREDITS-" + Date.now(), status: "COMPLETED" })}>
                  {bookingBusy ? "⏳ Confirming…" : "✓ CONFIRM — FULLY COVERED BY CREDITS"}
                </button>
              )}
              </div>
            </div>
          </div>
        )}

        {tab === "map" && (
          <div style={{ borderRadius:4, overflow:"hidden", border:"1px solid var(--border)" }}>
            {ev.mapEmbed ? (
              <div style={{ width:"100%", height:"clamp(340px,60vh,620px)", lineHeight:0 }}>
                {(() => {
                  // Security: extract only the src from the embed HTML — never inject raw HTML
                  // This prevents XSS while still rendering the map
                  const srcMatch = ev.mapEmbed.match(/src=["']([^"']+)["']/);
                  const src = srcMatch ? srcMatch[1] : null;
                  // Only allow Google Maps and OpenStreetMap embed URLs
                  const isSafeUrl = src && (
                    src.startsWith("https://www.google.com/maps/") ||
                    src.startsWith("https://maps.google.com/") ||
                    src.startsWith("https://www.openstreetmap.org/") ||
                    src.startsWith("https://embed.maps.apple.com/")
                  );
                  return isSafeUrl
                    ? <iframe src={src} style={{ width:"100%", height:"100%", border:0, display:"block" }} title="Event location map" loading="lazy" referrerPolicy="no-referrer" />
                    : <div style={{ height:260, background:"var(--bg4)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--red)", fontSize:13 }}>Invalid map URL — only Google Maps and OpenStreetMap embeds are supported.</div>;
                })()}
              </div>
            ) : (
              <div style={{ height:260, background:"var(--bg4)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--muted)", fontSize:13 }}>
                No map configured for this event
              </div>
            )}
            <div style={{ background:"var(--bg2)", padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>📍 {ev.location}</div>
                <div style={{ fontSize:12, color:"var(--muted)" }}>{fmtDate(ev.date)} · {ev.time}{ev.endTime ? `–${ev.endTime}` : ""} GMT</div>
              </div>
              <a href={(() => {
  // Extract exact coordinates from the map embed (most precise)
  if (ev.mapEmbed) {
    const srcMatch = ev.mapEmbed.match(/src="([^"]+)"/);
    if (srcMatch) {
      const embedUrl = decodeURIComponent(srcMatch[1]);
      // Google Maps embed pb= format: !2d<longitude>!3d<latitude>
      const coordMatch = embedUrl.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      if (coordMatch) {
        return `https://www.google.com/maps/dir/?api=1&destination=${coordMatch[2]},${coordMatch[1]}`;
      }
      // q= param (place name or coords)
      const qMatch = embedUrl.match(/[?&]q=([^&]+)/);
      if (qMatch) {
        return `https://www.google.com/maps/dir/?api=1&destination=${qMatch[1]}`;
      }
    }
  }
  // Fall back to location text field
  if (ev.location && ev.location.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.location.trim())}`;
  }
  return `https://www.google.com/maps/search/Swindon+Airsoft+Field`;
})()} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
  <button className="btn btn-primary" style={{ padding:"9px 20px", fontSize:13 }}>🗺️ Get Directions</button>
</a>
            </div>
          </div>
        )}

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
        }} onClose={() => setWaiverModal(false)} showToast={showToast} editMode={waiverModal === "edit"} existing={cu.waiverData} addPlayerMode={waiverModal === "addPlayer"} />}
      </div>
    );
  }

  // ── Event list ──
  const publishedEvents = data.events.filter(e => e.published);
  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      {/* Header */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:1100, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — ACTIVE OPERATIONS — ◈</div>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            UPCOMING <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>OPERATIONS</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>▸ SELECT A MISSION AND REPORT FOR DUTY ◂</div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 16px 80px" }}>
        {publishedEvents.length === 0 && data.events.length === 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16, marginBottom:40 }}>
            {Array.from({length:3}).map((_,i) => <SkeletonCard key={i} height={320} />)}
          </div>
        )}
        {publishedEvents.length === 0 && data.events.length > 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>NO OPERATIONS SCHEDULED — CHECK BACK SOON</div>
        )}
        {(() => {
          const now = new Date();
          const upcomingEvents = publishedEvents.filter(ev => new Date(ev.date + "T" + (ev.endTime || ev.time || "23:59") + ":00") > now);
          const pastEvents    = publishedEvents.filter(ev => new Date(ev.date + "T" + (ev.endTime || ev.time || "23:59") + ":00") <= now);
          const operationCodes = ["ALPHA","BRAVO","CHARLIE","DELTA","ECHO","FOXTROT","GOLF","HOTEL"];

          const renderCard = (ev, idx, isPast) => {
            const booked = ev.bookings.reduce((s,b) => s + b.qty, 0);
            const total  = ev.walkOnSlots + ev.rentalSlots;
            const fillPct = total > 0 ? booked / total : 0;
            const isFull = fillPct >= 1;
            const isAlmostFull = fillPct >= 0.8;
            const opCode = operationCodes[idx % operationCodes.length];
            return (
              <div key={ev.id}
                onClick={() => { if (!isPast) { setDetail(ev.id); setTab("info"); resetCart(); } }}
                style={{
                  background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden",
                  cursor:"pointer", position:"relative", transition:"border-color .15s, transform .15s",
                }}
                onMouseEnter={e => { if (!isPast) { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-3px)"; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor= isPast ? "#111" : "#1a2808"; e.currentTarget.style.transform=""; }}
              >
                {/* Scanlines */}
                <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents:"none", zIndex:5 }} />
                {/* Corner brackets */}
                {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                  <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:6,
                    top:v==="top"?6:"auto", bottom:v==="bottom"?6:"auto",
                    left:h==="left"?6:"auto", right:h==="right"?6:"auto",
                    borderTop:v==="top"?"1px solid #c8ff00":"none", borderBottom:v==="bottom"?"1px solid #c8ff00":"none",
                    borderLeft:h==="left"?"1px solid #c8ff00":"none", borderRight:h==="right"?"1px solid #c8ff00":"none",
                    opacity:.5,
                  }} />
                ))}

                {/* Banner image */}
                <div style={{ height:180, background:"#080a06", overflow:"hidden", position:"relative" }}>
                  {ev.banner
                    ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.8)", transition:"transform .3s" }}
                        onMouseOver={e => e.currentTarget.style.transform="scale(1.03)"}
                        onMouseOut={e => e.currentTarget.style.transform=""} alt="" />
                    : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#0c1009,#080a06)", gap:8 }}>
                        <div style={{ fontSize:36, opacity:.1 }}>🎯</div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#1e2c0a" }}>NO IMAGERY CLASSIFIED</div>
                      </div>
                  }
                  {/* Gradient overlay */}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:60, background:"linear-gradient(to top,rgba(12,16,9,1),transparent)", zIndex:2 }} />
                  {/* Top ID strip */}
                  <div style={{ position:"absolute", top:0, left:0, right:0, background:"rgba(0,0,0,.7)", borderBottom:"1px solid rgba(200,255,0,.15)", padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:3 }}>
                    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#c8ff00", opacity:.7 }}>SA · OP-{opCode}</span>
                    <div style={{ display:"flex", gap:4 }}>
                      <span style={{ background:"#c8ff00", color:"#000", fontSize:8, fontWeight:900, padding:"2px 8px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", letterSpacing:".12em" }}>SKIRMISH</span>
                      {ev.vipOnly && <span style={{ background:"#c8a000", color:"#000", fontSize:8, fontWeight:900, padding:"2px 8px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", letterSpacing:".12em" }}>★ VIP</span>}
                    </div>
                  </div>
                  {/* Full badge */}
                  {isFull && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:4 }}>
                      <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".2em", color:"#ef4444", border:"2px solid #ef4444", padding:"6px 18px", transform:"rotate(-5deg)" }}>FULLY DEPLOYED</div>
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div style={{ padding:"14px 14px 0", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:".08em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1.1, marginBottom:10 }}>{ev.title}</div>
                  {/* Data rows */}
                  <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                    {[
                      { icon:"▸", label:"DATE", val:fmtDate(ev.date), color:"#c8ff00" },
                      { icon:"▸", label:"TIME", val:`${ev.time}${ev.endTime ? `–${ev.endTime}` : ""} GMT`, color:"#4fc3f7" },
                      { icon:"▸", label:"LOCATION", val:ev.location, color:"#ce93d8" },
                    ].map(row => (
                      <div key={row.label} style={{ display:"flex", gap:8, alignItems:"baseline" }}>
                        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"#2a3a10", flexShrink:0, width:58 }}>{row.label}</span>
                        <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:13, fontWeight:700, color:"#9ab870", letterSpacing:".04em" }}>{row.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Capacity bar */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"#2a3a10" }}>CAPACITY</span>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color: isFull ? "#ef4444" : isAlmostFull ? "#f97316" : "#3a5010", letterSpacing:".1em" }}>
                        {isFull ? "FULL" : isAlmostFull ? "FILLING FAST" : "AVAILABLE"}
                      </span>
                    </div>
                    <div style={{ height:3, background:"#0a0f06", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.min(100, fillPct*100)}%`, background: isAlmostFull ? "#ef4444" : "#c8ff00", boxShadow: isAlmostFull ? "0 0 6px #ef4444" : "0 0 6px rgba(200,255,0,.5)", borderRadius:2, transition:"width .4s" }} />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.3)", position:"relative", zIndex:6 }}>
                  <div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".15em", color:"#2a3a10", marginBottom:2 }}>FROM</div>
                    <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"#c8ff00", lineHeight:1 }}>
                      £{Math.min(ev.walkOnPrice, ev.rentalPrice)}
                    </div>
                  </div>
                  {isPast ? (
                    <button disabled style={{ padding:"8px 16px", fontSize:10, letterSpacing:".12em", borderRadius:0, background:"rgba(60,60,60,.2)", border:"1px solid rgba(100,100,100,.3)", color:"#555", cursor:"not-allowed" }}>
                      ✕ EVENT FINISHED
                    </button>
                  ) : isFull ? (
                    <button className="btn btn-primary" style={{ padding:"8px 16px", fontSize:10, letterSpacing:".12em", borderRadius:0, background:"rgba(200,150,0,.15)", border:"1px solid rgba(200,150,0,.5)", color:"var(--gold)" }}>
                      🔔 WAITLIST
                    </button>
                  ) : (
                    <button className="btn btn-primary" style={{ padding:"8px 20px", fontSize:11, letterSpacing:".18em", borderRadius:0 }}>
                      ▸ DEPLOY
                    </button>
                  )}
                </div>

                {/* Barcode strip */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"4px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".08em" }}>
                    {ev.id ? ev.id.slice(0,12).toUpperCase() : "------------"}
                  </div>
                  <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
                    {Array.from({length:22},(_,i) => (
                      <div key={i} style={{ background:"#1a2808", width:i%3===0?2:1, height:3+Math.abs(Math.sin(i*1.9)*5), borderRadius:1 }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          };

          return (
            <>
              {/* Upcoming events grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
                {upcomingEvents.map((ev, idx) => renderCard(ev, idx, false))}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Gift Voucher Page ─────────────────────────────────────────

export { EventsPage };
