import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { normaliseProfile, squareRefund, waitlistApi, holdApi } from "./api";
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
} from "./utils";
import { AdminPanel, AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage } from "../index";


export default function UKARAPage({ cu, setPage, showToast, setAuthModal }) {
  const isMobile = useMobile(640);

  // Build full address string from waiverData if available
  const waiverAddress = (() => {
    const w = cu?.waiverData;
    if (!w) return "";
    return [w.addr1, w.addr2, w.city, w.county, w.postcode, w.country]
      .filter(Boolean).join("\n");
  })();

  const [form, setForm] = useState({
    name:        cu?.waiverData?.name  || cu?.name  || "",
    email:       cu?.email             || "",
    phone:       cu?.waiverData?.phone || cu?.phone || "",
    dob:         cu?.waiverData?.dob   || "",
    address:     waiverAddress,
    declaration: false,
  });
  const [govIdFile, setGovIdFile]         = useState(null);
  const [govIdPreview, setGovIdPreview]   = useState(null);
  const [faceFile, setFaceFile]           = useState(null);
  const [facePreview, setFacePreview]     = useState(null);
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [existingApp, setExistingApp]     = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(!!cu);
  const [renewalPaying, setRenewalPaying] = useState(false);
  const [useSubscription, setUseSubscription] = useState(false);
  // "idle" | "details" | "payment"  — steps in the application flow
  const [appStep, setAppStep]             = useState("details");
  const [squarePayment, setSquarePayment] = useState(null);

  useEffect(() => {
    if (cu) {
      // Re-fill from waiver if user logs in after page load
      const w = cu.waiverData;
      const addr = w ? [w.addr1, w.addr2, w.city, w.county, w.postcode, w.country].filter(Boolean).join("\n") : "";
      setForm(f => ({
        ...f,
        name:    w?.name  || cu.name  || f.name,
        email:   cu.email || f.email,
        phone:   w?.phone || cu.phone || f.phone,
        dob:     w?.dob   || f.dob,
        address: addr      || f.address,
      }));
      api.ukaraApplications.getByUser(cu.id)
        .then(app => { setExistingApp(app); setCheckingExisting(false); })
        .catch(() => setCheckingExisting(false));
    } else {
      setCheckingExisting(false);
    }
  }, [cu]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const pickFile = (setter, previewSetter) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setter(file);
    const reader = new FileReader();
    reader.onload = ev => previewSetter(ev.target.result);
    reader.readAsDataURL(file);
  };

  const getCountdown = (expiresAt) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return { expired: true };
    const days = Math.floor(diff / 86400000);
    return { expired: false, days };
  };

  // Step 1 — validate details & docs, advance to payment
  const handleProceedToPayment = () => {
    if (!cu) { setAuthModal("login"); return; }
    if (!form.name.trim() || !form.email.trim() || !form.dob || !form.address.trim() || !form.phone.trim()) {
      showToast("Please fill in all required fields.", "red"); return;
    }
    if (!govIdFile) { showToast("Please upload a Government ID photo.", "red"); return; }
    if (!faceFile)  { showToast("Please upload a full face photo.", "red"); return; }
    if (!form.declaration) { showToast("You must agree to the declaration.", "red"); return; }
    const gamesAtSwindon = cu?.gamesAttended || 0;
    if (gamesAtSwindon < 3) {
      showToast(`You need at least 3 games at Swindon Airsoft. You have ${gamesAtSwindon}.`, "red"); return;
    }
    setAppStep("payment");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Step 2 — payment succeeded, submit application + files
  const handlePaymentSuccess = async (sqPayment) => {
    setSquarePayment(sqPayment);
    setSubmitting(true);
    try {
      const gamesAtSwindon = cu?.gamesAttended || 0;
      const app = await api.ukaraApplications.insert({
        user_id:           cu.id,
        name:              form.name.trim(),
        email:             form.email.trim(),
        phone:             form.phone.trim(),
        dob:               form.dob,
        address:           form.address.trim(),
        games_attended:    gamesAtSwindon,
        proof_description: `${gamesAtSwindon} games verified at Swindon Airsoft`,
        declaration_signed: true,
        status:            "pending",
        payment_id:        sqPayment.id,
      });

      const [govIdUrl, faceUrl] = await Promise.all([
        api.ukaraApplications.uploadGovId(cu.id, app.id, govIdFile),
        api.ukaraApplications.uploadFacePhoto(cu.id, app.id, faceFile),
      ]);
      await api.ukaraApplications.update(app.id, { gov_id_url: govIdUrl, face_photo_url: faceUrl });

      api.settings.get("contact_email").then(adminEmail => {
        if (adminEmail) sendAdminUkaraNotification({ adminEmail, app: { ...app, gov_id_url: govIdUrl, face_photo_url: faceUrl } }).catch(() => {});
      }).catch(() => {});

      setExistingApp({ ...app, gov_id_url: govIdUrl, face_photo_url: faceUrl });
      setSubmitted(true);
      showToast("✅ Payment received & application submitted! We'll be in touch.");
    } catch (e) {
      showToast("Payment taken but submission failed — contact us with Square ref: " + sqPayment.id, "red");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenewalPaid = async (sqPayment) => {
    setRenewalPaying(true);
    try {
      await api.ukaraApplications.processRenewal(existingApp.id, sqPayment.id);
      api.settings.get("contact_email").then(adminEmail => {
        if (adminEmail) sendAdminUkaraNotification({ adminEmail, app: existingApp, isRenewal: true }).catch(() => {});
      }).catch(() => {});
      const updated = await api.ukaraApplications.getByUser(cu.id);
      setExistingApp(updated);
      showToast("✅ Renewal payment received! Your UKARA is now active for another year.");
    } catch (e) {
      showToast("Payment taken but renewal failed — contact us with Square ref: " + sqPayment.id, "red");
    } finally {
      setRenewalPaying(false);
    }
  };

  const inputStyle = {
    width: "100%", background: "#0a0d07", border: "1px solid #2a3a10",
    color: "#e8f0d0", padding: "10px 14px", borderRadius: 6,
    fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box",
    transition: "border-color .2s",
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontFamily: "'Share Tech Mono', monospace",
    letterSpacing: ".12em", color: "#7a9a50", marginBottom: 6, textTransform: "uppercase",
  };

  const countdown    = existingApp?.expires_at ? getCountdown(existingApp.expires_at) : null;
  const isExpired    = countdown?.expired;
  const expiresSoon  = countdown && !countdown.expired && countdown.days <= 60;

  const steps = [
    { num: "01", title: "Attend 3 Games",   desc: "At least 3 game days at Swindon Airsoft within the past year." },
    { num: "02", title: "Fill in Details",  desc: "Your personal details, Government ID and a full face photo." },
    { num: "03", title: "Pay £5",           desc: "Annual registration fee paid upfront via card." },
    { num: "04", title: "Admin Approval",   desc: "We verify your details. Your UKARA ID is issued within 3–5 working days." },
  ];

  const faqs = [
    { q: "What is UKARA?", a: "UKARA (United Kingdom Airsoft Retailers Association) is a registration scheme that provides a legal defence for purchasing Realistic Imitation Firearms (RIFs) in the UK." },
    { q: "Do I need UKARA to play airsoft?", a: "No — you only need UKARA if you wish to purchase a RIF. Two-tone airsoft guns can be bought by anyone." },
    { q: "How many games do I need?", a: "You must have attended at least 3 game days at Swindon Airsoft within the past year. We verify this automatically from your booking history." },
    { q: "How long does UKARA last?", a: "UKARA is valid for 12 months. You must renew annually (£5/year) to maintain your defence." },
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: isMobile ? "40px 20px 36px" : "60px 24px 52px", textAlign: "center" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.08) 3px,rgba(0,0,0,.08) 4px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: ".3em", color: "#3a5010", marginBottom: 12 }}>// SWINDON AIRSOFT · LEGAL COMPLIANCE</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: isMobile ? 36 : 52, letterSpacing: ".04em", textTransform: "uppercase", color: "#e8f0d0", lineHeight: 1, marginBottom: 12 }}>
            UKARA <span style={{ color: "#c8ff00" }}>Registration</span>
          </div>
          <p style={{ color: "#6a8a50", fontSize: 14, lineHeight: 1.7, margin: "0 0 24px" }}>
            Your legal defence for purchasing Realistic Imitation Firearms in the UK. £5/year.
          </p>
          {!cu?.ukara && !existingApp && (
            <a href="#ukara-form" style={{ background: "#c8ff00", color: "#0a0e07", padding: "11px 28px", borderRadius: 6, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: ".1em", textDecoration: "none", textTransform: "uppercase" }}>
              Apply Now ↓
            </a>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "24px 16px 60px" : "40px 24px 80px" }}>

        {/* Steps */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 40 }}>
          {steps.map(s => (
            <div key={s.num} style={{ background: "#0a0d07", border: "1px solid #1e2a10", borderRadius: 8, padding: "16px 14px" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 900, color: "#c8ff00", opacity: .4, lineHeight: 1, marginBottom: 6 }}>{s.num}</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: "#e8f0d0", letterSpacing: ".06em", marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "#5a7a40", lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* ── ALREADY HAS UKARA (set via VIP / admin directly on profile) ── */}
        {!checkingExisting && cu?.ukara && !existingApp && (() => {
          const ukaraExpiry     = cu.ukaraExpiresAt ? new Date(cu.ukaraExpiresAt) : null;
          const ukaraIsExpired  = ukaraExpiry && ukaraExpiry < new Date();
          const ukaraExpiresSoon = ukaraExpiry && !ukaraIsExpired && (ukaraExpiry - new Date()) < 1000 * 60 * 60 * 24 * 60;
          return (
            <div style={{ background: ukaraIsExpired ? "rgba(220,50,50,.06)" : "rgba(200,255,0,.06)", border: `1px solid ${ukaraIsExpired ? "#5a1a1a" : "#2a4a10"}`, borderRadius: 10, padding: "28px 32px", textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎖️</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: ukaraIsExpired ? "#ff6060" : "#c8ff00", letterSpacing: ".08em", marginBottom: 8 }}>
                {ukaraIsExpired ? "UKARA ID EXPIRED" : "YOU ALREADY HAVE A UKARA ID"}
              </div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 16, color: "#e8f0d0", marginBottom: 10, letterSpacing: ".1em" }}>{cu.ukara}</div>
              {ukaraExpiry && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,.2)", borderRadius: 6, padding: "6px 14px", marginBottom: 12 }}>
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: ukaraIsExpired ? "#8a3030" : "#4a6a30", letterSpacing: ".1em" }}>
                    {ukaraIsExpired ? "EXPIRED" : "EXPIRES"}
                  </span>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, color: ukaraIsExpired ? "#ff6060" : ukaraExpiresSoon ? "#ffb74d" : "#e8f0d0" }}>
                    {ukaraExpiry.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
              <p style={{ color: ukaraIsExpired ? "#8a4040" : "#6a8a50", fontSize: 13, margin: 0 }}>
                {ukaraIsExpired
                  ? <>Your UKARA has expired. Please <button onClick={() => setPage("contact")} style={{ background: "none", border: "none", color: "#c8d8a0", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13 }}>contact us</button> to renew.</>
                  : ukaraExpiresSoon
                  ? <>Your UKARA expires soon. Please <button onClick={() => setPage("contact")} style={{ background: "none", border: "none", color: "#c8d8a0", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13 }}>contact us</button> to arrange renewal.</>
                  : <>Your UKARA ID is active. If you need to renew or have any issues, please <button onClick={() => setPage("contact")} style={{ background: "none", border: "none", color: "#c8d8a0", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13 }}>contact us</button>.</>
                }
              </p>
            </div>
          );
        })()}

        {/* ── APPROVED application card ── */}
        {!checkingExisting && existingApp?.status === "approved" && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ background: isExpired ? "rgba(220,50,50,.06)" : "rgba(200,255,0,.06)", border: `1px solid ${isExpired ? "#5a1a1a" : "#2a4a10"}`, borderRadius: 10, padding: "28px 32px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents: "none" }} />
              <div style={{ position: "relative", zIndex: 1 }}>

                {/* Medal + ID header */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 48, lineHeight: 1 }}>🎖️</div>
                  <div>
                    <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, letterSpacing: ".25em", color: isExpired ? "#8a3030" : "#3a6020", marginBottom: 4 }}>
                      {isExpired ? "// UKARA EXPIRED" : "// UKARA ACTIVE"}
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 900, color: isExpired ? "#ff6060" : "#c8ff00", letterSpacing: ".06em", lineHeight: 1 }}>
                      {existingApp.ukara_id}
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, color: "#4a7030", letterSpacing: ".04em", marginTop: 2 }}>
                      SWINDON AIRSOFT · REGISTERED PLAYER
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#4a6a30", marginBottom: 2, letterSpacing: ".1em", fontFamily: "'Share Tech Mono', monospace" }}>
                      {isExpired ? "EXPIRED" : "EXPIRES"}
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: isExpired ? "#ff6060" : expiresSoon ? "#ffb74d" : "#e8f0d0" }}>
                      {new Date(existingApp.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    {!isExpired && countdown && (
                      <div style={{ fontSize: 12, color: expiresSoon ? "#ffb74d" : "#5a7a40", marginTop: 2 }}>
                        {countdown.days} days remaining
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {!isExpired && countdown && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: "#3a5010", letterSpacing: ".15em" }}>VALIDITY</span>
                      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: expiresSoon ? "#ffb74d" : "#3a5010" }}>{Math.round((countdown.days / 365) * 100)}% REMAINING</span>
                    </div>
                    <div style={{ height: 6, background: "#1a2a08", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, (countdown.days / 365) * 100)}%`, background: expiresSoon ? "linear-gradient(90deg,#ff8c00,#ffb74d)" : "linear-gradient(90deg,#8aff00,#c8ff00)", transition: "width .5s", borderRadius: 3 }} />
                    </div>
                  </div>
                )}

                {/* Renewal prompt */}
                {(isExpired || expiresSoon) && !existingApp.renewal_requested && (
                  <div style={{ background: isExpired ? "rgba(220,50,50,.1)" : "rgba(255,183,77,.08)", border: `1px solid ${isExpired ? "#5a2020" : "#4a3810"}`, borderRadius: 8, padding: "16px 18px", marginBottom: 0 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: isExpired ? "#ff8080" : "#ffb74d", fontSize: 15, marginBottom: 6 }}>
                      {isExpired ? "⚠️ Your UKARA has expired" : "⚠️ Your UKARA expires soon"}
                    </div>
                    <p style={{ color: "#7a6040", fontSize: 13, margin: "0 0 14px", lineHeight: 1.6 }}>
                      Renew now to keep your legal defence for purchasing RIFs. Annual fee: <strong style={{ color: "#c8ff00" }}>£5</strong>.
                    </p>

                    {/* Subscription toggle */}
                    <div style={{ background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.12)", borderRadius: 6, padding: "12px 14px", marginBottom: 14 }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={useSubscription}
                          onChange={e => setUseSubscription(e.target.checked)}
                          style={{ marginTop: 2, accentColor: "#c8ff00", width: 15, height: 15, flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, color: "#c8d8a0", letterSpacing: ".06em" }}>
                            AUTO-RENEW — £5/YEAR
                          </div>
                          <div style={{ fontSize: 11, color: "#5a7a40", marginTop: 2, lineHeight: 1.5 }}>
                            We'll remind you before your UKARA expires each year. You can cancel at any time by contacting us — no commitment.
                          </div>
                        </div>
                      </label>
                    </div>

                    <SquareCheckoutButton
                      amount={5}
                      description={`UKARA Annual Renewal${useSubscription ? " (Auto-renew opted in)" : ""} — Swindon Airsoft`}
                      onSuccess={handleRenewalPaid}
                      disabled={renewalPaying}
                    />
                    {renewalPaying && <div style={{ marginTop: 10, color: "#8aaa50", fontSize: 13 }}>⏳ Processing renewal…</div>}

                    {useSubscription && (
                      <p style={{ fontSize: 11, color: "#3a5010", marginTop: 10, lineHeight: 1.6 }}>
                        By opting in you agree to be contacted annually for renewal. To cancel auto-renew at any time,{" "}
                        <button onClick={() => setPage("contact")} style={{ background: "none", border: "none", color: "#6a9a40", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 11 }}>contact us</button>.
                      </p>
                    )}
                  </div>
                )}

                {existingApp.renewal_requested && !isExpired && !expiresSoon && (
                  <div style={{ background: "rgba(200,255,0,.05)", border: "1px solid #2a3a10", borderRadius: 8, padding: "14px 18px", fontSize: 13, color: "#6a8a50" }}>
                    ✓ Renewal payment received. Your UKARA has been extended for another year.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PENDING ── */}
        {!checkingExisting && existingApp?.status === "pending" && (
          <div style={{ background: "rgba(255,183,77,.06)", border: "1px solid #3a2800", borderRadius: 10, padding: "28px 32px", marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "#ffb74d", letterSpacing: ".08em", marginBottom: 8 }}>APPLICATION UNDER REVIEW</div>
            <p style={{ color: "#7a6040", fontSize: 13, margin: 0 }}>Your application and £5 payment have been received. We'll contact you at <strong style={{ color: "#c8d8a0" }}>{existingApp.email}</strong> within 3–5 working days.</p>
          </div>
        )}

        {/* ── DECLINED ── */}
        {!checkingExisting && existingApp?.status === "declined" && (
          <div style={{ background: "rgba(220,50,50,.06)", border: "1px solid #5a1a1a", borderRadius: 10, padding: "28px 32px", marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "#ff6060", letterSpacing: ".08em", marginBottom: 8 }}>APPLICATION DECLINED</div>
            {existingApp.admin_notes && <p style={{ color: "#c8a0a0", fontSize: 13, margin: "0 0 8px" }}>Reason: {existingApp.admin_notes}</p>}
            <p style={{ color: "#6a4040", fontSize: 12, marginTop: 8 }}>Please <button onClick={() => setPage("contact")} style={{ background: "none", border: "none", color: "#ff8080", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 12 }}>contact us</button> if you have questions.</p>
          </div>
        )}

        {/* ── APPLICATION FORM — only if no existing active/pending app ── */}
        {!checkingExisting && !cu?.ukara && (!existingApp || existingApp.status === "declined") && (
          <div id="ukara-form" style={{ scrollMarginTop: 80 }}>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: "#e8f0d0", margin: "0 0 6px", letterSpacing: ".03em" }}>
              {existingApp?.status === "declined" ? "Re-Apply for UKARA Registration" : "Apply for UKARA Registration"}
            </h2>
            <p style={{ color: "#5a7a40", fontSize: 13, margin: "0 0 24px" }}>Annual fee: £5 — paid with your application.</p>

            {submitted ? (
              <div style={{ background: "rgba(200,255,0,.06)", border: "1px solid #2a4a10", borderRadius: 10, padding: "40px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎖️</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: "#c8ff00", letterSpacing: ".08em", marginBottom: 10 }}>APPLICATION SUBMITTED</div>
                <p style={{ color: "#8aaa60", fontSize: 14, lineHeight: 1.7, marginBottom: 4 }}>Payment received and application submitted.</p>
                <p style={{ color: "#6a8a50", fontSize: 13, lineHeight: 1.7 }}>We'll review your details and contact you at <strong style={{ color: "#c8d8a0" }}>{form.email}</strong> within 3–5 working days.</p>
                <button onClick={() => setPage("home")} className="btn btn-ghost" style={{ marginTop: 20 }}>← Back to Home</button>
              </div>
            ) : appStep === "payment" ? (
              /* ── Step 2: Payment ── */
              <div style={{ background: "#0a0d07", border: "1px solid #1e2a10", borderRadius: 10, padding: isMobile ? "20px 16px" : "32px 36px", position: "relative" }}>
                {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                  <div key={v+h} style={{ position: "absolute", [v]: 0, [h]: 0, width: 22, height: 22, borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none", borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none" }} />
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <button onClick={() => setAppStep("details")} style={{ background: "none", border: "none", color: "#4a6a28", fontSize: 13, cursor: "pointer", padding: 0 }}>← Back</button>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: "#e8f0d0", letterSpacing: ".04em" }}>STEP 2 — PAYMENT</div>
                </div>

                {/* Summary */}
                <div style={{ background: "#080b06", border: "1px solid #1a2a0a", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, letterSpacing: ".2em", color: "#3a5010", marginBottom: 10 }}>// APPLICATION SUMMARY</div>
                  {[
                    ["Name",    form.name],
                    ["Email",   form.email],
                    ["Phone",   form.phone],
                    ["DOB",     form.dob],
                    ["Address", form.address],
                    ["Games at Swindon Airsoft", `${cu?.gamesAttended || 0} (verified)`],
                    ["Gov ID",  govIdFile?.name || "Uploaded"],
                    ["Photo",   faceFile?.name  || "Uploaded"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 13 }}>
                      <span style={{ color: "#4a6a28", minWidth: 180 }}>{k}</span>
                      <span style={{ color: "#c8d8a0" }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#0d1a08", border: "1px solid #2a4a10", borderRadius: 8, padding: "16px 18px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, color: "#e8f0d0", fontWeight: 700 }}>UKARA Registration — 1 year</div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 900, color: "#c8ff00" }}>£5.00</div>
                </div>

                {/* Subscription opt-in */}
                <div style={{ background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.12)", borderRadius: 6, padding: "12px 14px", marginBottom: 20 }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={useSubscription}
                      onChange={e => setUseSubscription(e.target.checked)}
                      style={{ marginTop: 2, accentColor: "#c8ff00", width: 15, height: 15, flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, color: "#c8d8a0", letterSpacing: ".06em" }}>
                        AUTO-RENEW — £5/YEAR
                      </div>
                      <div style={{ fontSize: 11, color: "#5a7a40", marginTop: 2, lineHeight: 1.5 }}>
                        We'll remind you before your UKARA expires each year. Cancel any time by contacting us — no commitment.
                      </div>
                    </div>
                  </label>
                </div>

                {submitting ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#8aaa50", fontSize: 14 }}>⏳ Submitting your application…</div>
                ) : (
                  <SquareCheckoutButton
                    amount={5}
                    description={`UKARA Registration${useSubscription ? " (Auto-renew opted in)" : ""} — Swindon Airsoft`}
                    onSuccess={handlePaymentSuccess}
                    disabled={submitting}
                  />
                )}
                <p style={{ fontSize: 12, color: "#3a5010", marginTop: 12, lineHeight: 1.6 }}>
                  Your £5 payment is taken now. Your UKARA ID will be issued once our team has reviewed and approved your application.
                </p>
              </div>
            ) : (
              /* ── Step 1: Details & Documents ── */
              <div style={{ background: "#0a0d07", border: "1px solid #1e2a10", borderRadius: 10, padding: isMobile ? "20px 16px" : "32px 36px", position: "relative" }}>
                {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                  <div key={v+h} style={{ position: "absolute", [v]: 0, [h]: 0, width: 22, height: 22, borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none", borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none" }} />
                ))}

                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, color: "#4a6a28", letterSpacing: ".08em", marginBottom: 20 }}>STEP 1 OF 2 — YOUR DETAILS & DOCUMENTS</div>

                {cu?.waiverData && (
                  <div style={{ background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.15)", borderLeft: "3px solid #c8ff00", borderRadius: 6, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#6a8a40", display: "flex", alignItems: "center", gap: 8 }}>
                    ✓ Details pre-filled from your signed waiver — check and amend if needed.
                  </div>
                )}

                {!cu && (
                  <div style={{ background: "rgba(200,255,0,.05)", border: "1px solid rgba(200,255,0,.2)", borderRadius: 8, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ color: "#c8d8a0", fontSize: 13 }}>⚠️ You must be logged in to apply.</span>
                    <button onClick={() => setAuthModal("login")} style={{ background: "#c8ff00", color: "#0a0e07", border: "none", padding: "7px 18px", borderRadius: 5, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>LOG IN / REGISTER</button>
                  </div>
                )}

                {cu && (cu.gamesAttended || 0) < 3 && (
                  <div style={{ background: "rgba(220,50,50,.08)", border: "1px solid #5a1a1a", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: "#ff8080", fontSize: 14, marginBottom: 4 }}>⚠️ Not enough games at Swindon Airsoft</div>
                    <p style={{ color: "#8a5050", fontSize: 13, margin: 0 }}>
                      You've attended <strong style={{ color: "#ff8080" }}>{cu.gamesAttended || 0}</strong> game{cu.gamesAttended !== 1 ? "s" : ""}. You need at least <strong style={{ color: "#ff8080" }}>3</strong> to apply. <button onClick={() => setPage("events")} style={{ background: "none", border: "none", color: "#ff8080", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13 }}>Book a game →</button>
                    </p>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18, marginBottom: 24 }}>
                  <div>
                    <label style={labelStyle}>Full Name *</label>
                    <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Your full legal name" onFocus={e => e.target.style.borderColor="#c8ff00"} onBlur={e => e.target.style.borderColor="#2a3a10"} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email Address *</label>
                    <input style={inputStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="your@email.com" onFocus={e => e.target.style.borderColor="#c8ff00"} onBlur={e => e.target.style.borderColor="#2a3a10"} />
                  </div>
                  <div>
                    <label style={labelStyle}>Contact Number *</label>
                    <input style={inputStyle} type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+44 7xxx xxxxxx" onFocus={e => e.target.style.borderColor="#c8ff00"} onBlur={e => e.target.style.borderColor="#2a3a10"} />
                  </div>
                  <div>
                    <label style={labelStyle}>Date of Birth * (Must be 18+)</label>
                    <input style={inputStyle} type="date" value={form.dob} onChange={e => set("dob", e.target.value)} onFocus={e => e.target.style.borderColor="#c8ff00"} onBlur={e => e.target.style.borderColor="#2a3a10"} />
                  </div>
                  <div style={{ gridColumn: isMobile ? undefined : "1 / -1" }}>
                    <label style={labelStyle}>Full Address & Postcode *</label>
                    <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} value={form.address} onChange={e => set("address", e.target.value)} placeholder="Full home address including postcode" onFocus={e => e.target.style.borderColor="#c8ff00"} onBlur={e => e.target.style.borderColor="#2a3a10"} />
                  </div>
                </div>

                {/* Games counter */}
                <div style={{ background: "#080b06", border: "1px solid #1a2a0a", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: ".2em", color: "#4a6a28", marginBottom: 4 }}>// GAMES AT SWINDON AIRSOFT</div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 900, color: (cu?.gamesAttended || 0) >= 3 ? "#c8ff00" : "#ff6060" }}>
                        {cu?.gamesAttended || 0} <span style={{ fontSize: 14, color: "#4a6a28", fontWeight: 400 }}>games attended</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#4a6a28", marginTop: 2 }}>Minimum 3 required · verified from your booking history</div>
                    </div>
                    <div style={{ background: (cu?.gamesAttended || 0) >= 3 ? "rgba(200,255,0,.1)" : "rgba(220,50,50,.1)", border: `1px solid ${(cu?.gamesAttended || 0) >= 3 ? "#2a4a10" : "#5a1a1a"}`, borderRadius: 6, padding: "6px 14px", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: (cu?.gamesAttended || 0) >= 3 ? "#c8ff00" : "#ff6060" }}>
                      {(cu?.gamesAttended || 0) >= 3 ? "✓ ELIGIBLE" : "✗ NOT ELIGIBLE"}
                    </div>
                  </div>
                </div>

                {/* Gov ID */}
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Government ID Photo * <span style={{ color: "#4a6a28", fontWeight: 400 }}>(passport, driving licence, or national ID)</span></label>
                  <div style={{ border: "2px dashed #2a3a10", borderRadius: 8, padding: "20px", textAlign: "center", background: "#060908", cursor: "pointer" }}
                    onClick={() => document.getElementById("gov-id-input").click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor="#c8ff00"; }}
                    onDragLeave={e => e.currentTarget.style.borderColor="#2a3a10"}
                    onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor="#2a3a10"; const f=e.dataTransfer.files[0]; if(f){setGovIdFile(f);const r=new FileReader();r.onload=ev=>setGovIdPreview(ev.target.result);r.readAsDataURL(f);} }}
                  >
                    <input id="gov-id-input" type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={pickFile(setGovIdFile, setGovIdPreview)} />
                    {govIdPreview ? (
                      <div><img src={govIdPreview} alt="Gov ID" style={{ maxHeight: 140, maxWidth: "100%", borderRadius: 4, border: "1px solid #2a3a10" }} /><div style={{ fontSize: 12, color: "#c8ff00", marginTop: 8 }}>✓ {govIdFile?.name}</div></div>
                    ) : (
                      <div><div style={{ fontSize: 28, marginBottom: 8, opacity: .4 }}>🪪</div><div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: "#4a6a28", letterSpacing: ".06em" }}>Click or drag to upload Government ID</div><div style={{ fontSize: 11, color: "#3a4a20", marginTop: 4 }}>JPG, PNG or PDF · stored securely, admin-only</div></div>
                    )}
                  </div>
                </div>

                {/* Face photo */}
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Full Face Photo * <span style={{ color: "#4a6a28", fontWeight: 400 }}>(clear, recent, full face visible)</span></label>
                  <div style={{ border: "2px dashed #2a3a10", borderRadius: 8, padding: "20px", textAlign: "center", background: "#060908", cursor: "pointer" }}
                    onClick={() => document.getElementById("face-photo-input").click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor="#c8ff00"; }}
                    onDragLeave={e => e.currentTarget.style.borderColor="#2a3a10"}
                    onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor="#2a3a10"; const f=e.dataTransfer.files[0]; if(f){setFaceFile(f);const r=new FileReader();r.onload=ev=>setFacePreview(ev.target.result);r.readAsDataURL(f);} }}
                  >
                    <input id="face-photo-input" type="file" accept="image/*" style={{ display:"none" }} onChange={pickFile(setFaceFile, setFacePreview)} />
                    {facePreview ? (
                      <div><img src={facePreview} alt="Face photo" style={{ maxHeight: 140, maxWidth: "100%", borderRadius: 4, border: "1px solid #2a3a10" }} /><div style={{ fontSize: 12, color: "#c8ff00", marginTop: 8 }}>✓ {faceFile?.name}</div></div>
                    ) : (
                      <div><div style={{ fontSize: 28, marginBottom: 8, opacity: .4 }}>🤳</div><div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, color: "#4a6a28", letterSpacing: ".06em" }}>Click or drag to upload face photo</div><div style={{ fontSize: 11, color: "#3a4a20", marginTop: 4 }}>JPG or PNG · well-lit, full face visible</div></div>
                    )}
                  </div>
                </div>

                {/* Declaration */}
                <div style={{ marginBottom: 24, background: "#080b06", border: "1px solid #1a2a0a", borderRadius: 8, padding: "18px 20px" }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, color: "#c8d8a0", marginBottom: 10, letterSpacing: ".06em" }}>DECLARATION</div>
                  <p style={{ color: "#6a8a45", fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>
                    By proceeding I confirm that: (1) I am 18 years or older; (2) I have attended at least 3 airsoft game days at Swindon Airsoft within the past year; (3) the information and documents I have provided are truthful and accurate; (4) I understand that providing false information may constitute a criminal offence under the Violent Crime Reduction Act 2006.
                  </p>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.declaration} onChange={e => set("declaration", e.target.checked)} style={{ marginTop: 2, accentColor: "#c8ff00", width: 16, height: 16, flexShrink: 0 }} />
                    <span style={{ color: "#c8d8a0", fontSize: 13, lineHeight: 1.5 }}>I confirm the above declaration and consent to Swindon Airsoft submitting my details for UKARA registration. *</span>
                  </label>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={handleProceedToPayment}
                    disabled={!cu || (cu?.gamesAttended || 0) < 3}
                    style={{ background: (!cu || (cu?.gamesAttended || 0) < 3) ? "#1a2a0a" : "#c8ff00", color: (!cu || (cu?.gamesAttended || 0) < 3) ? "#3a5020" : "#0a0e07", border: "none", padding: "12px 32px", borderRadius: 6, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: ".1em", cursor: (!cu || (cu?.gamesAttended || 0) < 3) ? "not-allowed" : "pointer", textTransform: "uppercase" }}
                  >
                    CONTINUE TO PAYMENT — £5 →
                  </button>
                  <span style={{ color: "#4a6a28", fontSize: 12 }}>Annual fee — includes UKARA ID issuance</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAQ */}
        <div style={{ marginTop: 48 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: "#e8f0d0", marginBottom: 16, letterSpacing: ".04em" }}>Frequently Asked Questions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faqs.map((f, i) => (
              <div key={i} style={{ background: "#0a0d07", border: "1px solid #1a2a0a", borderRadius: 8, padding: "16px 20px" }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, color: "#c8d8a0", marginBottom: 6 }}>{f.q}</div>
                <p style={{ color: "#5a7a40", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #1a2a0a", textAlign: "center" }}>
          <p style={{ color: "#4a6a28", fontSize: 12, lineHeight: 1.7 }}>
            Questions? <button onClick={() => setPage("contact")} style={{ background: "none", border: "none", color: "#c8d8a0", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Contact us</button> or visit <a href="https://www.ukara.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: "#c8d8a0", fontSize: 12 }}>ukara.org.uk</a>
          </p>
        </div>
      </div>
    </div>
  );
}

