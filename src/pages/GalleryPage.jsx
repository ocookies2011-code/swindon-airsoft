// pages/GalleryPage.jsx — photo gallery
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";

function GalleryPage({ data }) {
  const [openAlbum, setOpenAlbum] = useState(null);
  const [lightbox, setLightbox]   = useState(null);

  const openLightbox = (url, album, idx) => setLightbox({ url, album, index: idx });
  const closeLightbox = () => setLightbox(null);
  const prevImg = () => {
    const imgs = lightbox.album.images;
    const i = (lightbox.index - 1 + imgs.length) % imgs.length;
    setLightbox({ ...lightbox, url: imgs[i], index: i });
  };
  const nextImg = () => {
    const imgs = lightbox.album.images;
    const i = (lightbox.index + 1) % imgs.length;
    setLightbox({ ...lightbox, url: imgs[i], index: i });
  };

  useEffect(() => {
    if (!lightbox) return;
    const h = e => {
      if (e.key === 'ArrowLeft') prevImg();
      else if (e.key === 'ArrowRight') nextImg();
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox]);

  const PageHeader = () => (
    <div style={{ position:'relative', overflow:'hidden', background:'linear-gradient(180deg,#0c1009 0%,#080a06 100%)', borderBottom:'2px solid #2a3a10', padding:'52px 24px 44px' }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)', pointerEvents:'none' }} />
      {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
        <div key={v+h} style={{ position:'absolute', width:28, height:28, zIndex:2,
          top:v==='top'?14:'auto', bottom:v==='bottom'?14:'auto',
          left:h==='left'?14:'auto', right:h==='right'?14:'auto',
          borderTop:v==='top'?'2px solid #c8ff00':'none', borderBottom:v==='bottom'?'2px solid #c8ff00':'none',
          borderLeft:h==='left'?'2px solid #c8ff00':'none', borderRight:h==='right'?'2px solid #c8ff00':'none',
        }} />
      ))}
      <div style={{ maxWidth:900, margin:'0 auto', textAlign:'center', position:'relative', zIndex:1 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:'.35em', color:'#3a5010', marginBottom:14, textTransform:'uppercase' }}>◈ — SWINDON AIRSOFT — FIELD INTELLIGENCE — ◈</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:'clamp(30px,6vw,56px)', letterSpacing:'.18em', textTransform:'uppercase', color:'#e8f0d8', lineHeight:1, marginBottom:6 }}>
          MISSION <span style={{ color:'#c8ff00', textShadow:'0 0 30px rgba(200,255,0,.35)' }}>ARCHIVE</span>
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:'.25em', color:'#3a5010', marginTop:12 }}>▸ CLASSIFIED FIELD FOOTAGE — AUTHORISED VIEWING ONLY ◂</div>
      </div>
    </div>
  );

  const Lightbox = () => !lightbox ? null : (
    <div onClick={closeLightbox} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.96)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
      {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
        <div key={v+h} style={{ position:'absolute', width:32, height:32, zIndex:501,
          top:v==='top'?12:'auto', bottom:v==='bottom'?12:'auto',
          left:h==='left'?12:'auto', right:h==='right'?12:'auto',
          borderTop:v==='top'?'2px solid rgba(200,255,0,.4)':'none', borderBottom:v==='bottom'?'2px solid rgba(200,255,0,.4)':'none',
          borderLeft:h==='left'?'2px solid rgba(200,255,0,.4)':'none', borderRight:h==='right'?'2px solid rgba(200,255,0,.4)':'none',
        }} />
      ))}
      <button onClick={e=>{e.stopPropagation();prevImg();}} style={{ position:'absolute', left:16, background:'rgba(200,255,0,.08)', border:'1px solid #2a3a10', color:'#c8ff00', fontSize:24, width:48, height:48, cursor:'pointer' }}>‹</button>
      <div style={{ position:'relative', display:'inline-block', maxWidth:'88vw', maxHeight:'84vh' }} onClick={e=>e.stopPropagation()}>
        <img src={lightbox.url} alt="" style={{ maxWidth:'88vw', maxHeight:'84vh', objectFit:'contain', display:'block', boxShadow:'0 0 80px rgba(0,0,0,.9),0 0 0 1px #1a2808' }} />
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
          <img src={SA_LOGO_SRC} alt="" style={{ width:'clamp(120px,18vw,220px)', height:'auto', objectFit:'contain', opacity:0.18, transform:'rotate(-30deg)', userSelect:'none', pointerEvents:'none', filter:'saturate(0) brightness(10)' }} />
        </div>
      </div>
      <button onClick={e=>{e.stopPropagation();nextImg();}} style={{ position:'absolute', right:16, background:'rgba(200,255,0,.08)', border:'1px solid #2a3a10', color:'#c8ff00', fontSize:24, width:48, height:48, cursor:'pointer' }}>›</button>
      <button onClick={closeLightbox} style={{ position:'absolute', top:16, right:16, background:'rgba(200,255,0,.08)', border:'1px solid #2a3a10', color:'#c8ff00', fontSize:14, width:36, height:36, cursor:'pointer', zIndex:502 }}>✕</button>
      <div style={{ position:'absolute', bottom:16, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'rgba(200,255,0,.4)', letterSpacing:'.2em' }}>
        FRAME {String(lightbox.index+1).padStart(3,'0')} / {String(lightbox.album.images.length).padStart(3,'0')}
      </div>
    </div>
  );

  /* ── Album covers grid ── */
  if (!openAlbum) return (
    <div style={{ background:'#080a06', minHeight:'100vh' }}>
      <PageHeader />
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 16px 80px' }}>
        {data.albums.length === 0
          ? <div style={{ textAlign:'center', padding:80, fontFamily:"'Share Tech Mono',monospace", color:'#2a3a10', fontSize:11, letterSpacing:'.2em' }}>NO MISSION FOOTAGE ON FILE</div>
          : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
              {data.albums.map(album => {
                const cover = album.images[0];
                return (
                  <div key={album.id} onClick={() => setOpenAlbum(album)}
                    style={{ cursor:'pointer', background:'#0c1009', border:'1px solid #1a2808', overflow:'hidden', transition:'border-color .2s, transform .2s' }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#c8ff00';e.currentTarget.style.transform='translateY(-2px)';}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#1a2808';e.currentTarget.style.transform='none';}}>
                    <div style={{ aspectRatio:'16/9', overflow:'hidden', background:'#0a0c08', position:'relative' }}>
                      {cover
                        ? <img src={cover} alt={album.title} style={{ width:'100%', height:'100%', objectFit:'cover', filter:'contrast(1.05) saturate(0.75)' }} />
                        : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#2a3a10', letterSpacing:'.2em' }}>NO COVER</div>
                      }
                      <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 55%)', pointerEvents:'none' }} />
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', pointerEvents:'none' }}>
                        <img src={SA_LOGO_SRC} alt="" style={{ width:100, height:'auto', objectFit:'contain', opacity:0.15, transform:'rotate(-25deg)', userSelect:'none', pointerEvents:'none', filter:'saturate(0) brightness(10)' }} />
                      </div>
                      <div style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.75)', border:'1px solid rgba(200,255,0,.3)', fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#c8ff00', letterSpacing:'.12em', padding:'2px 7px' }}>
                        {album.images.length} FRAMES
                      </div>
                    </div>
                    <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:15, letterSpacing:'.12em', color:'#e8f0d8', textTransform:'uppercase' }}>{album.title}</div>
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#c8ff00', letterSpacing:'.15em' }}>VIEW →</div>
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );

  /* ── Album image grid ── */
  return (
    <div style={{ background:'#080a06', minHeight:'100vh' }}>
      <PageHeader />
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 16px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24, flexWrap:'wrap' }}>
          <button onClick={() => setOpenAlbum(null)}
            style={{ background:'transparent', border:'1px solid #2a3a10', color:'#5a7a30', fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:'.15em', padding:'6px 14px', cursor:'pointer' }}>
            ← ALL ALBUMS
          </button>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:'.2em', color:'#c8ff00', textTransform:'uppercase' }}>▸ {openAlbum.title}</div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#2a3a10', letterSpacing:'.15em', marginLeft:'auto' }}>{openAlbum.images.length} IMAGES</div>
        </div>
        {openAlbum.images.length === 0
          ? <div style={{ background:'#0c1009', border:'1px solid #1a2808', padding:40, textAlign:'center', fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:'#2a3a10', letterSpacing:'.15em' }}>NO FOOTAGE ON FILE</div>
          : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:4 }}>
              {openAlbum.images.map((img, i) => (
                <div key={i} style={{ aspectRatio:'4/3', overflow:'hidden', background:'#0a0c08', position:'relative', cursor:'pointer', border:'1px solid #1a2808' }}
                  onClick={() => openLightbox(img, openAlbum, i)}>
                  <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'contrast(1.05) saturate(0.8)' }} />
                  <div style={{ position:'absolute', inset:0, pointerEvents:'none', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                    <img src={SA_LOGO_SRC} alt="" style={{ width:'clamp(60px,12vw,90px)', height:'auto', objectFit:'contain', opacity:0.22, transform:'rotate(-30deg)', userSelect:'none', pointerEvents:'none', filter:'saturate(0) brightness(10)' }} />
                  </div>
                  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .2s' }}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,0,0,.5)';e.currentTarget.querySelector(".gal-hover-label").style.opacity=1;}}
                    onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0)';e.currentTarget.querySelector(".gal-hover-label").style.opacity=0;}}>
                    <div className="gal-hover-label" style={{ opacity:0, transition:'opacity .2s', fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:'.2em', color:'#c8ff00', textAlign:'center' }}>
                      <div style={{ fontSize:22, marginBottom:4 }}>⊕</div>ENLARGE
                    </div>
                  </div>
                  <div style={{ position:'absolute', bottom:4, right:6, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:'rgba(200,255,0,.4)', letterSpacing:'.1em' }}>{String(i+1).padStart(3,'0')}</div>
                </div>
              ))}
            </div>
        }
      </div>
      <Lightbox />
    </div>
  );
}
// ── Q&A ───────────────────────────────────────────────────
// ── VIP Page ──────────────────────────────────────────────

export { GalleryPage };
