// pages/LeaderboardPage.jsx
import React, { useState, useMemo } from "react";

const MIL   = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO  = { fontFamily:"'Share Tech Mono',monospace" };
const ACCENT = "#c8ff00";
const GOLD   = "#d4a017";
const SILVER = "#9e9e9e";
const BRONZE = "#b87333";
const BG     = "#080b06";
const BG2    = "#0d1209";
const BG3    = "#111a0a";
const BORDER  = "#1e2e12";
const BORDER2 = "#2a4018";
const MUTED   = "#5a6e42";

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

function getNextRank(games) {
  const idx = BRIT_RANKS.findIndex(r => games >= r.min);
  return idx > 0 ? BRIT_RANKS[idx - 1] : null;
}

function NationalityFlag({ code = "GB", size = 18 }) {
  const c = (code || "GB").toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w80/${c}.png`}
      srcSet={`https://flagcdn.com/w160/${c}.png 2x`}
      width={Math.round(size * 1.5)} height={size} alt={code} title={code}
      style={{ flexShrink:0, display:"inline-block", borderRadius:2, objectFit:"cover", boxShadow:"0 1px 3px rgba(0,0,0,.5)" }}
      onError={e => { e.target.style.display="none"; }}
    />
  );
}

function RankInsigniaIcon({ pip, tier, size }) {
  const s = size || 26;
  const col = TIER_COLORS[tier] || MUTED;
  const c = s / 2;
  const Bar = ({ y }) => <rect x="2" y={y} width={s - 4} height="3" rx="1" fill={col} />;
  const Pip = ({ x, y, r }) => { const rr = r || 4; return <polygon points={`${x},${y-rr} ${x+rr},${y} ${x},${y+rr} ${x-rr},${y}`} fill={col} />; };
  const Crown = ({ cx, cy, w, h }) => { const ww = w||10; const hh = h||7; return (<g><rect x={cx-ww/2} y={cy+hh*0.4} width={ww} height={hh*0.6} rx="1" fill={col}/><polygon fill={col} points={[`${cx-ww/2},${cy+hh*0.4}`,`${cx-ww/2},${cy}`,`${cx-ww/4},${cy+hh*0.25}`,`${cx},${cy}`,`${cx+ww/4},${cy+hh*0.25}`,`${cx+ww/2},${cy}`,`${cx+ww/2},${cy+hh*0.4}`].join(' ')}/></g>); };
  const Star = ({ cx, cy, r }) => { const rr=r||4; const pts=[]; for(let i=0;i<10;i++){const a=(i*36-90)*Math.PI/180;const rad=i%2===0?rr:rr*0.42;pts.push(`${cx+rad*Math.cos(a)},${cy+rad*Math.sin(a)}`);} return <polygon points={pts.join(' ')} fill={col} />; };
  const shapes = {
    PTE: <text x={c} y={c+4} textAnchor="middle" fontSize={s*0.38} fill={col} fontFamily="'Oswald',sans-serif" fontWeight="700">Pte</text>,
    LCL: <Bar y={c-1}/>, CPL: <g><Bar y={c-3}/><Bar y={c+2}/></g>,
    SGT: <g><Bar y={c-5}/><Bar y={c}/><Bar y={c+5}/></g>,
    SSG: <g><Crown cx={c} cy={2}/><Bar y={c-1}/><Bar y={c+4}/></g>,
    WO:  <g><Crown cx={c} cy={2}/><Star cx={c} cy={c+4}/></g>,
    "2LT": <Pip x={c} y={c}/>, LT: <g><Pip x={c-5} y={c}/><Pip x={c+5} y={c}/></g>,
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

// ── Podium card (desktop) ──────────────────────────────────
function PodiumCard({ player, rank, isMe, onPlayerClick, topScore }) {
  if (!player) return null;
  const rd = getPlayerRank(player.gamesAttended || 0);
  const rankCol = TIER_COLORS[rd.tier] || MUTED;
  const heights  = { 1:220, 2:180, 3:160 };
  const podH     = { 1:80,  2:52,  3:36  };
  const avSz     = { 1:88,  2:70,  3:60  }[rank];
  const scoreSz  = { 1:56,  2:42,  3:34  }[rank];
  const borderC  = { 1:GOLD, 2:SILVER, 3:BRONZE }[rank];
  const medalEm  = { 1:"🥇", 2:"🥈", 3:"🥉" }[rank];
  const displayName = player.callsign || player.name;
  const initials = (displayName || "?")[0].toUpperCase();
  const pct = topScore > 0 ? Math.round((player.gamesAttended / topScore) * 100) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width: rank===1?260:210, zIndex:rank===1?3:rank===2?2:1 }}>
      <div
        onClick={() => player.publicProfile && onPlayerClick?.(player.id)}
        style={{ width:"100%", background:BG2, borderLeft:`1px solid ${borderC}`, borderRight:`1px solid ${borderC}`, borderTop:`3px solid ${borderC}`, padding:`${rank===1?24:18}px 16px ${rank===1?20:16}px`, textAlign:"center", position:"relative", overflow:"hidden", cursor:player.publicProfile?"pointer":"default", transition:"transform .2s" }}
        onMouseEnter={e => e.currentTarget.style.transform="translateY(-6px)"}
        onMouseLeave={e => e.currentTarget.style.transform=""}
      >
        {/* bg glow */}
        <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 50% 0%, ${borderC}18 0%, transparent 70%)`, pointerEvents:"none" }}/>

        {/* medal */}
        <div style={{ fontSize:rank===1?28:22, marginBottom:6 }}>{medalEm}</div>

        {/* avatar */}
        <div style={{ width:avSz, height:avSz, borderRadius:"50%", background:BG3, border:`${rank===1?3:2}px solid ${borderC}`, margin:"0 auto 12px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:rank===1?30:22, fontWeight:700, color:ACCENT, ...MIL, overflow:"hidden", position:"relative", boxShadow:`0 0 20px ${borderC}44` }}>
          {player.profilePic && <img src={player.profilePic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} onError={e=>e.target.style.display="none"}/>}
          <span style={{ position:"relative", zIndex:1 }}>{initials}</span>
        </div>

        {/* name */}
        <div style={{ ...MIL, fontWeight:900, fontSize:rank===1?17:14, letterSpacing:".06em", color:borderC, textTransform:"uppercase", marginBottom:4, lineHeight:1.1 }}>
          {displayName}
        </div>
        {isMe && <div style={{ ...MONO, fontSize:7, color:ACCENT, marginBottom:4 }}>◈ YOU ◈</div>}

        {/* flag + rank insignia */}
        <div style={{ display:"flex", alignItems:"center", gap:5, justifyContent:"center", marginBottom:4 }}>
          <NationalityFlag code={player.nationality || "GB"} size={rank===1?16:14}/>
          <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={rank===1?20:16}/>
          <span style={{ ...MONO, fontSize:8, color:rankCol, letterSpacing:".08em" }}>{rd.abbr}</span>
        </div>

        {/* score */}
        <div style={{ ...MIL, fontSize:scoreSz, fontWeight:700, color:ACCENT, lineHeight:1, margin:"10px 0 2px" }}>{player.gamesAttended}</div>
        <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".2em" }}>DEPLOYMENTS</div>

        {/* progress bar vs top */}
        {rank > 1 && (
          <div style={{ marginTop:10 }}>
            <div style={{ height:2, background:BORDER, borderRadius:1 }}>
              <div style={{ height:2, width:`${pct}%`, background:borderC, borderRadius:1, opacity:.6 }}/>
            </div>
            <div style={{ ...MONO, fontSize:6, color:MUTED, marginTop:3, letterSpacing:".08em" }}>{pct}% of leader</div>
          </div>
        )}

        {/* badges */}
        <div style={{ display:"flex", gap:4, justifyContent:"center", marginTop:8, flexWrap:"wrap" }}>
          {player.ukara && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 6px", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7" }}>UKARA</span>}
          {player.vipStatus==="active" && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 6px", border:`1px solid ${GOLD}44`, color:GOLD }}>★ VIP</span>}
          {player.designation && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 6px", border: player.designation==="SITE OWNER"?"1px solid rgba(200,160,0,.5)":"1px solid rgba(79,195,247,.3)", color: player.designation==="SITE OWNER"?"#c8a000":"#4fc3f7" }}>{player.designation}</span>}
        </div>
      </div>

      {/* podium block */}
      <div style={{ width:"100%", height:podH[rank], background:`linear-gradient(180deg,${BG3},${BG})`, border:`1px solid ${borderC}`, borderTop:"none", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:`linear-gradient(180deg,${borderC}18,transparent)` }}/>
        <span style={{ ...MIL, fontSize:rank===1?56:rank===2?40:30, fontWeight:700, color:`${borderC}20`, position:"relative" }}>{rank}</span>
      </div>
    </div>
  );
}

// ── Mobile podium card ─────────────────────────────────────
function MobilePodiumCard({ player, rank, isMe, onPlayerClick }) {
  if (!player) return null;
  const rd = getPlayerRank(player.gamesAttended || 0);
  const rankCol = TIER_COLORS[rd.tier] || MUTED;
  const borderC  = { 1:GOLD, 2:SILVER, 3:BRONZE }[rank];
  const medalEm  = { 1:"🥇", 2:"🥈", 3:"🥉" }[rank];
  const avSz = rank===1 ? 68 : 52;
  const displayName = player.callsign || player.name;
  const initials = (displayName || "?")[0].toUpperCase();

  return (
    <div
      onClick={() => player.publicProfile && onPlayerClick?.(player.id)}
      style={{ flex:rank===1?"0 0 40%":"0 0 28%", background:BG2, borderTop:`${rank===1?3:2}px solid ${borderC}`, border:`1px solid ${borderC}`, padding:"12px 8px 10px", textAlign:"center", cursor:player.publicProfile?"pointer":"default", position:"relative", overflow:"hidden" }}
    >
      <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 50% 0%, ${borderC}15 0%, transparent 70%)`, pointerEvents:"none" }}/>
      <div style={{ fontSize:rank===1?20:15, marginBottom:6, position:"relative" }}>{medalEm}</div>
      <div style={{ width:avSz, height:avSz, borderRadius:"50%", background:BG3, border:`2px solid ${borderC}`, margin:"0 auto 8px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:rank===1?24:18, fontWeight:700, color:ACCENT, ...MIL, overflow:"hidden", position:"relative", boxShadow:`0 0 14px ${borderC}44` }}>
        {player.profilePic && <img src={player.profilePic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} onError={e=>e.target.style.display="none"}/>}
        <span style={{ position:"relative", zIndex:1 }}>{initials}</span>
      </div>
      <div style={{ ...MIL, fontWeight:800, fontSize:rank===1?14:11, color:borderC, textTransform:"uppercase", letterSpacing:".04em", marginBottom:3, lineHeight:1.1, wordBreak:"break-word" }}>
        {displayName}
      </div>
      {isMe && <div style={{ ...MONO, fontSize:7, color:ACCENT, marginBottom:2 }}>◈ YOU</div>}
      <div style={{ display:"flex", alignItems:"center", gap:3, justifyContent:"center", marginBottom:4 }}>
        <NationalityFlag code={player.nationality || "GB"} size={12}/>
        <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={14}/>
        <span style={{ ...MONO, fontSize:7, color:rankCol }}>{rd.abbr}</span>
      </div>
      <div style={{ ...MIL, fontSize:rank===1?32:24, fontWeight:700, color:ACCENT, lineHeight:1 }}>{player.gamesAttended}</div>
      <div style={{ ...MONO, fontSize:6, color:MUTED, letterSpacing:".12em" }}>DEPLOYS</div>
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
  const [mobile, setMobile] = useState(typeof window !== "undefined" && window.innerWidth < 640);
  React.useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

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

  const topScore   = board[0]?.gamesAttended || 0;
  const podium     = board.slice(0, 3);
  const listBoard  = board.slice(3);
  const totalPages = Math.max(1, Math.ceil(listBoard.length / PAGE_SIZE));
  const pageStart  = (page - 1) * PAGE_SIZE;
  const pagePlayers = listBoard.slice(pageStart, pageStart + PAGE_SIZE);
  const myRank     = cu ? board.findIndex(p => p.id === cu.id) : -1;

  const Tab = ({ val, label }) => (
    <button onClick={() => { setYearTab(val); setPage(1); }}
      style={{ ...MIL, fontSize:11, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", padding:"8px 16px", cursor:"pointer", border:"1px solid", borderColor:yearTab===val?"rgba(200,255,0,.4)":BORDER, background:yearTab===val?"rgba(200,255,0,.08)":BG3, color:yearTab===val?ACCENT:MUTED, transition:"all .12s", flexShrink:0, whiteSpace:"nowrap" }}>
      {label}
    </button>
  );

  return (
    <div style={{ background:BG, minHeight:"100vh", overflowX:"hidden" }}>

      {/* ── HERO ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0d1f06,#080b06)", borderBottom:`2px solid ${BORDER2}`, padding:mobile?"36px 16px 32px":"60px 24px 52px", textAlign:"center" }}>
        {/* scanline effect */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px)", pointerEvents:"none" }}/>
        {/* corner brackets */}
        {!mobile && <>
          <div style={{ position:"absolute", top:20, left:24, width:40, height:40, borderTop:`1px solid ${BORDER2}`, borderLeft:`1px solid ${BORDER2}` }}/>
          <div style={{ position:"absolute", top:20, right:24, width:40, height:40, borderTop:`1px solid ${BORDER2}`, borderRight:`1px solid ${BORDER2}` }}/>
          <div style={{ position:"absolute", bottom:20, left:24, width:40, height:40, borderBottom:`1px solid ${BORDER2}`, borderLeft:`1px solid ${BORDER2}` }}/>
          <div style={{ position:"absolute", bottom:20, right:24, width:40, height:40, borderBottom:`1px solid ${BORDER2}`, borderRight:`1px solid ${BORDER2}` }}/>
        </>}

        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".25em", textTransform:"uppercase", marginBottom:12 }}>◈ SWINDON AIRSOFT · FIELD COMMAND ◈</div>
          <div style={{ ...MIL, fontWeight:900, fontSize:mobile?"clamp(36px,11vw,52px)":"clamp(52px,8vw,96px)", textTransform:"uppercase", letterSpacing:".06em", color:"#fff", lineHeight:.85, marginBottom:12 }}>
            OPERATOR<br/><span style={{ color:ACCENT, textShadow:`0 0 40px ${ACCENT}55` }}>RANKINGS</span>
          </div>
          <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".2em", marginBottom:28 }}>◆ RANKED BY CONFIRMED DEPLOYMENTS ◆</div>

          {/* stats row */}
          <div style={{ display:"flex", justifyContent:"center", gap:mobile?6:16, flexWrap:"wrap" }}>
            {[
              { val:board.length, label:"Operatives", accent:false },
              { val:topScore,     label:"Top Score",  accent:true  },
              { val:myRank>=0?`#${myRank+1}`:"—", label:"Your Rank", accent:myRank>=0 },
            ].map(s => (
              <div key={s.label} style={{ background:BG2, border:`1px solid ${s.accent?BORDER2:BORDER}`, padding:mobile?"10px 16px":"14px 24px", minWidth:mobile?80:110, textAlign:"center", position:"relative" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:s.accent?`linear-gradient(90deg,transparent,${ACCENT},transparent)`:BORDER }}/>
                <div style={{ ...MIL, fontSize:mobile?24:32, fontWeight:700, color:s.accent?ACCENT:"#fff", lineHeight:1 }}>{s.val}</div>
                <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".15em", textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:mobile?"20px 12px 60px":"36px 24px 80px" }}>

        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:4, marginBottom:28, overflowX:"auto", WebkitOverflowScrolling:"touch", paddingBottom:4 }}>
          <Tab val="all" label="🏆 All Time"/>
          {years.map(y => <Tab key={y} val={String(y)} label={`${y} Season`}/>)}
        </div>

        {/* ── GHOST TOGGLE ── */}
        {cu && cu.role !== "admin" && (
          <div style={{ background:BG2, border:`1px solid ${BORDER2}`, padding:"12px 16px", marginBottom:28, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap", position:"relative" }}>
            <div style={{ position:"absolute", top:0, left:0, bottom:0, width:3, background:cu.leaderboardOptOut?MUTED:ACCENT }}/>
            <div style={{ paddingLeft:8 }}>
              <div style={{ ...MIL, fontWeight:700, fontSize:12, letterSpacing:".18em", color:ACCENT, marginBottom:2 }}>FIELD VISIBILITY</div>
              <div style={{ ...MONO, fontSize:9, color:MUTED }}>{cu.leaderboardOptOut?"🔇 GHOST MODE — HIDDEN FROM RANKINGS":"📡 ACTIVE — VISIBLE ON LEADERBOARD"}</div>
            </div>
            <button className={"btn btn-sm "+(cu.leaderboardOptOut?"btn-primary":"btn-ghost")}
              onClick={() => { updateUser(cu.id, { leaderboardOptOut:!cu.leaderboardOptOut }); showToast("Preference saved"); }}>
              {cu.leaderboardOptOut?"GO ACTIVE":"GO GHOST"}
            </button>
          </div>
        )}

        {board.length === 0 ? (
          <div style={{ textAlign:"center", padding:80, ...MONO, fontSize:9, color:MUTED, letterSpacing:".2em", border:`1px solid ${BORDER}` }}>
            NO OPERATIVES ON RECORD
          </div>
        ) : (<>

          {/* ── PODIUM ── */}
          <div style={{ ...MONO, fontSize:8, letterSpacing:".3em", color:MUTED, marginBottom:16, textAlign:"center" }}>◈ TOP OPERATIVES ◈</div>

          {mobile ? (
            <div style={{ display:"flex", gap:6, alignItems:"flex-end", justifyContent:"center", marginBottom:24 }}>
              <MobilePodiumCard player={podium[1]} rank={2} isMe={cu&&podium[1]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <MobilePodiumCard player={podium[0]} rank={1} isMe={cu&&podium[0]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <MobilePodiumCard player={podium[2]} rank={3} isMe={cu&&podium[2]?.id===cu.id} onPlayerClick={onPlayerClick}/>
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:0, marginBottom:24 }}>
              <PodiumCard player={podium[1]} rank={2} isMe={cu&&podium[1]?.id===cu.id} onPlayerClick={onPlayerClick} topScore={topScore}/>
              <PodiumCard player={podium[0]} rank={1} isMe={cu&&podium[0]?.id===cu.id} onPlayerClick={onPlayerClick} topScore={topScore}/>
              <PodiumCard player={podium[2]} rank={3} isMe={cu&&podium[2]?.id===cu.id} onPlayerClick={onPlayerClick} topScore={topScore}/>
            </div>
          )}

          {/* ── divider ── */}
          <div style={{ display:"flex", alignItems:"center", gap:16, margin:"8px 0 28px", opacity:.4 }}>
            <div style={{ flex:1, height:1, background:`linear-gradient(90deg,transparent,${BORDER2})` }}/>
            <svg width="80" height="14" viewBox="0 0 80 14">
              {[8,22,36].map(cx => <circle key={cx} cx={cx} cy="7" r="4" fill={ACCENT} opacity=".6"/>)}
              {[56,70].map(cx => <circle key={cx} cx={cx} cy="7" r="4" fill={ACCENT} opacity=".6"/>)}
            </svg>
            <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${BORDER2},transparent)` }}/>
          </div>

          {/* ── ROSTER (rank 4+) ── */}
          {listBoard.length > 0 && (<>
            <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:16 }}>
              <div style={{ ...MIL, fontSize:mobile?15:20, fontWeight:900, letterSpacing:".1em", textTransform:"uppercase", color:"#fff" }}>
                ALL <span style={{ color:ACCENT }}>OPERATORS</span>
              </div>
              <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".1em" }}>RANKS 4+</div>
            </div>

            {/* table header */}
            <div style={{ display:"flex", alignItems:"center", gap:mobile?8:12, padding:`6px ${mobile?"10px":"14px"}`, marginBottom:4 }}>
              <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".12em", minWidth:mobile?28:36, flexShrink:0 }}>RANK</div>
              <div style={{ width:mobile?32:38, flexShrink:0 }}/>
              <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".12em", flex:1 }}>OPERATOR</div>
              {!mobile && <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".12em", minWidth:80 }}>PROGRESS</div>}
              <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".12em", textAlign:"right", flexShrink:0, minWidth:60 }}>DEPLOYS</div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:0, border:`1px solid ${BORDER}`, overflow:"hidden" }}>
              {pagePlayers.map((player, i) => {
                const absRank = pageStart + i + 4;
                const isMe = cu && player.id === cu.id;
                const rd = getPlayerRank(player.gamesAttended || 0);
                const rankCol = TIER_COLORS[rd.tier] || MUTED;
                const displayName = player.callsign || player.name;
                const initials = (displayName || "?")[0].toUpperCase();
                const pct = topScore > 0 ? Math.round((player.gamesAttended / topScore) * 100) : 0;
                return (
                  <div key={player.id}
                    onClick={() => player.publicProfile && onPlayerClick?.(player.id)}
                    style={{ display:"flex", alignItems:"center", gap:mobile?8:12, background:isMe?"rgba(200,255,0,.04)":i%2===0?BG2:BG3, borderBottom:`1px solid ${BORDER}`, padding:mobile?"10px":"12px 14px", cursor:player.publicProfile?"pointer":"default", position:"relative", transition:"background .12s" }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(200,255,0,.06)"}
                    onMouseLeave={e => e.currentTarget.style.background=isMe?"rgba(200,255,0,.04)":i%2===0?BG2:BG3}
                  >
                    {/* me indicator */}
                    {isMe && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:ACCENT }}/>}

                    {/* rank */}
                    <div style={{ ...MONO, fontSize:mobile?11:12, color:absRank<=10?ACCENT:MUTED, minWidth:mobile?28:36, flexShrink:0, fontWeight:absRank<=10?"700":"400" }}>#{absRank}</div>

                    {/* avatar */}
                    <div style={{ width:mobile?34:40, height:mobile?34:40, borderRadius:"50%", background:BG3, border:`1px solid ${isMe?"rgba(200,255,0,.5)":BORDER2}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:mobile?12:14, fontWeight:700, color:ACCENT, overflow:"hidden", flexShrink:0, position:"relative", ...MIL }}>
                      {player.profilePic && <img src={player.profilePic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} onError={e=>e.target.style.display="none"}/>}
                      <span style={{ position:"relative", zIndex:1 }}>{initials}</span>
                    </div>

                    {/* name + rank */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                        <span style={{ ...MIL, fontSize:mobile?13:15, fontWeight:700, color:isMe?"#fff":"#c8d4b0", letterSpacing:".04em", textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:mobile?140:220 }}>
                          {displayName}
                        </span>
                        {isMe && <span style={{ ...MONO, fontSize:7, color:ACCENT, background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 5px", flexShrink:0 }}>YOU</span>}
                        {!mobile && player.ukara && <span style={{ ...MONO, fontSize:7, padding:"1px 5px", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7", flexShrink:0 }}>UKARA</span>}
                        {!mobile && player.vipStatus==="active" && <span style={{ ...MONO, fontSize:7, padding:"1px 5px", border:`1px solid ${GOLD}44`, color:GOLD, flexShrink:0 }}>★ VIP</span>}
                        {player.designation && <span style={{ ...MONO, fontSize:7, padding:"1px 5px", border: player.designation==="SITE OWNER"?"1px solid rgba(200,160,0,.5)":"1px solid rgba(79,195,247,.3)", color: player.designation==="SITE OWNER"?"#c8a000":"#4fc3f7", flexShrink:0 }}>{player.designation}</span>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <NationalityFlag code={player.nationality || "GB"} size={mobile?11:13}/>
                        <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={mobile?13:15}/>
                        <span style={{ ...MONO, fontSize:mobile?7:8, color:rankCol, letterSpacing:".06em" }}>{rd.abbr}</span>
                        {!mobile && <span style={{ ...MONO, fontSize:7, color:MUTED }}>· {rd.rank}</span>}
                      </div>
                    </div>

                    {/* progress bar */}
                    {!mobile && (
                      <div style={{ minWidth:80, flexShrink:0 }}>
                        <div style={{ height:3, background:BORDER, borderRadius:2, marginBottom:3 }}>
                          <div style={{ height:3, width:`${pct}%`, background:`linear-gradient(90deg,${MUTED},${ACCENT})`, borderRadius:2, transition:"width .3s" }}/>
                        </div>
                        <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".06em" }}>{pct}%</div>
                      </div>
                    )}

                    {/* score */}
                    <div style={{ textAlign:"right", flexShrink:0, minWidth:60 }}>
                      <div style={{ ...MIL, fontSize:mobile?20:24, fontWeight:700, color:absRank<=3?GOLD:ACCENT, lineHeight:1 }}>{player.gamesAttended}</div>
                      <div style={{ ...MONO, fontSize:6, color:MUTED, letterSpacing:".1em" }}>DEPLOYS</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* pagination */}
            {totalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap", marginTop:16 }}>
                <div style={{ ...MONO, fontSize:8, letterSpacing:".12em", color:MUTED }}>{pageStart+1}–{Math.min(pageStart+PAGE_SIZE,listBoard.length)} of {listBoard.length}</div>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  <button disabled={page===1} onClick={() => setPage(p=>Math.max(1,p-1))} style={{ background:BG2, border:`1px solid ${BORDER}`, color:page===1?BORDER:"#b0c090", ...MONO, fontSize:11, padding:"6px 14px", cursor:page===1?"not-allowed":"pointer" }}>◂</button>
                  {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((item,i,arr) => [
                    i>0&&item-arr[i-1]>1?<span key={"e"+i} style={{ ...MONO, fontSize:10, color:MUTED, padding:"0 4px" }}>…</span>:null,
                    <button key={item} onClick={()=>setPage(item)} style={{ background:item===page?"rgba(200,255,0,.1)":BG2, border:`1px solid ${item===page?"rgba(200,255,0,.4)":BORDER}`, color:item===page?ACCENT:MUTED, ...MONO, fontSize:10, width:32, height:32, cursor:"pointer" }}>{item}</button>
                  ])}
                  <button disabled={page===totalPages} onClick={() => setPage(p=>Math.min(totalPages,p+1))} style={{ background:BG2, border:`1px solid ${BORDER}`, color:page===totalPages?BORDER:"#b0c090", ...MONO, fontSize:11, padding:"6px 14px", cursor:page===totalPages?"not-allowed":"pointer" }}>▸</button>
                </div>
              </div>
            )}
          </>)}
        </>)}

        <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".08em", textAlign:"center", padding:"20px 16px", borderTop:`1px solid ${BORDER}`, marginTop:24, lineHeight:1.8 }}>
          ⊘ Players who opted out are not shown · Rankings update after each game day
        </div>
      </div>
    </div>
  );
}

export { LeaderboardPage };
