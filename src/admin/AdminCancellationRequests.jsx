// admin/AdminCancellationRequests.jsx
// Player cancellations now come here for review instead of auto-processing.
// Approve → soft-cancels the booking (cancelled_at) and issues credit or Square
// refund. Reject → leaves the booking untouched and notifies the player.
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { squareRefund, waitlistApi, holdApi } from "../api";
import { fmtDate, gmtShort, sendEmail } from "../utils";
import { logAction } from "./adminHelpers";

function AdminCancellationRequests({ showToast, cu, refresh }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("pending");
  const [busyId, setBusyId]     = useState(null);
  const [reviewModal, setReviewModal] = useState(null); // the request being reviewed
  const [method, setMethod]     = useState("credit");
  const [amount, setAmount]     = useState("");
  const [note, setNote]         = useState("");
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNote, setRejectNote]   = useState("");

  const load = () => {
    setLoading(true);
    supabase.from("cancellation_requests").select("*").order("requested_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) showToast("Failed to load: " + error.message, "red");
        else setRequests(data || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin_cancellation_requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "cancellation_requests" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const openReview = (r) => {
    setReviewModal(r);
    setMethod(r.suggested_method || "credit");
    setAmount(String(r.suggested_refund_amount ?? ""));
    setNote("");
  };

  const approve = async () => {
    const r = reviewModal;
    if (!r) return;
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!(amt > 0)) { showToast("Enter a valid amount.", "red"); return; }
    setBusyId(r.id);
    try {
      // Soft-cancel the booking — admin is allowed to update any booking row
      const { error: bErr } = await supabase.from("bookings")
        .update({ cancelled_at: new Date().toISOString() }).eq("id", r.booking_id);
      if (bErr) throw bErr;

      if (method === "credit") {
        const { error: rpcErr } = await supabase.rpc("admin_award_credit", {
          p_user_id: r.user_id, p_amount: amt, p_note: note || `Cancellation of ${r.event_title}`,
        });
        if (rpcErr) throw rpcErr;
      } else {
        if (!r.square_order_id || r.square_order_id.startsWith("ADMIN-") || r.square_order_id.startsWith("CREDITS-")) {
          throw new Error("This booking has no real Square payment to refund — use credit instead.");
        }
        await squareRefund({ squarePaymentId: r.square_order_id, amount: amt });
      }

      await supabase.from("cancellation_requests").update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolved_by: cu.email,
        resolved_method: method,
        resolved_amount: amt,
        resolved_note: note || null,
      }).eq("id", r.id);

      logAction({
        adminEmail: cu.email, adminName: cu.name,
        action: "cancellation_request_approved",
        detail: `${r.user_name}: ${r.qty}x ${r.ticket_type} — ${r.event_title} — £${amt.toFixed(2)} as ${method}${note ? " — " + note : ""}`,
        playerId: r.user_id, playerName: r.user_name,
        oldValue: `Booked, total £${Number(r.total).toFixed(2)}`,
        newValue: method === "credit" ? `Credits added: £${amt.toFixed(2)}` : `Refunded: £${amt.toFixed(2)}`,
      });

      // Free the slot for the first person on the waitlist, if any
      try {
        const wl = await waitlistApi.getByEvent(r.event_id);
        const first = wl.find(w => w.ticket_type === r.ticket_type);
        if (first?.user_email) {
          await holdApi.createHold({
            eventId: r.event_id, ticketType: r.ticket_type,
            userId: first.user_id, userName: first.user_name, userEmail: first.user_email,
          });
        }
      } catch { /* non-fatal */ }

      // Notify the player
      if (r.user_email) {
        sendEmail({
          toEmail: r.user_email, toName: r.user_name,
          subject: `✅ Cancellation approved — ${r.event_title}`,
          htmlContent: `
            <div style="font-family:Arial,sans-serif;padding:20px">
              <h2 style="color:#2e7d32">✅ Your cancellation was approved</h2>
              <table style="font-size:14px;border-collapse:collapse">
                <tr><td style="padding:4px 12px 4px 0;color:#666">Event</td><td>${r.event_title}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#666">Ticket</td><td>${r.qty}x ${r.ticket_type}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#666">${method === "credit" ? "Credits added" : "Refunded"}</td><td>£${amt.toFixed(2)}</td></tr>
              </table>
            </div>`,
        }).catch(() => {});
      }

      showToast("Cancellation approved.");
      setReviewModal(null);
      load();
      refresh?.();
    } catch (e) {
      showToast("Approval failed: " + (e.message || String(e)), "red");
    } finally { setBusyId(null); }
  };

  const reject = async () => {
    const r = rejectModal;
    if (!r) return;
    setBusyId(r.id);
    try {
      await supabase.from("cancellation_requests").update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
        resolved_by: cu.email,
        resolved_note: rejectNote || null,
      }).eq("id", r.id);

      logAction({
        adminEmail: cu.email, adminName: cu.name,
        action: "cancellation_request_rejected",
        detail: `${r.user_name}: ${r.qty}x ${r.ticket_type} — ${r.event_title}${rejectNote ? " — " + rejectNote : ""}`,
        playerId: r.user_id, playerName: r.user_name,
      });

      if (r.user_email) {
        sendEmail({
          toEmail: r.user_email, toName: r.user_name,
          subject: `Cancellation request declined — ${r.event_title}`,
          htmlContent: `
            <div style="font-family:Arial,sans-serif;padding:20px">
              <h2 style="color:#c62828">Cancellation request declined</h2>
              <p>Your request to cancel ${r.qty}x ${r.ticket_type} for <strong>${r.event_title}</strong> was not approved. Your booking remains active.</p>
              ${rejectNote ? `<p style="color:#666">Note: ${rejectNote}</p>` : ""}
            </div>`,
        }).catch(() => {});
      }

      showToast("Request rejected.");
      setRejectModal(null);
      setRejectNote("");
      load();
    } catch (e) {
      showToast("Failed: " + (e.message || String(e)), "red");
    } finally { setBusyId(null); }
  };

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  const statusColor = { pending: "#ffb74d", approved: "#81c784", rejected: "#ef5350" };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Cancellation Requests</div>
          <div className="page-sub">Players request a cancellation here instead of it being processed automatically</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {[["pending", `Pending (${pendingCount})`], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} className="btn btn-sm"
            style={{ background: filter === key ? "var(--accent)" : "var(--card)", color: filter === key ? "#000" : "var(--muted)", border: "1px solid " + (filter === key ? "var(--accent)" : "var(--border)"), fontWeight: filter === key ? 700 : 400 }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>
          {filter === "pending" ? "✅ No pending cancellation requests." : "Nothing here."}
        </div>
      ) : (
        <div className="card" style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--bg4)" }}>
                {["Requested","Player","Event","Ticket","Suggested","Status",""].map(h => (
                  <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10, color:"var(--muted)", letterSpacing:".1em", textTransform:"uppercase", fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{ borderBottom:"1px solid var(--border)", background:i%2===0?"transparent":"rgba(255,255,255,.015)" }}>
                  <td style={{ padding:"10px 12px", whiteSpace:"nowrap", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)" }}>{gmtShort(r.requested_at)}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ fontWeight:600, fontSize:12 }}>{r.user_name}</div>
                    <div style={{ fontSize:10, color:"var(--muted)" }}>{r.user_email}</div>
                  </td>
                  <td style={{ padding:"10px 12px" }}>
                    <div>{r.event_title}</div>
                    <div style={{ fontSize:10, color:"var(--muted)" }}>{fmtDate(r.event_date)} · {r.hours_until_event}h away</div>
                  </td>
                  <td style={{ padding:"10px 12px" }}>{r.qty}x {r.ticket_type} · £{Number(r.total).toFixed(2)}</td>
                  <td style={{ padding:"10px 12px", fontFamily:"'Share Tech Mono',monospace" }}>
                    £{Number(r.suggested_refund_amount).toFixed(2)} <span style={{ color:"var(--muted)" }}>({r.suggested_method})</span>
                  </td>
                  <td style={{ padding:"10px 12px" }}>
                    <span style={{ background:"rgba(0,0,0,.3)", border:`1px solid ${statusColor[r.status]}`, color:statusColor[r.status], fontSize:9, fontWeight:700, padding:"2px 7px", letterSpacing:".1em", textTransform:"uppercase" }}>
                      {r.status}
                    </span>
                    {r.status !== "pending" && r.resolved_by && (
                      <div style={{ fontSize:9, color:"var(--muted)", marginTop:3 }}>by {r.resolved_by}</div>
                    )}
                  </td>
                  <td style={{ padding:"10px 12px", whiteSpace:"nowrap" }}>
                    {r.status === "pending" && (
                      <>
                        <button className="btn btn-sm" style={{ background:"rgba(129,199,132,.15)", border:"1px solid #81c784", color:"#81c784", marginRight:6 }}
                          onClick={() => openReview(r)}>Approve</button>
                        <button className="btn btn-sm" style={{ background:"rgba(239,83,80,.12)", border:"1px solid #ef5350", color:"#ef5350" }}
                          onClick={() => { setRejectModal(r); setRejectNote(""); }}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewModal && (
        <div className="overlay" onClick={() => setReviewModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
            <div className="modal-title">Approve Cancellation</div>
            <div style={{ fontSize:13, color:"var(--muted)", marginBottom:14 }}>
              {reviewModal.user_name} · {reviewModal.qty}x {reviewModal.ticket_type} · {reviewModal.event_title}
              <br />{reviewModal.hours_until_event}h until event
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <button className="btn btn-sm" style={{ flex:1, background: method==="credit" ? "var(--accent)" : "var(--card)", color: method==="credit" ? "#000" : "var(--muted)", border:"1px solid var(--border)" }} onClick={() => setMethod("credit")}>Game Credits</button>
              <button className="btn btn-sm" style={{ flex:1, background: method==="refund" ? "var(--accent)" : "var(--card)", color: method==="refund" ? "#000" : "var(--muted)", border:"1px solid var(--border)" }} onClick={() => setMethod("refund")}>Square Refund</button>
            </div>
            <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:4 }}>Amount (£)</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="input" style={{ width:"100%", marginBottom:12 }} />
            <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:4 }}>Note (optional)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} className="input" style={{ width:"100%", marginBottom:16 }} placeholder="Internal note" />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setReviewModal(null)} disabled={busyId === reviewModal.id}>Cancel</button>
              <button className="btn btn-primary" onClick={approve} disabled={busyId === reviewModal.id}>
                {busyId === reviewModal.id ? "Processing…" : `Approve — £${Number(amount || 0).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="overlay" onClick={() => setRejectModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
            <div className="modal-title">Reject Request?</div>
            <div style={{ fontSize:13, color:"var(--muted)", marginBottom:14 }}>
              The booking stays active — {rejectModal.user_name} will be notified.
            </div>
            <input type="text" value={rejectNote} onChange={e => setRejectNote(e.target.value)} className="input" style={{ width:"100%", marginBottom:16 }} placeholder="Reason (optional, shown to player)" />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setRejectModal(null)} disabled={busyId === rejectModal.id}>Cancel</button>
              <button className="btn btn-primary" style={{ background:"rgba(255,60,60,.15)", borderColor:"var(--red)", color:"var(--red)" }} onClick={reject} disabled={busyId === rejectModal.id}>
                {busyId === rejectModal.id ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { AdminCancellationRequests };
