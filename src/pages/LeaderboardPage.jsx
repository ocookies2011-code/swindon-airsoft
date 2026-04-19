// pages/LeaderboardPage.jsx
import React, { useState, useMemo } from "react";

/* ── constants ── */
const MIL   = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO  = { fontFamily:"'Share Tech Mono',monospace" };
const ACCENT = "#c8ff00";
const GOLD   = "#d4a017";
const BG     = "#080b06";
const BG2    = "#0d1209";
const BG3    = "#111a0a";
const BORDER  = "#1e2e12";
const BORDER2 = "#2a4018";
const MUTED   = "#5a6e42";

/* ── British Army rank system (module level — accessible by all components) ── */
const BRIT_RANKS = [
  { min:400, rank:"Field Marshal",      abbr:"FM",     tier:10, pip:"FM"  },
  { min:300, rank:"General",            abbr:"Gen",    tier:9,  pip:"GEN" },
  { min:250, rank:"Lieutenant General", abbr:"Lt Gen", tier:9,  pip:"GEN" },
  { min:200, rank:"Major General",      abbr:"Maj Gen",tier:8,  pip:"MG"  },
  { min:160, rank:"Brigadier",          abbr:"Brig",   tier:8,  pip:"BG"  },
  { min:130, rank:"Colonel",            abbr:"Col",    tier:7,  pip:"COL" },
  { min:100, rank:"Lieutenant Colonel", abbr:"Lt Col", tier:7,  pip:"COL" },
  { min:80,  rank:"Major",              abbr:"Maj",    tier:6,  pip:"MAJ" },
  { min:60,  rank:"Captain",            abbr:"Cpt",    tier:6,  pip:"CPT" },
  { min:45,  rank:"Lieutenant",         abbr:"Lt",     tier:5,  pip:"LT"  },
  { min:35,  rank:"Second Lieutenant",  abbr:"2Lt",    tier:5,  pip:"2LT" },
  { min:28,  rank:"Warrant Officer I",  abbr:"WO1",    tier:4,  pip:"WO"  },
  { min:20,  rank:"Warrant Officer II", abbr:"WO2",    tier:4,  pip:"WO"  },
  { min:15,  rank:"Staff Sergeant",     abbr:"S/Sgt",  tier:3,  pip:"SSG" },
  { min:10,  rank:"Sergeant",           abbr:"Sgt",    tier:3,  pip:"SGT" },
  { min:6,   rank:"Corporal",           abbr:"Cpl",    tier:2,  pip:"CPL" },
  { min:3,   rank:"Lance Corporal",     abbr:"L/Cpl",  tier:2,  pip:"LCL" },
  { min:0,   rank:"Private",            abbr:"Pte",    tier:1,  pip:"PTE" },
];

const TIER_COLORS = {
  1:"#5a6e42", 2:"#7a9a50", 3:"#c8d4b0",
  4:"#4fc3f7", 5:"#81c784", 6:"#ffd54f",
  7:"#ffb74d", 8:"#ef5350", 9:GOLD, 10:ACCENT,
};

function getPlayerRank(games) {
  return BRIT_RANKS.find(r => games >= r.min) || BRIT_RANKS[BRIT_RANKS.length - 1];
}

/* ── Rank insignia SVG ── */
function RankInsigniaIcon({ pip, tier, size }) {
  const s = size || 26;
  const col = TIER_COLORS[tier] || MUTED;
  const c = s / 2;

  const Bar = ({ y }) => <rect x="2" y={y} width={s - 4} height="3" rx="1" fill={col} />;
  const Pip = ({ x, y, r }) => {
    const rr = r || 4;
    return <polygon points={`${x},${y-rr} ${x+rr},${y} ${x},${y+rr} ${x-rr},${y}`} fill={col} />;
  };
  const Crown = ({ cx, cy, w, h }) => {
    const ww = w || 10; const hh = h || 7;
    return (
      <g>
        <rect x={cx - ww/2} y={cy + hh*0.4} width={ww} height={hh*0.6} rx="1" fill={col}/>
        <polygon fill={col} points={[
          `${cx-ww/2},${cy+hh*0.4}`,
          `${cx-ww/2},${cy}`,
          `${cx-ww/4},${cy+hh*0.25}`,
          `${cx},${cy}`,
          `${cx+ww/4},${cy+hh*0.25}`,
          `${cx+ww/2},${cy}`,
          `${cx+ww/2},${cy+hh*0.4}`,
        ].join(' ')}/>
      </g>
    );
  };
  const Star = ({ cx, cy, r }) => {
    const rr = r || 4;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * 36 - 90) * Math.PI / 180;
      const rad = i % 2 === 0 ? rr : rr * 0.42;
      pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`);
    }
    return <polygon points={pts.join(' ')} fill={col} />;
  };

  const shapes = {
    PTE: <text x={c} y={c+4} textAnchor="middle" fontSize={s*0.38} fill={col} fontFamily="'Oswald',sans-serif" fontWeight="700">Pte</text>,
    LCL: <Bar y={c-1}/>,
    CPL: <g><Bar y={c-3}/><Bar y={c+2}/></g>,
    SGT: <g><Bar y={c-5}/><Bar y={c}/><Bar y={c+5}/></g>,
    SSG: <g><Crown cx={c} cy={2}/><Bar y={c-1}/><Bar y={c+4}/></g>,
    WO:  <g><Crown cx={c} cy={2}/><Star cx={c} cy={c+4}/></g>,
    "2LT": <Pip x={c} y={c}/>,
    LT:  <g><Pip x={c-5} y={c}/><Pip x={c+5} y={c}/></g>,
    CPT: <g><Pip x={c-8} y={c}/><Pip x={c} y={c}/><Pip x={c+8} y={c}/></g>,
    MAJ: <Crown cx={c} cy={c-2}/>,
    COL: <g><Crown cx={c} cy={c-5}/><Pip x={c-6} y={c+5}/><Pip x={c+6} y={c+5}/></g>,
    BG:  <g><Crown cx={c} cy={c-5}/><Star cx={c} cy={c+5}/></g>,
    MG:  <g><Crown cx={c} cy={c-7}/><Star cx={c-5} cy={c+3}/><Star cx={c+5} cy={c+3}/></g>,
    GEN: <g><Crown cx={c} cy={c-7}/><Star cx={c-7} cy={c+2}/><Star cx={c} cy={c+4}/><Star cx={c+7} cy={c+2}/></g>,
    FM:  <g><Crown cx={c} cy={c-8}/><Star cx={c-8} cy={c+1}/><Star cx={c-3} cy={c+5}/><Star cx={c+3} cy={c+5}/><Star cx={c+8} cy={c+1}/></g>,
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ flexShrink:0 }}>
      <rect width={s} height={s} rx="3" fill="rgba(0,0,0,.3)" stroke={col} strokeWidth="1" strokeOpacity=".4"/>
      {shapes[pip] || shapes.PTE}
    </svg>
  );
}

/* ── AEG gun silhouette ── */
function GunSVG({ style }) {
  return (
    <svg viewBox="0 0 380 90" fill={ACCENT} style={style}>
      <rect x="10" y="37" width="180" height="8" rx="1"/>
      <rect x="30" y="34" width="120" height="4" rx="1"/>
      {[35,47,59,71,83,95,107,119,131].map(x => <rect key={x} x={x} y="32" width="6" height="2" rx="0.5"/>)}
      <rect x="0" y="35" width="14" height="12" rx="1"/>
      <rect x="2" y="33" width="4" height="16" rx="1"/>
      <rect x="190" y="30" width="80" height="22" rx="2"/>
      <rect x="220" y="27" width="10" height="6" rx="1"/>
      <rect x="200" y="34" width="30" height="10" rx="1" opacity=".35"/>
      <path d="M270 30 L330 28 L335 42 L270 52 Z"/>
      <rect x="330" y="28" width="14" height="14" rx="2"/>
      <path d="M240 52 L255 52 L250 72 L235 72 Z"/>
      <rect x="205" y="52" width="22" height="28" rx="2"/>
      <rect x="207" y="50" width="18" height="4" rx="1"/>
      <rect x="95" y="45" width="14" height="18" rx="2"/>
      <rect x="160" y="22" width="44" height="12" rx="3"/>
      <circle cx="182" cy="28" r="4" fill="none" stroke={ACCENT} strokeWidth="1.5"/>
      <rect x="158" y="26" width="6" height="4" rx="1"/>
      <rect x="204" y="26" width="4" height="4" rx="1"/>
      <path d="M240 52 Q228 64 220 62 Q215 60 218 52" fill="none" stroke={ACCENT} strokeWidth="2"/>
    </svg>
  );
}

/* ── BB ammo divider ── */
function AmmoDivider() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16, margin:"32px 0", opacity:.35 }}>
      <div style={{ flex:1, height:1, background:BORDER2 }}/>
      <svg width="120" height="16" viewBox="0 0 120 16">
        {[8,22,36].map(cx => <circle key={cx} cx={cx} cy="8" r="5" fill={ACCENT} opacity=".55"/>)}
        <text x="50" y="12" fontFamily="'Share Tech Mono',monospace" fontSize="9" fill={BORDER2} letterSpacing="2">● ● ●</text>
        {[84,98,112].map(cx => <circle key={cx} cx={cx} cy="8" r="5" fill={ACCENT} opacity=".55"/>)}
      </svg>
      <div style={{ flex:1, height:1, background:BORDER2 }}/>
    </div>
  );
}

/* ── 3D podium block ── */
function PodiumBlock({ rank }) {
  const cfg = {
    1: { h:110, topBg:"rgba(212,160,23,.2)", border:"rgba(212,160,23,.5)", borderTop:"3px solid "+GOLD,   bg:"linear-gradient(180deg,#1e3a0a,#0f1e05)", numCol:"rgba(212,160,23,.35)", numSz:56 },
    2: { h:72,  topBg:"rgba(160,160,160,.1)", border:"rgba(160,160,160,.3)", borderTop:"2px solid #888",  bg:"linear-gradient(180deg,#181e12,#0d1008)", numCol:"rgba(150,150,150,.28)", numSz:42 },
    3: { h:46,  topBg:"rgba(180,100,30,.1)",  border:"rgba(180,100,30,.3)",  borderTop:"2px solid #c97d2a",bg:"linear-gradient(180deg,#1e1208,#100c05)", numCol:"rgba(180,100,30,.25)", numSz:32 },
  }[rank] || {};
  return (
    <div style={{ width:"100%" }}>
      <div style={{ width:"calc(100% + 10px)", height:7, marginLeft:-5, background:cfg.topBg }}/>
      <div style={{ height:cfg.h, background:cfg.bg, border:"1px solid "+cfg.border, borderTop:cfg.borderTop, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(180deg,transparent,transparent 5px,rgba(0,0,0,.18) 5px,rgba(0,0,0,.18) 6px)", pointerEvents:"none" }}/>
        <div style={{ position:"absolute", top:0, right:-10, bottom:0, width:10, background:"rgba(0,0,0,.45)" }}/>
        <span style={{ ...MIL, fontSize:cfg.numSz, fontWeight:700, color:cfg.numCol, lineHeight:1, position:"relative", zIndex:1, userSelect:"none" }}>{rank}</span>
      </div>
      <div style={{ width:"calc(100% + 12px)", marginLeft:-6, height:10, background:"linear-gradient(180deg,#0f1a06,#080b06)", border:"1px solid "+BORDER2, borderTop:"none" }}/>
    </div>
  );
}

/* ── Single podium card ── */
function PodiumCard({ player, rank, isMe, onPlayerClick }) {
  if (!player) return null;
  const rd = getPlayerRank(player.gamesAttended || 0);
  const rankCol = TIER_COLORS[rd.tier] || MUTED;
  const widths   = { 1:260, 2:220, 3:200 };
  const avSizes  = { 1:90,  2:74,  3:64  };
  const scoreSz  = { 1:56,  2:44,  3:36  };
  const medals   = { 1:"🥇", 2:"🥈", 3:"🥉" };
  const borders  = { 1:GOLD, 2:"#555", 3:"#7a4a1a" };
  const displayName = player.callsign || player.name;
  const initials = (displayName || "?")[0].toUpperCase();
  const avSz = avSizes[rank];

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:widths[rank], zIndex:rank===1?3:rank===2?2:1 }}>
      <div
        onClick={() => player.publicProfile && onPlayerClick && onPlayerClick(player.id)}
        style={{ width:"100%", background:BG2, border:"1px solid "+borders[rank], padding:(rank===1?24:20)+"px 16px "+(rank===1?20:16)+"px", textAlign:"center", position:"relative", overflow:"hidden", cursor:player.publicProfile?"pointer":"default", transition:"transform .15s", boxShadow:rank===1?"0 0 48px rgba(212,160,23,.14)":"none" }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
      >
        {/* top accent bar */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:rank===1?3:2, background:rank===1?"linear-gradient(90deg,transparent,"+GOLD+",transparent)":rank===2?"linear-gradient(90deg,transparent,#999,transparent)":"linear-gradient(90deg,transparent,#c97d2a,transparent)" }}/>
        {rank===1 && <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 50% 0%,rgba(212,160,23,.09),transparent 65%)", pointerEvents:"none" }}/>}
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.05) 3px,rgba(0,0,0,.05) 4px)", pointerEvents:"none" }}/>

        {/* avatar */}
        <div style={{ width:avSz, height:avSz, borderRadius:"50%", background:BG3, border:(rank===1?3:2)+"px solid "+borders[rank], margin:"0 auto 12px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:rank===1?30:24, fontWeight:700, color:ACCENT, ...MIL, position:"relative", boxShadow:rank===1?"0 0 20px rgba(212,160,23,.25)":"none" }}>
          {player.profilePic
            ? <img src={player.profilePic} alt="" onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }} style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }}/>
            : null}
          <span style={{ position:"relative", zIndex:1, display:player.profilePic?"none":"flex" }}>{initials}</span>
          <div style={{ position:"absolute", top:-8, right:-8, fontSize:rank===1?20:16, zIndex:3, filter:"drop-shadow(0 2px 4px rgba(0,0,0,.8))" }}>{medals[rank]}</div>
        </div>

        {rank===1 && <div style={{ fontSize:22, marginBottom:4, position:"relative", zIndex:1 }}>👑</div>}

        {/* rank insignia */}
        <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", marginBottom:8, position:"relative", zIndex:1 }}>
          <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={22}/>
          <span style={{ ...MONO, fontSize:8, color:rankCol, letterSpacing:".12em" }}>{rd.abbr} · {rd.rank}</span>
        </div>

        {/* name — callsign only, real name only if no callsign */}
        <div style={{ ...MIL, fontWeight:700, fontSize:rank===1?20:rank===2?17:15, letterSpacing:".06em", color:isMe?"#fff":rank===1?GOLD:rank===2?"#bbb":"#c97d2a", textTransform:"uppercase", marginBottom:3, position:"relative", zIndex:1, lineHeight:1.1 }}>
          {displayName}
        </div>
        {isMe && <div style={{ ...MONO, fontSize:7, color:ACCENT, marginBottom:4, position:"relative", zIndex:1 }}>← YOU</div>}

        <div style={{ marginBottom:10, minHeight:8 }}/>

        <div style={{ ...MIL, fontSize:scoreSz[rank], fontWeight:700, color:ACCENT, lineHeight:1, position:"relative", zIndex:1, filter:rank===1?"drop-shadow(0 0 12px rgba(200,255,0,.3))":"none" }}>
          {player.gamesAttended}
        </div>
        <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".2em", marginTop:3, position:"relative", zIndex:1 }}>DEPLOYMENTS</div>

        <div style={{ display:"flex", gap:4, justifyContent:"center", marginTop:10, flexWrap:"wrap", position:"relative", zIndex:1 }}>
          {player.ukara && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 7px", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7", background:"rgba(79,195,247,.05)" }}>UKARA</span>}
          {player.vipStatus==="active" && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 7px", border:"1px solid rgba(212,160,23,.3)", color:GOLD, background:"rgba(212,160,23,.05)" }}>★ VIP</span>}
        </div>
      </div>
      <PodiumBlock rank={rank}/>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN PAGE COMPONENT
══════════════════════════════════════════ */
function LeaderboardPage({ data, cu, updateUser, showToast, onPlayerClick }) {
  const [yearTab, setYearTab] = useState("all");
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= 2026; y--) years.push(y);

  const board = useMemo(() => {
    const players = (data.users || []).filter(u => !u.leaderboardOptOut && u.role === "player");
    const filtered = yearTab === "all"
      ? players
      : players.filter(u => u.joinDate && new Date(u.joinDate).getFullYear() === Number(yearTab));
    return filtered.sort((a, b) => (b.gamesAttended || 0) - (a.gamesAttended || 0));
  }, [data.users, yearTab]);

  const podium     = board.slice(0, 3);
  const listBoard  = board.slice(3);
  const totalPages = Math.max(1, Math.ceil(listBoard.length / PAGE_SIZE));
  const pageStart  = (page - 1) * PAGE_SIZE;
  const pagePlayers = listBoard.slice(pageStart, pageStart + PAGE_SIZE);
  const myRank     = cu ? board.findIndex(p => p.id === cu.id) : -1;

  const Tab = ({ val, label }) => (
    <button onClick={() => { setYearTab(val); setPage(1); }}
      style={{ ...MIL, fontSize:12, fontWeight:600, letterSpacing:".14em", textTransform:"uppercase", padding:"8px 20px", cursor:"pointer", border:"none", background:yearTab===val?"#172010":BG3, color:yearTab===val?ACCENT:MUTED, borderBottom:"2px solid "+(yearTab===val?ACCENT:"transparent"), clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)", transition:"all .12s" }}>
      {label}
    </button>
  );

  return (
    <div style={{ background:BG, minHeight:"100vh", overflowX:"hidden" }}>

      {/* ── HERO ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1a05,#080b06)", borderBottom:"2px solid "+BORDER2, padding:"56px 24px 48px", textAlign:"center" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px),repeating-linear-gradient(90deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px)", pointerEvents:"none" }}/>
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:20, height:20, top:v==="top"?16:"auto", bottom:v==="bottom"?16:"auto", left:h==="left"?16:"auto", right:h==="right"?16:"auto", borderTop:v==="top"?"1px solid rgba(200,255,0,.5)":"none", borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.5)":"none", borderLeft:h==="left"?"1px solid rgba(200,255,0,.5)":"none", borderRight:h==="right"?"1px solid rgba(200,255,0,.5)":"none" }}/>
        ))}
        <GunSVG style={{ position:"absolute", left:-10, top:"50%", transform:"translateY(-50%)", opacity:.06, width:320, pointerEvents:"none" }}/>
        <GunSVG style={{ position:"absolute", right:-10, top:"50%", transform:"translateY(-50%) scaleX(-1)", opacity:.06, width:320, pointerEvents:"none" }}/>
        <div style={{ position:"absolute", top:16, left:"50%", transform:"translateX(-50%)", opacity:.08 }}>
          <svg width="56" height="56" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="12" stroke={ACCENT} strokeWidth="1"/>
            <circle cx="30" cy="30" r="2" fill={ACCENT}/>
            <line x1="30" y1="0" x2="30" y2="14" stroke={ACCENT} strokeWidth="1"/>
            <line x1="30" y1="46" x2="30" y2="60" stroke={ACCENT} strokeWidth="1"/>
            <line x1="0" y1="30" x2="14" y2="30" stroke={ACCENT} strokeWidth="1"/>
            <line x1="46" y1="30" x2="60" y2="30" stroke={ACCENT} strokeWidth="1"/>
          </svg>
        </div>
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".3em", textTransform:"uppercase", marginBottom:16 }}>◈ SWINDON AIRSOFT · WILTSHIRE SECTOR · SEASON RANKINGS</div>
          <div style={{ ...MIL, fontWeight:700, fontSize:"clamp(44px,8vw,84px)", textTransform:"uppercase", letterSpacing:".08em", color:"#fff", lineHeight:.88, marginBottom:12 }}>
            OPERATOR <span style={{ color:ACCENT }}>RANKINGS</span>
          </div>
          <div style={{ ...MONO, fontSize:10, color:MUTED, letterSpacing:".22em", textTransform:"uppercase", marginBottom:28 }}>◆ RANKED BY CONFIRMED FIELD DEPLOYMENTS ◆</div>
          <div style={{ display:"flex", justifyContent:"center", gap:10, flexWrap:"wrap" }}>
            {[
              { val:board.length, label:"Enrolled Operatives", hi:false },
              { val:board[0]?.gamesAttended??0, label:"Top Deployment Score", hi:true },
              { val:myRank>=0?`#${myRank+1}`:"—", label:"Your Rank", hi:true },
            ].map(s => (
              <div key={s.label} style={{ background:BG2, border:"1px solid "+BORDER, padding:"12px 20px", minWidth:100, textAlign:"center", position:"relative" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:s.hi?ACCENT:BORDER2 }}/>
                <div style={{ ...MIL, fontSize:26, fontWeight:700, color:"#fff" }}>{s.val}</div>
                <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".15em", textTransform:"uppercase", marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position:"absolute", bottom:14, right:20, ...MONO, fontSize:8, color:"#4a5e2a", letterSpacing:".15em" }}>51°3247N · 1°4732W · SN1</div>
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:"36px 20px 80px" }}>

        {/* ── YEAR TABS ── */}
        <div style={{ display:"flex", gap:2, marginBottom:36, flexWrap:"wrap" }}>
          <Tab val="all" label="🏆 All Time"/>
          {years.map(y => <Tab key={y} val={String(y)} label={y+" Season"}/>)}
        </div>

        {/* ── GHOST TOGGLE ── */}
        {cu?.role === "player" && (
          <div style={{ background:BG2, border:"1px solid "+BORDER2, padding:"12px 18px", marginBottom:32, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ ...MIL, fontWeight:700, fontSize:12, letterSpacing:".2em", color:ACCENT, marginBottom:2 }}>FIELD VISIBILITY</div>
              <div style={{ ...MONO, fontSize:10, color:MUTED }}>{cu.leaderboardOptOut?"STATUS: GHOST — YOUR NAME IS HIDDEN":"STATUS: ACTIVE — YOUR NAME IS VISIBLE"}</div>
            </div>
            <button className={"btn btn-sm "+(cu.leaderboardOptOut?"btn-primary":"btn-ghost")}
              onClick={() => { updateUser(cu.id, { leaderboardOptOut:!cu.leaderboardOptOut }); showToast("Preference saved"); }}>
              {cu.leaderboardOptOut?"GO ACTIVE":"GO GHOST"}
            </button>
          </div>
        )}

        {board.length === 0 ? (
          <div style={{ textAlign:"center", padding:80, ...MONO, fontSize:10, color:MUTED, letterSpacing:".2em" }}>NO OPERATIVES ON RECORD FOR THIS PERIOD</div>
        ) : (<>

          {/* ── PODIUM ── */}
          <div style={{ ...MONO, fontSize:9, letterSpacing:".3em", color:MUTED, marginBottom:18, textAlign:"center" }}>◈ TOP OPERATIVES ◈</div>
          <div style={{ position:"relative", marginBottom:8 }}>
            <div style={{ position:"absolute", bottom:22, left:"50%", transform:"translateX(-50%)", width:380, height:6, background:"repeating-linear-gradient(90deg,rgba(212,160,23,.2) 0px,rgba(212,160,23,.2) 8px,transparent 8px,transparent 14px)", pointerEvents:"none", zIndex:0 }}/>
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:0, position:"relative", zIndex:1 }}>
              <PodiumCard player={podium[1]} rank={2} isMe={cu&&podium[1]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <PodiumCard player={podium[0]} rank={1} isMe={cu&&podium[0]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <PodiumCard player={podium[2]} rank={3} isMe={cu&&podium[2]?.id===cu.id} onPlayerClick={onPlayerClick}/>
            </div>
          </div>

          <AmmoDivider/>

          {/* ── FULL ROSTER (rank 4+) ── */}
          {listBoard.length > 0 && (<>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
              <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".16em", whiteSpace:"nowrap" }}>RANKS 4 AND BELOW · FULL ROSTER</div>
              <div style={{ ...MIL, fontSize:18, fontWeight:700, letterSpacing:".16em", textTransform:"uppercase", color:"#fff", whiteSpace:"nowrap" }}>ALL <span style={{ color:ACCENT }}>OPERATORS</span></div>
              <div style={{ flex:1, height:1, background:"linear-gradient(90deg,"+BORDER2+",transparent)" }}/>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:32 }}>
              {pagePlayers.map((player, i) => {
                const absRank = pageStart + i + 4;
                const isMe = cu && player.id === cu.id;
                const rd = getPlayerRank(player.gamesAttended || 0);
                const rankCol = TIER_COLORS[rd.tier] || MUTED;
                const displayName = player.callsign || player.name;
                const initials = (displayName || "?")[0].toUpperCase();
                return (
                  <div key={player.id}
                    onClick={() => player.publicProfile && onPlayerClick && onPlayerClick(player.id)}
                    style={{ display:"grid", gridTemplateColumns:"52px 46px 1fr auto 90px 60px", alignItems:"center", background:BG2, border:"1px solid "+(isMe?"rgba(200,255,0,.3)":BORDER), padding:"10px 14px", cursor:player.publicProfile?"pointer":"default", transition:"border-color .12s,background .12s", position:"relative", overflow:"hidden" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor=BORDER2; e.currentTarget.style.background=BG3; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor=isMe?"rgba(200,255,0,.3)":BORDER; e.currentTarget.style.background=BG2; }}
                  >
                    <div style={{ position:"absolute", left:0, top:0, bottom:0, width:2, background:isMe?ACCENT:"transparent" }}/>
                    <div style={{ ...MONO, fontSize:12, color:MUTED }}># {absRank}</div>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:BG3, border:"1px solid "+(isMe?"rgba(200,255,0,.4)":BORDER2), display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:ACCENT, overflow:"hidden", flexShrink:0, position:"relative", ...MIL }}>
                      {player.profilePic
                        ? <img src={player.profilePic} alt="" onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }} style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }}/>
                        : null}
                      <span style={{ position:"relative", zIndex:1, display:player.profilePic?"none":"flex", alignItems:"center", justifyContent:"center", width:"100%", height:"100%" }}>{initials}</span>
                    </div>
                    <div style={{ padding:"0 12px", minWidth:0 }}>
                      <div style={{ ...MIL, fontSize:14, fontWeight:700, color:isMe?"#fff":"#c8d4b0", letterSpacing:".05em", textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {displayName}
                        {isMe && <span style={{ ...MONO, fontSize:7, color:ACCENT, background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 5px", marginLeft:8 }}>← YOU</span>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                        <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={18}/>
                        <span style={{ ...MONO, fontSize:8, color:rankCol, letterSpacing:".08em" }}>{rd.abbr} · {rd.rank}</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      {player.ukara && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 6px", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7" }}>UKARA</span>}
                      {player.vipStatus==="active" && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 6px", border:"1px solid rgba(212,160,23,.3)", color:GOLD }}>VIP</span>}
                    </div>
                    <div style={{ textAlign:"right", padding:"0 8px" }}>
                      <div style={{ ...MIL, fontSize:22, fontWeight:700, color:ACCENT }}>{player.gamesAttended}</div>
                      <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".14em" }}>DEPLOYS</div>
                    </div>
                    <div style={{ height:4, background:BORDER }}>
                      <div style={{ height:"100%", width:Math.round((player.gamesAttended||0)/(board[0]?.gamesAttended||1)*100)+"%", background:ACCENT, opacity:.5 }}/>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* pagination */}
            {totalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div style={{ ...MONO, fontSize:9, letterSpacing:".15em", color:MUTED }}>SHOWING {pageStart+1}–{Math.min(pageStart+PAGE_SIZE,listBoard.length)} OF {listBoard.length}</div>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  <button disabled={page===1} onClick={() => setPage(p=>Math.max(1,p-1))} style={{ background:BG2, border:"1px solid "+BORDER, color:page===1?BORDER:"#b0c090", ...MONO, fontSize:10, letterSpacing:".1em", padding:"6px 14px", cursor:page===1?"not-allowed":"pointer" }}>◂ PREV</button>
                  {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((item,i,arr) => [
                    i>0&&item-arr[i-1]>1?<span key={"e"+i} style={{ ...MONO, fontSize:10, color:MUTED, padding:"0 4px" }}>…</span>:null,
                    <button key={item} onClick={()=>setPage(item)} style={{ background:item===page?"rgba(200,255,0,.1)":BG2, border:"1px solid "+(item===page?"rgba(200,255,0,.4)":BORDER), color:item===page?ACCENT:MUTED, ...MONO, fontSize:10, width:34, height:30, cursor:"pointer" }}>{item}</button>
                  ])}
                  <button disabled={page===totalPages} onClick={() => setPage(p=>Math.min(totalPages,p+1))} style={{ background:BG2, border:"1px solid "+BORDER, color:page===totalPages?BORDER:"#b0c090", ...MONO, fontSize:10, letterSpacing:".1em", padding:"6px 14px", cursor:page===totalPages?"not-allowed":"pointer" }}>NEXT ▸</button>
                </div>
              </div>
            )}
          </>)}
        </>)}

        <div style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".1em", textAlign:"center", padding:"20px", borderTop:"1px solid "+BORDER, marginTop:24, lineHeight:1.9 }}>
          ⊘ &nbsp;Players who have opted out are not shown · Rankings update after each game day · Manage in Profile → Settings
        </div>
      </div>
    </div>
  );
}

export { LeaderboardPage };
