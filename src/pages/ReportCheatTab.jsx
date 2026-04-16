import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { normaliseProfile, squareRefund, waitlistApi, holdApi } from "../api";
import {
  renderMd, stockLabel, fmtErr,
  gmtNow, gmtDate, gmtShort, fmtDate, uid,
  CSS,
  loadSquareConfig, SquareCheckoutButton,
  TRACKING_CACHE_KEY, TRACKING_TTL_MS, TRACKING_TTL_SHORT_MS,
  detectCourier, TrackingBlock,
  useData,
  SkeletonCard, Toast, useMobile, useToast,
  GmtClock, Countdown, QRCode, QRScanner,
  SupabaseAuthModal, WaiverModal, PublicNav,
  sendEmail, sendOrderEmail, sendDispatchEmail,
  sendAdminOrderNotification, sendAdminBookingNotification,
  sendWelcomeEmail, sendTicketEmail, sendCancellationEmail,
  sendWaitlistNotifyEmail, sendAdminReturnNotification, sendAdminUkaraNotification, sendUkaraDecisionEmail,
  HomePage, CountdownPanel,
} from "../utils";
import { AdminPanel, AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage } from "../index";

export default function ReportCheatTab({ cu, showToast }) {
  const BLANK = { reportedName: "", videoUrl: "", description: "" };
  const SS_KEY = "report_cheat_form";

  // Restore from sessionStorage on mount — form survives tab/page switches
  const [form, setForm] = useState(() => {
    try { const s = sessionStorage.getItem(SS_KEY); return s ? JSON.parse(s) : BLANK; } catch { return BLANK; }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  // Persist form to sessionStorage on every change
  useEffect(() => {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify(form)); } catch {}
  }, [form]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.videoUrl.trim()) { showToast("Please include a video link as evidence", "red"); return; }
    if (!form.description.trim() || form.description.trim().length < 20) { showToast("Please describe what happened in more detail (at least 20 characters)", "red"); return; }
    // Basic URL validation
    try { new URL(form.videoUrl.trim()); } catch { showToast("Please enter a valid video URL (e.g. YouTube link)", "red"); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("cheat_reports").insert({
        reporter_id:   cu.id,
        reporter_name: cu.name,
        reported_name: form.reportedName.trim() || null,
        video_url:     form.videoUrl.trim(),
        description:   form.description.trim(),
        status:        "pending",
      });
      if (error) throw error;

      // Notify admin by email
      try {
        const adminEmail = await api.settings.get("contact_email");
        if (adminEmail) {
          await sendEmail({
            toEmail:     adminEmail,
            toName:      "Admin",
            subject:     "🚩 New Cheat Report Submitted",
            htmlContent: `
              <div style="font-family:sans-serif;max-width:600px;background:#111;color:#ddd;padding:24px;border-radius:8px">
                <h2 style="color:#ef5350;font-family:'Barlow Condensed',sans-serif;letter-spacing:.1em;text-transform:uppercase;margin-top:0">⚑ New Cheat Report</h2>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px;width:140px">REPORTED BY</td><td style="padding:8px;background:#0d0d0d;color:#fff">${cu.name}</td></tr>
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">ACCUSED PLAYER</td><td style="padding:8px;background:#0d0d0d;color:#ef5350">${form.reportedName.trim() || "Not specified"}</td></tr>
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">VIDEO EVIDENCE</td><td style="padding:8px;background:#0d0d0d"><a href="${form.videoUrl.trim()}" style="color:#c8ff00">${form.videoUrl.trim()}</a></td></tr>
                  <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">DESCRIPTION</td><td style="padding:8px;background:#0d0d0d;color:#ccc;white-space:pre-wrap">${form.description.trim()}</td></tr>
                </table>
                <p style="margin-top:20px;font-size:12px;color:#666">Review this report in the admin panel under <strong style="color:#aaa">Cheat Reports</strong>. The reporter has not been told anything about the outcome.</p>
              </div>
            `,
          });
        } else {
          console.warn("Cheat report email: no contact_email configured in site settings");
        }
      } catch (emailErr) {
        console.error("Cheat report email failed:", emailErr?.message || emailErr);
        // Report is still submitted — email failure is non-fatal
      }

      try { sessionStorage.removeItem(SS_KEY); } catch {}
      setSubmitted(true);
      setForm(BLANK);
    } catch (e) {
      showToast("Submission failed: " + e.message, "red");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return (
    <div className="card" style={{ textAlign:"center", padding:"48px 24px" }}>
      <div style={{ fontSize:44, marginBottom:16 }}>🔒</div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".12em", color:"var(--accent)", marginBottom:10 }}>REPORT RECEIVED</div>
      <div style={{ fontSize:13, color:"var(--muted)", lineHeight:1.8, maxWidth:420, margin:"0 auto 24px" }}>
        Your report has been submitted and will be reviewed by our admin team. All reports are strictly confidential — you will not receive an update on the outcome.
      </div>
      <button className="btn btn-ghost" onClick={() => setSubmitted(false)}>Submit another report</button>
    </div>
  );

  return (
    <div className="card" style={{ maxWidth:640 }}>
      <div style={{ borderLeft:"3px solid #ef5350", paddingLeft:14, marginBottom:20 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".1em", color:"#ef5350" }}>REPORT A PLAYER FOR CHEATING</div>
        <div style={{ fontSize:12, color:"var(--muted)", marginTop:4, lineHeight:1.6 }}>
          Reports are strictly confidential. <strong>Video evidence is mandatory.</strong> False reports may result in action against your own account.
        </div>
      </div>

      <div className="form-group">
        <label>Player Name Being Reported <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional — helps us identify them)</span></label>
        <input value={form.reportedName} onChange={e => setF("reportedName", e.target.value)} placeholder="e.g. John Smith, callsign Viper…" />
      </div>

      <div className="form-group">
        <label>Video Evidence Link <span style={{ color:"#ef5350" }}>*</span></label>
        <input value={form.videoUrl} onChange={e => setF("videoUrl", e.target.value)} placeholder="https://youtube.com/… or Google Drive link…" type="url" />
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>
          Must clearly show deliberate hit-not-calling or cheating. Reports without clear video evidence will be dismissed.
        </div>
      </div>

      <div className="form-group">
        <label>What Happened? <span style={{ color:"#ef5350" }}>*</span></label>
        <textarea
          value={form.description}
          onChange={e => setF("description", e.target.value)}
          rows={6}
          placeholder="Describe exactly what occurred — the game, location on field, what the player did, and why you believe it was deliberate cheating…"
          style={{ resize:"vertical" }}
        />
        <div style={{ fontSize:11, color: form.description.trim().length < 20 && form.description.length > 0 ? "var(--red)" : "var(--muted)", marginTop:4 }}>
          {form.description.trim().length} characters {form.description.trim().length < 20 ? "(minimum 20)" : "✓"}
        </div>
      </div>

      <div style={{ background:"rgba(200,160,0,.08)", border:"1px solid rgba(200,160,0,.2)", padding:"12px 14px", marginBottom:18, borderRadius:4, fontSize:12, color:"var(--muted)", lineHeight:1.7 }}>
        ⚠️ <strong style={{ color:"var(--gold)" }}>Confidentiality notice:</strong> Your identity as the reporter is known to admins but will never be shared with the reported player or anyone else. You will not receive confirmation of any action taken.
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={submitting}>
        {submitting ? "Submitting…" : "🚩 Submit Report"}
      </button>
    </div>
  );
}

