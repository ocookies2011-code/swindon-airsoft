// admin/AdminWaivers.jsx — waiver review panel
import { PlayerLink } from '../utils/PlayerLink';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { WaiverModal, fmtDate, gmtShort, sendEmail, useMobile } from "../utils";
import { logAction } from "./adminHelpers";

function AdminWaivers({ data, updateUser, showToast, embedded, filterUnsigned, cu }) {
  const [view, setView]                     = useState(null);
  const [localUsers, setLocalUsers]         = useState(null);
  const [sendingReminderFor, setSendingReminderFor] = useState(null);
  const [deleteConfirm, setDeleteConfirm]   = useState(null); // user to delete
  const [deleting, setDeleting]             = useState(false);

  const deleteAccount = async (u) => {
    setDeleting(true);
    try {
      await supabase.functions.invoke("delete-user", { body: { userId: u.id } });
      showToast(`${u.name}'s account deleted`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Account deleted (unsigned waiver)", detail: `${u.name} <${u.email}>` });
      setDeleteConfirm(null);
      // Refresh user list
      api.profiles.getAll().then(list => setLocalUsers(list.map(normaliseProfile))).catch(() => {});
    } catch(e) {
      showToast("Delete failed: " + (e.message || String(e)), "red");
    } finally {
      setDeleting(false);
    }
  };

  // Days since account was created
  const daysSince = (u) => {
    const created = u.createdAt || u.created_at;
    if (!created) return null;
    return Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
  };

  const daysBadge = (u) => {
    const d = daysSince(u);
    if (d === null) return null;
    const daysLeft = 60 - d;
    const color = d >= 60 ? "var(--red)" : d >= 30 ? "var(--gold)" : "var(--accent)";
    const bg    = d >= 60 ? "rgba(239,68,68,.1)" : d >= 30 ? "rgba(245,158,11,.1)" : "rgba(200,255,0,.08)";
    const border= d >= 60 ? "rgba(239,68,68,.3)" : d >= 30 ? "rgba(245,158,11,.3)" : "rgba(200,255,0,.2)";
    return (
      <div style={{ textAlign:"center" }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color, lineHeight:1 }}>{d}</div>
        <div style={{ fontSize:9, color, fontFamily:"'Share Tech Mono',monospace", letterSpacing:".08em" }}>DAYS</div>
        {daysLeft > 0
          ? <div style={{ fontSize:9, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginTop:2 }}>{daysLeft}d left</div>
          : <div style={{ fontSize:9, color:"var(--red)", fontFamily:"'Share Tech Mono',monospace", marginTop:2, fontWeight:800 }}>OVERDUE</div>
        }
      </div>
    );
  };

  const sendWaiverReminder = async (u) => {
    if (!u.email) { showToast("No email address on file for this player.", "red"); return; }
    setSendingReminderFor(u.id);
    try {
      const htmlContent = `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:32px 24px;max-width:600px;margin:0 auto">
        <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="160" style="display:block;margin:0 0 8px;height:auto;" />
        <div style="height:2px;background:#1a2808;margin-bottom:24px"></div>
        <div style="font-size:14px;margin-bottom:16px">Hi ${u.name},</div>
        <div style="font-size:14px;line-height:1.8">
          <p>This is a friendly reminder that you have not yet signed your Swindon Airsoft waiver for <strong>${new Date().getFullYear()}</strong>.</p>
          <p>Waivers must be signed before you can participate in any game days. Please log in to your account and complete your waiver as soon as possible.</p>
          <p style="margin-top:24px">
            <a href="https://www.swindon-airsoft.com" style="display:inline-block;background:#c8ff00;color:#000;font-weight:700;padding:12px 28px;text-decoration:none;border-radius:3px;font-family:'Oswald','Barlow Condensed',Arial,sans-serif;font-size:14px;letter-spacing:.08em">
              SIGN YOUR WAIVER →
            </a>
          </p>
          <p style="font-size:13px;color:#888;margin-top:8px">Log in and navigate to the Waiver section of your account.</p>
        </div>
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1a2808;font-size:11px;color:#555">
          Swindon Airsoft — Please do not reply to this address. Contact us via the website if you need help.
        </div>
      </div>`;
      await sendEmail({ toEmail: u.email, toName: u.name, subject: `Action required: Sign your ${new Date().getFullYear()} waiver — Swindon Airsoft`, htmlContent });
      showToast(`✅ Reminder sent to ${u.name}`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver reminder sent", detail: `${u.name} <${u.email}>` });
    } catch(e) {
      showToast("Failed to send reminder: " + (e.message || String(e)), "red");
    } finally {
      setSendingReminderFor(null);
    }
  };

  useEffect(() => {
    api.profiles.getAll()
      .then(list => setLocalUsers(list.map(normaliseProfile)))
      .catch(() => {});
  }, []);

  const allUsers = localUsers ?? data.users;
  const withWaiver = allUsers.filter(u => u.role !== 'admin' && (u.waiverData || u.waiverPending));
  const displayUsers = filterUnsigned
    ? allUsers.filter(u => u.role === 'player' && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear()))
    : withWaiver;

  const approve = (u) => {
    // Check if this is a removal request
    if (u.waiverPending?._removeExtra) {
      const idx = u.waiverPending._extraIndex;
      const updated = (u.extraWaivers || []).filter((_, ei) => ei !== idx);
      updateUser(u.id, { extraWaivers: updated, waiverPending: null });
      showToast("Waiver removal approved!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Extra waiver removal approved", detail: `Player: ${u.name} — removed: ${u.waiverPending._playerName}` });
    } else {
      // waiverPending can be { waiverData, extraWaivers } or a raw waiver object (legacy)
      const newWaiverData = u.waiverPending?.waiverData ?? u.waiverPending;
      const newExtraWaivers = u.waiverPending?.extraWaivers !== undefined
        ? u.waiverPending.extraWaivers
        : u.extraWaivers;
      updateUser(u.id, {
        waiverData: newWaiverData,
        extraWaivers: newExtraWaivers,
        waiverPending: null,
        waiverSigned: true,
        waiverYear: new Date().getFullYear(),
      });
      showToast("Waiver changes approved!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver changes approved", detail: u.name });
    }
    setView(null);
  };
  const reject = (u) => {
    updateUser(u.id, { waiverPending: null }); showToast("Changes rejected"); setView(null);
    logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver changes rejected", detail: u.name });
  };

  const vw = view ? allUsers.find(u => u.id === view) : null;

  const waiverFields = (w) => [
    ["Name", w.name],
    ["DOB", w.dob],
    ["Address", [w.addr1, w.addr2, w.city, w.county, w.postcode, w.country].filter(Boolean).join(", ") || "—"],
    ["Emergency", w.emergencyName ? `${w.emergencyName} · ${w.emergencyPhone}` : "—"],
    ["Medical", w.medical || "None"],
    ["Minor", w.isChild ? `Yes — Guardian: ${w.guardian}` : "No"],
    ["Signed", gmtShort(w.date)],
  ];

  return (
    <div>
      {!embedded && <div className="page-header"><div><div className="page-title">{filterUnsigned ? "Unsigned Waivers" : "Waivers"}</div><div className="page-sub">{filterUnsigned ? `${displayUsers.length} player(s) without a signed waiver` : `Valid for ${new Date().getFullYear()} calendar year`}</div></div></div>}
      <div className="card" style={{ padding:0 }}>
        <div className="table-wrap"><table className="data-table">
          <thead><tr>
            <th>Player</th>
            <th>Email</th>
            <th>Joined</th>
            {filterUnsigned && <th style={{ textAlign:"center" }}>Days Without Waiver</th>}
            {!filterUnsigned && <><th>Signed</th><th>Year</th></>}
            
            
            {filterUnsigned && <><th></th></>}
          </tr></thead>
          <tbody>
            {displayUsers.map(u => {
              const totalWaivers = 1 + (u.extraWaivers?.length || 0);
              const d = daysSince(u);
              return (
                <tr key={u.id} style={{ background: d !== null && d >= 60 ? "rgba(239,68,68,.04)" : d >= 30 ? "rgba(245,158,11,.03)" : "transparent" }}>
                  <td style={{ fontWeight: 600 }}><PlayerLink id={u.id} name={u.name} onNameClick={() => setView(u)} /></td>
                  <td style={{ fontSize:12, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{u.email}</td>
                  <td style={{ fontSize:12, color:"var(--muted)" }}>{u.createdAt ? fmtDate(u.createdAt.slice(0,10)) : "—"}</td>
                  {filterUnsigned && <td style={{ textAlign:"center" }}>{daysBadge(u)}</td>}
                  {!filterUnsigned && <><td>{u.waiverSigned ? <span className="tag tag-green">✓</span> : <span className="tag tag-red">✗</span>}</td><td>{u.waiverYear || "—"}</td></>}
                  
                  
                  {filterUnsigned && (
                    <>
                      <td>
                        <button
                          className="btn btn-sm"
                          disabled={sendingReminderFor === u.id}
                          onClick={() => sendWaiverReminder(u)}
                          style={{ background:"rgba(200,160,0,.12)", border:"1px solid rgba(200,160,0,.35)", color:"var(--gold)", whiteSpace:"nowrap" }}
                        >
                          {sendingReminderFor === u.id ? "⏳ Sending…" : "📧 Remind"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => setDeleteConfirm(u)}
                          style={{ whiteSpace:"nowrap" }}
                        >
                          🗑 Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {displayUsers.length === 0 && <tr><td colSpan={filterUnsigned ? 5 : 9} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>{filterUnsigned ? "All players have signed waivers ✓" : "No waivers on file"}</td></tr>}
          </tbody>
        </table></div>
      </div>

      {vw && (() => {
        const allWaivers = [vw.waiverData, ...(vw.extraWaivers || [])].filter(Boolean);
        return (
          <div className="overlay" onClick={() => setView(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
              <div className="modal-title">📋 Waivers — {vw.name}</div>

              {/* Player tabs */}
              {allWaivers.length > 1 && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:16 }}>
                  {allWaivers.map((w, i) => (
                    <span key={i} style={{ padding:"4px 12px", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", textTransform:"uppercase", background:"var(--accent)", color:"#000", borderRadius:2 }}>
                      {w.name || `Player ${i+1}`}{i === 0 ? " ★" : ""}
                    </span>
                  ))}
                </div>
              )}

              {/* All waivers */}
              {allWaivers.map((w, i) => (
                <div key={i} style={{ marginBottom:20, paddingBottom:20, borderBottom: i < allWaivers.length - 1 ? "1px solid #2a2a2a" : "none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase" }}>
                      {allWaivers.length > 1 ? `PLAYER ${i+1}${i === 0 ? " (PRIMARY)" : " (ADDITIONAL)"}` : "WAIVER DETAILS"}
                    </div>
                    {i > 0 && (
                      <button onClick={() => {
                        const updated = (vw.extraWaivers || []).filter((_, ei) => ei !== i - 1);
                        updateUser(vw.id, { extraWaivers: updated });
                        showToast("Waiver removed");
                        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver removed", detail: `Player: ${vw.name}` });
                        setView(null);
                      }} style={{ background:"none", border:"1px solid var(--red)", color:"var(--red)", fontSize:11, padding:"2px 10px", cursor:"pointer", fontFamily:"'Oswald','Barlow Condensed',sans-serif", letterSpacing:".08em" }}>
                        🗑 REMOVE
                      </button>
                    )}
                  </div>
                  {waiverFields(w).map(([k, v]) => (
                    <div key={k} style={{ display:"flex", gap:12, padding:"7px 0", borderBottom:"1px solid var(--border)", fontSize:13 }}>
                      <span className="text-muted" style={{ minWidth:140 }}>{k}:</span>
                      <span>{v}</span>
                    </div>
                  ))}
                  {w.sigData && (
                    <div style={{ marginTop:10 }}>
                      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:4, letterSpacing:".08em" }}>SIGNATURE</div>
                      <div style={{ background:"#0d0d0d", border:"1px solid #333", padding:8, display:"inline-block", borderRadius:4 }}>
                        <img src={w.sigData} alt="Signature" style={{ maxWidth:300, height:"auto", display:"block" }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Pending changes */}
              {vw.waiverPending && (
                <div style={{ marginTop:16, padding:16, background:"#1a1200", border:"1px solid #4a3800", borderRadius:4 }}>
                  {vw.waiverPending._removeExtra ? (
                    <>
                      <div className="alert alert-red mb-2">🗑 Player has requested removal of an additional waiver</div>
                      <div style={{ fontSize:13, color:"var(--muted)", marginBottom:12 }}>
                        Request to remove waiver for: <strong style={{ color:"var(--text)" }}>{vw.waiverPending._playerName}</strong><br/>
                        <span style={{ fontSize:11 }}>Requested: {gmtShort(vw.waiverPending._requestedAt)}</span>
                      </div>
                      <div className="gap-2 mt-2">
                        <button className="btn btn-danger" onClick={() => approve(vw)}>Approve Removal</button>
                        <button className="btn btn-ghost" onClick={() => reject(vw)}>Reject</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="alert alert-gold mb-2">⚠️ Player has submitted waiver changes for approval</div>
                      <div style={{ fontSize:11, letterSpacing:".1em", fontWeight:700, color:"var(--muted)", marginBottom:10 }}>PROPOSED CHANGES</div>
                      {waiverFields(vw.waiverPending?.waiverData ?? vw.waiverPending).map(([k, v]) => {
                        const oldVal = vw.waiverData ? waiverFields(vw.waiverData).find(([ok]) => ok === k)?.[1] : null;
                        const changed = oldVal !== null && v !== oldVal;
                        return (
                          <div key={k} style={{ display:"flex", gap:12, padding: changed ? "7px 8px" : "7px 0", borderBottom:"1px solid var(--border)", fontSize:13, background: changed ? "#2d1e0a" : "transparent", borderRadius: changed ? 4 : 0 }}>
                            <span className="text-muted" style={{ minWidth:140 }}>{k}:</span>
                            <span style={{ color: changed ? "var(--gold)" : "var(--text)" }}>{v}</span>
                            {changed && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:"auto" }}>CHANGED</span>}
                          </div>
                        );
                      })}
                      <div className="gap-2 mt-2">
                        <button className="btn btn-primary" onClick={() => approve(vw)}>Approve Changes</button>
                        <button className="btn btn-danger" onClick={() => reject(vw)}>Reject</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button className="btn btn-ghost mt-2" style={{ width:"100%" }} onClick={() => setView(null)}>Close</button>
            </div>
          </div>
        );
      })()}
      {/* ── Delete Account Confirm ── */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom:12 }}>
              <div className="hazard-stripe red" />
            </div>
            <div className="modal-title" style={{ color:"var(--red)" }}>Delete Account?</div>
            <div style={{ background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.2)", padding:"12px 16px", margin:"12px 0 16px" }}>
              <div style={{ fontWeight:700, fontSize:15, color:"#fff", marginBottom:4 }}>{deleteConfirm.name}</div>
              <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{deleteConfirm.email}</div>
              {daysSince(deleteConfirm) !== null && (
                <div style={{ fontSize:11, color:"var(--red)", fontFamily:"'Share Tech Mono',monospace", marginTop:6, fontWeight:700 }}>
                  {daysSince(deleteConfirm)} days without a signed waiver
                </div>
              )}
            </div>
            <p style={{ fontSize:13, color:"var(--muted)", marginBottom:20, lineHeight:1.6 }}>
              This will <strong style={{ color:"#fff" }}>permanently delete</strong> this player's account, all their bookings, profile data, and login credentials. <strong style={{ color:"var(--red)" }}>This cannot be undone.</strong>
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteAccount(deleteConfirm)} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete Account Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Orders (inline, used as tab inside AdminShop) ──────────

export { AdminWaivers };
