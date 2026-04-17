// pages/PlayerWaitlist.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { waitlistApi } from "../api";
import { fmtDate } from "../utils";

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

export { PlayerWaitlist };
