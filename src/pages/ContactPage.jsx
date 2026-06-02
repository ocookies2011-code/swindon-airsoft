// pages/ContactPage.jsx
import React, { useRef, useState } from "react";
import { sendEmail, useMobile } from "../utils";
import { supabase } from "../supabaseClient";

function ContactPage({ data, cu, showToast }) {
  const isMobile = useMobile(640);
  const departments = data.contactDepartments || [];

  const blank = { name: cu?.name || "", email: cu?.email || "", department: "", subject: "", message: "" };
  const [form, setForm]       = useState(blank);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const lastSentRef = useRef(0);
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

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

    setSending(true);
    try {
      // 1. Save to DB (works for guests too — RLS allows anon INSERT)
      const { data: saved, error: dbErr } = await supabase
        .from("contact_messages")
        .insert({
          sender_name:  form.name.trim(),
          sender_email: form.email.trim(),
          subject:      `[${form.department}] ${form.subject.trim()}`,
          body:         form.message.trim(),
          user_id:      cu?.id || null,
        })
        .select("id")
        .single();

      if (dbErr) console.warn("contact_messages insert:", dbErr.message);

      // 2. Email notification to admin
      await sendEmail({
        toEmail:     "swindonairsoftfield@gmail.com",
        toName:      "Swindon Airsoft Admin",
        subject:     `[Contact] [${form.department}] ${form.subject.trim()} — ${form.name.trim()}`,
        htmlContent: `
          <div style="font-family:'Courier New',monospace;max-width:600px;background:#000;padding:0">
            <div style="background:#0a1a0a;padding:24px 32px;border-bottom:1px solid #2a3a2a">
              <p style="margin:0 0 6px;color:#8aaa8a;font-size:11px;letter-spacing:3px;text-transform:uppercase">Swindon Airsoft · Contact Form</p>
              <h1 style="margin:0;color:#c8ff00;font-size:26px;font-weight:900;letter-spacing:2px;text-transform:uppercase">New Message</h1>
            </div>
            <div style="padding:0 32px">
              <table style="width:100%;border-collapse:collapse">
                <tr style="border-bottom:1px solid #2a3a2a">
                  <td style="padding:12px 0;color:#8aaa8a;font-size:11px;letter-spacing:2px;text-transform:uppercase;width:120px">From</td>
                  <td style="padding:12px 0;color:#e0e0e0;font-weight:bold">${form.name.trim()}</td>
                </tr>
                <tr style="border-bottom:1px solid #2a3a2a">
                  <td style="padding:12px 0;color:#8aaa8a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Reply To</td>
                  <td style="padding:12px 0"><a href="mailto:${form.email.trim()}" style="color:#c8ff00">${form.email.trim()}</a></td>
                </tr>
                <tr style="border-bottom:1px solid #2a3a2a">
                  <td style="padding:12px 0;color:#8aaa8a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Department</td>
                  <td style="padding:12px 0;color:#e0e0e0">${form.department}</td>
                </tr>
                <tr style="border-bottom:1px solid #2a3a2a">
                  <td style="padding:12px 0;color:#8aaa8a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Subject</td>
                  <td style="padding:12px 0;color:#e0e0e0">${form.subject.trim()}</td>
                </tr>
              </table>
            </div>
            <div style="padding:20px 32px">
              <p style="margin:0 0 10px;color:#8aaa8a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Message</p>
              <div style="background:#0a1a0a;border:1px solid #2a3a2a;padding:18px;color:#e0e0e0;line-height:1.7;white-space:pre-wrap">${form.message.trim()}</div>
            </div>
            <div style="padding:16px 32px;border-top:1px solid #2a3a2a;text-align:center">
              <a href="https://swindon-airsoft.com/admin#admin/contact-inbox" style="display:inline-block;background:#c8ff00;color:#000;padding:12px 28px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-size:12px">Reply in Admin Panel</a>
            </div>
            <div style="padding:12px 32px;text-align:center">
              <p style="margin:0;color:#4a6a4a;font-size:10px;letter-spacing:2px;text-transform:uppercase">Swindon Airsoft · Auto-Generated Notification</p>
            </div>
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

  const selectedDept = departments.find(d => d.name === form.department);

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
          <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 48, color: "#c8ff00", padding: "8px 24px", letterSpacing: ".1em" }}>✓</div>
        </div>
        <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, letterSpacing: ".2em", textTransform: "uppercase", color: "#e8f0d8", marginBottom: 12 }}>TRANSMISSION SENT</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#3a5010", letterSpacing: ".1em", marginBottom: 8 }}>MESSAGE ROUTED TO: <span style={{ color: "#c8ff00" }}>{form.department.toUpperCase()}</span></div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#2a3a10", letterSpacing: ".08em", marginBottom: 32 }}>WE'LL REPLY TO: {form.email}</div>
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
          <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            OPEN <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>CHANNEL</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ SECURE TRANSMISSION LINE — WE'LL REPLY TO YOUR EMAIL ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 24 }}>

          {/* Form */}
          <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "28px 24px" }}>
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 22, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 10 }}>
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
                <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ DEPARTMENTS</div>
                {departments.map((d, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: i < departments.length-1 ? "1px solid #1a2808" : "none" }}>
                    <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: ".15em", color: "#c8ff00", textTransform: "uppercase", marginBottom: 4 }}>▸ {d.name}</div>
                    {d.description && <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", lineHeight: 1.5 }}>{d.description}</div>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ HOW IT WORKS</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", lineHeight: 1.8 }}>
                <div style={{ marginBottom: 8 }}>01 — Fill in the form and send</div>
                <div style={{ marginBottom: 8 }}>02 — We receive it instantly</div>
                <div>03 — Reply arrives in your email inbox</div>
              </div>
            </div>

            {(data.contactAddress || data.contactPhone || data.contactEmail) && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
                <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ BASE COORDINATES</div>
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

export { ContactPage };
