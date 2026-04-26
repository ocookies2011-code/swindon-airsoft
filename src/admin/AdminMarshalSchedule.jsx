// admin/AdminMarshalSchedule.jsx — admin view of marshal availability per event
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { logAction } from "./adminHelpers";

const MIL  = { fontFamily:"'Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };

const STATUS_CFG = {
  available:   { label:"Available",   color:"#c8ff00", border:"rgba(200,255,0,.4)"  },
  unavailable: { label:"Unavailable", color:"#ef5350", border:"rgba(239,83,80,.4)"  },
  confirmed:   { label:"Submitted",   color:"#4fc3f7", border:"rgba(79,195,247,.4)" },
};

const ROLE_CFG = {
  marshal:        { label:"Marshal",        icon:"🟢" },
  referee:        { label:"Referee",        icon:"🟡" },
  senior_marshal: { label:"Senior Marshal", icon:"🔴" },
};

function fmtDate(d) {
  return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
}

export function AdminMarshalSchedule({ data, cu, showToast }) {
  const [schedules, setSchedules] = useState({});   // eventId -> rows
  const [loading, setLoading]     = useState({});
  const [approving, setApproving] = useState({});   // rowId -> bool
  const [expanded, setExpanded]   = useState({});   // eventId -> bool

  const today = new Date().toISOString().slice(0,10);
  const upcomingEvents = (data.events||[])
    .filter(e => e.published && e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));

  const pastEvents = (data.events||[])
    .filter(e => e.published && e.date < today)
    .sort((a,b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const loadSchedule = useCallback(async (eventId) => {
    setLoading(p => ({ ...p, [eventId]:true }));
    const { data: rows, error } = await supabase
      .from("marshal_schedules")
      .select("id,event_id,user_id,status,role,notes,admin_approved,approved_by,approved_at,created_at,updated_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (error) console.error("AdminMarshalSchedule loadSchedule error:", error?.message);
    // Enrich with profile from data.users
    const enriched = (rows||[]).map(r => ({
      ...r,
      profile: (data.users||[]).find(u => u.id === r.user_id) || { name:"Unknown", callsign:"", profile_pic:null },
    }));
    setSchedules(p => ({ ...p, [eventId]: enriched }));
    setLoading(p => ({ ...p, [eventId]:false }));
  }, []);

  useEffect(() => {
    upcomingEvents.forEach(e => loadSchedule(e.id));
    // Auto-expand first upcoming event
    if (upcomingEvents.length > 0) setExpanded({ [upcomingEvents[0].id]: true });
  }, [data.events]);

  const toggleApprove = async (row, eventId) => {
    setApproving(p => ({ ...p, [row.id]:true }));
    try {
      const newApproved = !row.admin_approved;
      const { error } = await supabase
        .from("marshal_schedules")
        .update({
          admin_approved: newApproved,
          approved_by:    newApproved ? cu.id : null,
          approved_at:    newApproved ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
      if (error) throw error;
      await loadSchedule(eventId);
      logAction({ adminEmail:cu?.email, adminName:cu?.name, action: newApproved ? "Marshal approved" : "Marshal approval removed", detail:`${row.profile?.name} for event ${eventId}` });
      showToast(newApproved ? "✓ Marshal approved" : "Approval removed", newApproved ? "green" : "");
    } catch(e) {
      showToast("Error: " + e.message, "red");
    } finally {
      setApproving(p => ({ ...p, [row.id]:false }));
    }
  };

  const removeEntry = async (rowId, eventId) => {
    if (!window.confirm("Remove this marshal from the schedule?")) return;
    await supabase.from("marshal_schedules").delete().eq("id", rowId);
    await loadSchedule(eventId);
    showToast("Entry removed");
  };

  const renderEventCard = (ev, isPast = false) => {
    const rows = schedules[ev.id] || [];
    const approved = rows.filter(r => r.admin_approved);
    const pending  = rows.filter(r => !r.admin_approved && r.status !== "unavailable");
    const unavail  = rows.filter(r => r.status === "unavailable");
    const isOpen   = expanded[ev.id];

    return (
      <div key={ev.id} style={{ border:"1px solid #2a3a10", marginBottom:8, background:"#0a0f06" }}>
        {/* Event header — click to expand */}
        <div
          style={{ padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, userSelect:"none" }}
          onClick={() => setExpanded(p => ({ ...p, [ev.id]: !p[ev.id] }))}
        >
          <div style={{ flex:1 }}>
            <div style={{ ...MIL, fontWeight:900, fontSize:15, color:"#e8ffb0", textTransform:"uppercase", letterSpacing:".04em" }}>
              {ev.title}
            </div>
            <div style={{ ...MONO, fontSize:10, color:"#3a5010", marginTop:2 }}>
              {fmtDate(ev.date)} · {ev.time} GMT · {ev.location}
            </div>
          </div>
          {/* Counts */}
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {approved.length > 0 && (
              <span style={{ ...MONO, fontSize:10, color:"#81c784", border:"1px solid rgba(129,199,132,.3)", padding:"2px 8px" }}>
                ✓ {approved.length} approved
              </span>
            )}
            {pending.length > 0 && (
              <span style={{ ...MONO, fontSize:10, color:"#c8ff00", border:"1px solid rgba(200,255,0,.3)", padding:"2px 8px" }}>
                ⏳ {pending.length} pending
              </span>
            )}
            {rows.length === 0 && (
              <span style={{ ...MONO, fontSize:10, color:"#2a3a10" }}>No submissions</span>
            )}
            {loading[ev.id] && <span style={{ ...MONO, fontSize:9, color:"#2a3a10" }}>loading…</span>}
          </div>
          <div style={{ color:"#2a3a10", fontSize:12 }}>{isOpen ? "▲" : "▼"}</div>
        </div>

        {/* Expanded body */}
        {isOpen && (
          <div style={{ borderTop:"1px solid #1a2808", padding:"0 16px 16px" }}>
            {rows.length === 0 ? (
              <div style={{ ...MONO, fontSize:11, color:"#2a3a10", padding:"16px 0" }}>
                No marshals have submitted availability for this event yet.
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div style={{ display:"flex", gap:16, padding:"10px 0", borderBottom:"1px solid #1a2808", marginBottom:12 }}>
                  {[
                    ["✓ Approved", approved.length, "#81c784"],
                    ["⏳ Awaiting", pending.length, "#c8ff00"],
                    ["✕ Unavailable", unavail.length, "#ef5350"],
                    ["Total", rows.length, "#5a7a30"],
                  ].map(([l,n,c]) => (
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ ...MIL, fontSize:20, fontWeight:900, color:c, lineHeight:1 }}>{n}</div>
                      <div style={{ ...MONO, fontSize:8, color:"#2a3a10", letterSpacing:".1em" }}>{l}</div>
                    </div>
                  ))}
                </div>

                {/* Marshal rows */}
                {rows.map(row => {
                  const sc = STATUS_CFG[row.status] || STATUS_CFG.available;
                  const rc = ROLE_CFG[row.role] || ROLE_CFG.marshal;
                  const isApproved = row.admin_approved;
                  return (
                    <div key={row.id} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"10px 0",
                      borderBottom:"1px solid #111a08",
                      opacity: row.status === "unavailable" ? .5 : 1,
                    }}>
                      {/* Avatar */}
                      <div style={{ width:32, height:32, borderRadius:2, background:"#1a2808", border:"1px solid #2a3a10", flexShrink:0, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>
                        {row.profile?.profile_pic
                          ? <img src={row.profile.profile_pic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                          : "👤"}
                      </div>

                      {/* Name + role */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                          <span style={{ ...MIL, fontWeight:800, fontSize:13, color:"#c0d8a0", letterSpacing:".04em" }}>
                            {row.profile?.name || "Unknown"}
                          </span>
                          {row.profile?.callsign && (
                            <span style={{ ...MONO, fontSize:9, color:"#3a5010" }}>"{row.profile.callsign}"</span>
                          )}
                          <span style={{ ...MONO, fontSize:8, letterSpacing:".1em", color:sc.color, border:`1px solid ${sc.border}`, padding:"1px 6px" }}>
                            {sc.label}
                          </span>
                          <span style={{ ...MONO, fontSize:9, color:"#4a6820" }}>{rc.icon} {rc.label}</span>
                          {isApproved && (
                            <span style={{ ...MONO, fontSize:8, letterSpacing:".1em", color:"#81c784", border:"1px solid rgba(129,199,132,.4)", padding:"1px 6px", background:"rgba(129,199,132,.06)" }}>
                              ✓ APPROVED
                            </span>
                          )}
                        </div>
                        {row.notes ? (
                          <div style={{ ...MONO, fontSize:9, color:"#3a5010", marginTop:3, fontStyle:"italic" }}>
                            💬 {row.notes}
                          </div>
                        ) : null}
                        <div style={{ ...MONO, fontSize:8, color:"#1e2e10", marginTop:2 }}>
                          Submitted: {new Date(row.updated_at || row.created_at).toLocaleDateString("en-GB")}
                        </div>
                      </div>

                      {/* Actions */}
                      {!isPast && row.status !== "unavailable" && (
                        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                          <button
                            className={isApproved ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
                            style={{ fontSize:10, padding:"4px 12px", letterSpacing:".1em", minWidth:90 }}
                            disabled={!!approving[row.id]}
                            onClick={() => toggleApprove(row, ev.id)}
                          >
                            {approving[row.id] ? "…" : isApproved ? "✕ Unapprove" : "✓ Approve"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize:10, padding:"4px 8px", color:"#ef5350", borderColor:"rgba(239,83,80,.3)" }}
                            onClick={() => removeEntry(row.id, ev.id)}
                          >✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-content">
      <div className="page-title">Marshal Schedule</div>
      <div className="page-sub" style={{ marginBottom:24 }}>
        Review marshal availability submissions. Approve the marshals you need for each event — they'll see an "Approved" badge on their schedule.
      </div>

      {/* Upcoming events */}
      {upcomingEvents.length === 0 ? (
        <div style={{ ...MONO, fontSize:12, color:"#2a3a10", padding:"24px 0" }}>No upcoming published events.</div>
      ) : (
        <>
          <div style={{ ...MONO, fontSize:9, letterSpacing:".25em", color:"#3a5010", marginBottom:10 }}>◆ UPCOMING EVENTS</div>
          {upcomingEvents.map(ev => renderEventCard(ev, false))}
        </>
      )}

      {/* Recent past events */}
      {pastEvents.length > 0 && (
        <div style={{ marginTop:32 }}>
          <div style={{ ...MONO, fontSize:9, letterSpacing:".25em", color:"#2a3a10", marginBottom:10 }}>◆ RECENT PAST EVENTS</div>
          {pastEvents.map(ev => renderEventCard(ev, true))}
        </div>
      )}
    </div>
  );
}
