// pages/PlayerOrders.jsx — ReturnRequestBlock, CustomerOrderDetail, PlayerOrders
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtDate, gmtShort, TrackingBlock, useMobile } from "../utils";

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


export { ReturnRequestBlock, CustomerOrderDetail, PlayerOrders };
