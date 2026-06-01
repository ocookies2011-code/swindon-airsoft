import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const MIL  = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };

export function AdminReportedMessages({ showToast }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("security_events")
      .select("*")
      .eq("event_type", "message_report")
      .order("created_at", { ascending: false });
    if (data) setReports(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const dismiss = async (id) => {
    await supabase.from("security_events").delete().eq("id", id);
    setReports(prev => prev.filter(r => r.id !== id));
    showToast("Report dismissed");
  };

  const dismissAll = async () => {
    if (!window.confirm("Dismiss all message reports?")) return;
    await supabase.from("security_events").delete().eq("event_type", "message_report");
    setReports([]);
    showToast("All reports dismissed");
  };

  return (
    <div style={{ padding:"24px 0" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ ...MIL, fontWeight:900, fontSize:24, color:"var(--accent)", letterSpacing:".08em", margin:0 }}>🚩 REPORTED MESSAGES</h2>
          <div style={{ ...MONO, fontSize:10, color:"var(--muted)", marginTop:4 }}>Messages reported by members as inappropriate</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
          {reports.length > 0 && <button className="btn btn-ghost btn-sm" onClick={dismissAll}>✓ Dismiss All</button>}
        </div>
      </div>

      {loading ? (
        <div style={{ ...MONO, fontSize:11, color:"var(--muted)", padding:40, textAlign:"center" }}>Loading…</div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, background:"#0d1209", border:"1px solid #1e2e12" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ ...MIL, fontSize:18, color:"var(--accent)" }}>NO REPORTS</div>
          <div style={{ ...MONO, fontSize:10, color:"var(--muted)", marginTop:6 }}>No messages have been reported</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {reports.map(r => {
            // Parse payload: "Reported message: "..." | Reason: ..."
            const msgMatch = r.payload?.match(/Reported message: "(.*?)" \| Reason: (.*)/s);
            const reportedMsg = msgMatch?.[1] || r.payload;
            const reason = msgMatch?.[2] || "—";
            return (
              <div key={r.id} style={{ background:"#0d1209", border:"1px solid rgba(249,115,22,.2)", padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
                      <span style={{ ...MIL, fontWeight:700, fontSize:13, color:"#f97316" }}>🚩 Reported Message</span>
                      <span style={{ ...MONO, fontSize:9, color:"var(--muted)" }}>
                        {new Date(r.created_at).toLocaleString("en-GB", { timeZone:"Europe/London" })}
                      </span>
                    </div>
                    {r.email && (
                      <div style={{ ...MONO, fontSize:10, color:"var(--muted)", marginBottom:6 }}>
                        Reported user: <span style={{ color:"#4fc3f7" }}>{r.email}</span>
                      </div>
                    )}
                    <div style={{ ...MONO, fontSize:10, color:"#f97316", marginBottom:6 }}>
                      Reason: <span style={{ color:"var(--text)", fontWeight:700 }}>{reason}</span>
                    </div>
                    <div style={{ background:"#080b06", border:"1px solid #1e2e12", padding:"8px 12px", fontSize:13, color:"#8aaa60", lineHeight:1.6, fontStyle:"italic", wordBreak:"break-word" }}>
                      "{reportedMsg}"
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize:10 }} onClick={() => dismiss(r.id)}>✓ Dismiss</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
