import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import {
  fmtErr,
  EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY,
  sendEmail,
} from "./utils";
import { logAction } from "./adminShared";

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
function AdminContactDepts({ showToast, save, cu }) {
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

export { ContactPage, EmailTestCard };
export default AdminContactDepts;
