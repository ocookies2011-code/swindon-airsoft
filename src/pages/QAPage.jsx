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

function renderInline(text) {
  const INLINE_RE = new RegExp("(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|`[^`]+`)", "g");
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

export default function QAPage({ data }) {
  const [open, setOpen] = useState(null);
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
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — FIELD BRIEFING — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            INTEL <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>BRIEFING</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ PRE-MISSION INTELLIGENCE — READ BEFORE DEPLOYMENT ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 16px 80px" }}>
        {data.qa.length === 0 && (
          <div style={{ textAlign: "center", padding: 80, fontFamily: "'Share Tech Mono',monospace", color: "#2a3a10", fontSize: 11, letterSpacing: ".2em" }}>NO INTELLIGENCE ON FILE — CHECK BACK SOON</div>
        )}
        {data.qa.map((item, i) => (
          <div key={item.id} style={{ marginBottom: 3, background: "#0c1009", border: `1px solid ${open === item.id ? "#2a3a10" : "#1a2808"}`, overflow: "hidden", transition: "border-color .15s" }}>
            <div style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
              onClick={() => setOpen(open === item.id ? null : item.id)}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 3 }}>Q{String(i+1).padStart(2,"0")}</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: ".06em", color: "#b0c090", lineHeight: 1.3 }}>{item.q}</div>
              </div>
              <div style={{ color: "#c8ff00", fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 2, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900 }}>
                {open === item.id ? "−" : "+"}
              </div>
            </div>
            {open === item.id && (
              <div style={{ padding: "0 18px 18px 18px", borderTop: "1px solid #1a2808" }}>
                <div style={{ paddingTop: 14, fontSize: 13, color: "#3a5028", lineHeight: 1.7, fontFamily: "'Share Tech Mono',monospace" }}>
                  {renderQAAnswer(item.a)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

