// utils/css.js — global CSS string; inject via <style> in AppInner
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Barlow:wght@300;400;500;600;700&family=Share+Tech+Mono&family=Oswald:wght@400;500;600;700&display=swap');

/* ── RESET ── */
*{box-sizing:border-box;margin:0;padding:0;}
body,#root{background:#080b06;color:#c8d4b0;font-family:'Oswald','Barlow Condensed',sans-serif;min-height:100vh;}

/* ── VARIABLES ── */
:root{
  --bg:#080b06;--bg2:#0d1209;--bg3:#111a0a;--bg4:#172010;
  --border:#1e2e12;--border2:#2a4018;
  --text:#c8d4b0;--muted:#5a6e42;--subtle:#3a4a28;
  --accent:#c8ff00;--accent2:#a0cc00;--accent-glow:rgba(200,255,0,.2);
  --accent-pale:#d8ff33;--accent-dark:#8ab300;
  --red:#cc2222;--gold:#d4a017;--blue:#3b82f6;--teal:#14b8a6;
  --olive:#4a5e2a;--khaki:#8b9e6a;--rust:#7a3010;
  --sidebar-w:230px;--nav-h:68px;--bottom-nav-h:64px;
  --font-mil:'Oswald','Barlow Condensed',sans-serif;
  --font-mono:'Share Tech Mono',monospace;
  --font-body:'Oswald','Barlow Condensed',sans-serif;
}

/* ── SCROLLBAR ── */
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:var(--bg);}
::-webkit-scrollbar-thumb{background:var(--accent);border-radius:0;}

/* ── TYPOGRAPHY ── */
.font-mil{font-family:var(--font-mil);font-weight:700;}
.font-mono{font-family:var(--font-mono);}
.font-cond{font-family:var(--font-body);}
h1,h2,h3,h4,h5,h6{font-family:var(--font-mil);}

/* ── NAV ── */
.pub-nav{background:#040604;border-bottom:2px solid var(--border2);position:sticky;top:0;z-index:100;box-shadow:0 2px 20px rgba(0,0,0,.8);}
.pub-nav-inner{max-width:1280px;margin:0 auto;padding:0 16px;height:var(--nav-h);display:flex;align-items:center;gap:0;position:relative;overflow:visible;}
.pub-nav-logo{display:flex;align-items:center;gap:10px;cursor:pointer;margin-right:28px;flex-shrink:0;min-width:0;}
.pub-nav-logo img{height:42px;width:auto;object-fit:contain;filter:drop-shadow(0 0 8px rgba(200,255,0,.25));}
.pub-nav-links{display:flex;gap:0;flex:1;}
.pub-nav-link{background:none;border:none;color:var(--muted);font-size:12px;font-weight:600;padding:0 14px;height:var(--nav-h);cursor:pointer;white-space:nowrap;letter-spacing:.14em;text-transform:uppercase;font-family:var(--font-mil);transition:color .15s;position:relative;}
.pub-nav-link:hover{color:var(--text);}
.pub-nav-link.active{color:var(--accent);}
.pub-nav-link.active::after{content:'';position:absolute;bottom:0;left:14px;right:14px;height:2px;background:var(--accent);}
.pub-nav-link-wrap{position:relative;display:flex;align-items:center;}
.pub-nav-link-wrap:hover .pub-nav-dropdown{display:block;}
.pub-nav-dropdown{display:none;position:absolute;top:100%;left:0;background:#060a04;border:1px solid var(--border2);border-top:2px solid var(--accent);min-width:170px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.8);}
.pub-nav-dropdown-item{display:block;width:100%;background:none;border:none;color:var(--muted);font-size:11px;font-weight:600;padding:11px 16px;cursor:pointer;text-align:left;letter-spacing:.12em;text-transform:uppercase;font-family:var(--font-mil);transition:all .1s;white-space:nowrap;border-left:2px solid transparent;}
.pub-nav-dropdown-item:hover{background:var(--bg3);color:var(--text);border-left-color:var(--accent);}
.pub-nav-dropdown-item.active{color:var(--accent);border-left-color:var(--accent);background:rgba(200,255,0,.04);}
.pub-nav-actions{display:flex;gap:10px;align-items:center;margin-left:auto;flex-shrink:0;}
.pub-nav-hamburger{display:none;background:none;border:1px solid var(--border2);color:var(--text);padding:6px 10px;font-size:18px;cursor:pointer;flex-shrink:0;margin-left:auto;}

/* ── MOBILE DRAWER ── */
.pub-nav-drawer{display:none;position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.95);}
.pub-nav-drawer.open{display:block;}
.pub-nav-drawer-panel{position:absolute;top:0;left:0;width:82%;max-width:320px;height:100%;background:#060a04;border-right:1px solid var(--border2);display:flex;flex-direction:column;overflow-y:auto;}
.pub-nav-drawer-logo{padding:20px;border-bottom:1px solid var(--border2);}
.pub-nav-drawer-logo img{height:40px;width:auto;object-fit:contain;}
.pub-nav-drawer-link{display:flex;align-items:center;gap:14px;padding:14px 20px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;border:none;background:none;width:100%;text-align:left;letter-spacing:.14em;text-transform:uppercase;font-family:var(--font-mil);transition:all .1s;border-left:3px solid transparent;}
.pub-nav-drawer-link.active{color:var(--accent);border-left-color:var(--accent);background:rgba(200,255,0,.04);}
.pub-nav-drawer-link:hover{background:var(--bg3);color:var(--text);}
.pub-nav-drawer-divider{border:none;border-top:1px solid var(--border);margin:6px 0;}

/* ── BOTTOM NAV ── */
.bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;z-index:100;background:#040604;border-top:1px solid var(--border2);height:var(--bottom-nav-h);padding:0 4px;padding-bottom:env(safe-area-inset-bottom);}
.bottom-nav-inner{display:flex;height:100%;}
.bottom-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;color:var(--muted);font-size:8px;font-weight:600;letter-spacing:.1em;cursor:pointer;font-family:var(--font-mil);text-transform:uppercase;transition:color .1s;position:relative;}
.bottom-nav-btn.active{color:var(--accent);}
.bottom-nav-btn.active::before{content:'';position:absolute;top:0;left:20%;right:20%;height:2px;background:var(--accent);}
.bottom-nav-icon{font-size:20px;line-height:1;}
.pub-page-wrap{padding-bottom:80px;}
.page-content{max-width:1100px;margin:0 auto;padding:32px 24px;}
.page-content-sm{max-width:820px;margin:0 auto;padding:32px 24px;}

/* ── CARDS ── */
.card{background:var(--bg2);border:1px solid var(--border);padding:24px;position:relative;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent) 0%,transparent 100%);}
.card-sm{background:var(--bg2);border:1px solid var(--border);padding:14px 18px;position:relative;}

/* ── STAT CARDS ── */
.stat-card{background:var(--bg2);border:1px solid var(--border);padding:20px 24px;position:relative;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);}
.stat-card::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent);}
.stat-card.red::after{background:var(--red);}
.stat-card.blue::after{background:var(--blue);}
.stat-card.gold::after{background:var(--gold);}
.stat-card.purple::after{background:#a855f7;}
.stat-card.teal::after{background:var(--teal);}
.stat-icon{font-size:20px;margin-bottom:8px;opacity:.8;}
.stat-val{font-size:34px;font-weight:700;color:#fff;line-height:1;font-family:var(--font-mil);letter-spacing:.02em;}
.stat-label{font-size:9px;font-weight:600;letter-spacing:.18em;color:var(--muted);margin-top:6px;text-transform:uppercase;font-family:var(--font-mono);}
.stat-sub{font-size:11px;color:var(--subtle);margin-top:6px;}
.stat-sub.red{color:var(--red);}
.stat-sub.green{color:var(--accent);}

/* ── BUTTONS ── */
button{cursor:pointer;font-family:var(--font-mil);font-weight:600;border:none;transition:all .15s;letter-spacing:.1em;text-transform:uppercase;}
.btn{padding:10px 22px;font-size:13px;}
.btn-primary{background:var(--accent);color:#000;clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);}
.btn-primary:hover{background:var(--accent-pale);}
.btn-primary:disabled{opacity:.5;cursor:not-allowed;}
.btn-danger{background:var(--red);color:#fff;}
.btn-danger:hover{background:#aa1a1a;}
.btn-ghost{background:transparent;border:1px solid var(--border2);color:var(--text);clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent);}
.btn-sm{padding:6px 14px;font-size:11px;}
.btn-gold{background:transparent;color:var(--gold);border:1px solid var(--gold);}
.btn-gold:hover{background:rgba(212,160,23,.1);}

/* ── TAGS ── */
.tag{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:9px;font-weight:700;letter-spacing:.14em;font-family:var(--font-mono);text-transform:uppercase;clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);}
.tag-green{background:rgba(200,255,0,.1);color:var(--accent);border:1px solid rgba(200,255,0,.25);}
.tag-red{background:rgba(204,34,34,.1);color:var(--red);border:1px solid rgba(204,34,34,.3);}
.tag-gold{background:rgba(212,160,23,.1);color:var(--gold);border:1px solid rgba(212,160,23,.3);}
.tag-blue{background:rgba(59,130,246,.1);color:#60a5fa;border:1px solid rgba(59,130,246,.3);}
.tag-purple{background:rgba(168,85,247,.1);color:#c084fc;border:1px solid rgba(168,85,247,.3);}
.tag-teal{background:rgba(20,184,166,.1);color:var(--teal);border:1px solid rgba(20,184,166,.3);}
.tag-orange{background:rgba(249,115,22,.1);color:#fb923c;border:1px solid rgba(249,115,22,.3);}

/* ── FORMS ── */
.form-group{margin-bottom:16px;}
.form-group label{display:block;font-size:9px;font-weight:600;letter-spacing:.2em;color:var(--muted);margin-bottom:6px;text-transform:uppercase;font-family:var(--font-mono);}
input,select,textarea{background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:10px 14px;font-family:'Barlow',sans-serif;font-size:14px;width:100%;outline:none;transition:border .15s;clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%);}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(200,255,0,.06);}
input[type=checkbox]{width:auto;accent-color:var(--accent);cursor:pointer;clip-path:none;}
input[type=file]{padding:6px;font-family:'Barlow',sans-serif;clip-path:none;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:600px){.form-row{grid-template-columns:1fr;}}

/* ── TABLE ── */
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.data-table{width:100%;border-collapse:collapse;min-width:500px;}
.data-table th{text-align:left;padding:10px 16px;font-size:9px;font-weight:600;letter-spacing:.2em;color:var(--muted);border-bottom:1px solid var(--border2);text-transform:uppercase;white-space:nowrap;font-family:var(--font-mono);background:var(--bg);}
.data-table td{padding:12px 16px;font-size:13px;border-bottom:1px solid var(--border);}
.data-table tbody tr{transition:background .12s;}
.data-table tbody tr:hover td{background:rgba(200,255,0,.02);}

/* ── MODAL ── */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.modal-box{background:var(--bg2);border:1px solid var(--border2);padding:28px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.9);}
.modal-box.wide{max-width:780px;}
@media(max-width:768px){.overlay{align-items:flex-start;padding:0;padding-top:env(safe-area-inset-top,0);}.modal-box,.modal-box.wide{max-width:100%;}}
.modal-title{font-size:20px;font-weight:700;margin-bottom:20px;font-family:var(--font-mil);letter-spacing:.1em;color:#fff;text-transform:uppercase;}

/* ── MISC ── */
.divider{border:none;border-top:1px solid var(--border);margin:16px 0;}
.alert{padding:12px 16px;font-size:13px;margin-bottom:12px;line-height:1.5;border-left:3px solid;}
.alert-green{background:rgba(200,255,0,.04);border-color:var(--accent);color:var(--accent);}
.alert-red{background:rgba(204,34,34,.05);border-color:var(--red);color:#f87171;}
.alert-gold{background:rgba(212,160,23,.05);border-color:var(--gold);color:var(--gold);}
.alert-blue{background:rgba(59,130,246,.05);border-color:var(--blue);color:#93c5fd;}
.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:10px;}
.page-title{font-size:28px;font-weight:700;letter-spacing:.08em;font-family:var(--font-mil);color:#fff;text-transform:uppercase;}
.page-sub{font-size:9px;color:var(--muted);margin-top:3px;letter-spacing:.15em;font-family:var(--font-mono);}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.gap-2{display:flex;gap:8px;flex-wrap:wrap;}
.gap-3{display:flex;gap:12px;flex-wrap:wrap;}
.mb-1{margin-bottom:8px;}.mb-2{margin-bottom:16px;}.mb-3{margin-bottom:24px;}.mt-2{margin-top:16px;}
.text-muted{color:var(--muted);}
.text-accent{color:var(--accent);}
.mono{font-family:var(--font-mono);}

/* ── NAV TABS ── */
.nav-tabs{display:flex;gap:2px;flex-wrap:wrap;margin-bottom:16px;}
.nav-tab{padding:8px 16px;font-size:11px;font-family:var(--font-mil);font-weight:600;letter-spacing:.14em;text-transform:uppercase;background:var(--bg3);color:var(--muted);border:none;border-bottom:2px solid transparent;cursor:pointer;transition:all .12s;clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%);}
.nav-tab:hover{color:var(--text);}
.nav-tab.active{background:var(--bg4);color:var(--accent);border-bottom-color:var(--accent);}

/* ── SKELETON ── */
@keyframes skeletonShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skeleton{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:skeletonShimmer 1.4s infinite;}

/* ── TICKER ── */
.site-banners{display:flex;flex-direction:column;gap:0;}
.site-banner{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 20px;font-family:var(--font-mono);font-size:12px;letter-spacing:.06em;line-height:1.6;border-bottom:1px solid;position:relative;border-left:none;border-right:none;border-top:none;}
.site-banner-icon{font-size:14px;flex-shrink:0;}
.site-banner-text{flex:1;text-align:center;}

/* ── INFO TICKER ── */
.info-ticker{background:#040604;border-bottom:1px solid var(--border2);overflow:hidden;height:30px;display:flex;align-items:center;}
.info-ticker-label{flex-shrink:0;font-family:var(--font-mono);font-size:8px;color:#000;background:var(--accent);padding:0 14px;height:100%;display:flex;align-items:center;letter-spacing:.2em;white-space:nowrap;font-weight:700;}
.info-ticker-track{display:flex;gap:48px;white-space:nowrap;font-family:var(--font-mono);font-size:9px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;overflow:hidden;flex:1;padding:0 20px;align-items:center;}
.info-ticker-track span{color:var(--accent);}

/* ── HERO (military) ── */
.hero-mil{position:relative;overflow:hidden;padding:64px 24px 60px;border-bottom:1px solid var(--border2);}
.hero-mil-grid{position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px),repeating-linear-gradient(90deg,transparent,transparent 48px,rgba(200,255,0,.012) 48px,rgba(200,255,0,.012) 49px);pointer-events:none;}
.hero-mil-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 55% 40%,rgba(200,255,0,.05) 0%,transparent 60%);pointer-events:none;}
.hero-mil-classify{font-family:var(--font-mono);font-size:9px;color:var(--red);letter-spacing:.3em;border:1px solid rgba(204,34,34,.3);display:inline-block;padding:4px 12px;margin-bottom:20px;background:rgba(204,34,34,.04);}
.hero-mil-title{font-family:var(--font-mil);line-height:.88;text-transform:uppercase;letter-spacing:.04em;color:#fff;margin-bottom:8px;position:relative;z-index:1;}
.hero-mil-title .acc{color:var(--accent);}
.hero-mil-title .dim{color:rgba(255,255,255,.18);display:block;letter-spacing:.14em;font-size:.38em;margin-bottom:4px;}
.hero-mil-sub{font-family:var(--font-mono);font-size:10px;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;margin-bottom:32px;position:relative;z-index:1;}
.hero-mil-cta{display:flex;gap:12px;flex-wrap:wrap;position:relative;z-index:1;}
.hero-mil-logo-bg{position:absolute;right:4%;top:50%;transform:translateY(-50%);height:260px;width:auto;object-fit:contain;opacity:.05;filter:saturate(0) brightness(10);pointer-events:none;}
.hero-mil-coords{position:absolute;bottom:14px;right:20px;font-family:var(--font-mono);font-size:8px;color:var(--olive);letter-spacing:.15em;z-index:1;}
.hero-mil-corner{position:absolute;width:18px;height:18px;}
.hero-mil-corner.tl{top:14px;left:14px;border-top:1px solid var(--accent);border-left:1px solid var(--accent);opacity:.4;}
.hero-mil-corner.tr{top:14px;right:14px;border-top:1px solid var(--accent);border-right:1px solid var(--accent);opacity:.4;}
.hero-mil-corner.bl{bottom:14px;left:14px;border-bottom:1px solid var(--accent);border-left:1px solid var(--accent);opacity:.4;}

/* ── SECTION HEADERS (military) ── */
.section-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;}
.section-title{font-family:var(--font-mil);font-weight:700;font-size:clamp(22px,3.5vw,34px);text-transform:uppercase;letter-spacing:.12em;color:#fff;}
.section-title span{color:var(--accent);}
.section-sub{font-size:9px;color:var(--muted);margin-top:4px;letter-spacing:.18em;font-family:var(--font-mono);text-transform:uppercase;}
.section-link{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-family:var(--font-mil);border:1px solid var(--border2);color:var(--text);cursor:pointer;background:none;transition:all .15s;clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%);}
.section-link:hover{border-color:var(--accent);color:var(--accent);}
.section-divider{display:flex;align-items:center;gap:16px;margin:40px 0 32px;}
.section-divider-line{flex:1;height:1px;background:var(--border);}
.section-divider-mark{font-family:var(--font-mono);font-size:10px;color:var(--accent);opacity:.4;}

/* ── STATS BAR ── */
.stats-bar{background:#040604;border-bottom:1px solid var(--border2);padding:16px 24px;}

/* ── EVENT CARDS (military) ── */
.event-card{background:var(--bg2);border:1px solid var(--border);cursor:pointer;position:relative;overflow:hidden;clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));transition:border-color .15s,transform .12s;}
.event-card:hover{border-color:var(--border2);transform:translateY(-3px);}
.event-card-banner{height:180px;overflow:hidden;position:relative;}
.event-card-banner img{width:100%;height:100%;object-fit:cover;filter:saturate(.75);}
.event-card-topbar{position:absolute;top:0;left:0;right:0;background:rgba(0,0,0,.75);border-bottom:1px solid rgba(200,255,0,.12);padding:5px 12px;display:flex;justify-content:space-between;align-items:center;}
.event-card-opcode{font-family:var(--font-mono);font-size:8px;color:var(--accent);letter-spacing:.18em;}
.event-card-badge{background:var(--accent);color:#000;font-family:var(--font-mil);font-size:9px;font-weight:700;padding:2px 9px;letter-spacing:.1em;text-transform:uppercase;}
.event-card-badge.vip{background:var(--gold);}
.event-card-fade{position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(to top,var(--bg2),transparent);}
.event-card-scanlines{position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px);pointer-events:none;}
.event-card-body{padding:14px 16px;}
.event-card-title{font-family:var(--font-mil);font-size:17px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin-bottom:10px;}
.event-card-meta{display:flex;flex-direction:column;gap:4px;margin-bottom:14px;}
.event-card-row{font-family:var(--font-mono);font-size:10px;color:var(--muted);display:flex;align-items:center;gap:7px;}
.event-card-footer{display:flex;justify-content:space-between;align-items:center;}
.event-card-price{font-family:var(--font-mil);font-size:22px;font-weight:700;color:var(--accent);}
.event-card-price small{font-size:11px;color:var(--muted);font-family:var(--font-mono);font-weight:400;}

/* ── SHOP CARDS (military) ── */
.shop-card{background:var(--bg2);border:1px solid var(--border);position:relative;overflow:hidden;cursor:pointer;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));transition:border-color .15s,transform .12s;}
.shop-card:hover{border-color:var(--border2);transform:translateY(-2px);}
.shop-card-img{height:160px;overflow:hidden;background:var(--bg3);}
.shop-card-img img{width:100%;height:100%;object-fit:cover;filter:saturate(.8);}
.shop-card-body{padding:12px 14px;}
.shop-card-cat{font-family:var(--font-mono);font-size:8px;color:var(--muted);letter-spacing:.18em;text-transform:uppercase;margin-bottom:4px;}
.shop-card-name{font-family:var(--font-mil);font-size:15px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;line-height:1.2;}
.shop-card-footer{display:flex;justify-content:space-between;align-items:center;}
.shop-card-price{font-family:var(--font-mil);font-size:19px;font-weight:700;color:var(--accent);}
.shop-card-stock{font-family:var(--font-mono);font-size:8px;color:var(--accent);letter-spacing:.15em;text-transform:uppercase;opacity:.7;}
.shop-card-stock.low{color:var(--gold);}
.shop-card-stock.out{color:var(--red);opacity:1;}

/* ── COUNTDOWN ── */
.countdown-panel{background:var(--bg2);border:1px solid var(--border2);padding:24px 28px;display:flex;align-items:center;gap:32px;flex-wrap:wrap;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%);position:relative;}
.countdown-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),transparent);}
.countdown-panel-info{flex:1;min-width:200px;}
.countdown-panel-label{font-size:9px;letter-spacing:.25em;color:var(--muted);font-family:var(--font-mono);font-weight:700;margin-bottom:6px;text-transform:uppercase;}
.countdown-panel-title{font-family:var(--font-mil);font-size:22px;font-weight:700;letter-spacing:.06em;color:#fff;text-transform:uppercase;}
.countdown-panel-meta{font-size:11px;color:var(--muted);margin-top:4px;font-family:var(--font-mono);}
.countdown-panel-timer{display:flex;gap:2px;}
.countdown-panel-unit{text-align:center;padding:10px 14px;background:var(--bg);border:1px solid var(--border2);clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);}
.countdown-panel-num{font-family:var(--font-mil);font-size:40px;font-weight:700;color:var(--accent);line-height:1;}
.countdown-panel-lbl{font-size:8px;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;font-family:var(--font-mono);}

/* ── VIP BANNER ── */
.vip-banner{background:linear-gradient(135deg,#141c04 0%,#0d1300 100%);border:1px solid var(--border2);padding:48px 20px;text-align:center;position:relative;overflow:hidden;}

/* ── FOOTER ── */
.pub-footer{background:#040604;border-top:1px solid var(--border2);padding:48px 24px 24px;}
.pub-footer-inner{max-width:1200px;margin:0 auto;}
.pub-footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px;}
@media(max-width:900px){.pub-footer-grid{grid-template-columns:1fr 1fr;gap:24px;}}
@media(max-width:600px){.pub-footer-grid{grid-template-columns:1fr;}}
.pub-footer-logo img{height:44px;width:auto;object-fit:contain;opacity:.5;margin-bottom:14px;}
.pub-footer-desc{font-size:11px;color:var(--muted);line-height:1.8;max-width:280px;font-family:var(--font-mono);letter-spacing:.06em;}
.pub-footer-col-title{font-size:9px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;font-family:var(--font-mono);}
.pub-footer-link{display:block;font-size:13px;color:var(--muted);padding:5px 0;cursor:pointer;transition:color .15s;background:none;border:none;text-align:left;width:100%;font-family:var(--font-mil);letter-spacing:.08em;text-transform:uppercase;}
.pub-footer-link:hover{color:var(--accent);}
.pub-footer-contact{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);padding:4px 0;font-family:var(--font-mono);}
.pub-footer-bottom{border-top:1px solid var(--border);padding-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}
.pub-footer-copy{font-size:10px;color:var(--muted);font-family:var(--font-mono);letter-spacing:.1em;}
.pub-footer-legal{font-size:10px;color:var(--subtle);font-family:var(--font-mono);}
.pub-footer-social{display:flex;gap:10px;}
.pub-footer-social-btn{width:34px;height:34px;background:var(--bg3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;transition:all .15s;color:var(--muted);clip-path:polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%);}
.pub-footer-social-btn:hover{background:var(--accent);color:#000;border-color:var(--accent);}

/* ── HERO STATS ── */
.hero-stats{display:flex;gap:0;border-top:1px solid #1f1f1f;border-bottom:1px solid #1f1f1f;background:rgba(0,0,0,.8);}
.hero-stats-inner{max-width:1100px;margin:0 auto;display:flex;width:100%;flex-wrap:wrap;}
.hero-stat{flex:1;min-width:50%;padding:16px 8px;text-align:center;border-right:1px solid #1f1f1f;box-sizing:border-box;}
.hero-stat:last-child{border-right:none;}
.hero-stat-num{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;color:var(--accent);}
.hero-stat-label{font-size:10px;letter-spacing:.15em;color:var(--muted);margin-top:2px;text-transform:uppercase;}

/* ── FEATURE STRIP ── */
.feature-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border2);}
.feature-item{background:var(--bg2);padding:28px 24px;transition:background .15s;position:relative;overflow:hidden;}
.feature-item:hover{background:var(--bg3);}
.feature-item::before{content:'//';position:absolute;top:12px;right:14px;font-family:var(--font-mono);font-size:10px;color:var(--accent);opacity:.3;}
.feature-icon{font-size:24px;margin-bottom:14px;color:var(--accent);}
.feature-title{font-family:var(--font-mil);font-size:17px;font-weight:700;letter-spacing:.1em;color:#fff;margin-bottom:8px;text-transform:uppercase;}
.feature-desc{font-size:13px;color:var(--muted);line-height:1.7;}
@media(max-width:700px){.feature-strip{grid-template-columns:1fr;}.hero-stat-num{font-size:24px;}}

/* ── FEATURE CARD (bracket corners) ── */
.feature-card{background:var(--bg2);border:1px solid var(--border);padding:24px;position:relative;}
.feature-card::before{content:'';position:absolute;top:0;left:0;width:16px;height:16px;border-top:2px solid var(--accent);border-left:2px solid var(--accent);}
.feature-card::after{content:'';position:absolute;bottom:0;right:0;width:16px;height:16px;border-bottom:2px solid var(--accent);border-right:2px solid var(--accent);}

/* ── RESPONSIVE ── */
@media(max-width:768px){
  .pub-nav-inner{padding:0 12px;}
  .pub-nav-logo{margin-right:0;}
  .pub-nav-links{display:none;}
  .pub-nav-actions{display:none;}
  .pub-nav-hamburger{display:flex;align-items:center;justify-content:center;}
  .bottom-nav{display:block;}
  .pub-page-wrap{padding-bottom:calc(var(--bottom-nav-h) + 16px);}
  .hero-mil-cta{flex-direction:column;}
  .vip-banner{padding:32px 16px;}
  .page-content{padding:24px 14px;}
  .page-content-sm{padding:24px 14px;}
  .grid-3,.grid-4{grid-template-columns:1fr 1fr;}
  .grid-2{grid-template-columns:1fr;}
  .countdown-panel{flex-direction:column;align-items:flex-start;gap:16px;}
}
@media(max-width:480px){.grid-3,.grid-4{grid-template-columns:1fr;}}
@media(max-width:700px){.feature-strip{grid-template-columns:1fr;}.hero-stat-num{font-size:24px;}}
@media(min-width:769px){
  .pub-nav-hamburger{display:none;}
  .bottom-nav{display:none;}
}

/* ═══════════════════════════════════════════════════════
   ADMIN SHELL — uses its own dark-grey palette, NOT the
   public dark-green theme. These rules must NOT reference
   the green --bg/--border vars for layout-critical props.
   ═══════════════════════════════════════════════════════ */

/* Reset CSS vars to grey inside admin */
.admin-shell{
  --bg:#0a0a0a;--bg2:#111111;--bg3:#1a1a1a;--bg4:#222222;
  --border:#1e1e1e;--border2:#2a2a2a;
  --text:#e0e0e0;--muted:#6b6b6b;--subtle:#444;
  display:flex;min-height:100vh;background:#0a0a0a;
}
.admin-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:49;cursor:pointer;}
.admin-overlay.open{display:block;}
.admin-sidebar{width:var(--sidebar-w);background:#0a0a0a;border-right:1px solid #1e1e1e;flex-shrink:0;position:fixed;top:0;left:0;height:100vh;overflow-y:auto;z-index:50;transition:transform .25s;}
.admin-main{margin-left:var(--sidebar-w);flex:1;min-height:100vh;display:flex;flex-direction:column;background:#0d0d0d;}
.admin-topbar{background:#0d0d0d;border-bottom:1px solid #1e1e1e;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:40;}
.admin-content{padding:20px;flex:1;}
@media(max-width:768px){
  .admin-sidebar{transform:translateX(-100%);}
  .admin-sidebar.open{transform:translateX(0);}
  .admin-main{margin-left:0;}
  .admin-overlay.open{display:block;}
  .admin-content{padding:14px 12px;}
}
@media(min-width:769px){
  .admin-sidebar{transform:none !important;}
  .admin-overlay{display:none !important;}
}
.sb-logo{padding:16px 14px 14px;border-bottom:1px solid #1e1e1e;margin-bottom:6px;}
.sb-logo-text{font-size:16px;font-weight:900;letter-spacing:.1em;font-family:'Oswald','Barlow Condensed',sans-serif;color:#fff;text-transform:uppercase;}
.sb-logo-text span{color:var(--accent);}
.sb-time{font-size:10px;color:#555;font-family:'Share Tech Mono',monospace;margin-top:3px;}
.sb-label{font-size:9px;font-weight:700;letter-spacing:.2em;color:#333;padding:10px 12px 4px;font-family:'Oswald','Barlow Condensed',sans-serif;text-transform:uppercase;}
.sb-item{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;font-size:11px;font-weight:700;color:#666;transition:all .1s;border-left:2px solid transparent;margin-bottom:1px;letter-spacing:.1em;text-transform:uppercase;font-family:'Oswald','Barlow Condensed',sans-serif;}
.sb-item:hover{background:#1a1a1a;color:#fff;}
.sb-item.active{background:rgba(200,255,0,.05);color:var(--accent);border-left-color:var(--accent);}
.sb-icon{font-size:14px;flex-shrink:0;width:18px;text-align:center;display:flex;align-items:center;justify-content:center;}
.sb-badge{margin-left:auto;background:var(--red);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;min-width:18px;text-align:center;border-radius:2px;}
.sb-badge.gold{background:var(--gold);color:#000;}
.sb-badge.blue{background:var(--blue);}
.sb-badge.purple{background:#a855f7;}

/* ── BAR CHART ── */
.bar-chart{display:flex;align-items:flex-end;gap:3px;height:80px;}
.bar{background:var(--accent);opacity:.7;flex:1;min-height:4px;transition:all .4s;border-radius:2px 2px 0 0;}
.bar:hover{opacity:1;}
.bar-labels{display:flex;gap:3px;}
.bar-label{flex:1;text-align:center;font-size:8px;color:#555;padding-top:4px;font-family:'Share Tech Mono',monospace;}

/* ── TOAST ── */
.toast{position:fixed;bottom:80px;right:16px;z-index:999;padding:12px 18px;font-size:13px;font-weight:700;animation:slideUp .2s ease;max-width:320px;font-family:'Oswald','Barlow Condensed',sans-serif;letter-spacing:.08em;text-transform:uppercase;border-left:3px solid;border-radius:2px;}
.toast-green{background:#0d1a00;border-color:var(--accent);color:var(--accent);box-shadow:0 4px 20px rgba(200,255,0,.15);}
.toast-red{background:#1a0606;border-color:var(--red);color:#fca5a5;box-shadow:0 4px 20px rgba(239,68,68,.2);}
.toast-gold{background:#1a1200;border-color:var(--gold);color:var(--gold);}
@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}

/* ── LEADERBOARD ── */
.lb-row{display:flex;align-items:center;gap:14px;padding:12px 16px;margin-bottom:2px;background:var(--bg2);border:1px solid var(--border);transition:all .12s;}
.lb-row:hover{border-color:var(--border2);}
.lb-rank{font-size:20px;font-weight:900;width:36px;text-align:center;font-family:'Oswald','Barlow Condensed',sans-serif;color:var(--muted);}
.lb-rank.top{color:var(--accent);}
.lb-avatar{width:36px;height:36px;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;overflow:hidden;flex-shrink:0;}
.lb-avatar img{width:100%;height:100%;object-fit:cover;}
.lb-games{margin-left:auto;font-size:26px;font-weight:900;color:var(--accent);font-family:'Oswald','Barlow Condensed',sans-serif;}

/* ── ACCORDION ── */
.accordion-item{border:1px solid var(--border);margin-bottom:2px;}
.accordion-q{padding:14px 16px;cursor:pointer;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center;transition:background .1s;font-family:'Oswald','Barlow Condensed',sans-serif;letter-spacing:.05em;}
.accordion-q:hover{background:var(--bg3);}
.accordion-a{padding:14px 16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);line-height:1.7;background:var(--bg2);}

/* ── QR SCANNER ── */
.qr-scanner-wrap{position:relative;width:100%;max-width:340px;margin:0 auto;}
.qr-scanner-wrap video{width:100%;display:block;}
.qr-overlay{position:absolute;inset:0;border:2px solid var(--accent);pointer-events:none;}
.qr-corner{position:absolute;width:20px;height:20px;border-color:var(--accent);border-style:solid;}
.qr-corner.tl{top:8px;left:8px;border-width:3px 0 0 3px;}
.qr-corner.tr{top:8px;right:8px;border-width:3px 3px 0 0;}
.qr-corner.bl{bottom:8px;left:8px;border-width:0 0 3px 3px;}
.qr-corner.br{bottom:8px;right:8px;border-width:0 3px 3px 0;}
/* Admin-scoped overrides: remove military decorations inside admin */
.admin-shell .card{clip-path:none;border-radius:2px;}
.admin-shell .card::before{display:none;}
.admin-shell .card-sm{border-radius:2px;}
.admin-shell .stat-card{clip-path:none;border-radius:2px;background:#111111;border-color:#1e1e1e;}
.admin-shell .stat-card::after{height:2px;}
.admin-shell .btn-primary{clip-path:none;border-radius:2px;}
.admin-shell .btn-ghost{clip-path:none;border-radius:2px;}
.admin-shell .btn{clip-path:none;border-radius:2px;}
.admin-shell .tag{clip-path:none;border-radius:2px;}
.admin-shell .nav-tab{clip-path:none;border-radius:2px 2px 0 0;}
.admin-shell input,.admin-shell select,.admin-shell textarea{clip-path:none;border-radius:2px;}
.admin-shell .data-table th{background:#111111;border-color:#1e1e1e;}
.admin-shell .data-table td{border-color:#1e1e1e;}
.admin-shell .data-table tbody tr:hover td{background:rgba(255,255,255,.03);}
.admin-shell .section-link{clip-path:none;border-radius:2px;}

/* ═══════════════════════════════════════════════════════
   COMPREHENSIVE RESPONSIVE — mobile / tablet / desktop
   ═══════════════════════════════════════════════════════ */

/* ── Tablet (≤1024px) ── */
@media(max-width:1024px){
  .page-content{padding:28px 20px;}
  .page-content-sm{padding:28px 20px;}
  .hero-mil{padding:48px 20px 44px;}
  .grid-4{grid-template-columns:1fr 1fr;}
  .stats-bar{padding:12px 16px;}
  .stats-bar-inner{grid-template-columns:repeat(2,1fr);}
}

/* ── Mobile (≤768px) ── */
@media(max-width:768px){
  /* Typography scale down */
  .hero-mil-h1{font-size:clamp(28px,8vw,52px) !important;}
  .section-title{font-size:clamp(18px,5vw,28px);}

  /* Page structure */
  .page-content{padding:20px 12px;}
  .page-content-sm{padding:20px 12px;}

  /* Event card booking panel — stack vertically, prevent overflow */
  .event-booking-panel{flex-direction:column !important;}

  /* Shop product grid */
  .shop-grid{grid-template-columns:1fr 1fr !important;}

  /* Grids */
  .grid-2{grid-template-columns:1fr;}
  .grid-3,.grid-4{grid-template-columns:1fr 1fr;}

  /* Modals — full screen on mobile */
  .modal-box{max-width:100% !important;max-height:100vh !important;height:100vh;border-radius:0;}
  .modal-box.wide{max-width:100% !important;}

  /* Stats bar */
  .stats-bar-inner{grid-template-columns:1fr 1fr;}

  /* Countdown panel */
  .countdown-panel{flex-direction:column;gap:12px;padding:16px;}
  .countdown-digits{font-size:clamp(28px,8vw,48px) !important;}

  /* Nav tabs — scrollable row */
  .nav-tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;}
  .nav-tab{white-space:nowrap;flex-shrink:0;}

  /* Tables — allow horizontal scroll */
  .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100vw;}
  .data-table{min-width:500px;}

  /* Forms */
  .form-row{grid-template-columns:1fr !important;}

  /* Buttons in rows — wrap cleanly */
  .btn-row{flex-wrap:wrap;gap:8px;}

  /* Event card */
  .event-card-banner{height:140px;}

  /* Feature strip */
  .feature-strip{grid-template-columns:1fr !important;}

  /* Section header stack */
  .section-header{flex-direction:column;align-items:flex-start;gap:8px;}

  /* VIP banner */
  .vip-banner{padding:24px 14px;}

  /* Leaderboard podium on mobile — stack */
  .lb-podium{flex-direction:column !important;align-items:center !important;}
  .lb-podium-col{width:90% !important;max-width:320px !important;}

  /* Admin topbar — compact */
  .admin-topbar{padding:0 12px;font-size:12px;}

  /* Page header */
  .page-header{flex-direction:column;align-items:flex-start;gap:8px;}
  .page-title{font-size:clamp(18px,5vw,28px);}

  /* Footer grid */
  .pub-footer-grid{grid-template-columns:1fr !important;}
}

/* ── Small mobile (≤480px) ── */
@media(max-width:480px){
  .grid-3,.grid-4{grid-template-columns:1fr;}
  .shop-grid{grid-template-columns:1fr !important;}
  .stats-bar-inner{grid-template-columns:1fr;}

  /* Booking section — tighter padding */
  .page-content{padding:16px 10px;}
  .card{padding:16px;}

  /* Event booking slot counters */
  .slot-counter{flex-direction:column;gap:8px;}

  /* Podium cards */
  .lb-podium-col{width:95% !important;}

  /* Bottom nav labels — hide on very small */
  .bottom-nav-label{display:none;}
  .bottom-nav-icon{font-size:20px;}

  /* Typography */
  .hero-mil-h1{font-size:clamp(24px,10vw,44px) !important;}

  /* Modals */
  .modal-box{padding:16px 12px;}
}

/* ── Touch device improvements ── */
@media(hover:none) and (pointer:coarse){
  /* Larger tap targets */
  .btn{min-height:44px;padding:10px 18px;}
  .btn-sm{min-height:38px;}
  .nav-tab{min-height:40px;}
  .pub-nav-drawer-link{min-height:48px;}
  .bottom-nav-item{min-height:52px;}
  input,select,textarea{min-height:44px;font-size:16px !important;} /* prevent zoom on iOS */

  /* Remove hover effects that don't work on touch */
  .shop-card:hover,.event-card:hover{transform:none !important;}
}

/* ── Safe area insets (notch phones) ── */
@supports(padding:env(safe-area-inset-bottom)){
  .bottom-nav{padding-bottom:env(safe-area-inset-bottom);}
  .pub-page-wrap{padding-bottom:calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));}
  @media(max-width:768px){
    .admin-content{padding-bottom:calc(20px + env(safe-area-inset-bottom));}
  }
}

/* ── Admin panel mobile ── */
@media(max-width:768px){
  .admin-topbar{padding:0 10px;height:48px;}
  .admin-content{padding:14px 10px;}
  /* Admin quick actions - 2 col on mobile */
  .admin-qa-grid{grid-template-columns:1fr 1fr !important;}
  /* Admin tables - horizontal scroll */
  .admin-shell .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:calc(100vw - 20px);}
  /* Admin stat cards - 2 col */
  .admin-shell .stat-card{padding:14px 16px;}
  /* Section header stack on mobile */
  .admin-shell .page-header{flex-direction:column;align-items:flex-start;gap:8px;}
  /* Grid 2 becomes 1 col inside admin on mobile */
  .admin-shell .grid-2{grid-template-columns:1fr;}
}


html,body,#root{max-width:100vw;overflow-x:hidden;}
.pub-page-wrap{overflow-x:hidden;}

`

export { CSS };
