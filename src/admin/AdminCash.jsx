// admin/AdminCash.jsx — cash takings log
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtDate, gmtShort } from "../utils";
import { logAction } from "./adminHelpers";

function AdminCash({ data, cu, showToast }) {
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

export { AdminCash };
