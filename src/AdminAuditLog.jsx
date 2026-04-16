import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { fmtErr } from "./utils";

function AdminAuditLog() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("");
  const [page, setPage]       = useState(0);
  const PAGE_SIZE = 50;
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      if (isMounted.current) setLogs(data || []);
    } catch (e) {
      console.error("Audit log load failed:", e.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const filtered = logs.filter(l => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      (l.action || "").toLowerCase().includes(q) ||
      (l.detail || "").toLowerCase().includes(q) ||
      (l.admin_email || "").toLowerCase().includes(q) ||
      (l.admin_name || "").toLowerCase().includes(q)
    );
  });

  const pages     = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const ACTION_COLOR = (action = "") => {
    if (action.includes("delete") || action.includes("Delete") || action.includes("banned") || action.includes("rejected")) return "var(--red)";
    if (action.includes("refund") || action.includes("Refund")) return "#ff9800";
    if (action.includes("approved") || action.includes("Approved") || action.includes("VIP")) return "var(--accent)";
    if (action.includes("dispatched") || action.includes("Dispatched")) return "#4fc3f7";
    return "var(--muted)";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: ".1em", textTransform: "uppercase" }}>
            🔐 Admin Audit Log
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {logs.length} actions recorded · visible only to superadmin
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(0); }}
            placeholder="Filter by action, detail, admin…"
            style={{ fontSize: 12, width: 240 }}
          />
          <button className="btn btn-sm btn-ghost" onClick={load}>↺ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace", fontSize: 12 }}>Loading…</div>
      ) : paginated.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace", fontSize: 12 }}>No actions logged yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Time</th>
                <th style={{ width: 160 }}>Admin</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((l, i) => (
                <tr key={l.id || i}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {new Date(l.created_at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{l.admin_name || "—"}</div>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>{l.admin_email}</div>
                  </td>
                  <td>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, fontWeight: 700, color: ACTION_COLOR(l.action) }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, maxWidth: 420 }}>
                    {l.detail
                      ? l.detail.split(" | ").map((part, pi) => {
                          const isChange = part.includes(" → ");
                          const isLabel = part.includes(": ");
                          return (
                            <div key={pi} style={{
                              display: "inline-block",
                              background: isChange ? "rgba(200,255,0,.06)" : "rgba(255,255,255,.04)",
                              border: `1px solid ${isChange ? "rgba(200,255,0,.2)" : "rgba(255,255,255,.08)"}`,
                              borderRadius: 3,
                              padding: "1px 6px",
                              margin: "1px 2px 1px 0",
                              fontFamily: "'Share Tech Mono',monospace",
                              color: isChange ? "var(--accent)" : "var(--muted)",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                              lineHeight: 1.5,
                            }}>
                              {isLabel && !isChange
                                ? (<><span style={{ color: "rgba(255,255,255,.3)", fontSize: 10 }}>{part.split(": ")[0]}: </span><span style={{ color: "#c8d8b0" }}>{part.split(": ").slice(1).join(": ")}</span></>)
                                : part}
                            </div>
                          );
                        })
                      : <span style={{ color: "rgba(255,255,255,.2)", fontFamily: "'Share Tech Mono',monospace" }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          {Array.from({ length: pages }).map((_, i) => (
            <button key={i} className={`btn btn-sm ${i === page ? "btn-primary" : "btn-ghost"}`} onClick={() => setPage(i)}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default AdminAuditLog;
