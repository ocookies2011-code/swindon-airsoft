import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { squareRefund, waitlistApi, holdApi, normaliseProfile } from "./api";
import {
  renderMd, stockLabel, fmtErr,
  gmtShort, fmtDate, uid,
  EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY,
  detectCourier, trackKeyCache,
  AdminTrackStatusCell, TrackingBlock,
  useMobile, GmtClock, QRScanner,
  sendEmail, sendTicketEmail, sendEventReminderEmail,
  sendAdminBookingNotification,
  sendWaitlistNotifyEmail, sendDispatchEmail, sendNewEventEmail,
  sendReturnDecisionEmail, sendUkaraDecisionEmail, sendAdminUkaraNotification,
  WaiverModal,
  RankInsignia, DesignationInsignia, resetSquareConfig,
} from "./utils";
import { SUPERADMIN_EMAIL } from "./adminShared";

export default function AdminStaff({ showToast, cu }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const RANK_OPTIONS = [
    { value: 1, label: "1 — Owner" },
    { value: 2, label: "2 — Senior Marshal" },
    { value: 3, label: "3 — Marshal" },
  ];

  const blank = { name: "", jobTitle: "", bio: "", photo: "", rankOrder: 3 };
  const [form, setForm] = useState(blank);
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadStaff = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    api.staff.getAll()
      .then(data => { setStaffList(data); })
      .catch(e => { setLoadError(e.message || "Failed to load staff"); showToast("Failed to load staff: " + e.message, "red"); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    loadStaff();
    const onVisible = () => { if (document.visibilityState === "visible") loadStaff(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadStaff]);

  const openNew = () => { setForm(blank); setModal("new"); };
  const openEdit = (m) => { setForm({ name: m.name, jobTitle: m.job_title, bio: m.bio || "", photo: m.photo || "", rankOrder: m.rank_order, _orig: { name: m.name, jobTitle: m.job_title, bio: m.bio || "", rankOrder: m.rank_order } }); setModal(m); };

  const handlePhotoFile = async (e, existingId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (existingId) {
      setUploading(true);
      try { const url = await api.staff.uploadPhoto(existingId, file); ff("photo", url); showToast("Photo uploaded!"); }
      catch (err) { showToast("Upload failed: " + err.message, "red"); }
      finally { setUploading(false); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => ff("photo", reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name.trim()) { showToast("Name is required", "red"); return; }
    if (!form.jobTitle.trim()) { showToast("Job title is required", "red"); return; }
    setBusy(true);
    try {
      if (modal === "new") {
        const photoData = form.photo?.startsWith("data:") ? form.photo : "";
        const created = await api.staff.create({ ...form, photo: "" });
        if (photoData && created?.id) {
          const res = await fetch(photoData);
          const blob = await res.blob();
          const file = new File([blob], "photo.jpg", { type: blob.type });
          await api.staff.uploadPhoto(created.id, file);
        }
      } else {
        await api.staff.update(modal.id, form);
      }
      showToast(modal === "new" ? "Staff member added!" : "Staff member updated!");
      if (modal === "new") {
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member added", detail: `Name: ${form.name} | Role: ${form.jobTitle} | Rank order: ${form.rankOrder ?? "?"}` });
      } else {
        const SLABELS = { name: "Name", jobTitle: "Job title", bio: "Bio", rankOrder: "Rank order" };
        const sDiff = diffFields(form._orig || {}, { name: form.name, jobTitle: form.jobTitle, bio: form.bio, rankOrder: form.rankOrder }, SLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member updated", detail: `${form.name}${sDiff ? ` | ${sDiff}` : " (no changes)"}` });
      }
      setModal(null);
      loadStaff(true); // silent refresh — no loading flash
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.staff.delete(deleteConfirm.id);
      showToast("Staff member removed", "red");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member removed", detail: deleteConfirm.name || deleteConfirm.id });
      setDeleteConfirm(null); loadStaff(true);
    }
    catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Staff</div><div className="page-sub">Manage chain of command — changes appear live on the Staff page</div></div>
        <div className="gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff(true)}>🔄 Refresh</button>
          <button className="btn btn-primary" onClick={openNew}>+ Add Staff Member</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading...</div>}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 13 }}>⚠️ {loadError}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff()}>🔄 Try Again</button>
        </div>
      )}
      {!loading && !loadError && staffList.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No staff added yet. Click <strong>+ Add Staff Member</strong> to get started.</div>
      )}
      {!loading && !loadError && staffList.length > 0 && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Photo</th><th>Name</th><th>Job Title</th><th>Rank</th><th>Bio</th><th>Actions</th></tr></thead>
            <tbody>
              {staffList.map(m => (
                <tr key={m.id}>
                  <td>{m.photo ? <img src={m.photo} alt={m.name} onError={e=>{e.target.style.display='none';e.target.nextSibling&&(e.target.nextSibling.style.display='flex');}} style={{ width: 40, height: 40, borderRadius: 2, objectFit: "cover" }} /> : <div style={{ width: 40, height: 40, background: "var(--bg3)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--muted)" }}>👤</div>}</td>
                  <td style={{ fontWeight: 700 }}>{m.name}</td>
                  <td style={{ color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".05em" }}>{m.job_title}</td>
                  <td><span style={{ fontSize: 11, color: m.rank_order === 1 ? "var(--gold)" : "var(--muted)", fontFamily: "'Barlow Condensed',sans-serif" }}>{RANK_OPTIONS.find(r => r.value === m.rank_order)?.label || `Rank ${m.rank_order}`}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.bio || "—"}</td>
                  <td><div className="gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(m)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(m)}>Remove</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {modal !== null && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-title">{modal === "new" ? "➕ Add Staff Member" : `✏️ Edit — ${modal.name}`}</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ width: 90, height: 90, borderRadius: 4, overflow: "hidden", background: "#111", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.photo ? <img src={form.photo} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, opacity: .3 }}>👤</span>}
                </div>
                <label style={{ display: "block", marginTop: 8, cursor: "pointer" }}>
                  <div className="btn btn-sm btn-ghost" style={{ textAlign: "center", pointerEvents: "none" }}>{uploading ? "Uploading…" : "📷 Photo"}</div>
                  <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={e => handlePhotoFile(e, modal !== "new" ? modal.id : null)} />
                </label>
              </div>
              <div style={{ flex: 1 }}>
                <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="e.g. John Smith" /></div>
                <div className="form-group"><label>Job Title *</label><input value={form.jobTitle} onChange={e => ff("jobTitle", e.target.value)} placeholder="e.g. Head Marshal" /></div>
              </div>
            </div>
            <div className="form-group">
              <label>Rank / Position</label>
              <select value={form.rankOrder} onChange={e => ff("rankOrder", Number(e.target.value))}>
                {RANK_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Lower number = higher up the chain of command.</div>
            </div>
            <div className="form-group">
              <label>Bio <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <textarea rows={3} value={form.bio} onChange={e => ff("bio", e.target.value)} placeholder="Short description shown on the staff card…" />
            </div>
            <div className="gap-2" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy || uploading}>{busy ? "Saving…" : modal === "new" ? "Add Member" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚠️ Remove Staff Member</div>
            <p style={{ color: "var(--muted)", marginBottom: 20 }}>Are you sure you want to remove <strong style={{ color: "var(--text)" }}>{deleteConfirm.name}</strong> from the staff page?</p>
            <div className="gap-2">
              <button className="btn btn-danger" onClick={confirmDelete} disabled={busy}>{busy ? "Removing…" : "Yes, Remove"}</button>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contact Page (public) ─────────────────────────────────
function ContactPage({ data, cu, showToast }) {
  const isMobile = useMobile(640);
  const departments = data.contactDepartments || [];

  const blank = { name: cu?.name || "", email: cu?.email || "", department: "", subject: "", message: "" };
  const [form, setForm]     = useState(blank);
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);
  const lastSentRef = useRef(0);
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedDept = departments.find(d => d.name === form.department);

  const handleSend = async () => {
    const now = Date.now();
    if (now - lastSentRef.current < 60000) {
      showToast("Please wait a minute before sending another message.", "red"); return;
    }
    if (!form.name.trim())    { showToast("Please enter your name", "red"); return; }
    if (!form.email.trim() || !form.email.includes("@")) { showToast("Please enter a valid email", "red"); return; }
    if (!form.department)     { showToast("Please select a department", "red"); return; }
    if (!form.subject.trim()) { showToast("Please enter a subject", "red"); return; }
    if (!form.message.trim()) { showToast("Please enter a message", "red"); return; }
    if (!selectedDept?.email) { showToast("This department has no email configured yet", "red"); return; }

    setSending(true);
    try {
      await sendEmail({
        toEmail: selectedDept.email,
        toName:  selectedDept.name,
        subject: `[${selectedDept.name}] ${form.subject}`,
        htmlContent: `
          <div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#c8ff00;font-family:'Barlow Condensed',sans-serif;letter-spacing:.08em;text-transform:uppercase">
              New Contact Message — ${selectedDept.name}
            </h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px;width:120px">FROM</td><td style="padding:8px;background:#111;color:#fff">${form.name}</td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">EMAIL</td><td style="padding:8px;background:#111;color:#fff"><a href="mailto:${form.email}" style="color:#c8ff00">${form.email}</a></td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">DEPT</td><td style="padding:8px;background:#111;color:#fff">${selectedDept.name}</td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">SUBJECT</td><td style="padding:8px;background:#111;color:#fff">${form.subject}</td></tr>
            </table>
            <div style="background:#111;border-left:3px solid #c8ff00;padding:16px;white-space:pre-wrap;color:#ccc;line-height:1.6">${form.message}</div>
          </div>
        `,
      });
      lastSentRef.current = Date.now();
      setSent(true);
      showToast("Message sent successfully!");
    } catch (e) {
      showToast("Failed to send: " + (e.message || "Please try again"), "red");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div style={{ background: "#080a06", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ position: "relative", display: "inline-block", marginBottom: 28 }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position: "absolute", width: 20, height: 20, zIndex: 2,
              top: v==="top" ? -8 : "auto", bottom: v==="bottom" ? -8 : "auto",
              left: h==="left" ? -8 : "auto", right: h==="right" ? -8 : "auto",
              borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
              borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
            }} />
          ))}
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 48, color: "#c8ff00", padding: "8px 24px", letterSpacing: ".1em" }}>✓</div>
        </div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, letterSpacing: ".2em", textTransform: "uppercase", color: "#e8f0d8", marginBottom: 12 }}>TRANSMISSION SENT</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#3a5010", letterSpacing: ".1em", marginBottom: 8 }}>MESSAGE ROUTED TO: <span style={{ color: "#c8ff00" }}>{form.department.toUpperCase()}</span></div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#2a3a10", letterSpacing: ".08em", marginBottom: 32 }}>REPLY WILL BE SENT TO: {form.email}</div>
        <button className="btn btn-primary" style={{ letterSpacing: ".15em" }} onClick={() => { setSent(false); setForm(blank); }}>SEND ANOTHER TRANSMISSION</button>
      </div>
    );
  }

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — COMMAND COMMS — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            OPEN <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>CHANNEL</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ SECURE TRANSMISSION LINE — ALL COMMS MONITORED ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 24 }}>

          {/* Form */}
          <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "28px 24px" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 22, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,#c8ff00,transparent)", opacity: .3 }} />
              SEND TRANSMISSION
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to left,#c8ff00,transparent)", opacity: .3 }} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>OPERATIVE NAME *</label>
                <input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="Full name" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
              </div>
              <div className="form-group">
                <label>COMMS ADDRESS *</label>
                <input value={form.email} onChange={e => ff("email", e.target.value)} placeholder="you@example.com" type="email" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
              </div>
            </div>

            <div className="form-group">
              <label>TARGET DEPARTMENT *</label>
              <select value={form.department} onChange={e => ff("department", e.target.value)} style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }}>
                <option value="">— SELECT DEPARTMENT —</option>
                {departments.length === 0
                  ? <option disabled>No departments configured yet</option>
                  : departments.map(d => <option key={d.name} value={d.name}>{d.name.toUpperCase()}</option>)
                }
              </select>
              {selectedDept?.description && (
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", marginTop: 6, letterSpacing: ".05em", lineHeight: 1.5 }}>▸ {selectedDept.description}</div>
              )}
            </div>

            <div className="form-group">
              <label>SUBJECT *</label>
              <input value={form.subject} onChange={e => ff("subject", e.target.value)} placeholder="Brief summary of your enquiry" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
            </div>

            <div className="form-group">
              <label>MESSAGE BODY *</label>
              <textarea rows={6} value={form.message} onChange={e => ff("message", e.target.value)} placeholder="Describe your enquiry in detail…" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
            </div>

            <button className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: 14, letterSpacing: ".2em", borderRadius: 0 }} onClick={handleSend} disabled={sending}>
              {sending ? "TRANSMITTING…" : "▸ SEND TRANSMISSION"}
            </button>
          </div>

          {/* Side panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {departments.length > 0 && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ DEPARTMENTS</div>
                {departments.map((d, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: i < departments.length-1 ? "1px solid #1a2808" : "none" }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: ".15em", color: "#c8ff00", textTransform: "uppercase", marginBottom: 4 }}>▸ {d.name}</div>
                    {d.description && <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", lineHeight: 1.5 }}>{d.description}</div>}
                  </div>
                ))}
              </div>
            )}

            {(data.contactAddress || data.contactPhone || data.contactEmail) && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ BASE COORDINATES</div>
                {data.contactEmail && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>✉</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>COMMS</div>
                      <a href={`mailto:${data.contactEmail}`} style={{ color: "#c8ff00", fontSize: 12, fontFamily: "'Share Tech Mono',monospace", textDecoration: "none" }}>{data.contactEmail}</a>
                    </div>
                  </div>
                )}
                {data.contactPhone && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>☎</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>FIELD LINE</div>
                      <a href={`tel:${data.contactPhone}`} style={{ color: "#b0c090", fontSize: 12, fontFamily: "'Share Tech Mono',monospace", textDecoration: "none" }}>{data.contactPhone}</a>
                    </div>
                  </div>
                )}
                {data.contactAddress && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>⊕</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>GRID REF</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#b0c090", lineHeight: 1.6, whiteSpace: "pre-line" }}>{data.contactAddress}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Contact Departments ──────────────────────────────
