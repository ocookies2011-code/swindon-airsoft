import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { normaliseProfile, squareRefund, waitlistApi, holdApi } from "./api";
import {
  renderMd, stockLabel, fmtErr,
  gmtNow, gmtDate, gmtShort, fmtDate, uid,
  CSS,
  loadSquareConfig, SquareCheckoutButton,
  TRACKING_CACHE_KEY, TRACKING_TTL_MS, TRACKING_TTL_SHORT_MS,
  detectCourier, TrackingBlock,
  useData,
  SkeletonCard, Toast, useMobile, useToast,
  GmtClock, Countdown, QRCode, QRScanner,
  SupabaseAuthModal, WaiverModal, PublicNav,
  sendEmail, sendOrderEmail, sendDispatchEmail,
  sendAdminOrderNotification, sendAdminBookingNotification,
  sendWelcomeEmail, sendTicketEmail, sendCancellationEmail,
  sendWaitlistNotifyEmail, sendAdminReturnNotification, sendAdminUkaraNotification, sendUkaraDecisionEmail,
  HomePage, CountdownPanel,
} from "./utils";
import { AdminPanel, AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage } from "../index";

import { ProductReviews } from "./ProductReviews";
export default function ProductPage({ item, cu, onBack, onAddToCart, cartCount, onCartOpen, shopItems = [] }) {
  const isMobile = useMobile(700);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [imgLightbox, setImgLightbox] = useState(null); // url string when open

  const hasVariants = item.variants?.length > 0;
  const effectivePrice = selectedVariant
    ? Number(selectedVariant.price)
    : hasVariants ? null
    : (item.onSale && item.salePrice ? item.salePrice : item.price);
  const vipPrice = effectivePrice !== null && cu?.vipStatus === "active"
    ? (effectivePrice * 0.9).toFixed(2) : null;
  const displayPrice = vipPrice || (effectivePrice !== null ? Number(effectivePrice).toFixed(2) : null);
  const stockAvail = selectedVariant ? Number(selectedVariant.stock) : hasVariants ? 0 : item.stock;
  const canAdd = (!hasVariants || selectedVariant) && stockAvail > 0;

  const [prodRevSummary, setProdRevSummary] = useState(null);
  useEffect(() => {
    supabase.from("product_reviews").select("rating").eq("product_id", item.id)
      .then(({ data: rows }) => {
        if (!rows || rows.length === 0) return;
        const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
        setProdRevSummary({ avg, count: rows.length });
      });
  }, [item.id]);

  const handleAdd = () => {
    if (!canAdd) return;
    onAddToCart(item, hasVariants ? selectedVariant : null, qty);
    setQty(1);
  };

  return (
    <>
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      {/* Breadcrumb bar */}
      <div style={{ background:"#0c1009", borderBottom:"1px solid #1a2808", padding:"12px 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", gap:8, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3a10" }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#c8ff00", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, letterSpacing:".15em", fontSize:11, padding:0 }}>
            ← ARMOURY
          </button>
          <span style={{ color:"#1a2808" }}>▸</span>
          <span style={{ color:"#3a5010", textTransform:"uppercase", letterSpacing:".12em" }}>{item.name}</span>
          <div style={{ marginLeft:"auto" }}>
            <button style={{ background:"rgba(200,255,0,.06)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".18em", padding:"6px 14px", cursor:"pointer" }}
              onClick={onCartOpen}>
              ◈ LOADOUT {cartCount > 0 && <span style={{ background:"#c8ff00", color:"#000", padding:"1px 6px", fontSize:10, marginLeft:4, fontWeight:900 }}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 16px 80px" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 32, marginBottom:40 }}>

        {/* LEFT — Image */}
        <div>
          <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", borderTop:"3px solid var(--accent)", position:"relative", overflow:"hidden" }}>
            {/* Corner brackets */}
            <div style={{ position:"absolute", top:10, left:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", top:10, right:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, left:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, right:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            {(() => {
              const variantImg = selectedVariant?.image;
              const allImgs = variantImg ? [variantImg, ...(item.images||[]).filter(x => x !== variantImg)] : (item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []));
              const displayImg = allImgs[activeImgIdx] || allImgs[0] || null;
              return (
                <>
                  {displayImg
                    ? (
                      <div style={{ position:"relative", cursor:"zoom-in" }} onClick={() => setImgLightbox(displayImg)}>
                        <img src={displayImg} alt={item.name} onError={e=>{e.target.style.display='none';}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", display:"block", background:"#0a0a0a", transition:"opacity .2s" }} />
                        <div style={{ position:"absolute", bottom:8, right:8, background:"rgba(0,0,0,.7)", border:"1px solid rgba(200,255,0,.3)", color:"rgba(200,255,0,.8)", fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", padding:"3px 8px", pointerEvents:"none" }}>⊕ ENLARGE</div>
                      </div>
                    )
                    : <div style={{ aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:80, color:"#333" }}>🎯</div>
                  }
                  {allImgs.length > 1 && (
                    <div style={{ display:"flex", gap:4, padding:"8px 8px 4px", background:"#080a06", flexWrap:"wrap" }}>
                      {allImgs.map((img, i) => (
                        <div key={i} onClick={() => setActiveImgIdx(i)}
                          style={{ width:52, height:52, border: i === activeImgIdx ? "2px solid var(--accent)" : "1px solid #1a2808", cursor:"pointer", overflow:"hidden", flexShrink:0, opacity: i === activeImgIdx ? 1 : 0.55, transition:"all .15s" }}>
                          <img src={img} alt="" onError={e=>{e.target.style.display='none';}} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {!item.stock && (
              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, letterSpacing:".2em", color:"var(--red)", border:"3px solid var(--red)", padding:"8px 24px", transform:"rotate(-5deg)" }}>OUT OF STOCK</span>
              </div>
            )}
          </div>

          {/* Spec strip */}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:1, marginTop:2 }}>
            {[
              { label:"POSTAGE", val: item.noPost ? "Collect Only" : "Standard" },
              { label:"AVAILABILITY", val: hasVariants && !selectedVariant ? "— SELECT —" : stockLabel(stockAvail).text, color: hasVariants && !selectedVariant ? "var(--muted)" : stockLabel(stockAvail).color },
              { label:"STATUS", val: hasVariants && !selectedVariant ? "— SELECT —" : stockAvail > 0 ? "IN STOCK" : "OUT OF STOCK", color: hasVariants && !selectedVariant ? "var(--muted)" : stockAvail > 0 ? "var(--accent)" : "var(--red)" },
            ].map(s => (
              <div key={s.label} style={{ background:"#0d0d0d", border:"1px solid #1a1a1a", padding:"8px 12px" }}>
                <div style={{ fontSize:8, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, textTransform:"uppercase", marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:12, fontFamily:"'Share Tech Mono',monospace", color: s.color || "var(--text)" }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Details */}
        <div>
          {/* Tags */}
          <div className="gap-2 mb-2">
            {item.noPost && <span className="tag tag-gold">⚠️ Collect Only</span>}
            {item.onSale && !hasVariants && <span className="tag tag-red">ON SALE</span>}
            {hasVariants && <span className="tag tag-blue">{item.variants.length} variants</span>}
            
          </div>

          {/* Name */}
          <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, color:"#fff", letterSpacing:".04em", textTransform:"uppercase", lineHeight:1, marginBottom:8 }}>{item.name}</h1>

          {/* Rating summary */}
          {prodRevSummary && (
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ fontSize:14, color: n <= Math.round(prodRevSummary.avg) ? "#c8a000" : "#2a3a10", lineHeight:1 }}>★</span>
              ))}
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, color:"#c8a000" }}>{prodRevSummary.avg.toFixed(1)}</span>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".08em" }}>({prodRevSummary.count} {prodRevSummary.count === 1 ? "report" : "reports"})</span>
            </div>
          )}

          {/* Description */}
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, color:"var(--muted)", lineHeight:1.8, marginBottom:20, borderLeft:"3px solid var(--accent)", paddingLeft:12 }}
            dangerouslySetInnerHTML={{ __html: renderMd(item.description) || "No description available." }}
          />

          {/* Variant selector */}
          {hasVariants && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, textTransform:"uppercase", marginBottom:10 }}>
                SELECT VARIANT
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {item.variants.map(v => {
                  const outV = Number(v.stock) < 1;
                  const sel = selectedVariant?.id === v.id;
                  return (
                    <button key={v.id}
                      onClick={() => { if (!outV) { setSelectedVariant(v); setQty(1); } }}
                      style={{
                        padding:"10px 18px", fontFamily:"'Barlow Condensed',sans-serif",
                        fontSize:13, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase",
                        background: sel ? "var(--accent)" : outV ? "#0a0a0a" : "#1a1a1a",
                        border: `2px solid ${sel ? "var(--accent)" : outV ? "#222" : "#333"}`,
                        color: sel ? "#fff" : outV ? "#333" : "var(--text)",
                        cursor: outV ? "not-allowed" : "pointer",
                        position:"relative",
                      }}>
                      <div>{v.name}</div>
                      <div style={{ fontSize:11, color: sel ? "rgba(255,255,255,.8)" : outV ? "#2a2a2a" : "var(--muted)", marginTop:2 }}>
                        {outV ? stockLabel(0).text : `£${Number(v.price).toFixed(2)}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price */}
          <div style={{ marginBottom:20 }}>
            {displayPrice ? (
              <div style={{ display:"flex", alignItems:"baseline", gap:12 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:48, color:"var(--accent)", lineHeight:1 }}>£{displayPrice}</span>
                {vipPrice && <span className="tag tag-gold">VIP PRICE</span>}
                {!hasVariants && item.onSale && item.salePrice && (
                  <span style={{ textDecoration:"line-through", color:"var(--muted)", fontSize:18 }}>£{item.price}</span>
                )}
                {cu?.vipStatus === "active" && !vipPrice && (
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--gold)" }}>10% VIP applied</span>
                )}
              </div>
            ) : (
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:14, color:"var(--muted)" }}>
                {hasVariants && !selectedVariant ? "↑ Select a variant to see price" : "—"}
              </div>
            )}
          </div>

          {/* Qty + Add to Cart */}
          {canAdd ? (
            <div style={{ display:"flex", gap:12, alignItems:"stretch", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#0d0d0d" }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ background:"none", border:"none", color:"var(--text)", padding:"12px 18px", fontSize:20, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>−</button>
                <span style={{ padding:"0 16px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, color:"#fff", minWidth:50, textAlign:"center" }}>{qty}</span>
                <button onClick={() => setQty(q => Math.min(stockAvail, q + 1))} style={{ background:"none", border:"none", color:"var(--text)", padding:"12px 18px", fontSize:20, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>+</button>
              </div>
              <button className="btn btn-primary" style={{ flex:1, padding:"12px 24px", fontSize:14, letterSpacing:".15em" }} onClick={handleAdd}>
                ADD TO CART × {qty}
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ width:"100%", padding:"14px", marginBottom:12, cursor:"default", opacity:.5 }} disabled>
              {hasVariants && !selectedVariant ? "SELECT A VARIANT FIRST" : "OUT OF STOCK"}
            </button>
          )}

          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#3a5010", display:"flex", gap:16, letterSpacing:".06em" }}>
            <span>{item.noPost ? "⚠ COLLECTION AT GAME DAY ONLY" : "✓ STANDARD POSTAGE AVAILABLE"}</span>
            
          </div>
        </div>
      </div>
      </div>
    </div>
    {/* Image lightbox */}
    {imgLightbox && (
      <div onClick={() => setImgLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.96)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", cursor:"zoom-out" }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position:"absolute", width:32, height:32, zIndex:501,
              top:v==="top"?12:"auto", bottom:v==="bottom"?12:"auto",
              left:h==="left"?12:"auto", right:h==="right"?12:"auto",
              borderTop:v==="top"?"2px solid rgba(200,255,0,.4)":"none",
              borderBottom:v==="bottom"?"2px solid rgba(200,255,0,.4)":"none",
              borderLeft:h==="left"?"2px solid rgba(200,255,0,.4)":"none",
              borderRight:h==="right"?"2px solid rgba(200,255,0,.4)":"none",
            }} />
          ))}
          <img src={imgLightbox} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth:"90vw", maxHeight:"88vh", objectFit:"contain", boxShadow:"0 0 80px rgba(0,0,0,.9), 0 0 0 1px #1a2808", cursor:"default" }} />
          <button onClick={() => setImgLightbox(null)}
            style={{ position:"absolute", top:16, right:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:14, width:36, height:36, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, letterSpacing:".1em", zIndex:502 }}>✕</button>
          {/* Navigate between images */}
          {(() => {
            const variantImg = selectedVariant?.image;
            const allImgs = variantImg ? [variantImg, ...(item.images||[]).filter(x => x !== variantImg)] : (item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []));
            const curIdx = allImgs.indexOf(imgLightbox);
            if (allImgs.length < 2) return null;
            return (
              <>
                <button onClick={e => { e.stopPropagation(); const i = (curIdx - 1 + allImgs.length) % allImgs.length; setImgLightbox(allImgs[i]); setActiveImgIdx(i); }}
                  style={{ position:"absolute", left:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:24, width:48, height:48, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>‹</button>
                <button onClick={e => { e.stopPropagation(); const i = (curIdx + 1) % allImgs.length; setImgLightbox(allImgs[i]); setActiveImgIdx(i); }}
                  style={{ position:"absolute", right:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:24, width:48, height:48, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>›</button>
                <div style={{ position:"absolute", bottom:16, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"rgba(200,255,0,.4)", letterSpacing:".2em" }}>
                  {String(curIdx+1).padStart(2,"0")} / {String(allImgs.length).padStart(2,"0")}
                </div>
              </>
            );
          })()}
      </div>
    )}

    {/* Reviews */}
    <ProductReviews item={item} cu={cu} />

    {/* Related Products */}
    {(() => {
      const related = shopItems
        .filter(p => p.id !== item.id && p.published !== false && p.category && p.category === item.category)
        .slice(0, 3);
      if (related.length === 0) return null;
      return (
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 60px" }}>
          <div style={{ borderTop:"1px solid #1a2808", paddingTop:32, marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>◈ —</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>RELATED <span style={{ color:"#c8ff00" }}>EQUIPMENT</span></div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>— ◈</div>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3a10", letterSpacing:".15em", marginTop:4 }}>
              MORE FROM: {(item.category || "").toUpperCase()}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
            {related.map(rel => {
              const hasV = rel.variants?.length > 0;
              const relPrice = hasV
                ? Math.min(...rel.variants.map(v => Number(v.price)))
                : (rel.onSale && rel.salePrice ? rel.salePrice : rel.price);
              const relImg = rel.images?.[0] || rel.image || null;
              const relStock = hasV ? rel.variants.reduce((s,v)=>s+Number(v.stock),0) : rel.stock;
              const sl = stockLabel(relStock);
              return (
                <div key={rel.id} onClick={() => { onBack(); setTimeout(() => onProductClick && onProductClick(rel), 50); }}
                  style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", transition:"border-color .15s, transform .15s", position:"relative" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}>
                  {/* Corner brackets */}
                  {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                    <div key={v+h} style={{ position:"absolute", width:10, height:10, zIndex:3,
                      top:v==="top"?4:"auto", bottom:v==="bottom"?4:"auto",
                      left:h==="left"?4:"auto", right:h==="right"?4:"auto",
                      borderTop:v==="top"?"1px solid rgba(200,255,0,.3)":"none",
                      borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.3)":"none",
                      borderLeft:h==="left"?"1px solid rgba(200,255,0,.3)":"none",
                      borderRight:h==="right"?"1px solid rgba(200,255,0,.3)":"none" }} />
                  ))}
                  {relImg
                    ? <img src={relImg} alt={rel.name} onError={e=>{e.target.style.display="none";}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", background:"#080a06", display:"block" }} />
                    : <div style={{ aspectRatio:"4/3", background:"#080a06", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, color:"#1a2808" }}>🎯</div>
                  }
                  <div style={{ padding:"10px 12px 12px" }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, letterSpacing:".06em", textTransform:"uppercase", color:"#c8e878", marginBottom:4, lineHeight:1.2 }}>{rel.name}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color:"#c8ff00" }}>£{Number(relPrice).toFixed(2)}</div>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:sl.color, letterSpacing:".1em" }}>{sl.text}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}
    </>
  );
}

