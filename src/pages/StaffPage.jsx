// pages/StaffPage.jsx
import React, { useState } from "react";
import { RankInsignia, DesignationInsignia } from "../utils";

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
          <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
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
                fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:11,
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
          <div style={{ position:"absolute", top:8, right:8, background:gold, color:"#000", fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:8, letterSpacing:".15em", padding:"2px 8px", zIndex:4 }}>
            ★ C/O
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding:"12px 12px 10px", position:"relative", zIndex:6 }}>
        <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:17, letterSpacing:".1em", color: isOwner ? gold : "#dce8c8", textTransform:"uppercase", lineHeight:1.15, marginBottom:5 }}>
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

export { StaffPage };
