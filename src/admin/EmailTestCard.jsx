// admin/EmailTestCard.jsx — admin email send tester
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import * as emailUtils from "../utils/email";
import { sendEmail } from "../utils";

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

export { EmailTestCard };
