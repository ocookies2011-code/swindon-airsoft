import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { squareRefund, waitlistApi, holdApi, normaliseProfile } from "./api";
import {
  renderMd, stockLabel, fmtErr,
  gmtShort, fmtDate, uid,
  EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY,
  detectCourier, trackKeyCache,
  AdminTrackStatusCell, TrackingBlock,
  useMobile, GmtClock, QRScanner,
  sendEmail, sendTicketEmail, sendEventReminderEmail,
  sendAdminBookingNotification,
  sendWaitlistNotifyEmail, sendDispatchEmail, sendNewEventEmail,
  sendReturnDecisionEmail, sendUkaraDecisionEmail, sendAdminUkaraNotification,
  WaiverModal,
  RankInsignia, DesignationInsignia, resetSquareConfig,
} from "./utils";
import { SUPERADMIN_EMAIL, logAction } from "./adminShared";

export default function AdminCash({ data, cu, showToast }) {
  const [items, setItems] = useState([]);
  const [shopProducts, setShopProducts] = useState(data.shop || []);
  const [shopLoading, setShopLoading] = useState(true);
  const [playerId, setPlayerId] = useState("manual");
  const [manual, setManual] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [diagResult, setDiagResult] = useState(null);

  // ── Payment method: "cash" | "terminal"
  const [payMethod, setPayMethod] = useState("cash");

  // ── Terminal state
  const [terminalDeviceId, setTerminalDeviceId] = useState(""); // from settings
  const [squareEnv, setSquareEnv] = useState("production");
  const [terminalCheckoutId, setTerminalCheckoutId] = useState(null); // active checkout
  const [terminalStatus, setTerminalStatus] = useState(null); // PENDING|IN_PROGRESS|COMPLETED|CANCELLED
  const [terminalPaymentId, setTerminalPaymentId] = useState(null);
  const [terminalPolling, setTerminalPolling] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const pollRef = useRef(null);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    api.shop.getAll()
      .then(list => { setShopProducts(list); setShopLoading(false); })
      .catch(() => { setShopProducts(data.shop || []); setShopLoading(false); });
    // Load terminal device ID + env from settings
    api.settings.get("square_terminal_device_id").then(v => { if (v) setTerminalDeviceId(v); }).catch(() => {});
    api.settings.get("square_env").then(v => { if (v) setSquareEnv(v); }).catch(() => {});
  }, []);

  // Clear polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const add = (item) => setItems(c => {
    const ex = c.find(x => x.id === item.id);
    return ex ? c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...item, qty: 1 }];
  });

  // Diagnostic: test if cash_sales table is reachable at all
  const runDiag = async () => {
    setDiagResult("Testing…");
    try {
      const { data: rows, error } = await supabase.from('cash_sales').select('id').limit(1);
      if (error) setDiagResult("SELECT error: " + (error.message || JSON.stringify(error)));
      else setDiagResult("SELECT ok — " + (rows?.length ?? 0) + " rows visible. Table is accessible.");
    } catch (e) {
      setDiagResult("Exception: " + e.message);
    }
  };

  // ── Invoke the square-terminal Edge Function ──────────
  const terminalInvoke = async (body) => {
    const { data: d, error } = await supabase.functions.invoke("square-terminal", {
      body: { ...body, env: squareEnv },
    });
    if (error) throw new Error(error.message || "Terminal function error");
    if (d?.error) throw new Error(d.error);
    return d;
  };

  // ── Save the completed sale to DB ─────────────────────
  const saveSaleToDB = async (squarePaymentId = null) => {
    const player     = playerId !== "manual" ? data.users.find(u => u.id === playerId) : null;
    const isTerminal = !!squarePaymentId;

    // Ensure player exists in Square Customer Directory
    let squareCustomerId = player?.square_customer_id || null;
    if (player && !squareCustomerId) {
      try {
        const { data: custResult } = await supabase.functions.invoke("square-customer-sync", {
          body: { action: "upsert", profile: player },
        });
        squareCustomerId = custResult?.squareCustomerId || null;
      } catch (e) { console.warn("Customer sync failed:", e.message); }
    }

    const customerName  = player ? player.name : (manual.name || "Walk-in");
    const customerEmail = player ? (player.email || "") : (manual.email || "");
    const userId        = player?.id ?? null;
    const saleItems     = items.map(i => ({ id: i.id, name: i.name, variant: i.variant || null, price: i.price, qty: i.qty }));

    if (isTerminal) {
      // Terminal sales → shop_orders so they appear on the customer's account
      const orderPayload = {
        customer_name:    customerName,
        customer_email:   customerEmail,
        user_id:          userId,
        items:            saleItems,
        subtotal:         total,
        postage:          0,
        postage_name:     null,
        total,
        status:           "completed",
        square_order_id:  squarePaymentId,
        customer_address: player?.address || null,
      };
      const insertPromise  = supabase.from("shop_orders").insert(orderPayload).select();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 6000));
      const { error } = await Promise.race([insertPromise, timeoutPromise]);
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" | ") || JSON.stringify(error);
        throw new Error("DB Error: " + msg);
      }
    } else {
      // Cash sales → cash_sales table
      const cashPayload = {
        customer_name:      customerName,
        customer_email:     customerEmail,
        user_id:            userId,
        items:              saleItems,
        total,
        payment_method:     "cash",
        square_payment_id:  null,
        square_customer_id: squareCustomerId || null,
      };
      const insertPromise  = supabase.from("cash_sales").insert(cashPayload).select();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 6000));
      const { error } = await Promise.race([insertPromise, timeoutPromise]);
      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" | ") || JSON.stringify(error);
        throw new Error("DB Error: " + msg);
      }
    }

    // Deduct stock
    for (const item of items) {
      await supabase.rpc("deduct_stock", { product_id: item.id, qty: item.qty });
    }
    const cashItems = items.map(i => `${i.name} x${i.qty} (£${Number(i.price * i.qty).toFixed(2)})`).join(", ");
    const method    = isTerminal ? "Terminal" : "Cash";
    logAction({ adminEmail: cu?.email, adminName: cu?.name, action: `${method} sale recorded`, detail: `Customer: ${customerName} | Total: £${total.toFixed(2)} | Items: ${cashItems}${squarePaymentId ? ` | Square: ${squarePaymentId}` : ""}` });
  };

  const logFailedPayment = async (errorMessage, paymentMethod, squarePaymentId = null) => {
    const player = playerId !== "manual" ? data.users.find(u => u.id === playerId) : null;
    await supabase.from('failed_payments').insert({
      customer_name:     player ? player.name : (manual.name || "Walk-in"),
      customer_email:    player ? (player.email || "") : (manual.email || ""),
      user_id:           player?.id ?? null,
      items:             items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      total,
      payment_method:    paymentMethod,
      error_message:     errorMessage,
      square_payment_id: squarePaymentId || null,
      recorded_by:       cu?.email || null,
    }).then(({ error }) => {
      if (error) console.warn("Failed to log failed payment:", error.message);
    });
  };

  const resetSale = () => {
    setItems([]);
    setManual({ name: "", email: "" });
    setPlayerId("manual");
    setLastError(null);
    setDiagResult(null);
    setTerminalCheckoutId(null);
    setTerminalStatus(null);
    setTerminalPaymentId(null);
    setTerminalPolling(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // ── Cash payment ──────────────────────────────────────
  const completeCashSale = async () => {
    if (items.length === 0) { showToast("Add items first", "red"); return; }
    setLastError(null);
    setBusy(true);
    try {
      await saveSaleToDB(null);
      showToast(`✅ Cash sale £${total.toFixed(2)} saved!`);
      resetSale();
    } catch (e) {
      const isTimed = e.message.includes("TIMEOUT");
      const msg = isTimed
        ? "Insert timed out — RLS is blocking the write. Run master-rls-admin-only.sql in Supabase SQL Editor, then click 'Test Table Access' below to confirm."
        : e.message;
      setLastError(msg);
      showToast(isTimed ? "RLS blocking insert — see error below" : "Error: " + e.message, "red");
      await logFailedPayment(msg, "cash");
    } finally {
      setBusy(false);
    }
  };

  // ── Terminal: send checkout to device ────────────────
  const startTerminalCheckout = async () => {
    if (items.length === 0) { showToast("Add items first", "red"); return; }
    if (!terminalDeviceId) { showToast("No Terminal Device ID configured — add it in Settings → Square", "red"); return; }
    setTerminalBusy(true);
    setLastError(null);
    setTerminalStatus("PENDING");
    setTerminalCheckoutId(null);
    setTerminalPaymentId(null);
    try {
      const locationId = await api.settings.get("square_location_id");
      const amountPence = Math.round(total * 100);
      const player = playerId !== "manual" ? data.users.find(u => u.id === playerId) : null;
      const customerName = player ? player.name : (manual.name || "Walk-in");
      const note = `Swindon Airsoft — ${customerName} — ${items.map(i => `${i.name} x${i.qty}`).join(", ")}`;
      console.log("=== Terminal Debug ===");
      console.log("locationId:", locationId);
      console.log("deviceId:", terminalDeviceId);
      console.log("env:", squareEnv);
      console.log("amount (pence):", amountPence);
      const result = await terminalInvoke({
        action: "create",
        deviceId: terminalDeviceId,
        amount: amountPence,
        currency: "GBP",
        note: note.slice(0, 200),
        locationId,
      });
      setTerminalCheckoutId(result.checkoutId);
      setTerminalStatus(result.status || "PENDING");
      showToast("📟 Payment sent to terminal — waiting for customer…");
      // Start polling every 3 seconds
      setTerminalPolling(true);
      pollRef.current = setInterval(() => pollTerminal(result.checkoutId), 3000);
    } catch (e) {
      setTerminalStatus(null);
      setLastError("Terminal error: " + e.message);
      showToast("Terminal error: " + e.message, "red");
      await logFailedPayment(e.message, "terminal");
    } finally {
      setTerminalBusy(false);
    }
  };

  // ── Terminal: poll for status ─────────────────────────
  const pollTerminal = async (checkoutId) => {
    try {
      const result = await terminalInvoke({ action: "get", checkoutId });
      setTerminalStatus(result.status);
      if (result.status === "COMPLETED") {
        clearInterval(pollRef.current); pollRef.current = null;
        setTerminalPolling(false);
        setTerminalPaymentId(result.paymentId);
        // Save to DB with the Square payment ID
        try {
          await saveSaleToDB(result.paymentId);
          showToast(`✅ Terminal payment £${total.toFixed(2)} confirmed!`);
          resetSale();
        } catch (dbErr) {
          setLastError("Payment taken but DB save failed: " + dbErr.message);
          showToast("Payment taken but DB save failed — see error below", "red");
          await logFailedPayment("Payment taken but DB save failed: " + dbErr.message, "terminal", result.paymentId);
        }
      } else if (result.status === "CANCELLED" || result.status === "CANCEL_REQUESTED") {
        clearInterval(pollRef.current); pollRef.current = null;
        setTerminalPolling(false);
        showToast("❌ Terminal payment cancelled.", "red");
      }
    } catch { /* polling errors are non-fatal — keep trying */ }
  };

  // ── Terminal: cancel checkout ─────────────────────────
  const cancelTerminalCheckout = async () => {
    if (!terminalCheckoutId) return;
    try {
      await terminalInvoke({ action: "cancel", checkoutId: terminalCheckoutId });
      clearInterval(pollRef.current); pollRef.current = null;
      setTerminalPolling(false);
      setTerminalStatus("CANCELLED");
      showToast("Terminal payment cancelled.");
    } catch (e) {
      showToast("Cancel failed: " + e.message, "red");
    }
  };

  const terminalActive = terminalPolling || terminalStatus === "PENDING" || terminalStatus === "IN_PROGRESS";

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Cash Sales</div><div className="page-sub">Walk-in or unregistered customer sales</div></div></div>
      {lastError && (
        <div className="alert alert-red mb-2" style={{ wordBreak: "break-all", fontSize: 12 }}>
          <strong>Error:</strong> {lastError}
          <div className="mt-1">
            <button className="btn btn-sm btn-ghost" onClick={runDiag}>🔍 Test Table Access</button>
          </div>
        </div>
      )}
      {diagResult && (
        <div className="alert alert-blue mb-2" style={{ fontSize: 12, wordBreak: "break-all" }}>
          <strong>Diagnostic:</strong> {diagResult}
        </div>
      )}

      {/* ── Active terminal checkout status banner ── */}
      {terminalActive && (
        <div style={{ background:"rgba(79,195,247,.08)", border:"1px solid rgba(79,195,247,.35)", borderRadius:6, padding:"14px 18px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".08em", color:"#4fc3f7", marginBottom:4 }}>
              📟 TERMINAL CHECKOUT — {terminalStatus || "PENDING"}
            </div>
            <div style={{ fontSize:12, color:"var(--muted)" }}>
              {terminalStatus === "PENDING" && "Sending to device…"}
              {terminalStatus === "IN_PROGRESS" && "Waiting for customer to pay on the terminal…"}
              <span style={{ fontFamily:"monospace", fontSize:10, marginLeft:8, color:"#2a3a50" }}>{terminalCheckoutId}</span>
            </div>
          </div>
          <button className="btn btn-sm btn-danger" onClick={cancelTerminalCheckout}>
            ✕ Cancel
          </button>
        </div>
      )}
      {terminalStatus === "CANCELLED" && (
        <div className="alert alert-red mb-2" style={{ fontSize:12 }}>❌ Terminal payment was cancelled. You can retry or switch to cash.</div>
      )}

      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>PRODUCTS</div>
          {shopLoading && <p className="text-muted" style={{ fontSize: 13 }}>Loading products…</p>}
          {!shopLoading && shopProducts.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No products in shop yet. Add products in the Shop section.</p>}
          {!shopLoading && shopProducts.map(item => {
            const effectivePrice = item.onSale && item.salePrice ? item.salePrice : item.price;
            if (item.variants && item.variants.length > 0) {
              return (
                <div key={item.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    {item.name}
                    {item.hiddenFromShop && <span className="tag tag-red" style={{ fontSize: 9, marginLeft: 6 }}>🔒 HIDDEN</span>}
                  </div>
                  {item.variants.map(v => (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0 3px 12px" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{v.name}</span>
                      <div className="gap-2">
                        <span className="text-green" style={{ fontSize: 12 }}>£{Number(v.price).toFixed(2)}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>({v.stock})</span>
                        <button className="btn btn-sm btn-primary" onClick={() => add({ id: `${item.id}::${v.id}`, name: item.name, variant: v.name, price: Number(v.price) })}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ fontSize: 13 }}>{item.name}</span>
                  {item.hiddenFromShop && <span className="tag tag-red" style={{ fontSize: 9, marginLeft: 6 }}>🔒 HIDDEN</span>}
                  {item.onSale && item.salePrice && <span className="tag tag-red" style={{ fontSize: 9, marginLeft: 6 }}>SALE</span>}
                </div>
                <div className="gap-2">
                  <span className="text-green">£{Number(effectivePrice).toFixed(2)}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>({item.stock})</span>
                  <button className="btn btn-sm btn-primary" onClick={() => add({ id: item.id, name: item.name, price: Number(effectivePrice) })}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="card mb-2">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>CUSTOMER</div>
            <div className="form-group">
              <label>Player</label>
              <select value={playerId} onChange={e => setPlayerId(e.target.value)}>
                <option value="manual">Manual Entry (walk-in)</option>
                {data.users.filter(u => u.role === "player").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {playerId === "manual" && (
              <>
                <div className="form-group"><label>Name</label><input value={manual.name} onChange={e => setManual(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="form-group"><label>Email (optional)</label><input value={manual.email} onChange={e => setManual(p => ({ ...p, email: e.target.value }))} /></div>
              </>
            )}
          </div>
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>SALE ITEMS</div>
            {items.length === 0 ? <p className="text-muted" style={{ fontSize: 13 }}>No items added yet</p> : (
              items.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span>{item.name}{item.variant ? ` — ${item.variant}` : ""} ×{item.qty}</span>
                  <div className="gap-2">
                    <span className="text-green">£{(item.price * item.qty).toFixed(2)}</span>
                    <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }} onClick={() => setItems(c => c.filter(x => x.id !== item.id))}>✕</button>
                  </div>
                </div>
              ))
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 22, marginTop: 12, marginBottom: 16 }}>
              <span>TOTAL</span><span className="text-green">£{total.toFixed(2)}</span>
            </div>

            {/* ── Payment method selector ── */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 8 }}>PAYMENT METHOD</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["cash", "terminal"].map(m => {
                  const isTerminal = m === "terminal";
                  const unavailable = isTerminal && !terminalDeviceId;
                  return (
                    <button key={m}
                      onClick={() => !unavailable && setPayMethod(m)}
                      title={unavailable ? "No Terminal Device ID set — go to Settings → Square" : ""}
                      style={{
                        flex: 1, padding: "10px 8px", borderRadius: 4, cursor: unavailable ? "not-allowed" : "pointer",
                        fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".1em",
                        textTransform: "uppercase", border: "1px solid",
                        background: payMethod === m ? (isTerminal ? "rgba(79,195,247,.15)" : "rgba(200,255,0,.12)") : "var(--card)",
                        color: unavailable ? "var(--muted)" : payMethod === m ? (isTerminal ? "#4fc3f7" : "var(--accent)") : "var(--muted)",
                        borderColor: payMethod === m ? (isTerminal ? "rgba(79,195,247,.5)" : "rgba(200,255,0,.4)") : "var(--border)",
                        opacity: unavailable ? 0.45 : 1,
                      }}>
                      {isTerminal ? "📟 Terminal" : "💵 Cash"}
                      {isTerminal && !terminalDeviceId && <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, textTransform: "none", letterSpacing: 0 }}>Not configured</div>}
                    </button>
                  );
                })}
              </div>
              {payMethod === "terminal" && terminalDeviceId && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, fontFamily: "monospace" }}>
                  Device: {terminalDeviceId} · {squareEnv}
                </div>
              )}
            </div>

            {/* ── Action buttons ── */}
            {payMethod === "cash" ? (
              <button className="btn btn-primary" style={{ width: "100%", padding: 10 }} disabled={busy || items.length === 0} onClick={completeCashSale}>
                {busy ? "Saving…" : "✓ Complete Cash Sale"}
              </button>
            ) : (
              terminalActive ? (
                <button className="btn btn-sm btn-danger" style={{ width: "100%", padding: 10 }} onClick={cancelTerminalCheckout}>
                  ✕ Cancel Terminal Payment
                </button>
              ) : (
                <button className="btn" style={{ width: "100%", padding: 10, background: "rgba(79,195,247,.15)", border: "1px solid rgba(79,195,247,.4)", color: "#4fc3f7", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: ".08em" }}
                  disabled={terminalBusy || items.length === 0} onClick={startTerminalCheckout}>
                  {terminalBusy ? "⏳ Sending…" : "📟 Send to Terminal"}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════
// ROOT APP


// ── Player Waitlist ──────────────────────────────────────
function PlayerWaitlist({ cu, showToast }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // id being removed
  const isMounted = useRef(true);

  const load = useCallback(() => {
    if (!isMounted.current) return;
    setLoading(true);
    waitlistApi.getByUser(cu.id)
      .then(data => { if (isMounted.current) setEntries(data); })
      .catch(() => {})
      .finally(() => { if (isMounted.current) setLoading(false); });
  }, [cu.id]);

  useEffect(() => {
    isMounted.current = true;
    load();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const leave = async (entry) => {
    setBusy(entry.id);
    try {
      await waitlistApi.leave({ eventId: entry.event_id, userId: cu.id, ticketType: entry.ticket_type });
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      showToast("Removed from waitlist.");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(null); }
  };

  if (loading) return (
    <div style={{ textAlign:"center", padding:60, fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)" }}>Loading waitlist…</div>
  );

  if (entries.length === 0) return (
    <div style={{ textAlign:"center", padding:60 }}>
      <div style={{ fontSize:40, marginBottom:16 }}>🔔</div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>No Waitlist Entries</div>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#2a3a10", marginTop:8 }}>When an event is full, click "Notify Me" to join the waitlist</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:16, fontFamily:"'Share Tech Mono',monospace" }}>
        You will be emailed automatically when a slot opens for any event below.
      </div>
      {entries.map(e => (
        <div key={e.id} className="card mb-1" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".06em", marginBottom:2 }}>
              {e.event_title || "Event"}
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)" }}>
              {e.ticket_type === "walkOn" ? "🎯 Walk-On" : "🪖 Rental"} · Added {new Date(e.created_at).toLocaleDateString("en-GB")}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ color:"var(--red)", borderColor:"rgba(220,50,50,.3)", fontSize:11 }}
            onClick={() => leave(e)} disabled={busy === e.id}>
            {busy === e.id ? "Removing…" : "✕ Leave Waitlist"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Terms & Privacy Page ──────────────────────────────────
function TermsPage({ setPage }) {
  const [activeSection, setActiveSection] = useState("terms");

  const PageHeader = () => (
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
      <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — LEGAL & COMPLIANCE — ◈</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
          TERMS & <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>PRIVACY</span>
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".2em", color:"#3a5010", marginTop:12 }}>▸ LAST UPDATED: {new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" }).toUpperCase()} ◂</div>
      </div>
    </div>
  );

  const SectionTitle = ({ id, children }) => (
    <div id={id} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:".15em", color:"#c8ff00", textTransform:"uppercase", marginBottom:10, marginTop:36, paddingBottom:8, borderBottom:"1px solid #1a2808", display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ color:"#3a5010" }}>▸</span> {children}
    </div>
  );

  const Para = ({ children }) => (
    <p style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#8aaa60", lineHeight:2, marginBottom:12 }}>{children}</p>
  );

  const BulletList = ({ items }) => (
    <ul style={{ listStyle:"none", padding:0, margin:"0 0 16px" }}>
      {items.map((item, i) => (
        <li key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"5px 0", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#8aaa60", lineHeight:1.8 }}>
          <span style={{ color:"#c8ff00", flexShrink:0, marginTop:2 }}>▸</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  const InfoBox = ({ type, children }) => {
    const colours = { warning: { bg:"rgba(200,150,0,.08)", border:"rgba(200,150,0,.3)", text:"var(--gold)" }, info: { bg:"rgba(79,195,247,.06)", border:"rgba(79,195,247,.3)", text:"#4fc3f7" }, important: { bg:"rgba(200,255,0,.05)", border:"rgba(200,255,0,.3)", text:"#c8ff00" } };
    const c = colours[type] || colours.info;
    return (
      <div style={{ background:c.bg, border:"1px solid " + c.border, padding:"14px 18px", marginBottom:16, borderRadius:2 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:c.text, lineHeight:1.8 }}>{children}</div>
      </div>
    );
  };

  // Divider is defined at module level above AboutPage;

  const tabs = [
    { id:"terms", label:"Terms of Use" },
    { id:"bookings", label:"Bookings & Cancellations" },
    { id:"shop", label:"Shop & Orders" },
    { id:"waiver", label:"Liability Waiver" },
    { id:"privacy", label:"Privacy Policy" },
  ];

  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      <PageHeader />

      {/* Tab navigation */}
      <div style={{ background:"#0a0c08", borderBottom:"1px solid #1a2808", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ maxWidth:900, margin:"0 auto", padding:"0 16px", display:"flex", gap:0, overflowX:"auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveSection(t.id)}
              style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em", textTransform:"uppercase", padding:"14px 18px", background:"none", border:"none", borderBottom: activeSection === t.id ? "2px solid #c8ff00" : "2px solid transparent", color: activeSection === t.id ? "#c8ff00" : "#3a5010", cursor:"pointer", whiteSpace:"nowrap", transition:"color .15s" }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px 80px" }}>

        {/* ══ TERMS OF USE ══ */}
        {activeSection === "terms" && (
          <div>
            <SectionTitle id="terms-1">1. Introduction</SectionTitle>
            <Para>By accessing and using the Swindon Airsoft website and booking platform, you agree to be bound by these Terms and Conditions. These terms apply to all visitors, registered players, and anyone who makes a booking or purchase through this platform.</Para>
            <InfoBox type="important">Swindon Airsoft reserves the right to amend these terms and conditions at any time. Updated terms will be posted on this website and communicated to players as necessary. Continued use of the platform following any changes constitutes acceptance of the revised terms.</InfoBox>

            <SectionTitle id="terms-2">2. Age Requirements</SectionTitle>
            <InfoBox type="warning">Players must be at least 12 years old to participate.</InfoBox>
            <BulletList items={[
              "Players aged 12–13 must have a parent or guardian present and playing with them on the day.",
              "Players aged 14–17 must have written parental or guardian consent before attending.",
              "Players 18 and over may attend and book independently.",
              "Valid ID or consent documentation may be requested on arrival.",
              "Swindon Airsoft reserves the right to refuse entry if age requirements cannot be verified.",
            ]} />

            <SectionTitle id="terms-3">3. Code of Conduct</SectionTitle>
            <Para>All players are expected to behave in a safe, respectful, and sportsmanlike manner at all times. Failure to comply may result in removal from the field without refund.</Para>
            <BulletList items={[
              "Follow all marshal instructions immediately and without question.",
              "Call your hits honestly — this is a self-policing sport.",
              "Aggressive behaviour, abuse, or threatening conduct toward other players or staff will result in immediate removal and a permanent ban.",
              "Alcohol and illegal substances are strictly prohibited on site.",
              "All weapons must remain holstered or slung when not in the active play area.",
              "Eye protection must be worn at all times in the game zone, no exceptions.",
            ]} />

            <SectionTitle id="terms-4">4. FPS Limits & Chronographing</SectionTitle>
            <Para>All guns must meet Swindon Airsoft's FPS (Feet Per Second) limits. Every weapon will be chronographed before the game begins. Weapons exceeding the limits below will not be permitted on the field.</Para>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10, marginBottom:20 }}>
              {[
                { type:"Full Auto Rifle", fps:"350fps", weight:"0.20g", med:"No MED" },
                { type:"DMR", fps:"450fps", weight:"0.20g", med:"30m MED" },
                { type:"Bolt-Action Sniper", fps:"500fps", weight:"0.20g", med:"30m MED" },
              ].map(g => (
                <div key={g.type} style={{ background:"rgba(200,255,0,.04)", border:"1px solid #2a3a10", padding:"14px 16px" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:".1em", color:"#c8ff00", textTransform:"uppercase", marginBottom:8 }}>{g.type}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:2 }}>
                    <div>Limit: <span style={{ color:"#c8e878" }}>{g.fps} ({g.weight})</span></div>
                    <div>MED: <span style={{ color:"#c8e878" }}>{g.med}</span></div>
                  </div>
                </div>
              ))}
            </div>

            <SectionTitle id="terms-5">5. Engagement Distances</SectionTitle>
            <Para>Minimum engagement distances (MED) must be observed at all times. Players operating a DMR or bolt-action sniper rifle must carry a sidearm and switch to it when inside the MED. Marshals will brief these rules before each game.</Para>
            <BulletList items={[
              "Full Auto Rifle (350fps): No minimum engagement distance.",
              "DMR (450fps): 30 metre minimum engagement distance.",
              "Bolt-Action Sniper (500fps): 30 metre minimum engagement distance.",
            ]} />

            <SectionTitle id="terms-6">6. Personal Equipment Rules</SectionTitle>
            <BulletList items={[
              "All RIFs (Realistic Imitation Firearms) must be chronographed before play. Any weapon exceeding site FPS limits will be banned from the field for that session.",
              "Swindon Airsoft accepts no liability for loss or damage to personal equipment brought on site.",
              "All personal equipment is used entirely at the owner's risk.",
            ]} />

            <SectionTitle id="terms-7">7. Rental Equipment</SectionTitle>
            <Para>Rental equipment remains the property of Swindon Airsoft and must be returned in good working order at the end of the session. Players are responsible for rental equipment while it is in their possession.</Para>
            <InfoBox type="warning">Players must not disassemble, modify, or tamper with rented equipment in any way — this includes removing batteries.</InfoBox>
            <Para>Players will be charged for any damage or loss of rental equipment at the following rates:</Para>
            <div style={{ background:"#0a0c08", border:"1px solid #1a2808", overflow:"hidden", marginBottom:16 }}>
              {[
                ["Rifle", "£153 — replacement rifle, or cost of parts required for repair"],
                ["Goggles / Mask", "£23 — full mask replacement · £13 — visor replacement only"],
                ["Chest Rig", "£20 — repair charge for any damage"],
                ["Speedloader", "£5 — replacement"],
                ["Magazine", "£16 per replacement magazine"],
              ].map(([item, cost], i) => (
                <div key={item} style={{ display:"flex", alignItems:"flex-start", gap:16, padding:"10px 16px", background: i % 2 === 0 ? "transparent" : "rgba(200,255,0,.02)", borderBottom:"1px solid #1a2808" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".08em", color:"#c8e878", minWidth:120, flexShrink:0, textTransform:"uppercase" }}>{item}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.7 }}>{cost}</div>
                </div>
              ))}
            </div>

            <SectionTitle id="terms-8">8. VIP Membership</SectionTitle>
            <Para>VIP membership is an annual subscription providing discounts and benefits as described on the VIP page. Membership fees are non-refundable once activated. Membership is personal and non-transferable. Swindon Airsoft reserves the right to revoke VIP status for breach of these terms without refund of the membership fee. Annual membership costs £40.</Para>

            <SectionTitle id="terms-card">9. Disciplinary Card System</SectionTitle>
            <Para>Swindon Airsoft operates a three-tier disciplinary card system to maintain a safe and fair playing environment for all participants. Cards may be issued by staff on game days or by admins for conduct off the field.</Para>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12, marginBottom:20 }}>
              {[
                { color:"rgba(200,160,0,.15)", border:"rgba(200,160,0,.4)", titleColor:"var(--gold)", icon:"🟡", title:"Yellow Card — Warning", desc:"A formal warning that the player must improve their conduct. The reason is communicated directly to the player. Continued violations after a Yellow Card may result in a Red Card ban. Yellow Cards do not restrict booking." },
                { color:"rgba(220,30,30,.12)", border:"rgba(220,30,30,.4)", titleColor:"var(--red)", icon:"🔴", title:"Red Card — 1 Game Day Ban", desc:"Issued for serious rule violations or repeated misconduct after a Yellow Card. The player is banned for one game day and cannot book future events until the ban is lifted by an admin. The reason will be provided." },
                { color:"rgba(60,60,60,.25)", border:"#555", titleColor:"#ccc", icon:"⚫", title:"Black Card — Suspension", desc:"Issued for severe or repeated misconduct. The player is suspended indefinitely. Booking is disabled. Reinstatement requires a direct review and approval by the site owner. The reason will be provided." },
              ].map(c => (
                <div key={c.title} style={{ background:c.color, border:`1px solid ${c.border}`, padding:"16px", borderRadius:4 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:c.titleColor, marginBottom:8 }}>{c.icon} {c.title}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>{c.desc}</div>
                </div>
              ))}
            </div>
            <InfoBox type="important">Players who have been issued a Red Card or Black Card will be unable to make event bookings. The reason for any card issued will always be communicated to the player. To appeal a card, please contact us directly.</InfoBox>

            <SectionTitle id="terms-reporting">10. Player Reporting System</SectionTitle>
            <Para>Swindon Airsoft provides a confidential player reporting system that allows registered players to report suspected cheating or deliberate rule-breaking by other players. Reports are submitted through the player profile area and are reviewed exclusively by our admin team.</Para>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12, marginBottom:20 }}>
              {[
                { icon:"🎥", title:"Video Evidence Required", desc:"All reports must include a link to clear video evidence demonstrating deliberate hit-not-calling or cheating behaviour. Reports without adequate video evidence will be dismissed without further action." },
                { icon:"🔒", title:"Strictly Confidential", desc:"The identity of the reporting player is known only to the admin team and will never be shared with the reported player or any other players. Reporters will not receive an update on the outcome of their report." },
                { icon:"⚖️", title:"Fair Review Process", desc:"All reports are reviewed fairly and objectively by our admin team. Video evidence is examined thoroughly before any action is taken. A report does not guarantee disciplinary action." },
                { icon:"🚩", title:"False Reports", desc:"Submitting a false or malicious report is itself a breach of our Code of Conduct. Players found to have submitted dishonest reports may themselves be subject to disciplinary action including card issuance." },
              ].map(c => (
                <div key={c.title} style={{ background:"rgba(239,83,80,.07)", border:"1px solid rgba(239,83,80,.25)", padding:"16px", borderRadius:4 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"#ef9a9a", marginBottom:8 }}>{c.icon} {c.title}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>{c.desc}</div>
                </div>
              ))}
            </div>

            <InfoBox type="warning">The reporting system exists to protect the fairness and integrity of our games. It is not a means of settling personal disputes. Reports relating to off-field disputes, social media conduct, or matters unrelated to gameplay rules will not be investigated through this system — please contact us directly for other concerns.</InfoBox>

            <BulletList items={[
              "You must be a registered player and logged in to submit a report.",
              "Reports can be submitted at any time through the 🚩 Report Player tab in your profile.",
              "Only one report per incident — please do not submit duplicate reports for the same event.",
              "Video evidence must clearly show the specific incident and must be accessible via the link provided.",
              "Outcomes of investigations are confidential and will not be disclosed to the reporting player.",
              "Admins may link a report to a player profile when issuing a card warning for documentary purposes.",
              "Swindon Airsoft reserves the right to dismiss any report that does not meet evidence requirements.",
            ]} />

            <SectionTitle id="terms-9">11. Governing Law</SectionTitle>
            <InfoBox type="info">These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</InfoBox>
          </div>
        )}

        {/* ══ BOOKINGS & CANCELLATIONS ══ */}
        {activeSection === "bookings" && (
          <div>
            <SectionTitle id="booking-1">1. Booking Policy</SectionTitle>
            <Para>All event bookings are made through this platform and are confirmed upon receipt of full payment via Square. Booking confirmation and a Field Pass will be sent to your registered email address. Please bring your Field Pass (printed or on your phone) to the event.</Para>
            <BulletList items={[
              "Bookings are personal and non-transferable.",
              "Arrival at least 15 minutes before the stated event start time is required for check-in and safety briefing.",
              "Players who arrive after the safety briefing has begun may be refused entry — no refund will be issued in this circumstance.",
              "Swindon Airsoft reserves the right to cancel or reschedule events due to weather, low attendance, or circumstances beyond our control.",
              "In the event of a cancellation by Swindon Airsoft, a full refund or credit will be issued.",
            ]} />

            <SectionTitle id="booking-2">2. Cancellation Policy</SectionTitle>
            <InfoBox type="important">Cancellations are managed through your Profile → Bookings tab. You can cancel any upcoming booking that has not yet been checked in.</InfoBox>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))", gap:12, marginBottom:20 }}>
              {[
                { title:"More than 48 hours before event", icon:"✅", color:"#c8ff00", bg:"rgba(200,255,0,.05)", border:"rgba(200,255,0,.2)", items:["Walk-on bookings: full refund to original payment method", "Rental bookings: 90% refund (10% rental processing fee retained)", "Refund issued to original payment method within 3–5 business days"] },
                { title:"24–48 hours before event", icon:"⏱", color:"var(--gold)", bg:"rgba(200,150,0,.06)", border:"rgba(200,150,0,.25)", items:["Walk-on bookings: full amount issued as Game Day Credits", "Rental bookings: 90% issued as Game Day Credits (10% fee retained)", "Credits are added to your account instantly and can be used on future bookings"] },
                { title:"Within 24 hours of event", icon:"🚫", color:"var(--red)", bg:"rgba(255,60,60,.05)", border:"rgba(255,60,60,.2)", items:["Cancellations are not permitted within 24 hours of the event", "The Cancel Booking button will be unavailable in your profile", "In exceptional circumstances please contact us directly"] },
              ].map(box => (
                <div key={box.title} style={{ background:box.bg, border:"1px solid " + box.border, padding:16 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:".1em", color:box.color, textTransform:"uppercase", marginBottom:10 }}>{box.icon} {box.title}</div>
                  <ul style={{ listStyle:"none", padding:0, margin:0 }}>
                    {box.items.map((item, i) => (
                      <li key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"3px 0", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>
                        <span style={{ color:box.color, flexShrink:0 }}>▸</span><span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <SectionTitle id="booking-3">3. Rental Booking Fee</SectionTitle>
            <Para>A 10% processing fee is retained on all rental booking cancellations, regardless of the notice given. This covers the cost of reserving and preparing rental equipment. This fee applies to the base rental cost only and does not apply to walk-on ticket cancellations.</Para>

            <SectionTitle id="booking-4">4. Game Day Credits</SectionTitle>
            <Para>Game Day Credits are issued as a goodwill gesture for late cancellations and in certain other circumstances at Swindon Airsoft's discretion. Credits are:</Para>
            <BulletList items={[
              "Valid for use on future Swindon Airsoft event bookings only.",
              "Non-transferable and have no cash value.",
              "Applied automatically at checkout when booking your next event.",
              "Not applicable to VIP membership fees.",
              "Valid for 12 months from the date of issue — please contact us if credits are nearing expiry.",
            ]} />

            <SectionTitle id="booking-5">5. Event Cancellations by Swindon Airsoft</SectionTitle>
            <Para>In the unlikely event that Swindon Airsoft must cancel an event, all players with confirmed bookings will be notified by email as soon as possible. You will be offered either a full refund to your original payment method or the option to transfer your booking to the next available event date.</Para>
            <InfoBox type="warning">Swindon Airsoft cannot be held responsible for travel costs, accommodation, or other expenses incurred by players in connection with an event that is subsequently cancelled or rescheduled.</InfoBox>

            <SectionTitle id="booking-6">6. Event Waitlist</SectionTitle>
            <Para>When an event is fully booked, registered players can join the waitlist through the Events page. The waitlist operates in queue order — each player is offered the slot individually and given 30 minutes to complete their booking. Joining the waitlist does not constitute a booking and does not guarantee a place at the event.</Para>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,220px),1fr))", gap:12, marginBottom:20 }}>
              {[
                { icon:"🔔", title:"How It Works", desc:"When a slot opens — due to a cancellation or added capacity — the first player in the queue is notified by email and their slot is exclusively reserved for 30 minutes. If they don't book within that window, the slot is offered to the next person in line." },
                { icon:"⏱", title:"30-Minute Hold", desc:"Once notified, you have exactly 30 minutes to complete your booking. During this window the slot is locked exclusively for you — no other player can take it. After 30 minutes the slot moves to the next person on the waitlist, or opens to everyone if there is no one else waiting." },
                { icon:"📧", title:"Notification", desc:"Your notification is sent to your registered email address only. You will also see your reserved slot highlighted on the Events page while the hold is active. It is your responsibility to ensure your email is correct and not filtered to spam." },
                { icon:"🚫", title:"Eligibility", desc:"You must have a valid waiver signed for the current year to join or be offered a waitlist place. Players with a Red Card or Black Card suspension cannot join the waitlist." },
              ].map(c => (
                <div key={c.title} style={{ background:"rgba(79,195,247,.05)", border:"1px solid rgba(79,195,247,.18)", padding:"16px", borderRadius:4 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"#4fc3f7", marginBottom:8 }}>{c.icon} {c.title}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>{c.desc}</div>
                </div>
              ))}
            </div>

            <BulletList items={[
              "You can join the waitlist for both Walk-On and Rental ticket types independently.",
              "You may only hold one waitlist position per ticket type per event.",
              "You can leave the waitlist at any time via the Waitlist tab in your profile.",
              "When it is your turn, you will receive an email and your slot will appear highlighted on the Events page with a timer showing how long you have left.",
              "If you do not complete your booking within 30 minutes, your hold expires and the slot is offered to the next person on the waitlist.",
              "If there is no waitlist, a slot that opens will be available to book immediately by anyone.",
              "Being on the waitlist for one event does not affect your ability to book other events.",
              "Swindon Airsoft does not guarantee that a waitlisted player will ever receive a slot — this depends entirely on cancellations and capacity.",
              "Swindon Airsoft accepts no liability if a notification is not received due to spam filters or incorrect email details.",
            ]} />

            <InfoBox type="important">When your slot is held, you will see it marked as reserved on the Events page with a 30-minute countdown. Book before the timer runs out — once it expires the slot automatically moves to the next player in the queue.</InfoBox>
          </div>
        )}

        {/* ══ SHOP & ORDERS ══ */}
        {activeSection === "shop" && (
          <div>
            <SectionTitle id="shop-1">1. Shop Terms</SectionTitle>
            <Para>All shop purchases are processed securely via Square. Prices displayed include VAT where applicable. Swindon Airsoft reserves the right to amend prices without notice. All orders are subject to availability.</Para>

            <SectionTitle id="shop-2">2. Delivery & Postage</SectionTitle>
            <BulletList items={[
              "Standard UK postage is available on most items. Postage costs are displayed at checkout.",
              "Some items are marked 'Collection Only' and must be collected at a game day — these cannot be posted.",
              "Estimated delivery times are 3–5 working days from dispatch. Swindon Airsoft is not responsible for delays caused by Royal Mail or third-party couriers.",
              "A tracking number will be emailed once your order has been dispatched.",
              "International orders are not currently available.",
            ]} />

            <SectionTitle id="shop-3">3. Returns & Refunds</SectionTitle>
            <Para>We want you to be happy with your purchase. If you have any issue with an order, please use the return request feature on your order within 14 days of receipt. Do not send any items back until your return has been approved — unapproved returns cannot be processed.</Para>

            <InfoBox type="important">All items submitted for return must be in unused condition and in all original packaging where possible. Deductions will be made from any refund for items that have been opened, used, or are missing original packaging. The deduction amount will reflect the reduction in resale value.</InfoBox>

            <BulletList items={[
              "Faulty or incorrect items will be replaced or refunded in full, including postage costs — please include a description of the fault when submitting your return request.",
              "Change-of-mind returns are accepted within 14 days provided items are in unused condition and in their original packaging. Opened or used items may be subject to a partial refund at our discretion.",
              "BBs, gas canisters, and other consumable items are non-returnable once opened, for hygiene and safety reasons.",
              "Items showing signs of use, wear, or damage that was not present at the time of dispatch will be subject to a deduction from the refund amount.",
              "Refunds are issued to the original payment method within 5–10 business days of the return being received and inspected.",
              "Return postage costs are the responsibility of the customer unless the item is faulty or incorrect.",
              "A return reference number (RMA) is generated when you submit a request — include this on the outside of your parcel.",
            ]} />

            <SectionTitle id="shop-4">4. VIP Discounts in the Shop</SectionTitle>
            <Para>Active VIP members receive a 10% discount on all game day bookings and a 10% discount at Airsoft Armoury UK (airsoftarmoury.uk). The game day discount is applied automatically at checkout when logged in with an active VIP membership. The Airsoft Armoury UK discount is available via a code provided to VIP members.</Para>

            <InfoBox type="info">If you experience any issues with an order, please use the Contact page to get in touch. Include your order reference number for the fastest resolution.</InfoBox>
          </div>
        )}

        {/* ══ LIABILITY WAIVER ══ */}
        {activeSection === "waiver" && (
          <div>
            <InfoBox type="warning">The liability waiver must be completed once per calendar year before your first booking. It is completed digitally through your Profile page after registering an account.</InfoBox>

            <SectionTitle id="waiver-1">1. Waiver Summary</SectionTitle>
            <Para>By completing the liability waiver, you acknowledge and agree to the following key points. The full waiver text is presented during the digital signing process.</Para>

            <BulletList items={[
              "Airsoft is a physical sport and carries inherent risks of injury. You voluntarily assume these risks.",
              "You confirm you have no medical conditions that would make participation dangerous without informing site staff.",
              "You release Swindon Airsoft, its staff, and marshals from liability for injury or loss sustained during participation, except where caused by gross negligence.",
              "You confirm you are 18 or over, or that a parent/legal guardian has signed on your behalf.",
              "The waiver must be re-signed at the start of each new calendar year.",
            ]} />

            <SectionTitle id="waiver-2">2. Waiver for Minors</SectionTitle>
            <Para>Players must be at least 12 years old to participate. Players under 14 must have a parent or guardian present and playing with them, and a waiver must be completed on their behalf. Players aged 14–17 must have a parent or guardian's written consent before attending, and a waiver must be completed on their behalf. In all cases, the parent or guardian accepts full responsibility for the minor throughout the event.</Para>

            <SectionTitle id="waiver-3">3. Medical Information</SectionTitle>
            <Para>If you have any medical conditions, disabilities, or are taking medication that may affect your ability to participate safely, you must inform a marshal before the event begins. Swindon Airsoft will make reasonable efforts to accommodate participants but reserves the right to refuse participation on safety grounds.</Para>

            <InfoBox type="info">To sign or review your waiver, go to your <button onClick={() => setPage("profile")} style={{ background:"none", border:"none", color:"#c8ff00", cursor:"pointer", padding:0, fontFamily:"'Share Tech Mono',monospace", fontSize:12, textDecoration:"underline" }}>Profile → Waiver tab</button>.</InfoBox>
          </div>
        )}

        {/* ══ PRIVACY POLICY ══ */}
        {activeSection === "privacy" && (
          <div>
            <InfoBox type="info">Swindon Airsoft is committed to protecting your personal data in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</InfoBox>

            <SectionTitle id="privacy-1">1. What Data We Collect</SectionTitle>
            <Para>We collect the following personal data when you register and use this platform:</Para>
            <BulletList items={[
              "Name, email address, and phone number provided during registration.",
              "Address details provided for shop order delivery.",
              "Date of birth (where provided) for age verification purposes.",
              "Payment references — we do not store full card details; payments are processed securely by Square.",
              "Booking history, event attendance records, and check-in data.",
              "Liability waiver data including signature, date, and confirmation of agreement.",
              "UKARA registration number (if applicable, for VIP members).",
              "Profile photograph (if uploaded by you).",
              "Communication records — contact form messages sent through this platform.",
            ]} />

            <SectionTitle id="privacy-2">2. How We Use Your Data</SectionTitle>
            <BulletList items={[
              "To process and manage your event bookings and shop orders.",
              "To send booking confirmations, dispatch notifications, and event reminders by email.",
              "To maintain your liability waiver record as required for insurance and legal compliance.",
              "To administer VIP membership, game credits, and loyalty benefits.",
              "To verify eligibility to purchase RIFs (UKARA compliance).",
              "To respond to contact form enquiries and support requests.",
              "To improve the platform and our services through anonymised analytics.",
            ]} />

            <SectionTitle id="privacy-3">3. Who We Share Data With</SectionTitle>
            <Para>We do not sell your personal data to third parties. We share data only where necessary:</Para>
            <BulletList items={[
              "Square — payment processing. Square's own privacy policy applies to payment transactions.",
              "Supabase — our secure cloud database provider, hosting data within the EU/UK.",
              "Email service providers — for sending transactional emails (booking confirmations etc.).",
              "Legal authorities — if required by law or to prevent fraud or harm.",
            ]} />

            <SectionTitle id="privacy-4">4. How Long We Keep Your Data</SectionTitle>
            <BulletList items={[
              "Account and profile data is retained for as long as your account is active.",
              "Booking and payment records are retained for 7 years for accounting and legal compliance.",
              "Waiver records are retained for a minimum of 3 years following the last participation date.",
              "Contact form messages are retained for 12 months.",
            ]} />

            <SectionTitle id="privacy-5">5. Your Rights</SectionTitle>
            <Para>Under UK GDPR you have the following rights regarding your personal data:</Para>
            <BulletList items={[
              "Right of access — you can request a copy of the data we hold about you.",
              "Right to rectification — you can correct inaccurate data through your Profile page or by contacting us.",
              "Right to erasure — you can request deletion of your account and data. Note that some records (booking history, waiver records) may need to be retained for legal compliance.",
              "Right to object — you can object to processing based on legitimate interests.",
              "Right to data portability — you can request your data in a portable format.",
            ]} />
            <Para>To exercise any of these rights, or if you have a complaint about how we handle your data, please use the Contact page. You also have the right to lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk.</Para>

            <SectionTitle id="privacy-6">6. Cookies & Analytics</SectionTitle>
            <Para>This platform uses browser session storage for functional purposes only (e.g. keeping you logged in). We do not use advertising cookies or third-party tracking. Basic anonymised analytics may be collected by our hosting provider (Vercel) — please refer to Vercel's privacy policy for details.</Para>

            <SectionTitle id="privacy-7">7. Data Controller Contact</SectionTitle>
            <InfoBox type="important">
              For any data protection queries, contact us via the <button onClick={() => setPage("contact")} style={{ background:"none", border:"none", color:"#c8ff00", cursor:"pointer", padding:0, fontFamily:"'Share Tech Mono',monospace", fontSize:12, textDecoration:"underline" }}>Contact page</button> and mark your message as "Data Protection Enquiry". We will respond within 30 days.
            </InfoBox>

            <Divider />
            <Para style={{ color:"#3a5010", fontSize:11 }}>This privacy policy was last reviewed in {new Date().toLocaleDateString("en-GB", { month:"long", year:"numeric" })}. We will notify registered users of any material changes via email.</Para>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

// ── Admin UKARA Applications ───────────────────────────────────
