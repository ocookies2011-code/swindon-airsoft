// admin/AdminOrders.jsx — order fulfilment, dispatch, returns
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { AdminTrackStatusCell, DesignationInsignia, GmtClock, QRScanner, RankInsignia, TrackingBlock, WaiverModal, detectCourier, fmtDate, fmtErr, gmtShort, renderMd, resetSquareConfig, sendAdminOrderNotification, sendAdminReturnNotification, sendDispatchEmail, sendReturnDecisionEmail, stockLabel, uid, useMobile } from "../utils";
import { squareRefund, waitlistApi, holdApi, normaliseProfile } from "../api";

import { logAction } from "./adminHelpers";

function AdminOrdersInline({ showToast, cu }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [trackingModal, setTrackingModal] = useState(null);
  const STATUS_COLORS = { pending: "blue", processing: "gold", dispatched: "green", completed: "teal", cancelled: "red", return_requested: "gold", return_approved: "blue", return_received: "teal" };
  const mounted = useRef(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await api.shopOrders.getAll();
      const priority = { pending: 0, return_requested: 1, processing: 2, dispatched: 3, return_approved: 4, return_received: 5, completed: 6, cancelled: 7 };
      result.sort((a, b) => {
        const pa = priority[a.status] ?? 99, pb = priority[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at) - new Date(a.created_at);
      });
      if (mounted.current) setOrders(result);
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchOrders(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted.current = false; clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [fetchOrders]);

  const doDispatch = async (id, tracking, isUpdate = false) => {
    try {
      await api.shopOrders.updateStatus(id, isUpdate ? (orders.find(o=>o.id===id)?.status || "dispatched") : "dispatched", tracking || null);
      setOrders(o => o.map(x => x.id === id ? { ...x, status: isUpdate ? x.status : "dispatched", tracking_number: tracking || null } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status: isUpdate ? d.status : "dispatched", tracking_number: tracking || null }));
      const order = orders.find(o => o.id === id);
      showToast(isUpdate ? "Tracking number updated!" : "Order marked as dispatched!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: isUpdate ? "Order tracking updated" : "Order dispatched", detail: `Order #${id} | Customer: ${order?.customer_name || "?"} | Total: £${Number(order?.total || 0).toFixed(2)} | Tracking: ${tracking || "none"}` });
      const toEmail = order?.customer_email || order?.customerEmail;
      if (toEmail && !isUpdate) {
        sendDispatchEmail({
          toEmail,
          toName:  order.customer_name || order.customerName || "Customer",
          order:   { ...order, customerAddress: order.customer_address || order.customerAddress || "" },
          items:   Array.isArray(order.items) ? order.items : [],
          tracking: tracking || null,
        }).then(() => showToast("📧 Dispatch email sent!")).catch(e => showToast("⚠️ Email failed: " + (e?.message || e?.text || JSON.stringify(e)), "red"));
      }
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    setTrackingModal(null);
  };

  const setStatus = async (id, status) => {
    if (status === "dispatched") { setTrackingModal({ id, tracking: "" }); return; }
    try {
      const oldOrder = orders.find(o => o.id === id);
      await api.shopOrders.updateStatus(id, status);
      setOrders(o => o.map(x => x.id === id ? { ...x, status } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status }));
      showToast("Status updated!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Order status updated", detail: `Order #${id} | Customer: ${oldOrder?.customer_name || "?"} | ${oldOrder?.status || "?"} → ${status}` });
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const [refundModal, setRefundModal] = useState(null); // { order }
  const [refundAmt, setRefundAmt] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refunding, setRefunding] = useState(false);

  // Returns
  const [returnModal, setReturnModal] = useState(null); // { order }
  const [returnAction, setReturnAction] = useState(""); // "approve" | "reject" | "received"
  const [rejectionReason, setRejectionReason] = useState("");
  const [returnsProcessing, setReturnsProcessing] = useState(false);

  const handleReturnAction = async () => {
    if (!returnModal) return;
    const { order } = returnModal;
    setReturnsProcessing(true);
    try {
      let newStatus = order.status;
      if (returnAction === "approve")   newStatus = "return_approved";
      if (returnAction === "reject")    newStatus = "completed";
      if (returnAction === "received")  newStatus = "return_received";

      // Save rejection reason to DB if rejecting
      if (returnAction === "reject" && rejectionReason.trim()) {
        await supabase.from("shop_orders").update({ status: newStatus, return_rejection_reason: rejectionReason.trim() }).eq("id", order.id);
      } else {
        await api.shopOrders.updateStatus(order.id, newStatus);
      }

      const updatedOrder = { ...order, status: newStatus, return_rejection_reason: returnAction === "reject" ? rejectionReason.trim() || null : order.return_rejection_reason };
      setOrders(o => o.map(x => x.id === order.id ? updatedOrder : x));
      if (detail?.id === order.id) setDetail(d => ({ ...d, ...updatedOrder }));

      // Send customer email for approve/reject
      const toEmail = order.customer_email || order.customerEmail;
      const toName  = order.customer_name  || order.customerName || "Customer";
      if (toEmail && (returnAction === "approve" || returnAction === "reject")) {
        sendReturnDecisionEmail({
          toEmail, toName, order,
          approved: returnAction === "approve",
          rejectionReason: returnAction === "reject" ? rejectionReason.trim() || null : null,
        }).then(() => showToast("📧 Customer notified by email.")).catch(() => {});
      }

      showToast(returnAction === "approve" ? "✅ Return approved — customer notified." : returnAction === "received" ? "📦 Return marked as received." : "Return request rejected.");
      const _retLabel = returnAction === "approve" ? "Return approved" : returnAction === "received" ? "Return marked received" : "Return rejected";
      const _retParts = [`Order #${order.id}`, `Customer: ${order.customer_name || "?"}`, `Items: ${Array.isArray(order.items) ? order.items.map(i => `${i.name} x${i.qty}`).join(", ") : "?"}`, `Total: £${Number(order.total || 0).toFixed(2)}`];
      if (returnAction === "reject" && rejectionReason.trim()) _retParts.push(`Reason: ${rejectionReason.trim()}`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: _retLabel, detail: _retParts.join(" | ") });
      setRejectionReason("");
      setReturnModal(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setReturnsProcessing(false); }
  };

  const openRefund = (order) => {
    setRefundModal({ order });
    setRefundAmt(Number(order.total || 0).toFixed(2));
    setRefundNote("");
  };

  const doRefund = async () => {
    if (!refundModal) return;
    const { order } = refundModal;
    const amt = parseFloat(refundAmt);
    if (isNaN(amt) || amt <= 0) { showToast("Enter a valid refund amount", "red"); return; }
    if (amt > Number(order.total)) { showToast("Refund amount exceeds order total", "red"); return; }
    setRefunding(true);
    try {
      if (!order.paypal_order_id && !order.square_order_id) throw new Error("No payment ID on this order — cannot issue automatic refund. Refund manually in your Square Dashboard.");
      const locationId = await api.settings.get("square_location_id");
      const isFullRefund = Math.abs(amt - Number(order.total)) < 0.01;
      await squareRefund({ squarePaymentId: order.square_order_id || order.paypal_order_id, amount: isFullRefund ? null : amt, locationId });
      await api.shopOrders.saveRefund(order.id, amt, refundNote || null);
      setOrders(o => o.map(x => x.id === order.id ? { ...x, status: "refunded", refund_amount: amt, refunded_at: new Date().toISOString() } : x));
      if (detail?.id === order.id) setDetail(d => ({ ...d, status: "refunded", refund_amount: amt, refunded_at: new Date().toISOString() }));
      showToast("✅ Refund of £" + amt.toFixed(2) + " issued via Square!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Order refunded", detail: `Order #${order.id} | Customer: ${order.customer_name || "?"} | Items: ${Array.isArray(order.items) ? order.items.map(i => `${i.name} x${i.qty}`).join(", ") : "?"} | Refund: £${amt.toFixed(2)}${refundNote ? ` | Note: ${refundNote}` : ""}` });
      setRefundModal(null);
    } catch (e) {
      showToast("❌ Refund failed: " + (e.message || String(e)), "red");
    } finally { setRefunding(false); }
  };
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const [statusTab, setStatusTab] = useState("action");

  // Smart grouped tabs — most admins only care about 4 views
  const SMART_TABS = [
    { id: "action",     label: "Needs Action",  statuses: ["pending", "return_requested"],                       color: "var(--red)" },
    { id: "progress",   label: "In Progress",   statuses: ["processing", "dispatched", "return_approved", "return_received"], color: "var(--gold)" },
    { id: "completed",  label: "Completed",     statuses: ["completed", "cancelled", "refunded"],                color: "var(--accent)" },
    { id: "all",        label: "All Orders",    statuses: null,                                                  color: "var(--muted)" },
  ];

  const isTerminalOrder = (o) => o.postage_name === null && Number(o.postage) === 0 && o.square_order_id;
  const visibleOrders = useMemo(() => {
    const tab = SMART_TABS.find(t => t.id === statusTab);
    if (!tab || tab.statuses === null) return orders;
    return orders.filter(o => tab.statuses.includes(o.status));
  }, [orders, statusTab]);

  const returnCount = orders.filter(o => o.status === "return_requested").length;
  const actionCount = orders.filter(o => ["pending","return_requested"].includes(o.status)).length;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <div style={{ fontSize:13, color:"var(--muted)" }}>{orders.length} orders · <span style={{ color:"var(--accent)" }}>£{totalRevenue.toFixed(2)}</span> total</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchOrders} disabled={loading}>🔄 Refresh</button>
      </div>
      {returnCount > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="hazard-stripe red" />
          <div className="alert-hazard red" style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            onClick={() => setStatusTab("action")}>
            <div>
              <div className="alert-hazard-label">⚠ ACTION REQUIRED</div>
              <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 2 }}>{returnCount} return request{returnCount > 1 ? "s" : ""} awaiting your decision</div>
            </div>
            <span style={{ fontSize: 11, color: "var(--red)", fontFamily: "'Share Tech Mono',monospace" }}>VIEW →</span>
          </div>
        </div>
      )}
      <div className="grid-4 mb-2">
        {[
          { label: "Total Orders", val: orders.length, color: "" },
          { label: "Needs Action", val: actionCount, color: actionCount > 0 ? "red" : "", onClick: () => setStatusTab("action") },
          { label: "Dispatched",   val: orders.filter(o => o.status === "dispatched").length, color: "gold" },
          { label: "Returns",      val: returnCount, color: returnCount > 0 ? "red" : "", onClick: () => setStatusTab("action") },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`} style={{ cursor: s.onClick ? "pointer" : "default" }} onClick={s.onClick}>
            <div className="stat-val">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {SMART_TABS.map(t => {
          const cnt = t.statuses === null ? orders.length : orders.filter(o => t.statuses.includes(o.status)).length;
          const isActive = statusTab === t.id;
          const urgent = t.id === "action" && actionCount > 0;
          return (
            <button key={t.id} onClick={() => setStatusTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", cursor: "pointer",
              fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 12,
              letterSpacing: ".1em", textTransform: "uppercase", transition: "all .15s",
              background: isActive ? (urgent ? "var(--red)" : t.id === "completed" ? "rgba(200,255,0,.15)" : "rgba(255,255,255,.1)") : "rgba(255,255,255,.05)",
              color: isActive ? (urgent ? "#fff" : t.id === "completed" ? "var(--accent)" : "#fff") : urgent ? "var(--red)" : "var(--muted)",
              border: isActive ? `1px solid ${urgent ? "var(--red)" : t.id === "completed" ? "var(--accent)" : "rgba(255,255,255,.2)"}` : `1px solid ${urgent ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.08)"}`,
              clipPath: "polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",
            }}>
              {t.label}
              {cnt > 0 && (
                <span style={{
                  background: urgent && !isActive ? "var(--red)" : isActive ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.1)",
                  color: urgent && !isActive ? "#fff" : "inherit",
                  borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 800,
                }}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>
      {loading ? (
        <div className="card" style={{ textAlign:"center", color:"var(--muted)", padding:40 }}>Loading orders…</div>
      ) : error ? (
        <div className="card" style={{ textAlign:"center", padding:40 }}>
          <div style={{ color:"var(--red)", marginBottom:12 }}>Failed: {error}</div>
          <button className="btn btn-ghost" onClick={fetchOrders}>Retry</button>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Order ID</th><th>Date</th><th>Customer</th><th>Items</th><th>Postage</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleOrders.length === 0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--muted)", padding:30 }}>No {statusTab === "all" ? "" : statusTab + " "}orders yet</td></tr>}
              {visibleOrders.map(o => {
                const items = Array.isArray(o.items) ? o.items : [];
                const isPending = o.status === "pending";
                const isReturn = o.status === "return_requested";
                const rowAccent = isPending ? "rgba(59,130,246,.06)" : isReturn ? "rgba(239,68,68,.06)" : "transparent";
                const rowBorder = isPending ? "rgba(59,130,246,.15)" : isReturn ? "rgba(239,68,68,.15)" : "transparent";
                return (
                  <tr key={o.id} style={{ background: rowAccent, borderLeft: `3px solid ${rowBorder}` }}>
                    <td className="mono" style={{ fontSize:10, color:"var(--muted)" }}>#{(o.id||"").slice(-8).toUpperCase()}</td>
                    <td className="mono" style={{ fontSize:11 }}>{gmtShort(o.created_at)}</td>
                    <td style={{ fontWeight:600 }}>
                      <button style={{ background:"none", border:"none", color:"var(--blue)", cursor:"pointer", fontWeight:700, fontFamily:"inherit", fontSize:13 }} onClick={() => setDetail(o)}>{o.customer_name}</button>
                    </td>
                    <td style={{ fontSize:12, color:"var(--muted)" }}>{items.map(i => `${i.name} ×${i.qty}`).join(", ")}</td>
                    <td style={{ fontSize:12 }}>{o.postage_name || "—"}</td>
                    <td className="text-green">£{Number(o.total).toFixed(2)}</td>
                    <td>
                      {o.tracking_number
                        ? (() => {
                            const { courier, trackUrl } = detectCourier(o.tracking_number);
                            return (
                              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                                {/* Live status badge — replaces order status when tracking data is available */}
                                <AdminTrackStatusCell
                                  trackingNumber={o.tracking_number}
                                  courier={courier}
                                />
                                <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#c8ff00", letterSpacing:".05em" }}>
                                    📮 {o.tracking_number.trim()}
                                  </span>
                                  {courier && <span style={{ fontSize:9, color:"var(--muted)" }}>({courier})</span>}
                                  {trackUrl && (
                                    <a href={trackUrl} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize:9, color:"#4fc3f7", textDecoration:"none", fontWeight:700, letterSpacing:".05em" }}
                                      onClick={e => e.stopPropagation()}>↗ TRACK</a>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        : <span className={`tag tag-${STATUS_COLORS[o.status] || "blue"}`}>{o.status}</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {o.status === "pending" && (
                          <button className="btn btn-sm btn-primary" style={{ fontSize: 10, padding: "4px 10px" }}
                            onClick={() => setStatus(o.id, "processing")}>▶ Process</button>
                        )}
                        {(o.status === "pending" || o.status === "processing") && (
                          <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 10px", background: "rgba(200,255,0,.12)", border: "1px solid rgba(200,255,0,.3)", color: "var(--accent)" }}
                            onClick={() => setTrackingModal({ id: o.id, tracking: "" })}>📦 Dispatch</button>
                        )}
                        {o.status === "return_requested" && (
                          <>
                            <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px", background: "rgba(200,255,0,.1)", border: "1px solid rgba(200,255,0,.3)", color: "var(--accent)" }}
                              onClick={() => { setReturnModal({ order: o }); setReturnAction("approve"); }}>✓ Approve</button>
                            <button className="btn btn-sm" style={{ fontSize: 10, padding: "4px 8px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "var(--red)" }}
                              onClick={() => { setReturnModal({ order: o }); setReturnAction("reject"); }}>✗ Reject</button>
                          </>
                        )}
                        {o.status === "dispatched" && (
                          <button className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }}
                            onClick={() => setStatus(o.id, "completed")}>✓ Complete</button>
                        )}
                        <button className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }}
                          onClick={() => setDetail(o)}>Details</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, flexWrap:"wrap", gap:10 }}>
              <div className="modal-title" style={{ margin:0 }}>📦 Order Details</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", marginTop:2 }}>#{(detail.id||"").slice(-8).toUpperCase()}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const addr = detail.customer_address || "No address on file";
                const items = (Array.isArray(detail.items) ? detail.items : []).map(i => `${i.name} x${i.qty}`).join(", ");
                const win = window.open("", "_blank", "width=400,height=300");
                win.document.write(`<html><head><title>Postage Label</title><style>body{font-family:Arial,sans-serif;padding:24px;border:3px solid #000;margin:20px;}.to{font-size:22px;font-weight:bold;margin:16px 0 8px;}.addr{font-size:16px;line-height:1.6;white-space:pre-line;}.from{font-size:11px;color:#555;margin-top:20px;border-top:1px solid #ccc;padding-top:10px;}@media print{body{margin:0;border:none;}}</style></head><body><div style="font-size:11px;color:#888;">ORDER #${detail.id?.slice(-8).toUpperCase()} · ${gmtShort(detail.created_at)}</div><div class="to">TO:</div><div style="font-size:20px;font-weight:bold;">${detail.customer_name}</div><div class="addr">${addr}</div><img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" style="height:36px;width:auto;display:block;margin-bottom:4px;" /><div class="from">FROM: Swindon Airsoft</div><script>window.onload=()=>window.print();<\/script></body></html>`);
                win.document.close();
              }}>🖨️ Print Label</button>
            </div>
            <div className="grid-2 mb-2">
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>CUSTOMER</div><div style={{ fontWeight:700 }}>{detail.customer_name}</div></div>
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>EMAIL</div><div style={{ fontSize:13 }}>{detail.customer_email || "—"}</div></div>
              <div style={{ gridColumn:"1 / -1" }}>
                <div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>SHIPPING ADDRESS</div>
                <div style={{ fontSize:13, whiteSpace:"pre-line", background:"var(--bg4)", padding:"10px 12px", borderRadius:3, border:"1px solid var(--border)" }}>{detail.customer_address || <span style={{ color:"var(--muted)" }}>No address on file</span>}</div>
              </div>
              {detail.valid_defence && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>🪪 VALID DEFENCE</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, fontWeight:700, background:"rgba(200,255,0,.04)", padding:"8px 12px", borderRadius:3, border:"1px solid rgba(200,255,0,.18)", color:"var(--accent)" }}>{detail.valid_defence}</div>
                </div>
              )}
              {detail.tracking_number && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={{ fontSize:11, color:"var(--muted)", marginBottom:6 }}>📮 TRACKING NUMBER</div>
                  <TrackingBlock trackingNumber={detail.tracking_number} adminMode />
                  <button className="btn btn-sm btn-ghost" style={{ marginTop:6 }}
                    onClick={() => setTrackingModal({ id: detail.id, tracking: detail.tracking_number || "", isUpdate: true })}>
                    ✏️ Update tracking number
                  </button>
                </div>
              )}
              {!detail.tracking_number && detail.status === "dispatched" && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => setTrackingModal({ id: detail.id, tracking: "", isUpdate: true })}>
                    📮 Add tracking number
                  </button>
                </div>
              )}
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>STATUS</div>
                <select value={detail.status} onChange={e => setStatus(detail.id, e.target.value)}
                  style={{ fontSize:12, padding:"6px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:3, width:"100%" }}>
                  {["pending","processing","dispatched","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--muted)", marginBottom:8, letterSpacing:".1em" }}>ITEMS</div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                {(Array.isArray(detail.items) ? detail.items : []).map((i, idx) => (
                  <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>£{Number(i.price).toFixed(2)}</td><td className="text-green">£{(Number(i.price)*i.qty).toFixed(2)}</td></tr>
                ))}
                {detail.discount_code && (
                  <tr style={{ color: "var(--accent)" }}>
                    <td colSpan={3} style={{ fontWeight: 700 }}>🏷️ Discount Code ({detail.discount_code})</td>
                    <td style={{ fontWeight: 700 }}>−£{Number(detail.discount_saving || 0).toFixed(2)}</td>
                  </tr>
                )}
                <tr style={{ borderTop:"2px solid var(--border)" }}>
                  <td colSpan={3} style={{ fontWeight:700 }}>Postage ({detail.postage_name})</td>
                  <td>£{Number(detail.postage).toFixed(2)}</td>
                </tr>
                <tr><td colSpan={3} style={{ fontWeight:900, fontSize:15 }}>TOTAL</td><td className="text-green" style={{ fontWeight:900, fontSize:15 }}>£{Number(detail.total).toFixed(2)}</td></tr>
              </tbody>
            </table></div>
              {/* Refund section */}
              {detail.refund_amount && (
                <div style={{ background:"rgba(255,60,60,.05)", border:"1px solid rgba(255,60,60,.2)", borderRadius:3, padding:"10px 14px", marginTop:12 }}>
                  <div style={{ fontSize:11, color:"var(--red)", fontWeight:700, letterSpacing:".08em", marginBottom:4 }}>💸 REFUNDED</div>
                  <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                    <div><span style={{ fontSize:11, color:"var(--muted)" }}>Amount: </span><span style={{ fontWeight:700, color:"var(--red)" }}>£{Number(detail.refund_amount).toFixed(2)}</span></div>
                    {detail.refunded_at && <div><span style={{ fontSize:11, color:"var(--muted)" }}>Date: </span><span style={{ fontSize:12 }}>{gmtShort(detail.refunded_at)}</span></div>}
                    {detail.refund_note && <div><span style={{ fontSize:11, color:"var(--muted)" }}>Note: </span><span style={{ fontSize:12 }}>{detail.refund_note}</span></div>}
                  </div>
                </div>
              )}
                        <div className="gap-2 mt-2">
              {!detail.refund_amount && (detail.paypal_order_id || detail.square_order_id) && (
                <button className="btn btn-sm" style={{ background:"rgba(255,60,60,.12)", border:"1px solid rgba(255,60,60,.35)", color:"var(--red)" }}
                  onClick={() => openRefund(detail)}>💸 Refund Order</button>
              )}
              {detail.status === "return_requested" && (
                <>
                  <button className="btn btn-sm" style={{ background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00" }}
                    onClick={() => { setReturnModal({ order: detail }); setReturnAction("approve"); }}>✅ Approve Return</button>
                  <button className="btn btn-sm" style={{ background:"rgba(255,60,60,.1)", border:"1px solid rgba(255,60,60,.3)", color:"var(--red)" }}
                    onClick={() => { setReturnModal({ order: detail }); setReturnAction("reject"); }}>✗ Reject Return</button>
                </>
              )}
              {detail.status === "return_approved" && (
                <button className="btn btn-sm" style={{ background:"rgba(79,195,247,.1)", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7" }}
                  onClick={() => { setReturnModal({ order: detail }); setReturnAction("received"); }}>📦 Mark Return Received</button>
              )}
              {(detail.return_number || detail.return_reason || detail.return_notes) && (
                <div style={{ marginTop:8, padding:"10px 12px", background:"rgba(200,150,0,.06)", border:"1px solid rgba(200,150,0,.2)", fontSize:12 }}>
                  {detail.return_number && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"var(--muted)", letterSpacing:".15em" }}>RETURN REF</span>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, fontWeight:700, color:"#c8ff00" }}>{detail.return_number}</span>
                    </div>
                  )}
                  {detail.return_reason && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", marginBottom: detail.return_notes ? 4 : 0 }}>
                      Reason: <span style={{ color:"var(--text)" }}>{detail.return_reason}</span>
                    </div>
                  )}
                  {detail.return_notes && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)" }}>
                      Notes: <span style={{ color:"var(--text)" }}>{detail.return_notes}</span>
                    </div>
                  )}
                  {detail.return_rejection_reason && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--red)", marginTop:6, paddingTop:6, borderTop:"1px solid rgba(255,60,60,.2)" }}>
                      <span style={{ color:"var(--muted)" }}>Rejection Reason: </span><span style={{ color:"#ffaaaa" }}>{detail.return_rejection_reason}</span>
                    </div>
                  )}
                </div>
              )}
              {detail.return_tracking && (
                <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", padding:"8px 10px", background:"var(--bg4)", border:"1px solid var(--border)", marginTop:4 }}>
                  📮 Customer return tracking: <span style={{ color:"#c8ff00" }}>{detail.return_tracking}</span>
                </div>
              )}
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Return action modal */}
      {returnModal && (
        <div className="overlay" onClick={() => { setReturnModal(null); setRejectionReason(""); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-title">
              {returnAction === "approve" ? "✅ Approve Return Request" : returnAction === "received" ? "📦 Mark Return Received" : "✗ Reject Return Request"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18, lineHeight: 1.6 }}>
              {returnAction === "approve" && "Approving this return will update the order status to 'Return Approved' and notify the customer by email. Customers are responsible for return postage. Items must be unused and in original packaging where possible — deductions may be made for opened or used items."}
              {returnAction === "received" && "Marking as received confirms you have the returned item in hand. You can then process a refund separately if needed."}
              {returnAction === "reject" && "Rejecting will revert the order status and notify the customer by email. Provide a reason below so the customer understands why."}
            </div>
            {(returnModal.order?.return_number || returnModal.order?.return_reason || returnModal.order?.return_notes) && (
              <div style={{ marginBottom: 16, padding: "10px 12px", background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 12, fontFamily: "'Share Tech Mono',monospace" }}>
                {returnModal.order?.return_number && (
                  <div style={{ marginBottom:6 }}>
                    <span style={{ fontSize:9, color:"var(--muted)", letterSpacing:".15em" }}>RETURN REF  </span>
                    <span style={{ fontWeight:700, color:"#c8ff00" }}>{returnModal.order.return_number}</span>
                  </div>
                )}
                {returnModal.order?.return_reason && (
                  <div style={{ marginBottom: returnModal.order?.return_notes ? 4 : 0 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2, letterSpacing: ".1em" }}>CUSTOMER REASON</div>
                    {returnModal.order.return_reason}
                  </div>
                )}
                {returnModal.order?.return_notes && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2, letterSpacing: ".1em", marginTop: 6 }}>CUSTOMER NOTES</div>
                    {returnModal.order.return_notes}
                  </div>
                )}
              </div>
            )}
            {returnAction === "reject" && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--red)" }}>Rejection Reason <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(shown to customer)</span></label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g. Item has been opened and shows signs of use. Per our returns policy, deductions apply to opened items..."
                  rows={3}
                  style={{ fontSize: 12, resize: "vertical", width: "100%", boxSizing: "border-box", borderColor: "rgba(255,60,60,.4)" }}
                />
              </div>
            )}
            <div className="gap-2">
              <button className="btn btn-primary" disabled={returnsProcessing} onClick={handleReturnAction}>
                {returnsProcessing ? "Processing…" : returnAction === "approve" ? "Approve Return" : returnAction === "received" ? "Mark Received" : "Reject Return"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setReturnModal(null); setRejectionReason(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {trackingModal && (
        <div className="overlay" onClick={() => setTrackingModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{trackingModal.isUpdate ? "📮 Update Tracking Number" : "📦 Mark as Dispatched"}</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
              {trackingModal.isUpdate
                ? "Update the tracking number for this order. No email will be sent."
                : "Optionally enter a tracking number — it will be included in the dispatch email to the customer."}
            </p>
            <div className="form-group">
              <label>Tracking Number <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <input
                value={trackingModal.tracking}
                onChange={e => setTrackingModal(m => ({ ...m, tracking: e.target.value }))}
                placeholder="e.g. JD000000000000000000"
                onKeyDown={e => e.key === "Enter" && doDispatch(trackingModal.id, trackingModal.tracking)}
                autoFocus
              />
            </div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={() => doDispatch(trackingModal.id, trackingModal.tracking, trackingModal.isUpdate)}>
                {trackingModal.isUpdate ? "💾 Save Tracking Number" : "✓ Confirm Dispatch & Send Email"}
              </button>
              <button className="btn btn-ghost" onClick={() => setTrackingModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {refundModal && (
        <div className="overlay" onClick={() => !refunding && setRefundModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color:"var(--red)" }}>💸 Refund Order</div>
            <div style={{ background:"var(--bg4)", border:"1px solid var(--border)", borderRadius:3, padding:"10px 14px", marginBottom:16, fontSize:12 }}>
              <div style={{ fontWeight:700 }}>{refundModal.order.customer_name}</div>
              <div style={{ color:"var(--muted)", marginTop:2 }}>Order #{(refundModal.order.id||"").slice(-8).toUpperCase()} · Total: £{Number(refundModal.order.total).toFixed(2)}</div>
              <div style={{ color:"var(--muted)", fontSize:11, marginTop:2 }}>Square ref: {refundModal.order.square_order_id || refundModal.order.paypal_order_id || "—"}</div>
            </div>
            <div className="form-group">
              <label>Refund Amount (£)</label>
              <input type="number" step="0.01" min="0.01" max={refundModal.order.total}
                value={refundAmt} onChange={e => setRefundAmt(e.target.value)} autoFocus />
              <div style={{ fontSize:11, color:"var(--muted)", marginTop:4, display:"flex", gap:8 }}>
                <button style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", fontSize:11, padding:0 }}
                  onClick={() => setRefundAmt(Number(refundModal.order.total).toFixed(2))}>Full refund</button>
              </div>
            </div>
            <div className="form-group">
              <label>Internal Note <span style={{ fontWeight:400, color:"var(--muted)" }}>(optional)</span></label>
              <input value={refundNote} onChange={e => setRefundNote(e.target.value)} placeholder="e.g. Item out of stock, customer request" />
            </div>
            <div className="alert" style={{ background:"rgba(255,60,60,.06)", border:"1px solid rgba(255,60,60,.2)", fontSize:11, color:"var(--red)", marginBottom:14 }}>
              ⚠️ This will immediately issue a refund via Square. This cannot be undone.
            </div>
            <div className="gap-2">
              <button className="btn btn-sm" style={{ background:"var(--red)", color:"#fff", border:"none", opacity: refunding ? .6 : 1 }}
                onClick={doRefund} disabled={refunding}>
                {refunding ? "⏳ Processing…" : `✓ Confirm Refund · £${parseFloat(refundAmt||0).toFixed(2)}`}
              </button>
              <button className="btn btn-ghost" onClick={() => setRefundModal(null)} disabled={refunding}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Shop ────────────────────────────────────────────

export { AdminOrdersInline };
