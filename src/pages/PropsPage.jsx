// pages/PropsPage.jsx — Intel Arms props showcase
import React, { useState } from "react";

const MIL  = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };
const ACCENT = "#c8ff00";
const BG     = "#080b06";
const BG2    = "#0d1209";
const BG3    = "#111a0a";
const BORDER = "#1e2e12";
const BORDER2= "#2a4018";
const MUTED  = "#5a6e42";

// High-res images from Intel Arms
const NEXUS_IMAGES = [
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/chatgptimage21.2026.14_07_051-HgA9HYyExVZIQfCu.jpg",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/whatsapp-image-2026-02-21-at-11.22.11-Drbqe2kaSHIWvdVz.jpeg",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/whatsapp-image-2026-02-21-at-11.22.12222-GKS73sEaMUzzPyji.jpeg",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/whatsapp-image-2026-02-21-at-11.22.11iiiii-EIqSpSoxsb5oFt2K.jpeg",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/whatsapp-image-2026-02-21-at-11.22.12-BvmdlNd87AIb4c4e.jpeg",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/1000009898-l5EOAWTrwAUsmg0Q.png",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/33-z9vYmDIkhqh1JgPa.png",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/1000009899-tjUBdqXcbQFM3D7k.png",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/chatgpt-image-feb-23-2026-05_17_26-pm-bL9P0a8UwMMzDoMK.png",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/chatgpt-image-feb-23-2026-05_36_07-pm-r1Sn5iPz3AWGWzux.png",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/1000009920-bAqCa6oKjxCfe0nh.png",
];

const CLAYMORE_IMAGES = [
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/chatgpt-image-feb-22-2026-08_23_47-pm-dPcLJHCWuLLzBv1m.png",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/chatgpt-image-feb-22-2026-08_37_54-pm-js9uD00UwZetXtL0.png",
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1024,fit=crop/Aq20rPONrKFWnPO2/chatgpt-image-feb-22-2026-08_53_24-pm-oSoMLCuk8fgTCDPD.png",
];

function ImageGallery({ images, productName }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  return (
    <div>
      {/* Main image */}
      <div
        onClick={() => setLightbox(active)}
        style={{ width:"100%", aspectRatio:"16/9", background:BG3, border:`1px solid ${BORDER2}`, overflow:"hidden", cursor:"zoom-in", marginBottom:8, position:"relative" }}
      >
        <img
          src={images[active]}
          alt={`${productName} ${active + 1}`}
          style={{ width:"100%", height:"100%", objectFit:"contain" }}
          onError={e => e.target.style.display="none"}
        />
        <div style={{ position:"absolute", bottom:8, right:10, ...MONO, fontSize:9, color:MUTED, letterSpacing:".1em" }}>
          {active + 1} / {images.length} · click to enlarge
        </div>
      </div>
      {/* Thumbnails */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {images.map((img, i) => (
          <div
            key={i}
            onClick={() => setActive(i)}
            style={{ width:64, height:44, background:BG3, border:`1px solid ${i === active ? ACCENT : BORDER}`, overflow:"hidden", cursor:"pointer", flexShrink:0, opacity: i === active ? 1 : 0.55, transition:"all .15s" }}
          >
            <img src={img} alt={i} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e => e.target.style.display="none"} />
          </div>
        ))}
      </div>
      {/* Lightbox */}
      {lightbox !== null && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,.92)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
        >
          <img
            src={images[lightbox]}
            alt="enlarged"
            style={{ maxWidth:"100%", maxHeight:"90vh", objectFit:"contain" }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ position:"absolute", bottom:20, left:"50%", transform:"translateX(-50%)", display:"flex", gap:12 }}>
            <button onClick={e => { e.stopPropagation(); setLightbox(l => Math.max(0, l - 1)); }}
              style={{ background:BG2, border:`1px solid ${BORDER2}`, color:"#fff", width:36, height:36, cursor:"pointer", ...MIL, fontSize:16 }}>◂</button>
            <span style={{ ...MONO, fontSize:10, color:MUTED, lineHeight:"36px" }}>{lightbox + 1} / {images.length}</span>
            <button onClick={e => { e.stopPropagation(); setLightbox(l => Math.min(images.length - 1, l + 1)); }}
              style={{ background:BG2, border:`1px solid ${BORDER2}`, color:"#fff", width:36, height:36, cursor:"pointer", ...MIL, fontSize:16 }}>▸</button>
          </div>
          <button onClick={() => setLightbox(null)}
            style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"#fff", fontSize:24, cursor:"pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

function FeatureCard({ icon, title, text }) {
  return (
    <div style={{ background:BG3, border:`1px solid ${BORDER}`, padding:"16px 18px", position:"relative" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${ACCENT},transparent)` }}/>
      <div style={{ fontSize:24, marginBottom:8 }}>{icon}</div>
      <div style={{ ...MIL, fontWeight:700, fontSize:13, letterSpacing:".1em", color:ACCENT, textTransform:"uppercase", marginBottom:4 }}>{title}</div>
      <div style={{ fontSize:12, color:MUTED, lineHeight:1.6 }}>{text}</div>
    </div>
  );
}

export function PropsPage() {
  const [activeTab, setActiveTab] = useState("nexus");

  const Tab = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{ ...MIL, fontWeight:700, fontSize:13, letterSpacing:".12em", textTransform:"uppercase", padding:"10px 20px", cursor:"pointer", border:"none", background: activeTab === id ? "rgba(200,255,0,.08)" : "transparent", color: activeTab === id ? ACCENT : MUTED, borderBottom:`2px solid ${activeTab === id ? ACCENT : "transparent"}`, transition:"all .15s" }}
    >{label}</button>
  );

  return (
    <div style={{ background:BG, minHeight:"100vh" }}>

      {/* ── HERO ── */}
      <div style={{ background:`linear-gradient(180deg,#0c1a05,${BG})`, borderBottom:`2px solid ${BORDER2}`, padding:"52px 24px 44px", textAlign:"center" }}>
        <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".25em", marginBottom:10 }}>◈ OFFICIAL PARTNER ◈</div>
        <div style={{ ...MIL, fontWeight:900, fontSize:"clamp(36px,8vw,72px)", textTransform:"uppercase", letterSpacing:".05em", color:"#fff", lineHeight:.9, marginBottom:10 }}>
          INTEL <span style={{ color:ACCENT }}>ARMS</span>
        </div>
        <div style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".2em", marginBottom:20 }}>◆ PREMIUM AIRSOFT PROPS & GAMING ELECTRONICS ◆</div>
        <div style={{ maxWidth:600, margin:"0 auto 28px", fontSize:14, color:"#7a9a60", lineHeight:1.7 }}>
          Swindon Airsoft is proud to run Intel Arms props on our field — bringing you next-level immersive gameplay with military-grade gaming electronics engineered for the field.
        </div>
        <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
          <a href="https://intelarms.shop" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration:"none" }}>
            🛒 Visit Intel Arms Shop
          </a>
          <a href="mailto:potateking@gmail.com" className="btn btn-ghost" style={{ textDecoration:"none" }}>
            ✉ Contact Intel Arms
          </a>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"36px 20px 80px" }}>

        {/* ── PRODUCT TABS ── */}
        <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${BORDER}`, marginBottom:32 }}>
          <Tab id="nexus"    label="⚡ Nexus System" />
          <Tab id="claymore" label="💣 Claymore Module" />
          <Tab id="contact"  label="📬 Contact" />
        </div>

        {/* ── NEXUS TAB ── */}
        {activeTab === "nexus" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,500px),1fr))", gap:32, marginBottom:40 }}>
              <div>
                <ImageGallery images={NEXUS_IMAGES} productName="Nexus" />
              </div>
              <div>
                <div style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".2em", marginBottom:8 }}>◈ INTEL ARMS FLAGSHIP PRODUCT</div>
                <div style={{ ...MIL, fontWeight:900, fontSize:"clamp(28px,5vw,48px)", textTransform:"uppercase", color:"#fff", lineHeight:.95, marginBottom:4 }}>
                  NEXUS <span style={{ color:ACCENT }}>SYSTEM</span>
                </div>
                <div style={{ ...MIL, fontSize:14, color:MUTED, letterSpacing:".08em", marginBottom:20 }}>E.D.S — Electronic Domination System</div>

                <div style={{ background:BG2, border:`1px solid ${BORDER2}`, padding:"16px 20px", marginBottom:20 }}>
                  <div style={{ ...MIL, fontSize:28, fontWeight:700, color:ACCENT, marginBottom:2 }}>€400</div>
                  <div style={{ fontSize:12, color:MUTED }}>Nexus Starter Kit · 3 Modules + Control Terminal</div>
                </div>

                <div style={{ fontSize:13, color:"#8aaa60", lineHeight:1.8, marginBottom:20 }}>
                  Nexus is a fully wireless gaming platform designed for both indoor arenas and open outdoor fields. Built on a modular architecture, it supports up to <strong style={{ color:"#fff" }}>20 autonomous units</strong> within a single network — creating immersive, large-scale tactical scenarios.
                </div>

                <div style={{ marginBottom:24 }}>
                  {[
                    "3 wireless game modules included",
                    "Control terminal for game management",
                    "2× Hacker, Engineer, and Administrator USB keys",
                    "Impact & dust resistant field housing",
                    "Fully wireless — indoor & outdoor",
                    "Ready to operate out of the box",
                  ].map((f, i) => (
                    <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:6 }}>
                      <span style={{ color:ACCENT, fontSize:12, marginTop:2, flexShrink:0 }}>✓</span>
                      <span style={{ fontSize:13, color:MUTED }}>{f}</span>
                    </div>
                  ))}
                </div>

                <a href="https://intelarms.shop/how-does-it-workdp" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration:"none", display:"inline-block", marginRight:10 }}>
                  Buy Nexus →
                </a>
                <a href="https://intelarms.shop/eds" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ textDecoration:"none", display:"inline-block" }}>
                  Full Specs
                </a>
              </div>
            </div>

            {/* Game modes */}
            <div style={{ ...MONO, fontSize:8, letterSpacing:".25em", color:MUTED, marginBottom:16 }}>◈ GAME MODES & FEATURES</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,240px),1fr))", gap:12, marginBottom:40 }}>
              <FeatureCard icon="🏴" title="Point Capture"       text="Classic domination mechanics — control the point, hold it under fire." />
              <FeatureCard icon="💣" title="Bomb Plant / Defuse" text="Plant or defuse with the Hacker USB key. Every second counts." />
              <FeatureCard icon="💻" title="Crypto Mining"       text="Unique digital scenario — mine virtual currency while under attack." />
              <FeatureCard icon="📡" title="Comms Hacking"       text="Infiltrate and disrupt enemy communication systems." />
              <FeatureCard icon="🔑" title="Role-Based Keys"     text="USB keys assign Hacker, Engineer, or Admin roles to players." />
              <FeatureCard icon="📶" title="Scalable Network"    text="Add modules at any time — auto-syncs, no manual pairing needed." />
            </div>

            {/* Kit contents */}
            <div style={{ background:BG2, border:`1px solid ${BORDER2}`, padding:"24px 28px" }}>
              <div style={{ ...MIL, fontWeight:700, fontSize:16, letterSpacing:".12em", color:ACCENT, textTransform:"uppercase", marginBottom:16 }}>
                📦 What's in the Starter Kit
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:8 }}>
                {[
                  ["1×","Control Terminal"],["3×","Wireless Game Modules"],["2×","Hacker USB Keys"],
                  ["2×","Engineer USB Keys"],["2×","Administrator USB Keys"],["1×","Quick Start Documentation"],
                ].map(([qty, item]) => (
                  <div key={item} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 12px", background:BG3, border:`1px solid ${BORDER}` }}>
                    <span style={{ ...MIL, fontWeight:700, color:ACCENT, fontSize:13, minWidth:28 }}>{qty}</span>
                    <span style={{ fontSize:12, color:"#8aaa60" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CLAYMORE TAB ── */}
        {activeTab === "claymore" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,500px),1fr))", gap:32, marginBottom:40 }}>
              <div>
                <ImageGallery images={CLAYMORE_IMAGES} productName="Claymore" />
              </div>
              <div>
                <div style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".2em", marginBottom:8 }}>◈ INTEL ARMS TACTICAL MODULE</div>
                <div style={{ ...MIL, fontWeight:900, fontSize:"clamp(28px,5vw,48px)", textTransform:"uppercase", color:"#fff", lineHeight:.95, marginBottom:20 }}>
                  CLAYMORE <span style={{ color:ACCENT }}>MODULE</span>
                </div>

                <div style={{ fontSize:13, color:"#8aaa60", lineHeight:1.8, marginBottom:20 }}>
                  The Claymore Module is built on a principle of <strong style={{ color:"#fff" }}>intelligent simplicity</strong> — proven technologies carefully adapted for modern gaming scenarios. Highly sensitive motion sensors filter out environmental noise, responding exclusively to real player presence within the active zone.
                </div>

                <div style={{ marginBottom:24 }}>
                  {[
                    "Dual-speaker system — 6W total output",
                    "Motion sensors with false-trigger filtering",
                    "Directional trigger device mode",
                    "Wiretrap-style interaction system",
                    "Standalone countdown timer mode",
                    "Active perimeter audio control unit",
                  ].map((f, i) => (
                    <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:6 }}>
                      <span style={{ color:ACCENT, fontSize:12, marginTop:2, flexShrink:0 }}>✓</span>
                      <span style={{ fontSize:13, color:MUTED }}>{f}</span>
                    </div>
                  ))}
                </div>

                <a href="https://intelarms.shop/how-does-it-workgd" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration:"none", display:"inline-block", marginRight:10 }}>
                  Buy Claymore →
                </a>
                <a href="https://intelarms.shop/domination-box" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ textDecoration:"none", display:"inline-block" }}>
                  Full Specs
                </a>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,240px),1fr))", gap:12 }}>
              <FeatureCard icon="🔊" title="6W Dual Speakers" text="Realistic directional audio effects that bring gameplay moments to life with striking intensity." />
              <FeatureCard icon="🎯" title="Smart Motion Sensors" text="Only real player interaction triggers the device. Environmental noise is filtered out completely." />
              <FeatureCard icon="⏱" title="Countdown Timer" text="Run as a standalone countdown timer for bomb-defuse or timed capture scenarios." />
              <FeatureCard icon="⚡" title="Multi-Mode" text="One device, multiple roles: wiretrap, perimeter control, directional trigger, or timer." />
            </div>
          </div>
        )}

        {/* ── CONTACT TAB ── */}
        {activeTab === "contact" && (
          <div style={{ maxWidth:600 }}>
            <div style={{ ...MONO, fontSize:8, letterSpacing:".25em", color:MUTED, marginBottom:16 }}>◈ GET IN TOUCH WITH INTEL ARMS</div>
            <div style={{ ...MIL, fontWeight:700, fontSize:26, letterSpacing:".08em", color:"#fff", marginBottom:20 }}>
              CONTACT <span style={{ color:ACCENT }}>INTEL ARMS</span>
            </div>

            <div style={{ fontSize:13, color:MUTED, lineHeight:1.7, marginBottom:28 }}>
              Interested in their props for your site, event, or personal use? Get in touch with Intel Arms directly via their website or shop.
            </div>

            {[
              { icon:"🌐", label:"Website",  value:"intelarms.shop",      href:"https://intelarms.shop" },
              { icon:"🛒", label:"Buy Nexus", value:"Nexus Starter Kit — €400", href:"https://intelarms.shop/how-does-it-workdp" },
              { icon:"💣", label:"Buy Claymore", value:"Claymore Module",  href:"https://intelarms.shop/how-does-it-workgd" },
            ].map(({ icon, label, value, href }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:16, background:BG2, border:`1px solid ${BORDER2}`, padding:"16px 20px", marginBottom:10, transition:"border-color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                  onMouseLeave={e => e.currentTarget.style.borderColor = BORDER2}
                >
                  <div style={{ fontSize:24, flexShrink:0 }}>{icon}</div>
                  <div>
                    <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".15em", textTransform:"uppercase" }}>{label}</div>
                    <div style={{ ...MIL, fontWeight:700, fontSize:14, color:ACCENT, letterSpacing:".06em" }}>{value}</div>
                  </div>
                  <div style={{ marginLeft:"auto", ...MONO, fontSize:10, color:MUTED }}>→</div>
                </div>
              </a>
            ))}

            <div style={{ background:BG2, border:`1px solid ${BORDER}`, padding:"20px 24px", marginTop:24 }}>
              <div style={{ ...MIL, fontWeight:700, fontSize:13, letterSpacing:".1em", color:ACCENT, marginBottom:8 }}>◈ USED AT SWINDON AIRSOFT</div>
              <div style={{ fontSize:13, color:MUTED, lineHeight:1.7 }}>
                We run Intel Arms props at Swindon Airsoft field. If you've played one of our objective-based game days you've already used them — and you know how good they are. We highly recommend them to any site looking to level up their gameplay.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
