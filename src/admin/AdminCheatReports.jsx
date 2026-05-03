// admin/AdminCheatReports.jsx
import { PlayerLink } from '../utils/PlayerLink';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtDate, gmtShort, useMobile } from "../utils";
import { logAction } from "./adminHelpers";

function AdminCheatReports({ data, showToast, cu, goToPlayer }) {
  const [reports, setReports]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [statusFilter, setFilter]     = useState("pending");
  const [adminNotes, setAdminNotes]   = useState("");
  const [linking, setLinking]         = useState(false);
  const [linkSearch, setLinkSearch]   = useState("");
  const [busy, setBusy]               = useState(false);
  const [cardColor, setCardColor]     = useState("green");
  const [cardReason, setCardReason]   = useState("");
  const [issuingCard, setIssuingCard] = useState(false);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("cheat_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (isMounted.current) setReports(rows || []);
    } catch (e) { if (isMounted.current) showToast("Failed to load reports: " + e.message, "red"); }
    finally { if (isMounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const openReport = (r) => {
    setSelected(r);
    setAdminNotes(r.admin_notes || "");
    setLinking(false);
    setLinkSearch("");
    setCardColor("green");
    setCardReason("");
    setIssuingCard(false);
  };

  const updateReport = async (id, patch) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("cheat_reports").update(patch).eq("id", id);
      if (error) throw error;
      setReports(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
      if (selected?.id === id) setSelected(prev => ({ ...prev, ...patch }));
      showToast("Report updated.");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const saveNotes = () => updateReport(selected.id, { admin_notes: adminNotes });

  const setStatus = (status) => updateReport(selected.id, { status });

  const linkPlayer = (player) => {
    updateReport(selected.id, { linked_player_id: player.id });
    setLinking(false);
  };

  const unlinkPlayer = () => updateReport(selected.id, { linked_player_id: null });

  const issueCard = async () => {
    if (!selected?.linked_player_id) { showToast("Link a player first before issuing a card", "red"); return; }
    if (cardColor !== "green" && !cardReason.trim()) { showToast("Please enter a reason for the card", "red"); return; }
    setIssuingCard(true);
    try {
      const { error } = await supabase.from("profiles").update({
        card_status:    cardColor === "green" ? "none" : cardColor,
        card_reason:    cardColor === "green" ? null : cardReason.trim(),
        card_issued_at: cardColor === "green" ? null : new Date().toISOString(),
      }).eq("id", selected.linked_player_id);
      if (error) throw error;
      // Mark report as reviewed automatically
      await updateReport(selected.id, { status: "reviewed", admin_notes: (adminNotes ? adminNotes + "\n\n" : "") + `Card issued: ${cardColor === "green" ? "Cleared (no action)" : cardColor.toUpperCase()} — ${cardReason.trim() || "No reason given"} (${new Date().toLocaleDateString("en-GB")})` });
      setAdminNotes(prev => (prev ? prev + "\n\n" : "") + `Card issued: ${cardColor === "green" ? "Cleared (no action)" : cardColor.toUpperCase()} — ${cardReason.trim() || "No reason given"} (${new Date().toLocaleDateString("en-GB")})`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: `Card issued via cheat report`, detail: `Player: ${data.users.find(u => u.id === selected.linked_player_id)?.name || selected.linked_player_id} | Card: ${cardColor === "green" ? "cleared" : cardColor} | Reason: ${cardReason.trim() || "none"} | Report #${selected.id}` });
      showToast(cardColor === "green" ? "✅ Player cleared — no action taken." : `✅ ${cardColor.charAt(0).toUpperCase() + cardColor.slice(1)} card issued!`);
      setCardReason("");
      setCardColor("green");
    } catch (e) {
      showToast("Failed to issue card: " + e.message, "red");
    } finally {
      setIssuingCard(false);
    }
  };

  const filtered  = reports.filter(r => statusFilter === "all" || r.status === statusFilter);
  const pending   = reports.filter(r => r.status === "pending").length;
  const reviewed  = reports.filter(r => r.status === "reviewed").length;
  const dismissed = reports.filter(r => r.status === "dismissed").length;

  const STATUS_BADGE = { pending: { bg: "rgba(200,160,0,.15)", color: "var(--gold)", border: "rgba(200,160,0,.35)", label: "Pending" }, reviewed: { bg: "rgba(200,255,0,.08)", color: "var(--accent)", border: "rgba(200,255,0,.25)", label: "Reviewed" }, dismissed: { bg: "rgba(120,120,120,.12)", color: "var(--muted)", border: "rgba(120,120,120,.2)", label: "Dismissed" } };

  const matchingPlayers = data.users.filter(u =>
    u.role === "player" && linkSearch.trim() &&
    (u.name?.toLowerCase().includes(linkSearch.toLowerCase()) || u.email?.toLowerCase().includes(linkSearch.toLowerCase()))
  ).slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Cheat Reports</div>
          <div className="page-sub">Confidential — not visible to players</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      {/* Summary bar */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        {[["all","All",reports.length,"var(--muted)"],["pending","Pending",pending,"var(--gold)"],["reviewed","Reviewed",reviewed,"var(--accent)"],["dismissed","Dismissed",dismissed,"var(--muted)"]].map(([val,label,count,color]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ background: statusFilter===val ? "var(--bg4)" : "transparent", border:`1px solid ${statusFilter===val ? "var(--border)" : "transparent"}`, color, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".1em", padding:"6px 14px", cursor:"pointer", borderRadius:4 }}>
            {label} <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>({count})</span>
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns: selected ? "1fr 1.4fr" : "1fr", gap:16 }}>
        {/* Report list */}
        <div>
          {loading ? <div style={{ textAlign:"center", padding:40, color:"var(--muted)", fontSize:12 }}>Loading…</div>
          : filtered.length === 0 ? <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)", fontSize:13 }}>No {statusFilter !== "all" ? statusFilter : ""} reports.</div>
          : filtered.map(r => {
            const sb = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
            const isActive = selected?.id === r.id;
            return (
              <div key={r.id} onClick={() => openReport(r)} className="card mb-1" style={{ cursor:"pointer", border:`1px solid ${isActive ? "var(--accent)" : "var(--border)"}`, background: isActive ? "rgba(200,255,0,.04)" : undefined, padding:"12px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>Report #{r.id}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>
                      Reported by: <strong style={{ color:"var(--text)" }}>{r.reporter_name || "Anonymous"}</strong>
                    </div>
                    {r.reported_name && <div style={{ fontSize:11, color:"var(--muted)" }}>Accused: <strong style={{ color:"#ef5350" }}>{r.reported_name}</strong></div>}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                    <span style={{ background:sb.bg, color:sb.color, border:`1px solid ${sb.border}`, fontSize:10, fontWeight:700, letterSpacing:".1em", padding:"2px 8px", borderRadius:3, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase" }}>{sb.label}</span>
                    <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
                <div style={{ fontSize:11, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.description}</div>
                {r.linked_player_id && <div style={{ marginTop:6, fontSize:10, color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace" }}>🔗 Linked: {data.users.find(u => u.id === r.linked_player_id)?.name || "Player"}</div>}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ position:"sticky", top:16, alignSelf:"start" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".1em" }}>REPORT #{selected.id}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕ Close</button>
            </div>

            {/* Status controls */}
            <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
              {["pending","reviewed","dismissed"].map(s => (
                <button key={s} className={`btn btn-sm ${selected.status === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus(s)} disabled={busy || selected.status === s} style={{ textTransform:"capitalize" }}>{s}</button>
              ))}
            </div>

            <div style={{ display:"grid", gap:10, marginBottom:16 }}>
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Reporter</label>
                <div style={{ fontWeight:600, padding:"6px 0" }}>{selected.reporter_name || "Anonymous"}</div>
              </div>
              {selected.reported_name && (
                <div className="form-group" style={{ margin:0 }}>
                  <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Accused Player Name</label>
                  <div style={{ fontWeight:600, color:"#ef5350", padding:"6px 0" }}>{selected.reported_name}</div>
                </div>
              )}
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Video Evidence</label>
                <a href={selected.video_url} target="_blank" rel="noopener noreferrer" style={{ display:"block", color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace", fontSize:11, wordBreak:"break-all", padding:"6px 0", textDecoration:"underline" }}>{selected.video_url}</a>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Description</label>
                <div style={{ fontSize:13, lineHeight:1.7, color:"var(--text)", padding:"8px 0", whiteSpace:"pre-wrap" }}>{selected.description}</div>
              </div>
              <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>Submitted: {new Date(selected.created_at).toLocaleString("en-GB")}</div>
            </div>

            {/* Link to player profile */}
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:14, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>Link to Player Profile</div>
              {selected.linked_player_id ? (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, color:"var(--accent)", fontWeight:600 }}>🔗 {data.users.find(u => u.id === selected.linked_player_id)?.name || "Player"}</span>
                  <button className="btn btn-sm btn-danger" onClick={unlinkPlayer} disabled={busy}>Unlink</button>
                </div>
              ) : linking ? (
                <div>
                  <input autoFocus value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="Search player name or email…" style={{ width:"100%", marginBottom:8 }} />
                  {matchingPlayers.length > 0 && (
                    <div style={{ border:"1px solid var(--border)", borderRadius:4, overflow:"hidden" }}>
                      {matchingPlayers.map(p => (
                        <div key={p.id} onClick={() => linkPlayer(p)} style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, borderBottom:"1px solid var(--border)" }}
                          onMouseEnter={e => e.currentTarget.style.background="var(--bg4)"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          <strong><PlayerLink id={p.id} name={p.name} goToPlayer={goToPlayer} /></strong> <span style={{ color:"var(--muted)", fontSize:11 }}>{p.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }} onClick={() => setLinking(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => setLinking(true)}>🔗 Link to Player</button>
              )}
              {selected.linked_player_id && (
                <div style={{ marginTop:8, fontSize:11, color:"var(--muted)" }}>
                  This report will appear in the player's card warning history when you issue a card.
                </div>
              )}
            </div>

            {/* Issue Card */}
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:14, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>Issue Card to Linked Player</div>
              {!selected.linked_player_id ? (
                <div style={{ fontSize:12, color:"var(--muted)", fontStyle:"italic" }}>Link a player above to issue a card.</div>
              ) : (
                <>
                  {/* Current card status */}
                  {(() => {
                    const p = data.users.find(u => u.id === selected.linked_player_id);
                    const cs = p?.cardStatus || "none";
                    const CARD_LABELS = { none:"✅ Clear", yellow:"🟡 Yellow Card", red:"🔴 Red Card", black:"⚫ Black Card" };
                    const CARD_COLORS = { none:"var(--accent)", yellow:"var(--gold)", red:"var(--red)", black:"#bbb" };
                    return (
                      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:10 }}>
                        Current status: <strong style={{ color: CARD_COLORS[cs] }}>{CARD_LABELS[cs] || cs}</strong>
                        {p?.cardReason && <span style={{ color:"var(--muted)" }}> — {p.cardReason}</span>}
                      </div>
                    );
                  })()}

                  {/* Card selector */}
                  <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                    {[
                      { val:"green",  label:"🟢 Clear",        bg:"rgba(100,200,50,.15)",  border:"rgba(100,200,50,.4)",  textColor:"var(--accent)" },
                      { val:"yellow", label:"🟡 Yellow Card",   bg:"rgba(200,160,0,.15)",   border:"rgba(200,160,0,.4)",   textColor:"var(--gold)" },
                      { val:"red",    label:"🔴 Red Card",      bg:"rgba(220,30,30,.12)",   border:"rgba(220,30,30,.4)",   textColor:"var(--red)" },
                      { val:"black",  label:"⚫ Black Card",    bg:"rgba(60,60,60,.25)",    border:"#555",                textColor:"#ccc" },
                    ].map(c => (
                      <button key={c.val} onClick={() => setCardColor(c.val)}
                        style={{ padding:"6px 12px", border:`2px solid ${cardColor === c.val ? c.border : "transparent"}`, background: cardColor === c.val ? c.bg : "transparent", color: cardColor === c.val ? c.textColor : "var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".1em", cursor:"pointer", borderRadius:3, transition:"all .15s" }}>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Reason — not required for green */}
                  {cardColor !== "green" && (
                    <div style={{ marginBottom:10 }}>
                      <label style={{ fontSize:10, letterSpacing:".12em", color:"var(--muted)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Reason <span style={{ color:"var(--red)" }}>*</span></label>
                      <input value={cardReason} onChange={e => setCardReason(e.target.value)} placeholder={`Reason for ${cardColor} card…`} style={{ width:"100%" }} />
                    </div>
                  )}

                  <button
                    className={`btn btn-sm ${cardColor === "green" ? "btn-ghost" : cardColor === "yellow" ? "btn-primary" : "btn-danger"}`}
                    onClick={issueCard}
                    disabled={issuingCard || busy || (cardColor !== "green" && !cardReason.trim())}
                    style={{ fontWeight:700 }}>
                    {issuingCard ? "Issuing…" : cardColor === "green" ? "✅ Clear Player" : `Issue ${cardColor.charAt(0).toUpperCase() + cardColor.slice(1)} Card`}
                  </button>

                  <div style={{ marginTop:8, fontSize:10, color:"var(--muted)", lineHeight:1.6 }}>
                    Issuing a card will update the player's profile immediately. The report will be automatically marked as <strong>Reviewed</strong>.
                  </div>
                </>
              )}
            </div>

            {/* Admin notes */}
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:14 }}>
              <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase", display:"block", marginBottom:6 }}>Admin Notes (confidential)</label>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={4} placeholder="Internal notes about this report…" style={{ width:"100%", resize:"vertical" }} />
              <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={saveNotes} disabled={busy}>{busy ? "Saving…" : "Save Notes"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Players ─────────────────────────────────────────

export { AdminCheatReports };
