// pages/MarshalSchedulePage.jsx — marshal/referee availability for upcoming events
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const MIL  = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };
const ACCENT = "#c8ff00";
const BG2 = "#0d1209"; const BG3 = "#111a0a";
const BORDER = "#1e2e12"; const BORDER2 = "#2a4018"; const MUTED = "#5a6e42";

const STATUS_CFG = {
  available:   { label:"Available",   color:"#c8ff00", bg:"rgba(200,255,0,.08)",  border:"rgba(200,255,0,.3)"  },
  unavailable: { label:"Unavailable", color:"#ef5350", bg:"rgba(239,83,80,.08)",  border:"rgba(239,83,80,.3)"  },
};
// Admin-only display (not selectable by marshals)
const APPROVED_CFG = { label:"Approved", color:"#81c784", bg:"rgba(129,199,132,.08)", border:"rgba(129,199,132,.3)" };
const ROLE_CFG = {
  marshal:        { label:"Marshal",        icon:"🟢" },
  referee:        { label:"Referee",        icon:"🟡" },
  senior_marshal: { label:"Senior Marshal", icon:"🔴" },
};

function fmtDate(d) {
  return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long",year:"numeric"});
}

export function MarshalSchedulePage({ data, cu, showToast }) {
  const [schedules, setSchedules] = useState({});  // eventId -> [{...}]
  const [loading, setLoading]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [myStatus, setMyStatus]   = useState({});  // eventId -> {status, role, notes}
  const [expandedNotes, setExpandedNotes] = useState({});

  // Only show upcoming events
  const today = new Date().toISOString().slice(0,10);
  const upcomingEvents = (data.events||[])
    .filter(e => e.published && e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date));

  const loadSchedule = async (eventId) => {
    setLoading(p => ({ ...p, [eventId]:true }));
    const { data: rows, error } = await supabase
      .from("marshal_schedules")
      .select("id,event_id,user_id,status,role,notes,admin_approved,updated_at")
      .eq("event_id", eventId);
    if (error) console.error("loadSchedule error:", error?.message, error?.code);
    // Enrich with profile data from data.users (avoids join RLS issues)
    const enriched = (rows||[]).map(r => ({
      ...r,
      profile: (data.users||[]).find(u => u.id === r.user_id) || { name:"Unknown", callsign:"", profile_pic:null },
    }));
    setSchedules(p => ({ ...p, [eventId]: enriched }));
    // Pre-fill my own status
    const VALID_ROLES = ["marshal","referee","senior_marshal"];
    const mine = enriched.find(r => r.user_id === cu?.id);
    if (mine) {
      setMyStatus(p => ({ ...p, [eventId]:{ status:mine.status, role:VALID_ROLES.includes(mine.role)?mine.role:"marshal", notes:mine.notes||"" }}));
      // Auto-expand notes if there's already a saved note
      if (mine.notes) setExpandedNotes(p => ({ ...p, [eventId]:true }));
    } else {
      setMyStatus(p => ({ ...p, [eventId]: p[eventId] || { status:"available", role:"marshal", notes:"" }}));
    }
    setLoading(p => ({ ...p, [eventId]:false }));
  };

  // Load schedules on mount and when events/user changes
  useEffect(() => {
    if (!cu?.id) return;
    upcomingEvents.forEach(e => loadSchedule(e.id));
  }, [data.events, cu?.id]); // eslint-disable-line

  // Re-enrich schedules when data.users loads (fixes "Unknown" names)
  useEffect(() => {
    if (!data.users?.length) return;
    setSchedules(prev => {
      const updated = {};
      for (const [eventId, rows] of Object.entries(prev)) {
        updated[eventId] = rows.map(r => ({
          ...r,
          profile: data.users.find(u => u.id === r.user_id) || r.profile || { name:"Unknown", callsign:"", profile_pic:null },
        }));
      }
      return updated;
    });
  }, [data.users?.length]); // eslint-disable-line

  const submit = async (eventId) => {
    if (!cu) return;
    const s = myStatus[eventId] || { status:"available", role:"marshal", notes:"" };
    setSubmitting(true);
    try {
      const { error: upsertErr } = await supabase.from("marshal_schedules").upsert(
        { event_id:eventId, user_id:cu.id, status:s.status, role:s.role, notes:s.notes||"", updated_at:new Date().toISOString() },
        { onConflict:"event_id,user_id" }
      );
      if (upsertErr) throw upsertErr;
      // Small delay to let DB propagate before reloading
      await new Promise(r => setTimeout(r, 300));
      await loadSchedule(eventId);
      showToast("Availability saved ✓","green");
    } catch(e) { showToast(e.message,"red"); }
    finally { setSubmitting(false); }
  };

  const removeEntry = async (id, eventId) => {
    await supabase.from("marshal_schedules").delete().eq("id",id);
    await loadSchedule(eventId);
    showToast("Entry removed");
  };

  if (!cu) return (
    <div className="page-content-sm" style={{ textAlign:"center", paddingTop:60 }}>
      <div style={{ ...MONO, fontSize:11, color:MUTED, letterSpacing:".2em" }}>LOG IN TO VIEW MARSHAL SCHEDULE</div>
    </div>
  );
  if (!cu.canMarshal && cu.role !== "admin") return (
    <div className="page-content-sm" style={{ textAlign:"center", paddingTop:60 }}>
      <div style={{ ...MIL, fontSize:22, color:MUTED, textTransform:"uppercase", marginBottom:12 }}>Marshal Access Only</div>
      <div style={{ ...MONO, fontSize:11, color:MUTED, letterSpacing:".15em" }}>Contact admin to be added as a marshal</div>
    </div>
  );

  return (
    <div>
      {/* Hero */}
      <div style={{ background:"linear-gradient(180deg,#0c1a05,#080b06)", borderBottom:`1px solid ${BORDER2}`, padding:"40px 24px 32px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px),repeating-linear-gradient(90deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px)", pointerEvents:"none" }}/>
        <div style={{ maxWidth:900, margin:"0 auto", position:"relative", zIndex:1 }}>
          <div style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".3em", marginBottom:12 }}>◈ SWINDON AIRSOFT · MARSHAL COMMAND</div>
          <div style={{ ...MIL, fontSize:"clamp(26px,5vw,48px)", fontWeight:700, color:"#fff", textTransform:"uppercase", letterSpacing:".08em", lineHeight:.9, marginBottom:8 }}>
            MARSHAL <span style={{ color:ACCENT }}>SCHEDULE</span>
          </div>
          <div style={{ ...MONO, fontSize:10, color:MUTED }}>◆ SET YOUR AVAILABILITY FOR UPCOMING GAME DAYS ◆</div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth:900 }}>
        {upcomingEvents.length === 0 ? (
          <div style={{ textAlign:"center", padding:80, ...MONO, fontSize:10, color:MUTED, letterSpacing:".2em" }}>NO UPCOMING EVENTS</div>
        ) : upcomingEvents.map(ev => {
          const rows = schedules[ev.id] || [];
          const myRow = rows.find(r => r.user_id === cu.id);
          const mySt  = myStatus[ev.id] || { status:"available", role:"marshal", notes:"" };
          const available   = rows.filter(r => r.status !== "unavailable");
          const unavailable = rows.filter(r => r.status === "unavailable");

          return (
            <div key={ev.id} style={{ background:BG2, border:`1px solid ${BORDER}`, marginBottom:16, overflow:"hidden" }}>
              {/* Event header */}
              <div style={{ background:BG3, borderBottom:`1px solid ${BORDER}`, padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                <div>
                  <div style={{ ...MIL, fontSize:16, fontWeight:700, color:"#fff", textTransform:"uppercase", letterSpacing:".06em" }}>{ev.title}</div>
                  <div style={{ ...MONO, fontSize:10, color:MUTED, marginTop:3 }}>{fmtDate(ev.date)} · {ev.time||"09:00"}</div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ ...MONO, fontSize:9, color:ACCENT, border:`1px solid rgba(200,255,0,.3)`, padding:"3px 10px" }}>{available.length} AVAILABLE</span>
                  {unavailable.length > 0 && <span style={{ ...MONO, fontSize:9, color:"#ef5350", border:`1px solid rgba(239,83,80,.3)`, padding:"3px 10px" }}>{unavailable.length} UNAVAILABLE</span>}
                  <button onClick={() => loadSchedule(ev.id)} style={{ ...MONO, fontSize:9, color:MUTED, background:"none", border:`1px solid ${BORDER}`, padding:"3px 8px", cursor:"pointer" }} title="Refresh">↻</button>
                </div>
              </div>

              <div style={{ padding:"16px 20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                {/* My availability */}
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <div style={{ ...MONO, fontSize:9, letterSpacing:".2em", color:MUTED }}>MY AVAILABILITY</div>
                    {schedules[ev.id]?.find(r => r.user_id === cu?.id)?.admin_approved && (
                      <span style={{ ...MONO, fontSize:8, letterSpacing:".1em", color:"#81c784", border:"1px solid rgba(129,199,132,.4)", padding:"1px 8px", background:"rgba(129,199,132,.06)" }}>✓ YOU'RE APPROVED</span>
                    )}
                  </div>
                  {/* Status buttons */}
                  <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                    {Object.entries(STATUS_CFG).map(([val,cfg]) => (
                      <button key={val} onClick={() => setMyStatus(p => ({ ...p, [ev.id]:{ ...mySt, status:val }}))}
                        style={{ ...MONO, fontSize:10, letterSpacing:".1em", padding:"6px 12px", border:`1px solid ${mySt.status===val?cfg.border:BORDER}`, background:mySt.status===val?cfg.bg:"transparent", color:mySt.status===val?cfg.color:MUTED, cursor:"pointer", transition:"all .12s" }}>
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                  {/* Role select */}
                  <div style={{ marginBottom:10 }}>
                    <select value={mySt.role} onChange={e => setMyStatus(p => ({ ...p, [ev.id]:{ ...mySt, role:e.target.value }}))}
                      style={{ background:BG3, border:`1px solid ${BORDER2}`, color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:11, padding:"7px 10px", width:"100%" }}>
                      {Object.entries(ROLE_CFG).map(([val,cfg]) => <option key={val} value={val}>{cfg.icon} {cfg.label}</option>)}
                    </select>
                  </div>
                  {/* Notes */}
                  {expandedNotes[ev.id] ? (
                    <textarea value={mySt.notes} onChange={e => setMyStatus(p => ({ ...p, [ev.id]:{ ...mySt, notes:e.target.value }}))}
                      rows={2} placeholder="Any notes (optional)…" style={{ width:"100%", background:BG3, border:`1px solid ${BORDER2}`, color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:11, padding:"7px 10px", marginBottom:8 }}/>
                  ) : (
                    <button onClick={() => setExpandedNotes(p=>({...p,[ev.id]:true}))}
                      style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".1em", background:"none", border:"none", cursor:"pointer", padding:"0 0 8px", textDecoration:"underline" }}>+ Add note</button>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={() => submit(ev.id)} disabled={submitting}>
                    {submitting?"Saving…":myRow?"Update":"Submit"}
                  </button>
                  {myRow && <button className="btn btn-ghost btn-sm" style={{ marginLeft:8 }} onClick={() => removeEntry(myRow.id, ev.id)}>Remove</button>}
                </div>

                {/* Team roster */}
                <div>
                  <div style={{ ...MONO, fontSize:9, letterSpacing:".2em", color:MUTED, marginBottom:12 }}>MARSHAL ROSTER</div>
                  {loading[ev.id] ? (
                    <div style={{ ...MONO, fontSize:10, color:MUTED }}>Loading…</div>
                  ) : rows.length === 0 ? (
                    <div style={{ ...MONO, fontSize:10, color:MUTED }}>No responses yet</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      {rows.map(r => {
                        const sc = STATUS_CFG[r.status] || STATUS_CFG.available;
                        const rc = ROLE_CFG[r.role] || ROLE_CFG.marshal;
                        const displayName = r.profile?.callsign || r.profile?.name || "Unknown";
                        return (
                          <React.Fragment key={r.id}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:BG3, border:`1px solid ${BORDER}` }}>
                            <div style={{ width:28, height:28, borderRadius:"50%", background:"#080b06", border:`1px solid ${BORDER2}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:11, fontWeight:700, color:ACCENT, flexShrink:0, ...MIL }}>
                              {r.profile?.profile_pic
                                ? <img src={r.profile.profile_pic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{e.target.style.display="none";}}/>
                                : displayName[0]?.toUpperCase()}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ ...MIL, fontSize:12, fontWeight:700, color:"#fff", textTransform:"uppercase", letterSpacing:".04em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{displayName}</div>
                              <div style={{ ...MONO, fontSize:8, color:MUTED }}>{rc.icon} {rc.label}</div>
                            </div>
                            <span style={{ ...MONO, fontSize:8, letterSpacing:".1em", color:sc.color, border:`1px solid ${sc.border}`, padding:"1px 6px", flexShrink:0 }}>{sc.label}</span>
                            {r.admin_approved && (
                              <span style={{ ...MONO, fontSize:8, letterSpacing:".1em", color:"#81c784", border:"1px solid rgba(129,199,132,.4)", padding:"1px 6px", background:"rgba(129,199,132,.06)", flexShrink:0 }}>✓ APPROVED</span>
                            )}
                            {cu.role === "admin" && (
                              <button onClick={() => removeEntry(r.id,ev.id)} style={{ background:"none", border:"none", color:"#ef5350", cursor:"pointer", fontSize:12, flexShrink:0 }}>✕</button>
                            )}
                          </div>
                          {r.notes ? (
                            <div style={{ ...MONO, fontSize:9, color:MUTED, padding:"4px 10px 6px 48px", fontStyle:"italic" }}>
                              💬 {r.notes}
                            </div>
                          ) : null}
                        </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
