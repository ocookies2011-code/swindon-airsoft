import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { normaliseProfile } from "./api";
import {
  fmtErr, fmtDate, gmtShort, uid,
  useMobile,
  sendEmail,
  WaiverModal,
  RankInsignia, DesignationInsignia,
} from "./utils";
import { diffFields, logAction } from "./adminShared";

function AdminPlayers({ data, save, updateUser, showToast, cu }) {
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="players" && ["all","vip","del","waivers"].includes(p[2]) ? p[2] : "all";
  };
  const [edit, setEdit] = useState(null);
  const [viewPlayer, setViewPlayer] = useState(null);
  const [waiverViewPlayer, setWaiverViewPlayer] = useState(null); // inline waiver panel
  const [contactPlayer, setContactPlayer] = useState(null);
  const [contactSubject, setContactSubject] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/players/" + t; };
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [localUsers, setLocalUsers] = useState(null); // null = not yet fetched
  const [playerSearch, setPlayerSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all | player | admin
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEmailSubject, setBulkEmailSubject] = useState("");
  const [bulkEmailBody, setBulkEmailBody] = useState("");
  const [bulkEmailModal, setBulkEmailModal] = useState(false);
  const [squareCustomerSyncing, setSquareCustomerSyncing] = useState(false);
  const [squareCustomerSyncStatus, setSquareCustomerSyncStatus] = useState(null); // null|"ok"|"error"

  // ── Bulk sync all players to Square Customer Directory ────────
  const syncAllPlayersToSquare = async () => {
    if (!window.confirm("Sync all players to Square Customer Directory? This may take a minute.")) return;
    setSquareCustomerSyncing(true);
    setSquareCustomerSyncStatus(null);
    try {
      const allPlayers = (localUsers || data.users || []).filter(u => u.role === "player" && u.email);
      const { data: result, error } = await supabase.functions.invoke("square-customer-sync", {
        body: { action: "bulk-sync", profiles: allPlayers },
      });
      if (error || !result?.ok) throw new Error(error?.message || result?.error || "Sync failed");
      setSquareCustomerSyncStatus("ok");
      showToast(`✅ ${result.succeeded} players synced to Square${result.failed > 0 ? ` (${result.failed} failed)` : ""}!`);
      setTimeout(() => setSquareCustomerSyncStatus(null), 5000);
    } catch (e) {
      setSquareCustomerSyncStatus("error");
      showToast("Square sync failed: " + e.message, "red");
      setTimeout(() => setSquareCustomerSyncStatus(null), 8000);
    } finally {
      setSquareCustomerSyncing(false);
    }
  };

  const loadUsers = () =>
    api.profiles.getAll()
      .then(list => {
        const users = list.map(normaliseProfile);
        setLocalUsers(users);
        save({ users });
      })
      .catch(e => showToast("Failed to load players: " + e.message, "red"));

  // Fetch fresh from DB on mount
  useEffect(() => { loadUsers(); }, []);

  // Wrapper that updates DB then refreshes localUsers
  const updateUserAndRefresh = async (id, patch) => {
    await updateUser(id, patch);
    loadUsers().catch(() => {}); // refresh in background — non-blocking
  };

  // Use local (fresh) users if available, fall back to global data.users
  const allUsers = localUsers ?? data.users;
  const players = allUsers.filter(u => u.role !== "admin");
  const vipApps = players.filter(u => u.vipApplied && u.vipStatus !== "active");
  const roleFiltered = roleFilter === "admin" ? allUsers.filter(u => u.role === "admin")
    : roleFilter === "player" ? allUsers.filter(u => u.role !== "admin")
    : allUsers;
  const filteredPlayers = playerSearch.trim()
    ? roleFiltered.filter(u => {
        const q = playerSearch.toLowerCase();
        return u.name?.toLowerCase().includes(q) ||
               u.email?.toLowerCase().includes(q) ||
               u.phone?.toLowerCase().includes(q) ||
               u.ukara?.toLowerCase().includes(q);
      })
    : roleFiltered;

  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setSavingEdit(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const [delAccountConfirm, setDelAccountConfirm] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [vipApproveModal, setVipApproveModal] = useState(null); // user being approved
  const [vipUkara, setVipUkara] = useState("");
  const [vipApproveBusy, setVipApproveBusy] = useState(false);
  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const deletedName = delAccountConfirm.name;
      const deletedEmail = delAccountConfirm.email || "";
      const deletedId = delAccountConfirm.id;
      await api.profiles.delete(deletedId);
      setLocalUsers(prev => prev ? prev.filter(x => x.id !== deletedId) : prev);
      save({ users: data.users.filter(x => x.id !== deletedId) });
      setDelAccountConfirm(null);
      showToast(`✓ Account permanently deleted: ${deletedName}`, "red");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Player account deleted", detail: `${deletedName} (${deletedEmail}) — ID: ${deletedId}` });
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setDeletingAccount(false); }
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      // Determine vip_applied and vip_expires_at based on status change
      let vipApplied = edit.vipApplied ?? false;
      let vipExpiresAt = edit.vipExpiresAt || null;
      if (edit.vipStatus === "none") {
        // Demoting to None — clear applied flag, player must go through the full apply+pay flow again
        vipApplied   = false;
        vipExpiresAt = null;
      } else if (edit.vipStatus === "active" && !edit.vipExpiresAt) {
        // Manually setting active without an expiry — set 1 year from now
        const exp = new Date();
        exp.setFullYear(exp.getFullYear() + 1);
        vipExpiresAt = exp.toISOString();
      } else if (edit.vipStatus === "expired") {
        vipExpiresAt = null;
      }

      const { error } = await supabase.from('profiles').update({
        name:           edit.name,
        email:          edit.email,
        phone:          edit.phone || '',
        games_attended: edit.gamesAttended,
        vip_status:     edit.vipStatus,
        vip_applied:    vipApplied,
        vip_expires_at: vipExpiresAt,
        ukara:          edit.ukara || '',
        credits:        Number(edit.credits) || 0,
        address:        edit.address || '',
        delete_request: edit.deleteRequest || false,
        admin_notes:    edit.adminNotes || '',
        card_status:    edit.cardStatus  || 'none',
        card_reason:    edit.cardReason  || null,
        card_issued_at: (edit.cardStatus && edit.cardStatus !== 'none') ? (edit.cardIssuedAt || new Date().toISOString()) : null,
        can_marshal:    edit.canMarshal  || false,
        custom_rank:    edit.customRank  || null,
        designation:    edit.designation || null,
      }).eq('id', edit.id);
      if (error) throw new Error(error.message);
      // Role change — direct update (allowed via SECURITY DEFINER trigger for admins)
      const origUser = (localUsers || data.users || []).find(u => u.id === edit.id);
      if (edit.role && edit.role !== origUser?.role) {
        const { error: roleErr } = await supabase.from('profiles').update({ role: edit.role }).eq('id', edit.id);
        if (roleErr) throw new Error('Role update failed: ' + roleErr.message);
      }
      // Refresh from DB and update global state
      const allProfiles = await api.profiles.getAll();
      const updated = allProfiles.map(normaliseProfile);
      setLocalUsers(updated);
      save({ users: updated });
      showToast("Player updated!");
      const before = {
        name:          origUser?.name,
        email:         origUser?.email,
        phone:         origUser?.phone,
        role:          origUser?.role,
        gamesAttended: origUser?.gamesAttended,
        vipStatus:     origUser?.vipStatus,
        ukara:         origUser?.ukara,
        credits:       origUser?.credits,
        adminNotes:    origUser?.adminNotes,
        cardStatus:    origUser?.cardStatus,
        cardReason:    origUser?.cardReason,
        canMarshal:    origUser?.canMarshal,
        customRank:    origUser?.customRank,
        designation:   origUser?.designation,
        deleteRequest: origUser?.deleteRequest,
      };
      const after = {
        name:          edit.name,
        email:         edit.email,
        phone:         edit.phone,
        role:          edit.role,
        gamesAttended: edit.gamesAttended,
        vipStatus:     edit.vipStatus,
        ukara:         edit.ukara,
        credits:       edit.credits,
        adminNotes:    edit.adminNotes,
        cardStatus:    edit.cardStatus,
        cardReason:    edit.cardReason,
        canMarshal:    edit.canMarshal,
        customRank:    edit.customRank,
        designation:   edit.designation,
        deleteRequest: edit.deleteRequest,
      };
      const LABELS = {
        name: "Name", email: "Email", phone: "Phone", role: "Role",
        gamesAttended: "Games", vipStatus: "VIP status", ukara: "UKARA",
        credits: "Credits", adminNotes: "Admin notes", cardStatus: "Card status",
        cardReason: "Card reason", canMarshal: "Can marshal",
        customRank: "Custom rank", designation: "Designation",
        deleteRequest: "Delete request",
      };
      const diff = diffFields(before, after, LABELS);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Player updated", detail: `${edit.name}${diff ? ` — ${diff}` : " (no field changes)"}` });
      // Sync to Square Customer Directory in background
      const updatedPlayer = updated.find(u => u.id === edit.id) || edit;
      supabase.functions.invoke("square-customer-sync", {
        body: { action: "upsert", profile: updatedPlayer },
      }).catch(e => console.warn("Square customer sync failed:", e.message));
      setEdit(null);
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
      setSavingEdit(false);
    }
  };

  // Recalculate every player's game count from actual checked-in bookings in the DB
  const recalcAll = async () => {
    setRecalcBusy(true);
    try {
      const { data: allBookings, error } = await supabase
        .from('bookings').select('user_id').eq('checked_in', true);
      if (error) throw error;

      // Count per user
      const counts = {};
      allBookings.forEach(b => { counts[b.user_id] = (counts[b.user_id] || 0) + 1; });

      // Update each player
      let updated = 0;
      for (const u of players) {
        const correct = counts[u.id] || 0;
        if (u.gamesAttended !== correct) {
          await updateUser(u.id, { gamesAttended: correct });
          updated++;
        }
      }
      // Refresh user list
      const allProfiles = await api.profiles.getAll();
      save({ users: allProfiles.map(normaliseProfile) });
      showToast(`✅ Recalculated! ${updated} player(s) corrected.`);
    } catch (e) {
      showToast("Failed: " + e.message, "red");
    } finally {
      setRecalcBusy(false);
    }
  };

  function WaiverRow({ u, setWaiverViewPlayer, updateUserAndRefresh, cu, showToast }) {
    const wu = u;
    const allWaivers = [wu.waiverData, ...(wu.extraWaivers || [])].filter(Boolean);
    const wFields = (w) => [
      ["Name", w.name], ["DOB", w.dob],
      ["Address", [w.addr1, w.addr2, w.city, w.county, w.postcode].filter(Boolean).join(", ") || "—"],
      ["Emergency", w.emergencyName ? `${w.emergencyName} · ${w.emergencyPhone}` : "—"],
      ["Medical", w.medical || "None"],
      ["Minor", w.isChild ? `Yes — Guardian: ${w.guardian}` : "No"],
      ["Signed", gmtShort(w.date)],
    ];
    const downloadWaiver = () => {
      const rows = (w) => wFields(w).map(([k, v]) => `
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#555;width:140px;border-bottom:1px solid #eee;white-space:nowrap">${k}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${v || "—"}</td>
        </tr>`).join("");
      const sections = allWaivers.map((w, i) => `
        ${allWaivers.length > 1 ? `<h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#888">Player ${i+1}${i===0?" (Primary)":""}</h3>` : ""}
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">${rows(w)}</table>
        ${w.sigData ? `<div style="margin:12px 0"><div style="font-size:11px;color:#888;margin-bottom:4px">SIGNATURE</div><img src="${w.sigData}" style="max-width:300px;border:1px solid #ddd;padding:8px" /></div>` : ""}
      `).join('<hr style="border:none;border-top:2px solid #eee;margin:20px 0"/>');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Waiver — ${wu.name}</title>
        <style>body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;color:#222}
        h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;font-weight:normal;color:#666;margin-bottom:24px}
        @media print{body{padding:16px}}</style></head>
        <body>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #222;padding-bottom:16px;margin-bottom:24px">
            <div>
              <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" style="height:60px;width:auto;display:block;margin-bottom:8px;" />
              <h1 style="margin:0 0 4px;">SWINDON AIRSOFT — WAIVER</h1>
              <h2>Player: ${wu.name} · Downloaded: ${new Date().toLocaleDateString("en-GB")}</h2>
            </div>
          </div>
          ${sections}
          <div style="margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px">
            Generated by Swindon Airsoft Admin · ${new Date().toLocaleString("en-GB")}
          </div>
        </body></html>`;
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `waiver-${wu.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0,10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    };
    return (
      <tr key={`waiver-${wu.id}`}>
        <td colSpan={8} style={{ padding:"0 0 8px 0", background:"transparent", border:"none" }}>
          <div style={{ margin:"0 0 4px 0", background:"#0c1009", border:"1px solid #2a3a10", borderRadius:4, padding:"16px 18px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".12em", color:"var(--accent)", textTransform:"uppercase" }}>
                📋 Waiver — {wu.name}
                {wu.waiverPending && <span className="tag tag-gold" style={{ marginLeft:8, fontSize:10 }}>{wu.waiverPending._removeExtra ? "🗑 Removal Request" : "⚠ Changes Pending"}</span>}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button onClick={downloadWaiver}
                  style={{ background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", padding:"4px 12px", cursor:"pointer", borderRadius:2 }}>
                  ⬇ DOWNLOAD
                </button>
                <button onClick={() => setWaiverViewPlayer(null)} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>
              </div>
            </div>
            {allWaivers.length === 0 && <div style={{ color:"var(--muted)", fontSize:13 }}>No waiver on file.</div>}
            {allWaivers.map((w, i) => (
              <div key={i} style={{ marginBottom: i < allWaivers.length - 1 ? 16 : 0, paddingBottom: i < allWaivers.length - 1 ? 16 : 0, borderBottom: i < allWaivers.length - 1 ? "1px solid #1a2808" : "none" }}>
                {allWaivers.length > 1 && <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:10, letterSpacing:".15em", color:"var(--muted)", marginBottom:8, textTransform:"uppercase" }}>Player {i+1}{i===0?" (Primary)":""}</div>}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,280px),1fr))", gap:"4px 24px" }}>
                  {wFields(w).map(([k, v]) => (
                    <div key={k} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:"1px solid #111", fontSize:12 }}>
                      <span style={{ color:"var(--muted)", minWidth:90, flexShrink:0 }}>{k}:</span>
                      <span style={{ wordBreak:"break-word" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {wu.waiverPending && (
              <div style={{ marginTop:14, padding:"12px 14px", background:"#1a1200", border:"1px solid #4a3800", borderRadius:4 }}>
                {wu.waiverPending._removeExtra ? (
                  <>
                    <div style={{ fontSize:12, color:"var(--gold)", marginBottom:8 }}>Requesting removal of: <strong style={{ color:"#fff" }}>{wu.waiverPending._playerName}</strong></div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button className="btn btn-sm btn-danger" onClick={async () => {
                        const idx = wu.waiverPending._extraIndex;
                        const updated = (wu.extraWaivers || []).filter((_, ei) => ei !== idx);
                        await updateUserAndRefresh(wu.id, { extraWaivers: updated, waiverPending: null });
                        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Extra waiver removal approved", detail: `Player: ${wu.name}` });
                        showToast("Removal approved!"); setWaiverViewPlayer(null);
                      }}>Approve Removal</button>
                      <button className="btn btn-sm btn-ghost" onClick={async () => {
                        await updateUserAndRefresh(wu.id, { waiverPending: null });
                        showToast("Removal rejected."); setWaiverViewPlayer(null);
                      }}>Reject</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:12, color:"var(--gold)", marginBottom:8 }}>⚠ Player submitted waiver changes for approval</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button className="btn btn-sm btn-primary" onClick={async () => {
                        const newWaiverData = wu.waiverPending?.waiverData ?? wu.waiverPending;
                        const newExtraWaivers = wu.waiverPending?.extraWaivers !== undefined
                          ? wu.waiverPending.extraWaivers
                          : wu.extraWaivers;
                        await updateUserAndRefresh(wu.id, {
                          waiverData: newWaiverData,
                          extraWaivers: newExtraWaivers,
                          waiverPending: null,
                          waiverSigned: true,
                          waiverYear: new Date().getFullYear(),
                        });
                        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver changes approved", detail: wu.name });
                        showToast("Changes approved!"); setWaiverViewPlayer(null);
                      }}>Approve Changes</button>
                      <button className="btn btn-sm btn-ghost" onClick={async () => {
                        await updateUserAndRefresh(wu.id, { waiverPending: null });
                        showToast("Changes rejected."); setWaiverViewPlayer(null);
                      }}>Reject</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Players</div>
          <div className="page-sub">{players.length} registered
            {squareCustomerSyncStatus === "ok"    && <span style={{ color:"#81c784", marginLeft:8 }}>✓ Synced to Square</span>}
            {squareCustomerSyncStatus === "error"  && <span style={{ color:"var(--red)", marginLeft:8 }}>⚠ Square sync failed</span>}
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={syncAllPlayersToSquare} disabled={squareCustomerSyncing}
          title="Sync all players to Square Customer Directory"
          style={{ fontSize:11, color:"#4fc3f7", borderColor:"rgba(79,195,247,.3)" }}>
          {squareCustomerSyncing ? "⏳ Syncing…" : "🔄 Sync Players to Square"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={recalcAll} disabled={recalcBusy} title="Recalculate all players' game counts from actual check-ins">
          {recalcBusy ? "Recalculating…" : "🔄 Recalc Game Counts"}
        </button>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>All Players</button>
      </div>

      {tab === "all" && (
        <div className="card">
          {localUsers === null && <div style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Loading players…</div>}
          {/* Role filter tabs */}
          <div style={{ display:"flex", gap:4, marginBottom:10 }}>
            {[
              { key:"all",    label:"ALL",     count: allUsers.length },
              { key:"player", label:"PLAYERS", count: allUsers.filter(u=>u.role!=="admin").length },
              { key:"admin",  label:"ADMINS",  count: allUsers.filter(u=>u.role==="admin").length },
            ].map(({ key, label, count }) => (
              <button key={key} onClick={() => { setRoleFilter(key); setSelectedPlayerIds(new Set()); }}
                style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em",
                  padding:"5px 14px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                  background: roleFilter===key ? "rgba(200,255,0,.12)" : "transparent",
                  borderColor: roleFilter===key ? "rgba(200,255,0,.5)" : "var(--border)",
                  color: roleFilter===key ? "#c8ff00" : "var(--muted)" }}>
                {label} <span style={{ opacity:.7 }}>({count})</span>
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              placeholder="Search by name, email, phone or UKARA…"
              style={{ flex: 1, fontSize: 13 }}
            />
            {playerSearch && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPlayerSearch("")}>✕ Clear</button>
            )}
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {filteredPlayers.length} / {roleFiltered.length}
            </span>
          </div>
          {selectedPlayerIds.size > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:"rgba(200,255,0,.04)", border:"1px solid rgba(200,255,0,.15)", marginBottom:8, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8ff00", letterSpacing:".15em", whiteSpace:"nowrap" }}>{selectedPlayerIds.size} SELECTED</span>
              <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
                style={{ background:"#0c1009", border:"1px solid #2a3a10", color:"#c8e878", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, padding:"4px 8px", outline:"none" }}>
                <option value="">— Choose action —</option>
                <option value="export-csv">📊 Export CSV</option>
                <option value="bulk-email">📧 Send Email</option>
                <option value="yellow-card">🟡 Yellow card</option>
                <option value="clear-card">✅ Clear card</option>
                <option value="add-credit">💰 Add £5 credit</option>
              </select>
              <button className="btn btn-sm btn-primary" disabled={!bulkAction || bulkBusy}
                onClick={async () => {
                  if (!bulkAction) return;
                  const selected = filteredPlayers.filter(u => selectedPlayerIds.has(u.id));
                  if (bulkAction === "bulk-email") { setBulkEmailModal(true); return; }
                  if (bulkAction === "export-csv") {
                    const rows = ["Name,Email,Games,VIP,UKARA,Credits,CardStatus",
                      ...selected.map(u => `"${u.name}","${u.email||""}",${ u.gamesAttended||0},${u.vipStatus==="active"?"YES":"NO"},"${u.ukara||""}",${u.credits||0},"${u.cardStatus||"none"}"`)
                    ].join("\n");
                    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows); a.download = "players-export.csv"; a.click();
                    showToast(`Exported ${selected.length} players`);
                  } else {
                    setBulkBusy(true);
                    try {
                      for (const u of selected) {
                        if (bulkAction === "add-credit") {
                          // Direct DB increment — avoids RLS issues and stale local values
                          const { data: fresh, error: fetchErr } = await supabase
                            .from("profiles").select("credits").eq("id", u.id).single();
                          if (fetchErr) throw fetchErr;
                          const newCredits = (Number(fresh?.credits) || 0) + 5;
                          const { error: updateErr } = await supabase
                            .from("profiles").update({ credits: newCredits }).eq("id", u.id);
                          if (updateErr) throw updateErr;
                          // Update local state
                          save({ users: (data.users||[]).map(x => x.id === u.id ? { ...x, credits: newCredits } : x) });
                        } else {
                          const update = bulkAction === "yellow-card"
                            ? { cardStatus: "yellow" }
                            : { cardStatus: "none" };
                          await updateUserAndRefresh(u.id, update);
                        }
                      }
                      await loadUsers();
                      showToast(`Updated ${selected.length} players`);
                    } catch(e) { showToast("Bulk action failed: " + e.message, "red"); }
                    finally { setBulkBusy(false); }
                  }
                  setSelectedPlayerIds(new Set()); setBulkAction("");
                }}>
                {bulkBusy ? "⏳" : "APPLY"}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setSelectedPlayerIds(new Set()); setBulkAction(""); }}>✕ Clear</button>
            </div>
          )}

          {/* Bulk email modal */}
          {bulkEmailModal && (
            <div className="overlay" onClick={() => setBulkEmailModal(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:500 }}>
                <div className="modal-title">📧 Send Email to {selectedPlayerIds.size} Players</div>
                <div className="form-group">
                  <label>Subject</label>
                  <input value={bulkEmailSubject} onChange={e => setBulkEmailSubject(e.target.value)} placeholder="e.g. Important update from Swindon Airsoft" />
                </div>
                <div className="form-group">
                  <label>Message</label>
                  <textarea rows={6} value={bulkEmailBody} onChange={e => setBulkEmailBody(e.target.value)} placeholder="Write your message here…" />
                </div>
                <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>
                  Will be sent to: {filteredPlayers.filter(u => selectedPlayerIds.has(u.id)).map(u => u.name).join(", ")}
                </div>
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => setBulkEmailModal(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!bulkEmailSubject.trim() || !bulkEmailBody.trim() || bulkBusy}
                    onClick={async () => {
                      const selected = filteredPlayers.filter(u => selectedPlayerIds.has(u.id)).filter(u => u.email);
                      setBulkBusy(true);
                      let sent = 0, failed = 0;
                      for (const u of selected) {
                        try {
                          await sendEmail({ toEmail: u.email, toName: u.name, subject: bulkEmailSubject, htmlContent: `<div style="font-family:sans-serif;color:#ddd;background:#111;padding:24px;border-radius:8px"><div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #333;"><img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="160" style="display:block;margin:0 auto;height:auto;" /></div><p style="white-space:pre-wrap">${bulkEmailBody}</p><hr style="border-color:#333;margin:20px 0"><p style="font-size:12px;color:#666">— Swindon Airsoft</p></div>` });
                          sent++;
                        } catch { failed++; }
                      }
                      showToast(`📧 Sent: ${sent}${failed > 0 ? `, Failed: ${failed}` : ""}`, failed > 0 ? "gold" : "");
                      setBulkBusy(false); setBulkEmailModal(false); setBulkEmailSubject(""); setBulkEmailBody("");
                      setSelectedPlayerIds(new Set()); setBulkAction("");
                    }}>
                    {bulkBusy ? "⏳ Sending…" : `📧 Send to ${filteredPlayers.filter(u=>selectedPlayerIds.has(u.id)&&u.email).length} players`}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap"><table className="data-table">
            <thead><tr>
              <th style={{ width:28 }}>
                <input type="checkbox"
                  checked={filteredPlayers.length > 0 && filteredPlayers.every(u => selectedPlayerIds.has(u.id))}
                  onChange={e => setSelectedPlayerIds(e.target.checked ? new Set(filteredPlayers.map(u=>u.id)) : new Set())} />
              </th>
              <th>Name</th><th>Email</th><th>Games</th><th>VIP / UKARA</th><th>Waiver</th><th>Credits</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredPlayers.map(u => (
                <React.Fragment key={u.id}>
                <tr style={{ background: selectedPlayerIds.has(u.id) ? "rgba(200,255,0,.03)" : "" }}>
                  <td><input type="checkbox" checked={selectedPlayerIds.has(u.id)} onChange={e => setSelectedPlayerIds(prev => { const n = new Set(prev); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} /></td>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.gamesAttended}</td>
                  <td>
                    {u.vipStatus === "active" ? <span className="tag tag-gold">⭐ VIP</span> : u.vipApplied ? <span className="tag tag-blue">Applied</span> : "—"}
                    {u.vipStatus === "active" && u.vipExpiresAt && (
                      <span style={{ fontSize: 10, color: new Date(u.vipExpiresAt) < new Date() ? "var(--red)" : "var(--muted)", marginLeft: 4, fontFamily: "'Share Tech Mono',monospace" }}>
                        exp {new Date(u.vipExpiresAt).toLocaleDateString("en-GB")}
                      </span>
                    )}
                    {u.ukara && <span className="mono" style={{ fontSize: 10, color: "var(--accent)", marginLeft: 6 }}>{u.ukara}</span>}
                  </td>
                  <td>
                    <button onClick={() => setWaiverViewPlayer(waiverViewPlayer?.id === u.id ? null : u)}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:0 }}
                      title="Click to view waiver details">
                      {u.waiverSigned === true && u.waiverYear === new Date().getFullYear()
                        ? <span className="tag tag-green" style={{ cursor:"pointer" }}>✓</span>
                        : <span className="tag tag-red" style={{ cursor:"pointer" }}>✗</span>}
                      {u.waiverPending && <span style={{ fontSize:9, marginLeft:3, color:"var(--gold)" }}>⚠</span>}
                    </button>
                  </td>
                  <td>{u.credits > 0 ? <span className="text-gold">£{u.credits}</span> : "—"}</td>
                  <td>
                    {(!u.cardStatus || u.cardStatus === "none") && <span className="tag tag-green" style={{fontSize:10}}>✓ Clear</span>}
                    {u.cardStatus === "yellow" && <span className="tag" style={{background:"rgba(200,160,0,.15)",color:"var(--gold)",border:"1px solid rgba(200,160,0,.35)",fontSize:10}}>🟡 Warned</span>}
                    {u.cardStatus === "red"    && <span className="tag" style={{background:"rgba(220,30,30,.15)",color:"var(--red)",border:"1px solid rgba(220,30,30,.35)",fontSize:10}}>🔴 Banned</span>}
                    {u.cardStatus === "black"  && <span className="tag" style={{background:"rgba(60,60,60,.3)",color:"#bbb",border:"1px solid #555",fontSize:10}}>⚫ Susp.</span>}
                  </td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {u.adminNotes && <span title={u.adminNotes} style={{ fontSize:12, cursor:"help" }}>🔒</span>}
                      <button className="btn btn-sm btn-ghost" onClick={() => setViewPlayer(u)}>View</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEdit({ ...u })}>Edit</button>
                    </div>
                  </td>
                </tr>
              {waiverViewPlayer?.id === u.id && (
                <WaiverRow u={u} setWaiverViewPlayer={setWaiverViewPlayer} updateUserAndRefresh={updateUserAndRefresh} cu={cu} showToast={showToast} />
              )}
              </React.Fragment>
            ))}
            </tbody>
          </table></div>

          {/* ── Inline VIP Applications ── */}
          {vipApps.length > 0 && (
            <div style={{ marginTop:12, background:"rgba(200,160,0,.05)", border:"1px solid rgba(200,160,0,.2)", borderRadius:4, padding:"16px 18px" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".12em", color:"var(--gold)", textTransform:"uppercase", marginBottom:14 }}>
                ⭐ VIP Applications — {vipApps.length} pending
              </div>
              {vipApps.map(u => (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", padding:"10px 0", borderBottom:"1px solid rgba(200,160,0,.1)" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{u.name}</div>
                    <div style={{ fontSize:11, color:"var(--muted)" }}>{u.email} · {u.gamesAttended} games</div>
                    {u.vipIdImages?.length > 0 && (
                      <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                        {u.vipIdImages.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`ID ${i+1}`} style={{ width:40, height:30, objectFit:"cover", border:"1px solid var(--accent)", borderRadius:2, cursor:"pointer" }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="tag tag-green" style={{ fontSize:10 }}>✓ £40 paid</span>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => {
                      setVipUkara(`UKARA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100).padStart(3,"0")}`);
                      setVipApproveModal(u);
                    }}>✓ Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      await updateUserAndRefresh(u.id, { vipApplied: false });
                      showToast(`VIP application rejected for ${u.name}`, "red");
                      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "VIP application rejected", detail: u.name });
                    }}>✗ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Inline Deletion Requests ── */}
          {allUsers.filter(u => u.deleteRequest).length > 0 && (
            <div style={{ marginTop:12, background:"rgba(220,30,30,.05)", border:"1px solid rgba(220,30,30,.2)", borderRadius:4, padding:"16px 18px" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".12em", color:"var(--red)", textTransform:"uppercase", marginBottom:14 }}>
                🗑 Deletion Requests — {allUsers.filter(u => u.deleteRequest).length}
              </div>
              {allUsers.filter(u => u.deleteRequest).map(u => (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", padding:"10px 0", borderBottom:"1px solid rgba(220,30,30,.1)" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{u.name}</div>
                    <div style={{ fontSize:11, color:"var(--muted)" }}>{u.email}</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-sm btn-danger" onClick={() => setDelAccountConfirm(u)}>Delete Account</button>
                    <button className="btn btn-sm btn-ghost" onClick={async () => {
                      await updateUserAndRefresh(u.id, { deleteRequest: false });
                      showToast(`Deletion request cleared for ${u.name}`);
                    }}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">✏️ Edit — {edit.name}</div>
            <div className="form-row">
              <div className="form-group"><label>Name</label><input value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="form-group"><label>Email</label><input value={edit.email} onChange={e => setEdit(p => ({ ...p, email: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label><input value={edit.phone || ""} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className="form-group"><label>Games Attended</label><input type="number" value={edit.gamesAttended} onChange={e => setEdit(p => ({ ...p, gamesAttended: +e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>VIP Status</label>
                <select value={edit.vipStatus} onChange={e => setEdit(p => ({ ...p, vipStatus: e.target.value }))}>
                  <option value="none">None</option><option value="active">Active VIP</option><option value="expired">Expired</option>
                </select>
                {edit.vipStatus === "none" && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Player will need to apply and pay again to rejoin VIP.</div>
                )}
                {edit.vipStatus === "active" && edit.vipExpiresAt && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Expires: <span style={{ color: new Date(edit.vipExpiresAt) < new Date() ? "var(--red)" : "var(--accent)" }}>
                      {new Date(edit.vipExpiresAt).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                )}
              </div>
              <div className="form-group"><label>UKARA ID</label><input value={edit.ukara || ""} onChange={e => setEdit(p => ({ ...p, ukara: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Credits (£)</label><input type="number" value={edit.credits || 0} onChange={e => setEdit(p => ({ ...p, credits: +e.target.value }))} /></div>
              <div className="form-group">
                <label>Role</label>
                <select value={edit.role || "player"} onChange={e => setEdit(p => ({ ...p, role: e.target.value }))}
                  style={{ background: "rgba(200,100,0,.08)", border: "1px solid rgba(200,100,0,.35)", color: "var(--text)", padding: "8px 10px", fontSize: 13, width: "100%" }}>
                  <option value="player">👤 Player</option>
                  <option value="admin">🔑 Admin</option>
                </select>
                <div style={{ fontSize: 10, color: "var(--red)", marginTop: 4 }}>⚠ Admins have full access to all data and controls.</div>
              </div>
            </div>

            {/* ── Disciplinary Card ── */}
            <div style={{ background:"rgba(220,100,0,.06)", border:"1px solid rgba(220,100,0,.25)", padding:"14px 16px", marginBottom:14, borderRadius:3 }}>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:".18em", color:"#e08030", textTransform:"uppercase", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                ⚠️ Disciplinary Card <span style={{ fontWeight:400, color:"var(--muted)", textTransform:"none", letterSpacing:"normal", fontSize:10 }}>— visible reason is shown to player</span>
              </div>
              <div className="form-row" style={{ marginBottom:0 }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Card Status</label>
                  <select value={edit.cardStatus || "none"} onChange={e => setEdit(p => ({ ...p, cardStatus: e.target.value }))}>
                    <option value="none">✅ None — No active card</option>
                    <option value="yellow">🟡 Yellow Card — Formal warning</option>
                    <option value="red">🔴 Red Card — 1 game day ban (blocks booking)</option>
                    <option value="black">⚫ Black Card — Suspended until owner review (blocks booking)</option>
                  </select>
                  {(edit.cardStatus === "red" || edit.cardStatus === "black") && (
                    <div style={{ fontSize:11, color:"var(--red)", marginTop:4 }}>⚠ Player will be blocked from booking events.</div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Reason <span style={{ fontWeight:400, color:"var(--muted)", fontSize:10 }}>(shown to player)</span></label>
                  <input value={edit.cardReason || ""} onChange={e => setEdit(p => ({ ...p, cardReason: e.target.value }))} placeholder="e.g. Unsafe play, hit not called, aggressive behaviour…" />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "var(--muted)", textTransform: "uppercase", fontFamily: "'Barlow Condensed', sans-serif" }}>Delivery Address</div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 2, padding: "12px 14px", marginBottom: 14 }}>
              {(() => {
                const parts = (edit.address || "").split("\n");
                const setAddrPart = (idx, val) => {
                  const addrLines = (edit.address || "").split("\n");
                  while (addrLines.length <= idx) p.push("");
                  p[idx] = val;
                  setEdit(prev => ({ ...prev, address: addrLines.join("\n") }));
                };
                return (
                  <>
                    <div className="form-group" style={{ marginBottom: 8 }}><label>Line 1</label><input value={parts[0] || ""} onChange={e => setAddrPart(0, e.target.value)} placeholder="House number and street" /></div>
                    <div className="form-group" style={{ marginBottom: 8 }}><label>Line 2</label><input value={parts[1] || ""} onChange={e => setAddrPart(1, e.target.value)} placeholder="Flat, apartment, etc." /></div>
                    <div className="form-row" style={{ marginBottom: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Town / City</label><input value={parts[2] || ""} onChange={e => setAddrPart(2, e.target.value)} placeholder="Swindon" /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>County</label><input value={parts[3] || ""} onChange={e => setAddrPart(3, e.target.value)} placeholder="Wiltshire" /></div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>Postcode</label><input value={parts[4] || ""} onChange={e => setAddrPart(4, e.target.value.toUpperCase())} placeholder="SN1 1AA" style={{ maxWidth: 160 }} /></div>
                  </>
                );
              })()}
            </div>
            {/* Admin Notes — internal only, never visible to player */}
            <div style={{ background: "rgba(200,150,0,.06)", border: "1px solid rgba(200,150,0,.25)", padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                🔒 Admin Notes <span style={{ fontWeight: 400, color: "var(--muted)", textTransform: "none", letterSpacing: "normal", fontSize: 10 }}>— internal only, never shown to player</span>
              </div>
              <textarea
                value={edit.adminNotes || ""}
                onChange={e => setEdit(p => ({ ...p, adminNotes: e.target.value }))}
                placeholder="Add private notes about this player (bans, incidents, equipment issues, flags, etc.)"
                rows={3}
                style={{ width: "100%", resize: "vertical", fontFamily: "'Share Tech Mono',monospace", fontSize: 12, background: "rgba(0,0,0,.3)", border: "1px solid rgba(200,150,0,.2)", color: "var(--text)", padding: "8px 10px", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <input type="checkbox" checked={edit.deleteRequest || false} onChange={e => setEdit(p => ({ ...p, deleteRequest: e.target.checked }))} />
              <label style={{ fontSize: 13, color: "var(--red)" }}>Account deletion requested</label>
            </div>
            {/* Rank & Designation — shown on public profile */}
            <div style={{ background: "rgba(200,255,0,.03)", border: "1px solid rgba(200,255,0,.15)", padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: ".12em", fontFamily: "'Barlow Condensed',sans-serif", textTransform: "uppercase", marginBottom: 10 }}>🎖 Public Profile Rank &amp; Designation</div>

              {/* Standard Rank */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>RANK — leave as Auto to use games-played calculation</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {(edit.customRank || "CIVILIAN") && (
                    <div style={{ flexShrink: 0, border: "1px solid #2a3a10", borderRadius: 4, overflow: "hidden" }}>
                      <RankInsignia rank={edit.customRank || "CIVILIAN"} size={44}/>
                    </div>
                  )}
                  <select
                    value={edit.customRank || ""}
                    onChange={e => setEdit(p => ({ ...p, customRank: e.target.value || null }))}
                    style={{ flex: 1, background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text)", padding: "8px 10px", fontSize: 13, borderRadius: 3 }}
                  >
                    <option value="">— Auto (based on games played) —</option>
                    <option value="CIVILIAN">CIVILIAN</option>
                    <option value="PRIVATE">PRIVATE</option>
                    <option value="RECRUIT">RECRUIT</option>
                    <option value="OPERATIVE">OPERATIVE</option>
                    <option value="SENIOR OPERATIVE">SENIOR OPERATIVE</option>
                    <option value="FIELD COMMANDER">FIELD COMMANDER</option>
                  </select>
                </div>
              </div>

              {/* Special Designation */}
              <div>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>DESIGNATION — optional special role badge displayed alongside rank</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {edit.designation && (
                    <div style={{ flexShrink: 0, border: "1px solid rgba(79,195,247,.3)", borderRadius: 4, overflow: "hidden" }}>
                      <DesignationInsignia desig={edit.designation} size={44}/>
                    </div>
                  )}
                  {!edit.designation && (
                    <div style={{ flexShrink: 0, width: 44, height: 44, border: "1px solid #1a2808", borderRadius: 4, background: "#080a06", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18, opacity: .3 }}>—</span>
                    </div>
                  )}
                  <select
                    value={edit.designation || ""}
                    onChange={e => setEdit(p => ({ ...p, designation: e.target.value || null }))}
                    style={{ flex: 1, background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text)", padding: "8px 10px", fontSize: 13, borderRadius: 3 }}
                  >
                    <option value="">— None —</option>
                    <option value="GHOST">👻 GHOST</option>
                    <option value="SNIPER">🎯 SNIPER</option>
                    <option value="MEDIC">🩹 MEDIC</option>
                    <option value="DEMOLITIONS">💥 DEMOLITIONS</option>
                    <option value="RECON">🔭 RECON</option>
                    <option value="HEAVY GUNNER">🔫 HEAVY GUNNER</option>
                    <option value="SUPPORT">🛡 SUPPORT</option>
                    <option value="SQUAD LEADER">⚔️ SQUAD LEADER</option>
                    <option value="VETERAN">🎖 VETERAN</option>
                    <option value="LEGEND">🏆 LEGEND</option>
                  </select>
                </div>
              </div>

              {(edit.customRank || edit.designation) && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--accent)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {edit.customRank && <span>✓ Rank override: <strong>{edit.customRank}</strong></span>}
                  {edit.designation && <span>✓ Designation: <strong>{edit.designation}</strong></span>}
                </div>
              )}
            </div>
            {/* Marshal permission — admin only, never visible to player */}
            <div style={{ background: "rgba(0,180,100,.06)", border: "1px solid rgba(0,180,100,.25)", padding: "12px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                id="canMarshalChk"
                checked={edit.canMarshal || false}
                onChange={e => setEdit(p => ({ ...p, canMarshal: e.target.checked }))}
                style={{ marginTop: 2, accentColor: "#00c864", flexShrink: 0 }}
              />
              <label htmlFor="canMarshalChk" style={{ cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#00c864" }}>📷 QR Check-In Marshal</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Grants this player access to a QR scanner page so they can check players in on game day. They will <strong style={{ color: "var(--text)" }}>not</strong> have access to any other admin features.
                </div>
              </label>
            </div>
            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setEdit(null)} disabled={savingEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {delAccountConfirm && (
        <div className="overlay" onClick={() => !deletingAccount && setDelAccountConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: "var(--red)" }}>🗑 Permanently Delete Account?</div>

            {/* Player summary */}
            <div style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 3, padding: "12px 14px", margin: "16px 0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,160px),1fr))", gap: "8px 16px" }}>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>NAME</div><div style={{ fontWeight: 700 }}>{delAccountConfirm.name}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>EMAIL</div><div style={{ fontSize: 13 }}>{delAccountConfirm.email || "—"}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>GAMES ATTENDED</div><div style={{ fontSize: 13 }}>{delAccountConfirm.gamesAttended || 0}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>CREDITS</div><div style={{ fontSize: 13, color: delAccountConfirm.credits > 0 ? "var(--gold)" : "inherit" }}>{delAccountConfirm.credits > 0 ? `£${Number(delAccountConfirm.credits).toFixed(2)}` : "None"}</div></div>
              {delAccountConfirm.vipStatus === "active" && (
                <div style={{ gridColumn: "1 / -1" }}><span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700 }}>★ This player has an active VIP membership</span></div>
              )}
              {delAccountConfirm.credits > 0 && (
                <div style={{ gridColumn: "1 / -1" }}><span style={{ fontSize: 11, color: "var(--gold)" }}>⚠ Player has unused credits — these will be lost on deletion.</span></div>
              )}
            </div>

            <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 20, lineHeight: 1.7 }}>
              ⚠️ This will permanently delete their <strong>profile, waiver, auth login</strong> and all associated personal data. Their booking history will be anonymised. <strong>This cannot be undone.</strong>
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingAccount} onClick={confirmDeleteAccount}>
                {deletingAccount ? "⏳ Deleting…" : "🗑 Yes, Delete Account Permanently"}
              </button>
              <button className="btn btn-ghost" disabled={deletingAccount} onClick={() => setDelAccountConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {vipApproveModal && (
        <div className="overlay" onClick={() => !vipApproveBusy && setVipApproveModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⭐ Approve VIP — {vipApproveModal.name}</div>

            {/* Photo ID review */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:".1em", color:"var(--muted)", textTransform:"uppercase", marginBottom:10 }}>🪪 Government Photo ID</div>
              {vipApproveModal.vipIdImages?.length > 0 ? (
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {vipApproveModal.vipIdImages.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" title="Open full size in new tab"
                      style={{ display:"block", border:"1px solid var(--accent)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                      <img src={url} alt={`ID photo ${i+1}`} style={{ width:160, height:110, objectFit:"cover", display:"block" }} />
                      <div style={{ background:"#0a0f05", padding:"3px 8px", fontSize:9, color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em", textAlign:"center" }}>
                        ID PHOTO {i+1} — CLICK TO ENLARGE
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="alert alert-red" style={{ fontSize:12 }}>
                  ⚠️ No ID photos uploaded by this player. Consider requesting ID before approving.
                </div>
              )}
            </div>

            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
              Set the UKARA ID for this player. A unique ID has been pre-generated — edit it if needed.
            </p>
            <div className="form-group">
              <label>UKARA ID</label>
              <input
                value={vipUkara}
                onChange={e => setVipUkara(e.target.value)}
                placeholder="e.g. UKARA-2025-042"
                style={{ fontFamily: "'Share Tech Mono',monospace" }}
                disabled={vipApproveBusy}
              />
            </div>
            <div className="gap-2" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" disabled={vipApproveBusy || !vipUkara.trim()} onClick={async () => {
                setVipApproveBusy(true);
                try {
                  // Step 1: read the current games_attended from DB before touching anything
                  const { data: freshProfile, error: readErr } = await supabase
                    .from('profiles').select('games_attended').eq('id', vipApproveModal.id).single();
                  if (readErr) throw new Error(readErr.message);
                  const preservedCount = freshProfile?.games_attended ?? vipApproveModal.gamesAttended ?? 0;

                  // Step 2: write the VIP fields
                  const vipExpiry = new Date();
                  vipExpiry.setFullYear(vipExpiry.getFullYear() + 1);
                  const { error: vipErr } = await supabase.from('profiles').update({
                    vip_status:     "active",
                    vip_applied:    true,
                    ukara:          vipUkara.trim(),
                    vip_expires_at: vipExpiry.toISOString(),
                  }).eq('id', vipApproveModal.id);
                  if (vipErr) throw new Error(vipErr.message);

                  // Step 3: immediately restore games_attended in case any trigger reset it
                  await supabase.from('profiles')
                    .update({ games_attended: preservedCount })
                    .eq('id', vipApproveModal.id);

                  await loadUsers();
                  showToast(`✅ VIP approved for ${vipApproveModal.name}! UKARA: ${vipUkara.trim()}`);
                  logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "VIP approved", detail: `Player: ${vipApproveModal.name} (${vipApproveModal.email || ""}) | UKARA: ${vipUkara.trim()} | Previous status: ${vipApproveModal.vipStatus || "none"}` });
                  setVipApproveModal(null);
                } catch (e) {
                  showToast("Approval failed: " + e.message, "red");
                } finally {
                  setVipApproveBusy(false);
                }
              }}>
                {vipApproveBusy ? "Approving…" : "✓ Confirm Approval"}
              </button>
              <button className="btn btn-ghost" disabled={vipApproveBusy} onClick={() => setVipApproveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── VIEW PLAYER MODAL ─────────── */}
      {viewPlayer && (() => {
        const u = viewPlayer;
        const cardColors = { yellow:"var(--gold)", red:"var(--red)", black:"#bbb" };
        const cardLabels = { yellow:"🟡 Yellow Card — Formal Warning", red:"🔴 Red Card — Temporary Ban (1 game day)", black:"⚫ Black Card — Suspended" };

        const playerBookings = (data.events || []).flatMap(ev =>
          (ev.bookings || []).filter(b => b.userId === u.id).map(b => ({
            eventTitle: ev.title, date: ev.date, type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn
          }))
        ).sort((a,b) => new Date(b.date) - new Date(a.date));

        const downloadFOI = () => {
          const payload = {
            exportDate:  new Date().toISOString(),
            exportType:  "Freedom of Information / GDPR Data Portability Request",
            notice:      "This file contains all personal data held about this player on the Swindon Airsoft platform.",
            profile: {
              id: u.id, name: u.name, email: u.email, phone: u.phone || "",
              address: u.address || "", joinDate: u.joinDate || "",
              gamesAttended: u.gamesAttended, vipStatus: u.vipStatus,
              ukara: u.ukara || "", credits: u.credits,
              waiverSigned: u.waiverSigned, cardStatus: u.cardStatus || "none",
              cardReason: u.cardReason || "",
            },
            bookings: playerBookings,
          };
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" }));
          a.download = `swindon-airsoft-data-${(u.name||"player").replace(/\s+/g,"-").toLowerCase()}-${Date.now()}.json`;
          a.click();
        };

        return (
          <div className="overlay" onClick={() => setViewPlayer(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth:700, maxHeight:"90vh", overflowY:"auto" }}>
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, gap:12, flexWrap:"wrap" }}>
                <div>
                  <div className="modal-title" style={{ margin:0 }}>👤 {u.name}</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:3 }}>{u.email}</div>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setContactPlayer(u); setContactSubject(""); setContactMsg(""); setViewPlayer(null); }}>📧 Email Player</button>
                  <button className="btn btn-sm btn-ghost" onClick={downloadFOI} title="Download all data for GDPR/FOI request">⬇ Data Export</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEdit({ ...u }); setViewPlayer(null); }}>✏️ Edit</button>
                </div>
              </div>

              {/* Card status banner */}
              {u.cardStatus && u.cardStatus !== "none" && (
                <div style={{
                  background: `rgba(${u.cardStatus==="yellow"?"200,160,0":u.cardStatus==="red"?"220,30,30":"80,80,80"},.1)`,
                  border: `1px solid rgba(${u.cardStatus==="yellow"?"200,160,0":u.cardStatus==="red"?"220,30,30":"80,80,80"},.35)`,
                  padding:"12px 14px", borderRadius:3, marginBottom:16
                }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:cardColors[u.cardStatus], marginBottom:4 }}>{cardLabels[u.cardStatus]}</div>
                  {u.cardReason && <div style={{ fontSize:12, color:"var(--muted)" }}>Reason: {u.cardReason}</div>}
                  {u.cardIssuedAt && <div style={{ fontSize:11, color:"var(--muted)", marginTop:3, fontFamily:"'Share Tech Mono',monospace" }}>Issued: {new Date(u.cardIssuedAt).toLocaleDateString("en-GB")}</div>}
                </div>
              )}

              {/* Info grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:16 }}>
                {[
                  ["Phone",          u.phone || "—"],
                  ["Games Attended", u.gamesAttended],
                  ["VIP Status",     u.vipStatus === "active" ? "⭐ Active" : u.vipApplied ? "⏳ Pending" : u.vipStatus === "expired" ? "✗ Expired" : "None"],
                  ["UKARA ID",       u.ukara || "—"],
                  ["Credits",        u.credits > 0 ? `£${Number(u.credits).toFixed(2)}` : "£0"],
                  ["Joined",         u.joinDate || "—"],
                  ["Waiver",         u.waiverSigned && u.waiverYear === new Date().getFullYear() ? "✓ Signed" : "✗ Not signed"],
                  ["Account Status", u.cardStatus && u.cardStatus !== "none" ? cardLabels[u.cardStatus] : "✅ Clear"],
                  ["Callsign",       u.callsign || "—"],
                ].map(([label, val]) => (
                  <div key={label} style={{ background:"var(--bg4)", padding:"10px 12px", borderRadius:3 }}>
                    <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{String(val)}</div>
                  </div>
                ))}
              </div>

              {/* Address */}
              {u.address && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>Delivery Address</div>
                  <div style={{ fontSize:12, whiteSpace:"pre-line", background:"var(--bg4)", padding:"10px 12px", borderRadius:3, fontFamily:"'Share Tech Mono',monospace" }}>{u.address}</div>
                </div>
              )}

              {/* VIP ID photos */}
              {u.vipIdImages?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>🪪 Government Photo ID</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    {u.vipIdImages.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        style={{ display:"block", border:"1px solid var(--accent)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                        <img src={url} alt={`ID ${i+1}`} style={{ width:150, height:100, objectFit:"cover", display:"block" }} />
                        <div style={{ fontSize:9, color:"var(--accent)", textAlign:"center", padding:"2px 0", background:"#0a0f05", fontFamily:"'Share Tech Mono',monospace" }}>
                          ID {i+1} — CLICK TO ENLARGE
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Booking history */}
              <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>Booking History ({playerBookings.length})</div>
              {playerBookings.length === 0
                ? <div style={{ color:"var(--muted)", fontSize:13, marginBottom:12 }}>No bookings on record.</div>
                : (
                  <div className="table-wrap" style={{ marginBottom:16 }}>
                    <table className="data-table">
                      <thead><tr><th>Event</th><th>Date</th><th>Type</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
                      <tbody>
                        {playerBookings.map((b, i) => (
                          <tr key={i}>
                            <td style={{ fontSize:12 }}>{b.eventTitle}</td>
                            <td className="mono" style={{ fontSize:11 }}>{fmtDate(b.date)}</td>
                            <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                            <td>{b.qty}</td>
                            <td className="text-green">£{b.total.toFixed(2)}</td>
                            <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
              <div style={{ borderTop:"1px solid var(--border)", paddingTop:12, display:"flex", justifyContent:"flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setViewPlayer(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─────────── CONTACT PLAYER MODAL ─────────── */}
      {contactPlayer && (
        <div className="overlay" onClick={() => !contactSending && setContactPlayer(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📧 Email — {contactPlayer.name}</div>
            <p style={{ fontSize:12, color:"var(--muted)", marginBottom:16 }}>
              Sending to <strong style={{ color:"var(--text)" }}>{contactPlayer.email}</strong>
            </p>
            <div className="form-group">
              <label>Subject</label>
              <input value={contactSubject} onChange={e => setContactSubject(e.target.value)} placeholder="Message subject…" disabled={contactSending} />
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea rows={7} value={contactMsg} onChange={e => setContactMsg(e.target.value)}
                placeholder="Write your message here…" disabled={contactSending}
                style={{ width:"100%", resize:"vertical", fontFamily:"inherit", fontSize:13, background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", padding:"8px 10px", boxSizing:"border-box", borderRadius:3 }} />
            </div>
            <div className="gap-2 mt-1">
              <button className="btn btn-primary" disabled={contactSending || !contactSubject.trim() || !contactMsg.trim()} onClick={async () => {
                setContactSending(true);
                try {
                  const htmlContent = `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:32px 24px;max-width:600px;margin:0 auto">
                    <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="160" style="display:block;margin:0 0 8px;height:auto;" />
                    <div style="height:2px;background:#1a2808;margin-bottom:24px"></div>
                    <div style="font-size:14px;margin-bottom:16px">Hi ${contactPlayer.name},</div>
                    <div style="font-size:14px;line-height:1.8;white-space:pre-wrap">${contactMsg.trim()}</div>
                    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1a2808;font-size:11px;color:#555">
                      Swindon Airsoft — This message was sent by our admin team. Please do not reply to this address.
                    </div>
                  </div>`;
                  await sendEmail({ toEmail: contactPlayer.email, toName: contactPlayer.name, subject: contactSubject.trim(), htmlContent });
                  showToast(`✅ Email sent to ${contactPlayer.name}`);
                  setContactPlayer(null);
                } catch(e) {
                  showToast("Failed to send email: " + (e.message || String(e)), "red");
                } finally { setContactSending(false); }
              }}>
                {contactSending ? "⏳ Sending…" : "📧 Send Email"}
              </button>
              <button className="btn btn-ghost" disabled={contactSending} onClick={() => setContactPlayer(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Admin Waivers ─────────────────────────────────────────

export default AdminPlayers;
