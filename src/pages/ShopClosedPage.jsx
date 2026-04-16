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

export default function ShopClosedPage({ setPage }) {
  const categories = [
    { icon: "🔫", label: "Airsoft Guns", desc: "AEGs, GBBs, snipers and pistols from top brands" },
    { icon: "🎯", label: "BBs & Ammo", desc: "0.20g to 0.45g biodegradable and standard BBs" },
    { icon: "🦺", label: "Tactical Gear", desc: "Vests, plate carriers, helmets and load-bearing equipment" },
    { icon: "👓", label: "Eye Protection", desc: "ANSI-rated goggles and full-face masks" },
    { icon: "🔋", label: "Batteries & Chargers", desc: "LiPo, NiMH batteries and smart chargers" },
    { icon: "🔧", label: "Parts & Upgrades", desc: "Hop-up rubbers, barrels, gearbox parts and more" },
    { icon: "👕", label: "Clothing & Apparel", desc: "Camo uniforms, boots, gloves and base layers" },
    { icon: "🎒", label: "Bags & Cases", desc: "Gun bags, hard cases and tactical backpacks" },
  ];

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#0d1400 0%,#111 60%,#0a1000 100%)",
        border: "1px solid #2a3a10",
        borderRadius: 8,
        padding: "32px 28px",
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:16, height:16,
            top:v==="top"?8:"auto", bottom:v==="bottom"?8:"auto",
            left:h==="left"?8:"auto", right:h==="right"?8:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:9, letterSpacing:".25em", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, marginBottom:10 }}>⬡ SWINDON AIRSOFT · ONLINE SHOP</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:"#e8ffb0", letterSpacing:".04em", marginBottom:8 }}>SHOP TEMPORARILY CLOSED</div>
          <div style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, maxWidth:600 }}>
            Our on-site shop is currently closed. You can order everything you need from our full retail store — with the option to collect your order at one of our game days.
          </div>
        </div>
      </div>

      {/* Retail store card */}
      <div style={{
        background: "linear-gradient(135deg,rgba(200,255,0,.06) 0%,rgba(0,0,0,0) 60%),#0b1007",
        border: "2px solid #c8ff00",
        borderRadius: 8,
        padding: "28px 28px",
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position:"absolute", top:0, right:0, width:120, height:120, background:"radial-gradient(circle,rgba(200,255,0,.08) 0%,transparent 70%)", pointerEvents:"none" }} />
        <div style={{ display:"flex", alignItems:"flex-start", gap:20, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", color:"#c8ff00", marginBottom:8, textTransform:"uppercase" }}>🛒 Our Retail Store</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#fff", marginBottom:8 }}>Airsoft Armoury UK</div>
            <div style={{ fontSize:13, color:"#a0cc60", lineHeight:1.7, marginBottom:16 }}>
              The UK's premier airsoft retailer — thousands of products in stock with fast dispatch. Use code <strong style={{ color:"#c8ff00", background:"rgba(200,255,0,.1)", padding:"1px 8px", borderRadius:3, fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>COLLECTION</strong> at checkout to collect your order at one of our Swindon Airsoft game days instead of paying for postage.
            </div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <a href="https://airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
                style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#c8ff00", color:"#0a0f06", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".12em", padding:"11px 22px", borderRadius:3, textDecoration:"none", textTransform:"uppercase" }}>
                🌐 VISIT STORE
              </a>
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Share Tech Mono',monospace", fontSize:13, letterSpacing:".15em", padding:"11px 18px", borderRadius:3 }}>
                CODE: COLLECTION
              </div>
            </div>
          </div>
          {/* Collection info box */}
          <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid #2a3a10", borderRadius:6, padding:"16px 18px", minWidth:0, flexShrink:0, width:"100%" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".2em", color:"#c8ff00", marginBottom:10, textTransform:"uppercase" }}>📦 Game Day Collection</div>
            {[
              ["1", "Order from airsoftarmoury.uk"],
              ["2", 'Enter code COLLECTION at checkout'],
              ["3", "Select your game day date"],
              ["4", "Collect at the field — no postage!"],
            ].map(([n, t]) => (
              <div key={n} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ background:"rgba(200,255,0,.15)", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{n}</div>
                <div style={{ fontSize:12, color:"#a0cc60", lineHeight:1.5 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What they sell */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:".2em", color:"var(--muted)", textTransform:"uppercase", marginBottom:14 }}>◈ WHAT'S AVAILABLE AT AIRSOFT ARMOURY UK</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
          {categories.map(({ icon, label, desc }) => (
            <div key={label} style={{ background:"#0b1007", border:"1px solid #2a3a10", borderRadius:6, padding:"14px 16px" }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:"#c8e878", letterSpacing:".06em", marginBottom:4 }}>{label}</div>
              <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign:"center", padding:"24px 0 8px" }}>
        <a href="https://airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
          style={{ display:"inline-flex", alignItems:"center", gap:10, background:"rgba(200,255,0,.08)", border:"1px solid #c8ff00", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, letterSpacing:".15em", padding:"14px 32px", borderRadius:3, textDecoration:"none", textTransform:"uppercase" }}>
          🛒 SHOP AT AIRSOFTARMOURY.UK →
        </a>
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:10, fontFamily:"'Share Tech Mono',monospace" }}>
          Use code <strong style={{ color:"#c8ff00" }}>COLLECTION</strong> for game day pickup · Free on qualifying orders
        </div>
      </div>
    </div>
  );
}
