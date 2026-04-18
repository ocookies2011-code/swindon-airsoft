// pages/AboutPage.jsx
import React, { useState } from "react";

function Divider() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16, margin:"40px 0" }}>
      <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
      <div style={{ color:"#c8ff00", fontSize:14, opacity:.5 }}>✦</div>
      <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
    </div>
  );
}

function AboutPage({ setPage }) {

  const InfoRow = ({ icon, children }) => (
    <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:14 }}>
      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{icon}</span>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#8aaa60", lineHeight:1.8 }}>{children}</div>
    </div>
  );
  const TimelineItem = ({ time, title, desc }) => (
    <div style={{ display:"flex", gap:0, marginBottom:0 }}>
      <div style={{ flexShrink:0, width:120, paddingTop:3, paddingBottom:24 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8ff00", letterSpacing:".08em", lineHeight:1.4 }}>{time}</div>
      </div>
      <div style={{ flex:1, borderLeft:"1px solid #2a3a10", paddingLeft:20, paddingBottom:24, position:"relative" }}>
        <div style={{ position:"absolute", left:-5, top:5, width:8, height:8, background:"#c8ff00", borderRadius:"50%", boxShadow:"0 0 8px rgba(200,255,0,.5)" }} />
        <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".1em", color:"#e8f0d8", textTransform:"uppercase", marginBottom:5 }}>{title}</div>
        {desc && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#5a7a40", lineHeight:1.8 }}>{desc}</div>}
      </div>
    </div>
  );
  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>

      {/* ── HEADER ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>
            ◈ — SWINDON AIRSOFT — OPERATIONAL BRIEF — ◈
          </div>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            ABOUT <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>US</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, letterSpacing:".2em", color:"#5a7a30", marginTop:10 }}>
            RUN BY AIRSOFTERS, FOR AIRSOFTERS
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"48px 20px 100px" }}>

        {/* ── WELCOME CARD ── */}
        <div style={{ background:"linear-gradient(135deg,#0c1009,#0a0f07)", border:"1px solid #2a3a10", borderLeft:"4px solid #c8ff00", padding:"26px 30px", marginBottom:44, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", right:20, top:8, fontSize:80, opacity:.04, color:"#c8ff00", pointerEvents:"none", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, lineHeight:1 }}>SA</div>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".1em", color:"#c8ff00", textTransform:"uppercase", marginBottom:12 }}>
            Welcome to Swindon Airsoft
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#7a9a50", lineHeight:1.9 }}>
            Located just off <span style={{ color:"#c8ff00" }}>Junction 16 of the M4</span>, we bring you Swindon Airsoft — run by Airsofters for Airsofters. Whether you are a seasoned player or completely new to the sport, we have got you covered.
          </div>
        </div>

        {/* ── SECTION LABEL helper ── */}
        {/* ── NEED TO KNOW ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 01</div>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            NEED TO <span style={{ color:"#c8ff00" }}>KNOW</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px", marginBottom:44 }}>
          <InfoRow icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="#c8ff00" strokeWidth="1.4"/><circle cx="10" cy="10" r="4" stroke="#c8ff00" strokeWidth="1.4"/><circle cx="10" cy="10" r="1.5" fill="#c8ff00"/></svg>}>
            New to Airsoft? We have a limited number of <span style={{ color:"#c8ff00" }}>rental kits available to pre-book</span>. Full details on the rental kit can be found in our Shop.
          </InfoRow>
          <InfoRow icon="👶">
            Due to insurance requirements, the minimum age on site is <span style={{ color:"#c8ff00" }}>12 years with a parent or guardian playing</span>, or <span style={{ color:"#c8ff00" }}>14 years with a parent or guardian on-site</span>.
          </InfoRow>
          <InfoRow icon="🥾">
            As this is a woodland site, <span style={{ color:"#c8ff00" }}>boots are a MUST</span> at all times — no trainers or open footwear.
          </InfoRow>
          <InfoRow icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="4" y="2" width="12" height="16" rx="1" stroke="#c8ff00" strokeWidth="1.4"/><path d="M7 7h6M7 11h6M7 15h4" stroke="#c8ff00" strokeWidth="1.4" strokeLinecap="round"/></svg>}>
            Please ensure the <span style={{ color:"#c8ff00" }}>digital waiver is signed</span> before attending. You can do this from your Profile page.
          </InfoRow>
        </div>
        <Divider />

        {/* ── DAY SCHEDULE ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 02</div>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:24 }}>
            A DAY AT <span style={{ color:"#c8ff00" }}>SWINDON AIRSOFT</span>
          </div>
        </div>
        <TimelineItem time="08:00" title="Gates Open" desc="Arrive and be greeted with a free tea or coffee. Get yourself set up in the safe zone." />
        <TimelineItem time="08:45" title="Chrono" desc="All weapons are chronographed. Make sure your kit is prepped and ready to go." />
        <TimelineItem time="09:30" title="Morning Brief" desc="Led by one of our staff — we outline the site rules and make sure everyone knows what to expect on the day." />
        <TimelineItem time="10:00" title="First Game On" desc="Make sure you are kitted up and ready. First game kicks off — get stuck in!" />
        <TimelineItem time="12:30 – 13:00" title="Lunch Break" desc="We stop for lunch and set up the second half of the day. We have an onsite shop with drinks available. We recommend bringing your own lunch — there is also a local Co-op just down the road. Times can sometimes change." />
        <TimelineItem time="Afternoon" title="Second Half" desc="Back into it for the afternoon games until end of day." />

        <Divider />

        {/* ── LOCATION ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 03</div>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            HOW TO <span style={{ color:"#c8ff00" }}>FIND US</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px", marginBottom:44 }}>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".08em", color:"#e8f0d8", marginBottom:16 }}>SWINDON AIRSOFT</div>
          <InfoRow icon="📍">
            <span>Manor Hl, Swindon, <span style={{ color:"#c8ff00", fontWeight:700 }}>SN5 4EG</span></span>
          </InfoRow>
          <InfoRow icon="🔤">
            What3Words: <span style={{ color:"#c8ff00" }}>///massaged.flasks.blunders</span>
          </InfoRow>
          <InfoRow icon="🛣️">
            Located just off Junction 16 of the M4 — easy to reach from all directions. A marshal will greet you on arrival.
          </InfoRow>
          <InfoRow icon="🚗">
            <span><span style={{ color:"#c8ff00" }}>Parking is limited</span> — car sharing is strongly encouraged where possible. A marshal will direct you where to park on arrival.</span>
          </InfoRow>
        </div>

        <Divider />

        {/* ── PRE-ORDERS ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 04</div>
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            PRE-<span style={{ color:"#c8ff00" }}>ORDERS</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px" }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#7a9a50", lineHeight:1.9, marginBottom:20 }}>
            Want to order from{" "}
            <a href="https://www.airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
              style={{ color:"#c8ff00", textDecoration:"none", borderBottom:"1px solid rgba(200,255,0,.35)", paddingBottom:1 }}>
              Airsoft Armoury UK (www.airsoftarmoury.uk)
            </a>
            ? Place your order online and use code{" "}
            <span style={{ color:"#c8ff00", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em" }}>COLLECTION</span>
            {" "}at checkout — we will bring your products to game day.
          </div>
          <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.3)", padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ color:"#c8ff00", fontSize:22, flexShrink:0 }}>⚠</span>
            <div>
              <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em", color:"#c8ff00", textTransform:"uppercase" }}>
                Order Deadline
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#7a9a50", marginTop:4, lineHeight:1.6 }}>
                You MUST place your order by the Friday prior to game day — no exceptions.
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div style={{ textAlign:"center", marginTop:56 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:18 }}>▸ READY TO DEPLOY? ◂</div>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="btn btn-primary" style={{ padding:"13px 36px", fontSize:13, letterSpacing:".15em" }} onClick={() => setPage("events")}>
              BOOK A GAME DAY →
            </button>
            <button className="btn btn-ghost" style={{ padding:"13px 28px", fontSize:13, letterSpacing:".15em" }} onClick={() => setPage("contact")}>
              CONTACT US →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Staff Page (public) ──────────────────────────────────

export { AboutPage };
