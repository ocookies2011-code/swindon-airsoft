// pages/LeaderboardPage.jsx — player leaderboard
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { useMobile, RankInsignia, DesignationInsignia } from "../utils";

function LeaderboardPage({ data, cu, updateUser, showToast, onPlayerClick }) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const board = (data.users || [])
    .filter(u => !u.leaderboardOptOut && u.role === "player")
    .sort((a, b) => b.gamesAttended - a.gamesAttended);

  const listBoard   = board.slice(3); // exclude top 3 — shown in podium
  const totalPages  = Math.max(1, Math.ceil(listBoard.length / PAGE_SIZE));
  const pageStart   = (page - 1) * PAGE_SIZE;
  const pageEnd     = pageStart + PAGE_SIZE;
  const pagePlayers = page === 1 ? listBoard.slice(0, PAGE_SIZE) : listBoard.slice(pageStart, pageEnd);

  // If the logged-in user is on a different page, show which page they're on
  const myRank     = cu ? board.findIndex(p => p.id === cu.id) : -1;
  const myListRank = cu ? listBoard.findIndex(p => p.id === cu.id) : -1;
  const myPage     = myListRank >= 0 ? Math.ceil((myListRank + 1) / PAGE_SIZE) : (myRank >= 0 && myRank < 3 ? 1 : -1);

  const getRankTitle = (i) => {
    if (i === 0) return "FIELD COMMANDER";
    if (i === 1) return "SENIOR OPERATIVE";
    if (i === 2) return "OPERATIVE";
    if (i < 10)  return "RECRUIT";
    return "PRIVATE";
  };
  const getMedalColor = (i) => {
    if (i === 0) return "#c8a000";
    if (i === 1) return "#8a8a8a";
    if (i === 2) return "#8b4513";
    return null;
  };

  const podium = board.slice(0, 3);

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* ── Header ── */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — FIELD RECORDS — ◈</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            COMBAT <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>ROLL</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>▸ RANKED BY FIELD DEPLOYMENTS — DEDICATION, NOT KILLS ◂</div>
          {/* Stats bar */}
          <div style={{ display:"flex", justifyContent:"center", gap:32, marginTop:28, flexWrap:"wrap" }}>
            {[
              ["OPERATIVES", board.length],
              ["TOP DEPLOYMENTS", board[0]?.gamesAttended ?? 0],
              ["YOUR RANK", myRank >= 0 ? `#${myRank + 1}` : "—"],
            ].map(([label, val]) => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, color:"#c8ff00", lineHeight:1 }}>{val}</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10", marginTop:3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px 80px" }}>

        {/* ── Ghost toggle ── */}
        {cu?.role === "player" && (
          <div style={{ background:"#0c1009", border:"1px solid #1e2c0a", padding:"12px 18px", marginBottom:28, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", color:"#c8ff00", marginBottom:2 }}>FIELD VISIBILITY</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010" }}>{cu.leaderboardOptOut ? "STATUS: GHOST — YOUR NAME IS HIDDEN" : "STATUS: ACTIVE — YOUR NAME IS VISIBLE"}</div>
            </div>
            <button className={`btn btn-sm ${cu.leaderboardOptOut ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { updateUser(cu.id, { leaderboardOptOut: !cu.leaderboardOptOut }); showToast("Preference saved"); }}>
              {cu.leaderboardOptOut ? "GO ACTIVE" : "GO GHOST"}
            </button>
          </div>
        )}

        {/* ── Podium — only on page 1 ── */}
        {page === 1 && podium.length >= 1 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#2a3a10", marginBottom:14, textAlign:"center" }}>◈ TOP OPERATIVES ◈</div>
            <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:8 }}>
              {/* Silver — 2nd */}
              {podium[1] && (() => {
                const p = podium[1]; const isMe = cu && p.id === cu.id;
                return (
                  <div onClick={() => p.publicProfile && onPlayerClick && onPlayerClick(p.id)}
                    style={{ flex:1, maxWidth:200, background:"linear-gradient(180deg,#111408 0%,#0c0e08 100%)", border:"1px solid rgba(138,138,138,.3)", padding:"16px 12px 14px", textAlign:"center", cursor:p.publicProfile?"pointer":"default", position:"relative", overflow:"hidden", transition:"border-color .15s" }}
                    onMouseEnter={e=>{ if(p.publicProfile) e.currentTarget.style.borderColor="rgba(138,138,138,.6)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(138,138,138,.3)"; }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#8a8a8a,transparent)" }} />
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", color:"#8a8a8a", marginBottom:8 }}>2ND</div>
                    <div style={{ width:52, height:52, borderRadius:"50%", background:"#0a0c08", border:"2px solid #8a8a8a", margin:"0 auto 10px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:20, fontWeight:700, color:"#8a8a8a", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {p.profilePic ? <img src={p.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.7) grayscale(.3)" }} /> : (p.callsign||p.name)[0]}
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".06em", color:isMe?"#e8f0d8":"#8a8a8a", textTransform:"uppercase", lineHeight:1.2, marginBottom:4 }}>{p.callsign||p.name}</div>
                    {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"var(--accent)", marginBottom:4 }}>← YOU</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#8a8a8a", lineHeight:1 }}>{p.gamesAttended}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".2em", color:"#2a3a10", marginTop:2 }}>DEPLOYMENTS</div>
                    {p.vipStatus==="active" && <div style={{ marginTop:6 }}><span className="tag tag-gold" style={{ fontSize:8 }}>★ VIP</span></div>}
                  </div>
                );
              })()}
              {/* Gold — 1st */}
              {podium[0] && (() => {
                const p = podium[0]; const isMe = cu && p.id === cu.id;
                return (
                  <div onClick={() => p.publicProfile && onPlayerClick && onPlayerClick(p.id)}
                    style={{ flex:1, maxWidth:220, background:"linear-gradient(180deg,#131108 0%,#0c0e08 100%)", border:"1px solid rgba(200,160,0,.45)", padding:"22px 14px 18px", textAlign:"center", cursor:p.publicProfile?"pointer":"default", position:"relative", overflow:"hidden", transition:"border-color .15s", zIndex:2 }}
                    onMouseEnter={e=>{ if(p.publicProfile) e.currentTarget.style.borderColor="rgba(200,160,0,.8)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(200,160,0,.45)"; }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,transparent,#c8a000,transparent)" }} />
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:14, color:"#c8a000", marginBottom:6, filter:"drop-shadow(0 0 6px rgba(200,160,0,.5))" }}>👑</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".25em", color:"#c8a000", marginBottom:10 }}>FIELD COMMANDER</div>
                    <div style={{ width:64, height:64, borderRadius:"50%", background:"#0a0c08", border:"2px solid #c8a000", margin:"0 auto 12px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:24, fontWeight:700, color:"#c8a000", fontFamily:"'Barlow Condensed',sans-serif", boxShadow:"0 0 16px rgba(200,160,0,.2)" }}>
                      {p.profilePic ? <img src={p.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.1) saturate(0.9)" }} /> : (p.callsign||p.name)[0]}
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".07em", color:isMe?"#e8f0d8":"#c8a000", textTransform:"uppercase", lineHeight:1.2, marginBottom:4 }}>{p.callsign||p.name}</div>
                    {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"var(--accent)", marginBottom:4 }}>← YOU</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:34, color:"#c8a000", lineHeight:1, filter:"drop-shadow(0 0 8px rgba(200,160,0,.3))" }}>{p.gamesAttended}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".2em", color:"#2a3a10", marginTop:2 }}>DEPLOYMENTS</div>
                    {p.vipStatus==="active" && <div style={{ marginTop:8 }}><span className="tag tag-gold">★ VIP OPERATIVE</span></div>}
                  </div>
                );
              })()}
              {/* Bronze — 3rd */}
              {podium[2] && (() => {
                const p = podium[2]; const isMe = cu && p.id === cu.id;
                return (
                  <div onClick={() => p.publicProfile && onPlayerClick && onPlayerClick(p.id)}
                    style={{ flex:1, maxWidth:200, background:"linear-gradient(180deg,#111008 0%,#0c0e08 100%)", border:"1px solid rgba(139,69,19,.3)", padding:"16px 12px 14px", textAlign:"center", cursor:p.publicProfile?"pointer":"default", position:"relative", overflow:"hidden", transition:"border-color .15s" }}
                    onMouseEnter={e=>{ if(p.publicProfile) e.currentTarget.style.borderColor="rgba(139,69,19,.6)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(139,69,19,.3)"; }}>
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#8b4513,transparent)" }} />
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", color:"#8b4513", marginBottom:8 }}>3RD</div>
                    <div style={{ width:52, height:52, borderRadius:"50%", background:"#0a0c08", border:"2px solid #8b4513", margin:"0 auto 10px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", fontSize:20, fontWeight:700, color:"#8b4513", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {p.profilePic ? <img src={p.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.7) sepia(.2)" }} /> : (p.callsign||p.name)[0]}
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".06em", color:isMe?"#e8f0d8":"#8b4513", textTransform:"uppercase", lineHeight:1.2, marginBottom:4 }}>{p.callsign||p.name}</div>
                    {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"var(--accent)", marginBottom:4 }}>← YOU</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#8b4513", lineHeight:1 }}>{p.gamesAttended}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".2em", color:"#2a3a10", marginTop:2 }}>DEPLOYMENTS</div>
                    {p.vipStatus==="active" && <div style={{ marginTop:6 }}><span className="tag tag-gold" style={{ fontSize:8 }}>★ VIP</span></div>}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── My rank banner (when not on my page) ── */}
        {cu && myRank >= 0 && myPage > 0 && myPage !== page && (
          <div style={{ background:"rgba(200,255,0,.05)", border:"1px dashed rgba(200,255,0,.3)", padding:"10px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
            <div>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#c8ff00" }}>YOUR POSITION: #{myRank + 1}</span>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", color:"#3a5010", marginLeft:12 }}>PAGE {myPage} OF {totalPages}</span>
            </div>
            <button onClick={() => setPage(myPage)} style={{ background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", padding:"4px 12px", cursor:"pointer" }}>
              JUMP TO MY RANK ▸
            </button>
          </div>
        )}

        {/* ── Table header ── */}
        {board.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"6px 16px", marginBottom:4 }}>
            <div style={{ width:40, fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10", textAlign:"center" }}>#</div>
            <div style={{ width:38, flexShrink:0 }} />
            <div style={{ flex:1, fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10" }}>OPERATIVE</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#2a3a10", textAlign:"right" }}>DEPLOYMENTS</div>
          </div>
        )}

        {board.length === 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>NO COMBAT RECORDS ON FILE</div>
        )}

        {/* ── Player rows ── */}
        {pagePlayers.map((player) => {
          const i = board.indexOf(player);
          const isTop3      = i < 3;
          const medalColor  = getMedalColor(i);
          const rankTitle   = getRankTitle(i);
          const isMe        = cu && player.id === cu.id;
          return (
            <div key={player.id} style={{
              display:"flex", alignItems:"center", gap:14, padding:"11px 16px", marginBottom:2,
              background: isMe ? "rgba(200,255,0,.05)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.04)` : "#0c1009",
              border:`1px solid ${isMe?"rgba(200,255,0,.4)":isTop3?`rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.25)`:"#1a2808"}`,
              position:"relative", overflow:"hidden",
              transition:"border-color .15s, background .15s",
              cursor:player.publicProfile?"pointer":"default",
            }}
              onClick={() => player.publicProfile && onPlayerClick && onPlayerClick(player.id)}
              onMouseEnter={e => {
                if (player.publicProfile) {
                  e.currentTarget.style.borderColor = isMe ? "rgba(200,255,0,.65)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.5)` : "#2a3a10";
                  e.currentTarget.style.background = isMe ? "rgba(200,255,0,.08)" : "#0e1209";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = isMe ? "rgba(200,255,0,.4)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.25)` : "#1a2808";
                e.currentTarget.style.background = isMe ? "rgba(200,255,0,.05)" : isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.04)` : "#0c1009";
              }}
            >
              <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px)", pointerEvents:"none" }} />
              {(isTop3 || isMe) && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:isMe?"var(--accent)":medalColor }} />}
              {/* Rank number */}
              <div style={{ width:40, textAlign:"center", flexShrink:0, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:isTop3?22:16, color:medalColor||"#2a3a10", lineHeight:1 }}>
                {i + 1}
              </div>
              {/* Avatar */}
              <div style={{ width:36, height:36, background:"#0a0c08", border:`1px solid ${isMe?"rgba(200,255,0,.5)":medalColor||"#1a2808"}`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:14, overflow:"hidden", flexShrink:0, color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif" }}>
                {player.profilePic ? <img src={player.profilePic} alt="" onError={e=>{e.target.style.display="none";}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.85)" }} /> : (player.callsign||player.name)[0]}
              </div>
              {/* Name + rank */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".07em", color:isMe?"#e8f0d8":medalColor||"#b0c090", textTransform:"uppercase", lineHeight:1.1 }}>
                    {player.callsign||player.name}
                  </div>
                  {isMe && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".15em", color:"var(--accent)", background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 5px", whiteSpace:"nowrap" }}>← YOU</div>}
                  {player.vipStatus==="active" && <span className="tag tag-gold" style={{ fontSize:8 }}>★ VIP</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3 }}>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".14em", color:isMe?"var(--accent)":medalColor||"#2a3a10" }}>{rankTitle}</div>
                </div>
              </div>
              {/* Deployment count */}
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:isMe?"var(--accent)":medalColor||"#c8ff00", lineHeight:1 }}>{player.gamesAttended}</div>
                {player.publicProfile && onPlayerClick ? (
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".1em", color:"#3a5010", marginTop:3 }}>VIEW FILE ▸</div>
                ) : !player.publicProfile ? (
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, letterSpacing:".1em", color:"#2a2a2a", marginTop:3, display:"flex", alignItems:"center", justifyContent:"flex-end", gap:3 }}>
                    <svg width="7" height="7" viewBox="0 0 12 14" fill="none"><rect x="1" y="6" width="10" height="7" rx="1" stroke="#2a2a2a" strokeWidth="1.5"/><path d="M4 6V4a2 2 0 014 0v2" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round"/></svg>GHOST
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:24, gap:12, flexWrap:"wrap" }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", color:"#2a3a10" }}>
              SHOWING {pageStart + 1}–{Math.min(pageEnd, board.length)} OF {board.length}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ background:"#0c1009", border:"1px solid #1a2808", color:page===1?"#1a2808":"#b0c090", fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".1em", padding:"6px 14px", cursor:page===1?"not-allowed":"pointer", transition:"border-color .15s, color .15s" }}
                onMouseEnter={e=>{ if(page>1){ e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#c8ff00"; }}}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.color=page===1?"#1a2808":"#b0c090"; }}
              >◂ PREV</button>

              {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i-1] > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={"ellipsis"+idx} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3a10", padding:"0 4px" }}>…</span>
                  ) : (
                    <button key={item} onClick={() => setPage(item)} style={{
                      background: item===page ? "rgba(200,255,0,.12)" : "#0c1009",
                      border: `1px solid ${item===page?"rgba(200,255,0,.5)":"#1a2808"}`,
                      color: item===page ? "#c8ff00" : "#556040",
                      fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".05em",
                      width:34, height:30, cursor:"pointer", transition:"all .15s",
                    }}
                      onMouseEnter={e=>{ if(item!==page){ e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#b0c090"; }}}
                      onMouseLeave={e=>{ if(item!==page){ e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.color="#556040"; }}}
                    >{item}</button>
                  )
                )
              }

              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ background:"#0c1009", border:"1px solid #1a2808", color:page===totalPages?"#1a2808":"#b0c090", fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".1em", padding:"6px 14px", cursor:page===totalPages?"not-allowed":"pointer", transition:"border-color .15s, color .15s" }}
                onMouseEnter={e=>{ if(page<totalPages){ e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#c8ff00"; }}}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.color=page===totalPages?"#1a2808":"#b0c090"; }}
              >NEXT ▸</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gallery ───────────────────────────────────────────────

export { LeaderboardPage };
