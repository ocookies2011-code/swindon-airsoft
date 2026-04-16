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

export default function VipPage({ data, cu, updateUser, showToast, setAuthModal, setPage }) {
  const isMobile = useMobile(640);
  const [applying, setApplying] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [vipPayError, setVipPayError] = useState(null);

  // ID upload state — up to 2 images, required before payment
  const [idImages, setIdImages] = useState([]); // [{ file, preview, url, uploading, error }]
  const [idStep, setIdStep] = useState(false); // true = show ID upload panel
  const [idUploading, setIdUploading] = useState(false);

  const myBookings = cu ? data.events.flatMap(ev =>
    ev.bookings.filter(b => b.userId === cu.id && b.checkedIn).map(b => b)
  ) : [];
  const gamesAttended = cu ? Math.max(cu.gamesAttended || 0, myBookings.length) : 0;
  const gamesNeeded = Math.max(0, 3 - gamesAttended);
  const canApply = cu && gamesAttended >= 3 && (cu.vipStatus === "none" || cu.vipStatus === "expired") && !cu.vipApplied;
  const isVip = cu?.vipStatus === "active";
  const isExpired = cu?.vipStatus === "expired";
  const hasPending = cu?.vipApplied && !isVip;

  // Handle photo ID file selection (up to 2)
  const handleIdFileSelect = (e, slot) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please select an image file.", "red"); return; }
    if (file.size > 10 * 1024 * 1024) { showToast("File too large — max 10MB.", "red"); return; }
    const preview = URL.createObjectURL(file);
    setIdImages(prev => {
      const next = [...prev];
      next[slot] = { file, preview, url: null, uploading: false, error: null };
      return next;
    });
  };

  const removeIdImage = (slot) => {
    setIdImages(prev => {
      const next = [...prev];
      next[slot] = undefined;
      return next.filter((_, i) => i === 0 || i === 1); // keep slots 0,1
    });
  };

  // Upload all selected ID images to Supabase and save URLs to profile
  const uploadAndProceed = async () => {
    const toUpload = idImages.filter(Boolean);
    if (toUpload.length === 0) { showToast("Please add at least one photo ID.", "red"); return; }
    setIdUploading(true);
    try {
      const urls = [];
      for (let i = 0; i < toUpload.length; i++) {
        const item = toUpload[i];
        const url = await api.profiles.uploadVipId(cu.id, item.file, i);
        urls.push(url);
      }
      await api.profiles.saveVipIdImages(cu.id, urls);
      setIdStep(false);
      setShowPayment(true);
      setVipPayError(null);
    } catch (e) {
      showToast("Upload failed: " + (e.message || String(e)), "red");
    } finally { setIdUploading(false); }
  };

  const handleVipPaymentSuccess = async (squarePayment) => {
    setApplying(true);
    setVipPayError(null);
    try {
      await updateUser(cu.id, { vipApplied: true });
      setShowPayment(false);
      showToast("🎉 Payment received! VIP application submitted — admin will activate your status shortly.");
    } catch (e) {
      const errMsg = "Payment succeeded but VIP application failed — please contact us. Ref: " + squarePayment.id;
      setVipPayError(errMsg);
      supabase.from('failed_payments').insert({
        customer_name:     cu?.name || "Unknown",
        customer_email:    cu?.email || "",
        user_id:           cu?.id || null,
        items:             [{ name: "VIP Membership", price: 0, qty: 1 }],
        total:             0,
        payment_method:    "square_vip",
        error_message:     errMsg,
        square_payment_id: squarePayment?.id || null,
        recorded_by:       null,
      }).then(({ error }) => { if (error) console.warn("Failed to log payment error:", error.message); });
    } finally {
      setApplying(false);
    }
  };

  const benefits = [
    "10% discount on all game day bookings",
    "10% discount at Airsoft Armoury UK (airsoftarmoury.uk)",
    "Free game day on your birthday 🎂",
    "Access to exclusive VIP-only events",
    "Private game day bookings",
    "UKARA registration support",
    "Priority booking for special events",
    "VIP badge on player profile",
    "Valid for calendar year",
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8a000" : "none", borderBottom: v==="bottom" ? "2px solid #c8a000" : "none",
            borderLeft: h==="left" ? "2px solid #c8a000" : "none", borderRight: h==="right" ? "2px solid #c8a000" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — ELITE CLEARANCE — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            ELITE <span style={{ color: "#c8a000", textShadow: "0 0 30px rgba(200,160,0,.35)" }}>OPERATIVE</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ UNLOCK EXCLUSIVE CLEARANCE — JOIN OUR ELITE SQUAD ◂</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22, justifyContent: "center" }}>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to right,transparent,#3a2a00)" }} />
            <div style={{ color: "#c8a000", fontSize: 18, opacity: .6 }}>★</div>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to left,transparent,#3a2a00)" }} />
          </div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth:960 }}>

        {/* Status banner for logged-in users */}
        {isVip && (() => {
          const vipExpiry = cu?.vipExpiresAt ? new Date(cu.vipExpiresAt) : null;
          const expiryStr = vipExpiry
            ? vipExpiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
            : `December ${new Date().getFullYear()}`;
          return (
            <div className="alert alert-green mb-2" style={{ display:"flex", alignItems:"center", gap:10, fontSize:14 }}>
              ⭐ You are an active VIP member! Your membership is valid through {expiryStr}.
            </div>
          );
        })()}
        {hasPending && (
          <div className="alert alert-blue mb-2" style={{ fontSize:14 }}>
            ⏳ Your VIP application is pending admin review. We'll notify you once it's approved.
          </div>
        )}

        <div className="grid-2" style={{ gap:24, marginBottom:32 }}>

          {/* Benefits */}
          <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px", position:"relative" }}>
            <div style={{ position:"absolute", top:0, left:0, width:16, height:16, borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)" }} />
            <div style={{ position:"absolute", bottom:0, right:0, width:16, height:16, borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)" }} />
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:20, color:"var(--accent)", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>VIP BENEFITS</div>
            {benefits.map((b, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #1a1a1a" }}>
                <div style={{ width:20, height:20, background:"rgba(200,255,0,.15)", border:"1px solid var(--accent)", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ color:"var(--accent)", fontSize:11, fontWeight:900 }}>✓</span>
                </div>
                <span style={{ fontSize:13, color:"#ccc" }}>{b}</span>
              </div>
            ))}
          </div>

          {/* Apply box */}
          <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px" }}>
            {/* Price */}
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:64, color:"var(--accent)", lineHeight:1 }}>£40</div>
              <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>per year</div>
            </div>

            {/* Requirements */}
            <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", padding:"16px", marginBottom:20 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".15em", textTransform:"uppercase", color:"var(--muted)", marginBottom:12 }}>REQUIREMENTS</div>
              {[
                { label:"Registered account", met: !!cu },
                { label:`3 game days completed (${gamesAttended}/3)`, met: gamesAttended >= 3 },
              ].map(({ label, met }) => (
                <div key={label} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0" }}>
                  <span style={{ color: met ? "var(--accent)" : "var(--red)", fontSize:16, lineHeight:1 }}>{met ? "✓" : "✗"}</span>
                  <span style={{ fontSize:13, color: met ? "#ccc" : "var(--muted)" }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Progress bar if not yet eligible */}
            {cu && !isVip && gamesNeeded > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--muted)", marginBottom:6 }}>
                  <span>GAME DAY PROGRESS</span>
                  <span>{gamesAttended} / 3</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: Math.min(100, gamesAttended / 3 * 100) + "%" }} />
                </div>
                <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>{gamesNeeded} more game day{gamesNeeded !== 1 ? "s" : ""} needed to apply</div>
              </div>
            )}

            {/* CTA */}
            {!cu && (
              <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14 }}
                onClick={() => setAuthModal("login")}>LOGIN TO CONTINUE</button>
            )}
            {cu && isVip && (
              <div className="alert alert-green" style={{ textAlign:"center" }}>⭐ You are already a VIP member!</div>
            )}
            {cu && hasPending && (
              <div className="alert alert-blue" style={{ textAlign:"center" }}>⏳ Payment received — application under review. Admin will activate your status shortly.</div>
            )}

            {/* Step 1 — trigger: APPLY button */}
            {cu && canApply && !idStep && !showPayment && (
              <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14 }}
                onClick={() => { setIdStep(true); setVipPayError(null); setIdImages([]); }}>
                {isExpired ? "RENEW VIP — £40/YEAR" : "APPLY & PAY — £40/YEAR"}
              </button>
            )}

            {/* Step 2 — ID upload */}
            {cu && canApply && idStep && !showPayment && (
              <div>
                <div style={{ background:"#0d1a0d", border:"1px solid #1e3a1e", padding:"12px 14px", marginBottom:14, fontSize:12, color:"#8aaa60", lineHeight:1.7 }}>
                  🪪 <strong style={{ color:"#fff" }}>Government-issued photo ID required</strong><br />
                  Please upload a clear photo of your ID (passport, driving licence, or national ID card).<br />
                  You may upload up to 2 images — e.g. front and back. This is stored securely and reviewed by admin only.
                </div>

                {/* Image slot grid */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:10, marginBottom:14 }}>
                  {[0, 1].map(slot => {
                    const img = idImages[slot];
                    return (
                      <div key={slot} style={{ border:`2px dashed ${img ? "#2a3a10" : "#1a1a1a"}`, background:"#0a0a0a", borderRadius:3, overflow:"hidden", position:"relative", aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:6 }}>
                        {img ? (
                          <>
                            <img src={img.preview} alt={`ID ${slot+1}`} style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} />
                            <button onClick={() => removeIdImage(slot)}
                              style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,.75)", border:"none", color:"#fff", borderRadius:2, cursor:"pointer", fontSize:12, padding:"2px 7px", zIndex:2 }}>✕</button>
                            <div style={{ position:"absolute", bottom:4, left:4, background:"rgba(0,0,0,.7)", color:"#c8ff00", fontSize:9, fontFamily:"'Share Tech Mono',monospace", padding:"2px 6px", letterSpacing:".1em" }}>ID {slot+1}</div>
                          </>
                        ) : (
                          <>
                            <label style={{ cursor:"pointer", textAlign:"center", width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4 }}>
                              <span style={{ fontSize:22, opacity:.3 }}>🪪</span>
                              <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".08em" }}>{slot === 0 ? "FRONT / MAIN" : "BACK / OPTIONAL"}</span>
                              <span style={{ fontSize:9, color:"#2a3a10", marginTop:2 }}>tap to add photo</span>
                              <input type="file" accept="image/*" style={{ display:"none" }} onChange={e => handleIdFileSelect(e, slot)} />
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize:10, color:"var(--muted)", marginBottom:12, textAlign:"center", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".06em" }}>
                  ACCEPTED: PASSPORT · DRIVING LICENCE · NATIONAL ID CARD
                </div>

                <button className="btn btn-primary" style={{ width:"100%", padding:"13px", fontSize:13, letterSpacing:".1em", opacity: (idUploading || !idImages.filter(Boolean).length) ? .5 : 1 }}
                  disabled={idUploading || !idImages.filter(Boolean).length}
                  onClick={uploadAndProceed}>
                  {idUploading ? "⏳ Uploading ID…" : "CONTINUE TO PAYMENT →"}
                </button>
                <button className="btn btn-ghost" style={{ width:"100%", marginTop:8, fontSize:12 }}
                  disabled={idUploading} onClick={() => setIdStep(false)}>← Back</button>
              </div>
            )}

            {/* Step 3 — payment */}
            {cu && canApply && showPayment && (
              <div>
                <div style={{ background:"#0d1a0d", border:"1px solid #1e3a1e", padding:"10px 14px", marginBottom:12, fontSize:12, color:"#8aaa60" }}>
                  💳 {isExpired ? "Pay now to renew your VIP membership for another year." : "Pay now to submit your VIP application. Your status will be activated by admin after payment is confirmed."}
                </div>
                <div style={{ background:"rgba(200,255,0,.04)", border:"1px solid #1a2808", padding:"8px 12px", marginBottom:12, fontSize:11, color:"var(--accent)", display:"flex", alignItems:"center", gap:8 }}>
                  <span>✓</span> <span>Photo ID uploaded successfully</span>
                </div>
                {vipPayError && (
                  <div className="alert alert-red" style={{ marginBottom:10 }}>{vipPayError}</div>
                )}
                <SquareCheckoutButton
                  amount={30}
                  description={`Swindon Airsoft — VIP Membership (Annual${isExpired ? " Renewal" : ""})`}
                  disabled={applying}
                  onSuccess={handleVipPaymentSuccess}
                />
                <button className="btn btn-ghost" style={{ width:"100%", marginTop:10, fontSize:12 }}
                  onClick={() => { setShowPayment(false); setIdStep(true); }}>← Change ID photos</button>
              </div>
            )}

            {cu && !isVip && !hasPending && !canApply && (
              <div>
                <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14, opacity:.5, cursor:"not-allowed" }} disabled>
                  APPLY &amp; PAY — £40/YEAR
                </button>
                <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", marginTop:8 }}>
                  Complete {gamesNeeded} more game day{gamesNeeded !== 1 ? "s" : ""} to unlock
                </div>
              </div>
            )}

            <div style={{ marginTop:16, fontSize:11, color:"var(--muted)", lineHeight:1.6, textAlign:"center" }}>
              Pay the £40 annual fee now. Admin will review your ID and activate your VIP status — usually within 24 hours.
            </div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px", marginBottom:32 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"#fff", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>HOW IT WORKS</div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:16 }}>
            {[
              { num:"01", title:"PLAY 3 GAMES", desc:"Attend 3 game days to meet the eligibility requirement. Check-ins are tracked automatically." },
              { num:"02", title:"UPLOAD ID", desc:"Upload a clear photo of your government-issued ID (passport, driving licence, or national ID card). Up to 2 images accepted." },
              { num:"03", title:"PAY & APPLY", desc:"Pay the £40 annual fee. Your application and ID are submitted instantly for admin review." },
              { num:"04", title:"ADMIN ACTIVATES", desc:"Admin reviews your ID and activates your VIP status — usually within 24 hours of payment." },
            ].map(step => (
              <div key={step.num} style={{ padding:16, background:"#0d0d0d", border:"1px solid #1a1a1a" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:36, color:"var(--accent)", opacity:.4, lineHeight:1, marginBottom:8 }}>{step.num}</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"#fff", letterSpacing:".06em", textTransform:"uppercase", marginBottom:6 }}>{step.title}</div>
                <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign:"center" }}>
          <button className="btn btn-ghost" onClick={() => setPage("events")}>← Browse Events</button>
        </div>
      </div>
    </div>
  );
}

// Renders a Q&A answer — splits on newlines and renders each line,
// converting **bold** and *italic* inline markdown.
function renderInline(text) {
  const INLINE_RE = new RegExp("(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)", "g");
  const parts = text.split(INLINE_RE);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color:"#fff", fontWeight:700 }}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("*")  && p.endsWith("*"))  return <em key={i} style={{ color:"var(--accent)", fontStyle:"italic" }}>{p.slice(1,-1)}</em>;
    if (p.startsWith("`")  && p.endsWith("`"))  return <code key={i} style={{ background:"#1a1a1a", padding:"1px 5px", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--accent)" }}>{p.slice(1,-1)}</code>;
    return p;
  });
}

function renderQAAnswer(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) return <h4 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:"#fff", margin:"10px 0 4px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(4)}</h4>;
    if (line.startsWith("## "))  return <h3 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)", margin:"12px 0 6px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(3)}</h3>;
    if (line.startsWith("# "))   return <h2 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"var(--accent)", margin:"14px 0 8px" }}>{line.slice(2)}</h2>;
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) return <img key={i} src={imgMatch[2]} alt={imgMatch[1]} style={{ maxWidth:"100%", margin:"8px 0", borderRadius:2 }} />;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", fontSize:13, color:"var(--muted)" }}><span style={{ color:"var(--accent)", flexShrink:0 }}>▸</span>{renderInline(line.slice(2))}</div>;
    }
    if (line.trim() === "") return <div key={i} style={{ height:8 }} />;
    return <p key={i} style={{ fontSize:13, color:"var(--muted)", lineHeight:1.8, margin:"2px 0" }}>{renderInline(line)}</p>;
  });
}
