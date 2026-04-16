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
import { SUPERADMIN_EMAIL, logAction } from "./adminShared";

export default function AdminContactDepts({ showToast, save, cu }) {
  const [depts, setDepts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]  = useState(false);
  const [modal, setModal]    = useState(null); // null | "new" | index
  const [form, setForm]      = useState({ name:"", email:"", description:"" });
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api.settings.get("contact_departments")
      .then(raw => { try { setDepts(JSON.parse(raw || "[]")); } catch { setDepts([]); } })
      .catch(() => setDepts([]))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (updated) => {
    setSaving(true);
    try {
      await api.settings.set("contact_departments", JSON.stringify(updated));
      setDepts(updated);
      // Refresh global data so ContactPage sees new depts immediately
      save({ contactDepartments: updated });
      showToast("Departments saved!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Contact departments saved", detail: `${updated.length} department(s)` });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const openNew  = () => { setForm({ name:"", email:"", description:"" }); setModal("new"); };
  const openEdit = (i) => { setForm({ ...depts[i] }); setModal(i); };

  const saveDept = async () => {
    if (!form.name.trim())  { showToast("Name is required", "red"); return; }
    if (!form.email.trim() || !form.email.includes("@")) { showToast("Valid email required", "red"); return; }
    const updated = modal === "new"
      ? [...depts, { name: form.name.trim(), email: form.email.trim(), description: form.description.trim() }]
      : depts.map((d, i) => i === modal ? { name: form.name.trim(), email: form.email.trim(), description: form.description.trim() } : d);
    await persist(updated);
    setModal(null);
  };

  const deleteDept = async (i) => {
    await persist(depts.filter((_, idx) => idx !== i));
  };

  const moveUp   = (i) => { if (i === 0) return; const deptsArr = [...depts]; [deptsArr[i-1], deptsArr[i]] = [deptsArr[i], deptsArr[i-1]]; persist(deptsArr); };
  const moveDown = (i) => { if (i === depts.length-1) return; const deptsArr = [...depts]; [deptsArr[i], deptsArr[i+1]] = [deptsArr[i+1], deptsArr[i]]; persist(deptsArr); };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contact Departments</div>
          <div className="page-sub">Manage the dropdown options and destination emails on the Contact Us page</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Department</button>
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>Loading…</div>}

      {!loading && depts.length === 0 && (
        <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>
          No departments yet. Click <strong>+ Add Department</strong> to get started.
        </div>
      )}

      {!loading && depts.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Order</th><th>Department</th><th>Email Address</th><th>Description</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {depts.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                        <button className="btn btn-sm btn-ghost" style={{ padding:"2px 6px", fontSize:10 }} onClick={() => moveUp(i)} disabled={i === 0 || saving}>▲</button>
                        <button className="btn btn-sm btn-ghost" style={{ padding:"2px 6px", fontSize:10 }} onClick={() => moveDown(i)} disabled={i === depts.length-1 || saving}>▼</button>
                      </div>
                    </td>
                    <td style={{ fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".06em", color:"var(--accent)", textTransform:"uppercase" }}>{d.name}</td>
                    <td style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>{d.email}</td>
                    <td style={{ fontSize:12, color:"var(--muted)", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.description || "—"}</td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(i)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteDept(i)} disabled={saving}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:12 }}>Emails are never shown publicly — they only receive the contact form submissions.</div>
        </div>
      )}

      {modal !== null && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:480 }}>
            <div className="modal-title">{modal === "new" ? "➕ Add Department" : `✏️ Edit — ${depts[modal]?.name}`}</div>

            <div className="form-group">
              <label>Department Name *</label>
              <input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="e.g. Bookings, General, Marshals" />
            </div>
            <div className="form-group">
              <label>Email Address * <span style={{ color:"var(--muted)", fontWeight:400 }}>(not shown publicly)</span></label>
              <input value={form.email} onChange={e => ff("email", e.target.value)} placeholder="department@example.com" type="email" />
            </div>
            <div className="form-group">
              <label>Description <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional — shown to users in dropdown)</span></label>
              <textarea rows={2} value={form.description} onChange={e => ff("description", e.target.value)} placeholder="e.g. For questions about booking events and game days" />
            </div>

            <div className="gap-2" style={{ marginTop:18 }}>
              <button className="btn btn-primary" onClick={saveDept} disabled={saving}>{saving ? "Saving…" : modal === "new" ? "Add Department" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Test Card ────────────────────────────────────────
function EmailTestCard({ showToast, sectionHead }) {
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { ok, msg }
  const [open, setOpen] = React.useState(false);
  const emailSectionHead = (label) => (
    <div
      onClick={() => setOpen(o => !o)}
      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", userSelect:"none", fontWeight:700, fontSize:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase", marginBottom: open ? 14 : 0 }}
    >
      <span>{label}</span>
      <span style={{ fontSize:16, color:"var(--muted)", transition:"transform .2s", display:"inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
    </div>
  );

  const runTest = async () => {
    if (!testEmail || !testEmail.includes("@")) { showToast("Enter a valid email address", "red"); return; }
    setTesting(true);
    setLastResult(null);
    try {
      await sendEmail({
        toEmail: testEmail.trim(),
        toName: "Admin Test",
        subject: "✅ Swindon Airsoft — Email Test",
        htmlContent: `
          <div style="max-width:600px;margin:0 auto;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;">
            <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
              <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="160" style="display:block;margin:0 auto 8px;height:auto;" />
              <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Email Test</div>
            </div>
            <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;text-align:center;">
              <div style="font-size:40px;margin-bottom:12px;">✅</div>
              <div style="font-size:22px;font-weight:900;color:#c8ff00;">EmailJS is working!</div>
              <div style="font-size:13px;color:#aaa;margin-top:10px;">
                Sent at ${new Date().toLocaleString("en-GB")}<br/>
                Service: ${EMAILJS_SERVICE_ID} · Template: ${EMAILJS_TEMPLATE_ID}
              </div>
            </div>
          </div>`,
      });
      setLastResult({ ok: true, msg: "Email sent successfully! Check your inbox (and spam)." });
      showToast("📧 Test email sent!");
    } catch (e) {
      const msg = e?.text || e?.message || JSON.stringify(e);
      setLastResult({ ok: false, msg: "Failed: " + msg });
      showToast("Email failed: " + msg, "red");
    } finally { setTesting(false); }
  };

  return (
    <div className="card mb-2">
      {emailSectionHead("📧 Email Diagnostics")}
      {open && <>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.7 }}>
          Send a test email to verify EmailJS is configured correctly.<br/>
          Service: <span className="mono" style={{ color: "var(--accent)" }}>{EMAILJS_SERVICE_ID}</span> ·
          Template: <span className="mono" style={{ color: "var(--accent)" }}>{EMAILJS_TEMPLATE_ID}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            onKeyDown={e => e.key === "Enter" && runTest()}
            style={{ flex: 1, fontSize: 13 }}
          />
          <button className="btn btn-primary" onClick={runTest} disabled={testing} style={{ whiteSpace: "nowrap" }}>
            {testing ? "Sending…" : "Send Test Email"}
          </button>
        </div>
        {lastResult && (
          <div className={`alert ${lastResult.ok ? "alert-green" : "alert-red"}`} style={{ fontSize: 12 }}>
            {lastResult.ok ? "✅ " : "❌ "}{lastResult.msg}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>If the test fails, check:</strong><br/>
          • EmailJS dashboard → your template has variables: <span className="mono">to_email</span>, <span className="mono">to_name</span>, <span className="mono">subject</span>, <span className="mono">html_content</span><br/>
          • The service is connected and verified in EmailJS<br/>
          • Your EmailJS free tier hasn't hit its monthly limit (200/month)<br/>
          • The template's "To Email" field is set to <span className="mono">{"{{to_email}}"}</span>
        </div>
      </>}
    </div>
  );
}

// ── Admin Settings ────────────────────────────────────────

// ── Admin Purchase Orders ─────────────────────────────────────
