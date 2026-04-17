// admin/AdminFailedPayments.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtDate } from "../utils";

function AdminFailedPayments({ showToast, cu }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [delConfirm, setDelConfirm] = useState(null);
  const delConfirmRef = useRef(null);
  const [delBusy, setDelBusy]   = useState(false);
  const [filter, setFilter]     = useState("all");

  useEffect(() => {
    supabase.from("failed_payments").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) showToast("Failed to load: " + error.message, "red");
        else setPayments(data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const deleteEntry = async (id) => {
    setDelBusy(true);
    try {
      const { error } = await supabase.from("failed_payments").delete().eq("id", id);
      if (error) throw error;
      setPayments(p => p.filter(x => x.id !== id));
      showToast("Entry deleted.");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Failed payment deleted", detail: `ID: ${id}` });
      setDelConfirm(null);
    } catch (e) {
      showToast("Delete failed: " + e.message, "red");
    } finally { setDelBusy(false); }
  };

  const methodLabel = { square_online:"Online Booking", square_shop:"Shop Order", square_vip:"VIP Payment", terminal:"Terminal", cash:"Cash Sale", unknown:"Unknown" };
  const methodColor = { square_online:"#4fc3f7", square_shop:"#ffb74d", square_vip:"#ffd54f", terminal:"#81c784", cash:"#a5d6a7", unknown:"#888" };

  const filtered = filter === "all" ? payments : payments.filter(p => p.payment_method === filter);
  const totalLost = filtered.reduce((s, p) => s + Number(p.total || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Failed Payments</div>
          <div className="page-sub">Payment attempts that failed — not included in revenue</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10, marginBottom:16 }}>
        {[
          { label:"Total Failed",    val: payments.length,                                                           color:"var(--red)" },
          { label:"Value at Risk",   val: `£${payments.reduce((s,p) => s+Number(p.total||0),0).toFixed(2)}`,   color:"var(--gold)" },
          { label:"Online Bookings", val: payments.filter(p=>p.payment_method==="square_online").length,             color:"#4fc3f7" },
          { label:"Shop Orders",     val: payments.filter(p=>p.payment_method==="square_shop").length,               color:"#ffb74d" },
          { label:"Terminal",        val: payments.filter(p=>p.payment_method==="terminal").length,                  color:"#81c784" },
          { label:"Cash Sales",      val: payments.filter(p=>p.payment_method==="cash").length,                      color:"#a5d6a7" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background:"var(--card)", border:"1px solid var(--border)", padding:"12px 14px", borderRadius:3 }}>
            <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color, fontFamily:"'Barlow Condensed',sans-serif" }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {[["all","All"],["square_online","Online"],["square_shop","Shop"],["terminal","Terminal"],["cash","Cash"],["square_vip","VIP"]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} className="btn btn-sm"
            style={{ background:filter===key?"var(--accent)":"var(--card)", color:filter===key?"#000":"var(--muted)", border:"1px solid "+(filter===key?"var(--accent)":"var(--border)"), fontWeight:filter===key?700:400 }}>
            {label}{key!=="all"&&` (${payments.filter(p=>p.payment_method===key).length})`}
          </button>
        ))}
        {filtered.length > 0 && (
          <span style={{ marginLeft:"auto", fontSize:12, color:"var(--muted)", alignSelf:"center" }}>
            {filtered.length} record{filtered.length!==1?"s":""} · £{totalLost.toFixed(2)} total
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>
          {payments.length === 0 ? "✅ No failed payments on record." : "No failed payments match this filter."}
        </div>
      ) : (
        <div className="card" style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--bg4)" }}>
                {["Date","Customer","Method","Items","Total","Error",""].map(h => (
                  <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10, color:"var(--muted)", letterSpacing:".1em", textTransform:"uppercase", fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} style={{ borderBottom:"1px solid var(--border)", background:i%2===0?"transparent":"rgba(255,255,255,.015)" }}>
                  <td style={{ padding:"10px 12px", whiteSpace:"nowrap", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)" }}>{gmtShort(p.created_at)}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ fontWeight:600, fontSize:12 }}>{p.customer_name||"—"}</div>
                    {p.customer_email && <div style={{ fontSize:10, color:"var(--muted)" }}>{p.customer_email}</div>}
                  </td>
                  <td style={{ padding:"10px 12px" }}>
                    <span style={{ background:"rgba(0,0,0,.3)", border:`1px solid ${methodColor[p.payment_method]||"#888"}`, color:methodColor[p.payment_method]||"#888", fontSize:9, fontWeight:700, padding:"2px 7px", letterSpacing:".1em", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {methodLabel[p.payment_method]||p.payment_method}
                    </span>
                  </td>
                  <td style={{ padding:"10px 12px", color:"var(--muted)", fontSize:11, maxWidth:160 }}>
                    {Array.isArray(p.items)&&p.items.length>0 ? p.items.map(it=>`${it.name}${it.qty>1?` ×${it.qty}`:""}`).join(", ") : "—"}
                  </td>
                  <td style={{ padding:"10px 12px", fontFamily:"'Share Tech Mono',monospace", fontWeight:700, color:"var(--red)" }}>£{Number(p.total||0).toFixed(2)}</td>
                  <td style={{ padding:"10px 12px", fontSize:11, color:"var(--muted)", maxWidth:200 }}>
                    <span title={p.error_message} style={{ display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>{p.error_message||"—"}</span>
                    {p.square_payment_id && <span style={{ fontSize:9, fontFamily:"'Share Tech Mono',monospace", color:"#4fc3f7", display:"block", marginTop:2 }}>Ref: {p.square_payment_id.slice(0,16)}…</span>}
                  </td>
                  <td style={{ padding:"10px 12px" }}>
                    <button onClick={() => { delConfirmRef.current = p.id; setDelConfirm(p.id); }} style={{ background:"transparent", border:"1px solid rgba(255,60,60,.3)", color:"var(--red)", fontSize:10, padding:"3px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em" }}>DELETE</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {delConfirm && (
        <div className="overlay" onClick={() => setDelConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
            <div className="modal-title">Delete Entry?</div>
            <div style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>This will permanently remove the failed payment record. This cannot be undone.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setDelConfirm(null)} disabled={delBusy}>Cancel</button>
              <button className="btn btn-primary" style={{ background:"rgba(255,60,60,.15)", borderColor:"var(--red)", color:"var(--red)" }} onClick={() => deleteEntry(delConfirmRef.current)} disabled={delBusy}>
                {delBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── UK Visitor Map ────────────────────────────────────────

export { AdminFailedPayments };
