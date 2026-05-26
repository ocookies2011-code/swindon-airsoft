import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const SEVERITY_COLOR = { low:"#5a6e42", medium:"#f97316", high:"#ef4444", critical:"#ff0000" };
const TYPE_LABEL = {
  failed_login:      "❌ Failed Login",
  injection_attempt: "💉 Injection Attempt",
  sql_injection:     "💉 SQL Injection",
  xss_attempt:       "⚡ XSS Attempt",
  brute_force:       "🔨 Brute Force",
  scanner_detected:  "🔍 Scanner Detected",
  tor_detected:      "🧅 Tor Detected",
  rate_limit:        "⏱ Rate Limited",
  suspicious_payload:"⚠️ Suspicious Payload",
};

export function AdminSecurityEvents({ showToast }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("security_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setEvents(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const banIp = async (ip) => {
    if (!ip) return;
    const { error } = await supabase.from("ip_bans").upsert({
      ip, reason: "Banned from security events panel", banned_by: "admin"
    }, { onConflict: "ip" });
    if (error) showToast("Failed: " + error.message, "red");
    else showToast("🚫 IP " + ip + " banned");
  };

  const clearEvent = async (id) => {
    await supabase.from("security_events").delete().eq("id", id);
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all security events?")) return;
    await supabase.from("security_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setEvents([]);
    showToast("✅ Security log cleared");
  };

  const filtered = filter === "all" ? events : events.filter(e => e.severity === filter || e.event_type === filter);

  const counts = events.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {});

  const MIL = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
  const MONO = { fontFamily:"'Share Tech Mono',monospace" };

  return (
    <div style={{ padding:"24px 0" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ ...MIL, fontWeight:900, fontSize:24, color:"var(--accent)", letterSpacing:".08em", margin:0 }}>🛡 SECURITY EVENTS</h2>
          <div style={{ ...MONO, fontSize:10, color:"var(--muted)", marginTop:4 }}>
            Real-time detection of hacking attempts, brute force, and injection attacks
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
          <button className="btn btn-danger btn-sm" onClick={clearAll}>🗑 Clear All</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10, marginBottom:20 }}>
        {[["critical","🔴 Critical"],["high","🟠 High"],["medium","🟡 Medium"],["low","🟢 Low"]].map(([sev, label]) => (
          <div key={sev} onClick={() => setFilter(filter === sev ? "all" : sev)}
            style={{ background: filter === sev ? "rgba(200,255,0,.08)" : "#0d1209", border:`1px solid ${filter === sev ? "var(--accent)" : "var(--border)"}`, padding:"12px 16px", cursor:"pointer" }}>
            <div style={{ ...MONO, fontSize:9, color:"var(--muted)", marginBottom:4 }}>{label}</div>
            <div style={{ ...MIL, fontSize:28, fontWeight:900, color: SEVERITY_COLOR[sev] }}>{counts[sev] || 0}</div>
          </div>
        ))}
        <div style={{ background:"#0d1209", border:"1px solid var(--border)", padding:"12px 16px" }}>
          <div style={{ ...MONO, fontSize:9, color:"var(--muted)", marginBottom:4 }}>📊 Total</div>
          <div style={{ ...MIL, fontSize:28, fontWeight:900, color:"var(--text)" }}>{events.length}</div>
        </div>
      </div>

      {/* Filter buttons */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {["all","failed_login","injection_attempt","brute_force","scanner_detected","tor_detected"].map(t => (
          <button key={t} className={`btn btn-sm ${filter === t ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(t)}>
            {t === "all" ? "All" : (TYPE_LABEL[t] || t)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ ...MONO, fontSize:12, color:"var(--muted)", padding:40, textAlign:"center" }}>Loading security events…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background:"rgba(200,255,0,.04)", border:"1px solid rgba(200,255,0,.1)", padding:40, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ ...MIL, fontSize:18, color:"var(--accent)" }}>NO THREATS DETECTED</div>
          <div style={{ ...MONO, fontSize:11, color:"var(--muted)", marginTop:6 }}>Security log is clean</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {filtered.map(ev => (
            <div key={ev.id} style={{ background:"#0d1209", border:`1px solid ${SEVERITY_COLOR[ev.severity] || "#2a4018"}22`, padding:"10px 14px", display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                  <span style={{ ...MIL, fontWeight:700, fontSize:12, color: SEVERITY_COLOR[ev.severity] }}>
                    {TYPE_LABEL[ev.event_type] || ev.event_type}
                  </span>
                  <span style={{ ...MONO, fontSize:9, color:SEVERITY_COLOR[ev.severity], border:`1px solid ${SEVERITY_COLOR[ev.severity]}44`, padding:"1px 6px" }}>
                    {ev.severity?.toUpperCase()}
                  </span>
                  <span style={{ ...MONO, fontSize:9, color:"var(--muted)" }}>
                    {new Date(ev.created_at).toLocaleString("en-GB", { timeZone:"Europe/London" })}
                  </span>
                </div>
                <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                  {ev.ip && <span style={{ ...MONO, fontSize:11, color:"#4fc3f7" }}>IP: {ev.ip}</span>}
                  {ev.email && <span style={{ ...MONO, fontSize:11, color:"var(--muted)" }}>📧 {ev.email}</span>}
                  {ev.payload && <span style={{ ...MONO, fontSize:10, color:"#ef4444", maxWidth:300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={ev.payload}>⚠ {ev.payload.slice(0,80)}{ev.payload.length > 80 ? "…" : ""}</span>}
                </div>
                {ev.user_agent && <div style={{ ...MONO, fontSize:9, color:"#2a4018", marginTop:3 }}>{ev.user_agent.slice(0,100)}</div>}
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                {ev.ip && <button className="btn btn-danger btn-sm" style={{ fontSize:10 }} onClick={() => banIp(ev.ip)}>🚫 Ban IP</button>}
                <button className="btn btn-ghost btn-sm" style={{ fontSize:10 }} onClick={() => clearEvent(ev.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
