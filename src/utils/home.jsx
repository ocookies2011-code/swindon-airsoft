// utils/home.jsx — HomePage, CountdownPanel — MILITARY THEME
import React, { useEffect, useState } from "react";
import { useMobile } from "./hooks";
import { fmtDate } from "./helpers";
import { SA_LOGO_SRC } from "../assets/logoImage";

function HomePage({ data, setPage, onProductClick }) {
  const isMobile = useMobile(700);
  const now = new Date();

  const nextEvent = data.events
    .filter(e => e.published && new Date(e.date + "T" + e.time) > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const upcomingEvents = data.events.filter(e => e.published && new Date(e.date + "T" + (e.time || "23:59")) > now);
  const totalPlayers  = data.users.filter(u => u.role === "player").length;
  const totalEvents   = upcomingEvents.length;
  const totalBookings = upcomingEvents.flatMap(e => e.bookings).reduce((s, b) => s + (b.qty || 1), 0);

  // ── Shared style tokens ──
  const MIL = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
  const MONO = { fontFamily:"'Share Tech Mono',monospace" };
  const CLIP_CARD = { clipPath:"polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))" };
  const CLIP_CARD_SM = { clipPath:"polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)" };
  const CLIP_BTN = { clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)" };
  const BG = "#080b06";
  const BG2 = "#0d1209";
  const BG3 = "#111a0a";
  const BORDER = "#1e2e12";
  const BORDER2 = "#2a4018";
  const MUTED = "#5a6e42";
  const TEXT = "#c8d4b0";
  const ACCENT = "#c8ff00";

  return (
    <div style={{ background: BG }}>

      {/* ── SITE MESSAGES ── */}
      {Array.isArray(data.homeMsg) && data.homeMsg.length > 0 && (
        <div style={{ borderBottom:`1px solid ${BORDER}` }}>
          {data.homeMsg.map((msg, i) => (
            <div key={i} style={{
              background: msg.bg || "rgba(200,255,0,.04)",
              color: msg.color || ACCENT,
              borderLeft: `3px solid ${msg.color || ACCENT}`,
              padding: "11px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              ...MIL,
              fontSize: 13,
              letterSpacing: ".06em",
              borderBottom: i < data.homeMsg.length - 1 ? "1px solid " + BORDER : "none",
            }}>
              {msg.icon && <span style={{ fontSize:16, flexShrink:0 }}>{msg.icon}</span>}
              <span>{msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── HERO ── */}
      <section style={{ position:"relative", overflow:"hidden", padding: isMobile ? "48px 20px 52px" : "80px 24px 72px", borderBottom:`1px solid ${BORDER2}` }}>
        {/* Grid overlay */}
        <div style={{ position:"absolute", inset:0, backgroundImage:`repeating-linear-gradient(0deg,transparent,transparent 48px,rgba(200,255,0,.014) 48px,rgba(200,255,0,.014) 49px),repeating-linear-gradient(90deg,transparent,transparent 48px,rgba(200,255,0,.014) 48px,rgba(200,255,0,.014) 49px)`, pointerEvents:"none" }} />
        {/* Radial accent glow */}
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 65% 50%,rgba(200,255,0,.04) 0%,transparent 55%)", pointerEvents:"none" }} />
        {/* Corner brackets */}
        {[["top","left"],["top","right"],["bottom","left"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:20, height:20, zIndex:2,
            top:v==="top"?16:"auto", bottom:v==="bottom"?16:"auto",
            left:h==="left"?16:"auto", right:h==="right"?16:"auto",
            borderTop:v==="top"?"1px solid rgba(200,255,0,.4)":"none",
            borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.4)":"none",
            borderLeft:h==="left"?"1px solid rgba(200,255,0,.4)":"none",
            borderRight:h==="right"?"1px solid rgba(200,255,0,.4)":"none",
          }} />
        ))}
        {/* Watermark logo */}
        {!isMobile && (
          <img src={SA_LOGO_SRC} alt="" style={{ position:"absolute", right:"4%", top:"50%", transform:"translateY(-50%)", height:260, width:"auto", objectFit:"contain", opacity:.05, filter:"saturate(0) brightness(10)", pointerEvents:"none", zIndex:0 }} />
        )}

        <div style={{ maxWidth:1200, margin:"0 auto", position:"relative", zIndex:1 }}>
          {/* Classification badge */}
          <div style={{ ...MONO, fontSize:9, color:"#cc2222", letterSpacing:".3em", border:"1px solid rgba(204,34,34,.3)", display:"inline-block", padding:"4px 12px", marginBottom:20, background:"rgba(204,34,34,.04)", textTransform:"uppercase" }}>
            ◈ CLASSIFIED · WILTSHIRE SECTOR COMMAND
          </div>

          {/* Title — smaller as requested */}
          <div style={{ ...MIL, fontSize: isMobile ? 42 : 68, fontWeight:700, lineHeight:.88, textTransform:"uppercase", letterSpacing:".04em", color:"#fff", marginBottom:8 }}>
            <span style={{ display:"block", ...MIL, fontSize: isMobile ? 14 : 20, fontWeight:400, color:"rgba(255,255,255,.2)", letterSpacing:".18em", marginBottom:6 }}>Swindon</span>
            AIRSOFT <span style={{ color: ACCENT }}>HQ</span>
          </div>

          <div style={{ ...MONO, fontSize:10, color: MUTED, letterSpacing:".2em", textTransform:"uppercase", marginBottom:6 }}>
            ◆ Wiltshire's Premier Airsoft Field ◆
          </div>
          <div style={{ ...MONO, fontSize:9, color:"#4a5e2a", letterSpacing:".15em", marginBottom:32 }}>
            ESTABLISHED 2018 &nbsp;·&nbsp; SN1 &nbsp;·&nbsp; UK SITE SAFE APPROVED
          </div>

          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            <button style={{ ...MIL, ...CLIP_BTN, background: ACCENT, color:"#000", border:"none", fontSize:14, fontWeight:600, letterSpacing:".14em", padding:"12px 30px", textTransform:"uppercase", cursor:"pointer", transition:"background .15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="#d8ff20"}
              onMouseLeave={e=>e.currentTarget.style.background=ACCENT}
              onClick={() => setPage("events")}>▸ Book Your Deployment</button>
            <button style={{ ...MIL, ...CLIP_BTN, background:"transparent", color: ACCENT, border:`1px solid ${BORDER2}`, fontSize:14, fontWeight:600, letterSpacing:".14em", padding:"12px 26px", textTransform:"uppercase", cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=ACCENT;e.currentTarget.style.background="rgba(200,255,0,.05)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER2;e.currentTarget.style.background="transparent";}}
              onClick={() => setPage("vip")}>Become VIP →</button>
          </div>
        </div>

        {/* GPS coords */}
        <div style={{ position:"absolute", bottom:16, right:20, ...MONO, fontSize:9, color:"#4a5e2a", letterSpacing:".15em", zIndex:1 }}>
          51°3247N · 1°4732W · ELEV 132M
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ background:"#040604", borderBottom:`1px solid ${BORDER2}`, padding:"18px 24px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap:10 }}>
          {[
            { val: totalPlayers || "—", label:"Active Operatives", accent:false },
            { val: totalEvents  || "—", label:"Scheduled Ops",     accent:false },
            { val: totalBookings|| "—", label:"Confirmed Boots",   accent:false },
            { val: "10%",               label:"VIP Discount",      accent:true  },
          ].map(s => (
            <div key={s.label} style={{ background: BG2, border:`1px solid ${BORDER}`, padding:"14px 18px", position:"relative", ...CLIP_CARD_SM }}>
              <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background: s.accent ? "#d4a017" : ACCENT }} />
              <div style={{ ...MIL, fontSize:26, fontWeight:700, color:"#fff", lineHeight:1 }}>{s.val}</div>
              <div style={{ ...MONO, fontSize:9, color: MUTED, letterSpacing:".18em", textTransform:"uppercase", marginTop:5 }}>▸ {s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MISSION COUNTDOWN ── */}
      {nextEvent && (() => {
        const target = nextEvent.date + "T" + nextEvent.time + ":00";
        const booked = nextEvent.bookings.reduce((s,b) => s + b.qty, 0);
        const total = nextEvent.walkOnSlots + nextEvent.rentalSlots;
        const spotsLeft = Math.max(0, total - booked);
        return (
          <div style={{ background: BG, borderBottom:`1px solid ${BORDER2}`, padding:"24px" }}>
            <div style={{ maxWidth:1200, margin:"0 auto", display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.5fr", gap:12 }}>
              {/* Countdown */}
              <div style={{ background: BG2, border:`1px solid ${BORDER2}`, padding:"24px", position:"relative", ...CLIP_CARD }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${ACCENT},transparent)` }} />
                <div style={{ ...MONO, fontSize:9, color: MUTED, letterSpacing:".25em", textTransform:"uppercase", marginBottom:16 }}>◈ Time to next operation</div>
                <div style={{ ...MIL, fontSize:18, fontWeight:700, color:"#fff", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>{nextEvent.title}</div>
                <div style={{ display:"flex", gap:4, alignItems:"center", marginBottom:24 }}>
                  {[["DAYS",null],[":",null],["HRS",null],[":",null],["MIN",null],[":",null],["SEC",null]].map((_, idx) => {
                    if (idx % 2 === 1) return <div key={idx} style={{ ...MIL, fontSize:22, color: BORDER2, padding:"0 2px", alignSelf:"flex-start", marginTop:6 }}>:</div>;
                    const labels = ["DAYS","HRS","MIN","SEC"];
                    const l = labels[Math.floor(idx/2)];
                    return (
                      <div key={idx} style={{ background: BG, border:`1px solid ${BORDER2}`, padding:"10px 14px", textAlign:"center", minWidth:58, ...CLIP_CARD_SM }}>
                        <CountdownUnit target={target} unit={l} />
                        <div style={{ ...MONO, fontSize:8, color: MUTED, letterSpacing:".2em", textTransform:"uppercase", marginTop:3 }}>{l}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ ...MIL, ...CLIP_BTN, background: ACCENT, color:"#000", border:"none", fontSize:12, fontWeight:600, letterSpacing:".14em", padding:"9px 20px", textTransform:"uppercase", cursor:"pointer" }}
                    onClick={() => setPage("events")}>▸ Book — £{Math.min(nextEvent.walkOnPrice, nextEvent.rentalPrice)}</button>
                  <button style={{ ...MIL, ...CLIP_BTN, background:"transparent", color: ACCENT, border:`1px solid ${BORDER2}`, fontSize:12, fontWeight:600, letterSpacing:".14em", padding:"9px 18px", textTransform:"uppercase", cursor:"pointer" }}
                    onClick={() => setPage("events")}>Details</button>
                </div>
              </div>

              {/* Mission brief */}
              <div style={{ background: BG2, border:`1px solid ${BORDER}`, padding:"24px", position:"relative", ...CLIP_CARD }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${ACCENT},transparent)` }} />
                <div style={{ ...MONO, fontSize:9, color: MUTED, letterSpacing:".22em", textTransform:"uppercase", marginBottom:20 }}>// Mission Brief</div>
                <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                  {[
                    { icon:"📅", title: fmtDate(nextEvent.date), sub:"DEPART " + nextEvent.time + " HRS GMT" + (nextEvent.endTime ? " · ENDEX " + nextEvent.endTime + " HRS" : "") },
                    { icon:"📍", title: nextEvent.location, sub:"WILTSHIRE SECTOR" },
                    { icon:"👥", title: `${spotsLeft} slots remaining`, sub:`${booked} of ${total} confirmed` },
                  ].map((row, i) => (
                    <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start", padding:"14px 0", borderBottom: i < 2 ? "1px solid " + BORDER : "none" }}>
                      <div style={{ fontSize:18, flexShrink:0, marginTop:2 }}>{row.icon}</div>
                      <div>
                        <div style={{ ...MIL, fontSize:16, fontWeight:700, color:"#fff", textTransform:"uppercase", letterSpacing:".07em" }}>{row.title}</div>
                        <div style={{ ...MONO, fontSize:9, color: MUTED, marginTop:3, letterSpacing:".12em" }}>{row.sub}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:20, paddingTop:14 }}>
                    <div>
                      <div style={{ ...MIL, fontSize:20, fontWeight:700, color: ACCENT }}>£{nextEvent.walkOnPrice}</div>
                      <div style={{ ...MONO, fontSize:8, color: MUTED, letterSpacing:".12em" }}>WALK-ON</div>
                    </div>
                    <div>
                      <div style={{ ...MIL, fontSize:20, fontWeight:700, color: ACCENT }}>£{nextEvent.rentalPrice}</div>
                      <div style={{ ...MONO, fontSize:8, color: MUTED, letterSpacing:".12em" }}>RENTAL KIT</div>
                    </div>
                    {nextEvent.vipOnly && (
                      <div style={{ alignSelf:"flex-end", ...MONO, fontSize:9, color:"#d4a017", letterSpacing:".12em", border:"1px solid rgba(212,160,23,.3)", padding:"3px 8px", ...CLIP_CARD_SM, background:"rgba(212,160,23,.06)" }}>★ VIP ONLY</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── FEATURE STRIP ── */}
      <div style={{ background:"#040604", borderBottom:`3px solid ${ACCENT}` }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", maxWidth:1200, margin:"0 auto" }}>
          {[
            { svg:<svg width="28" height="28" viewBox="0 0 32 32" fill="none"><path d="M16 2L4 7v9c0 7 5.4 13.5 12 15 6.6-1.5 12-8 12-15V7L16 2z" stroke={ACCENT} strokeWidth="1.5"/><path d="M11 16l3 3 7-7" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round"/></svg>, title:"SAFETY FIRST", desc:"Full briefings, quality kit, experienced marshals on every game day." },
            { svg:<svg width="28" height="28" viewBox="0 0 32 32" fill="none"><circle cx="12" cy="10" r="4" stroke={ACCENT} strokeWidth="1.5"/><circle cx="22" cy="10" r="4" stroke={ACCENT} strokeWidth="1.5"/><path d="M4 26c0-4.4 3.6-8 8-8h8c4.4 0 8 3.6 8 8" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round"/></svg>, title:"ALL LEVELS", desc:"Beginner or veteran — we have game modes for everyone." },
            { svg:<svg width="28" height="28" viewBox="0 0 32 32" fill="none"><polygon points="16,2 19.5,12 30,12 21.5,18.5 24.5,28.5 16,22 7.5,28.5 10.5,18.5 2,12 12.5,12" stroke={ACCENT} strokeWidth="1.5" fill="none"/></svg>, title:"VIP BENEFITS", desc:"10% off all bookings. Free birthday game day. UKARA support." },
            { svg:<svg width="28" height="28" viewBox="0 0 32 32" fill="none"><rect x="4" y="8" width="24" height="16" rx="2" stroke={ACCENT} strokeWidth="1.5"/><path d="M10 12h12M10 16h8M10 20h10" stroke={ACCENT} strokeWidth="1.2" strokeLinecap="round"/></svg>, title:"RENTAL GEAR", desc:"Full kit hire available — gun, BBs, and face protection included." },
          ].map((f, i) => (
            <div key={f.title} style={{ padding:"28px 24px", borderRight: !isMobile && i < 3 ? "1px solid " + BORDER : "none", borderBottom: isMobile && i < 2 ? "1px solid " + BORDER : "none" }}>
              <div style={{ marginBottom:12 }}>{f.svg}</div>
              <div style={{ ...MIL, fontSize:15, fontWeight:700, letterSpacing:".1em", color:"#fff", textTransform:"uppercase", marginBottom:6 }}>{f.title}</div>
              <div style={{ fontSize:12, color: MUTED, lineHeight:1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:1200, margin:"0 auto", padding: isMobile ? "32px 16px 48px" : "40px 24px 64px" }}>

        {/* ── UPCOMING EVENTS ── */}
        {upcomingEvents.length > 0 && (
          <div style={{ marginBottom:52 }}>
            {/* Section header */}
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
              <div>
                <div style={{ ...MONO, fontSize:8, color: MUTED, letterSpacing:".22em", textTransform:"uppercase", marginBottom:4 }}>MISSION DATABASE · WILTSHIRE SECTOR</div>
                <div style={{ ...MIL, fontSize:22, fontWeight:700, letterSpacing:".18em", textTransform:"uppercase", color:"#fff" }}>UPCOMING <span style={{ color: ACCENT }}>OPERATIONS</span></div>
              </div>
              <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${BORDER2},transparent)` }} />
              <button style={{ ...MIL, ...CLIP_BTN, background:"transparent", color: ACCENT, border:`1px solid ${BORDER2}`, fontSize:11, fontWeight:600, letterSpacing:".14em", padding:"7px 16px", textTransform:"uppercase", cursor:"pointer" }}
                onClick={() => setPage("events")}>VIEW ALL →</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:16 }}>
              {upcomingEvents.slice(0,3).map((ev, idx) => {
                const booked = ev.bookings.reduce((s,b) => s + b.qty, 0);
                const total  = ev.walkOnSlots + ev.rentalSlots;
                const spotsLeft = Math.max(0, total - booked);
                const ops = ["ALPHA","BRAVO","CHARLIE","DELTA","ECHO","FOXTROT"];
                return (
                  <div key={ev.id} onClick={() => setPage("events")} style={{ background: BG2, border:`1px solid ${BORDER}`, cursor:"pointer", position:"relative", overflow:"hidden", ...CLIP_CARD, transition:"border-color .15s, transform .12s" }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=BORDER2;e.currentTarget.style.transform="translateY(-3px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.transform="";}}
                  >
                    {/* Scanlines */}
                    <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 3px)", pointerEvents:"none", zIndex:1 }} />
                    {/* Banner */}
                    <div style={{ height:180, background: BG3, position:"relative", overflow:"hidden" }}>
                      {ev.banner
                        ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"saturate(.75)" }} alt="" />
                        : <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <div style={{ ...MIL, fontSize:70, fontWeight:700, color:"rgba(200,255,0,.05)", lineHeight:1 }}>OP</div>
                          </div>
                      }
                      {/* Top bar */}
                      <div style={{ position:"absolute", top:0, left:0, right:0, background:"rgba(0,0,0,.8)", borderBottom:"1px solid rgba(200,255,0,.12)", padding:"6px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:2 }}>
                        <span style={{ ...MONO, fontSize:8, color: ACCENT, letterSpacing:".18em" }}>SA · OP-{ops[idx % ops.length]}</span>
                        <div style={{ display:"flex", gap:4 }}>
                          <span style={{ background: ACCENT, color:"#000", ...MIL, fontSize:9, fontWeight:700, padding:"2px 8px", letterSpacing:".1em", textTransform:"uppercase" }}>SKIRMISH</span>
                          {ev.vipOnly && <span style={{ background:"#d4a017", color:"#000", ...MIL, fontSize:9, fontWeight:700, padding:"2px 8px", letterSpacing:".1em" }}>★ VIP</span>}
                        </div>
                      </div>
                      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:50, background:`linear-gradient(to top,${BG2},transparent)`, zIndex:2 }} />
                    </div>
                    {/* Body */}
                    <div style={{ padding:"14px 16px", position:"relative", zIndex:2 }}>
                      <div style={{ ...MIL, fontSize:17, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:"#fff", marginBottom:10 }}>{ev.title}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:14 }}>
                        <div style={{ ...MONO, fontSize:10, color: MUTED, display:"flex", alignItems:"center", gap:7 }}>📅 {fmtDate(ev.date)} · {ev.time} HRS</div>
                        <div style={{ ...MONO, fontSize:10, color: MUTED, display:"flex", alignItems:"center", gap:7 }}>📍 {ev.location}</div>
                        <div style={{ ...MONO, fontSize:10, color: spotsLeft <= 5 ? "#d4a017" : ACCENT, display:"flex", alignItems:"center", gap:7 }}>👥 {spotsLeft} slots remaining</div>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <span style={{ ...MIL, fontSize:22, fontWeight:700, color: ACCENT }}>£{Math.min(ev.walkOnPrice, ev.rentalPrice)}</span>
                          <span style={{ ...MONO, fontSize:9, color: MUTED, marginLeft:5 }}>from</span>
                        </div>
                        <button style={{ ...MIL, ...CLIP_BTN, background: ACCENT, color:"#000", border:"none", fontSize:11, fontWeight:600, letterSpacing:".12em", padding:"7px 14px", textTransform:"uppercase", cursor:"pointer" }}>DEPLOY ▸</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DIVIDER ── */}
        <div style={{ display:"flex", alignItems:"center", gap:16, margin:"0 0 40px" }}>
          <div style={{ flex:1, height:1, background: BORDER }} />
          <div style={{ ...MONO, fontSize:10, color: ACCENT, opacity:.4 }}>✦</div>
          <div style={{ flex:1, height:1, background: BORDER }} />
        </div>

        {/* ── TACTICAL GEAR ── */}
        {!data.shopClosed && data.shop.filter(p => p.published !== false && !p.hiddenFromShop).length > 0 && (
          <div style={{ marginBottom:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
              <div>
                <div style={{ ...MONO, fontSize:8, color: MUTED, letterSpacing:".22em", textTransform:"uppercase", marginBottom:4 }}>QUARTERMASTER · FIELD ARMOURY</div>
                <div style={{ ...MIL, fontSize:22, fontWeight:700, letterSpacing:".18em", textTransform:"uppercase", color:"#fff" }}>TACTICAL <span style={{ color: ACCENT }}>GEAR</span></div>
              </div>
              <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${BORDER2},transparent)` }} />
              <button style={{ ...MIL, ...CLIP_BTN, background:"transparent", color: ACCENT, border:`1px solid ${BORDER2}`, fontSize:11, fontWeight:600, letterSpacing:".14em", padding:"7px 16px", textTransform:"uppercase", cursor:"pointer" }}
                onClick={() => setPage("shop")}>ENTER ARMOURY →</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap:12 }}>
              {data.shop.filter(p => p.published !== false && !p.hiddenFromShop).slice(0,4).map(prod => {
                const hasV = prod.variants?.length > 0;
                const lowest = hasV ? Math.min(...prod.variants.map(v => Number(v.price))) : null;
                const price = hasV ? lowest : (prod.onSale && prod.salePrice ? prod.salePrice : prod.price);
                const priceLabel = hasV ? `From £${price}` : `£${Number(price).toFixed(2)}`;
                return (
                  <div key={prod.id} onClick={() => onProductClick ? onProductClick(prod) : setPage("shop")}
                    style={{ background: BG2, border:`1px solid ${BORDER}`, cursor:"pointer", overflow:"hidden", ...CLIP_CARD, transition:"border-color .15s,transform .12s" }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=BORDER2;e.currentTarget.style.transform="translateY(-2px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.transform="";}}
                  >
                    <div style={{ height:130, background: BG3, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {prod.image ? <img src={prod.image} alt={prod.name} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"saturate(.8)" }} /> : <span style={{ fontSize:32, opacity:.2 }}>📦</span>}
                    </div>
                    <div style={{ padding:"12px 14px" }}>
                      <div style={{ ...MONO, fontSize:8, color: MUTED, letterSpacing:".18em", textTransform:"uppercase", marginBottom:4 }}>{prod.category || "GEAR"}</div>
                      <div style={{ ...MIL, fontSize:14, fontWeight:700, color:"#fff", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8, lineHeight:1.2 }}>{prod.name}</div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ ...MIL, fontSize:18, fontWeight:700, color: ACCENT }}>{priceLabel}</span>
                        {prod.stock === 0 ? <span style={{ ...MONO, fontSize:8, color:"#cc2222", letterSpacing:".12em" }}>OUT OF STOCK</span>
                          : prod.stock <= 3 ? <span style={{ ...MONO, fontSize:8, color:"#d4a017", letterSpacing:".12em" }}>LOW STOCK</span>
                          : <span style={{ ...MONO, fontSize:8, color: ACCENT, letterSpacing:".12em", opacity:.6 }}>IN STOCK</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── VIP BANNER ── */}
      <div style={{ background:"linear-gradient(180deg,#0c1009 0%,#080d05 100%)", borderTop:`2px solid #2a3a10`, borderBottom:`2px solid #2a3a10`, padding:"52px 20px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.08) 3px,rgba(0,0,0,.08) 4px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:24, height:24, zIndex:2,
            top:v==="top"?12:"auto", bottom:v==="bottom"?12:"auto",
            left:h==="left"?12:"auto", right:h==="right"?12:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:700, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ ...MONO, fontSize:9, letterSpacing:".35em", color:"#3a5010", marginBottom:12, textTransform:"uppercase" }}>◈ — MEMBERSHIP — ◈</div>
          <div style={{ ...MIL, fontWeight:700, fontSize:"clamp(26px,5vw,44px)", letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:18 }}>
            BECOME A <span style={{ color:"#c8ff00", textShadow:"0 0 24px rgba(200,255,0,.3)" }}>VIP OPERATIVE</span>
          </div>
          <p style={{ fontSize:14, color:"#7a9a50", marginBottom:28, lineHeight:1.8, ...MONO, letterSpacing:".03em" }}>
            After 3 game days, unlock VIP membership for just £40/year.<br/>10% off game days · 10% off at Airsoft Armoury UK · Free birthday game day · Exclusive events · UKARA registration support.
          </p>
          <button style={{ ...MIL, ...CLIP_BTN, background:"#c8ff00", color:"#000", fontWeight:700, fontSize:14, letterSpacing:".2em", padding:"13px 40px", border:"none", cursor:"pointer", textTransform:"uppercase", transition:"background .15s" }}
            onMouseEnter={e=>e.currentTarget.style.background="#d8ff33"}
            onMouseLeave={e=>e.currentTarget.style.background="#c8ff00"}
            onClick={() => setPage("vip")}>▸ LEARN MORE</button>
        </div>
      </div>

      {/* ── PARTNER SHOP + TECH ── */}
      <div style={{ background:"#0a0d08", borderTop:"1px solid #1a2808", borderBottom:"1px solid #1a2808", padding:"36px 16px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,480px),1fr))", gap:1, background:"#1a2808" }}>
          {/* Airsoft Armoury UK */}
          <div style={{ background:"#0a0d08", padding:"24px", display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, border:"2px solid rgba(200,255,0,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🤝</div>
              <div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010", textTransform:"uppercase", marginBottom:3 }}>OFFICIAL FIELD PARTNER</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(16px,4vw,20px)", letterSpacing:".1em", color:"#e8f0d8", textTransform:"uppercase", lineHeight:1 }}>
                  AIRSOFT <span style={{ color:"#c8ff00" }}>ARMOURY UK</span>
                </div>
              </div>
            </div>
            <p style={{ fontSize:13, color:"#7a9a50", lineHeight:1.8, margin:0 }}>
              Your one-stop shop for quality airsoft gear — handpicked kit trusted by players at Swindon Airsoft. Order online and pick up on game day, no postage needed.
            </p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {["AEGs & GBBs","Pistols & Sidearms","BBs & Ammo","Eye Pro & Helmets","Tactical Vests","Magazines","Accessories","Batteries & Chargers"].map(cat => (
                <span key={cat} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", color:"#5a8030", border:"1px solid #1e2e0a", padding:"3px 8px", textTransform:"uppercase" }}>{cat}</span>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:6 }}>
              {[["🚚","Click & Collect","Order online, pick up at the field — no postage cost"],["💸","Exclusive Discount","Use code COLLECTION at checkout for your deal"],["✅","Field-Tested Stock","Kit recommended and used by our own players"],["📦","Fast Dispatch","Orders placed before 2pm ship same day"]].map(([icon,title,desc]) => (
                <div key={title} style={{ background:"rgba(200,255,0,.03)", border:"1px solid #1a2808", padding:"10px 12px" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, color:"#c8ff00", letterSpacing:".06em", marginBottom:3 }}>{icon} {title}</div>
                  <div style={{ fontSize:11, color:"#4a6030", lineHeight:1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"rgba(200,255,0,.04)", border:"1px solid rgba(200,255,0,.15)", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".2em", textTransform:"uppercase", marginBottom:4 }}>Collection discount code</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:18, color:"#c8ff00", letterSpacing:".15em", fontWeight:700 }}>COLLECTION</div>
              </div>
              <a href="https://airsoftarmoury.co.uk" target="_blank" rel="noopener noreferrer"
                style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".12em", padding:"9px 16px", textDecoration:"none", textTransform:"uppercase" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(200,255,0,.15)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(200,255,0,.08)"}>
                VISIT STORE ↗
              </a>
            </div>
          </div>

          {/* Tech Services */}
          <div style={{ background:"#0a0d08", padding:"24px", display:"flex", flexDirection:"column", gap:14, position:"relative" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,rgba(79,195,247,.4),transparent)" }} />
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, border:"2px solid rgba(79,195,247,.3)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="#4fc3f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#1a4a5a", textTransform:"uppercase", marginBottom:3 }}>INDEPENDENT TECHNICIAN</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(15px,3.5vw,20px)", letterSpacing:".08em", color:"#e8f0d8", textTransform:"uppercase", lineHeight:1 }}>
                  AIRSOFT <span style={{ color:"#4fc3f7" }}>TECH SERVICES (GBB/AEG)</span>
                </div>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:"4px 12px" }}>
              {["Repairs & full diagnostics","Spring / FPS / air-seal work","Inner barrel & hop-up upgrades","Feeding & power issue fixes","Gearbox rebuilds & re-shims","Mag repair (GBB/AEG)","General service & regrease","Full strip & inspection report"].map(s => (
                <div key={s} style={{ display:"flex", alignItems:"flex-start", gap:7, fontSize:12, color:"#7ab8c8", lineHeight:1.5, padding:"3px 0" }}>
                  <span style={{ color:"#4fc3f7", fontWeight:900, flexShrink:0, marginTop:1 }}>✓</span>{s}
                </div>
              ))}
            </div>
            <p style={{ fontSize:12, color:"#4a7a8a", lineHeight:1.7, margin:0 }}>
              Whether your replica is shooting weak, misfeeding, or making odd noises — it gets a full strip and inspection. You'll be contacted straight away before any work begins.
            </p>
            <div style={{ background:"rgba(79,195,247,.05)", border:"1px solid rgba(79,195,247,.15)", padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                <div>
                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(18px,4vw,22px)", color:"#4fc3f7", letterSpacing:".04em" }}>£40</span>
                  <span style={{ fontSize:11, color:"#4a7a8a", marginLeft:6, letterSpacing:".1em" }}>/ HOUR + PARTS</span>
                </div>
                <a href="https://wa.me/447877731973" target="_blank" rel="noopener noreferrer"
                  style={{ display:"inline-flex", alignItems:"center", gap:7, background:"rgba(37,211,102,.12)", border:"1px solid rgba(37,211,102,.35)", color:"#25d366", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".12em", padding:"9px 16px", textDecoration:"none", textTransform:"uppercase" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(37,211,102,.22)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(37,211,102,.12)"}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                  WHATSAPP
                </a>
              </div>
              <p style={{ fontSize:11, color:"#336070", lineHeight:1.6, margin:0 }}>
                💡 Please discuss your repair <em>before</em> purchasing parts — shops often don't accept returns and online specs can be misleading.
              </p>
            </div>
            <div style={{ fontSize:10, color:"#2a3a3a", letterSpacing:".05em", lineHeight:1.6, borderTop:"1px solid #0d1a1a", paddingTop:10 }}>
              ⚠ This technician operates independently and is not affiliated with, employed by, or acting on behalf of Swindon Airsoft.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Single countdown digit unit ──
function CountdownUnit({ target, unit }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, new Date(target) - new Date());
      const map = { DAYS: Math.floor(diff/86400000), HRS: Math.floor((diff%86400000)/3600000), MIN: Math.floor((diff%3600000)/60000), SEC: Math.floor((diff%60000)/1000) };
      setVal(map[unit] ?? 0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target, unit]);
  return <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontSize:28, fontWeight:700, color:"#c8ff00", lineHeight:1 }}>{String(val).padStart(2,"0")}</div>;
}

// ── Legacy CountdownPanel (used in AppInner) ──
function CountdownPanel({ target }) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const tick = () => setDiff(Math.max(0, new Date(target) - new Date()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  const d = Math.floor(diff/86400000);
  const h = Math.floor((diff%86400000)/3600000);
  const m = Math.floor((diff%3600000)/60000);
  const s = Math.floor((diff%60000)/1000);
  return (
    <>
      {[["DAYS",d],["HRS",h],["MIN",m],["SEC",s]].map(([l,n]) => (
        <div className="countdown-panel-unit" key={l}>
          <div className="countdown-panel-num">{String(n).padStart(2,"0")}</div>
          <div className="countdown-panel-lbl">{l}</div>
        </div>
      ))}
    </>
  );
}

const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || "";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";

export { HomePage, CountdownPanel };
