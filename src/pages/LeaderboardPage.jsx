// pages/LeaderboardPage.jsx
import React, { useState, useMemo } from "react";

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

function AmmoDivider() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16, margin:"24px 0", opacity:.35 }}>
      <div style={{ flex:1, height:1, background:BORDER2 }}/>
      <svg width="80" height="16" viewBox="0 0 80 16">
        {[8,22,36].map(cx => <circle key={cx} cx={cx} cy="8" r="5" fill={ACCENT} opacity=".55"/>)}
        {[56,70].map(cx => <circle key={cx} cx={cx} cy="8" r="5" fill={ACCENT} opacity=".55"/>)}
      </svg>
      <div style={{ flex:1, height:1, background:BORDER2 }}/>
    </div>
  );
}

/* ── Mobile-friendly podium card ── */
function MobilePodiumCard({ player, rank, isMe, onPlayerClick }) {
  if (!player) return null;
  const rd = getPlayerRank(player.gamesAttended || 0);
  const rankCol = TIER_COLORS[rd.tier] || MUTED;
  const medals = { 1:"🥇", 2:"🥈", 3:"🥉" };
  const borders = { 1:GOLD, 2:"#555", 3:"#7a4a1a" };
  const displayName = player.callsign || player.name;
  const initials = (displayName || "?")[0].toUpperCase();
  const avSz = rank === 1 ? 64 : 48;

  return (
    <div
      onClick={() => player.publicProfile && onPlayerClick && onPlayerClick(player.id)}
      style={{
        flex: rank === 1 ? "0 0 40%" : "0 0 28%",
        background: BG2,
        border: `1px solid ${borders[rank]}`,
        borderTop: `${rank===1?3:2}px solid ${borders[rank]}`,
        padding: "12px 8px 10px",
        textAlign: "center",
        cursor: player.publicProfile ? "pointer" : "default",
        position: "relative",
        minWidth: 0,
      }}
    >
      {/* avatar */}
      <div style={{ width:avSz, height:avSz, borderRadius:"50%", background:BG3, border:`2px solid ${borders[rank]}`, margin:"0 auto 8px", display:"flex", alignItems:"center", justifyContent:"center", fontSize: rank===1?22:16, fontWeight:700, color:ACCENT, ...MIL, overflow:"hidden", position:"relative" }}>
        {player.profilePic && <img src={player.profilePic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} onError={e=>e.target.style.display="none"}/>}
        <span style={{ position:"relative", zIndex:1 }}>{initials}</span>
        <div style={{ position:"absolute", top:-6, right:-6, fontSize:rank===1?16:13, zIndex:3 }}>{medals[rank]}</div>
      </div>

      {/* name */}
      <div style={{ ...MIL, fontWeight:700, fontSize:rank===1?13:11, color:rank===1?GOLD:rank===2?"#bbb":"#c97d2a", textTransform:"uppercase", letterSpacing:".04em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:4 }}>
        {displayName}
      </div>
      {isMe && <div style={{ ...MONO, fontSize:7, color:ACCENT, marginBottom:2 }}>← YOU</div>}

      {/* flag + rank */}
      <div style={{ display:"flex", alignItems:"center", gap:3, justifyContent:"center", marginBottom:6 }}>
        <NationalityFlag code={player.nationality || "GB"} size={12}/>
        <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={14}/>
      </div>
      <div style={{ ...MONO, fontSize:7, color:rankCol, letterSpacing:".06em", marginBottom:4 }}>{rd.abbr}</div>

      {/* score */}
      <div style={{ ...MIL, fontSize:rank===1?28:22, fontWeight:700, color:ACCENT, lineHeight:1 }}>
        {player.gamesAttended}
      </div>
      <div style={{ ...MONO, fontSize:6, color:MUTED, letterSpacing:".15em" }}>DEPLOYS</div>

      {/* height bar to simulate podium */}
      <div style={{ height:rank===1?6:rank===2?3:1, background:borders[rank], opacity:.3, marginTop:8 }}/>
    </div>
  );
}

/* ── Desktop podium card (unchanged) ── */
function PodiumCard({ player, rank, isMe, onPlayerClick }) {
  if (!player) return null;
  const rd = getPlayerRank(player.gamesAttended || 0);
  const rankCol = TIER_COLORS[rd.tier] || MUTED;
  const widths   = { 1:240, 2:200, 3:180 };
  const avSizes  = { 1:84,  2:68,  3:58  };
  const scoreSz  = { 1:52,  2:40,  3:32  };
  const medals   = { 1:"🥇", 2:"🥈", 3:"🥉" };
  const borders  = { 1:GOLD, 2:"#555", 3:"#7a4a1a" };
  const displayName = player.callsign || player.name;
  const initials = (displayName || "?")[0].toUpperCase();
  const avSz = avSizes[rank];

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:widths[rank], zIndex:rank===1?3:rank===2?2:1 }}>
      <div
        onClick={() => player.publicProfile && onPlayerClick && onPlayerClick(player.id)}
        style={{ width:"100%", background:BG2, border:`1px solid ${borders[rank]}`, borderTop:`${rank===1?3:2}px solid ${borders[rank]}`, padding:(rank===1?22:18)+"px 14px "+(rank===1?18:14)+"px", textAlign:"center", position:"relative", overflow:"hidden", cursor:player.publicProfile?"pointer":"default", transition:"transform .15s" }}
        onMouseEnter={e => e.currentTarget.style.transform="translateY(-4px)"}
        onMouseLeave={e => e.currentTarget.style.transform=""}
      >
        <div style={{ width:avSz, height:avSz, borderRadius:"50%", background:BG3, border:`${rank===1?3:2}px solid ${borders[rank]}`, margin:"0 auto 10px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:rank===1?28:22, fontWeight:700, color:ACCENT, ...MIL, overflow:"hidden", position:"relative" }}>
          {player.profilePic && <img src={player.profilePic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} onError={e=>e.target.style.display="none"}/>}
          <span style={{ position:"relative", zIndex:1 }}>{initials}</span>
          <div style={{ position:"absolute", top:-8, right:-8, fontSize:rank===1?20:16, zIndex:3 }}>{medals[rank]}</div>
        </div>
        {rank===1 && <div style={{ fontSize:20, marginBottom:4 }}>👑</div>}
        <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", marginBottom:6 }}>
          <NationalityFlag code={player.nationality || "GB"} size={18}/>
          <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={20}/>
          <span style={{ ...MONO, fontSize:7, color:rankCol, letterSpacing:".1em" }}>{rd.abbr}</span>
        </div>
        <div style={{ ...MIL, fontWeight:700, fontSize:rank===1?18:rank===2?15:13, letterSpacing:".05em", color:rank===1?GOLD:rank===2?"#bbb":"#c97d2a", textTransform:"uppercase", marginBottom:4 }}>
          {displayName}
        </div>
        {isMe && <div style={{ ...MONO, fontSize:7, color:ACCENT, marginBottom:4 }}>← YOU</div>}
        <div style={{ ...MIL, fontSize:scoreSz[rank], fontWeight:700, color:ACCENT, lineHeight:1, marginTop:8 }}>{player.gamesAttended}</div>
        <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".2em", marginTop:3 }}>DEPLOYMENTS</div>
        <div style={{ display:"flex", gap:4, justifyContent:"center", marginTop:8, flexWrap:"wrap" }}>
          {player.ukara && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 6px", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7" }}>UKARA</span>}
          {player.vipStatus==="active" && <span style={{ ...MONO, fontSize:7, letterSpacing:".1em", padding:"2px 6px", border:"1px solid rgba(212,160,23,.3)", color:GOLD }}>★ VIP</span>}
        </div>
      </div>
      {/* podium block */}
      <div style={{ width:"100%", height:rank===1?80:rank===2?50:34, background:`linear-gradient(180deg,${BG3},${BG})`, border:`1px solid ${borders[rank]}`, borderTop:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ ...MIL, fontSize:rank===1?44:rank===2?32:24, fontWeight:700, color:"rgba(255,255,255,.06)" }}>{rank}</span>
      </div>
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

  const podium     = board.slice(0, 3);
  const listBoard  = board.slice(3);
  const totalPages = Math.max(1, Math.ceil(listBoard.length / PAGE_SIZE));
  const pageStart  = (page - 1) * PAGE_SIZE;
  const pagePlayers = listBoard.slice(pageStart, pageStart + PAGE_SIZE);
  const myRank     = cu ? board.findIndex(p => p.id === cu.id) : -1;

  const Tab = ({ val, label }) => (
    <button onClick={() => { setYearTab(val); setPage(1); }}
      style={{ ...MIL, fontSize:11, fontWeight:600, letterSpacing:".12em", textTransform:"uppercase", padding:"7px 14px", cursor:"pointer", border:"none", background:yearTab===val?"#172010":BG3, color:yearTab===val?ACCENT:MUTED, borderBottom:"2px solid "+(yearTab===val?ACCENT:"transparent"), transition:"all .12s", flexShrink:0 }}>
      {label}
    </button>
  );

  return (
    <div style={{ background:BG, minHeight:"100vh", overflowX:"hidden" }}>

      {/* ── HERO — mobile-friendly ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1a05,#080b06)", borderBottom:"2px solid "+BORDER2, padding:mobile?"32px 16px 28px":"56px 24px 48px", textAlign:"center" }}>
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".2em", textTransform:"uppercase", marginBottom:10 }}>◈ SWINDON AIRSOFT · SEASON RANKINGS</div>
          <div style={{ ...MIL, fontWeight:700, fontSize:mobile?"clamp(32px,10vw,48px)":"clamp(44px,8vw,84px)", textTransform:"uppercase", letterSpacing:".06em", color:"#fff", lineHeight:.9, marginBottom:10 }}>
            OPERATOR <span style={{ color:ACCENT }}>RANKINGS</span>
          </div>
          <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".15em", textTransform:"uppercase", marginBottom:20 }}>◆ RANKED BY CONFIRMED DEPLOYMENTS ◆</div>
          <div style={{ display:"flex", justifyContent:"center", gap:mobile?8:10, flexWrap:"wrap" }}>
            {[
              { val:board.length, label:"Operatives", hi:false },
              { val:board[0]?.gamesAttended??0, label:"Top Score", hi:true },
              { val:myRank>=0?`#${myRank+1}`:"—", label:"Your Rank", hi:true },
            ].map(s => (
              <div key={s.label} style={{ background:BG2, border:"1px solid "+BORDER, padding:mobile?"10px 14px":"12px 20px", minWidth:mobile?72:100, textAlign:"center", position:"relative" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:s.hi?ACCENT:BORDER2 }}/>
                <div style={{ ...MIL, fontSize:mobile?20:26, fontWeight:700, color:"#fff" }}>{s.val}</div>
                <div style={{ ...MONO, fontSize:7, color:MUTED, letterSpacing:".12em", textTransform:"uppercase", marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:"0 auto", padding:mobile?"20px 12px 60px":"36px 20px 80px" }}>

        {/* ── YEAR TABS ── */}
        <div style={{ display:"flex", gap:2, marginBottom:24, overflowX:"auto", WebkitOverflowScrolling:"touch", paddingBottom:4 }}>
          <Tab val="all" label="🏆 All Time"/>
          {years.map(y => <Tab key={y} val={String(y)} label={y+" Season"}/>)}
        </div>

        {/* ── GHOST TOGGLE ── */}
        {cu && cu.role !== "admin" && (
          <div style={{ background:BG2, border:"1px solid "+BORDER2, padding:"10px 14px", marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <div>
              <div style={{ ...MIL, fontWeight:700, fontSize:11, letterSpacing:".18em", color:ACCENT, marginBottom:2 }}>FIELD VISIBILITY</div>
              <div style={{ ...MONO, fontSize:9, color:MUTED }}>{cu.leaderboardOptOut?"GHOST — HIDDEN":"ACTIVE — VISIBLE"}</div>
            </div>
            <button className={"btn btn-sm "+(cu.leaderboardOptOut?"btn-primary":"btn-ghost")}
              onClick={() => { updateUser(cu.id, { leaderboardOptOut:!cu.leaderboardOptOut }); showToast("Preference saved"); }}>
              {cu.leaderboardOptOut?"GO ACTIVE":"GO GHOST"}
            </button>
          </div>
        )}

        {board.length === 0 ? (
          <div style={{ textAlign:"center", padding:60, ...MONO, fontSize:9, color:MUTED, letterSpacing:".2em" }}>NO OPERATIVES ON RECORD</div>
        ) : (<>

          {/* ── PODIUM ── */}
          <div style={{ ...MONO, fontSize:8, letterSpacing:".25em", color:MUTED, marginBottom:14, textAlign:"center" }}>◈ TOP OPERATIVES ◈</div>

          {mobile ? (
            /* Mobile podium: side by side, rank 2 | rank 1 | rank 3 */
            <div style={{ display:"flex", gap:6, alignItems:"flex-end", justifyContent:"center", marginBottom:8 }}>
              <MobilePodiumCard player={podium[1]} rank={2} isMe={cu&&podium[1]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <MobilePodiumCard player={podium[0]} rank={1} isMe={cu&&podium[0]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <MobilePodiumCard player={podium[2]} rank={3} isMe={cu&&podium[2]?.id===cu.id} onPlayerClick={onPlayerClick}/>
            </div>
          ) : (
            /* Desktop podium */
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:0, marginBottom:8 }}>
              <PodiumCard player={podium[1]} rank={2} isMe={cu&&podium[1]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <PodiumCard player={podium[0]} rank={1} isMe={cu&&podium[0]?.id===cu.id} onPlayerClick={onPlayerClick}/>
              <PodiumCard player={podium[2]} rank={3} isMe={cu&&podium[2]?.id===cu.id} onPlayerClick={onPlayerClick}/>
            </div>
          )}

          <AmmoDivider/>

          {/* ── ROSTER (rank 4+) ── */}
          {listBoard.length > 0 && (<>
            <div style={{ ...MIL, fontSize:mobile?14:18, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:"#fff", marginBottom:12 }}>
              ALL <span style={{ color:ACCENT }}>OPERATORS</span>
              <span style={{ ...MONO, fontSize:9, color:MUTED, marginLeft:12, letterSpacing:".1em", fontWeight:400 }}>RANKS 4+</span>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:24 }}>
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
                    style={{ display:"flex", alignItems:"center", gap:mobile?8:12, background:BG2, border:"1px solid "+(isMe?"rgba(200,255,0,.3)":BORDER), padding:mobile?"8px 10px":"10px 14px", cursor:player.publicProfile?"pointer":"default", position:"relative", overflow:"hidden" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor=BORDER2; e.currentTarget.style.background=BG3; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor=isMe?"rgba(200,255,0,.3)":BORDER; e.currentTarget.style.background=BG2; }}
                  >
                    <div style={{ position:"absolute", left:0, top:0, bottom:0, width:2, background:isMe?ACCENT:"transparent" }}/>

                    {/* rank number */}
                    <div style={{ ...MONO, fontSize:mobile?11:12, color:MUTED, minWidth:mobile?28:36, flexShrink:0 }}>#{absRank}</div>

                    {/* avatar */}
                    <div style={{ width:mobile?32:38, height:mobile?32:38, borderRadius:"50%", background:BG3, border:"1px solid "+(isMe?"rgba(200,255,0,.4)":BORDER2), display:"flex", alignItems:"center", justifyContent:"center", fontSize:mobile?11:13, fontWeight:700, color:ACCENT, overflow:"hidden", flexShrink:0, position:"relative", ...MIL }}>
                      {player.profilePic && <img src={player.profilePic} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} onError={e=>e.target.style.display="none"}/>}
                      <span style={{ position:"relative", zIndex:1 }}>{initials}</span>
                    </div>

                    {/* name + rank */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ ...MIL, fontSize:mobile?13:14, fontWeight:700, color:isMe?"#fff":"#c8d4b0", letterSpacing:".04em", textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {displayName}
                        {isMe && <span style={{ ...MONO, fontSize:7, color:ACCENT, background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 4px", marginLeft:6 }}>YOU</span>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                        <NationalityFlag code={player.nationality || "GB"} size={mobile?11:14}/>
                        <RankInsigniaIcon pip={rd.pip} tier={rd.tier} size={mobile?13:16}/>
                        <span style={{ ...MONO, fontSize:mobile?7:8, color:rankCol, letterSpacing:".06em" }}>{rd.abbr}</span>
                        {!mobile && <span style={{ ...MONO, fontSize:7, color:MUTED }}>· {rd.rank}</span>}
                      </div>
                    </div>

                    {/* badges — hidden on mobile to save space */}
                    {!mobile && (
                      <div style={{ display:"flex", gap:4, alignItems:"center", flexShrink:0 }}>
                        {player.ukara && <span style={{ ...MONO, fontSize:7, padding:"2px 5px", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7" }}>UKARA</span>}
                        {player.vipStatus==="active" && <span style={{ ...MONO, fontSize:7, padding:"2px 5px", border:"1px solid rgba(212,160,23,.3)", color:GOLD }}>VIP</span>}
                      </div>
                    )}

                    {/* score */}
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ ...MIL, fontSize:mobile?18:22, fontWeight:700, color:ACCENT }}>{player.gamesAttended}</div>
                      <div style={{ ...MONO, fontSize:6, color:MUTED, letterSpacing:".1em" }}>DEPLOYS</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* pagination */}
            {totalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
                <div style={{ ...MONO, fontSize:8, letterSpacing:".12em", color:MUTED }}>{pageStart+1}–{Math.min(pageStart+PAGE_SIZE,listBoard.length)} of {listBoard.length}</div>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  <button disabled={page===1} onClick={() => setPage(p=>Math.max(1,p-1))} style={{ background:BG2, border:"1px solid "+BORDER, color:page===1?BORDER:"#b0c090", ...MONO, fontSize:10, letterSpacing:".08em", padding:"6px 12px", cursor:page===1?"not-allowed":"pointer" }}>◂</button>
                  {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((item,i,arr) => [
                    i>0&&item-arr[i-1]>1?<span key={"e"+i} style={{ ...MONO, fontSize:10, color:MUTED, padding:"0 2px" }}>…</span>:null,
                    <button key={item} onClick={()=>setPage(item)} style={{ background:item===page?"rgba(200,255,0,.1)":BG2, border:"1px solid "+(item===page?"rgba(200,255,0,.4)":BORDER), color:item===page?ACCENT:MUTED, ...MONO, fontSize:10, width:30, height:30, cursor:"pointer" }}>{item}</button>
                  ])}
                  <button disabled={page===totalPages} onClick={() => setPage(p=>Math.min(totalPages,p+1))} style={{ background:BG2, border:"1px solid "+BORDER, color:page===totalPages?BORDER:"#b0c090", ...MONO, fontSize:10, letterSpacing:".08em", padding:"6px 12px", cursor:page===totalPages?"not-allowed":"pointer" }}>▸</button>
                </div>
              </div>
            )}
          </>)}
        </>)}

        <div style={{ ...MONO, fontSize:8, color:MUTED, letterSpacing:".08em", textAlign:"center", padding:"16px", borderTop:"1px solid "+BORDER, marginTop:20, lineHeight:1.8 }}>
          ⊘ Players who opted out are not shown · Rankings update after each game day
        </div>
      </div>
    </div>
  );
}

export { LeaderboardPage };
