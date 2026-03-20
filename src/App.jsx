// ─────────────────────────────────────────────────────────────
// App.jsx  —  Public-facing pages + AppInner + root App export
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { normaliseProfile, squareRefund, waitlistApi, holdApi } from "./api";
import {
  renderMd, stockLabel, fmtErr,
  gmtNow, gmtDate, gmtShort, fmtDate, uid,
  CSS,
  loadSquareConfig, SquareCheckoutButton,
  TRACKING_CACHE_KEY, TRACKING_TTL_MS, TRACKING_TTL_SHORT_MS,
  detectCourier, TrackingBlock,
  useData,
  SkeletonCard, Toast, useMobile, useToast,
  GmtClock, Countdown, QRCode, QRScanner,
  SupabaseAuthModal, WaiverModal, PublicNav,
  sendEmail, sendOrderEmail, sendDispatchEmail,
  sendAdminOrderNotification, sendAdminBookingNotification,
  sendWelcomeEmail, sendTicketEmail, sendCancellationEmail,
  sendWaitlistNotifyEmail, sendAdminReturnNotification,
  HomePage, CountdownPanel,
} from "./utils";
import { AdminPanel, AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage } from "./AdminPanel";
// jsQR is loaded via CDN in the QRScanner component — no import needed

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
        const result = await api.discountCodes.validate(discountInput, cu?.id, 'events');
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

        // ── Duplicate booking guard: check DB for existing booking by this user for this event ──
        const { data: existingBookings } = await supabase
          .from('bookings').select('id').eq('event_id', ev.id).eq('user_id', cu.id).limit(1);
        if (existingBookings && existingBookings.length > 0) {
          clearTimeout(safety);
          setBookingBusy(false);
          setSquareError("You already have a booking for this event. If you need to change it, please cancel your existing booking first.");
          return;
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

        // Record discount code redemption
        if (appliedDiscount) {
          try {
            await api.discountCodes.redeem(appliedDiscount.code, cu.id, cu.name, 'events', discountSaving);
          } catch { /* non-fatal */ }
        }

        // Show success immediately — stock deduction and refresh happen in background
        resetCart();
        showToast("🎉 Booked! Payment confirmed." + (creditsApplied > 0 ? ` £${creditsApplied.toFixed(2)} credits used.` : ""));

        // Fire-and-forget Xero sales receipt — never blocks or breaks the booking flow
        try {
          const xeroAccountCode = await api.settings.get("xero_account_code").catch(() => "200");
          const xeroBookings = [];
          if (bCart.walkOn > 0) xeroBookings.push({ type: "walkOn", qty: bCart.walkOn, total: Math.round(walkOnPaid * 100) / 100 });
          if (bCart.rental > 0) xeroBookings.push({ type: "rental", qty: bCart.rental, total: Math.round(rentalPaid * 100) / 100 });
          if (xeroBookings.length > 0 && squarePayment.id && !squarePayment.mock) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-sale`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                userId:        cu.id,
                userName:      cu.name,
                userEmail:     cu.email,
                eventTitle:    ev.title,
                eventDate:     ev.date,
                bookings:      xeroBookings,
                squareOrderId: squarePayment.id,
                accountCode:   xeroAccountCode || "200",
              }),
            }).catch(e => console.warn("Xero fire-and-forget error:", e.message));
          }
        } catch (xeroErr) {
          console.warn("Xero setup error (non-fatal):", xeroErr.message);
        }

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
    const bookingBlocked = !cu || isAdmin || !waiverValid || cartEmpty || (ev.vipOnly && cu?.vipStatus !== "active") || isCardBanned;

    return (
      <div className="page-content">
        <button className="btn btn-ghost btn-sm mb-2" onClick={() => { setDetail(null); setTab("info"); resetCart(); }}>← Back to Events</button>

        {/* Banner */}
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
          <div style={{ height:220, background:"linear-gradient(135deg,#150e08,#111827)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", position:"relative" }}>
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
            <div style={{ fontSize:9, letterSpacing:".22em", color:"#c8ff00", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:8, display:"flex", gap:10, alignItems:"center" }}>
              <span>⬡ SWINDON AIRSOFT</span>
              <span style={{ color:"#3a5010" }}>◆</span>
              <span style={{ color:"#4a6820" }}>OPERATION BRIEFING</span>
              {myBookings.length > 0 && <span style={{ marginLeft:"auto", background:"rgba(0,100,0,.3)", border:"1px solid #c8ff00", color:"#c8ff00", fontSize:9, padding:"2px 10px", letterSpacing:".15em" }}>✓ DEPLOYED</span>}
            </div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, textTransform:"uppercase", letterSpacing:".05em", color:"#e8ffb0", lineHeight:1, marginBottom:10, textShadow:"0 0 30px rgba(200,255,0,.1)" }}>
              {ev.title}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
              {[
                { icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="1" stroke="#c8ff00" strokeWidth="1.5"/><path d="M5 1v4M11 1v4M1 7h14" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round"/></svg>, val:fmtDate(ev.date), color:"#c8ff00" },
                { icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#4fc3f7" strokeWidth="1.5"/><path d="M8 5v3.5l2 2" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round"/></svg>, val: ev.endTime ? `${ev.time}–${ev.endTime} GMT` : `${ev.time} GMT`, color:"#4fc3f7" },
                { icon:<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1C5.2 1 3 3.2 3 6c0 3.8 5 9 5 9s5-5.2 5-9c0-2.8-2.2-5-5-5z" stroke="#ce93d8" strokeWidth="1.5"/><circle cx="8" cy="6" r="1.5" fill="#ce93d8"/></svg>, val:ev.location, color:"#ce93d8" },
              ].map(({icon,val,color}) => (
                <span key={val} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".12em", color, background:"rgba(0,0,0,.4)", border:`1px solid ${color}33`, padding:"3px 10px" }}>
                  {icon} {val}
                </span>
              ))}
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:11, letterSpacing:".1em", color: totalBooked/totalSlots > 0.8 ? "#ff6b6b" : "#6a8a40", padding:"3px 0", marginLeft:4 }}>
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
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:10, letterSpacing:".22em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ OPERATION BRIEFING</span>
                <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#4a6820" }}>INTEL DOCUMENT</span>
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
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:10, letterSpacing:".22em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ BOOK THIS EVENT</span>
                <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#4a6820" }}>SWINDON AIRSOFT</span>
              </div>
              <div style={{ position:"relative", zIndex:1, padding:"16px 18px" }}>

              {!cu && <div className="alert alert-gold mb-2">You must be <button className="btn btn-sm btn-ghost" style={{ marginLeft:4 }} onClick={() => setAuthModal("login")}>logged in</button> to book.</div>}
              {cu && !waiverValid && <div className="alert alert-red mb-2">⚠️ Waiver required. <button className="btn btn-sm btn-ghost" style={{ marginLeft:8 }} onClick={() => setWaiverModal(true)}>Sign Waiver</button></div>}
              {ev.vipOnly && cu?.vipStatus !== "active" && (
                <div className="alert alert-gold mb-2" style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:18 }}>⭐</span>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"var(--gold)", letterSpacing:".06em" }}>VIP MEMBERS ONLY EVENT</div>
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
                  <div style={{ fontSize:9, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, marginBottom:8 }}>YOUR EXISTING BOOKINGS</div>
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
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:9, letterSpacing:".2em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ SWINDON AIRSOFT · FIELD PASS</span>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#c8ff00", background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 8px" }}>✓ DEPLOYED</span>
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
                              <div style={{ fontSize:7, letterSpacing:".2em", color:"#4a6820", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:2 }}>{lbl}</div>
                              <div style={{ fontSize:13, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", color:"#c8e878" }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderLeft:"1px dashed #2a3a10", paddingLeft:12, textAlign:"center", flexShrink:0 }}>
                          <div style={{ background:"#0a0f05", border:"1px solid #2a3a10", padding:5, display:"inline-block" }}>
                            <QRCode value={b.id} size={56} />
                          </div>
                          <div style={{ fontSize:7, color:"#4a6820", marginTop:3, letterSpacing:".15em", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase" }}>Scan in</div>
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

              {/* ── TICKET BUILDER ── */}
              <div style={{ border:"1px solid #2a3a10", marginBottom:16, background:"rgba(4,8,1,.5)" }}>
                <div style={{ background:"linear-gradient(90deg,rgba(8,18,2,.98) 0%,rgba(12,22,3,.95) 100%)", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, borderBottom:"1px solid #2a3a10", display:"flex", alignItems:"center", gap:8 }}>
                  <span>◈ ADD TICKETS TO ORDER</span>
                  <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                </div>

                {/* Walk-On row */}
                {ev.vipOnly && cu?.vipStatus !== "active" && (
                  <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--muted)", fontSize:13 }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>⭐</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, color:"var(--gold)", fontSize:16, letterSpacing:".06em", marginBottom:4 }}>VIP MEMBERS ONLY</div>
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
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🎯 Walk-On</div>
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
                            <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.walkOn>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.walkOn}</span>
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
                          <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.walkOn>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.walkOn}</span>
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
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom: ev.extras.length > 0 ? "1px solid #1a1a1a" : "none", background: rnHeldForMe ? "rgba(200,255,0,.05)" : undefined }}>
                      <div>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🪖 Rental Package</div>
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
                            <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.rental>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.rental}</span>
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
                          <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.rental>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.rental}</span>
                          <button onClick={() => setRental(bCart.rental + 1)} disabled={rentalLeft === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: rentalLeft===0?.4:1 }}>+</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Extras */}
                {ev.extras.length > 0 && (
                  <div style={{ padding:"0 16px 14px" }}>
                    <div style={{ fontSize:9, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, margin:"12px 0 8px" }}>EXTRAS</div>
                    {visibleExtras.map(ex => {
                      const lp = (data.shop || []).find(s => s.id === ex.productId);
                      const liveNoPost = lp ? lp.noPost : ex.noPost;
                      const hasVariants = lp?.variants?.length > 0;
                      return (
                        <div key={ex.id} style={{ padding:"12px 0", borderBottom:"1px solid #1a1a1a" }}>
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
                                    <span style={{ fontSize:11, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", marginLeft:10 }}>£{Number(v.price).toFixed(2)}</span>
                                    <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginLeft:8 }}>{stockLabel(stock).text}</span>
                                  </div>
                                  <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#111", flexShrink:0 }}>
                                    <button onClick={() => setExtra(ex.id, qty - 1, v.id)} disabled={qty === 0 || outOfStock} style={{ background:"none", border:"none", color:"var(--text)", padding:"5px 11px", cursor:"pointer", opacity: qty===0?0.3:1 }}>−</button>
                                    <span style={{ padding:"0 10px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:15, color: qty > 0 ? "var(--accent)" : "var(--text)", minWidth:26, textAlign:"center" }}>{qty}</span>
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
                                  <span style={{ fontSize:12, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>£{Number(livePrice).toFixed(2)}</span>
                                  <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#111" }}>
                                    <button onClick={() => setExtra(ex.id, qty - 1, null)} disabled={qty === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"6px 12px", cursor:"pointer", opacity: qty===0?0.3:1 }}>−</button>
                                    <span style={{ padding:"0 12px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, color: qty > 0 ? "var(--accent)" : "var(--text)", minWidth:30, textAlign:"center" }}>{qty}</span>
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
                <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:9, letterSpacing:".25em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, marginBottom:12 }}>ORDER SUMMARY</div>
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
                    <div style={{ fontSize:11, color: useCredits ? "var(--muted)" : "var(--gold)", marginBottom:8, padding:"6px 10px", background: useCredits ? "rgba(255,255,255,.03)" : "rgba(200,160,0,.06)", border:"1px solid", borderColor: useCredits ? "#2a2a2a" : "rgba(200,160,0,.2)", borderRadius:3 }}>
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
                      <div style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--muted)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>🏷️ Discount Code</div>
                      {!appliedDiscount ? (
                        <div style={{ display: 'flex', gap: 0 }}>
                          <input
                            value={discountInput}
                            onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(''); }}
                            onKeyDown={e => e.key === 'Enter' && applyDiscountCode()}
                            placeholder="ENTER CODE"
                            style={{ flex: 1, background: '#0c1009', border: '1px solid #2a3a10', borderRight: 'none', color: '#c8e878', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '.12em', padding: '8px 10px', outline: 'none', textTransform: 'uppercase' }}
                            onFocus={e => e.target.style.borderColor = '#4a6820'}
                            onBlur={e => e.target.style.borderColor = '#2a3a10'}
                          />
                          <button onClick={applyDiscountCode} disabled={discountChecking || !discountInput.trim()}
                            style={{ background: discountInput.trim() ? 'rgba(200,255,0,.15)' : 'rgba(200,255,0,.04)', border: '1px solid #2a3a10', color: discountInput.trim() ? '#c8ff00' : '#3a5010', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: '.1em', padding: '8px 14px', cursor: discountInput.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all .15s' }}>
                            {discountChecking ? '⏳' : 'APPLY'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(200,255,0,.08)', border: '1px solid rgba(200,255,0,.3)', borderLeft: '3px solid #c8ff00' }}>
                          <div>
                            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: '#c8ff00', letterSpacing: '.08em' }}>
                              ✓ {appliedDiscount.code}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                              {appliedDiscount.type === 'percent' ? `${appliedDiscount.value}% off` : `£${Number(appliedDiscount.value).toFixed(2)} off`} applied
                            </div>
                          </div>
                          <button onClick={() => { setAppliedDiscount(null); setDiscountInput(''); setDiscountError(''); }}
                            style={{ background: 'none', border: '1px solid #2a3a10', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '4px 8px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>REMOVE</button>
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
                  <div style={{ borderTop:"1px solid #2a2a2a", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, color:"#fff" }}>
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
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, color:"var(--gold)", marginBottom:4 }}>🟡 YELLOW CARD — FORMAL WARNING</div>
                  <div style={{ fontSize:12, color:"#c8a030", lineHeight:1.6 }}>You have received a formal warning from staff. Please review the site rules. Further violations may result in a Red Card ban.{cu.cardReason && <><br/><em>Reason: {cu.cardReason}</em></>}</div>
                </div>
              )}
              {cu && isCardBanned && (
                <div style={{ background:"rgba(220,30,30,.1)", border:"1px solid rgba(220,30,30,.4)", padding:"12px 14px", marginBottom:10, borderRadius:3 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, color:"var(--red)", marginBottom:4 }}>
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

        {waiverModal && <WaiverModal cu={cu} updateUser={updateUser} onClose={() => setWaiverModal(false)} showToast={showToast} editMode={waiverModal === "edit"} existing={cu.waiverData} addPlayerMode={waiverModal === "addPlayer"} />}
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
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
          {publishedEvents.map((ev, idx) => {
            const booked = ev.bookings.reduce((s,b) => s + b.qty, 0);
            const total  = ev.walkOnSlots + ev.rentalSlots;
            const fillPct = total > 0 ? booked / total : 0;
            const isFull = fillPct >= 1;
            const isAlmostFull = fillPct >= 0.8;
            const operationCodes = ["ALPHA","BRAVO","CHARLIE","DELTA","ECHO","FOXTROT","GOLF","HOTEL"];
            const opCode = operationCodes[idx % operationCodes.length];
            return (
              <div key={ev.id}
                onClick={() => { setDetail(ev.id); setTab("info"); resetCart(); }}
                style={{
                  background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden",
                  cursor:"pointer", position:"relative", transition:"border-color .15s, transform .15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-3px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}
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
                      <span style={{ background:"#c8ff00", color:"#000", fontSize:8, fontWeight:900, padding:"2px 8px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".12em" }}>SKIRMISH</span>
                      {ev.vipOnly && <span style={{ background:"#c8a000", color:"#000", fontSize:8, fontWeight:900, padding:"2px 8px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".12em" }}>★ VIP</span>}
                    </div>
                  </div>
                  {/* Full badge */}
                  {isFull && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:4 }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".2em", color:"#ef4444", border:"2px solid #ef4444", padding:"6px 18px", transform:"rotate(-5deg)" }}>FULLY DEPLOYED</div>
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div style={{ padding:"14px 14px 0", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:".08em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1.1, marginBottom:10 }}>{ev.title}</div>
                  {/* Data rows */}
                  <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                    {[
                      { icon:"▸", label:"DATE", val:fmtDate(ev.date), color:"#c8ff00" },
                      { icon:"▸", label:"TIME", val:`${ev.time}${ev.endTime ? `–${ev.endTime}` : ""} GMT`, color:"#4fc3f7" },
                      { icon:"▸", label:"LOCATION", val:ev.location, color:"#ce93d8" },
                    ].map(row => (
                      <div key={row.label} style={{ display:"flex", gap:8, alignItems:"baseline" }}>
                        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"#2a3a10", flexShrink:0, width:58 }}>{row.label}</span>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, fontWeight:700, color:"#9ab870", letterSpacing:".04em" }}>{row.val}</span>
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
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"#c8ff00", lineHeight:1 }}>
                      £{Math.min(ev.walkOnPrice, ev.rentalPrice)}
                    </div>
                  </div>
                  {isFull ? (
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
          })}
        </div>
      </div>
    </div>
  );
}

// ── Shop Closed Page ──────────────────────────────────────────
function ShopClosedPage({ setPage }) {
  const categories = [
    { icon: "🔫", label: "Airsoft Guns", desc: "AEGs, GBBs, snipers and pistols from top brands" },
    { icon: "🎯", label: "BBs & Ammo", desc: "0.20g to 0.45g biodegradable and standard BBs" },
    { icon: "🦺", label: "Tactical Gear", desc: "Vests, plate carriers, helmets and load-bearing equipment" },
    { icon: "👓", label: "Eye Protection", desc: "ANSI-rated goggles and full-face masks" },
    { icon: "🔋", label: "Batteries & Chargers", desc: "LiPo, NiMH batteries and smart chargers" },
    { icon: "🔧", label: "Parts & Upgrades", desc: "Hop-up rubbers, barrels, gearbox parts and more" },
    { icon: "👕", label: "Clothing & Apparel", desc: "Camo uniforms, boots, gloves and base layers" },
    { icon: "🎒", label: "Bags & Cases", desc: "Gun bags, hard cases and tactical backpacks" },
  ];

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#0d1400 0%,#111 60%,#0a1000 100%)",
        border: "1px solid #2a3a10",
        borderRadius: 8,
        padding: "32px 28px",
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:16, height:16,
            top:v==="top"?8:"auto", bottom:v==="bottom"?8:"auto",
            left:h==="left"?8:"auto", right:h==="right"?8:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:9, letterSpacing:".25em", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, marginBottom:10 }}>⬡ SWINDON AIRSOFT · ONLINE SHOP</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:"#e8ffb0", letterSpacing:".04em", marginBottom:8 }}>SHOP TEMPORARILY CLOSED</div>
          <div style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, maxWidth:600 }}>
            Our on-site shop is currently closed. You can order everything you need from our full retail store — with the option to collect your order at one of our game days.
          </div>
        </div>
      </div>

      {/* Retail store card */}
      <div style={{
        background: "linear-gradient(135deg,rgba(200,255,0,.06) 0%,rgba(0,0,0,0) 60%),#0b1007",
        border: "2px solid #c8ff00",
        borderRadius: 8,
        padding: "28px 28px",
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position:"absolute", top:0, right:0, width:120, height:120, background:"radial-gradient(circle,rgba(200,255,0,.08) 0%,transparent 70%)", pointerEvents:"none" }} />
        <div style={{ display:"flex", alignItems:"flex-start", gap:20, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", color:"#c8ff00", marginBottom:8, textTransform:"uppercase" }}>🛒 Our Retail Store</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#fff", marginBottom:8 }}>Airsoft Armoury UK</div>
            <div style={{ fontSize:13, color:"#a0cc60", lineHeight:1.7, marginBottom:16 }}>
              The UK's premier airsoft retailer — thousands of products in stock with fast dispatch. Use code <strong style={{ color:"#c8ff00", background:"rgba(200,255,0,.1)", padding:"1px 8px", borderRadius:3, fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>COLLECTION</strong> at checkout to collect your order at one of our Swindon Airsoft game days instead of paying for postage.
            </div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <a href="https://airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
                style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#c8ff00", color:"#0a0f06", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".12em", padding:"11px 22px", borderRadius:3, textDecoration:"none", textTransform:"uppercase" }}>
                🌐 VISIT STORE
              </a>
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Share Tech Mono',monospace", fontSize:13, letterSpacing:".15em", padding:"11px 18px", borderRadius:3 }}>
                CODE: COLLECTION
              </div>
            </div>
          </div>
          {/* Collection info box */}
          <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid #2a3a10", borderRadius:6, padding:"16px 18px", minWidth:0, flexShrink:0, width:"100%" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".2em", color:"#c8ff00", marginBottom:10, textTransform:"uppercase" }}>📦 Game Day Collection</div>
            {[
              ["1", "Order from airsoftarmoury.uk"],
              ["2", 'Enter code COLLECTION at checkout'],
              ["3", "Select your game day date"],
              ["4", "Collect at the field — no postage!"],
            ].map(([n, t]) => (
              <div key={n} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ background:"rgba(200,255,0,.15)", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{n}</div>
                <div style={{ fontSize:12, color:"#a0cc60", lineHeight:1.5 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What they sell */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:".2em", color:"var(--muted)", textTransform:"uppercase", marginBottom:14 }}>◈ WHAT'S AVAILABLE AT AIRSOFT ARMOURY UK</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
          {categories.map(({ icon, label, desc }) => (
            <div key={label} style={{ background:"#0b1007", border:"1px solid #2a3a10", borderRadius:6, padding:"14px 16px" }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:"#c8e878", letterSpacing:".06em", marginBottom:4 }}>{label}</div>
              <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign:"center", padding:"24px 0 8px" }}>
        <a href="https://airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
          style={{ display:"inline-flex", alignItems:"center", gap:10, background:"rgba(200,255,0,.08)", border:"1px solid #c8ff00", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, letterSpacing:".15em", padding:"14px 32px", borderRadius:3, textDecoration:"none", textTransform:"uppercase" }}>
          🛒 SHOP AT AIRSOFTARMOURY.UK →
        </a>
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:10, fontFamily:"'Share Tech Mono',monospace" }}>
          Use code <strong style={{ color:"#c8ff00" }}>COLLECTION</strong> for game day pickup · Free on qualifying orders
        </div>
      </div>
    </div>
  );
}

// ── Shop ──────────────────────────────────────────────────
function ShopPage({ data, cu, showToast, save, onProductClick, cart, setCart, cartOpen, setCartOpen, recentlyViewed = [] }) {
  const [placing, setPlacing] = useState(false);
  const shopSafetyRef = useRef(null);
  const [shopSquareError, setShopSquareError] = useState(null);
  const [validDefence, setValidDefence] = useState("");
  const [shopDiscountInput, setShopDiscountInput] = useState('');
  const [shopAppliedDiscount, setShopAppliedDiscount] = useState(null);
  const [shopDiscountError, setShopDiscountError] = useState('');
  const [shopDiscountChecking, setShopDiscountChecking] = useState(false);

  const postageOptions = data.postageOptions || [];
  const [postageId, setPostageId] = useState(() => postageOptions[0]?.id || "");
  useEffect(() => {
    if (!postageId && postageOptions.length > 0) setPostageId(postageOptions[0].id);
  }, [postageOptions.length]);

  // Clean up shop safety timeout on unmount
  useEffect(() => () => { if (shopSafetyRef.current) clearTimeout(shopSafetyRef.current); }, []);

  // Pre-fill valid defence from player's UKARA ID when cart opens
  useEffect(() => {
    if (cartOpen && cu?.ukara && !validDefence) setValidDefence(cu.ukara);
  }, [cartOpen]);

  const postage = postageOptions.find(p => p.id === postageId) || postageOptions[0] || { name: "Collection", price: 0 };
  const hasNoPost = cart.some(i => i.noPost);

  const cartKey = (item, variant) => variant ? `${item.id}::${variant.id}` : item.id;

  const addToCart = (item, variant, qty = 1) => {
    const key = cartKey(item, variant);
    const price = variant ? Number(variant.price) : (item.onSale && item.salePrice ? item.salePrice : item.price);
    const label = variant ? `${item.name} — ${variant.name}` : item.name;
    const availStock = variant ? Number(variant.stock) : item.stock;
    setCart(c => {
      const ex = c.find(x => x.key === key);
      const currentQty = ex ? ex.qty : 0;
      if (currentQty + qty > availStock) { showToast("Not enough stock", "red"); return c; }
      if (ex) return c.map(x => x.key === key ? { ...x, qty: x.qty + qty } : x);
      return [...c, { key, id: item.id, variantId: variant?.id || null, name: label, price, qty, noPost: item.noPost, stock: availStock }];
    });
    showToast(`${label} × ${qty} added to cart`);
  };

  const removeFromCart = (key) => {
    setCart(c => {
      const next = c.filter(x => x.key !== key);
      if (next.length === 0) { setShopAppliedDiscount(null); setShopDiscountInput(''); setShopDiscountError(''); }
      return next;
    });
  };
  const updateCartQty = (key, qty) => {
    if (qty < 1) { removeFromCart(key); return; }
    setCart(c => c.map(x => x.key === key ? { ...x, qty: Math.min(qty, x.stock) } : x));
  };

  const subTotal = cart.reduce((s, i) => s + i.price * i.qty * (cu?.vipStatus === "active" ? 0.9 : 1), 0);
  const postageTotal = hasNoPost ? 0 : (postage?.price || 0);

  let shopDiscountSaving = 0;
  if (shopAppliedDiscount && cart.length > 0) {
    if (shopAppliedDiscount.type === 'percent') {
      shopDiscountSaving = subTotal * (Number(shopAppliedDiscount.value) / 100);
    } else {
      shopDiscountSaving = Math.min(Number(shopAppliedDiscount.value), subTotal);
    }
  }
  const grandTotal = Math.max(0, subTotal - shopDiscountSaving) + postageTotal;

  const applyShopDiscount = async (cu) => {
    if (!shopDiscountInput.trim()) return;
    setShopDiscountChecking(true);
    setShopDiscountError('');
    setShopAppliedDiscount(null);
    try {
      const result = await api.discountCodes.validate(shopDiscountInput, cu?.id, 'shop');
      setShopAppliedDiscount(result);
    } catch (e) {
      setShopDiscountError(e.message);
    } finally {
      setShopDiscountChecking(false);
    }
  };

  const placeOrderAfterPayment = async (squarePayment) => {
    if (!cu || cart.length === 0) return;
    setPlacing(true); setShopSquareError(null);
    const safety = shopSafetyRef.current = setTimeout(() => setPlacing(false), 30000);
    try {
      await api.shopOrders.create({
        customerName: cu.name, customerEmail: cu.email || "",
        customerAddress: cu.address || "", userId: cu.id,
        items: cart.map(i => ({ id: i.id, variantId: i.variantId, name: i.name, price: i.price, qty: i.qty })),
        subtotal: subTotal, postage: postageTotal,
        postageName: hasNoPost ? "Collection Only" : (postage?.name || ""),
        total: grandTotal, squareOrderId: squarePayment.id,
        validDefence: validDefence.trim() || null,
        discountCode: shopAppliedDiscount ? shopAppliedDiscount.code : null,
        discountSaving: shopDiscountSaving > 0 ? shopDiscountSaving : null,
      });
      showToast("✅ Order confirmed! Thank you.");
      const cartSnapshot = [...cart];
      try {
        sendOrderEmail({
          cu,
          order: { id: squarePayment.id, postage: postageTotal, total: grandTotal, customerAddress: cu.address || "" },
          items: cartSnapshot.map(i => ({ name: i.name, variant: i.variantName || "", price: i.price, qty: i.qty })),
          postageName: hasNoPost ? "Collection Only" : (postage?.name || ""),
        }).catch(() => {});
        // Admin notification — fire-and-forget
        sendAdminOrderNotification({
          adminEmail: data.contactEmail,
          cu,
          order: { postage: postageTotal, total: grandTotal, customerAddress: cu.address || "", postageName: hasNoPost ? "Collection Only" : (postage?.name || ""), customerName: cu.name, customerEmail: cu.email },
          items: cartSnapshot.map(i => ({ name: i.name, variant: i.variantName || "", price: i.price, qty: i.qty })),
        }).catch(() => {});
      } catch (emailErr) { console.warn("Order email failed:", emailErr); }
      // Record discount redemption
      if (shopAppliedDiscount) {
        try {
          await api.discountCodes.redeem(shopAppliedDiscount.code, cu.id, cu.name, 'shop', shopDiscountSaving);
        } catch { /* non-fatal */ }
      }
      setCart([]); setCartOpen(false); setShopAppliedDiscount(null); setShopDiscountInput('');
      Promise.all([
        ...cartSnapshot.map(ci => {
          const rpc = ci.variantId
            ? supabase.rpc("deduct_variant_stock", { product_id: ci.id, variant_id: ci.variantId, qty: ci.qty })
            : supabase.rpc("deduct_stock", { product_id: ci.id, qty: ci.qty });
          return rpc.then(({ error }) => {
            if (error) console.error("Stock deduct failed for shop item", ci.name, error.message);
          }).catch(err => console.error("Stock deduct RPC error", ci.name, err?.message));
        }),
        api.shop.getAll().then(freshShop => save({ shop: freshShop })).catch(() => {}),
      ]);
    } catch (e) {
      const errMsg = "Order failed — please contact us. Error: " + (e.message || String(e));
      setShopSquareError(errMsg);
      supabase.from('failed_payments').insert({
        customer_name:     cu?.name || "Unknown",
        customer_email:    cu?.email || "",
        user_id:           cu?.id || null,
        items:             cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        total:             grandTotal || 0,
        payment_method:    "square_shop",
        error_message:     errMsg,
        square_payment_id: squarePayment?.id || null,
        recorded_by:       null,
      }).then(({ error }) => { if (error) console.warn("Failed to log payment error:", error.message); });
    } finally {
      clearTimeout(safety);
      setPlacing(false);
    }
  };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const [shopCatFilter, setShopCatFilter] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [shopSort, setShopSort] = useState("default");
  const [shopPage, setShopPage] = useState(1);
  const SHOP_PAGE_SIZE = 12;
  const allShopCategories = useMemo(() => {
    const cats = [...new Set((data.shop || []).map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [data.shop]);
  const filteredShop = useMemo(() => {
    let list = data.shop || [];
    list = list.filter(p => !p.hiddenFromShop);
    if (shopCatFilter) list = list.filter(p => p.category === shopCatFilter);
    if (shopSearch.trim()) {
      const q = shopSearch.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
    }
    if (shopSort === "price-asc") list = [...list].sort((a,b) => {
      const pa = a.variants?.length ? Math.min(...a.variants.map(v=>Number(v.price))) : (a.onSale && a.salePrice ? a.salePrice : a.price);
      const pb = b.variants?.length ? Math.min(...b.variants.map(v=>Number(v.price))) : (b.onSale && b.salePrice ? b.salePrice : b.price);
      return pa - pb;
    });
    else if (shopSort === "price-desc") list = [...list].sort((a,b) => {
      const pa = a.variants?.length ? Math.min(...a.variants.map(v=>Number(v.price))) : (a.onSale && a.salePrice ? a.salePrice : a.price);
      const pb = b.variants?.length ? Math.min(...b.variants.map(v=>Number(v.price))) : (b.onSale && b.salePrice ? b.salePrice : b.price);
      return pb - pa;
    });
    else if (shopSort === "name-asc") list = [...list].sort((a,b) => a.name.localeCompare(b.name));
    else if (shopSort === "name-desc") list = [...list].sort((a,b) => b.name.localeCompare(a.name));
    return list;
  }, [data.shop, shopCatFilter, shopSearch, shopSort]);
  useEffect(() => { setShopPage(1); }, [shopCatFilter, shopSearch, shopSort]);
  const paginatedShop = useMemo(() => filteredShop.slice(0, shopPage * SHOP_PAGE_SIZE), [filteredShop, shopPage]);
  const hasMoreShop = filteredShop.length > shopPage * SHOP_PAGE_SIZE;

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
        <div style={{ maxWidth:1100, margin:"0 auto", position:"relative", zIndex:1, display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
          <div style={{ textAlign:"center", flex:1 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — QUARTERMASTER — ◈</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
              FIELD <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>ARMOURY</span>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>▸ PROCURE YOUR GEAR — REPORT TO QUARTERMASTER ◂</div>
          </div>
          {/* Cart button */}
          <div style={{ flexShrink:0, marginTop:4 }}>
            <button style={{ background:"rgba(200,255,0,.06)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", padding:"10px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background="rgba(200,255,0,.12)"; e.currentTarget.style.borderColor="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.background="rgba(200,255,0,.06)"; e.currentTarget.style.borderColor="#2a3a10"; }}
              onClick={() => setCartOpen(true)}>
              ◈ LOADOUT
              {cartCount > 0 && <span style={{ background:"#c8ff00", color:"#000", padding:"1px 8px", fontSize:11, fontWeight:900 }}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 16px 80px" }}>
        {cu?.vipStatus === "active" && (
          <div style={{ background:"rgba(200,160,0,.06)", border:"1px solid rgba(200,160,0,.2)", padding:"10px 16px", marginBottom:24, display:"flex", alignItems:"center", gap:10, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"#c8a000" }}>
            ★ VIP OPERATIVE — 10% DISCOUNT APPLIED ON ALL ITEMS
          </div>
        )}

        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && !shopSearch && !shopCatFilter && (
          <div style={{ marginBottom:32 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>◈ —</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:15, letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8" }}>
                RECENTLY <span style={{ color:"#c8ff00" }}>VIEWED</span>
              </div>
              <div style={{ flex:1, height:1, background:"linear-gradient(to right,#1a2808,transparent)" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
              {recentlyViewed.map(prod => {
                const hasV = prod.variants?.length > 0;
                const rvPrice = hasV
                  ? Math.min(...prod.variants.map(v => Number(v.price)))
                  : (prod.onSale && prod.salePrice ? prod.salePrice : prod.price);
                const rvImg = prod.images?.[0] || prod.image || null;
                return (
                  <div key={prod.id} onClick={() => onProductClick(prod)}
                    style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", transition:"border-color .15s, transform .15s", position:"relative" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}>
                    {/* recently viewed accent strip */}
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(to right,#4fc3f7,transparent)", zIndex:2 }} />
                    {rvImg
                      ? <img src={rvImg} alt={prod.name} onError={e=>{e.target.style.display="none";}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", background:"#080a06", display:"block" }} />
                      : <div style={{ aspectRatio:"4/3", background:"#080a06", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, color:"#1a2808" }}>🎯</div>
                    }
                    <div style={{ padding:"8px 10px" }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".05em", textTransform:"uppercase", color:"#9ab870", lineHeight:1.2, marginBottom:3,
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{prod.name}</div>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, color:"#c8ff00" }}>£{Number(rvPrice).toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.shop.length === 0 && !shopSearch && !shopCatFilter && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12, marginBottom:40 }}>
            {Array.from({length:8}).map((_,i) => <SkeletonCard key={i} height={260} />)}
          </div>
        )}

        {/* Search + Sort row */}
        <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"stretch" }}>
          <div style={{ flex:1, position:"relative" }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#3a5010", fontSize:14, pointerEvents:"none" }}>🔍</span>
            <input value={shopSearch} onChange={e => setShopSearch(e.target.value)} placeholder="SEARCH ARMOURY…"
              style={{ width:"100%", background:"#111a0a", border:"1px solid #2a4010", color:"#e8f8b0", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:16, letterSpacing:".12em", padding:"12px 40px 12px 40px", outline:"none", boxSizing:"border-box", textTransform:"uppercase", caretColor:"#c8ff00" }} />
            {shopSearch && <button onClick={() => setShopSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#5a7a30", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
          </div>
          <select value={shopSort} onChange={e => setShopSort(e.target.value)}
            style={{ background:"#111a0a", border:"1px solid #2a4010", color:"#c8e878", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13, letterSpacing:".12em", padding:"12px 14px", outline:"none", cursor:"pointer", flexShrink:0, textTransform:"uppercase" }}>
            <option value="default">SORT: DEFAULT</option>
            <option value="price-asc">PRICE: LOW → HIGH</option>
            <option value="price-desc">PRICE: HIGH → LOW</option>
            <option value="name-asc">NAME: A → Z</option>
            <option value="name-desc">NAME: Z → A</option>
          </select>
        </div>

        {/* Category filter tabs */}
        {allShopCategories.length > 0 && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom: (shopSearch || shopCatFilter) ? 10 : 24, alignItems:"center" }}>
            <button
              onClick={() => setShopCatFilter("")}
              style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", textTransform:"uppercase",
                padding:"6px 16px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                background: shopCatFilter === "" ? "#c8ff00" : "transparent",
                borderColor: shopCatFilter === "" ? "#c8ff00" : "#2a3a10",
                color: shopCatFilter === "" ? "#000" : "#5a7a30" }}
            >ALL</button>
            {allShopCategories.map(cat => (
              <button key={cat}
                onClick={() => setShopCatFilter(shopCatFilter === cat ? "" : cat)}
                style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", textTransform:"uppercase",
                  padding:"6px 16px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                  background: shopCatFilter === cat ? "#c8ff00" : "transparent",
                  borderColor: shopCatFilter === cat ? "#c8ff00" : "#2a3a10",
                  color: shopCatFilter === cat ? "#000" : "#5a7a30" }}
              >{cat}</button>
            ))}
          </div>
        )}

        {/* Results count */}
        {(shopSearch || shopCatFilter) && filteredShop.length > 0 && (
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".18em", marginBottom:16 }}>
            ▸ {filteredShop.length} ITEM{filteredShop.length !== 1 ? "S" : ""} FOUND
            {shopSearch && <span> — "{shopSearch.toUpperCase()}"</span>}
          </div>
        )}

        {filteredShop.length === 0 && (shopSearch || shopCatFilter) && (
          <div style={{ maxWidth:1100, margin:"0 auto", padding:"60px 16px", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:16, opacity:.2 }}>🎯</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".2em", color:"#2a3a10", textTransform:"uppercase" }}>NO ITEMS FOUND</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#1a2808", letterSpacing:".15em", marginTop:8 }}>TRY A DIFFERENT SEARCH OR CLEAR FILTERS</div>
            <button onClick={() => { setShopSearch(""); setShopCatFilter(""); }} style={{ marginTop:16, background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", padding:"6px 18px", cursor:"pointer" }}>CLEAR FILTERS</button>
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
          {paginatedShop.map((item, idx) => {
            const hasV = item.variants?.length > 0;
            const displayPrice = hasV
              ? Math.min(...item.variants.map(v => Number(v.price)))
              : (item.onSale && item.salePrice ? item.salePrice : item.price);
            const inStock = item.stock > 0;
            const sl = stockLabel(hasV ? item.variants.reduce((s,v)=>s+Number(v.stock),0) : item.stock);
            return (
              <div key={item.id}
                style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", position:"relative", transition:"border-color .15s, transform .15s" }}
                onClick={() => onProductClick(item)}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-3px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}
              >
                {/* Scanlines */}
                <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents:"none", zIndex:5 }} />
                {/* Corner brackets */}
                {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                  <div key={v+h} style={{ position:"absolute", width:12, height:12, zIndex:6,
                    top:v==="top"?5:"auto", bottom:v==="bottom"?5:"auto",
                    left:h==="left"?5:"auto", right:h==="right"?5:"auto",
                    borderTop:v==="top"?"1px solid rgba(200,255,0,.4)":"none",
                    borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.4)":"none",
                    borderLeft:h==="left"?"1px solid rgba(200,255,0,.4)":"none",
                    borderRight:h==="right"?"1px solid rgba(200,255,0,.4)":"none",
                  }} />
                ))}

                {/* Top ID strip */}
                <div style={{ background:"rgba(0,0,0,.7)", borderBottom:"1px solid #1a2808", padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"relative", zIndex:6 }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"rgba(200,255,0,.5)" }}>QM · ITEM-{String(idx+1).padStart(3,"0")}</span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:sl.color, letterSpacing:".12em" }}>{sl.text}</span>
                </div>

                {/* Image */}
                <div style={{ height:170, background:"#080a06", overflow:"hidden", position:"relative" }}>
                  {(() => { const cardImg = (item.images && item.images.length > 0) ? item.images[0] : item.image; return cardImg
                    ? <img src={cardImg} alt="" onError={e=>{e.target.style.display='none';}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.8)", transition:"transform .3s" }}
                        onMouseOver={e => e.currentTarget.style.transform="scale(1.05)"}
                        onMouseOut={e => e.currentTarget.style.transform=""} />
                    : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                        <div style={{ fontSize:40, opacity:.08 }}>🎯</div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".15em", color:"#1e2c0a" }}>NO IMAGERY</div>
                      </div>;
                  })()}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:40, background:"linear-gradient(to top,rgba(12,16,9,1),transparent)", zIndex:2 }} />
                  {(item.images && item.images.length > 1) && (
                    <div style={{ position:"absolute", bottom:6, right:8, zIndex:3, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"rgba(200,255,0,.7)", letterSpacing:".1em" }}>📷 {item.images.length}</div>
                  )}
                  {!inStock && !hasV && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, letterSpacing:".2em", color:"#ef4444", border:"2px solid #ef4444", padding:"4px 14px", transform:"rotate(-3deg)" }}>OUT OF STOCK</span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding:"12px 12px 0", position:"relative", zIndex:6 }}>
                  <div className="gap-2 mb-1" style={{ flexWrap:"wrap" }}>
                    {item.noPost && <span className="tag tag-gold" style={{ fontSize:9 }}>COLLECT ONLY</span>}
                    {hasV && <span className="tag tag-blue" style={{ fontSize:9 }}>{item.variants.length} VARIANTS</span>}
                    {item.onSale && !hasV && <span className="tag tag-red" style={{ fontSize:9 }}>SALE</span>}
                  </div>
                  {item.category && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#4a6a20", textTransform:"uppercase", marginBottom:4 }}>◈ {item.category}</div>
                  )}
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".06em", textTransform:"uppercase", color:"#dce8c8", lineHeight:1.1, marginBottom:6 }}>{item.name}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", lineHeight:1.6, marginBottom:10 }}>
                    {(item.description||"").replace(/[*#_~`]/g,"").slice(0,70)}{(item.description||"").length>70?"…":""}
                  </div>
                </div>

                {/* Footer */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.3)", position:"relative", zIndex:6 }}>
                  <div>
                    {hasV && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", marginBottom:2, letterSpacing:".1em" }}>FROM</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color:"#c8ff00", lineHeight:1 }}>
                      £{cu?.vipStatus === "active" ? (displayPrice * 0.9).toFixed(2) : Number(displayPrice).toFixed(2)}
                      {cu?.vipStatus === "active" && <span style={{ fontSize:9, color:"#c8a000", marginLeft:5, fontFamily:"'Share Tech Mono',monospace" }}>VIP</span>}
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ padding:"7px 16px", fontSize:10, letterSpacing:".15em", borderRadius:0 }} disabled={!inStock && !hasV}>
                    {!inStock && !hasV ? "OUT OF STOCK" : "▸ ACQUIRE"}
                  </button>
                </div>

                {/* Barcode strip */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"3px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".06em" }}>
                    {item.id ? item.id.slice(0,10).toUpperCase() : "----------"}
                  </div>
                  <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
                    {Array.from({length:16},(_,i) => (
                      <div key={i} style={{ background:"#1a2808", width:i%3===0?2:1, height:2+Math.abs(Math.sin(i*2.1)*5), borderRadius:1 }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {hasMoreShop && (
          <div style={{ textAlign:"center", marginTop:32 }}>
            <button onClick={() => setShopPage(p => p + 1)}
              style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".22em", padding:"10px 32px", cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#c8ff00"; e.currentTarget.style.color="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#5a7a30"; }}>
              ▸ LOAD MORE — {filteredShop.length - shopPage * SHOP_PAGE_SIZE} MORE ITEMS
            </button>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3a10", letterSpacing:".15em", marginTop:8 }}>
              SHOWING {Math.min(shopPage * SHOP_PAGE_SIZE, filteredShop.length)} OF {filteredShop.length}
            </div>
          </div>
        )}
      </div>

      {/* CART MODAL */}
      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", borderRadius:0 }}>
            {/* Modal header */}
            <div style={{ borderBottom:"1px solid #2a3a10", paddingBottom:16, marginBottom:16 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".25em", color:"var(--muted)", marginBottom:4 }}>◈ — QUARTERMASTER</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:24, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>LOADOUT REVIEW</div>
            </div>

            {cart.length === 0
              ? <div style={{ textAlign:"center", padding:"32px 0", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", letterSpacing:".15em" }}>LOADOUT IS EMPTY</div>
              : (
              <>
                {cart.map(item => (
                  <div key={item.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #1a2808" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, letterSpacing:".06em", fontSize:14, textTransform:"uppercase", color:"#b0c090" }}>{item.name}</div>
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", marginTop:2 }}>£{item.price.toFixed(2)} EACH</div>
                    </div>
                    <div className="gap-2" style={{ alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", border:"1px solid #2a3a10", background:"#080a06" }}>
                        <button onClick={() => updateCartQty(item.key, item.qty - 1)} style={{ background:"none", border:"none", color:"#c8ff00", padding:"4px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>−</button>
                        <span style={{ padding:"0 8px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#c8ff00" }}>{item.qty}</span>
                        <button onClick={() => updateCartQty(item.key, item.qty + 1)} style={{ background:"none", border:"none", color:"#c8ff00", padding:"4px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>+</button>
                      </div>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, fontWeight:900, color:"#c8ff00", minWidth:60, textAlign:"right" }}>£{(item.price * item.qty).toFixed(2)}</span>
                      <button style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }} onClick={() => removeFromCart(item.key)}>✕</button>
                    </div>
                  </div>
                ))}

                {!hasNoPost && postageOptions.length > 0 && (
                  <div className="form-group mt-2">
                    <label style={{ color:"#3a5010", fontSize:9, letterSpacing:".2em" }}>POSTAGE METHOD</label>
                    <select value={postageId} onChange={e => setPostageId(e.target.value)} style={{ background:"#080a06", border:"1px solid #2a3a10", borderRadius:0, color:"#b0c090", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {postageOptions.map(p => <option key={p.id} value={p.id}>{p.name} — £{Number(p.price).toFixed(2)}</option>)}
                    </select>
                  </div>
                )}
                {hasNoPost && <div className="alert alert-gold mt-1" style={{ borderRadius:0 }}>⚠ COLLECTION-ONLY ITEMS — NO POSTING</div>}

                {/* ── Checkout section divider ── */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:18, marginBottom:14 }}>
                  <div style={{ flex:1, height:1, background:"#2a3a10" }} />
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".22em", color:"#3a5010", textTransform:"uppercase", flexShrink:0 }}>◈ CHECKOUT</div>
                  <div style={{ flex:1, height:1, background:"#2a3a10" }} />
                </div>

                {cu?.vipStatus === "active" && <div style={{ background:"rgba(200,160,0,.06)", border:"1px solid rgba(200,160,0,.2)", padding:"8px 12px", marginBottom:8, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".12em", color:"#c8a000" }}>★ VIP 10% DISCOUNT APPLIED</div>}

                {/* ── Discount Code ── */}
                {cu && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 9, letterSpacing: '.2em', color: '#3a5010', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>🏷️ Discount Code</div>
                    {!shopAppliedDiscount ? (
                      <div style={{ display: 'flex', gap: 0 }}>
                        <input
                          value={shopDiscountInput}
                          onChange={e => { setShopDiscountInput(e.target.value.toUpperCase()); setShopDiscountError(''); }}
                          onKeyDown={e => e.key === 'Enter' && applyShopDiscount(cu)}
                          placeholder="ENTER CODE"
                          style={{ flex: 1, background: '#0c1009', border: '1px solid #2a3a10', borderRight: 'none', color: '#c8e878', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '.1em', padding: '8px 10px', outline: 'none', textTransform: 'uppercase', borderRadius: 0 }}
                          onFocus={e => e.target.style.borderColor = '#4a6820'}
                          onBlur={e => e.target.style.borderColor = '#2a3a10'}
                        />
                        <button onClick={() => applyShopDiscount(cu)} disabled={shopDiscountChecking || !shopDiscountInput.trim()}
                          style={{ background: shopDiscountInput.trim() ? 'rgba(200,255,0,.15)' : 'rgba(200,255,0,.04)', border: '1px solid #2a3a10', color: shopDiscountInput.trim() ? '#c8ff00' : '#3a5010', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '.1em', padding: '8px 12px', cursor: shopDiscountInput.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all .15s' }}>
                          {shopDiscountChecking ? '⏳' : 'APPLY'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(200,255,0,.08)', border: '1px solid rgba(200,255,0,.3)', borderLeft: '3px solid #c8ff00' }}>
                        <div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: '#c8ff00', letterSpacing: '.08em' }}>
                            ✓ {shopAppliedDiscount.code}
                          </div>
                          <div style={{ fontSize: 10, color: '#5a7a30', marginTop: 1 }}>
                            {shopAppliedDiscount.type === 'percent' ? `${shopAppliedDiscount.value}% off` : `£${Number(shopAppliedDiscount.value).toFixed(2)} off`} applied
                          </div>
                        </div>
                        <button onClick={() => { setShopAppliedDiscount(null); setShopDiscountInput(''); setShopDiscountError(''); }}
                          style={{ background: 'none', border: '1px solid #2a3a10', color: '#5a7a30', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '4px 8px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>REMOVE</button>
                      </div>
                    )}
                    {shopDiscountError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ {shopDiscountError}</div>}
                  </div>
                )}

                {/* ── Valid Defence ── */}
                <div style={{ marginTop:14, background:"#080a06", border:"1px solid #1a2808", padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", textTransform:"uppercase" }}>🪪 VALID DEFENCE</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", letterSpacing:".1em" }}>— OPTIONAL</div>
                  </div>
                  <input
                    value={validDefence}
                    onChange={e => setValidDefence(e.target.value)}
                    placeholder="e.g. UKARA-2025-042 or site membership no."
                    style={{ width:"100%", boxSizing:"border-box", background:"#0c1009", border:"1px solid #2a3a10", borderRadius:0, color:"#b0c090", fontFamily:"'Share Tech Mono',monospace", fontSize:11, padding:"8px 10px", outline:"none" }}
                    onFocus={e => e.target.style.borderColor="#c8ff00"}
                    onBlur={e  => e.target.style.borderColor="#2a3a10"}
                  />
                  <div style={{ marginTop:6, fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3a10", lineHeight:1.7 }}>
                    Enter your UKARA ID, site membership number, or other valid defence for purchasing RIFs. Leave blank if not purchasing RIF items.
                  </div>
                </div>

                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #2a3a10' }}>
                  {shopDiscountSaving > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, marginBottom: 4, color: '#5a7a30' }}>
                        <span>Subtotal</span>
                        <span>£{subTotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, marginBottom: 6, color: '#c8ff00', background: 'rgba(200,255,0,.05)', padding: '3px 6px', borderRadius: 2 }}>
                        <span>🏷️ Code: {shopAppliedDiscount?.code}</span>
                        <span style={{ fontWeight: 700 }}>−£{shopDiscountSaving.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, color: '#e8f0d8' }}>
                    <span>TOTAL</span>
                    <span style={{ color: '#c8ff00' }}>£{grandTotal.toFixed(2)}</span>
                  </div>
                  {!hasNoPost && postageTotal > 0 && (
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#3a5010', textAlign: 'right', marginTop: 2 }}>
                      incl. {postage.name} £{postageTotal.toFixed(2)}
                    </div>
                  )}
                </div>

                {!cu && <div className="alert alert-red mt-2" style={{ borderRadius:0 }}>LOG IN TO COMPLETE REQUISITION</div>}
                {cu?.role === "admin" && <div className="alert alert-red mt-2" style={{ borderRadius:0 }}>⚠ ADMIN ACCOUNTS CANNOT PLACE ORDERS</div>}
                {shopSquareError && <div className="alert alert-red mt-1" style={{ borderRadius:0 }}>⚠ {shopSquareError}</div>}
                {placing && <div className="alert alert-blue mt-1" style={{ borderRadius:0 }}>⏳ PROCESSING REQUISITION…</div>}
                {cu && cu.role !== "admin" && grandTotal > 0 && (
                  <SquareCheckoutButton
                    amount={grandTotal}
                    description={`Swindon Airsoft Armoury — ${cart.length} item${cart.length > 1 ? "s" : ""}`}
                    onSuccess={placeOrderAfterPayment}
                    disabled={placing}
                  />
                )}
              </>
            )}
            <button style={{ width:"100%", marginTop:12, background:"transparent", border:"1px solid #2a3a10", color:"#3a5010", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".2em", padding:"10px", cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#c8ff00"; e.currentTarget.style.color="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#3a5010"; }}
              onClick={() => setCartOpen(false)}>✕ CLOSE LOADOUT</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Page ──────────────────────────────────────────
function ProductPage({ item, cu, onBack, onAddToCart, cartCount, onCartOpen, shopItems = [] }) {
  const isMobile = useMobile(700);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [imgLightbox, setImgLightbox] = useState(null); // url string when open

  const hasVariants = item.variants?.length > 0;
  const effectivePrice = selectedVariant
    ? Number(selectedVariant.price)
    : hasVariants ? null
    : (item.onSale && item.salePrice ? item.salePrice : item.price);
  const vipPrice = effectivePrice !== null && cu?.vipStatus === "active"
    ? (effectivePrice * 0.9).toFixed(2) : null;
  const displayPrice = vipPrice || (effectivePrice !== null ? Number(effectivePrice).toFixed(2) : null);
  const stockAvail = selectedVariant ? Number(selectedVariant.stock) : hasVariants ? 0 : item.stock;
  const canAdd = (!hasVariants || selectedVariant) && stockAvail > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    onAddToCart(item, hasVariants ? selectedVariant : null, qty);
    setQty(1);
  };

  return (
    <>
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      {/* Breadcrumb bar */}
      <div style={{ background:"#0c1009", borderBottom:"1px solid #1a2808", padding:"12px 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", gap:8, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3a10" }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#c8ff00", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, letterSpacing:".15em", fontSize:11, padding:0 }}>
            ← ARMOURY
          </button>
          <span style={{ color:"#1a2808" }}>▸</span>
          <span style={{ color:"#3a5010", textTransform:"uppercase", letterSpacing:".12em" }}>{item.name}</span>
          <div style={{ marginLeft:"auto" }}>
            <button style={{ background:"rgba(200,255,0,.06)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".18em", padding:"6px 14px", cursor:"pointer" }}
              onClick={onCartOpen}>
              ◈ LOADOUT {cartCount > 0 && <span style={{ background:"#c8ff00", color:"#000", padding:"1px 6px", fontSize:10, marginLeft:4, fontWeight:900 }}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 16px 80px" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 32, marginBottom:40 }}>

        {/* LEFT — Image */}
        <div>
          <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", borderTop:"3px solid var(--accent)", position:"relative", overflow:"hidden" }}>
            {/* Corner brackets */}
            <div style={{ position:"absolute", top:10, left:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", top:10, right:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, left:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, right:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            {(() => {
              const variantImg = selectedVariant?.image;
              const allImgs = variantImg ? [variantImg, ...(item.images||[]).filter(x => x !== variantImg)] : (item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []));
              const displayImg = allImgs[activeImgIdx] || allImgs[0] || null;
              return (
                <>
                  {displayImg
                    ? (
                      <div style={{ position:"relative", cursor:"zoom-in" }} onClick={() => setImgLightbox(displayImg)}>
                        <img src={displayImg} alt={item.name} onError={e=>{e.target.style.display='none';}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", display:"block", background:"#0a0a0a", transition:"opacity .2s" }} />
                        <div style={{ position:"absolute", bottom:8, right:8, background:"rgba(0,0,0,.7)", border:"1px solid rgba(200,255,0,.3)", color:"rgba(200,255,0,.8)", fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", padding:"3px 8px", pointerEvents:"none" }}>⊕ ENLARGE</div>
                      </div>
                    )
                    : <div style={{ aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:80, color:"#333" }}>🎯</div>
                  }
                  {allImgs.length > 1 && (
                    <div style={{ display:"flex", gap:4, padding:"8px 8px 4px", background:"#080a06", flexWrap:"wrap" }}>
                      {allImgs.map((img, i) => (
                        <div key={i} onClick={() => setActiveImgIdx(i)}
                          style={{ width:52, height:52, border: i === activeImgIdx ? "2px solid var(--accent)" : "1px solid #1a2808", cursor:"pointer", overflow:"hidden", flexShrink:0, opacity: i === activeImgIdx ? 1 : 0.55, transition:"all .15s" }}>
                          <img src={img} alt="" onError={e=>{e.target.style.display='none';}} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {!item.stock && (
              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, letterSpacing:".2em", color:"var(--red)", border:"3px solid var(--red)", padding:"8px 24px", transform:"rotate(-5deg)" }}>OUT OF STOCK</span>
              </div>
            )}
          </div>

          {/* Spec strip */}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:1, marginTop:2 }}>
            {[
              { label:"POSTAGE", val: item.noPost ? "Collect Only" : "Standard" },
              { label:"AVAILABILITY", val: hasVariants && !selectedVariant ? "— SELECT —" : stockLabel(stockAvail).text, color: hasVariants && !selectedVariant ? "var(--muted)" : stockLabel(stockAvail).color },
              { label:"STATUS", val: hasVariants && !selectedVariant ? "— SELECT —" : stockAvail > 0 ? "IN STOCK" : "OUT OF STOCK", color: hasVariants && !selectedVariant ? "var(--muted)" : stockAvail > 0 ? "var(--accent)" : "var(--red)" },
            ].map(s => (
              <div key={s.label} style={{ background:"#0d0d0d", border:"1px solid #1a1a1a", padding:"8px 12px" }}>
                <div style={{ fontSize:8, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, textTransform:"uppercase", marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:12, fontFamily:"'Share Tech Mono',monospace", color: s.color || "var(--text)" }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Details */}
        <div>
          {/* Tags */}
          <div className="gap-2 mb-2">
            {item.noPost && <span className="tag tag-gold">⚠️ Collect Only</span>}
            {item.onSale && !hasVariants && <span className="tag tag-red">ON SALE</span>}
            {hasVariants && <span className="tag tag-blue">{item.variants.length} variants</span>}
            
          </div>

          {/* Name */}
          <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, color:"#fff", letterSpacing:".04em", textTransform:"uppercase", lineHeight:1, marginBottom:12 }}>{item.name}</h1>

          {/* Description */}
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, color:"var(--muted)", lineHeight:1.8, marginBottom:20, borderLeft:"3px solid var(--accent)", paddingLeft:12 }}
            dangerouslySetInnerHTML={{ __html: renderMd(item.description) || "No description available." }}
          />

          {/* Variant selector */}
          {hasVariants && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, textTransform:"uppercase", marginBottom:10 }}>
                SELECT VARIANT
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {item.variants.map(v => {
                  const outV = Number(v.stock) < 1;
                  const sel = selectedVariant?.id === v.id;
                  return (
                    <button key={v.id}
                      onClick={() => { if (!outV) { setSelectedVariant(v); setQty(1); } }}
                      style={{
                        padding:"10px 18px", fontFamily:"'Barlow Condensed',sans-serif",
                        fontSize:13, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase",
                        background: sel ? "var(--accent)" : outV ? "#0a0a0a" : "#1a1a1a",
                        border: `2px solid ${sel ? "var(--accent)" : outV ? "#222" : "#333"}`,
                        color: sel ? "#fff" : outV ? "#333" : "var(--text)",
                        cursor: outV ? "not-allowed" : "pointer",
                        position:"relative",
                      }}>
                      <div>{v.name}</div>
                      <div style={{ fontSize:11, color: sel ? "rgba(255,255,255,.8)" : outV ? "#2a2a2a" : "var(--muted)", marginTop:2 }}>
                        {outV ? stockLabel(0).text : `£${Number(v.price).toFixed(2)}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price */}
          <div style={{ marginBottom:20 }}>
            {displayPrice ? (
              <div style={{ display:"flex", alignItems:"baseline", gap:12 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:48, color:"var(--accent)", lineHeight:1 }}>£{displayPrice}</span>
                {vipPrice && <span className="tag tag-gold">VIP PRICE</span>}
                {!hasVariants && item.onSale && item.salePrice && (
                  <span style={{ textDecoration:"line-through", color:"var(--muted)", fontSize:18 }}>£{item.price}</span>
                )}
                {cu?.vipStatus === "active" && !vipPrice && (
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--gold)" }}>10% VIP applied</span>
                )}
              </div>
            ) : (
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:14, color:"var(--muted)" }}>
                {hasVariants && !selectedVariant ? "↑ Select a variant to see price" : "—"}
              </div>
            )}
          </div>

          {/* Qty + Add to Cart */}
          {canAdd ? (
            <div style={{ display:"flex", gap:12, alignItems:"stretch", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#0d0d0d" }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ background:"none", border:"none", color:"var(--text)", padding:"12px 18px", fontSize:20, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>−</button>
                <span style={{ padding:"0 16px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, color:"#fff", minWidth:50, textAlign:"center" }}>{qty}</span>
                <button onClick={() => setQty(q => Math.min(stockAvail, q + 1))} style={{ background:"none", border:"none", color:"var(--text)", padding:"12px 18px", fontSize:20, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>+</button>
              </div>
              <button className="btn btn-primary" style={{ flex:1, padding:"12px 24px", fontSize:14, letterSpacing:".15em" }} onClick={handleAdd}>
                ADD TO CART × {qty}
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ width:"100%", padding:"14px", marginBottom:12, cursor:"default", opacity:.5 }} disabled>
              {hasVariants && !selectedVariant ? "SELECT A VARIANT FIRST" : "OUT OF STOCK"}
            </button>
          )}

          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#3a5010", display:"flex", gap:16, letterSpacing:".06em" }}>
            <span>{item.noPost ? "⚠ COLLECTION AT GAME DAY ONLY" : "✓ STANDARD POSTAGE AVAILABLE"}</span>
            
          </div>
        </div>
      </div>
      </div>
    </div>
    {/* Image lightbox */}
    {imgLightbox && (
      <div onClick={() => setImgLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.96)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", cursor:"zoom-out" }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position:"absolute", width:32, height:32, zIndex:501,
              top:v==="top"?12:"auto", bottom:v==="bottom"?12:"auto",
              left:h==="left"?12:"auto", right:h==="right"?12:"auto",
              borderTop:v==="top"?"2px solid rgba(200,255,0,.4)":"none",
              borderBottom:v==="bottom"?"2px solid rgba(200,255,0,.4)":"none",
              borderLeft:h==="left"?"2px solid rgba(200,255,0,.4)":"none",
              borderRight:h==="right"?"2px solid rgba(200,255,0,.4)":"none",
            }} />
          ))}
          <img src={imgLightbox} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth:"90vw", maxHeight:"88vh", objectFit:"contain", boxShadow:"0 0 80px rgba(0,0,0,.9), 0 0 0 1px #1a2808", cursor:"default" }} />
          <button onClick={() => setImgLightbox(null)}
            style={{ position:"absolute", top:16, right:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:14, width:36, height:36, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, letterSpacing:".1em", zIndex:502 }}>✕</button>
          {/* Navigate between images */}
          {(() => {
            const variantImg = selectedVariant?.image;
            const allImgs = variantImg ? [variantImg, ...(item.images||[]).filter(x => x !== variantImg)] : (item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []));
            const curIdx = allImgs.indexOf(imgLightbox);
            if (allImgs.length < 2) return null;
            return (
              <>
                <button onClick={e => { e.stopPropagation(); const i = (curIdx - 1 + allImgs.length) % allImgs.length; setImgLightbox(allImgs[i]); setActiveImgIdx(i); }}
                  style={{ position:"absolute", left:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:24, width:48, height:48, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>‹</button>
                <button onClick={e => { e.stopPropagation(); const i = (curIdx + 1) % allImgs.length; setImgLightbox(allImgs[i]); setActiveImgIdx(i); }}
                  style={{ position:"absolute", right:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:24, width:48, height:48, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>›</button>
                <div style={{ position:"absolute", bottom:16, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"rgba(200,255,0,.4)", letterSpacing:".2em" }}>
                  {String(curIdx+1).padStart(2,"0")} / {String(allImgs.length).padStart(2,"0")}
                </div>
              </>
            );
          })()}
      </div>
    )}

    {/* Related Products */}
    {(() => {
      const related = shopItems
        .filter(p => p.id !== item.id && p.published !== false && p.category && p.category === item.category)
        .slice(0, 3);
      if (related.length === 0) return null;
      return (
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 60px" }}>
          <div style={{ borderTop:"1px solid #1a2808", paddingTop:32, marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>◈ —</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>RELATED <span style={{ color:"#c8ff00" }}>EQUIPMENT</span></div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>— ◈</div>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3a10", letterSpacing:".15em", marginTop:4 }}>
              MORE FROM: {(item.category || "").toUpperCase()}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
            {related.map(rel => {
              const hasV = rel.variants?.length > 0;
              const relPrice = hasV
                ? Math.min(...rel.variants.map(v => Number(v.price)))
                : (rel.onSale && rel.salePrice ? rel.salePrice : rel.price);
              const relImg = rel.images?.[0] || rel.image || null;
              const relStock = hasV ? rel.variants.reduce((s,v)=>s+Number(v.stock),0) : rel.stock;
              const sl = stockLabel(relStock);
              return (
                <div key={rel.id} onClick={() => { onBack(); setTimeout(() => onProductClick && onProductClick(rel), 50); }}
                  style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", transition:"border-color .15s, transform .15s", position:"relative" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}>
                  {/* Corner brackets */}
                  {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                    <div key={v+h} style={{ position:"absolute", width:10, height:10, zIndex:3,
                      top:v==="top"?4:"auto", bottom:v==="bottom"?4:"auto",
                      left:h==="left"?4:"auto", right:h==="right"?4:"auto",
                      borderTop:v==="top"?"1px solid rgba(200,255,0,.3)":"none",
                      borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.3)":"none",
                      borderLeft:h==="left"?"1px solid rgba(200,255,0,.3)":"none",
                      borderRight:h==="right"?"1px solid rgba(200,255,0,.3)":"none" }} />
                  ))}
                  {relImg
                    ? <img src={relImg} alt={rel.name} onError={e=>{e.target.style.display="none";}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", background:"#080a06", display:"block" }} />
                    : <div style={{ aspectRatio:"4/3", background:"#080a06", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, color:"#1a2808" }}>🎯</div>
                  }
                  <div style={{ padding:"10px 12px 12px" }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, letterSpacing:".06em", textTransform:"uppercase", color:"#c8e878", marginBottom:4, lineHeight:1.2 }}>{rel.name}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color:"#c8ff00" }}>£{Number(relPrice).toFixed(2)}</div>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:sl.color, letterSpacing:".1em" }}>{sl.text}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}
    </>
  );
}

// ── Marshal Check-In Page ─────────────────────────────────
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
          {ev.bookings.map(b => (
            <div key={b.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
              borderBottom: "1px solid #1a2808",
              opacity: b.checkedIn ? 0.5 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 15, color: b.checkedIn ? "#3a5010" : "#b0c090", textTransform: "uppercase", letterSpacing: ".06em" }}>{b.userName}</div>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#3a5010", marginTop: 2 }}>{b.type === "walkOn" ? "WALK-ON" : "RENTAL"} · QTY {b.qty}</div>
              </div>
              {b.checkedIn
                ? <span className="tag tag-green" style={{ flexShrink: 0 }}>✓ IN</span>
                : <button className="btn btn-sm btn-primary" style={{ flexShrink: 0 }} onClick={() => doCheckin(b, ev)} disabled={busy}>✓ Check In</button>
              }
            </div>
          ))}
        </div>
      )}

      {scanning && <QRScanner onScan={onQRScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────
function LeaderboardPage({ data, cu, updateUser, showToast, onPlayerClick }) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const board = data.users
    .filter(u => !u.leaderboardOptOut && u.role === "player")
    .sort((a, b) => b.gamesAttended - a.gamesAttended);

  const listBoard   = board.slice(3); // exclude top 3 — shown in podium
  const totalPages  = Math.max(1, Math.ceil(listBoard.length / PAGE_SIZE));
  const pageStart   = (page - 1) * PAGE_SIZE;
  const pageEnd     = pageStart + PAGE_SIZE;
  const pagePlayers = page === 1 ? listBoard.slice(0, PAGE_SIZE) : listBoard.slice(pageStart, pageEnd);

  // If the logged-in user is on a different page, show which page they're on
  const myRank     = cu ? board.findIndex(p => p.id === cu.id) : -1;
  const myListRank = cu ? listBoard.findIndex(p => p.id === cu.id) : -1;
  const myPage     = myListRank >= 0 ? Math.ceil((myListRank + 1) / PAGE_SIZE) : (myRank >= 0 && myRank < 3 ? 1 : -1);

  const getRankTitle = (i) => {
    if (i === 0) return "FIELD COMMANDER";
    if (i === 1) return "SENIOR OPERATIVE";
    if (i === 2) return "OPERATIVE";
    if (i < 10)  return "RECRUIT";
    return "PRIVATE";
  };
  const getMedalColor = (i) => {
    if (i === 0) return "#c8a000";
    if (i === 1) return "#8a8a8a";
    if (i === 2) return "#8b4513";
    return null;
  };

  const podium = board.slice(0, 3);

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* ── Header ── */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — FIELD RECORDS — ◈</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            COMBAT <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>ROLL</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>▸ RANKED BY FIELD DEPLOYMENTS — DEDICATION, NOT KILLS ◂</div>
          {/* Stats bar */}
          <div style={{ display:"flex", justifyContent:"center", gap:32, marginTop:28, flexWrap:"wrap" }}>
            {[
              ["OPERATIVES", board.length],
              ["TOP DEPLOYMENTS", board[0]?.gamesAttended ?? 0],
              ["YOUR RANK", myRank >= 0 ? `#${myRank + 1}` : "—"],
            ].map(([label, val]) => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, color:"#c8ff00", lineHeight:1 }}>{val}</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10", marginTop:3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px 80px" }}>

        {/* ── Ghost toggle ── */}
        {cu?.role === "player" && (
          <div style={{ background:"#0c1009", border:"1px solid #1e2c0a", padding:"12px 18px", marginBottom:28, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", color:"#c8ff00", marginBottom:2 }}>FIELD VISIBILITY</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010" }}>{cu.leaderboardOptOut ? "STATUS: GHOST — YOUR NAME IS HIDDEN" : "STATUS: ACTIVE — YOUR NAME IS VISIBLE"}</div>
            </div>
            <button className={`btn btn-sm ${cu.leaderboardOptOut ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { updateUser(cu.id, { leaderboardOptOut: !cu.leaderboardOptOut }); showToast("Preference saved"); }}>
              {cu.leaderboardOptOut ? "GO ACTIVE" : "GO GHOST"}
            </button>
          </div>
        )}

        {/* ── Podium — only on page 1 ── */}
        {page === 1 && podium.length >= 1 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#2a3a10", marginBottom:14, textAlign:"center" }}>◈ TOP OPERATIVES ◈</div>
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:8 }}>
              {/* Silver — 2nd */}
              {podium[1] && (() => {
                const p = podium[1]; const isMe = cu && p.id === cu.id;
                return (
                  <div onClick={() => p.publicProfile && onPlayerClick && onPlayerClick(p.id)}
                    style={{ flex:1, maxWidth:200, background:"linear-gradient(180deg,#111408 0%,#0c0e08 100%)", border:"1px solid rgba(138,138,138,.3)", padding:"16px 12px 14px", textAlign:"center", cursor:p.publicProfile?"pointer":"default", position:"relative", overflow:"hidden", transition:"border-color .15s" }}
                    onMouseEnter={e=>{ if(p.publicProfile) e.currentTarget.style.borderColor="rgba(138,138,138,.6)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(138,138,138,.3)"; }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#8a8a8a,transparent)" }} />
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", color:"#8a8a8a", marginBottom:8 }}>2ND</div>
                    <div style={{ width:52, height:52, borderRadius:"50%", background:"#0a0c08", border:"2px solid #8a8a8a", margin:"0 auto 10px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:20, fontWeight:700, color:"#8a8a8a", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {p.profilePic ? <img src={p.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.7) grayscale(.3)" }} /> : (p.callsign||p.name)[0]}
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".06em", color:isMe?"#e8f0d8":"#8a8a8a", textTransform:"uppercase", lineHeight:1.2, marginBottom:4 }}>{p.callsign||p.name}</div>
                    {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"var(--accent)", marginBottom:4 }}>← YOU</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#8a8a8a", lineHeight:1 }}>{p.gamesAttended}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".2em", color:"#2a3a10", marginTop:2 }}>DEPLOYMENTS</div>
                    {p.vipStatus==="active" && <div style={{ marginTop:6 }}><span className="tag tag-gold" style={{ fontSize:8 }}>★ VIP</span></div>}
                  </div>
                );
              })()}
              {/* Gold — 1st */}
              {podium[0] && (() => {
                const p = podium[0]; const isMe = cu && p.id === cu.id;
                return (
                  <div onClick={() => p.publicProfile && onPlayerClick && onPlayerClick(p.id)}
                    style={{ flex:1, maxWidth:220, background:"linear-gradient(180deg,#131108 0%,#0c0e08 100%)", border:"1px solid rgba(200,160,0,.45)", padding:"22px 14px 18px", textAlign:"center", cursor:p.publicProfile?"pointer":"default", position:"relative", overflow:"hidden", transition:"border-color .15s", zIndex:2 }}
                    onMouseEnter={e=>{ if(p.publicProfile) e.currentTarget.style.borderColor="rgba(200,160,0,.8)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(200,160,0,.45)"; }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,transparent,#c8a000,transparent)" }} />
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:14, color:"#c8a000", marginBottom:6, filter:"drop-shadow(0 0 6px rgba(200,160,0,.5))" }}>👑</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".25em", color:"#c8a000", marginBottom:10 }}>FIELD COMMANDER</div>
                    <div style={{ width:64, height:64, borderRadius:"50%", background:"#0a0c08", border:"2px solid #c8a000", margin:"0 auto 12px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:24, fontWeight:700, color:"#c8a000", fontFamily:"'Barlow Condensed',sans-serif", boxShadow:"0 0 16px rgba(200,160,0,.2)" }}>
                      {p.profilePic ? <img src={p.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.1) saturate(0.9)" }} /> : (p.callsign||p.name)[0]}
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".07em", color:isMe?"#e8f0d8":"#c8a000", textTransform:"uppercase", lineHeight:1.2, marginBottom:4 }}>{p.callsign||p.name}</div>
                    {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"var(--accent)", marginBottom:4 }}>← YOU</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:34, color:"#c8a000", lineHeight:1, filter:"drop-shadow(0 0 8px rgba(200,160,0,.3))" }}>{p.gamesAttended}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".2em", color:"#2a3a10", marginTop:2 }}>DEPLOYMENTS</div>
                    {p.vipStatus==="active" && <div style={{ marginTop:8 }}><span className="tag tag-gold">★ VIP OPERATIVE</span></div>}
                  </div>
                );
              })()}
              {/* Bronze — 3rd */}
              {podium[2] && (() => {
                const p = podium[2]; const isMe = cu && p.id === cu.id;
                return (
                  <div onClick={() => p.publicProfile && onPlayerClick && onPlayerClick(p.id)}
                    style={{ flex:1, maxWidth:200, background:"linear-gradient(180deg,#111008 0%,#0c0e08 100%)", border:"1px solid rgba(139,69,19,.3)", padding:"16px 12px 14px", textAlign:"center", cursor:p.publicProfile?"pointer":"default", position:"relative", overflow:"hidden", transition:"border-color .15s" }}
                    onMouseEnter={e=>{ if(p.publicProfile) e.currentTarget.style.borderColor="rgba(139,69,19,.6)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(139,69,19,.3)"; }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#8b4513,transparent)" }} />
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", color:"#8b4513", marginBottom:8 }}>3RD</div>
                    <div style={{ width:52, height:52, borderRadius:"50%", background:"#0a0c08", border:"2px solid #8b4513", margin:"0 auto 10px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:20, fontWeight:700, color:"#8b4513", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {p.profilePic ? <img src={p.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.7) sepia(.2)" }} /> : (p.callsign||p.name)[0]}
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".06em", color:isMe?"#e8f0d8":"#8b4513", textTransform:"uppercase", lineHeight:1.2, marginBottom:4 }}>{p.callsign||p.name}</div>
                    {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"var(--accent)", marginBottom:4 }}>← YOU</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#8b4513", lineHeight:1 }}>{p.gamesAttended}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".2em", color:"#2a3a10", marginTop:2 }}>DEPLOYMENTS</div>
                    {p.vipStatus==="active" && <div style={{ marginTop:6 }}><span className="tag tag-gold" style={{ fontSize:8 }}>★ VIP</span></div>}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── My rank banner (when not on my page) ── */}
        {cu && myRank >= 0 && myPage > 0 && myPage !== page && (
          <div style={{ background:"rgba(200,255,0,.05)", border:"1px dashed rgba(200,255,0,.3)", padding:"10px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
            <div>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#c8ff00" }}>YOUR POSITION: #{myRank + 1}</span>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", color:"#3a5010", marginLeft:12 }}>PAGE {myPage} OF {totalPages}</span>
            </div>
            <button onClick={() => setPage(myPage)} style={{ background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", padding:"4px 12px", cursor:"pointer" }}>
              JUMP TO MY RANK ▸
            </button>
          </div>
        )}

        {/* ── Table header ── */}
        {board.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"6px 16px", marginBottom:4 }}>
            <div style={{ width:40, fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10", textAlign:"center" }}>#</div>
            <div style={{ width:38, flexShrink:0 }} />
            <div style={{ flex:1, fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10" }}>OPERATIVE</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10", textAlign:"right" }}>DEPLOYMENTS</div>
          </div>
        )}

        {board.length === 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>NO COMBAT RECORDS ON FILE</div>
        )}

        {/* ── Player rows ── */}
        {pagePlayers.map((player) => {
          const i = board.indexOf(player);
          const isTop3      = i < 3;
          const medalColor  = getMedalColor(i);
          const rankTitle   = getRankTitle(i);
          const isMe        = cu && player.id === cu.id;
          return (
            <div key={player.id} style={{
              display:"flex", alignItems:"center", gap:14, padding:"11px 16px", marginBottom:2,
              background: isMe ? "rgba(200,255,0,.05)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.04)` : "#0c1009",
              border:`1px solid ${isMe?"rgba(200,255,0,.4)":isTop3?`rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.25)`:"#1a2808"}`,
              position:"relative", overflow:"hidden",
              transition:"border-color .15s, background .15s",
              cursor:player.publicProfile?"pointer":"default",
            }}
              onClick={() => player.publicProfile && onPlayerClick && onPlayerClick(player.id)}
              onMouseEnter={e => {
                if (player.publicProfile) {
                  e.currentTarget.style.borderColor = isMe ? "rgba(200,255,0,.65)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.5)` : "#2a3a10";
                  e.currentTarget.style.background = isMe ? "rgba(200,255,0,.08)" : "#0e1209";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = isMe ? "rgba(200,255,0,.4)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.25)` : "#1a2808";
                e.currentTarget.style.background = isMe ? "rgba(200,255,0,.05)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.04)` : "#0c1009";
              }}
            >
              <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px)", pointerEvents:"none" }} />
              {(isTop3 || isMe) && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:isMe?"var(--accent)":medalColor }} />}
              {/* Rank number */}
              <div style={{ width:40, textAlign:"center", flexShrink:0, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:isTop3?22:16, color:medalColor||"#2a3a10", lineHeight:1 }}>
                {i + 1}
              </div>
              {/* Avatar */}
              <div style={{ width:36, height:36, background:"#0a0c08", border:`1px solid ${isMe?"rgba(200,255,0,.5)":medalColor||"#1a2808"}`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:14, overflow:"hidden", flexShrink:0, color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif" }}>
                {player.profilePic ? <img src={player.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.85)" }} /> : (player.callsign||player.name)[0]}
              </div>
              {/* Name + rank */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".07em", color:isMe?"#e8f0d8":medalColor||"#b0c090", textTransform:"uppercase", lineHeight:1.1 }}>
                    {player.callsign||player.name}
                  </div>
                  {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".15em", color:"var(--accent)", background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 5px", whiteSpace:"nowrap" }}>← YOU</div>}
                  {player.vipStatus==="active" && <span className="tag tag-gold" style={{ fontSize:8 }}>★ VIP</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3 }}>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".14em", color:isMe?"var(--accent)":medalColor||"#2a3a10" }}>{rankTitle}</div>
                </div>
              </div>
              {/* Deployment count */}
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:isMe?"var(--accent)":medalColor||"#c8ff00", lineHeight:1 }}>{player.gamesAttended}</div>
                {player.publicProfile && onPlayerClick ? (
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".1em", color:"#3a5010", marginTop:3 }}>VIEW FILE ▸</div>
                ) : !player.publicProfile ? (
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".1em", color:"#2a2a2a", marginTop:3, display:"flex", alignItems:"center", justifyContent:"flex-end", gap:3 }}>
                    <svg width="7" height="7" viewBox="0 0 12 14" fill="none"><rect x="1" y="6" width="10" height="7" rx="1" stroke="#2a2a2a" strokeWidth="1.5"/><path d="M4 6V4a2 2 0 014 0v2" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round"/></svg>GHOST
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:24, gap:12, flexWrap:"wrap" }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", color:"#2a3a10" }}>
              SHOWING {pageStart + 1}–{Math.min(pageEnd, board.length)} OF {board.length}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ background:"#0c1009", border:"1px solid #1a2808", color:page===1?"#1a2808":"#b0c090", fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".1em", padding:"6px 14px", cursor:page===1?"not-allowed":"pointer", transition:"border-color .15s, color .15s" }}
                onMouseEnter={e=>{ if(page>1){ e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#c8ff00"; }}}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.color=page===1?"#1a2808":"#b0c090"; }}
              >◂ PREV</button>

              {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i-1] > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={"ellipsis"+idx} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3a10", padding:"0 4px" }}>…</span>
                  ) : (
                    <button key={item} onClick={() => setPage(item)} style={{
                      background: item===page ? "rgba(200,255,0,.12)" : "#0c1009",
                      border: `1px solid ${item===page?"rgba(200,255,0,.5)":"#1a2808"}`,
                      color: item===page ? "#c8ff00" : "#556040",
                      fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".05em",
                      width:34, height:30, cursor:"pointer", transition:"all .15s",
                    }}
                      onMouseEnter={e=>{ if(item!==page){ e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#b0c090"; }}}
                      onMouseLeave={e=>{ if(item!==page){ e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.color="#556040"; }}}
                    >{item}</button>
                  )
                )
              }

              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ background:"#0c1009", border:"1px solid #1a2808", color:page===totalPages?"#1a2808":"#b0c090", fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".1em", padding:"6px 14px", cursor:page===totalPages?"not-allowed":"pointer", transition:"border-color .15s, color .15s" }}
                onMouseEnter={e=>{ if(page<totalPages){ e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#c8ff00"; }}}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.color=page===totalPages?"#1a2808":"#b0c090"; }}
              >NEXT ▸</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gallery ───────────────────────────────────────────────
function GalleryPage({ data }) {
  const [openAlbum, setOpenAlbum] = useState(null);
  const [lightbox, setLightbox]   = useState(null);

  const openLightbox = (url, album, idx) => setLightbox({ url, album, index: idx });
  const closeLightbox = () => setLightbox(null);
  const prevImg = () => {
    const imgs = lightbox.album.images;
    const i = (lightbox.index - 1 + imgs.length) % imgs.length;
    setLightbox({ ...lightbox, url: imgs[i], index: i });
  };
  const nextImg = () => {
    const imgs = lightbox.album.images;
    const i = (lightbox.index + 1) % imgs.length;
    setLightbox({ ...lightbox, url: imgs[i], index: i });
  };

  useEffect(() => {
    if (!lightbox) return;
    const h = e => {
      if (e.key === 'ArrowLeft') prevImg();
      else if (e.key === 'ArrowRight') nextImg();
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox]);

  const PageHeader = () => (
    <div style={{ position:'relative', overflow:'hidden', background:'linear-gradient(180deg,#0c1009 0%,#080a06 100%)', borderBottom:'2px solid #2a3a10', padding:'52px 24px 44px' }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)', pointerEvents:'none' }} />
      {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
        <div key={v+h} style={{ position:'absolute', width:28, height:28, zIndex:2,
          top:v==='top'?14:'auto', bottom:v==='bottom'?14:'auto',
          left:h==='left'?14:'auto', right:h==='right'?14:'auto',
          borderTop:v==='top'?'2px solid #c8ff00':'none', borderBottom:v==='bottom'?'2px solid #c8ff00':'none',
          borderLeft:h==='left'?'2px solid #c8ff00':'none', borderRight:h==='right'?'2px solid #c8ff00':'none',
        }} />
      ))}
      <div style={{ maxWidth:900, margin:'0 auto', textAlign:'center', position:'relative', zIndex:1 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:'.35em', color:'#3a5010', marginBottom:14, textTransform:'uppercase' }}>◈ — SWINDON AIRSOFT — FIELD INTELLIGENCE — ◈</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:'clamp(30px,6vw,56px)', letterSpacing:'.18em', textTransform:'uppercase', color:'#e8f0d8', lineHeight:1, marginBottom:6 }}>
          MISSION <span style={{ color:'#c8ff00', textShadow:'0 0 30px rgba(200,255,0,.35)' }}>ARCHIVE</span>
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:'.25em', color:'#3a5010', marginTop:12 }}>▸ CLASSIFIED FIELD FOOTAGE — AUTHORISED VIEWING ONLY ◂</div>
      </div>
    </div>
  );

  const Lightbox = () => !lightbox ? null : (
    <div onClick={closeLightbox} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.96)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
      {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
        <div key={v+h} style={{ position:'absolute', width:32, height:32, zIndex:501,
          top:v==='top'?12:'auto', bottom:v==='bottom'?12:'auto',
          left:h==='left'?12:'auto', right:h==='right'?12:'auto',
          borderTop:v==='top'?'2px solid rgba(200,255,0,.4)':'none', borderBottom:v==='bottom'?'2px solid rgba(200,255,0,.4)':'none',
          borderLeft:h==='left'?'2px solid rgba(200,255,0,.4)':'none', borderRight:h==='right'?'2px solid rgba(200,255,0,.4)':'none',
        }} />
      ))}
      <button onClick={e=>{e.stopPropagation();prevImg();}} style={{ position:'absolute', left:16, background:'rgba(200,255,0,.08)', border:'1px solid #2a3a10', color:'#c8ff00', fontSize:24, width:48, height:48, cursor:'pointer' }}>‹</button>
      <div style={{ position:'relative', display:'inline-block', maxWidth:'88vw', maxHeight:'84vh' }} onClick={e=>e.stopPropagation()}>
        <img src={lightbox.url} alt="" style={{ maxWidth:'88vw', maxHeight:'84vh', objectFit:'contain', display:'block', boxShadow:'0 0 80px rgba(0,0,0,.9),0 0 0 1px #1a2808' }} />
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:'clamp(16px,3vw,28px)', letterSpacing:'.2em', textTransform:'uppercase', color:'rgba(255,255,255,0.18)', textShadow:'0 2px 6px rgba(0,0,0,.9)', whiteSpace:'nowrap', transform:'rotate(-30deg)', userSelect:'none' }}>SWINDON AIRSOFT</div>
        </div>
      </div>
      <button onClick={e=>{e.stopPropagation();nextImg();}} style={{ position:'absolute', right:16, background:'rgba(200,255,0,.08)', border:'1px solid #2a3a10', color:'#c8ff00', fontSize:24, width:48, height:48, cursor:'pointer' }}>›</button>
      <button onClick={closeLightbox} style={{ position:'absolute', top:16, right:16, background:'rgba(200,255,0,.08)', border:'1px solid #2a3a10', color:'#c8ff00', fontSize:14, width:36, height:36, cursor:'pointer', zIndex:502 }}>✕</button>
      <div style={{ position:'absolute', bottom:16, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'rgba(200,255,0,.4)', letterSpacing:'.2em' }}>
        FRAME {String(lightbox.index+1).padStart(3,'0')} / {String(lightbox.album.images.length).padStart(3,'0')}
      </div>
    </div>
  );

  /* ── Album covers grid ── */
  if (!openAlbum) return (
    <div style={{ background:'#080a06', minHeight:'100vh' }}>
      <PageHeader />
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 16px 80px' }}>
        {data.albums.length === 0
          ? <div style={{ textAlign:'center', padding:80, fontFamily:"'Share Tech Mono',monospace", color:'#2a3a10', fontSize:11, letterSpacing:'.2em' }}>NO MISSION FOOTAGE ON FILE</div>
          : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
              {data.albums.map(album => {
                const cover = album.images[0];
                return (
                  <div key={album.id} onClick={() => setOpenAlbum(album)}
                    style={{ cursor:'pointer', background:'#0c1009', border:'1px solid #1a2808', overflow:'hidden', transition:'border-color .2s, transform .2s' }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#c8ff00';e.currentTarget.style.transform='translateY(-2px)';}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#1a2808';e.currentTarget.style.transform='none';}}>
                    <div style={{ aspectRatio:'16/9', overflow:'hidden', background:'#0a0c08', position:'relative' }}>
                      {cover
                        ? <img src={cover} alt={album.title} style={{ width:'100%', height:'100%', objectFit:'cover', filter:'contrast(1.05) saturate(0.75)' }} />
                        : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#2a3a10', letterSpacing:'.2em' }}>NO COVER</div>
                      }
                      <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 55%)', pointerEvents:'none' }} />
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', pointerEvents:'none' }}>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:'.18em', textTransform:'uppercase', color:'rgba(255,255,255,0.15)', transform:'rotate(-25deg)', userSelect:'none' }}>SWINDON AIRSOFT</div>
                      </div>
                      <div style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.75)', border:'1px solid rgba(200,255,0,.3)', fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#c8ff00', letterSpacing:'.12em', padding:'2px 7px' }}>
                        {album.images.length} FRAMES
                      </div>
                    </div>
                    <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:15, letterSpacing:'.12em', color:'#e8f0d8', textTransform:'uppercase' }}>{album.title}</div>
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#c8ff00', letterSpacing:'.15em' }}>VIEW →</div>
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );

  /* ── Album image grid ── */
  return (
    <div style={{ background:'#080a06', minHeight:'100vh' }}>
      <PageHeader />
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 16px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24, flexWrap:'wrap' }}>
          <button onClick={() => setOpenAlbum(null)}
            style={{ background:'transparent', border:'1px solid #2a3a10', color:'#5a7a30', fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:'.15em', padding:'6px 14px', cursor:'pointer' }}>
            ← ALL ALBUMS
          </button>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:'.2em', color:'#c8ff00', textTransform:'uppercase' }}>▸ {openAlbum.title}</div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#2a3a10', letterSpacing:'.15em', marginLeft:'auto' }}>{openAlbum.images.length} IMAGES</div>
        </div>
        {openAlbum.images.length === 0
          ? <div style={{ background:'#0c1009', border:'1px solid #1a2808', padding:40, textAlign:'center', fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:'#2a3a10', letterSpacing:'.15em' }}>NO FOOTAGE ON FILE</div>
          : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:4 }}>
              {openAlbum.images.map((img, i) => (
                <div key={i} style={{ aspectRatio:'4/3', overflow:'hidden', background:'#0a0c08', position:'relative', cursor:'pointer', border:'1px solid #1a2808' }}
                  onClick={() => openLightbox(img, openAlbum, i)}>
                  <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'contrast(1.05) saturate(0.8)' }} />
                  <div style={{ position:'absolute', inset:0, pointerEvents:'none', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:'clamp(10px,2.5vw,14px)', letterSpacing:'.18em', textTransform:'uppercase', color:'rgba(255,255,255,0.22)', textShadow:'0 1px 3px rgba(0,0,0,.8)', whiteSpace:'nowrap', transform:'rotate(-30deg)', userSelect:'none' }}>SWINDON AIRSOFT</div>
                  </div>
                  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .2s' }}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,0,0,.5)';e.currentTarget.querySelector(".gal-hover-label").style.opacity=1;}}
                    onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0)';e.currentTarget.querySelector(".gal-hover-label").style.opacity=0;}}>
                    <div className="gal-hover-label" style={{ opacity:0, transition:'opacity .2s', fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:'.2em', color:'#c8ff00', textAlign:'center' }}>
                      <div style={{ fontSize:22, marginBottom:4 }}>⊕</div>ENLARGE
                    </div>
                  </div>
                  <div style={{ position:'absolute', bottom:4, right:6, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:'rgba(200,255,0,.4)', letterSpacing:'.1em' }}>{String(i+1).padStart(3,'0')}</div>
                </div>
              ))}
            </div>
        }
      </div>
      <Lightbox />
    </div>
  );
}
// ── Q&A ───────────────────────────────────────────────────
// ── VIP Page ──────────────────────────────────────────────
function VipPage({ data, cu, updateUser, showToast, setAuthModal, setPage }) {
  const isMobile = useMobile(640);
  const [applying, setApplying] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [vipPayError, setVipPayError] = useState(null);

  // ID upload state — up to 2 images, required before payment
  const [idImages, setIdImages] = useState([]); // [{ file, preview, url, uploading, error }]
  const [idStep, setIdStep] = useState(false); // true = show ID upload panel
  const [idUploading, setIdUploading] = useState(false);

  const myBookings = cu ? data.events.flatMap(ev =>
    ev.bookings.filter(b => b.userId === cu.id && b.checkedIn).map(b => b)
  ) : [];
  const gamesAttended = cu ? Math.max(cu.gamesAttended || 0, myBookings.length) : 0;
  const gamesNeeded = Math.max(0, 3 - gamesAttended);
  const canApply = cu && gamesAttended >= 3 && (cu.vipStatus === "none" || cu.vipStatus === "expired") && !cu.vipApplied;
  const isVip = cu?.vipStatus === "active";
  const isExpired = cu?.vipStatus === "expired";
  const hasPending = cu?.vipApplied && !isVip;

  // Handle photo ID file selection (up to 2)
  const handleIdFileSelect = (e, slot) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please select an image file.", "red"); return; }
    if (file.size > 10 * 1024 * 1024) { showToast("File too large — max 10MB.", "red"); return; }
    const preview = URL.createObjectURL(file);
    setIdImages(prev => {
      const next = [...prev];
      next[slot] = { file, preview, url: null, uploading: false, error: null };
      return next;
    });
  };

  const removeIdImage = (slot) => {
    setIdImages(prev => {
      const next = [...prev];
      next[slot] = undefined;
      return next.filter((_, i) => i === 0 || i === 1); // keep slots 0,1
    });
  };

  // Upload all selected ID images to Supabase and save URLs to profile
  const uploadAndProceed = async () => {
    const toUpload = idImages.filter(Boolean);
    if (toUpload.length === 0) { showToast("Please add at least one photo ID.", "red"); return; }
    setIdUploading(true);
    try {
      const urls = [];
      for (let i = 0; i < toUpload.length; i++) {
        const item = toUpload[i];
        const url = await api.profiles.uploadVipId(cu.id, item.file, i);
        urls.push(url);
      }
      await api.profiles.saveVipIdImages(cu.id, urls);
      setIdStep(false);
      setShowPayment(true);
      setVipPayError(null);
    } catch (e) {
      showToast("Upload failed: " + (e.message || String(e)), "red");
    } finally { setIdUploading(false); }
  };

  const handleVipPaymentSuccess = async (squarePayment) => {
    setApplying(true);
    setVipPayError(null);
    try {
      await updateUser(cu.id, { vipApplied: true });
      setShowPayment(false);
      showToast("🎉 Payment received! VIP application submitted — admin will activate your status shortly.");
    } catch (e) {
      const errMsg = "Payment succeeded but VIP application failed — please contact us. Ref: " + squarePayment.id;
      setVipPayError(errMsg);
      supabase.from('failed_payments').insert({
        customer_name:     cu?.name || "Unknown",
        customer_email:    cu?.email || "",
        user_id:           cu?.id || null,
        items:             [{ name: "VIP Membership", price: 0, qty: 1 }],
        total:             0,
        payment_method:    "square_vip",
        error_message:     errMsg,
        square_payment_id: squarePayment?.id || null,
        recorded_by:       null,
      }).then(({ error }) => { if (error) console.warn("Failed to log payment error:", error.message); });
    } finally {
      setApplying(false);
    }
  };

  const benefits = [
    "10% discount on all game day bookings",
    "10% discount at Airsoft Armoury UK (airsoftarmoury.uk)",
    "Free game day on your birthday 🎂",
    "Access to exclusive VIP-only events",
    "Private game day bookings",
    "UKARA registration support",
    "Priority booking for special events",
    "VIP badge on player profile",
    "Valid for calendar year",
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8a000" : "none", borderBottom: v==="bottom" ? "2px solid #c8a000" : "none",
            borderLeft: h==="left" ? "2px solid #c8a000" : "none", borderRight: h==="right" ? "2px solid #c8a000" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — ELITE CLEARANCE — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            ELITE <span style={{ color: "#c8a000", textShadow: "0 0 30px rgba(200,160,0,.35)" }}>OPERATIVE</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ UNLOCK EXCLUSIVE CLEARANCE — JOIN OUR ELITE SQUAD ◂</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22, justifyContent: "center" }}>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to right,transparent,#3a2a00)" }} />
            <div style={{ color: "#c8a000", fontSize: 18, opacity: .6 }}>★</div>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to left,transparent,#3a2a00)" }} />
          </div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth:960 }}>

        {/* Status banner for logged-in users */}
        {isVip && (() => {
          const vipExpiry = cu?.vipExpiresAt ? new Date(cu.vipExpiresAt) : null;
          const expiryStr = vipExpiry
            ? vipExpiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : `December ${new Date().getFullYear()}`;
          return (
            <div className="alert alert-green mb-2" style={{ display:"flex", alignItems:"center", gap:10, fontSize:14 }}>
              ⭐ You are an active VIP member! Your membership is valid through {expiryStr}.
            </div>
          );
        })()}
        {hasPending && (
          <div className="alert alert-blue mb-2" style={{ fontSize:14 }}>
            ⏳ Your VIP application is pending admin review. We'll notify you once it's approved.
          </div>
        )}

        <div className="grid-2" style={{ gap:24, marginBottom:32 }}>

          {/* Benefits */}
          <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px", position:"relative" }}>
            <div style={{ position:"absolute", top:0, left:0, width:16, height:16, borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)" }} />
            <div style={{ position:"absolute", bottom:0, right:0, width:16, height:16, borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)" }} />
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:20, color:"var(--accent)", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>VIP BENEFITS</div>
            {benefits.map((b, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #1a1a1a" }}>
                <div style={{ width:20, height:20, background:"rgba(200,255,0,.15)", border:"1px solid var(--accent)", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ color:"var(--accent)", fontSize:11, fontWeight:900 }}>✓</span>
                </div>
                <span style={{ fontSize:13, color:"#ccc" }}>{b}</span>
              </div>
            ))}
          </div>

          {/* Apply box */}
          <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px" }}>
            {/* Price */}
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:64, color:"var(--accent)", lineHeight:1 }}>£40</div>
              <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>per year</div>
            </div>

            {/* Requirements */}
            <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", padding:"16px", marginBottom:20 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".15em", textTransform:"uppercase", color:"var(--muted)", marginBottom:12 }}>REQUIREMENTS</div>
              {[
                { label:"Registered account", met: !!cu },
                { label:`3 game days completed (${gamesAttended}/3)`, met: gamesAttended >= 3 },
              ].map(({ label, met }) => (
                <div key={label} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0" }}>
                  <span style={{ color: met ? "var(--accent)" : "var(--red)", fontSize:16, lineHeight:1 }}>{met ? "✓" : "✗"}</span>
                  <span style={{ fontSize:13, color: met ? "#ccc" : "var(--muted)" }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Progress bar if not yet eligible */}
            {cu && !isVip && gamesNeeded > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--muted)", marginBottom:6 }}>
                  <span>GAME DAY PROGRESS</span>
                  <span>{gamesAttended} / 3</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: Math.min(100, gamesAttended / 3 * 100) + "%" }} />
                </div>
                <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>{gamesNeeded} more game day{gamesNeeded !== 1 ? "s" : ""} needed to apply</div>
              </div>
            )}

            {/* CTA */}
            {!cu && (
              <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14 }}
                onClick={() => setAuthModal("login")}>LOGIN TO CONTINUE</button>
            )}
            {cu && isVip && (
              <div className="alert alert-green" style={{ textAlign:"center" }}>⭐ You are already a VIP member!</div>
            )}
            {cu && hasPending && (
              <div className="alert alert-blue" style={{ textAlign:"center" }}>⏳ Payment received — application under review. Admin will activate your status shortly.</div>
            )}

            {/* Step 1 — trigger: APPLY button */}
            {cu && canApply && !idStep && !showPayment && (
              <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14 }}
                onClick={() => { setIdStep(true); setVipPayError(null); setIdImages([]); }}>
                {isExpired ? "RENEW VIP — £40/YEAR" : "APPLY & PAY — £40/YEAR"}
              </button>
            )}

            {/* Step 2 — ID upload */}
            {cu && canApply && idStep && !showPayment && (
              <div>
                <div style={{ background:"#0d1a0d", border:"1px solid #1e3a1e", padding:"12px 14px", marginBottom:14, fontSize:12, color:"#8aaa60", lineHeight:1.7 }}>
                  🪪 <strong style={{ color:"#fff" }}>Government-issued photo ID required</strong><br />
                  Please upload a clear photo of your ID (passport, driving licence, or national ID card).<br />
                  You may upload up to 2 images — e.g. front and back. This is stored securely and reviewed by admin only.
                </div>

                {/* Image slot grid */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:10, marginBottom:14 }}>
                  {[0, 1].map(slot => {
                    const img = idImages[slot];
                    return (
                      <div key={slot} style={{ border:`2px dashed ${img ? "#2a3a10" : "#1a1a1a"}`, background:"#0a0a0a", borderRadius:3, overflow:"hidden", position:"relative", aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:6 }}>
                        {img ? (
                          <>
                            <img src={img.preview} alt={`ID ${slot+1}`} style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} />
                            <button onClick={() => removeIdImage(slot)}
                              style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,.75)", border:"none", color:"#fff", borderRadius:2, cursor:"pointer", fontSize:12, padding:"2px 7px", zIndex:2 }}>✕</button>
                            <div style={{ position:"absolute", bottom:4, left:4, background:"rgba(0,0,0,.7)", color:"#c8ff00", fontSize:9, fontFamily:"'Share Tech Mono',monospace", padding:"2px 6px", letterSpacing:".1em" }}>ID {slot+1}</div>
                          </>
                        ) : (
                          <>
                            <label style={{ cursor:"pointer", textAlign:"center", width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4 }}>
                              <span style={{ fontSize:22, opacity:.3 }}>🪪</span>
                              <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".08em" }}>{slot === 0 ? "FRONT / MAIN" : "BACK / OPTIONAL"}</span>
                              <span style={{ fontSize:9, color:"#2a3a10", marginTop:2 }}>tap to add photo</span>
                              <input type="file" accept="image/*" style={{ display:"none" }} onChange={e => handleIdFileSelect(e, slot)} />
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize:10, color:"var(--muted)", marginBottom:12, textAlign:"center", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".06em" }}>
                  ACCEPTED: PASSPORT · DRIVING LICENCE · NATIONAL ID CARD
                </div>

                <button className="btn btn-primary" style={{ width:"100%", padding:"13px", fontSize:13, letterSpacing:".1em", opacity: (idUploading || !idImages.filter(Boolean).length) ? .5 : 1 }}
                  disabled={idUploading || !idImages.filter(Boolean).length}
                  onClick={uploadAndProceed}>
                  {idUploading ? "⏳ Uploading ID…" : "CONTINUE TO PAYMENT →"}
                </button>
                <button className="btn btn-ghost" style={{ width:"100%", marginTop:8, fontSize:12 }}
                  disabled={idUploading} onClick={() => setIdStep(false)}>← Back</button>
              </div>
            )}

            {/* Step 3 — payment */}
            {cu && canApply && showPayment && (
              <div>
                <div style={{ background:"#0d1a0d", border:"1px solid #1e3a1e", padding:"10px 14px", marginBottom:12, fontSize:12, color:"#8aaa60" }}>
                  💳 {isExpired ? "Pay now to renew your VIP membership for another year." : "Pay now to submit your VIP application. Your status will be activated by admin after payment is confirmed."}
                </div>
                <div style={{ background:"rgba(200,255,0,.04)", border:"1px solid #1a2808", padding:"8px 12px", marginBottom:12, fontSize:11, color:"var(--accent)", display:"flex", alignItems:"center", gap:8 }}>
                  <span>✓</span> <span>Photo ID uploaded successfully</span>
                </div>
                {vipPayError && (
                  <div className="alert alert-red" style={{ marginBottom:10 }}>{vipPayError}</div>
                )}
                <SquareCheckoutButton
                  amount={30}
                  description={`Swindon Airsoft — VIP Membership (Annual${isExpired ? " Renewal" : ""})`}
                  disabled={applying}
                  onSuccess={handleVipPaymentSuccess}
                />
                <button className="btn btn-ghost" style={{ width:"100%", marginTop:10, fontSize:12 }}
                  onClick={() => { setShowPayment(false); setIdStep(true); }}>← Change ID photos</button>
              </div>
            )}

            {cu && !isVip && !hasPending && !canApply && (
              <div>
                <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14, opacity:.5, cursor:"not-allowed" }} disabled>
                  APPLY &amp; PAY — £40/YEAR
                </button>
                <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", marginTop:8 }}>
                  Complete {gamesNeeded} more game day{gamesNeeded !== 1 ? "s" : ""} to unlock
                </div>
              </div>
            )}

            <div style={{ marginTop:16, fontSize:11, color:"var(--muted)", lineHeight:1.6, textAlign:"center" }}>
              Pay the £40 annual fee now. Admin will review your ID and activate your VIP status — usually within 24 hours.
            </div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px", marginBottom:32 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"#fff", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>HOW IT WORKS</div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:16 }}>
            {[
              { num:"01", title:"PLAY 3 GAMES", desc:"Attend 3 game days to meet the eligibility requirement. Check-ins are tracked automatically." },
              { num:"02", title:"UPLOAD ID", desc:"Upload a clear photo of your government-issued ID (passport, driving licence, or national ID card). Up to 2 images accepted." },
              { num:"03", title:"PAY & APPLY", desc:"Pay the £40 annual fee. Your application and ID are submitted instantly for admin review." },
              { num:"04", title:"ADMIN ACTIVATES", desc:"Admin reviews your ID and activates your VIP status — usually within 24 hours of payment." },
            ].map(step => (
              <div key={step.num} style={{ padding:16, background:"#0d0d0d", border:"1px solid #1a1a1a" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:36, color:"var(--accent)", opacity:.4, lineHeight:1, marginBottom:8 }}>{step.num}</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"#fff", letterSpacing:".06em", textTransform:"uppercase", marginBottom:6 }}>{step.title}</div>
                <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign:"center" }}>
          <button className="btn btn-ghost" onClick={() => setPage("events")}>← Browse Events</button>
        </div>
      </div>
    </div>
  );
}

// Renders a Q&A answer — splits on newlines and renders each line,
// converting **bold** and *italic* inline markdown.
function renderInline(text) {
  const INLINE_RE = new RegExp("(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|`[^`]+`)", "g");
  const parts = text.split(INLINE_RE);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color:"#fff", fontWeight:700 }}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("*")  && p.endsWith("*"))  return <em key={i} style={{ color:"var(--accent)", fontStyle:"italic" }}>{p.slice(1,-1)}</em>;
    if (p.startsWith("`")  && p.endsWith("`"))  return <code key={i} style={{ background:"#1a1a1a", padding:"1px 5px", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--accent)" }}>{p.slice(1,-1)}</code>;
    return p;
  });
}

function renderQAAnswer(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) return <h4 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:"#fff", margin:"10px 0 4px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(4)}</h4>;
    if (line.startsWith("## "))  return <h3 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)", margin:"12px 0 6px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(3)}</h3>;
    if (line.startsWith("# "))   return <h2 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"var(--accent)", margin:"14px 0 8px" }}>{line.slice(2)}</h2>;
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) return <img key={i} src={imgMatch[2]} alt={imgMatch[1]} style={{ maxWidth:"100%", margin:"8px 0", borderRadius:2 }} />;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", fontSize:13, color:"var(--muted)" }}><span style={{ color:"var(--accent)", flexShrink:0 }}>▸</span>{renderInline(line.slice(2))}</div>;
    }
    if (line.trim() === "") return <div key={i} style={{ height:8 }} />;
    return <p key={i} style={{ fontSize:13, color:"var(--muted)", lineHeight:1.8, margin:"2px 0" }}>{renderInline(line)}</p>;
  });
}

function QAPage({ data }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — FIELD BRIEFING — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            INTEL <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>BRIEFING</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ PRE-MISSION INTELLIGENCE — READ BEFORE DEPLOYMENT ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 16px 80px" }}>
        {data.qa.length === 0 && (
          <div style={{ textAlign: "center", padding: 80, fontFamily: "'Share Tech Mono',monospace", color: "#2a3a10", fontSize: 11, letterSpacing: ".2em" }}>NO INTELLIGENCE ON FILE — CHECK BACK SOON</div>
        )}
        {data.qa.map((item, i) => (
          <div key={item.id} style={{ marginBottom: 3, background: "#0c1009", border: `1px solid ${open === item.id ? "#2a3a10" : "#1a2808"}`, overflow: "hidden", transition: "border-color .15s" }}>
            <div style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
              onClick={() => setOpen(open === item.id ? null : item.id)}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 3 }}>Q{String(i+1).padStart(2,"0")}</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: ".06em", color: "#b0c090", lineHeight: 1.3 }}>{item.q}</div>
              </div>
              <div style={{ color: "#c8ff00", fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 2, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900 }}>
                {open === item.id ? "−" : "+"}
              </div>
            </div>
            {open === item.id && (
              <div style={{ padding: "0 18px 18px 18px", borderTop: "1px solid #1a2808" }}>
                <div style={{ paddingTop: 14, fontSize: 13, color: "#3a5028", lineHeight: 1.7, fontFamily: "'Share Tech Mono',monospace" }}>
                  {renderQAAnswer(item.a)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────
// ── Player Order History ─────────────────────────────────────
const ORDER_STATUS_META = {
  pending:    { color: "#4fc3f7", bg: "rgba(79,195,247,.1)",   border: "rgba(79,195,247,.3)",  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>, label: "Order Received",    step: 1, desc: "Your order has been placed and is awaiting processing." },
  processing: { color: "var(--gold)", bg: "rgba(200,150,0,.1)", border: "rgba(200,150,0,.3)",  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-9.5"/></svg>, label: "Processing",        step: 2, desc: "Your order is being prepared and packed." },
  dispatched: { color: "#c8ff00", bg: "rgba(200,255,0,.08)",   border: "rgba(200,255,0,.25)",  icon: "▸", label: "Dispatched",        step: 3, desc: "Your order is on its way. Check your tracking number below." },
  completed:  { color: "#4caf50", bg: "rgba(76,175,80,.1)",    border: "rgba(76,175,80,.3)",   icon: "✅", label: "Delivered",         step: 4, desc: "Order complete. Enjoy your kit!" },
  cancelled:  { color: "var(--red)", bg: "rgba(220,50,50,.08)", border: "rgba(220,50,50,.25)", icon: "✗",  label: "Cancelled",         step: 0, desc: "This order has been cancelled." },
  return_requested: { color: "var(--gold)", bg: "rgba(200,150,0,.08)", border: "rgba(200,150,0,.25)", icon: "↩", label: "Return Requested", step: 3, desc: "Your return request is being reviewed." },
  return_approved:  { color: "#4fc3f7",     bg: "rgba(79,195,247,.08)", border: "rgba(79,195,247,.25)", icon: "✅", label: "Return Approved",  step: 3, desc: "Return approved — please send the item back." },
  return_received:  { color: "#4caf50",     bg: "rgba(76,175,80,.08)", border: "rgba(76,175,80,.25)",  icon: "📦", label: "Return Received",  step: 4, desc: "We have received your return." },
};

const ORDER_STEPS = [
  { step: 1, label: "Order Placed" },
  { step: 2, label: "Processing" },
  { step: 3, label: "Dispatched" },
  { step: 4, label: "Delivered" },
];

// ── Return Request Block (customer-facing) ───────────────────
function ReturnRequestBlock({ order, onUpdate }) {
  const [step, setStep]               = useState("idle");
  const [reason, setReason]           = useState("");
  const [notes, setNotes]             = useState("");
  const [returnTracking, setReturnTracking] = useState("");
  const [busy, setBusy]               = useState(false);
  const [rmaNumber, setRmaNumber]     = useState(order?.return_number || null);

  const status          = order?.status;
  const canRequest      = ["dispatched", "completed"].includes(status);
  const alreadyRequested = ["return_requested", "return_approved", "return_received"].includes(status);
  const isApproved      = status === "return_approved";
  const isReceived      = status === "return_received";

  // Generate RMA number: RMA- + 8 uppercase alphanumeric chars derived from order id + timestamp
  const generateRma = () => {
    const base = ((order.id || "") + Date.now().toString(36)).replace(/[^a-z0-9]/gi, "").toUpperCase();
    return "RMA-" + base.slice(0, 8).padEnd(8, "0");
  };

  const submitRequest = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const rma = generateRma();
      await supabase.from("shop_orders").update({
        status:        "return_requested",
        return_reason: reason.trim(),
        return_notes:  notes.trim() || null,
        return_number: rma,
      }).eq("id", order.id);
      setRmaNumber(rma);
      if (onUpdate) onUpdate({ status: "return_requested", return_reason: reason.trim(), return_notes: notes.trim() || null, return_number: rma });
      setStep("submitted");
      // Notify admin
      try {
        const adminEmail = await api.settings.get("contact_email");
        if (adminEmail) {
          sendAdminReturnNotification({
            adminEmail,
            order: { ...order, return_reason: reason.trim(), return_notes: notes.trim() || null, return_number: rma },
          }).catch(() => {});
        }
      } catch {}
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  const submitReturnTracking = async () => {
    if (!returnTracking.trim()) return;
    setBusy(true);
    try {
      await supabase.from("shop_orders").update({ return_tracking: returnTracking.trim() }).eq("id", order.id);
      if (onUpdate) onUpdate({ return_tracking: returnTracking.trim() });
      setStep("tracking_saved");
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  if (!canRequest && !alreadyRequested) return null;

  const RETURN_REASONS = [
    "Wrong item received",
    "Damaged / faulty on arrival",
    "Changed my mind",
    "Other",
  ];

  const rmaDisplay = rmaNumber || order?.return_number;

  const RmaTag = () => rmaDisplay ? (
    <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.2)", padding:"5px 12px", marginBottom:10 }}>
      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"var(--muted)", letterSpacing:".15em" }}>RETURN REF</span>
      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, fontWeight:700, color:"#c8ff00", letterSpacing:".12em" }}>{rmaDisplay}</span>
    </div>
  ) : null;

  if (isReceived) return (
    <div style={{ background:"rgba(76,175,80,.08)", border:"1px solid rgba(76,175,80,.25)", padding:"14px 18px", marginTop:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#4caf50", letterSpacing:".12em", marginBottom:8, textTransform:"uppercase" }}>📦 Return Received</div>
      <RmaTag />
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
        We have received your return. A refund will be processed shortly if applicable.
      </div>
    </div>
  );

  if (isApproved) return (
    <div style={{ background:"rgba(79,195,247,.08)", border:"1px solid rgba(79,195,247,.3)", padding:"14px 18px", marginTop:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#4fc3f7", letterSpacing:".12em", marginBottom:8, textTransform:"uppercase" }}>✅ Return Approved</div>
      <RmaTag />
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)", lineHeight:1.7, marginBottom:12 }}>
        Your return has been approved. Please send the item back at your own cost — <strong style={{ color:"var(--text)" }}>return postage is your responsibility</strong>. Do not send anything until approved. Once we receive it, we'll process your refund.
      </div>
      {order.return_tracking ? (
        <div style={{ fontSize:11, color:"#c8ff00", fontFamily:"'Share Tech Mono',monospace" }}>
          📮 Your return tracking: <strong>{order.return_tracking}</strong>
        </div>
      ) : (
        <div>
          <div style={{ fontSize:11, color:"var(--muted)", marginBottom:6 }}>Add your return tracking number so we can monitor the shipment:</div>
          <div style={{ display:"flex", gap:8 }}>
            <input value={returnTracking} onChange={e => setReturnTracking(e.target.value)}
              placeholder="e.g. ZI256942439GB" style={{ flex:1, fontSize:12 }} />
            <button className="btn btn-sm btn-primary" disabled={busy || !returnTracking.trim()} onClick={submitReturnTracking}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Rejected state — order reverted to dispatched but rejection reason stored
  if (order.return_rejection_reason && status === "dispatched") return (
    <div style={{ background:"rgba(220,50,50,.07)", border:"1px solid rgba(220,50,50,.3)", padding:"14px 18px", marginTop:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"var(--red)", letterSpacing:".12em", marginBottom:8, textTransform:"uppercase" }}>✗ Return Not Approved</div>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
        Your return request was reviewed and could not be approved.
        <br /><span style={{ color:"var(--text)", fontWeight:700 }}>Reason: </span><span style={{ color:"var(--text)" }}>{order.return_rejection_reason}</span>
      </div>
      <div style={{ marginTop:8, fontSize:11, color:"var(--muted)" }}>If you have questions, please contact us through the Contact page.</div>
    </div>
  );

  // Return approved state
  if (isApproved) return (
    <div style={{ background:"rgba(79,195,247,.07)", border:"1px solid rgba(79,195,247,.3)", padding:"14px 18px", marginTop:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#4fc3f7", letterSpacing:".12em", marginBottom:8, textTransform:"uppercase" }}>✅ Return Approved</div>
      <RmaTag />
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)", lineHeight:1.7, marginBottom:10 }}>
        Your return has been approved. Please send the item back using the instructions emailed to you.
      </div>
      <div style={{ background:"rgba(79,195,247,.05)", border:"1px solid rgba(79,195,247,.2)", padding:"10px 14px", fontSize:11, color:"#8acce0", lineHeight:1.8 }}>
        <strong style={{ color:"#4fc3f7" }}>Important:</strong> Items must be in <strong style={{ color:"#fff" }}>unused, unopened condition in original packaging where possible.</strong> Deductions may be made for items that have been opened or show signs of use. Return postage is your responsibility.
      </div>
    </div>
  );

  // Return received state
  if (isReceived) return (
    <div style={{ background:"rgba(76,175,80,.07)", border:"1px solid rgba(76,175,80,.3)", padding:"14px 18px", marginTop:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#4caf50", letterSpacing:".12em", marginBottom:8, textTransform:"uppercase" }}>📦 Return Received</div>
      <RmaTag />
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
        We have received your return. A refund will be processed within 5–10 business days once the item has been inspected.
      </div>
    </div>
  );

  if (alreadyRequested || step === "submitted") return (
    <div style={{ background:"rgba(200,150,0,.08)", border:"1px solid rgba(200,150,0,.3)", padding:"14px 18px", marginTop:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"var(--gold)", letterSpacing:".12em", marginBottom:8, textTransform:"uppercase" }}>↩ Return Requested</div>
      <RmaTag />
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
        Your return request is being reviewed. We'll update your order status once a decision has been made.
        {order.return_reason && <><br /><span style={{ color:"var(--text)" }}>Reason: {order.return_reason}</span></>}
        {order.return_notes  && <><br /><span style={{ color:"var(--muted)" }}>Notes: {order.return_notes}</span></>}
      </div>
    </div>
  );

  if (step === "form") return (
    <div style={{ background:"#0d0d0d", border:"1px solid var(--border)", padding:"14px 18px", marginTop:14 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:".15em", color:"var(--muted)", marginBottom:12, textTransform:"uppercase" }}>↩ Request a Return</div>

      <div className="form-group" style={{ marginBottom:10 }}>
        <label style={{ fontSize:11 }}>Reason for return <span style={{ color:"var(--red)" }}>*</span></label>
        <select value={reason} onChange={e => setReason(e.target.value)} style={{ fontSize:12 }}>
          <option value="">— Select a reason —</option>
          {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="form-group" style={{ marginBottom:12 }}>
        <label style={{ fontSize:11 }}>Additional notes <span style={{ fontSize:10, color:"var(--muted)" }}>(optional)</span></label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Please describe the issue in more detail — include photos if possible via email after submitting. e.g. packaging condition, fault description, order discrepancy…"
          rows={4}
          style={{ fontSize:12, resize:"vertical", width:"100%", boxSizing:"border-box" }}
        />
      </div>

      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:14, fontFamily:"'Share Tech Mono',monospace", lineHeight:1.7, background:"rgba(255,160,0,.05)", border:"1px solid rgba(255,160,0,.15)", padding:"8px 12px" }}>
        ⚠️ <span style={{ color:"var(--text)" }}>Return postage is the customer's responsibility.</span> Do not send any items back until your return has been approved. A return reference number will be generated on submission.
      </div>

      <div style={{ display:"flex", gap:8 }}>
        <button className="btn btn-sm btn-primary" disabled={busy || !reason.trim()} onClick={submitRequest}>
          {busy ? "Submitting…" : "Submit Return Request"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setStep("idle")}>Cancel</button>
      </div>
    </div>
  );

  // idle — show prompt
  return (
    <div style={{ background:"rgba(200,255,0,.04)", border:"1px solid rgba(200,255,0,.12)", padding:"10px 16px", marginTop:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", lineHeight:1.7 }}>
          ↩ Need to return something? <span style={{ color:"var(--text)" }}>Return postage is the customer's responsibility.</span>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setStep("form")} style={{ fontSize:11, whiteSpace:"nowrap" }}>
          Request Return
        </button>
      </div>
    </div>
  );
}

// ── Order Detail (customer view) ─────────────────────────────
function CustomerOrderDetail({ order: selected }) {
  const items = Array.isArray(selected.items) ? selected.items : [];
  const meta = ORDER_STATUS_META[selected.status] || ORDER_STATUS_META.pending;
  const isCancelled = selected.status === "cancelled";
  const [liveTrackStatus, setLiveTrackStatus] = useState(null);
  const displayLabel = (selected.status === "dispatched" && liveTrackStatus) ? liveTrackStatus : meta.label;
  const displayColor = (selected.status === "dispatched" && liveTrackStatus)
    ? ({ "Delivered": "#4caf50", "In Transit": "#c8ff00", "Out for Delivery": "#ff9800", "Pending": "#4fc3f7", "Undelivered": "var(--red)", "Expired": "var(--muted)", "Pick Up": "#ff9800" }[liveTrackStatus] || meta.color)
    : meta.color;

  return (
    <div>
      {/* Status header */}
      <div style={{ background: meta.bg, border: `1px solid ${meta.border}`, padding: "18px 22px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "var(--muted)", letterSpacing: ".15em", marginBottom: 4 }}>
              ORDER #{(selected.id||"").slice(-8).toUpperCase()}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: ".1em", color: displayColor, textTransform: "uppercase" }}>
              {meta.icon} {displayLabel}
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)", marginTop: 5 }}>{meta.desc}</div>
          </div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 28, color: "var(--accent)" }}>
            £{Number(selected.total).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Progress tracker (skip for cancelled) */}
      {!isCancelled && (
        <div style={{ background: "#0d0d0d", border: "1px solid var(--border)", padding: "16px 22px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".15em", color: "var(--muted)", marginBottom: 14, textTransform: "uppercase" }}>Order Progress</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            {ORDER_STEPS.map((s, i) => {
              const done = meta.step >= s.step;
              const current = meta.step === s.step;
              return (
                <div key={s.step} style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1, gap:0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? "#c8ff00" : "#1a1a1a", border: `2px solid ${done ? "#c8ff00" : current ? "rgba(200,255,0,.4)" : "#2a2a2a"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: done ? "#000" : "var(--muted)", fontWeight: 900, boxShadow: current ? "0 0 12px rgba(200,255,0,.4)" : "none", transition: "all .3s" }}>
                      {done ? "✓" : s.step}
                    </div>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: done ? "#c8ff00" : "var(--muted)", marginTop: 6, textAlign: "center", letterSpacing: ".08em", textTransform: "uppercase" }}>{s.label}</div>
                  </div>
                  {i < ORDER_STEPS.length - 1 && (
                    <div style={{ flex: 2, height: 2, background: meta.step > s.step ? "#c8ff00" : "#1a1a1a", transition: "background .3s", marginBottom: 20 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tracking number */}
      {selected.tracking_number && <TrackingBlock trackingNumber={selected.tracking_number} onStatusResolved={setLiveTrackStatus} />}

      {/* Refund notice */}
      {selected.refund_amount > 0 && (
        <div style={{ background: "rgba(79,195,247,.08)", border: "1px solid rgba(79,195,247,.3)", padding: "12px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4fc3f7", letterSpacing: ".12em", marginBottom: 4, textTransform: "uppercase" }}>💳 Refund Issued</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "var(--muted)" }}>
            £{Number(selected.refund_amount).toFixed(2)} refunded to your original payment method
            {selected.refund_note ? ` — ${selected.refund_note}` : ""}
          </div>
        </div>
      )}

      {/* Items table */}
      <div style={{ background: "#0d0d0d", border: "1px solid var(--border)", marginBottom: 14 }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, letterSpacing: ".15em", color: "var(--muted)", textTransform: "uppercase" }}>
          Items
        </div>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
              {item.variant && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{item.variant}</div>}
            </div>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)" }}>×{item.qty}</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "var(--text)", minWidth: 60, textAlign: "right" }}>£{(Number(item.price) * item.qty).toFixed(2)}</div>
            </div>
          </div>
        ))}
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", background: "#0a0a0a" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Postage ({selected.postage_name || "Standard"})</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12 }}>£{Number(selected.postage || 0).toFixed(2)}</span>
        </div>
        <div style={{ padding: "12px 16px", borderTop: "2px solid var(--border)", display: "flex", justifyContent: "space-between", background: "#0a0a0a" }}>
          <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: ".08em", fontFamily: "'Barlow Condensed',sans-serif", textTransform: "uppercase" }}>Total Paid</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 16, fontWeight: 900, color: "var(--accent)" }}>£{Number(selected.total).toFixed(2)}</span>
        </div>
      </div>

      {/* Delivery address */}
      {selected.customer_address && (
        <div style={{ background: "#0d0d0d", border: "1px solid var(--border)", padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".15em", color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>📍 Shipping Address</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "var(--text)", whiteSpace: "pre-line", lineHeight: 1.8 }}>{selected.customer_address}</div>
        </div>
      )}

      {/* Return request section */}
      <ReturnRequestBlock order={selected} onUpdate={(patch) => {
        // Patch the local order so the UI reflects the request immediately
        Object.assign(selected, patch);
      }} />
    </div>
  );
}

function PlayerOrders({ cu }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState(null);
  const isMounted = useRef(true);

  const loadOrders = useCallback(async () => {
    if (!cu?.id || !isMounted.current) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('shop_orders').select('*')
        .eq('user_id', cu.id)
        .order('created_at', { ascending: false });
      if (!isMounted.current) return;
      if (!error) {
        const loaded = data || [];
        setOrders(loaded);
        const active = loaded.find(o => !["completed","cancelled"].includes(o.status));
        if (active) setActiveOrder(active.id);
        else if (loaded.length > 0) setActiveOrder(loaded[0].id);
      }
    } catch (e) { console.warn("PlayerOrders fetch:", e.message); }
    finally { if (isMounted.current) setLoading(false); }
  }, [cu?.id]);

  useEffect(() => {
    isMounted.current = true;
    loadOrders();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) loadOrders(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [loadOrders]);

  // Use module-level order status constants
  const STATUS_META = ORDER_STATUS_META;
  const STEPS = ORDER_STEPS;

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "var(--muted)", letterSpacing: ".1em" }}>
      LOADING ORDERS…
    </div>
  );

  if (orders.length === 0) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>📦</div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: ".15em", color: "var(--muted)", textTransform: "uppercase" }}>No Orders Yet</div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#2a3a10", marginTop: 8 }}>Head to the shop to browse our gear</div>
    </div>
  );

  const selected = orders.find(o => o.id === activeOrder);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: 16, alignItems: "start" }}>

      {/* ── Order list sidebar ── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", color: "var(--muted)", marginBottom: 10, textTransform: "uppercase" }}>Your Orders</div>
        {orders.map(o => {
          const meta = STATUS_META[o.status] || STATUS_META.pending;
          const items = Array.isArray(o.items) ? o.items : [];
          const isActive = o.id === activeOrder;
          return (
            <div key={o.id} onClick={() => setActiveOrder(o.id)}
              style={{ padding: "12px 14px", marginBottom: 6, cursor: "pointer", border: `1px solid ${isActive ? meta.border : "var(--border)"}`, background: isActive ? meta.bg : "#0d0d0d", transition: "all .15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
                  #{(o.id||"").slice(-6).toUpperCase()}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: meta.color, fontFamily: "'Share Tech Mono',monospace" }}>
                  {meta.icon} {meta.label.toUpperCase()}
                </div>
              </div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, color: isActive ? "#fff" : "var(--muted)", letterSpacing: ".05em", lineHeight: 1.3, marginBottom: 3 }}>
                {items.slice(0,2).map(i => i.name).join(", ")}{items.length > 2 ? ` +${items.length-2}` : ""}
              </div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a3a3a", display: "flex", justifyContent: "space-between" }}>
                <span>{new Date(o.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}</span>
                <span style={{ color: isActive ? meta.color : "var(--muted)", fontWeight: 700 }}>£{Number(o.total).toFixed(2)}</span>
              </div>
              {o.tracking_number && (() => {
                const { courier, trackUrl } = detectCourier(o.tracking_number);
                const url = trackUrl || `https://www.royalmail.com/track-your-item#/tracking-results/${o.tracking_number.trim()}`;
                return (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ display:"inline-flex", alignItems:"center", gap:4, marginTop:6, fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#c8ff00", textDecoration:"none", letterSpacing:".08em", background:"rgba(200,255,0,.07)", border:"1px solid rgba(200,255,0,.2)", padding:"3px 8px", borderRadius:2 }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(200,255,0,.15)"}
                    onMouseLeave={e => e.currentTarget.style.background="rgba(200,255,0,.07)"}>
                    📮 {courier || "TRACK"} ↗
                  </a>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* ── Order detail ── */}
      {selected && <CustomerOrderDetail order={selected} />}
    </div>
  );
}

// ── Loadout field config ──────────────────────────────────────
const LOADOUT_WEAPON_FIELDS = [
  { key: "Name",     field: "name",     placeholder: "e.g. Tokyo Marui M4A1" },
  { key: "FPS",      field: "fps",      placeholder: "e.g. 350 FPS" },
  { key: "Mags",     field: "mags",     placeholder: "e.g. 5× mid-cap 120rnd" },
  { key: "Upgrades", field: "upgrades", placeholder: "e.g. Prometheus hop rubber, SHS motor" },
];
const LOADOUT_GEAR_FIELDS = [
  { key: "Helmet",      field: "helmet",     placeholder: "e.g. Ops-Core FAST Carbon" },
  { key: "Vest / Rig",  field: "vest",       placeholder: "e.g. Crye JPC 2.0" },
  { key: "Camo",        field: "camo",       placeholder: "e.g. Multicam / MTP" },
  { key: "Eye Pro",     field: "eyepro",     placeholder: "e.g. Revision Sawfly" },
  { key: "Comms",       field: "comms",      placeholder: "e.g. Baofeng UV-5R + Peltor" },
  { key: "Boots",       field: "boots",      placeholder: "e.g. Haix Black Eagle" },
  { key: "Other Gear",  field: "other_gear", placeholder: "Knee pads, gloves, chest rig extras…" },
];

function LoadoutTab({ cu, showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publicProfile, setPublicProfile] = useState(cu.publicProfile ?? false);
  const [bio, setBio] = useState(cu.bio || "");
  const defaultLoadout = {
    primary_name: "", primary_fps: "", primary_mags: "", primary_upgrades: "",
    secondary_name: "", secondary_fps: "", secondary_mags: "", secondary_upgrades: "",
    support_name: "", support_fps: "", support_mags: "", support_upgrades: "",
    helmet: "", vest: "", camo: "", eyepro: "", comms: "", boots: "", other_gear: "",
    notes: "",
  };
  const [draft, setDraft] = useState(defaultLoadout);
  const isMounted = useRef(true);

  const loadLoadout = useCallback(async () => {
    if (!cu?.id || !isMounted.current) return;
    setLoading(true);
    try {
      const data = await api.loadouts.getMyLoadout(cu.id);
      if (isMounted.current && data) setDraft(prev => ({ ...prev, ...data }));
    } catch (e) { console.warn("Loadout fetch:", e.message); }
    finally { if (isMounted.current) setLoading(false); }
  }, [cu?.id]);

  useEffect(() => {
    isMounted.current = true;
    loadLoadout();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) loadLoadout(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [loadLoadout]);

  const set = (field, val) => setDraft(p => ({ ...p, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.loadouts.save(cu.id, draft);
      const { error } = await supabase.from("profiles").update({ public_profile: publicProfile, bio }).eq("id", cu.id);
      if (error) throw error;
      showToast("Loadout saved!");
    } catch (e) {
      showToast("Save failed: " + (e.message || "unknown error"), "red");
    } finally { setSaving(false); }
  };

  const profileUrl = `${window.location.origin}${window.location.pathname}#player/${cu.id}`;

  if (loading) return (
    <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading loadout…</div>
  );

  return (
    <div className="card">
      <div style={{ background: "rgba(200,255,0,.06)", border: "1px solid rgba(200,255,0,.2)", padding: "14px 16px", marginBottom: 24, borderRadius: 4, display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".12em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 4 }}>🌐 Public Profile</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>When enabled, anyone can view your callsign, profile picture, games attended, and loadout via a shareable link. Personal details are never shown.</div>
          {publicProfile && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono',monospace", color: "var(--accent)", background: "rgba(200,255,0,.08)", padding: "4px 10px", border: "1px solid rgba(200,255,0,.2)", borderRadius: 2 }}>{profileUrl}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(profileUrl); showToast("Link copied!"); }}>Copy Link</button>
            </div>
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0, marginTop: 4 }}>
          <div style={{ width: 44, height: 24, borderRadius: 12, background: publicProfile ? "var(--accent)" : "var(--bg4)", border: `1px solid ${publicProfile ? "var(--accent)" : "var(--border)"}`, position: "relative", transition: "background .2s", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: publicProfile ? "#000" : "#888", position: "absolute", top: 2, left: publicProfile ? 22 : 2, transition: "left .2s" }} />
          </div>
          <input type="checkbox" checked={publicProfile} onChange={e => setPublicProfile(e.target.checked)} style={{ display: "none" }} />
          <span style={{ fontSize: 12, color: publicProfile ? "var(--accent)" : "var(--muted)", fontWeight: 700, letterSpacing: ".08em", fontFamily: "'Barlow Condensed',sans-serif" }}>{publicProfile ? "PROFILE PUBLIC" : "PROFILE PRIVATE"}</span>
        </label>
      </div>

      <div className="form-group" style={{ marginBottom: 24 }}>
        <label>Player Bio <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(shown on your public profile)</span></label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the community about your play style, team, or experience…" maxLength={300} rows={3} style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{bio.length}/300</div>
      </div>

      {[
        { label: "Primary Weapon",              prefix: "primary" },
        { label: "Secondary Weapon",            prefix: "secondary" },
        { label: "Support / Special (optional)",prefix: "support" },
      ].map(({ label, prefix }) => (
        <div key={prefix} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".14em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>🔫 {label}</div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "12px 14px", borderRadius: 2 }}>
            {LOADOUT_WEAPON_FIELDS.map(({ key, field, placeholder }) => (
              <div className="form-group" key={field} style={{ marginBottom: 10 }}>
                <label style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 11 }}>{key}</label>
                <input value={draft[`${prefix}_${field}`] || ""} onChange={e => set(`${prefix}_${field}`, e.target.value)} placeholder={placeholder} maxLength={120} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".14em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>🪖 Kit &amp; Gear</div>
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "12px 14px", borderRadius: 2 }}>
          {LOADOUT_GEAR_FIELDS.map(({ key, field, placeholder }) => (
            <div className="form-group" key={field} style={{ marginBottom: 10 }}>
              <label style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 11 }}>{key}</label>
              <input value={draft[field] || ""} onChange={e => set(field, e.target.value)} placeholder={placeholder} maxLength={120} />
            </div>
          ))}
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 24 }}>
        <label>Loadout Notes <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(role, play style, etc.)</span></label>
        <textarea value={draft.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="e.g. Run-and-gun CQB player, medic role, prefer night ops…" maxLength={400} rows={3} style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Loadout"}</button>
    </div>
  );
}

// ─── Shared rank & designation insignia — used in PublicProfilePage + AdminPlayers ───

function RankInsignia({ rank, size = 56 }) {
  const s = size; const c = "#c8ff00"; const dim = "#1e3008"; const gold = "#c8a000"; const cx = s / 2; const cy = s / 2;

  // British Army style: OR ranks use chevrons (point-up), NCO/Officer use pips, top rank uses crown+pips
  const Chevron = ({ y }) => (
    <polyline points={`${s*.12},${y + s*.14} ${cx},${y} ${s*.88},${y + s*.14}`}
      fill="none" stroke={c} strokeWidth={s * .04} strokeLinecap="round" strokeLinejoin="round"/>
  );
  const Pip = ({ px, py, filled = false }) => (
    <g>
      <polygon points={`${px},${py - s*.13} ${px + s*.12},${py - s*.04} ${px + s*.08},${py + s*.1} ${px - s*.08},${py + s*.1} ${px - s*.12},${py - s*.04}`}
        fill={filled ? gold : "none"} stroke={gold} strokeWidth={s * .03}/>
    </g>
  );
  const Crown = ({ px, py }) => {
    const w = s * .32; const h = s * .2;
    return (
      <g fill="none" stroke={gold} strokeWidth={s * .035} strokeLinejoin="round">
        <polyline points={`${px - w},${py + h*.4} ${px - w},${py - h*.3} ${px - w*.5},${py + h*.05} ${px},${py - h*.6} ${px + w*.5},${py + h*.05} ${px + w},${py - h*.3} ${px + w},${py + h*.4}`}/>
        <line x1={px - w} y1={py + h*.4} x2={px + w} y2={py + h*.4}/>
        <circle cx={px} cy={py - h*.6} r={s*.04} fill={gold}/>
        <circle cx={px - w*.5} cy={py - h*.05} r={s*.03} fill={gold}/>
        <circle cx={px + w*.5} cy={py - h*.05} r={s*.03} fill={gold}/>
      </g>
    );
  };
  // Beret — used for Private and Recruit (no official British Army insignia yet)
  const Beret = ({ col = c }) => {
    const bw = s * .7; const bh = s * .32; const bx = cx - bw/2; const by = cy - bh * .3;
    return (
      <g>
        {/* Beret dome */}
        <ellipse cx={cx} cy={by} rx={bw/2} ry={bh} fill="rgba(200,255,0,.06)" stroke={col} strokeWidth={s*.03}/>
        {/* Brim band */}
        <rect x={bx} y={by + bh*.55} width={bw} height={s*.09} fill="rgba(200,255,0,.1)" stroke={col} strokeWidth={s*.025} rx={s*.01}/>
        {/* Cap badge — small diamond */}
        <polygon points={`${cx - s*.04},${by - bh*.1} ${cx},${by - bh*.38} ${cx + s*.04},${by - bh*.1} ${cx},${by + bh*.18}`} fill={col} stroke="none" opacity=".7"/>
        {/* Brim chin strap suggestion */}
        <line x1={bx + bw*.05} y1={by + bh*.64} x2={bx - s*.05} y2={by + bh*.9} stroke={col} strokeWidth={s*.02} strokeLinecap="round" opacity=".5"/>
        <line x1={bx + bw*.95} y1={by + bh*.64} x2={bx + bw + s*.05} y2={by + bh*.9} stroke={col} strokeWidth={s*.02} strokeLinecap="round" opacity=".5"/>
      </g>
    );
  };

  // British Army rank structure mapped to Swindon Airsoft ranks:
  // Civilian — dashed circle (no affiliation)
  // Private / Recruit — Beret (no earned insignia yet)
  // Operative — 3 chevrons (Sergeant)
  // Senior Operative — 3 gold pips (Captain)
  // Field Commander — Crown + 2 filled pips (Colonel)
  const gap = s * .135;
  const insig = {
    "CIVILIAN": (
      <circle cx={cx} cy={cy} r={s*.1} fill="none" stroke={dim} strokeWidth={s*.025} strokeDasharray={`${s*.05},${s*.05}`}/>
    ),
    "PRIVATE": (
      <Beret/>
    ),
    "RECRUIT": (
      <Beret col="#6ab030"/>
    ),
    "OPERATIVE": (
      <g><Chevron y={cy - gap*1.6}/><Chevron y={cy - gap*.45}/><Chevron y={cy + gap*.7}/></g>
    ),
    "SENIOR OPERATIVE": (
      <g>
        <Pip px={cx - s*.18} py={cy}/>
        <Pip px={cx}         py={cy}/>
        <Pip px={cx + s*.18} py={cy}/>
      </g>
    ),
    "FIELD COMMANDER": (
      <g>
        <Crown px={cx} py={cy - s*.12}/>
        <Pip px={cx - s*.15} py={cy + s*.2} filled/>
        <Pip px={cx + s*.15} py={cy + s*.2} filled/>
      </g>
    ),
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
      <rect width={s} height={s} fill="#080a06" rx={s * .04}/>
      {insig[rank] || <circle cx={cx} cy={cy} r={s*.08} fill={dim}/>}
    </svg>
  );
}

function DesignationInsignia({ desig, size = 56 }) {
  const s = size; const c = "#4fc3f7"; const gold = "#c8a000"; const cx = s / 2; const cy = s / 2;
  const icons = {
    "GHOST":        <g stroke={c} fill="none" strokeWidth={s*.033}><ellipse cx={cx} cy={cy + s*.04} rx={s*.18} ry={s*.21}/><polyline points={`${cx - s*.18},${cy + s*.25} ${cx - s*.1},${cy + s*.18} ${cx - s*.04},${cy + s*.25} ${cx + s*.04},${cy + s*.18} ${cx + s*.1},${cy + s*.25} ${cx + s*.18},${cy + s*.18}`}/><circle cx={cx - s*.07} cy={cy - s*.02} r={s*.035} fill={c}/><circle cx={cx + s*.07} cy={cy - s*.02} r={s*.035} fill={c}/></g>,
    "SNIPER":       <g stroke={c} fill="none" strokeWidth={s*.033}><circle cx={cx} cy={cy} r={s*.18}/><line x1={cx} y1={cy - s*.28} x2={cx} y2={cy - s*.18}/><line x1={cx} y1={cy + s*.18} x2={cx} y2={cy + s*.28}/><line x1={cx - s*.28} y1={cy} x2={cx - s*.18} y2={cy}/><line x1={cx + s*.18} y1={cy} x2={cx + s*.28} y2={cy}/><circle cx={cx} cy={cy} r={s*.04} fill={c}/></g>,
    "MEDIC":        <g stroke={c} fill="rgba(79,195,247,.12)" strokeWidth={s*.038}><rect x={cx - s*.15} y={cy - s*.07} width={s*.3} height={s*.14} rx={s*.02}/><rect x={cx - s*.07} y={cy - s*.15} width={s*.14} height={s*.3} rx={s*.02}/></g>,
    "DEMOLITIONS":  <g stroke={c} fill="none" strokeWidth={s*.033}><ellipse cx={cx} cy={cy + s*.04} rx={s*.11} ry={s*.16}/><line x1={cx} y1={cy - s*.12} x2={cx} y2={cy - s*.25}/><polyline points={`${cx - s*.07},${cy - s*.25} ${cx},${cy - s*.2} ${cx + s*.07},${cy - s*.25}`}/><line x1={cx - s*.18} y1={cy + s*.04} x2={cx + s*.18} y2={cy + s*.04}/></g>,
    "RECON":        <g stroke={c} fill="none" strokeWidth={s*.033}><circle cx={cx} cy={cy} r={s*.08}/><path d={`M${cx - s*.15},${cy} Q${cx},${cy - s*.25} ${cx + s*.15},${cy}`}/><path d={`M${cx - s*.15},${cy} Q${cx},${cy + s*.25} ${cx + s*.15},${cy}`}/><line x1={cx - s*.28} y1={cy} x2={cx - s*.15} y2={cy}/><line x1={cx + s*.15} y1={cy} x2={cx + s*.28} y2={cy}/></g>,
    "HEAVY GUNNER": <g stroke={c} fill="none" strokeWidth={s*.033}><rect x={cx - s*.2} y={cy - s*.08} width={s*.32} height={s*.11} rx={s*.03}/><rect x={cx + s*.08} y={cy - s*.12} width={s*.07} height={s*.04} rx={s*.01}/><circle cx={cx - s*.14} cy={cy + s*.15} r={s*.055}/><circle cx={cx + s*.04} cy={cy + s*.15} r={s*.055}/><line x1={cx - s*.28} y1={cy - s*.02} x2={cx - s*.2} y2={cy - s*.02}/></g>,
    "SUPPORT":      <g stroke={c} fill="rgba(79,195,247,.1)" strokeWidth={s*.033}><path d={`M${cx},${cy - s*.25} L${cx + s*.22},${cy + s*.15} L${cx - s*.22},${cy + s*.15} Z`}/><line x1={cx} y1={cy - s*.12} x2={cx} y2={cy + s*.04}/><circle cx={cx} cy={cy + s*.1} r={s*.03} fill={c}/></g>,
    "SQUAD LEADER": <g stroke={c} fill="none" strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.22} ${cx + s*.07},${cy - s*.07} ${cx + s*.23},${cy - s*.07} ${cx + s*.11},${cy + s*.04} ${cx + s*.16},${cy + s*.22} ${cx},${cy + s*.13} ${cx - s*.16},${cy + s*.22} ${cx - s*.11},${cy + s*.04} ${cx - s*.23},${cy - s*.07} ${cx - s*.07},${cy - s*.07}`}/></g>,
    "VETERAN":      <g strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.22} ${cx + s*.07},${cy - s*.07} ${cx + s*.23},${cy - s*.07} ${cx + s*.11},${cy + s*.04} ${cx + s*.16},${cy + s*.22} ${cx},${cy + s*.13} ${cx - s*.16},${cy + s*.22} ${cx - s*.11},${cy + s*.04} ${cx - s*.23},${cy - s*.07} ${cx - s*.07},${cy - s*.07}`} fill="rgba(79,195,247,.08)" stroke={c}/><circle cx={cx} cy={cy - s*.01} r={s*.06} fill={c} stroke="none"/></g>,
    "LEGEND":       <g strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.24} ${cx + s*.09},${cy - s*.07} ${cx + s*.26},${cy - s*.07} ${cx + s*.12},${cy + s*.04} ${cx + s*.18},${cy + s*.24} ${cx},${cy + s*.14} ${cx - s*.18},${cy + s*.24} ${cx - s*.12},${cy + s*.04} ${cx - s*.26},${cy - s*.07} ${cx - s*.09},${cy - s*.07}`} fill="rgba(200,160,0,.15)" stroke={gold}/><polygon points={`${cx},${cy - s*.12} ${cx + s*.04},${cy - s*.03} ${cx + s*.12},${cy - s*.03} ${cx + s*.06},${cy + s*.02} ${cx + s*.08},${cy + s*.11} ${cx},${cy + s*.06} ${cx - s*.08},${cy + s*.11} ${cx - s*.06},${cy + s*.02} ${cx - s*.12},${cy - s*.03} ${cx - s*.04},${cy - s*.03}`} fill={gold} stroke="none"/></g>,
  };
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
      <rect width={s} height={s} fill="#080a06" rx={s * .04}/>
      {icons[desig] || <text x={cx} y={cy + s*.07} textAnchor="middle" fontSize={s*.35} fill={c}>{desig[0]}</text>}
    </svg>
  );
}

function PublicProfilePage({ userId, prevPage, setPage }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const isMounted = useRef(true);

  const loadProfile = useCallback(async () => {
    if (!isMounted.current) return;
    if (!userId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.loadouts.getPublic(userId);
      if (!isMounted.current) return;
      if (!data) setNotFound(true);
      else setProfile(data);
    } catch { if (isMounted.current) setNotFound(true); }
    finally { if (isMounted.current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    isMounted.current = true;
    loadProfile();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current && !profile) loadProfile(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [loadProfile]);

  if (loading) return (
    <div style={{ background: "#080a06", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, letterSpacing: ".25em", color: "#2a3a10" }}>RETRIEVING OPERATIVE FILE…</div>
    </div>
  );
  if (notFound) return (
    <div style={{ background: "#080a06", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, letterSpacing: ".15em", color: "#c8ff00" }}>FILE NOT FOUND</div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#3a5010" }}>OPERATIVE HAS NOT ENABLED PUBLIC PROFILE</div>
      <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setPage(prevPage || "leaderboard")}>← BACK</button>
    </div>
  );

  const games       = profile.games_attended || 0;
  const customRank  = profile.custom_rank || null;
  const designation = profile.designation || null;
  const autoRank    = games === 0 ? "CIVILIAN" : games < 3 ? "PRIVATE" : games < 6 ? "RECRUIT" : games < 10 ? "OPERATIVE" : games < 20 ? "SENIOR OPERATIVE" : "FIELD COMMANDER";
  const rankTitle   = customRank || autoRank;
  const hasWeapons  = profile.primary_name || profile.secondary_name || profile.support_name;
  const hasGear     = ["helmet","vest","camo","eyepro","comms","boots","other_gear"].some(f => profile[f]);

  const SectionHeader = ({ label }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", textTransform: "uppercase" }}>▸ {label}</div>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,#1e2c0a,transparent)" }} />
    </div>
  );

  const GunCard = ({ title, name, fps, mags, upgrades }) => {
    if (!name) return null;
    return (
      <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "12px 14px", marginBottom: 8 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: ".2em", color: "#c8ff00", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
        {[["MODEL", name], ["FPS", fps], ["MAGS", mags], ["UPGRADES", upgrades]].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid #1a2808", fontSize: 12 }}>
            <span style={{ color: "#3a5010", minWidth: 72, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", fontFamily: "'Share Tech Mono',monospace", paddingTop: 1, flexShrink: 0 }}>{k}</span>
            <span style={{ color: "#b0c090", fontFamily: "'Share Tech Mono',monospace", fontSize: 11 }}>{v}</span>
          </div>
        ))}
      </div>
    );
  };

  const GearRow = ({ label, value }) => {
    if (!value) return null;
    return (
      <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid #1a2808", fontSize: 12 }}>
        <span style={{ color: "#3a5010", minWidth: 96, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", fontFamily: "'Share Tech Mono',monospace", paddingTop: 1, flexShrink: 0 }}>{label.toUpperCase()}</span>
        <span style={{ color: "#b0c090", fontFamily: "'Share Tech Mono',monospace", fontSize: 11 }}>{value}</span>
      </div>
    );
  };

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "40px 24px 36px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 24, height: 24,
            top: v==="top" ? 12 : "auto", bottom: v==="bottom" ? 12 : "auto",
            left: h==="left" ? 12 : "auto", right: h==="right" ? 12 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <button onClick={() => setPage(prevPage || "leaderboard")} style={{ background: "none", border: "1px solid #2a3a10", color: "#3a5010", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, letterSpacing: ".15em", padding: "4px 12px", cursor: "pointer", marginBottom: 20 }}>← BACK</button>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            {/* Avatar */}
            <div style={{ width: 88, height: 88, border: "2px solid #c8ff00", overflow: "hidden", background: "#0a0c08", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "#c8ff00", fontFamily: "'Barlow Condensed',sans-serif", flexShrink: 0, position: "relative" }}>
              {profile.profile_pic
                ? <img src={profile.profile_pic} alt="" onError={e => { e.target.style.display="none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.05) saturate(0.8)" }} />
                : (profile.callsign || "?")[0].toUpperCase()}
              {profile.can_marshal && (
                <div style={{ position: "absolute", bottom: 0, right: 0, background: "#c8ff00", color: "#000", fontSize: 7, fontWeight: 900, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".08em", padding: "2px 4px" }}>MSHL</div>
              )}
            </div>
            {/* Name block */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".25em", color: "#3a5010", marginBottom: 4 }}>OPERATIVE FILE // SWINDON AIRSOFT</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(22px,5vw,38px)", letterSpacing: ".1em", color: "#e8f0d8", textTransform: "uppercase", lineHeight: 1, marginBottom: 4 }}>
                {profile.callsign || "OPERATIVE"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {profile.vip_status === "active" && (
                  <span style={{ background: "rgba(200,160,0,.15)", border: "1px solid rgba(200,160,0,.4)", color: "#c8a000", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: ".15em", padding: "2px 8px" }}>★ VIP OPERATIVE</span>
                )}
                {profile.can_marshal && (
                  <span style={{ background: "rgba(200,255,0,.12)", border: "1px solid rgba(200,255,0,.4)", color: "#c8ff00", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: ".15em", padding: "2px 8px" }}>🎖 MARSHAL</span>
                )}
                {designation && (() => {
                  const DESIG_ICONS = { "GHOST":"👻","SNIPER":"🎯","MEDIC":"🩹","DEMOLITIONS":"💥","RECON":"🔭","HEAVY GUNNER":"🔫","SUPPORT":"🛡","SQUAD LEADER":"⚔️","VETERAN":"🎖","LEGEND":"🏆" };
                  return <span style={{ background: "rgba(79,195,247,.1)", border: "1px solid rgba(79,195,247,.4)", color: "#4fc3f7", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: ".15em", padding: "2px 8px" }}>{DESIG_ICONS[designation] || "◆"} {designation}</span>;
                })()}
                {profile.join_date && (
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".1em" }}>ENLISTED {new Date(profile.join_date).getFullYear()}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 80px" }}>

        {/* Field Stats grid */}
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Field Stats" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>

            {/* Deployments */}
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>DEPLOYMENTS</div>
              <svg width={48} height={48} viewBox="0 0 48 48">
                <rect width={48} height={48} fill="#080a06" rx={3}/>
                {/* Map with pin */}
                <path d="M10,14 L22,10 L26,14 L38,10 L38,34 L26,38 L22,34 L10,38 Z" fill="none" stroke="#1e3008" strokeWidth="1.5"/>
                <path d="M10,14 L22,10 L22,34 L10,38 Z" fill="rgba(200,255,0,.04)" stroke="#1e3008" strokeWidth="1"/>
                <path d="M26,14 L38,10 L38,34 L26,38 Z" fill="rgba(200,255,0,.04)" stroke="#1e3008" strokeWidth="1"/>
                <circle cx={24} cy={20} r={5} fill="none" stroke="#c8ff00" strokeWidth="1.8"/>
                <circle cx={24} cy={20} r={1.5} fill="#c8ff00"/>
                <path d="M24,25 Q18,30 18,35" fill="none" stroke="#c8ff00" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M24,25 Q30,30 30,35" fill="none" stroke="#c8ff00" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 36, color: "#c8ff00", lineHeight: 1 }}>{games}</div>
            </div>

            {/* Rank */}
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>RANK</div>
              <RankInsignia rank={rankTitle} size={48}/>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, color: "#c8ff00", lineHeight: 1.1, letterSpacing: ".06em" }}>{rankTitle}</div>
            </div>

            {/* Designation — only if set */}
            {designation && (
              <div style={{ background: "#0c1009", border: "1px solid rgba(79,195,247,.25)", padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#1a3a4a" }}>DESIGNATION</div>
                <DesignationInsignia desig={designation} size={48}/>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, color: "#4fc3f7", lineHeight: 1.1, letterSpacing: ".06em" }}>{designation}</div>
              </div>
            )}

            {/* VIP Status */}
            <div style={{ background: "#0c1009", border: `1px solid ${profile.vip_status === "active" ? "rgba(200,160,0,.35)" : "#1a2808"}`, padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>VIP STATUS</div>
              <svg width={48} height={48} viewBox="0 0 48 48">
                <rect width={48} height={48} fill="#080a06" rx={3}/>
                {profile.vip_status === "active" ? (
                  <g>
                    {/* Star */}
                    <polygon points="24,8 27.5,18 38,18 29.5,24.5 32.5,35 24,28.5 15.5,35 18.5,24.5 10,18 20.5,18" fill="rgba(200,160,0,.2)" stroke="#c8a000" strokeWidth="1.8" strokeLinejoin="round"/>
                    {/* Shine lines */}
                    <line x1="24" y1="4" x2="24" y2="7" stroke="#c8a000" strokeWidth="1.5"/>
                    <line x1="38" y1="14" x2="35.5" y2="16" stroke="#c8a000" strokeWidth="1.5"/>
                    <line x1="10" y1="14" x2="12.5" y2="16" stroke="#c8a000" strokeWidth="1.5"/>
                  </g>
                ) : (
                  <g>
                    {/* Empty star outline, dimmed */}
                    <polygon points="24,8 27.5,18 38,18 29.5,24.5 32.5,35 24,28.5 15.5,35 18.5,24.5 10,18 20.5,18" fill="none" stroke="#1e3008" strokeWidth="1.5" strokeLinejoin="round"/>
                    <line x1="16" y1="16" x2="32" y2="32" stroke="#1e3008" strokeWidth="1.5" strokeLinecap="round"/>
                  </g>
                )}
              </svg>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: profile.vip_status === "active" ? "#c8a000" : "#2a3a10", lineHeight: 1, letterSpacing: ".06em" }}>
                {profile.vip_status === "active" ? "ACTIVE" : profile.vip_status === "expired" ? "EXPIRED" : "STANDARD"}
              </div>
            </div>

            {/* Marshal */}
            <div style={{ background: "#0c1009", border: `1px solid ${profile.can_marshal ? "rgba(200,255,0,.25)" : "#1a2808"}`, padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>MARSHAL</div>
              <svg width={48} height={48} viewBox="0 0 48 48">
                <rect width={48} height={48} fill="#080a06" rx={3}/>
                {profile.can_marshal ? (
                  <g fill="none" stroke="#c8ff00" strokeWidth="1.8">
                    {/* Shield */}
                    <path d="M24,6 L36,11 L36,24 Q36,34 24,42 Q12,34 12,24 L12,11 Z" fill="rgba(200,255,0,.07)" stroke="#c8ff00" strokeWidth="1.8" strokeLinejoin="round"/>
                    {/* Tick inside */}
                    <polyline points="17,24 22,29 31,19" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2"/>
                  </g>
                ) : (
                  <g fill="none" stroke="#1e3008" strokeWidth="1.8">
                    <path d="M24,6 L36,11 L36,24 Q36,34 24,42 Q12,34 12,24 L12,11 Z" strokeLinejoin="round"/>
                    <line x1="19" y1="19" x2="29" y2="29" strokeLinecap="round"/>
                    <line x1="29" y1="19" x2="19" y2="29" strokeLinecap="round"/>
                  </g>
                )}
              </svg>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: profile.can_marshal ? "#c8ff00" : "#2a3a10", lineHeight: 1, letterSpacing: ".06em" }}>
                {profile.can_marshal ? "QUALIFIED" : "NOT QUALIFIED"}
              </div>
            </div>

          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Operative Brief" />
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 16px" }}>
              <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#6a8a40", lineHeight: 1.7, margin: 0 }}>{profile.bio}</p>
            </div>
          </div>
        )}

        {/* Weapons */}
        {hasWeapons && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Weapons Loadout" />
            <GunCard title="PRIMARY WEAPON"    name={profile.primary_name}   fps={profile.primary_fps}   mags={profile.primary_mags}   upgrades={profile.primary_upgrades} />
            <GunCard title="SECONDARY WEAPON"  name={profile.secondary_name} fps={profile.secondary_fps} mags={profile.secondary_mags} upgrades={profile.secondary_upgrades} />
            <GunCard title="SUPPORT / SPECIAL" name={profile.support_name}   fps={profile.support_fps}   mags={profile.support_mags}   upgrades={profile.support_upgrades} />
          </div>
        )}

        {/* Gear */}
        {hasGear && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Kit & Gear" />
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "4px 14px" }}>
              <GearRow label="Helmet"     value={profile.helmet} />
              <GearRow label="Vest / Rig" value={profile.vest} />
              <GearRow label="Camo"       value={profile.camo} />
              <GearRow label="Eye Pro"    value={profile.eyepro} />
              <GearRow label="Comms"      value={profile.comms} />
              <GearRow label="Boots"      value={profile.boots} />
              <GearRow label="Other Gear" value={profile.other_gear} />
            </div>
          </div>
        )}

        {/* Notes */}
        {profile.notes && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Field Notes" />
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 16px" }}>
              <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#6a8a40", lineHeight: 1.7, margin: 0 }}>{profile.notes}</p>
            </div>
          </div>
        )}

        {!hasWeapons && !hasGear && !profile.bio && (
          <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: 40, textAlign: "center" }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".2em", color: "#2a3a10" }}>LOADOUT DATA NOT YET FILED</div>
          </div>
        )}
      </div>
    </div>
  );
}

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
        name:     edit.name,
        callsign: edit.callsign,
        phone:    edit.phone,
        address:  composeAddress(edit),
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
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: ".06em", marginBottom: 4,
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

          <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "var(--muted)", textTransform: "uppercase", fontFamily: "'Barlow Condensed', sans-serif" }}>Delivery Address</div>
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
          {cu.waiverPending && <div className="alert alert-gold">⏳ Changes submitted — awaiting admin approval</div>}
          {cu.waiverData && (() => {
            const allWaivers = [cu.waiverData, ...(cu.extraWaivers || [])];
            return (
              <div style={{ marginTop: 12 }}>
                {/* Player tabs if multiple waivers */}
                {allWaivers.length > 1 && (
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:12 }}>
                    {allWaivers.map((w, i) => (
                      <button key={i} style={{
                        padding:"4px 12px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700,
                        fontSize:11, letterSpacing:".1em", textTransform:"uppercase",
                        background:"var(--accent)", color:"#000", border:"none", borderRadius:2, cursor:"default"
                      }}>
                        {w.name || `Player ${i+1}`}{i === 0 ? " ★" : ""}
                      </button>
                    ))}
                  </div>
                )}
                {allWaivers.map((w, i) => (
                  <div key={i} style={{ marginBottom: i < allWaivers.length - 1 ? 20 : 0, paddingBottom: i < allWaivers.length - 1 ? 20 : 0, borderBottom: i < allWaivers.length - 1 ? "1px solid #2a2a2a" : "none" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      {allWaivers.length > 1 && (
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase" }}>
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
                        }} style={{ background:"none", border:"1px solid var(--red)", color:"var(--red)", fontSize:11, padding:"2px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em" }}>
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
          {waiverModal && <WaiverModal cu={cu} updateUser={updateUser} onClose={() => setWaiverModal(false)} showToast={showToast} editMode={waiverModal === "edit"} existing={cu.waiverData} />}
        </div>
      )}

      {tab === "bookings" && (
        <div>
          {myBookings.length === 0 ? <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No bookings yet.</div> : (
            myBookings.map(b => {
              const printTicket = () => {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(b.id)}&bgcolor=0d0d0d&color=c8ff00&qzone=1`;
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FIELD PASS — ${b.eventTitle || 'EVENT'}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @media print {
    .noprint { display:none !important; }
    body { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  }
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=Share+Tech+Mono&display=swap');
  body {
    font-family:'Barlow Condensed',Arial,sans-serif;
    background: #0a0a0a;
    color:#fff;
    min-height:100vh;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    padding:24px;
  }
  .ticket {
    width:520px;
    background:#111;
    border:1px solid #2a2a2a;
    position:relative;
    overflow:hidden;
  }
  /* Camo texture overlay */
  .ticket::before {
    content:'';
    position:absolute;
    inset:0;
    background-image:
      radial-gradient(ellipse at 20% 30%, rgba(30,50,10,.25) 0%, transparent 50%),
      radial-gradient(ellipse at 70% 70%, rgba(20,40,5,.2) 0%, transparent 40%),
      radial-gradient(ellipse at 50% 50%, rgba(10,20,0,.15) 0%, transparent 60%);
    pointer-events:none;
    z-index:0;
  }
  .ticket > * { position:relative; z-index:1; }

  /* Corner brackets */
  .corner { position:absolute; width:20px; height:20px; z-index:2; }
  .corner.tl { top:8px; left:8px; border-top:2px solid #c8ff00; border-left:2px solid #c8ff00; }
  .corner.tr { top:8px; right:8px; border-top:2px solid #c8ff00; border-right:2px solid #c8ff00; }
  .corner.bl { bottom:8px; left:8px; border-bottom:2px solid #c8ff00; border-left:2px solid #c8ff00; }
  .corner.br { bottom:8px; right:8px; border-bottom:2px solid #c8ff00; border-right:2px solid #c8ff00; }

  .header {
    background: linear-gradient(135deg, #0d1400 0%, #111 60%, #0a1000 100%);
    padding:18px 24px 14px;
    border-bottom:1px solid #1e1e1e;
  }
  .header-top {
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:10px;
  }
  .org {
    font-size:10px;
    letter-spacing:.25em;
    color:#c8ff00;
    font-weight:800;
    text-transform:uppercase;
  }
  .classification {
    font-size:9px;
    letter-spacing:.2em;
    color:#555;
    text-transform:uppercase;
    border:1px solid #333;
    padding:2px 8px;
  }
  .event-name {
    font-size:28px;
    font-weight:900;
    text-transform:uppercase;
    letter-spacing:.06em;
    line-height:1;
    color:#fff;
    margin-bottom:4px;
  }
  .event-date {
    font-size:13px;
    color:#888;
    letter-spacing:.08em;
    font-family:'Share Tech Mono',monospace;
  }

  /* Tear line */
  .tear {
    display:flex;
    align-items:center;
    background:#0d0d0d;
  }
  .notch { width:18px; height:36px; background:#0a0a0a; flex-shrink:0; }
  .notch.l { border-radius:0 18px 18px 0; margin-left:-1px; }
  .notch.r { border-radius:18px 0 0 18px; margin-right:-1px; }
  .tear-line { flex:1; border-top:2px dashed #222; }

  .body {
    padding:16px 24px 20px;
    display:flex;
    gap:20px;
    align-items:stretch;
  }
  .fields {
    flex:1;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:12px 20px;
    align-content:start;
  }
  .field .lbl {
    font-size:8px;
    letter-spacing:.22em;
    color:#555;
    font-weight:800;
    text-transform:uppercase;
    margin-bottom:3px;
  }
  .field .val {
    font-size:17px;
    font-weight:800;
    letter-spacing:.04em;
    color:#e0e0e0;
    line-height:1;
  }
  .field.wide { grid-column:1/-1; }
  .ref {
    grid-column:1/-1;
    font-family:'Share Tech Mono',monospace;
    font-size:10px;
    color:#444;
    letter-spacing:.1em;
    padding-top:10px;
    border-top:1px solid #1a1a1a;
    margin-top:4px;
  }
  .status-badge {
    display:inline-block;
    padding:4px 12px;
    font-size:10px;
    font-weight:900;
    letter-spacing:.18em;
    text-transform:uppercase;
  }

  /* QR side */
  .qr-side {
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:8px;
    padding-left:16px;
    border-left:1px dashed #222;
    flex-shrink:0;
  }
  .qr-wrap {
    background:#0d0d0d;
    border:1px solid #2a2a2a;
    padding:8px;
  }
  .qr-label {
    font-size:8px;
    letter-spacing:.18em;
    color:#555;
    text-transform:uppercase;
    text-align:center;
    font-weight:700;
  }

  /* Barcode-style bottom strip */
  .footer {
    background:#0d0d0d;
    border-top:1px solid #1a1a1a;
    padding:8px 24px;
    display:flex;
    justify-content:space-between;
    align-items:center;
  }
  .footer-text {
    font-size:9px;
    letter-spacing:.15em;
    color:#444;
    text-transform:uppercase;
  }
  .bars { display:flex; gap:2px; align-items:center; }
  .bar { background:#333; width:2px; border-radius:1px; }

  .print-btn {
    margin-top:20px;
    padding:13px 32px;
    background:#c8ff00;
    color:#000;
    font-family:'Barlow Condensed',sans-serif;
    font-weight:900;
    font-size:14px;
    letter-spacing:.15em;
    text-transform:uppercase;
    border:none;
    cursor:pointer;
    width:520px;
  }
</style></head><body>
<div class="ticket">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>

  <div class="header">
    <div class="header-top">
      <div class="org">⬡ Swindon Airsoft</div>
      <div class="classification">FIELD PASS // ${new Date().getFullYear()}</div>
    </div>
    <div class="event-name">${b.eventTitle || 'Operation'}</div>
    <div class="event-date">${b.eventDate ? b.eventDate.slice(0,10).split('-').reverse().join('/') : '—'}</div>
  </div>

  <div class="tear">
    <div class="notch l"></div>
    <div class="tear-line"></div>
    <div class="notch r"></div>
  </div>

  <div class="body">
    <div class="fields">
      <div class="field">
        <div class="lbl">Operator</div>
        <div class="val">${(b.eventTitle || '').slice(0,12) || '—'}</div>
      </div>
      <div class="field">
        <div class="lbl">Clearance</div>
        <div class="val" style="color:${b.checkedIn ? '#c8ff00' : '#4fc3f7'}">${b.checkedIn ? 'CLEARED' : 'PENDING'}</div>
      </div>
      <div class="field">
        <div class="lbl">Kit Type</div>
        <div class="val">${b.type === 'walkOn' ? 'Walk-On' : 'Rental'}</div>
      </div>
      <div class="field">
        <div class="lbl">Units</div>
        <div class="val">${b.qty}</div>
      </div>
      <div class="field">
        <div class="lbl">Levy</div>
        <div class="val">${b.total > 0 ? '£' + b.total.toFixed(2) : 'N/A'}</div>
      </div>
      <div class="field">
        <div class="lbl">Status</div>
        <div class="val" style="font-size:13px;color:${b.checkedIn ? '#c8ff00' : '#4fc3f7'};border:1px solid ${b.checkedIn ? '#c8ff00' : '#4fc3f7'};padding:2px 8px;display:inline-block">${b.checkedIn ? '✓ CHECKED IN' : '⏳ BOOKED'}</div>
      </div>
      <div class="ref">MISSION ID: ${b.id.toUpperCase()}</div>
    </div>

    <div class="qr-side">
      <img class="qr-wrap" src="${qrUrl}" width="140" height="140" alt="QR" />
      <div class="qr-label">Scan on arrival</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-text">Valid for date shown only &bull; Non-transferable</div>
    <div class="bars">
      ${Array.from({length:28}, (_,i) => `<div class="bar" style="height:${8+Math.sin(i*1.3)*6}px"></div>`).join('')}
    </div>
  </div>
</div>
<button class="print-btn noprint" onclick="window.print()">🖨 PRINT / SAVE FIELD PASS</button>
</body></html>`;
                const printWin = window.open('', '_blank');
                printWin.document.write(html);
                printWin.document.close();
              };

              return (
                <div key={b.id} style={{
                  marginBottom: 20,
                  position: "relative",
                  background: `radial-gradient(ellipse at 12% 20%, rgba(50,80,15,.6) 0%, transparent 42%),radial-gradient(ellipse at 82% 75%, rgba(35,60,8,.5) 0%, transparent 38%),radial-gradient(ellipse at 55% 48%, rgba(25,45,5,.35) 0%, transparent 32%),radial-gradient(ellipse at 88% 12%, rgba(55,85,12,.45) 0%, transparent 28%),radial-gradient(ellipse at 28% 82%, rgba(40,65,10,.4) 0%, transparent 38%),radial-gradient(ellipse at 65% 30%, rgba(20,38,4,.3) 0%, transparent 25%),#0b1007`,
                  border: "1px solid #2a3a10",
                  overflow: "hidden",
                }}>
                  {/* Scanlines */}
                  <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.07) 2px,rgba(0,0,0,.07) 3px)" }} />
                  {/* Noise texture dots */}
                  <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1, opacity:.04,
                    backgroundImage:"radial-gradient(circle, #c8ff00 1px, transparent 1px)",
                    backgroundSize:"18px 18px"
                  }} />

                  {/* Corner brackets */}
                  {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                    <div key={v+h} style={{
                      position:"absolute", width:18, height:18, zIndex:3,
                      top: v==="top" ? 7 : "auto", bottom: v==="bottom" ? 7 : "auto",
                      left: h==="left" ? 7 : "auto", right: h==="right" ? 7 : "auto",
                      borderTop: v==="top" ? "2px solid #c8ff00" : "none",
                      borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
                      borderLeft: h==="left" ? "2px solid #c8ff00" : "none",
                      borderRight: h==="right" ? "2px solid #c8ff00" : "none",
                    }} />
                  ))}

                  {/* Header */}
                  <div style={{ position:"relative", zIndex:2, background:"linear-gradient(135deg,rgba(8,18,2,.97) 0%,rgba(14,26,4,.92) 40%,rgba(6,14,1,.97) 100%)", borderBottom:"1px solid #283810", padding:"14px 22px 12px" }}>
                    <div style={{ position:"absolute", right:20, top:10, display:"flex", gap:3, opacity:.07 }}>
                      {["⬡","⬡","⬡","⬡","⬡","⬡"].map((h,i) => <span key={i} style={{ fontSize:22, color:"#c8ff00" }}>{h}</span>)}
                    </div>
                    <div style={{ fontSize:9, letterSpacing:".2em", color:"#7aaa30", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:7, display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ color:"#c8ff00" }}>⬡ SWINDON AIRSOFT</span>
                      <span style={{ color:"#3a5010" }}>◆</span>
                      <span>FIELD PASS // {new Date().getFullYear()}</span>
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, textTransform:"uppercase", letterSpacing:".06em", color:"#e8ffb0", lineHeight:1, marginBottom:5, textShadow:"0 0 30px rgba(200,255,0,.12)" }}>
                      {b.eventTitle}
                    </div>
                    <div style={{ fontSize:11, color:"#4a6820", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>
                      📅 {fmtDate(b.eventDate)}
                    </div>
                  </div>

                  {/* Tear line */}
                  <div style={{ position:"relative", zIndex:2, display:"flex", alignItems:"center", height:24 }}>
                    <div style={{ width:14, height:28, background:"var(--bg,#0a0a0a)", borderRadius:"0 14px 14px 0", marginLeft:-1, flexShrink:0, zIndex:3 }} />
                    <div style={{ flex:1, borderTop:"1px dashed #283810" }} />
                    <div style={{ width:14, height:28, background:"var(--bg,#0a0a0a)", borderRadius:"14px 0 0 14px", marginRight:-1, flexShrink:0, zIndex:3 }} />
                  </div>

                  {/* Body */}
                  <div style={{ position:"relative", zIndex:2, padding:"14px 22px 18px", display:"flex", gap:16, alignItems:"center" }}>
                    <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:"14px 16px" }}>
                      {[
                        ["KIT TYPE", b.type === "walkOn" ? "Walk-On" : "Rental"],
                        ["UNITS", b.qty],
                        ["LEVY", b.total > 0 ? `£${b.total.toFixed(2)}` : "N/A"],
                        ["REF", b.id.slice(0,8).toUpperCase()],
                        ["STATUS", b.checkedIn ? "CLEARED" : "PENDING"],
                      ].map(([lbl, val]) => (
                        <div key={lbl}>
                          <div style={{ fontSize:8, letterSpacing:".22em", color:"#4a6820", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:3 }}>{lbl}</div>
                          <div style={{ fontSize:17, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".04em",
                            color: lbl==="STATUS" ? (b.checkedIn ? "#c8ff00" : "#4fc3f7") : "#c8e878",
                            textShadow: lbl==="STATUS" ? `0 0 14px ${b.checkedIn ? "rgba(200,255,0,.25)" : "rgba(79,195,247,.25)"}` : "none",
                          }}>{val}</div>
                        </div>
                      ))}
                      <div style={{ display:"flex", alignItems:"flex-end" }}>
                        <button onClick={printTicket} style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.25)", color:"#c8ff00", fontSize:10, fontWeight:800, padding:"5px 14px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".12em", textTransform:"uppercase" }}>
                          🖨 PRINT
                        </button>
                      </div>
                    </div>

                    <div style={{ width:1, alignSelf:"stretch", borderLeft:"1px dashed #283810", flexShrink:0 }} />

                    <div style={{ textAlign:"center", flexShrink:0 }}>
                      <div style={{ background:"#07100304", border:"2px solid #2a3a10", padding:8, display:"inline-block", boxShadow:"0 0 20px rgba(200,255,0,.06), inset 0 0 10px rgba(0,0,0,.5)" }}>
                        <QRCode value={b.id} size={92} />
                      </div>
                      <div style={{ fontSize:8, color:"#3a5818", marginTop:5, letterSpacing:".18em", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase" }}>Scan on arrival</div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ position:"relative", zIndex:2, background:"rgba(4,8,1,.85)", borderTop:"1px solid #1a2808", padding:"6px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ fontSize:8, letterSpacing:".15em", color:"#283810", fontFamily:"'Share Tech Mono',monospace" }}>
                      MISSION ID: {b.id.toUpperCase()}
                    </div>
                    <div style={{ display:"flex", gap:"2px", alignItems:"center" }}>
                      {Array.from({length:32}, (_,i) => (
                        <div key={i} style={{ background: i % 7 === 0 ? "#3a5010" : "#1e2c08", width: i % 3 === 0 ? 3 : 2, height: 4 + Math.abs(Math.sin(i*1.37)*11), borderRadius:1 }} />
                      ))}
                    </div>
                  </div>
                  {/* Cancel button */}
                  {!b.checkedIn && (() => {
                    const hoursUntil = (new Date(b.eventDate) - new Date()) / 36e5;
                    const canCancel = hoursUntil > 0;
                    if (!canCancel) return null;
                    const within24 = hoursUntil < 24;
                    const within48 = hoursUntil < 48;
                    return (
                      <div style={{ padding:"8px 22px 10px", borderTop:"1px solid #1a2808", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                        <div style={{ fontSize:10, color: within24 ? "var(--red)" : "#5a7a30", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".08em" }}>
                          {within24
                            ? "🚫 Within 24h of event — cancellation not permitted"
                            : within48
                            ? "⚠ Within 48h — refund as credits only" + (b.type === "rental" ? " · 10% rental fee applies" : "")
                            : b.type === "rental" ? "Rental — 10% fee applies on cancellation" : "Full refund available"}
                        </div>
                        {!within24 && (
                          <button onClick={() => setCancelModal(b)} style={{ background:"transparent", border:"1px solid #6b2222", color:"#ef4444", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".15em", padding:"4px 14px", cursor:"pointer", textTransform:"uppercase" }}>
                            ✕ CANCEL BOOKING
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>
      )}

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
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:".12em", color:"#ef4444", textTransform:"uppercase", marginBottom:6 }}>⚠ CANCEL BOOKING</div>
              <div style={{ fontWeight:700, fontSize:15, color:"var(--text)", marginBottom:4 }}>{b.eventTitle}</div>
              <div style={{ fontSize:12, color:"var(--muted)", marginBottom:16 }}>{fmtDate(b.eventDate)} · {b.type === "rental" ? "Rental" : "Walk-On"} × {b.qty} · Paid £{originalTotal.toFixed(2)}</div>

              {/* Policy tiers */}
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
                {policyTiers.map(tier => (
                  <div key={tier.label} style={{ background: tier.condition ? tier.bg : "transparent", border:`1px solid ${tier.condition ? tier.border : "rgba(255,255,255,.06)"}`, padding:"10px 12px", display:"flex", alignItems:"flex-start", gap:10 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background: tier.condition ? tier.color : "#333", flexShrink:0, marginTop:4 }} />
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color: tier.condition ? tier.color : "#444", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase", marginBottom:2 }}>{tier.label}</div>
                      <div style={{ fontSize:11, color: tier.condition ? "var(--text)" : "#444" }}>{tier.desc}</div>
                    </div>
                    {tier.condition && <div style={{ marginLeft:"auto", fontSize:10, fontWeight:800, color:tier.color, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", flexShrink:0 }}>← YOU ARE HERE</div>}
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
                  <button onClick={doCancel} disabled={cancelling} style={{ background:"#6b2222", border:"1px solid #ef4444", color:"#fca5a5", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".1em", padding:"8px 20px", cursor:cancelling?"wait":"pointer", textTransform:"uppercase" }}>
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
                <div style={{ fontWeight: 800, fontSize: 14, color: "var(--gold)", fontFamily: "'Barlow Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".06em" }}>Happy Birthday from Swindon Airsoft! 🎉</div>
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

          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: ".05em" }}>VIP Membership</div>
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
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--gold)", marginBottom: 6 }}>
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
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--red)", marginBottom: 6 }}>✗ VIP Membership Expired</div>
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
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:6,
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
function ReportCheatTab({ cu, showToast }) {
  const BLANK = { reportedName: "", videoUrl: "", description: "" };
  const SS_KEY = "report_cheat_form";

  // Restore from sessionStorage on mount — form survives tab/page switches
  const [form, setForm] = useState(() => {
    try { const s = sessionStorage.getItem(SS_KEY); return s ? JSON.parse(s) : BLANK; } catch { return BLANK; }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  // Persist form to sessionStorage on every change
  useEffect(() => {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify(form)); } catch {}
  }, [form]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.videoUrl.trim()) { showToast("Please include a video link as evidence", "red"); return; }
    if (!form.description.trim() || form.description.trim().length < 20) { showToast("Please describe what happened in more detail (at least 20 characters)", "red"); return; }
    // Basic URL validation
    try { new URL(form.videoUrl.trim()); } catch { showToast("Please enter a valid video URL (e.g. YouTube link)", "red"); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("cheat_reports").insert({
        reporter_id:   cu.id,
        reporter_name: cu.name,
        reported_name: form.reportedName.trim() || null,
        video_url:     form.videoUrl.trim(),
        description:   form.description.trim(),
        status:        "pending",
      });
      if (error) throw error;

      // Notify admin by email
      try {
        const adminEmail = await api.settings.get("contact_email");
        if (adminEmail) {
          await sendEmail({
            toEmail:     adminEmail,
            toName:      "Admin",
            subject:     "🚩 New Cheat Report Submitted",
            htmlContent: `
              <div style="font-family:sans-serif;max-width:600px;background:#111;color:#ddd;padding:24px;border-radius:8px">
                <h2 style="color:#ef5350;font-family:'Barlow Condensed',sans-serif;letter-spacing:.1em;text-transform:uppercase;margin-top:0">New Cheat Report</h2>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px;width:140px">REPORTED BY</td><td style="padding:8px;background:#0d0d0d;color:#fff">${cu.name}</td></tr>
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">ACCUSED PLAYER</td><td style="padding:8px;background:#0d0d0d;color:#ef5350">${form.reportedName.trim() || "Not specified"}</td></tr>
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">VIDEO EVIDENCE</td><td style="padding:8px;background:#0d0d0d"><a href="${form.videoUrl.trim()}" style="color:#c8ff00">${form.videoUrl.trim()}</a></td></tr>
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">DESCRIPTION</td><td style="padding:8px;background:#0d0d0d;color:#ccc;white-space:pre-wrap">${form.description.trim()}</td></tr>
                </table>
                <p style="margin-top:20px;font-size:12px;color:#666">Review this report in the admin panel under <strong style="color:#aaa">Cheat Reports</strong>. The reporter has not been told anything about the outcome.</p>
              </div>
            `,
          });
        } else {
          console.warn("Cheat report email: no contact_email configured in site settings");
        }
      } catch (emailErr) {
        console.error("Cheat report email failed:", emailErr?.message || emailErr);
        // Report is still submitted — email failure is non-fatal
      }

      try { sessionStorage.removeItem(SS_KEY); } catch {}
      setSubmitted(true);
      setForm(BLANK);
    } catch (e) {
      showToast("Submission failed: " + e.message, "red");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return (
    <div className="card" style={{ textAlign:"center", padding:"48px 24px" }}>
      <div style={{ fontSize:44, marginBottom:16 }}>🔒</div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".12em", color:"var(--accent)", marginBottom:10 }}>REPORT RECEIVED</div>
      <div style={{ fontSize:13, color:"var(--muted)", lineHeight:1.8, maxWidth:420, margin:"0 auto 24px" }}>
        Your report has been submitted and will be reviewed by our admin team. All reports are strictly confidential — you will not receive an update on the outcome.
      </div>
      <button className="btn btn-ghost" onClick={() => setSubmitted(false)}>Submit another report</button>
    </div>
  );

  return (
    <div className="card" style={{ maxWidth:640 }}>
      <div style={{ borderLeft:"3px solid #ef5350", paddingLeft:14, marginBottom:20 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".1em", color:"#ef5350" }}>REPORT A PLAYER FOR CHEATING</div>
        <div style={{ fontSize:12, color:"var(--muted)", marginTop:4, lineHeight:1.6 }}>
          Reports are strictly confidential. <strong>Video evidence is mandatory.</strong> False reports may result in action against your own account.
        </div>
      </div>

      <div className="form-group">
        <label>Player Name Being Reported <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional — helps us identify them)</span></label>
        <input value={form.reportedName} onChange={e => setF("reportedName", e.target.value)} placeholder="e.g. John Smith, callsign Viper…" />
      </div>

      <div className="form-group">
        <label>Video Evidence Link <span style={{ color:"#ef5350" }}>*</span></label>
        <input value={form.videoUrl} onChange={e => setF("videoUrl", e.target.value)} placeholder="https://youtube.com/… or Google Drive link…" type="url" />
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>
          Must clearly show deliberate hit-not-calling or cheating. Reports without clear video evidence will be dismissed.
        </div>
      </div>

      <div className="form-group">
        <label>What Happened? <span style={{ color:"#ef5350" }}>*</span></label>
        <textarea
          value={form.description}
          onChange={e => setF("description", e.target.value)}
          rows={6}
          placeholder="Describe exactly what occurred — the game, location on field, what the player did, and why you believe it was deliberate cheating…"
          style={{ resize:"vertical" }}
        />
        <div style={{ fontSize:11, color: form.description.trim().length < 20 && form.description.length > 0 ? "var(--red)" : "var(--muted)", marginTop:4 }}>
          {form.description.trim().length} characters {form.description.trim().length < 20 ? "(minimum 20)" : "✓"}
        </div>
      </div>

      <div style={{ background:"rgba(200,160,0,.08)", border:"1px solid rgba(200,160,0,.2)", padding:"12px 14px", marginBottom:18, borderRadius:4, fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
        ⚠️ <strong style={{ color:"var(--gold)" }}>Confidentiality notice:</strong> Your identity as the reporter is known to admins but will never be shared with the reported player or anyone else. You will not receive confirmation of any action taken.
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={submitting}>
        {submitting ? "Submitting…" : "🚩 Submit Report"}
      </button>
    </div>
  );
}

// ── AdminDiscountCodes ─────────────────────────────────────────

// ═══════════════════════════════════════════════════════


// ── Error Boundary ────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error("App error caught:", error, info);
    this.setState({ errorInfo: info });
  }
  render() {
    if (this.state.hasError) return (
      <div style={{ background:"#080a06", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ maxWidth:480, width:"100%", background:"#0c1009", border:"1px solid #3a0a0a", padding:"32px 28px", position:"relative" }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position:"absolute", width:16, height:16, top:v==="top"?8:"auto", bottom:v==="bottom"?8:"auto", left:h==="left"?8:"auto", right:h==="right"?8:"auto", borderTop:v==="top"?"1px solid #ef4444":"none", borderBottom:v==="bottom"?"1px solid #ef4444":"none", borderLeft:h==="left"?"1px solid #ef4444":"none", borderRight:h==="right"?"1px solid #ef4444":"none" }} />
          ))}
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#ef4444", marginBottom:12 }}>⚠ SYSTEM FAULT DETECTED</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".1em", color:"#e8f0d8", marginBottom:8 }}>SOMETHING WENT WRONG</div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#5a7a30", lineHeight:1.7, marginBottom:20 }}>An unexpected error has occurred. Your session data is safe.</div>
          {this.state.error && (
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a3a3a", background:"#080a06", border:"1px solid #1a1a1a", padding:"8px 10px", marginBottom:20, wordBreak:"break-all", lineHeight:1.6 }}>
              {this.state.error.message}
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              style={{ background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", padding:"10px 24px", cursor:"pointer", width:"100%" }}>
              ↩ TRY AGAIN
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ background:"transparent", border:"1px solid #1a2808", color:"#3a5010", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", padding:"10px 24px", cursor:"pointer", width:"100%" }}>
              ↺ FULL RELOAD
            </button>
          </div>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ── Root App ──────────────────────────────────────────────────

// ── Geo-block: allowed country codes ──────────────────────
// UK, Ireland + all 27 EU member states (ISO 3166-1 alpha-2)
const ALLOWED_COUNTRY_CODES = new Set([
  "GB","IE",                                           // UK + Ireland
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR",  // EU
  "DE","GR","HU","IE","IT","LV","LT","LU","MT","NL",
  "PL","PT","RO","SK","SI","ES","SE",
]);

function AppInner() {
  const { data, loading, loadError, save, updateUser, updateEvent, refresh } = useData();
  // ── Offline detection ─────────────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online",  goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

  // ── Hash routing ──────────────────────────────────────────
  // Format: #page  |  #admin/section  |  #admin/section/tab
  //         #profile/tab  |  #events/eventId
  const PUBLIC_PAGES = ["home","events","shop","gallery","qa","vip","leaderboard","profile","about","staff","contact","terms","player"];
  const getInitialPage = () => {
    const parts = window.location.hash.replace("#","").split("/");
    const p = parts[0];
    if (p === "admin") return "admin";
    return PUBLIC_PAGES.includes(p) ? p : "home";
  };
  const [page, setPageState] = useState(getInitialPage);
  const [publicProfileId, setPublicProfileId] = useState(() => {
    const parts = window.location.hash.replace("#","").split("/");
    return parts[0] === "player" ? (parts[1] || null) : null;
  });
  const [prevPage, setPrevPage] = useState("leaderboard");

  // setPage writes the hash AND updates state
  const setPage = (p) => {
    setPageState(p);
    // Preserve admin sub-hash when returning; otherwise just set the page
    if (p !== "admin") window.location.hash = p;
    else {
      const cur = window.location.hash.replace("#","").split("/");
      const sec = cur[0] === "admin" && cur[1] ? cur[1] : "dashboard";
      const tab = cur[2] || "";
      window.location.hash = "admin/" + sec + (tab ? "/" + tab : "");
    }
  };

  const [cu, setCu] = useState(null);          // current user profile
  const [authLoading, setAuthLoading] = useState(true);
  const [authModal, setAuthModal] = useState(null);
  const [toast, showToast] = useToast();

  // ── Page visit tracking ──────────────────────────────────
  useEffect(() => {
    // Only track public pages, not admin
    if (page === "admin") return;
    // Stable session ID for this browser tab
    let sid = sessionStorage.getItem("sa_sid");
    if (!sid) { sid = Math.random().toString(36).slice(2); sessionStorage.setItem("sa_sid", sid); }
    api.visits.track({
      page,
      userId:    cu?.id   || null,
      userName:  cu?.name || null,
      sessionId: sid,
    });
  }, [page, cu?.id]);
  useEffect(() => {
    const onHash = () => {
      const parts = window.location.hash.replace("#","").split("/");
      const p = parts[0];
      if (p === "admin") { setPageState("admin"); return; }
      if (p === "player") { setPublicProfileId(parts[1] || null); setPageState("player"); return; }
      if (PUBLIC_PAGES.includes(p)) setPageState(p);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // Shop state — lifted to App level so cart persists between shop & product page
  const [shopCart, setShopCart] = useState([]);
  const [shopCartOpen, setShopCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  // Reset product view when navigating away from shop
  useEffect(() => { if (page !== "shop") setSelectedProduct(null); }, [page]);
  // Track recently viewed products (max 4, no duplicates, most recent first)
  const trackRecentlyViewed = useCallback((item) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(p => p.id !== item.id);
      return [item, ...filtered].slice(0, 4);
    });
  }, []);

  // Auth — runs in background, never blocks site from rendering
  useEffect(() => {
    const timeout = setTimeout(() => setAuthLoading(false), 3000);

    const loadSession = async () => {
      try {
        // Try getSession first — Supabase will auto-refresh if the access token is expired
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          clearTimeout(timeout);
          try {
            const profile = await api.profiles.getById(session.user.id);
            setCu(normaliseProfile(profile));
          } catch { /* profile fetch failed — session is still valid, user stays logged in */ }
          setAuthLoading(false);
          return;
        }

        // getSession returned null — could be a noopLock issue or the access token
        // was cleared. Try using the refresh_token from localStorage to get a new session.
        const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (storageKey) {
          try {
            const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
            // Try refresh_token first (most reliable — gets a brand new access token)
            if (raw?.refresh_token) {
              const { data: refreshed } = await supabase.auth.refreshSession({ refresh_token: raw.refresh_token });
              if (refreshed?.session?.user) {
                const profile = await api.profiles.getById(refreshed.session.user.id).catch(() => null);
                if (profile) setCu(normaliseProfile(profile));
                clearTimeout(timeout);
                setAuthLoading(false);
                return;
              }
            }
            // Fall back to setSession with stored tokens
            if (raw?.access_token) {
              const { data: restored } = await supabase.auth.setSession({
                access_token: raw.access_token,
                refresh_token: raw.refresh_token,
              });
              if (restored?.session?.user) {
                const profile = await api.profiles.getById(restored.session.user.id).catch(() => null);
                if (profile) setCu(normaliseProfile(profile));
                clearTimeout(timeout);
                setAuthLoading(false);
                return;
              }
            }
          } catch { /* localStorage entry malformed or tokens truly expired */ }
        }
      } catch { /* getSession threw — network error, stay with current state */ }

      clearTimeout(timeout);
      setAuthLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;

      // TOKEN_REFRESHED — JWT silently renewed, nothing to do.
      if (event === "TOKEN_REFRESHED") return;

      // SIGNED_OUT fired by Supabase's own refresh logic (e.g. tab sleep, network blip).
      // We do NOT log the user out here — only the Logout button should do that.
      // Instead, try to recover the session from localStorage so the user stays in.
      if (event === "SIGNED_OUT") {
        try {
          const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
          if (storageKey) {
            const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (raw?.refresh_token) {
              const { data: refreshed } = await supabase.auth.refreshSession({ refresh_token: raw.refresh_token });
              if (refreshed?.session?.user) {
                // Session recovered — keep the user logged in silently
                return;
              }
            }
          }
        } catch { /* recovery failed — fall through, but still don't force logout */ }
        // Only truly log out if we genuinely have no session at all
        const { data: { session: currentSession } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (!currentSession) setCu(null);
        return;
      }

      if (session?.user) {
        try {
          const profile = await api.profiles.getById(session.user.id);
          if (profile) {
            setCu(normaliseProfile(profile));
          } else {
            // Profile may not exist yet (new signup before confirmation) — try creating it
            try {
              const meta = session.user.user_metadata || {};
              await supabase.from('profiles').insert({
                id: session.user.id, name: meta.name || session.user.email?.split('@')[0] || 'Player',
                phone: meta.phone || '', role: 'player', games_attended: 0,
              }).select().single();
              const profile2 = await api.profiles.getById(session.user.id);
              if (profile2) setCu(normaliseProfile(profile2));
            } catch { /* profile creation failed — keep existing cu state */ }
          }
        } catch { /* profile fetch failed — keep existing cu state, don't log out */ }
        // Do NOT call refresh() here — onLogin already calls it
      }
      // NOTE: we intentionally do NOT setCu(null) when session is null here.
      // The only place that should log the user out is the Logout button (signOut()).
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  // Refresh current user profile after updates
  const refreshCu = useCallback(async () => {
    if (!cu) return;
    try {
      const profile = await api.profiles.getById(cu.id);
      setCu(normaliseProfile(profile));
    } catch {}
  }, [cu]);

  // Wrap updateUser to also refresh cu if editing self
  const updateUserAndRefresh = useCallback(async (id, patch) => {
    await updateUser(id, patch);
    if (cu?.id === id) {
      setCu(prev => prev ? { ...prev, ...patch } : prev);
      refreshCu().catch(() => {});
    }
  }, [updateUser, cu, refreshCu]);

  const [geoStatus, setGeoStatus] = useState("checking"); // "checking" | "allowed" | "blocked"

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      // SECURITY NOTE: This geo-check is client-side and can be bypassed with a VPN or DevTools.
      // It is a UX-level restriction only, not a security control.
      // For legally binding geo-restriction, enforce it server-side:
      //   - Supabase Edge Function: check CF-IPCountry header
      //   - Or your hosting provider's edge rules (Vercel, Netlify, Cloudflare)

      const apis = [
        { url: "https://ipwho.is/",             getCode: g => g.success ? g.country_code : null },
        { url: "https://freeipapi.com/api/json", getCode: g => g.countryCode || null },
        { url: "https://api.country.is/",        getCode: g => g.country || null },
      ];

      // Race all three APIs in parallel — use whichever responds first with a valid code
      const tryApi = async ({ url, getCode }) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error("non-ok");
        const g = await res.json();
        const code = (getCode(g) || "").toUpperCase();
        if (!code) throw new Error("no code");
        return code;
      };

      try {
        const code = await Promise.any(apis.map(tryApi));
        if (!cancelled) setGeoStatus(ALLOWED_COUNTRY_CODES.has(code) ? "allowed" : "blocked");
      } catch {
        // All APIs failed (network issue) — fail open so real UK/EU visitors aren't locked out
        if (!cancelled) setGeoStatus("allowed");
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  const [loadingSeconds, setLoadingSeconds] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Only show loading screen while initial data fetch is in progress
  // Auth loads in the background - never block the site on it
  if (loading) {
    const isSlowLoad = loadingSeconds >= 6;
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", background:"#080a06", overflow:"hidden", position:"relative", fontFamily:"'Barlow Condensed',sans-serif" }}>
        {/* Crosshair reticle background */}
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", opacity:.04, pointerEvents:"none" }}>
          <svg width="520" height="520" viewBox="0 0 520 520" fill="none">
            <circle cx="260" cy="260" r="200" stroke="#c8ff00" strokeWidth="1"/>
            <circle cx="260" cy="260" r="120" stroke="#c8ff00" strokeWidth="1"/>
            <circle cx="260" cy="260" r="40" stroke="#c8ff00" strokeWidth="1"/>
            <line x1="0" y1="260" x2="520" y2="260" stroke="#c8ff00" strokeWidth="1"/>
            <line x1="260" y1="0" x2="260" y2="520" stroke="#c8ff00" strokeWidth="1"/>
            <line x1="80" y1="260" x2="80" y2="240" stroke="#c8ff00" strokeWidth="1.5"/>
            <line x1="440" y1="260" x2="440" y2="240" stroke="#c8ff00" strokeWidth="1.5"/>
            <line x1="260" y1="80" x2="240" y2="80" stroke="#c8ff00" strokeWidth="1.5"/>
            <line x1="260" y1="440" x2="240" y2="440" stroke="#c8ff00" strokeWidth="1.5"/>
          </svg>
        </div>
        {/* Corner bracket decorations */}
        <div style={{ position:"absolute", top:32, left:32, width:40, height:40, borderTop:"2px solid rgba(200,255,0,.2)", borderLeft:"2px solid rgba(200,255,0,.2)" }}/>
        <div style={{ position:"absolute", top:32, right:32, width:40, height:40, borderTop:"2px solid rgba(200,255,0,.2)", borderRight:"2px solid rgba(200,255,0,.2)" }}/>
        <div style={{ position:"absolute", bottom:32, left:32, width:40, height:40, borderBottom:"2px solid rgba(200,255,0,.2)", borderLeft:"2px solid rgba(200,255,0,.2)" }}/>
        <div style={{ position:"absolute", bottom:32, right:32, width:40, height:40, borderBottom:"2px solid rgba(200,255,0,.2)", borderRight:"2px solid rgba(200,255,0,.2)" }}/>
        {/* Logo mark */}
        <div style={{ marginBottom:32, display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
          {/* SA box — matches nav logo */}
          <div style={{
            width:80, height:80,
            background:"#c8ff00",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28,
            color:"#000", letterSpacing:".05em",
            animation:"aimIn 0.6s ease-out forwards",
            position:"relative",
          }}>
            SA
            {/* Corner accents */}
            <div style={{ position:"absolute", top:-4, left:-4, width:10, height:10, borderTop:"2px solid #c8ff00", borderLeft:"2px solid #c8ff00" }}/>
            <div style={{ position:"absolute", top:-4, right:-4, width:10, height:10, borderTop:"2px solid #c8ff00", borderRight:"2px solid #c8ff00" }}/>
            <div style={{ position:"absolute", bottom:-4, left:-4, width:10, height:10, borderBottom:"2px solid #c8ff00", borderLeft:"2px solid #c8ff00" }}/>
            <div style={{ position:"absolute", bottom:-4, right:-4, width:10, height:10, borderBottom:"2px solid #c8ff00", borderRight:"2px solid #c8ff00" }}/>
          </div>
        </div>
        {/* Site name */}
        <div style={{ fontSize:32, fontWeight:900, letterSpacing:".12em", color:"#fff", textTransform:"uppercase", lineHeight:1, marginBottom:4 }}>
          SWINDON <span style={{ color:"#c8ff00" }}>AIRSOFT</span>
        </div>
        <div style={{ fontSize:10, letterSpacing:".35em", color:"#3a5010", textTransform:"uppercase", marginBottom:32 }}>
          TACTICAL OPERATIONS CENTRE
        </div>
        {/* Progress bar */}
        <div style={{ width:220, height:2, background:"#1a2808", marginBottom:14, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, height:"100%", width:"100%", background:"linear-gradient(90deg,transparent,#c8ff00,transparent)", animation:"scanBar 1.4s ease-in-out infinite" }}/>
        </div>
        {/* Status text */}
        <div style={{ fontSize:11, letterSpacing:".2em", color:"#3a5010", textTransform:"uppercase", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ display:"inline-block", width:6, height:6, background:"#c8ff00", borderRadius:"50%", animation:"pulse 1s infinite" }}/>
          {isSlowLoad ? "WAKING UP DATABASE…" : "INITIALISING SYSTEMS…"}
        </div>
        {isSlowLoad && (
          <div style={{ marginTop:12, fontSize:11, color:"#333", letterSpacing:".05em", textAlign:"center", maxWidth:260 }}>
            Cold start — database coming online, hold tight
          </div>
        )}
        <style>{`
          @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.2;}}
          @keyframes scanBar{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}
          @keyframes aimIn{from{opacity:0;transform:translateX(-20px);}to{opacity:1;transform:translateX(0);}}
        `}</style>
      </div>
    );
  }

  // ── Geo-block screens ─────────────────────────────────────
  if (geoStatus === "checking") {
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, background:"#080a06", fontFamily:"'Barlow Condensed',sans-serif" }}>
        <div style={{ fontSize:26, fontWeight:900, letterSpacing:".12em", color:"#fff", textTransform:"uppercase" }}>SWINDON <span style={{ color:"#c8ff00" }}>AIRSOFT</span></div>
        <div style={{ width:160, height:2, background:"#1a2808", position:"relative", overflow:"hidden", marginTop:8 }}>
          <div style={{ position:"absolute", top:0, left:0, height:"100%", width:"100%", background:"linear-gradient(90deg,transparent,#c8ff00,transparent)", animation:"scanBar 1.4s ease-in-out infinite" }}/>
        </div>
        <div style={{ color:"#3a5010", fontSize:10, letterSpacing:".25em", textTransform:"uppercase", marginTop:4 }}>VERIFYING LOCATION…</div>
        <style>{`@keyframes scanBar{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}`}</style>
      </div>
    );
  }

  if (geoStatus === "blocked" && cu?.role !== "admin") {
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:20, background:"#0d1117", padding:24, textAlign:"center" }}>
        <div style={{ width:56, height:56, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, color:"#c8ff00", fontSize:20, fontFamily:"'Barlow Condensed',sans-serif" }}>SA</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, fontWeight:900, letterSpacing:".1em", color:"#fff" }}>NOT AVAILABLE IN YOUR REGION</div>
        <div style={{ fontSize:14, color:"#555", maxWidth:340, lineHeight:1.7 }}>
          Swindon Airsoft is only available to visitors in the UK, Ireland, and EU member states.
        </div>
      </div>
    );
  }

  const isAdmin = cu?.role === "admin";

  // Error banner — shown at top but doesn't block the site
  const errorBanner = loadError ? (
    <div style={{ background: "#f85149", color: "#fff", padding: "10px 20px", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span>⚠️ Database error: {loadError}</span>
      <button onClick={refresh} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Retry</button>
    </div>
  ) : null;

  if (page === "admin") {
    // First gate: must be logged in at all
    if (!cu) {
      setPage("home");
      return null;
    }
    // Second gate: client-side role pre-check (server verification happens inside AdminPanel)
    if (!isAdmin) {
      return (
        <>
          <style>{CSS}</style>
          <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 48 }}>🔒</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 32, letterSpacing: ".1em", color: "var(--red)" }}>ACCESS DENIED</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>Admin access only.</div>
            <button className="btn btn-ghost" onClick={() => setPage("home")}>← Back to Site</button>
          </div>
        </>
      );
    }
    return (
      <>
        <style>{CSS}</style>
        <Toast {...toast} />
        {errorBanner}
        <AdminPanel
          data={data} cu={cu} save={save}
          updateUser={updateUserAndRefresh} updateEvent={updateEvent}
          showToast={showToast} setPage={setPage} refresh={refresh}
        />
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <Toast {...toast} />
      {errorBanner}
      {isOffline && (
        <div style={{ background:"#1a0a00", borderBottom:"1px solid #3a1a00", padding:"8px 16px", display:"flex", alignItems:"center", gap:10, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#ff9944", letterSpacing:".15em" }}>
          <span style={{ fontSize:14 }}>📡</span>
          <span>NO SIGNAL — YOU ARE OFFLINE. SOME FEATURES MAY NOT WORK.</span>
        </div>
      )}
      <PublicNav page={page} setPage={setPage} cu={cu} setCu={setCu} setAuthModal={setAuthModal} shopClosed={data?.shopClosed} />

      <div className="pub-page-wrap">
        {page === "home"        && <HomePage data={data} setPage={setPage} />}
        {page === "events"      && <EventsPage data={data} cu={cu} updateEvent={updateEvent} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} save={save} setPage={setPage} />}
        {page === "shop" && data.shopClosed && (
          <ShopClosedPage setPage={setPage} />
        )}
        {page === "shop" && !data.shopClosed && !selectedProduct && (
          <ShopPage
            data={data} cu={cu} showToast={showToast} save={save}
            recentlyViewed={recentlyViewed}
            cart={shopCart} setCart={setShopCart}
            cartOpen={shopCartOpen} setCartOpen={setShopCartOpen}
            onProductClick={(item) => { setSelectedProduct(item); trackRecentlyViewed(item); }}
          />
        )}
        {page === "shop" && !data.shopClosed && selectedProduct && (
          <ProductPage
            item={selectedProduct}
            cu={cu}
            shopItems={data.shop || []}
            onProductClick={(p) => { setSelectedProduct(p); trackRecentlyViewed(p); }}
            onBack={() => setSelectedProduct(null)}
            cartCount={shopCart.reduce((s, i) => s + i.qty, 0)}
            onCartOpen={() => { setShopCartOpen(true); setSelectedProduct(null); }}
            onAddToCart={(item, variant, qty) => {
              const key = variant ? `${item.id}::${variant.id}` : item.id;
              const price = variant ? Number(variant.price) : (item.onSale && item.salePrice ? item.salePrice : item.price);
              const label = variant ? `${item.name} — ${variant.name}` : item.name;
              const availStock = variant ? Number(variant.stock) : item.stock;
              setShopCart(c => {
                const ex = c.find(x => x.key === key);
                const currentQty = ex ? ex.qty : 0;
                if (currentQty + qty > availStock) { showToast("Not enough stock", "red"); return c; }
                if (ex) return c.map(x => x.key === key ? { ...x, qty: x.qty + qty } : x);
                return [...c, { key, id: item.id, variantId: variant?.id || null, name: label, price, qty, noPost: item.noPost, stock: availStock }];
              });
              showToast(`${label} × ${qty} added to cart`);
            }}
          />
        )}
        {page === "leaderboard" && <LeaderboardPage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} onPlayerClick={id => { setPrevPage("leaderboard"); setPublicProfileId(id); setPageState("player"); window.location.hash = "player/" + id; }} />}
        {page === "marshal"     && cu?.canMarshal && <MarshalCheckinPage data={data} showToast={showToast} save={save} updateUser={updateUserAndRefresh} />}
        {page === "marshal"     && !cu?.canMarshal && <div style={{ textAlign:"center", padding:60, color:"var(--muted)" }}>Access denied.</div>}
        {page === "gallery"     && <GalleryPage data={data} />}
        {page === "qa"          && <QAPage data={data} />}
        {page === "vip"         && <VipPage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} setPage={setPage} />}
        {page === "profile"     && cu  && <ProfilePage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} save={save} refresh={refreshCu} setPage={setPage} />}
        {page === "profile"     && !cu && <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Please log in to view your profile.</div>}
        {page === "player"      && <PublicProfilePage userId={publicProfileId} prevPage={prevPage} setPage={setPage} />}
        {page === "about"       && <AboutPage setPage={setPage} />}
        {page === "staff"       && <StaffPage staff={data.staff || []} />}
        {page === "contact"     && <ContactPage data={data} cu={cu} showToast={showToast} />}
        {page === "terms"       && <TermsPage setPage={setPage} />}
      </div>

      {/* FOOTER */}
      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-grid">
            {/* Brand col */}
            <div>
              <div className="pub-footer-logo">
                <div className="pub-footer-logo-box">SA</div>
                <div className="pub-footer-logo-text">SWINDON AIRSOFT</div>
              </div>
              <p className="pub-footer-desc">Premier airsoft venue. Experience tactical gameplay like never before.</p>
              {(data.socialFacebook || data.socialInstagram || data.socialWhatsapp) && (
                <div className="pub-footer-social" style={{ marginTop:16 }}>
                  {data.socialFacebook && (
                    <a href={data.socialFacebook} target="_blank" rel="noopener noreferrer" className="pub-footer-social-btn" title="Facebook">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                    </a>
                  )}
                  {data.socialInstagram && (
                    <a href={data.socialInstagram} target="_blank" rel="noopener noreferrer" className="pub-footer-social-btn" title="Instagram">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    </a>
                  )}
                  {data.socialWhatsapp && (
                    <a href={data.socialWhatsapp} target="_blank" rel="noopener noreferrer" className="pub-footer-social-btn" title="WhatsApp">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </a>
                  )}
                </div>
              )}
            </div>
            {/* Quick Links */}
            <div>
              <div className="pub-footer-col-title">QUICK LINKS</div>
              {[
                ["Upcoming Events", "events"],
                ["Shop", "shop"],
                ["VIP Membership", "vip"],
                ["Gallery", "gallery"],
                ["Meet the Staff", "staff"],
                ["Contact Us", "contact"],
              ].map(([label, pg]) => (
                <button key={label} className="pub-footer-link" onClick={() => setPage(pg)}>{label}</button>
              ))}
            </div>
            {/* Information */}
            <div>
              <div className="pub-footer-col-title">INFORMATION</div>
              {[
                ["Sign Waiver", "profile"],
                ["Site Rules", "qa"],
                ["FAQ", "qa"],
                ["Terms & Privacy", "terms"],
              ].map(([label, pg]) => (
                <button key={label} className="pub-footer-link" onClick={() => setPage(pg)}>{label}</button>
              ))}
            </div>
            {/* Contact */}
            <div>
              <div className="pub-footer-col-title">CONTACT</div>
              {data.contactAddress && <div className="pub-footer-contact">📍 {data.contactAddress}</div>}
              {data.contactPhone && <div className="pub-footer-contact">📞 <a href={`tel:${data.contactPhone}`} style={{color:"inherit",textDecoration:"none"}}>{data.contactPhone}</a></div>}
              {data.contactEmail && <div className="pub-footer-contact">✉️ <a href={`mailto:${data.contactEmail}`} style={{color:"inherit",textDecoration:"none"}}>{data.contactEmail}</a></div>}
              {!data.contactAddress && !data.contactPhone && !data.contactEmail && (
                <div className="pub-footer-contact" style={{color:"#444"}}>Contact details coming soon</div>
              )}
            </div>
          </div>
          <div className="pub-footer-bottom">
            <div className="pub-footer-copy">© {new Date().getFullYear()} Swindon Airsoft. All rights reserved.</div>
            <div style={{ display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
              <div className="pub-footer-legal">Players must be 18+ or accompanied by adult. Valid ID required.</div>
              <button onClick={() => setPage("terms")} style={{ background:"none", border:"none", color:"var(--muted)", fontSize:12, cursor:"pointer", padding:0, textDecoration:"underline" }}>Terms & Privacy Policy</button>
            </div>
          </div>
        </div>
      </footer>

      {authModal && (
        <SupabaseAuthModal
          mode={authModal} setMode={setAuthModal}
          onClose={() => setAuthModal(null)} showToast={showToast}
          onLogin={profile => { setCu(profile); refresh(); }}
        />
      )}
    </>
  );
}


export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
