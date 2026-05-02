// admin/AdminUkaraApplications.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtDate, sendAdminUkaraNotification, sendUkaraDecisionEmail, tabBtn, useMobile } from "../utils";
import { logAction } from "./adminHelpers";

function AdminUkaraApplications({ showToast, cu }) {
  const [apps, setApps] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const getInitTab = () => {
    const p = window.location.hash.replace("#", "").split("/");
    return p[0] === "admin" && p[1] === "ukara" && ["pending", "approved"].includes(p[2]) ? p[2] : "pending";
  };
  const [tab, setTabState] = React.useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/ukara/" + t; };
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(null);
  const [approveModal, setApproveModal] = React.useState(null);
  const [ukaraIdInput, setUkaraIdInput] = React.useState("");
  const [declineModal, setDeclineModal] = React.useState(null);
  const [declineReason, setDeclineReason] = React.useState("");
  const [actioning, setActioning] = React.useState(false);
  const [expiryModal, setExpiryModal] = React.useState(null);  // app being given an expiry date
  const [expiryDate, setExpiryDate] = React.useState("");
  const [expiryBusy, setExpiryBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch real applications
      const all = await api.ukaraApplications.getAll();

      // Also fetch profiles that have a UKARA ID set directly on their record
      // (e.g. admin-assigned, VIP approval) with no matching ukara_applications row.
      let synthetic = [];
      try {
        const { data: profilesWithUkara, error: profileErr } = await supabase
          .from("profiles")
          .select("id, name, email, phone, ukara, games_attended, waiver_data, ukara_expires_at")
          .not("ukara", "is", null)
          .neq("ukara", "");

        if (!profileErr && profilesWithUkara?.length) {
          const coveredUserIds = new Set(all.map(a => a.user_id).filter(Boolean));
          synthetic = profilesWithUkara
            .filter(p => !coveredUserIds.has(p.id))
            .map(p => {
              const w = p.waiver_data || {};
              // Build address from waiver fields
              const addr = [w.addr1, w.addr2, w.city, w.county, w.postcode, w.country]
                .filter(Boolean).join(", ");
              return {
                id:             "synthetic-" + p.id,
                user_id:        p.id,
                name:           w.name  || p.name  || "—",
                email:          p.email || "—",
                phone:          w.phone || p.phone || "",
                dob:            w.dob   || "",
                address:        addr,
                ukara_id:       p.ukara,
                games_attended: p.games_attended ?? null,
                status:         "approved",
                created_at:     null,
                approved_at:    null,
                expires_at:     p.ukara_expires_at || null,
                admin_notes:    "",
                renewal_requested: false,
                _synthetic:     true,
              };
            });
        }
      } catch (_) {
        // Non-fatal — real applications still load
      }

      setApps([...all, ...synthetic]);
    } catch (e) {
      showToast("Failed to load applications: " + e.message, "red");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const genUkaraId = () =>
    `UKARA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const openApprove = (app) => {
    setApproveModal(app);
    setUkaraIdInput(genUkaraId());
  };

  const handleApprove = async () => {
    if (!ukaraIdInput.trim()) { showToast("Enter a UKARA ID", "red"); return; }
    setActioning(true);
    try {
      const updated = await api.ukaraApplications.approve(approveModal.id, ukaraIdInput.trim());
      // Write UKARA ID to player profile too
      if (approveModal.user_id) {
        await api.profiles.update(approveModal.user_id, { ukara: ukaraIdInput.trim() });
      }
      // Send decision email
      try {
        const { sendUkaraDecisionEmail } = await import("../utils");
        const adminEmail = await api.settings.get("contact_email").catch(() => null);
        await sendUkaraDecisionEmail({ toEmail: approveModal.email, toName: approveModal.name, approved: true, ukaraId: ukaraIdInput.trim() });
      } catch {}
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "UKARA approved", detail: `${approveModal.name} — ID: ${ukaraIdInput.trim()}` });
      showToast(`✅ UKARA approved for ${approveModal.name} — ID: ${ukaraIdInput.trim()}`);
      setApproveModal(null);
      setSelected(null);
      load();
    } catch (e) {
      showToast("Approval failed: " + e.message, "red");
    } finally {
      setActioning(false);
    }
  };

  const handleDecline = async () => {
    setActioning(true);
    try {
      await api.ukaraApplications.decline(declineModal.id, declineReason.trim());
      try {
        const { sendUkaraDecisionEmail } = await import("../utils");
        await sendUkaraDecisionEmail({ toEmail: declineModal.email, toName: declineModal.name, approved: false, declineReason: declineReason.trim() });
      } catch {}
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "UKARA declined", detail: `${declineModal.name} — Reason: ${declineReason}` });
      showToast(`Application declined for ${declineModal.name}`);
      setDeclineModal(null);
      setDeclineReason("");
      setSelected(null);
      load();
    } catch (e) {
      showToast("Decline failed: " + e.message, "red");
    } finally {
      setActioning(false);
    }
  };

  const handleSetExpiry = async () => {
    if (!expiryModal || !expiryDate) return;
    setExpiryBusy(true);
    try {
      const isoExpiry = new Date(expiryDate).toISOString();
      if (expiryModal._synthetic) {
        // Synthetic record — save directly to the profiles table
        const { error } = await supabase
          .from("profiles")
          .update({ ukara_expires_at: isoExpiry })
          .eq("id", expiryModal.user_id);
        if (error) throw new Error(error.message);
      } else {
        // Real application row
        const { error } = await supabase
          .from("ukara_applications")
          .update({ expires_at: isoExpiry })
          .eq("id", expiryModal.id);
        if (error) throw new Error(error.message);
      }
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "UKARA expiry set", detail: `${expiryModal.name} — Expires: ${expiryDate}` });
      showToast(`Expiry date set for ${expiryModal.name}`);
      setExpiryModal(null);
      setExpiryDate("");
      load();
    } catch (e) {
      showToast("Failed to set expiry: " + e.message, "red");
    } finally {
      setExpiryBusy(false);
    }
  };

  const filtered = apps.filter(a => {
    const inTab = tab === "pending"
      ? (a.status === "pending" || a.status === "declined")
      : a.status === "approved";
    if (!inTab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.name || "").toLowerCase().includes(q) ||
      (a.email || "").toLowerCase().includes(q) ||
      (a.address || "").toLowerCase().includes(q) ||
      (a.ukara_id || "").toLowerCase().includes(q)
    );
  }).sort((a, b) => {
    // Sort by UKARA ID alphanumerically — records without an ID go to the end
    const ua = (a.ukara_id || "").toUpperCase();
    const ub = (b.ukara_id || "").toUpperCase();
    if (!ua && !ub) return 0;
    if (!ua) return 1;
    if (!ub) return -1;
    return ua.localeCompare(ub, undefined, { numeric: true, sensitivity: "base" });
  });

  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—";

  const statusChip = (s) => {
    const map = {
      pending:  { label: "PENDING",  bg: "rgba(255,183,77,.15)", color: "#ffb74d", border: "#3a2800" },
      approved: { label: "APPROVED", bg: "rgba(200,255,0,.1)",   color: "#c8ff00", border: "#2a4a10" },
      declined: { label: "DECLINED", bg: "rgba(220,50,50,.12)",  color: "#ff6060", border: "#5a1a1a" },
    };
    const c = map[s] || map.pending;
    return (
      <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 10px", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", fontFamily: "'Oswald','Barlow Condensed',sans-serif" }}>
        {c.label}
      </span>
    );
  };

  const tdS = { padding: "10px 14px", borderBottom: "1px solid #1a2808", fontSize: 13, color: "#ccc", verticalAlign: "middle" };
  const thS = { ...tdS, color: "#3a5010", fontSize: 10, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", background: "#0a0f06" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 900, color: "#e8f0d0", letterSpacing: ".04em" }}>UKARA APPLICATIONS</div>
          <div style={{ fontSize: 12, color: "#4a6a28" }}>Manage player UKARA registration applications</div>
        </div>
        <button className="btn btn-sm" onClick={load} style={{ fontSize: 12 }}>↻ Refresh</button>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {[
          { id:"pending",  label:"⏳ Pending",  count: apps.filter(a=>a.status==="pending").length },
          { id:"approved", label:"✅ Approved", count: apps.filter(a=>a.status==="approved").length },
        ].map(t => (
          <button key={t.id} style={tabBtn(tab===t.id)} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count > 0 && <span style={{ background: tab===t.id ? "rgba(0,0,0,.25)" : t.id==="pending" ? "#ffb74d" : "rgba(255,255,255,.1)", color: tab===t.id ? (t.id==="pending" ? "#000":"#000") : t.id==="pending" ? "#0a0e07" : "inherit", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:800 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Search (approved tab only) */}
      {tab === "approved" && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, postcode or UKARA ID…"
            style={{ width: "100%", maxWidth: 420, background: "#0a0d07", border: "1px solid #2a3a10", color: "#e8f0d0", padding: "9px 14px", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
          {apps.filter(a => a._synthetic).length > 0 && (
            <div style={{ fontSize: 12, color: "#4fc3f7", background: "rgba(79,195,247,.05)", border: "1px solid rgba(79,195,247,.15)", borderLeft: "3px solid #4fc3f7", padding: "8px 12px", borderRadius: 4, lineHeight: 1.6 }}>
              🗄 <strong>{apps.filter(a => a._synthetic).length} existing DB record{apps.filter(a => a._synthetic).length !== 1 ? "s" : ""}</strong> — players whose UKARA ID was set directly on their profile (no portal application). Shown with a <strong>DB RECORD</strong> badge.
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#3a5010" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#3a5010", fontFamily: "'Share Tech Mono',monospace", fontSize: 12 }}>
          {tab === "pending" ? "// NO PENDING APPLICATIONS" : "// NO APPROVED APPLICATIONS"}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#0a0d07", border: "1px solid #1a2808" }}>
            <thead>
              <tr>
                <th style={thS}>Name</th>
                <th style={thS}>Email</th>
                <th style={{ ...thS, display: tab === "approved" ? "table-cell" : "none" }}>UKARA ID</th>
                <th style={thS}>Address</th>
                <th style={thS}>Games</th>
                <th style={thS}>Submitted</th>
                <th style={{ ...thS, display: tab === "approved" ? "table-cell" : "none" }}>Expires</th>
                <th style={thS}>Status</th>
                <th style={thS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(app => (
                <tr key={app.id} style={{ cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background="#0d1209"} onMouseLeave={e => e.currentTarget.style.background=""}>
                  <td style={tdS}><strong style={{ color: "#e8f0d0" }}>{app.name}</strong></td>
                  <td style={tdS}>{app.email}</td>
                  <td style={{ ...tdS, display: tab === "approved" ? "table-cell" : "none", fontFamily: "monospace", color: "#c8ff00", fontWeight: 700 }}>{app.ukara_id || "—"}</td>
                  <td style={{ ...tdS, fontSize: 12, color: "#7a9a60", maxWidth: 180 }}>{app.address || "—"}</td>
                  <td style={{ ...tdS, textAlign: "center", color: (app.games_attended || 0) >= 3 ? "#c8ff00" : "#ff6060", fontWeight: 700 }}>{app.games_attended ?? "—"}</td>
                  <td style={{ ...tdS, fontSize: 12 }}>{fmtDate(app.created_at)}</td>
                  <td style={{ ...tdS, display: tab === "approved" ? "table-cell" : "none", fontSize: 12, color: app.expires_at && new Date(app.expires_at) < new Date() ? "#ff6060" : "#8aaa60" }}>{fmtDate(app.expires_at)}</td>
                  <td style={tdS}>{statusChip(app.status)}</td>
                  <td style={tdS}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setSelected(app)}>👁 View</button>
                      {app._synthetic && (
                        <span style={{ fontSize: 10, color: "#4fc3f7", border: "1px solid #1a3a4a", padding: "2px 8px", borderRadius: 4, fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".08em" }}>🗄 DB RECORD</span>
                      )}
                      {!app._synthetic && app.status === "pending" && (
                        <>
                          <button className="btn btn-sm" style={{ fontSize: 11, padding: "4px 10px", background: "rgba(200,255,0,.12)", border: "1px solid rgba(200,255,0,.3)", color: "#c8ff00" }} onClick={() => openApprove(app)}>✓ Approve</button>
                          <button className="btn btn-sm" style={{ fontSize: 11, padding: "4px 10px", background: "rgba(220,50,50,.12)", border: "1px solid rgba(220,50,50,.3)", color: "#ff6060" }} onClick={() => { setDeclineModal(app); setDeclineReason(""); }}>✗ Decline</button>
                        </>
                      )}
                      {app.renewal_requested && app.status === "approved" && (
                        <span style={{ fontSize: 10, color: "#ce93d8", border: "1px solid #4a2a5a", padding: "2px 8px", borderRadius: 4, fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".08em" }}>🔄 RENEWAL</span>
                      )}
                      {app.status === "approved" && (
                        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => { setExpiryModal(app); setExpiryDate(app.expires_at ? app.expires_at.slice(0, 10) : ""); }}>📅 Expiry</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSelected(null)}>
          <div style={{ background: "#0d1209", border: "1px solid #2a3a10", borderRadius: 10, padding: "28px 28px 24px", maxWidth: 680, width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#4a6a28", fontSize: 18, cursor: "pointer" }}>✕</button>
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 900, color: "#e8f0d0", marginBottom: 4 }}>{selected.name}</div>
            <div style={{ marginBottom: 20 }}>{statusChip(selected.status)}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                ["Full Name", selected.name],
                ["Email", selected.email],
                ["Phone", selected.phone || "—"],
                ["Date of Birth", selected.dob || "—"],
                ["Address", selected.address || "—"],
                ["Games at Swindon", selected.games_attended ?? "—"],
                ["Submitted", fmtDate(selected.created_at)],
                ["UKARA ID", selected.ukara_id || "—"],
                ["Approved", fmtDate(selected.approved_at)],
                ["Expires", selected.expires_at ? fmtDate(selected.expires_at) : "—"],
              ].map(([label, val]) => (
                <div key={label} style={{ background: "#0a0d07", border: "1px solid #1a2808", borderRadius: 6, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".15em", color: "#3a5010", marginBottom: 3 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 13, color: "#c8d8a0", wordBreak: "break-word" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Expiry setter — available for all approved records */}
            {selected.status === "approved" && (
              <div style={{ background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.15)", borderRadius: 6, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".15em", color: "#4a6a28", flexShrink: 0 }}>SET EXPIRY DATE</div>
                <input
                  type="date"
                  defaultValue={selected.expires_at ? selected.expires_at.slice(0, 10) : ""}
                  id="detail-expiry-input"
                  style={{ background: "#0a0d07", border: "1px solid #2a3a10", color: "#c8d8a0", padding: "6px 10px", fontSize: 13, borderRadius: 4, outline: "none", flex: 1, minWidth: 140 }}
                />
                <button
                  className="btn btn-sm btn-primary"
                  style={{ fontSize: 12, padding: "6px 16px" }}
                  onClick={async () => {
                    const val = document.getElementById("detail-expiry-input")?.value;
                    if (!val) { showToast("Pick a date first", "red"); return; }
                    const isoExpiry = new Date(val).toISOString();
                    try {
                      if (selected._synthetic) {
                        const { error } = await supabase.from("profiles").update({ ukara_expires_at: isoExpiry }).eq("id", selected.user_id);
                        if (error) throw new Error(error.message);
                      } else {
                        const { error } = await supabase.from("ukara_applications").update({ expires_at: isoExpiry }).eq("id", selected.id);
                        if (error) throw new Error(error.message);
                      }
                      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "UKARA expiry set", detail: `${selected.name} — Expires: ${val}` });
                      showToast(`Expiry set for ${selected.name}`);
                      setSelected(null);
                      load();
                    } catch (e) { showToast("Failed: " + e.message, "red"); }
                  }}
                >
                  💾 Save Expiry
                </button>
              </div>
            )}

            {/* Government ID */}
            {selected.gov_id_url && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".15em", color: "#3a5010", marginBottom: 8 }}>GOVERNMENT ID</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {selected.gov_id_url.toLowerCase().endsWith(".pdf") ? (
                    <a href={selected.gov_id_url} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(200,255,0,.08)", border: "1px solid #2a3a10", color: "#c8ff00", padding: "8px 16px", borderRadius: 6, fontSize: 12, textDecoration: "none" }}>📄 View PDF</a>
                  ) : (
                    <a href={selected.gov_id_url} target="_blank" rel="noopener noreferrer">
                      <img src={selected.gov_id_url} alt="Government ID" style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 6, border: "1px solid #2a3a10", cursor: "pointer" }} />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Face Photo */}
            {selected.face_photo_url && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".15em", color: "#3a5010", marginBottom: 8 }}>FACE PHOTO</div>
                <a href={selected.face_photo_url} target="_blank" rel="noopener noreferrer">
                  <img src={selected.face_photo_url} alt="Face photo" style={{ maxHeight: 200, maxWidth: "100%", borderRadius: 6, border: "1px solid #2a3a10", cursor: "pointer" }} />
                </a>
              </div>
            )}

            {selected.admin_notes && (
              <div style={{ background: "rgba(220,50,50,.06)", border: "1px solid #5a1a1a", borderRadius: 6, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#8a4040", letterSpacing: ".12em", marginBottom: 4 }}>DECLINE REASON</div>
                <div style={{ fontSize: 13, color: "#ff8080" }}>{selected.admin_notes}</div>
              </div>
            )}

            {selected._synthetic && (
              <div style={{ background: "rgba(79,195,247,.06)", border: "1px solid rgba(79,195,247,.2)", borderRadius: 6, padding: "10px 14px", marginTop: 8, fontSize: 12, color: "#4fc3f7", lineHeight: 1.6 }}>
                🗄 This UKARA ID was set directly on the player's profile — no application form or documents were submitted through the portal.
              </div>
            )}
            {!selected._synthetic && selected.status === "pending" && (
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="btn" style={{ background: "rgba(200,255,0,.12)", border: "1px solid rgba(200,255,0,.3)", color: "#c8ff00", flex: 1 }} onClick={() => { setSelected(null); openApprove(selected); }}>✓ Approve</button>
                <button className="btn" style={{ background: "rgba(220,50,50,.12)", border: "1px solid rgba(220,50,50,.3)", color: "#ff6060", flex: 1 }} onClick={() => { setSelected(null); setDeclineModal(selected); setDeclineReason(""); }}>✗ Decline</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Set Expiry Modal */}
      {expiryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => !expiryBusy && setExpiryModal(null)}>
          <div style={{ background: "#0d1209", border: "1px solid #2a4a10", borderRadius: 10, padding: "28px 28px 24px", maxWidth: 400, width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 900, color: "#c8ff00", marginBottom: 4 }}>📅 SET EXPIRY DATE</div>
            <div style={{ color: "#6a8a50", fontSize: 13, marginBottom: 4 }}>{expiryModal.name}</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#c8ff00", marginBottom: 20 }}>{expiryModal.ukara_id}</div>
            {expiryModal.expires_at && (
              <div style={{ fontSize: 12, color: "#ffb74d", marginBottom: 12 }}>Current expiry: {fmtDate(expiryModal.expires_at)}</div>
            )}
            <label style={{ display: "block", fontSize: 10, fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".15em", color: "#4a6a28", marginBottom: 6 }}>NEW EXPIRY DATE</label>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              style={{ width: "100%", background: "#0a0d07", border: "1px solid #2a3a10", color: "#c8d8a0", padding: "10px 14px", fontSize: 14, borderRadius: 6, outline: "none", boxSizing: "border-box", marginBottom: 20 }}
            />
            <div style={{ fontSize: 12, color: "#3a5010", marginBottom: 20, lineHeight: 1.6 }}>
              {expiryModal._synthetic
                ? "Saves directly to the player's profile (ukara_expires_at)."
                : "Updates the expiry date on the UKARA application record."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleSetExpiry} disabled={expiryBusy || !expiryDate} className="btn btn-primary" style={{ flex: 1 }}>
                {expiryBusy ? "⏳ Saving…" : "💾 Save Expiry"}
              </button>
              <button onClick={() => setExpiryModal(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {approveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setApproveModal(null)}>
          <div style={{ background: "#0d1209", border: "1px solid #2a4a10", borderRadius: 10, padding: "28px 28px 24px", maxWidth: 440, width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 900, color: "#c8ff00", marginBottom: 4 }}>APPROVE APPLICATION</div>
            <div style={{ color: "#6a8a50", fontSize: 13, marginBottom: 20 }}>{approveModal.name} · {approveModal.email}</div>
            <label style={{ display: "block", fontSize: 10, fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".15em", color: "#4a6a28", marginBottom: 6 }}>UKARA ID</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input
                value={ukaraIdInput}
                onChange={e => setUkaraIdInput(e.target.value)}
                style={{ flex: 1, background: "#0a0d07", border: "1px solid #2a3a10", color: "#c8ff00", padding: "10px 14px", borderRadius: 6, fontSize: 14, fontFamily: "monospace", outline: "none", letterSpacing: ".08em" }}
              />
              <button onClick={() => setUkaraIdInput(genUkaraId())} style={{ background: "rgba(200,255,0,.08)", border: "1px solid #2a3a10", color: "#4a6a28", padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>↻</button>
            </div>
            <div style={{ fontSize: 12, color: "#3a5010", marginBottom: 20, lineHeight: 1.6 }}>
              This ID will be saved to the player's profile. They'll receive an email with their UKARA ID and the £5 fee will be charged on their next renewal.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleApprove} disabled={actioning} className="btn btn-primary" style={{ flex: 1 }}>{actioning ? "⏳ Approving…" : "✓ Confirm Approval"}</button>
              <button onClick={() => setApproveModal(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Modal */}
      {declineModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setDeclineModal(null)}>
          <div style={{ background: "#0d0909", border: "1px solid #5a1a1a", borderRadius: 10, padding: "28px 28px 24px", maxWidth: 440, width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 900, color: "#ff6060", marginBottom: 4 }}>DECLINE APPLICATION</div>
            <div style={{ color: "#7a5050", fontSize: 13, marginBottom: 20 }}>{declineModal.name} · {declineModal.email}</div>
            <label style={{ display: "block", fontSize: 10, fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".15em", color: "#8a4040", marginBottom: 6 }}>REASON (shown to player)</label>
            <textarea
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              placeholder="e.g. Insufficient games attended, ID could not be verified…"
              rows={3}
              style={{ width: "100%", background: "#0a0505", border: "1px solid #5a1a1a", color: "#ff8080", padding: "10px 14px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={handleDecline} disabled={actioning} style={{ flex: 1, background: "rgba(220,50,50,.18)", border: "1px solid rgba(220,50,50,.4)", color: "#ff6060", padding: "10px", borderRadius: 6, fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {actioning ? "⏳ Declining…" : "✗ Confirm Decline"}
              </button>
              <button onClick={() => setDeclineModal(null)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { AdminUkaraApplications };
