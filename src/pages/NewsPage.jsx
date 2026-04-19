// pages/NewsPage.jsx — public news & updates feed
import React, { useState } from "react";

const MIL  = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };
const ACCENT = "#c8ff00";
const BG2 = "#0d1209"; const BG3 = "#111a0a";
const BORDER = "#1e2e12"; const BORDER2 = "#2a4018";
const MUTED = "#5a6e42";

const CAT_CONFIG = {
  update:    { label:"UPDATE",    color:"#4fc3f7", bg:"rgba(79,195,247,.08)" },
  event:     { label:"EVENT",     color:ACCENT,    bg:"rgba(200,255,0,.08)"  },
  safety:    { label:"SAFETY",    color:"#ef5350", bg:"rgba(239,83,80,.08)"  },
  community: { label:"COMMUNITY", color:"#d4a017", bg:"rgba(212,160,23,.08)" },
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
}

function NewsCard({ post, full, onClick }) {
  const cat = CAT_CONFIG[post.category] || CAT_CONFIG.update;
  return (
    <div onClick={onClick}
      style={{ background:BG2, border:`1px solid ${BORDER}`, position:"relative", overflow:"hidden",
        cursor:onClick?"pointer":"default", transition:"border-color .15s",
        ...(post.pinned ? { borderColor:BORDER2, boxShadow:"0 0 20px rgba(200,255,0,.04)" } : {}) }}
      onMouseEnter={e => { if(onClick) e.currentTarget.style.borderColor = BORDER2; }}
      onMouseLeave={e => { if(onClick) e.currentTarget.style.borderColor = post.pinned?BORDER2:BORDER; }}
    >
      {/* Top accent */}
      <div style={{ height:2, background:`linear-gradient(90deg,${cat.color},transparent)` }}/>
      {/* Banner image */}
      {post.image && (
        <div style={{ height:full?240:160, overflow:"hidden", background:BG3 }}>
          <img src={post.image} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", opacity:.85 }}/>
        </div>
      )}
      <div style={{ padding:"18px 20px" }}>
        {/* Meta row */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
          {post.pinned && <span style={{ ...MONO, fontSize:8, letterSpacing:".2em", color:ACCENT, border:`1px solid rgba(200,255,0,.3)`, padding:"2px 8px" }}>📌 PINNED</span>}
          <span style={{ ...MONO, fontSize:8, letterSpacing:".15em", color:cat.color, background:cat.bg, border:`1px solid ${cat.color}33`, padding:"2px 8px" }}>{cat.label}</span>
          <span style={{ ...MONO, fontSize:9, color:MUTED }}>{fmtDate(post.created_at)}</span>
          <span style={{ ...MONO, fontSize:9, color:MUTED, marginLeft:"auto" }}>— {post.author_name}</span>
        </div>
        {/* Title */}
        <div style={{ ...MIL, fontSize:full?22:18, fontWeight:700, letterSpacing:".05em", color:"#fff", textTransform:"uppercase", lineHeight:1.1, marginBottom:10 }}>
          {post.title}
        </div>
        {/* Body */}
        <div style={{ fontSize:14, color:"#8aaa60", lineHeight:1.75,
          ...(full ? {} : { display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", overflow:"hidden" }) }}>
          {post.body}
        </div>
        {!full && onClick && (
          <div style={{ ...MONO, fontSize:9, color:ACCENT, letterSpacing:".12em", marginTop:12 }}>READ MORE ▸</div>
        )}
      </div>
    </div>
  );
}

export function NewsPage({ data }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const news = (data.news || []);
  const filtered = filter === "all" ? news : news.filter(p => p.category === filter);

  if (selected) {
    const post = news.find(p => p.id === selected);
    if (!post) { setSelected(null); return null; }
    return (
      <div className="page-content-sm" style={{ paddingTop:32 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom:20 }} onClick={() => setSelected(null)}>← Back to News</button>
        <NewsCard post={post} full/>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <div style={{ background:"linear-gradient(180deg,#0c1a05,#080b06)", borderBottom:`1px solid ${BORDER2}`, padding:"40px 24px 32px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px),repeating-linear-gradient(90deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px)", pointerEvents:"none" }}/>
        <div style={{ maxWidth:800, margin:"0 auto", position:"relative", zIndex:1, textAlign:"center" }}>
          <div style={{ ...MONO, fontSize:9, color:MUTED, letterSpacing:".3em", marginBottom:14 }}>◈ SWINDON AIRSOFT · INTEL FEED</div>
          <div style={{ ...MIL, fontSize:"clamp(32px,6vw,56px)", fontWeight:700, color:"#fff", textTransform:"uppercase", letterSpacing:".1em", lineHeight:.9, marginBottom:10 }}>
            NEWS & <span style={{ color:ACCENT }}>UPDATES</span>
          </div>
          <div style={{ ...MONO, fontSize:10, color:MUTED, letterSpacing:".2em" }}>◆ LATEST INTEL FROM FIELD COMMAND ◆</div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth:900 }}>
        {/* Filter tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:28, flexWrap:"wrap" }}>
          {[["all","ALL"],["update","UPDATES"],["event","EVENTS"],["safety","SAFETY"],["community","COMMUNITY"]].map(([val,label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ ...MIL, fontSize:11, fontWeight:600, letterSpacing:".14em", textTransform:"uppercase", padding:"7px 16px", cursor:"pointer", border:"none",
                background: filter===val ? BG3 : "transparent",
                color: filter===val ? ACCENT : MUTED,
                borderBottom:`2px solid ${filter===val?ACCENT:"transparent"}`,
                clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)",
                transition:"all .12s" }}>
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:80, ...MONO, fontSize:10, color:MUTED, letterSpacing:".2em" }}>NO POSTS IN THIS CATEGORY</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
            {filtered.map(post => (
              <NewsCard key={post.id} post={post} onClick={() => setSelected(post.id)}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
