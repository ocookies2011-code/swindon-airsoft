import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { fmtErr, RankInsignia, DesignationInsignia } from "./utils";
import { logAction } from "./adminShared";

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
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".1em", color:"#e8f0d8", textTransform:"uppercase", marginBottom:5 }}>{title}</div>
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
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
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
          <div style={{ position:"absolute", right:20, top:8, fontSize:80, opacity:.04, color:"#c8ff00", pointerEvents:"none", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, lineHeight:1 }}>SA</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".1em", color:"#c8ff00", textTransform:"uppercase", marginBottom:12 }}>
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
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
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
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:24 }}>
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
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            HOW TO <span style={{ color:"#c8ff00" }}>FIND US</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px", marginBottom:44 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".08em", color:"#e8f0d8", marginBottom:16 }}>SWINDON AIRSOFT</div>
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
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
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
            <span style={{ color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em" }}>COLLECTION</span>
            {" "}at checkout — we will bring your products to game day.
          </div>
          <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.3)", padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ color:"#c8ff00", fontSize:22, flexShrink:0 }}>⚠</span>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em", color:"#c8ff00", textTransform:"uppercase" }}>
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
function StaffPage({ staff = [] }) {
  const RANK_LABELS = {
    1: "OWNER",
    2: "SENIOR MARSHAL",
    3: "MARSHAL",
  };
  const RANK_PIPS = { 1: 5, 2: 4, 3: 3 };
  const getRankLabel = r => RANK_LABELS[r] || "MARSHAL";

  const tiers = staff.reduce((acc, member) => {
    // rank_order 4 is a legacy value — treat as Marshal (3)
    const rank = member.rank_order === 4 ? 3 : member.rank_order;
    const existingTier = acc.find(tier => tier.rank === rank);
    if (existingTier) existingTier.members.push(member);
    else acc.push({ rank, members: [member] });
    return acc;
  }, []).sort((tierA, tierB) => tierA.rank - tierB.rank);

  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>

      {/* ── HEADER ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {/* Corner brackets */}
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
            ◈ — SWINDON AIRSOFT — PERSONNEL DOSSIER — ◈
          </div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            CHAIN OF <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>COMMAND</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>
            ▸ FIELD OPERATIONS — AUTHORISED PERSONNEL ONLY ◂
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 80px" }}>

        {/* Empty */}
        {staff.length === 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>
            NO PERSONNEL ON FILE
          </div>
        )}

        {/* Tiers */}
        {tiers.map((tier, tierIdx) => (
          <div key={tier.rank}>
            {/* Connector from above */}
            {tierIdx > 0 && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", margin:"0 0 0" }}>
                <div style={{ width:1, height:28, background:"linear-gradient(to bottom,#2a3a10,transparent)" }} />
                <div style={{ color:"#2a3a10", fontSize:10 }}>▼</div>
              </div>
            )}

            {/* Rank label */}
            <div style={{ display:"flex", alignItems:"center", margin: tierIdx===0 ? "36px 0 28px" : "4px 0 28px" }}>
              <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#1e2c0a)" }} />
              <div style={{
                fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11,
                letterSpacing:".3em", textTransform:"uppercase",
                padding:"5px 22px", margin:"0 12px",
                color: tier.rank===1 ? "#c8a000" : tier.rank===2 ? "#c8ff00" : "#3a5010",
                border:`1px solid ${tier.rank===1 ? "rgba(200,160,0,.4)" : tier.rank===2 ? "rgba(200,255,0,.2)" : "#1a2808"}`,
                background: tier.rank===1 ? "rgba(200,160,0,.06)" : "rgba(200,255,0,.02)",
                whiteSpace:"nowrap", position:"relative",
              }}>
                {Array.from({length: RANK_PIPS[tier.rank] || 1}).map((_,i) => (
                  <span key={i} style={{ marginRight:3, opacity:.7 }}>★</span>
                ))}
                {getRankLabel(tier.rank)}
              </div>
              <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#1e2c0a)" }} />
            </div>

            {/* Cards */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:20, justifyContent:"center", paddingBottom:8 }}>
              {tier.members.map(member => (
                <StaffCard key={member.id} member={member} rank={tier.rank} pips={RANK_PIPS[tier.rank] || 1} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffCard({ member, rank, pips }) {
  const isOwner   = rank === 1;
  const isCommand = rank === 2;  // Senior Marshal
  const gold   = "#c8a000";
  const green  = "#c8ff00";
  const accent = isOwner ? gold : isCommand ? green : "#4a6820";
  const border = isOwner ? "rgba(200,160,0,.35)" : isCommand ? "rgba(200,255,0,.18)" : "#1a2808";
  const bg     = isOwner
    ? "linear-gradient(180deg,#171200 0%,#0c0b06 100%)"
    : "linear-gradient(180deg,#0c1009 0%,#080a06 100%)";

  return (
    <div style={{
      width:210, overflow:"hidden", position:"relative",
      background:bg, border:`1px solid ${border}`,
      boxShadow: isOwner ? `0 0 40px rgba(200,160,0,.12), inset 0 1px 0 rgba(200,160,0,.06)` : `inset 0 1px 0 rgba(200,255,0,.02)`,
      transition:"transform .2s, box-shadow .2s",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-5px)";
        e.currentTarget.style.boxShadow = isOwner
          ? "0 16px 48px rgba(200,160,0,.22), inset 0 1px 0 rgba(200,160,0,.1)"
          : "0 10px 36px rgba(200,255,0,.07), inset 0 1px 0 rgba(200,255,0,.04)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = isOwner
          ? "0 0 40px rgba(200,160,0,.12), inset 0 1px 0 rgba(200,160,0,.06)"
          : "inset 0 1px 0 rgba(200,255,0,.02)";
      }}
    >
      {/* Scanlines */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.07) 3px,rgba(0,0,0,.07) 4px)", pointerEvents:"none", zIndex:5 }} />

      {/* ID strip */}
      <div style={{ background:"rgba(0,0,0,.7)", borderBottom:`1px solid ${border}`, padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:6, position:"relative" }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:accent, opacity:.6 }}>SA · FIELD PASS</div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:accent, opacity:.4 }}>
          {Array.from({length:pips}).map((_,i)=><span key={i}>★</span>)}
        </div>
      </div>

      {/* Photo */}
      <div style={{ width:"100%", height:195, background:"#060805", overflow:"hidden", position:"relative" }}>
        {member.photo
          ? <img src={member.photo} alt={member.name} onError={e=>{e.target.style.display='none';}} style={{ width:"100%", height:"100%", objectFit:"contain", objectPosition:"center", filter:"contrast(1.05) saturate(0.85)" }} />
          : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0a0c08", gap:8 }}>
              <div style={{ fontSize:52, opacity:.08 }}>👤</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#1e2c0a" }}>NO PHOTO ON FILE</div>
            </div>
        }
        {/* Gradient overlay */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:70, background:"linear-gradient(to top,rgba(8,10,6,.98),transparent)", zIndex:2 }} />
        {/* Corner brackets on photo */}
        {[["top","left"],["top","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:3, top:7,
            left:h==="left"?7:"auto", right:h==="right"?7:"auto",
            borderTop:`1px solid ${accent}`, opacity:.5,
            borderLeft:h==="left"?`1px solid ${accent}`:"none",
            borderRight:h==="right"?`1px solid ${accent}`:"none",
          }} />
        ))}
        {/* Rank badge for owner */}
        {isOwner && (
          <div style={{ position:"absolute", top:8, right:8, background:gold, color:"#000", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:8, letterSpacing:".15em", padding:"2px 8px", zIndex:4 }}>
            ★ C/O
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding:"12px 12px 10px", position:"relative", zIndex:6 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:17, letterSpacing:".1em", color: isOwner ? gold : "#dce8c8", textTransform:"uppercase", lineHeight:1.15, marginBottom:5 }}>
          {member.name}
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".16em", color:accent, opacity:.85, marginBottom:8 }}>
          ▸ {member.job_title}
        </div>
        {/* Rank bar */}
        <div style={{ display:"flex", gap:2, marginBottom: member.bio ? 10 : 4 }}>
          {Array.from({length:5}).map((_,i) => (
            <div key={i} style={{ flex:1, height:2, background: i < pips ? accent : "#141a0e", borderRadius:1 }} />
          ))}
        </div>
        {member.bio && (
          <div style={{ fontSize:11, color:"#7a9a58", lineHeight:1.65, borderTop:"1px solid #141a0e", paddingTop:8, fontFamily:"'Share Tech Mono',monospace" }}>
            {member.bio}
          </div>
        )}
      </div>

      {/* Barcode footer */}
      <div style={{ borderTop:`1px solid ${border}`, padding:"4px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", zIndex:6, position:"relative" }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".08em" }}>
          {member.id ? member.id.slice(0,8).toUpperCase() : "--------"}
        </div>
        <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
          {Array.from({length:18},(_,i) => (
            <div key={i} style={{ background:border, width:i%3===0?2:1, height:3+Math.abs(Math.sin(i*1.9)*6), borderRadius:1, opacity:.7 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin Staff ────────────────────────────────────────────
function AdminStaff({ showToast, cu }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const RANK_OPTIONS = [
    { value: 1, label: "1 — Owner" },
    { value: 2, label: "2 — Senior Marshal" },
    { value: 3, label: "3 — Marshal" },
  ];

  const blank = { name: "", jobTitle: "", bio: "", photo: "", rankOrder: 3 };
  const [form, setForm] = useState(blank);
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadStaff = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    api.staff.getAll()
      .then(data => { setStaffList(data); })
      .catch(e => { setLoadError(e.message || "Failed to load staff"); showToast("Failed to load staff: " + e.message, "red"); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    loadStaff();
    const onVisible = () => { if (document.visibilityState === "visible") loadStaff(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadStaff]);

  const openNew = () => { setForm(blank); setModal("new"); };
  const openEdit = (m) => { setForm({ name: m.name, jobTitle: m.job_title, bio: m.bio || "", photo: m.photo || "", rankOrder: m.rank_order, _orig: { name: m.name, jobTitle: m.job_title, bio: m.bio || "", rankOrder: m.rank_order } }); setModal(m); };

  const handlePhotoFile = async (e, existingId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (existingId) {
      setUploading(true);
      try { const url = await api.staff.uploadPhoto(existingId, file); ff("photo", url); showToast("Photo uploaded!"); }
      catch (err) { showToast("Upload failed: " + err.message, "red"); }
      finally { setUploading(false); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => ff("photo", reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name.trim()) { showToast("Name is required", "red"); return; }
    if (!form.jobTitle.trim()) { showToast("Job title is required", "red"); return; }
    setBusy(true);
    try {
      if (modal === "new") {
        const photoData = form.photo?.startsWith("data:") ? form.photo : "";
        const created = await api.staff.create({ ...form, photo: "" });
        if (photoData && created?.id) {
          const res = await fetch(photoData);
          const blob = await res.blob();
          const file = new File([blob], "photo.jpg", { type: blob.type });
          await api.staff.uploadPhoto(created.id, file);
        }
      } else {
        await api.staff.update(modal.id, form);
      }
      showToast(modal === "new" ? "Staff member added!" : "Staff member updated!");
      if (modal === "new") {
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member added", detail: `Name: ${form.name} | Role: ${form.jobTitle} | Rank order: ${form.rankOrder ?? "?"}` });
      } else {
        const SLABELS = { name: "Name", jobTitle: "Job title", bio: "Bio", rankOrder: "Rank order" };
        const sDiff = diffFields(form._orig || {}, { name: form.name, jobTitle: form.jobTitle, bio: form.bio, rankOrder: form.rankOrder }, SLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member updated", detail: `${form.name}${sDiff ? ` | ${sDiff}` : " (no changes)"}` });
      }
      setModal(null);
      loadStaff(true); // silent refresh — no loading flash
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.staff.delete(deleteConfirm.id);
      showToast("Staff member removed", "red");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member removed", detail: deleteConfirm.name || deleteConfirm.id });
      setDeleteConfirm(null); loadStaff(true);
    }
    catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Staff</div><div className="page-sub">Manage chain of command — changes appear live on the Staff page</div></div>
        <div className="gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff(true)}>🔄 Refresh</button>
          <button className="btn btn-primary" onClick={openNew}>+ Add Staff Member</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading...</div>}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 13 }}>⚠️ {loadError}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff()}>🔄 Try Again</button>
        </div>
      )}
      {!loading && !loadError && staffList.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No staff added yet. Click <strong>+ Add Staff Member</strong> to get started.</div>
      )}
      {!loading && !loadError && staffList.length > 0 && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Photo</th><th>Name</th><th>Job Title</th><th>Rank</th><th>Bio</th><th>Actions</th></tr></thead>
            <tbody>
              {staffList.map(m => (
                <tr key={m.id}>
                  <td>{m.photo ? <img src={m.photo} alt={m.name} onError={e=>{e.target.style.display='none';e.target.nextSibling&&(e.target.nextSibling.style.display='flex');}} style={{ width: 40, height: 40, borderRadius: 2, objectFit: "cover" }} /> : <div style={{ width: 40, height: 40, background: "var(--bg3)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--muted)" }}>👤</div>}</td>
                  <td style={{ fontWeight: 700 }}>{m.name}</td>
                  <td style={{ color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".05em" }}>{m.job_title}</td>
                  <td><span style={{ fontSize: 11, color: m.rank_order === 1 ? "var(--gold)" : "var(--muted)", fontFamily: "'Barlow Condensed',sans-serif" }}>{RANK_OPTIONS.find(r => r.value === m.rank_order)?.label || `Rank ${m.rank_order}`}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.bio || "—"}</td>
                  <td><div className="gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(m)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(m)}>Remove</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {modal !== null && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-title">{modal === "new" ? "➕ Add Staff Member" : `✏️ Edit — ${modal.name}`}</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ width: 90, height: 90, borderRadius: 4, overflow: "hidden", background: "#111", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.photo ? <img src={form.photo} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, opacity: .3 }}>👤</span>}
                </div>
                <label style={{ display: "block", marginTop: 8, cursor: "pointer" }}>
                  <div className="btn btn-sm btn-ghost" style={{ textAlign: "center", pointerEvents: "none" }}>{uploading ? "Uploading…" : "📷 Photo"}</div>
                  <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={e => handlePhotoFile(e, modal !== "new" ? modal.id : null)} />
                </label>
              </div>
              <div style={{ flex: 1 }}>
                <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="e.g. John Smith" /></div>
                <div className="form-group"><label>Job Title *</label><input value={form.jobTitle} onChange={e => ff("jobTitle", e.target.value)} placeholder="e.g. Head Marshal" /></div>
              </div>
            </div>
            <div className="form-group">
              <label>Rank / Position</label>
              <select value={form.rankOrder} onChange={e => ff("rankOrder", Number(e.target.value))}>
                {RANK_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Lower number = higher up the chain of command.</div>
            </div>
            <div className="form-group">
              <label>Bio <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <textarea rows={3} value={form.bio} onChange={e => ff("bio", e.target.value)} placeholder="Short description shown on the staff card…" />
            </div>
            <div className="gap-2" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy || uploading}>{busy ? "Saving…" : modal === "new" ? "Add Member" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚠️ Remove Staff Member</div>
            <p style={{ color: "var(--muted)", marginBottom: 20 }}>Are you sure you want to remove <strong style={{ color: "var(--text)" }}>{deleteConfirm.name}</strong> from the staff page?</p>
            <div className="gap-2">
              <button className="btn btn-danger" onClick={confirmDelete} disabled={busy}>{busy ? "Removing…" : "Yes, Remove"}</button>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contact Page (public) ─────────────────────────────────

export { StaffPage, StaffCard, Divider };
export default AdminStaff;
