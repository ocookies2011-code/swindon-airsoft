// utils/css.js — global CSS string; inject via <style> in AppInner
// ── CSS ──────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Barlow:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');

/* ── RESET ── */
*{box-sizing:border-box;margin:0;padding:0;}
body,#root{background:#0a0a0a;color:#e0e0e0;font-family:'Barlow',sans-serif;min-height:100vh;}

/* ── VARIABLES ── */
:root{
  --bg:#0a0a0a;--bg2:#111111;--bg3:#1a1a1a;--bg4:#222;
  --border:#2a2a2a;--text:#e0e0e0;--muted:#6b6b6b;--subtle:#444;
  --accent:#c8ff00;--accent2:#a8d900;--accent-glow:rgba(200,255,0,.25);
  --accent-pale:#d8ff33;--accent-dark:#8ab300;
  --red:#ef4444;--gold:#f59e0b;--blue:#3b82f6;--teal:#14b8a6;
  --rust:#8b3a0f;
  --sidebar-w:230px;--nav-h:70px;--bottom-nav-h:64px;
}

/* ── SCROLLBAR ── */
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:#0a0a0a;}
::-webkit-scrollbar-thumb{background:var(--accent);border-radius:0;}

/* ── TYPOGRAPHY ── */
.font-mil{font-family:'Barlow Condensed',sans-serif;font-weight:800;}
.font-mono{font-family:'Share Tech Mono',monospace;}
.font-cond{font-family:'Barlow Condensed',sans-serif;}

/* ── NAV ── */
.pub-nav{background:#000;border-bottom:1px solid #1f1f1f;position:sticky;top:0;z-index:100;}
.pub-nav-inner{max-width:1280px;margin:0 auto;padding:0 16px;height:var(--nav-h);display:flex;align-items:center;gap:0;position:relative;overflow:visible;}
.pub-nav-logo{display:flex;align-items:center;gap:12px;cursor:pointer;margin-right:24px;flex-shrink:0;min-width:0;}
.pub-nav-logo-box{background:var(--accent);width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:900;color:#000;letter-spacing:.05em;border-radius:2px;flex-shrink:0;}
.pub-nav-logo-text{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;letter-spacing:.12em;color:#fff;text-transform:uppercase;white-space:nowrap;}
.pub-nav-logo-text span{color:var(--accent);}
.pub-nav-links{display:flex;gap:0;flex:1;}
.pub-nav-link{background:none;border:none;color:var(--muted);font-size:12px;font-weight:700;padding:0 16px;height:var(--nav-h);cursor:pointer;white-space:nowrap;letter-spacing:.12em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;transition:color .15s;position:relative;}
.pub-nav-link:hover{color:#fff;}
.pub-nav-link.active{color:var(--accent);}
.pub-nav-link.active::after{content:'';position:absolute;bottom:0;left:16px;right:16px;height:2px;background:var(--accent);border-radius:1px 1px 0 0;}
.pub-nav-link-wrap{position:relative;display:flex;align-items:center;}
.pub-nav-link-wrap:hover .pub-nav-dropdown{display:block;}
.pub-nav-dropdown{display:none;position:absolute;top:100%;left:0;background:#0d0d0d;border:1px solid #1a1a1a;border-top:2px solid var(--accent);min-width:160px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.7);}
.pub-nav-dropdown-item{display:block;width:100%;background:none;border:none;color:var(--muted);font-size:11px;font-weight:700;padding:11px 18px;cursor:pointer;text-align:left;letter-spacing:.12em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;transition:all .1s;white-space:nowrap;border-left:2px solid transparent;}
.pub-nav-dropdown-item:hover{background:#1a1a1a;color:#fff;border-left-color:var(--accent);}
.pub-nav-dropdown-item.active{color:var(--accent);border-left-color:var(--accent);background:rgba(200,255,0,.04);}
.pub-nav-actions{display:flex;gap:10px;align-items:center;margin-left:auto;flex-shrink:0;}
.pub-nav-hamburger{display:none;background:none;border:1px solid #333;color:var(--text);padding:6px 10px;font-size:18px;cursor:pointer;flex-shrink:0;margin-left:auto;}

/* ── MOBILE DRAWER ── */
.pub-nav-drawer{display:none;position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.95);}
.pub-nav-drawer.open{display:block;}
.pub-nav-drawer-panel{position:absolute;top:0;left:0;width:82%;max-width:320px;height:100%;background:#0d0d0d;border-right:1px solid #1f1f1f;display:flex;flex-direction:column;overflow-y:auto;}
.pub-nav-drawer-logo{padding:20px;border-bottom:1px solid #1f1f1f;font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;letter-spacing:.12em;color:#fff;}
.pub-nav-drawer-link{display:flex;align-items:center;gap:14px;padding:14px 20px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;border:none;background:none;width:100%;text-align:left;letter-spacing:.14em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;transition:all .1s;border-left:3px solid transparent;}
.pub-nav-drawer-link.active{color:var(--accent);border-left-color:var(--accent);background:rgba(200,255,0,.04);}
.pub-nav-drawer-link:hover{background:#1a1a1a;color:#fff;}
.pub-nav-drawer-divider{border:none;border-top:1px solid #1f1f1f;margin:6px 0;}

/* ── BOTTOM NAV ── */
.bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;z-index:100;background:#000;border-top:1px solid #1f1f1f;height:var(--bottom-nav-h);padding:0 4px;padding-bottom:env(safe-area-inset-bottom);}
.bottom-nav-inner{display:flex;height:100%;}
.bottom-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;color:var(--muted);font-size:8px;font-weight:700;letter-spacing:.1em;cursor:pointer;font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;transition:color .1s;position:relative;}
.bottom-nav-btn.active{color:var(--accent);}
.bottom-nav-btn.active::before{content:'';position:absolute;top:0;left:20%;right:20%;height:2px;background:var(--accent);border-radius:0 0 2px 2px;}
.bottom-nav-icon{font-size:20px;line-height:1;}
.pub-page-wrap{padding-bottom:80px;}
.page-content{max-width:1100px;margin:0 auto;padding:32px 24px;}
.page-content-sm{max-width:820px;margin:0 auto;padding:32px 24px;}

/* ── CARDS ── */
.card{background:var(--bg2);border:1px solid var(--border);padding:24px;position:relative;}
.card-sm{background:var(--bg2);border:1px solid var(--border);padding:14px 18px;}

/* ── STAT CARDS ── */
.stat-card{background:var(--bg2);border:1px solid var(--border);padding:20px 24px;position:relative;}
.stat-card::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent);}
.stat-card.red::after{background:var(--red);}
.stat-card.blue::after{background:var(--blue);}
.stat-card.gold::after{background:var(--gold);}
.stat-card.purple::after{background:#a855f7;}
.stat-card.teal::after{background:var(--teal);}
.stat-icon{font-size:20px;margin-bottom:8px;opacity:.8;}
.stat-val{font-size:36px;font-weight:900;color:#fff;line-height:1;font-family:'Barlow Condensed',sans-serif;letter-spacing:.02em;}
.stat-label{font-size:10px;font-weight:700;letter-spacing:.15em;color:var(--muted);margin-top:6px;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;}
.stat-sub{font-size:11px;color:var(--subtle);margin-top:6px;}
.stat-sub.red{color:var(--red);}
.stat-sub.green{color:var(--accent);}

/* ── BUTTONS ── */
button{cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-weight:700;border:none;transition:all .15s;letter-spacing:.08em;text-transform:uppercase;}
.btn{padding:10px 24px;font-size:13px;border-radius:2px;}
.btn-primary{background:var(--accent);color:#000;font-weight:800;}
.btn-primary:hover{background:var(--accent-pale);}
.btn-primary:disabled{opacity:.5;cursor:not-allowed;}
.btn-danger{background:var(--red);color:#fff;border-radius:2px;}
.btn-danger:hover{background:#dc2626;}
.btn-ghost{background:transparent;border:1px solid #333;color:var(--text);border-radius:2px;}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent);}
.btn-sm{padding:6px 14px;font-size:11px;}
.btn-gold{background:transparent;color:var(--gold);border:1px solid var(--gold);border-radius:2px;}
.btn-gold:hover{background:rgba(245,158,11,.1);}

/* ── TAGS ── */
.tag{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:10px;font-weight:700;letter-spacing:.1em;font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;border-radius:2px;}
.tag-green{background:var(--accent);color:#000;}
.tag-red{background:var(--red);color:#fff;}
.tag-gold{background:var(--gold);color:#000;}
.tag-blue{background:var(--blue);color:#fff;}
.tag-purple{background:#a855f7;color:#fff;}
.tag-teal{background:var(--teal);color:#000;}
.tag-orange{background:#f97316;color:#000;}

/* ── FORMS ── */
.form-group{margin-bottom:16px;}
.form-group label{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--muted);margin-bottom:6px;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;}
input,select,textarea{background:#1a1a1a;border:1px solid #2a2a2a;color:var(--text);padding:10px 14px;font-family:'Barlow',sans-serif;font-size:14px;width:100%;outline:none;transition:border .15s;border-radius:2px;}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(200,255,0,.08);}
input[type=checkbox]{width:auto;accent-color:var(--accent);cursor:pointer;}
input[type=file]{padding:6px;font-family:'Barlow',sans-serif;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:600px){.form-row{grid-template-columns:1fr;}}

/* ── TABLE ── */
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.data-table{width:100%;border-collapse:collapse;min-width:500px;}
.data-table th{text-align:left;padding:10px 16px;font-size:10px;font-weight:700;letter-spacing:.15em;color:var(--muted);border-bottom:1px solid #2a2a2a;text-transform:uppercase;white-space:nowrap;font-family:'Barlow Condensed',sans-serif;background:var(--bg2);}
.data-table td{padding:12px 16px;font-size:13px;border-bottom:1px solid #1a1a1a;}
.data-table tbody tr{transition:background .12s;}
.data-table tbody tr:hover td{background:rgba(200,255,0,.03);}

/* ── MODAL ── */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.modal-box{background:#111;border:1px solid #2a2a2a;padding:28px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;border-radius:4px;box-shadow:0 24px 80px rgba(0,0,0,.9);}
.modal-box.wide{max-width:780px;}
@media(max-width:768px){.overlay{align-items:flex-start;padding:0;padding-top:env(safe-area-inset-top,0);}.modal-box,.modal-box.wide{max-width:100%;border-radius:0;}}
.modal-title{font-size:20px;font-weight:800;margin-bottom:20px;font-family:'Barlow Condensed',sans-serif;letter-spacing:.06em;color:#fff;text-transform:uppercase;}

/* ── MISC ── */
.divider{border:none;border-top:1px solid #1e1e1e;margin:16px 0;}
.alert{padding:12px 16px;font-size:13px;margin-bottom:12px;line-height:1.5;border-left:3px solid;border-radius:2px;}
.alert-green{background:rgba(200,255,0,.05);border-color:var(--accent);color:var(--accent);}
.alert-red{background:rgba(239,68,68,.06);border-color:var(--red);color:#fca5a5;}
.alert-gold{background:rgba(245,158,11,.06);border-color:var(--gold);color:var(--gold);}
.alert-blue{background:rgba(59,130,246,.06);border-color:var(--blue);color:#93c5fd;}
.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:10px;}
.page-title{font-size:32px;font-weight:900;letter-spacing:.04em;font-family:'Barlow Condensed',sans-serif;color:#fff;text-transform:uppercase;}
.page-sub{font-size:12px;color:var(--muted);margin-top:3px;letter-spacing:.06em;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.grid-6{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;}
@media(max-width:1100px){.grid-6{grid-template-columns:repeat(3,1fr);}.grid-4{grid-template-columns:repeat(2,1fr);}}
@media(max-width:700px){.grid-2,.grid-3,.grid-4,.grid-6{grid-template-columns:1fr;}}
.gap-2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.mt-1{margin-top:8px;}.mt-2{margin-top:16px;}.mt-3{margin-top:24px;}
.mb-1{margin-bottom:8px;}.mb-2{margin-bottom:16px;}
.text-muted{color:var(--muted);}
.text-green{color:var(--accent);}
.text-red{color:var(--red);}
.text-gold{color:var(--gold);}
.text-blue{color:#93c5fd;}
.mono{font-family:'Share Tech Mono',monospace;}
.progress-bar{background:#1a1a1a;border:1px solid #222;height:6px;overflow:hidden;border-radius:3px;}
.progress-fill{height:100%;background:var(--accent);transition:width .4s;}
.progress-fill.red{background:var(--red);}

/* ── COUNTDOWN ── */
.countdown-wrap{display:flex;gap:20px;justify-content:center;}
.countdown-unit{text-align:center;min-width:64px;}
.countdown-num{font-size:52px;font-weight:900;color:#fff;line-height:1;font-family:'Barlow Condensed',sans-serif;}
.countdown-lbl{font-size:9px;letter-spacing:.2em;color:var(--muted);margin-top:4px;font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;}

/* ── PHOTO GRID ── */
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:4px;}
.photo-cell{aspect-ratio:4/3;overflow:hidden;background:#1a1a1a;position:relative;cursor:pointer;}
.photo-cell img{width:100%;height:100%;object-fit:cover;transition:transform .3s;}
.photo-cell:hover img{transform:scale(1.05);}
.qr-box{width:120px;height:120px;background:#fff;padding:8px;margin:0 auto;}

/* ── TABS ── */
.nav-tabs{display:flex;gap:0;border-bottom:1px solid #2a2a2a;margin-bottom:24px;overflow-x:auto;}
.nav-tab{padding:12px 20px;font-size:12px;font-weight:700;background:transparent;border:none;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;white-space:nowrap;flex-shrink:0;letter-spacing:.12em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;transition:all .15s;}
.nav-tab:hover{color:#fff;}
.nav-tab.active{color:var(--accent);border-bottom-color:var(--accent);}
.profile-tab-select{display:none;width:100%;padding:11px 14px;background:var(--card);border:1px solid var(--border);color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:3px;margin-bottom:20px;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;}
@media(max-width:640px){.nav-tabs.profile-tabs{display:none;}.profile-tab-select{display:block;}}

/* ── EVENT CARDS ── */
.event-card{background:var(--bg2);border:1px solid var(--border);overflow:hidden;cursor:pointer;transition:all .15s;position:relative;border-radius:4px;}
.event-card:hover{border-color:#3a3a3a;transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,.6);}
.event-banner-img{height:220px;overflow:hidden;position:relative;background:#1a1a1a;}
.event-card-body{padding:16px;}

/* ── SHOP CARDS ── */
.shop-card{background:var(--bg2);border:1px solid var(--border);overflow:hidden;transition:all .15s;border-radius:4px;}
.shop-card:hover{border-color:#3a3a3a;transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,.6);}
.shop-img{height:180px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--muted);overflow:hidden;border-bottom:1px solid #1e1e1e;position:relative;}
.shop-img img{width:100%;height:100%;object-fit:cover;}
.shop-body{padding:16px;}

/* ── LEADERBOARD ── */
.lb-row{display:flex;align-items:center;gap:14px;padding:12px 16px;margin-bottom:2px;background:var(--bg2);border:1px solid var(--border);border-radius:2px;transition:all .12s;}
.lb-row:hover{border-color:#3a3a3a;}
.lb-rank{font-size:20px;font-weight:900;width:36px;text-align:center;font-family:'Barlow Condensed',sans-serif;color:var(--muted);}
.lb-rank.top{color:var(--accent);}
.lb-avatar{width:36px;height:36px;background:#1a1a1a;border:1px solid #2a2a2a;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;overflow:hidden;flex-shrink:0;border-radius:2px;}
.lb-avatar img{width:100%;height:100%;object-fit:cover;}
.lb-games{margin-left:auto;font-size:26px;font-weight:900;color:var(--accent);font-family:'Barlow Condensed',sans-serif;}

/* ── ACCORDION ── */
.accordion-item{border:1px solid #2a2a2a;margin-bottom:2px;border-radius:2px;}
.accordion-q{padding:14px 16px;cursor:pointer;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center;transition:background .1s;font-family:'Barlow Condensed',sans-serif;letter-spacing:.05em;}
.accordion-q:hover{background:#1a1a1a;}
.accordion-a{padding:14px 16px;border-top:1px solid #2a2a2a;font-size:13px;color:var(--muted);line-height:1.7;background:#0d0d0d;}

/* ── ADMIN SHELL ── */
.admin-shell{display:flex;min-height:100vh;}
.admin-sidebar{width:var(--sidebar-w);background:#0a0a0a;border-right:1px solid #1a1a1a;flex-shrink:0;position:fixed;top:0;left:0;height:100vh;overflow-y:auto;z-index:50;transition:transform .25s;}
.admin-main{margin-left:var(--sidebar-w);flex:1;min-height:100vh;display:flex;flex-direction:column;}
.admin-topbar{background:#0d0d0d;border-bottom:1px solid #1a1a1a;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:40;}
.admin-content{padding:20px;flex:1;}
@media(max-width:768px){
  .admin-sidebar{transform:translateX(-100%);}
  .admin-sidebar.open{transform:translateX(0);}
  .admin-main{margin-left:0;}
  .admin-overlay{display:block;}
  .admin-overlay.open{display:block;}
  .admin-content{padding:14px 12px;}
}
@media(min-width:769px){
  .admin-sidebar{transform:none !important;}
  .admin-overlay{display:none !important;}
}
.sb-logo{padding:16px 14px 14px;border-bottom:1px solid #1a1a1a;margin-bottom:6px;}
.sb-logo-text{font-size:16px;font-weight:900;letter-spacing:.1em;font-family:'Barlow Condensed',sans-serif;color:#fff;text-transform:uppercase;}
.sb-logo-text span{color:var(--accent);}
.sb-time{font-size:10px;color:var(--muted);font-family:'Share Tech Mono',monospace;margin-top:3px;}
.sb-label{font-size:9px;font-weight:700;letter-spacing:.2em;color:#333;padding:10px 12px 4px;font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;}
.sb-item{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;font-size:11px;font-weight:700;color:var(--muted);transition:all .1s;border-left:2px solid transparent;margin-bottom:1px;letter-spacing:.1em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;}
.sb-item:hover{background:#1a1a1a;color:#fff;}
.sb-item.active{background:rgba(200,255,0,.05);color:var(--accent);border-left-color:var(--accent);}
.sb-icon{font-size:14px;flex-shrink:0;width:18px;text-align:center;display:flex;align-items:center;justify-content:center;}
.sb-badge{margin-left:auto;background:var(--red);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;min-width:18px;text-align:center;border-radius:2px;}
.sb-badge.gold{background:var(--gold);color:#000;}
.sb-badge.blue{background:var(--blue);}
.admin-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:49;cursor:pointer;}

/* ── BAR CHART ── */
.bar-chart{display:flex;align-items:flex-end;gap:3px;height:80px;}
.bar{background:var(--accent);opacity:.7;flex:1;min-height:4px;transition:all .4s;border-radius:2px 2px 0 0;}
.bar:hover{opacity:1;}
.bar-labels{display:flex;gap:3px;}
.bar-label{flex:1;text-align:center;font-size:8px;color:var(--muted);padding-top:4px;font-family:'Share Tech Mono',monospace;}

/* ── TOAST ── */
.toast{position:fixed;bottom:80px;right:16px;z-index:999;padding:12px 18px;font-size:13px;font-weight:700;animation:slideUp .2s ease;max-width:320px;font-family:'Barlow Condensed',sans-serif;letter-spacing:.08em;text-transform:uppercase;border-left:3px solid;border-radius:2px;}
.toast-green{background:#0d1a00;border-color:var(--accent);color:var(--accent);box-shadow:0 4px 20px rgba(200,255,0,.15);}
.toast-red{background:#1a0606;border-color:var(--red);color:#fca5a5;box-shadow:0 4px 20px rgba(239,68,68,.2);}
.toast-gold{background:#1a1200;border-color:var(--gold);color:var(--gold);}
@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}

/* ── QR SCANNER ── */
.qr-scanner-wrap{position:relative;width:100%;max-width:340px;margin:0 auto;}
.qr-scanner-wrap video{width:100%;display:block;}
.qr-overlay{position:absolute;inset:0;border:2px solid var(--accent);pointer-events:none;}
.qr-corner{position:absolute;width:20px;height:20px;border-color:var(--accent);border-style:solid;}
.qr-corner.tl{top:8px;left:8px;border-width:3px 0 0 3px;}
.qr-corner.tr{top:8px;right:8px;border-width:3px 3px 0 0;}
.qr-corner.bl{bottom:8px;left:8px;border-width:0 0 3px 3px;}
.qr-corner.br{bottom:8px;right:8px;border-width:0 3px 3px 0;}

/* ── HERO ── */
.hero-bg{position:relative;overflow:hidden;display:flex;align-items:center;background:#000;}
.hero-bg-img{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.35;}
.hero-bg-grad{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.5) 0%,rgba(0,0,0,.3) 100%);}
.hero-content{position:relative;z-index:1;padding:32px 24px 28px;max-width:760px;margin:0 auto;text-align:center;display:flex;flex-direction:column;align-items:center;}
.hero-eyebrow{font-size:11px;letter-spacing:.3em;color:var(--accent);font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;margin-bottom:20px;display:flex;align-items:center;gap:10px;justify-content:center;}
.hero-eyebrow::before{content:'';width:24px;height:2px;background:var(--accent);}
.hero-h1{font-family:'Barlow Condensed',sans-serif;font-size:clamp(56px,9vw,110px);line-height:.9;color:#fff;letter-spacing:.02em;margin-bottom:24px;text-transform:uppercase;font-weight:900;}
.hero-h1 span{color:var(--accent);}
.hero-p{color:#888;font-size:15px;line-height:1.7;max-width:520px;margin-bottom:20px;margin-left:auto;margin-right:auto;}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
.hero-stats{display:flex;gap:0;border-top:1px solid #1f1f1f;border-bottom:1px solid #1f1f1f;background:rgba(0,0,0,.8);}
.hero-stats-inner{max-width:1100px;margin:0 auto;display:flex;width:100%;flex-wrap:wrap;}
.hero-stat{flex:1;min-width:50%;padding:16px 8px;text-align:center;border-right:1px solid #1f1f1f;box-sizing:border-box;}
.hero-stat:last-child{border-right:none;}
.hero-stat-num{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;color:var(--accent);}
.hero-stat-label{font-size:10px;letter-spacing:.15em;color:var(--muted);margin-top:2px;text-transform:uppercase;}

/* ── FEATURE STRIP ── */
.feature-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#1a1a1a;}
.feature-item{background:#111;padding:28px 24px;transition:background .15s;position:relative;overflow:hidden;}
.feature-item:hover{background:#161616;}
.feature-icon{font-size:28px;margin-bottom:14px;color:var(--accent);}
.feature-title{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;letter-spacing:.06em;color:#fff;margin-bottom:8px;text-transform:uppercase;}
.feature-desc{font-size:13px;color:var(--muted);line-height:1.7;}
@media(max-width:700px){.feature-strip{grid-template-columns:1fr;}}

/* ── FEATURE CARD (bracket corners) ── */
.feature-card{background:#111;border:1px solid #2a2a2a;padding:24px;position:relative;}
.feature-card::before{content:'';position:absolute;top:0;left:0;width:16px;height:16px;border-top:2px solid var(--accent);border-left:2px solid var(--accent);}
.feature-card::after{content:'';position:absolute;bottom:0;right:0;width:16px;height:16px;border-bottom:2px solid var(--accent);border-right:2px solid var(--accent);}

/* ── COUNTDOWN PANEL ── */
.countdown-panel{background:#111;border:1px solid #2a2a2a;padding:24px 28px;margin-bottom:0;display:flex;align-items:center;gap:32px;flex-wrap:wrap;}
.countdown-panel-info{flex:1;min-width:200px;}
.countdown-panel-label{font-size:10px;letter-spacing:.25em;color:var(--accent);font-family:'Barlow Condensed',sans-serif;font-weight:700;margin-bottom:6px;text-transform:uppercase;}
.countdown-panel-title{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:800;letter-spacing:.04em;color:#fff;text-transform:uppercase;}
.countdown-panel-meta{font-size:12px;color:var(--muted);margin-top:4px;}
.countdown-panel-timer{display:flex;gap:0;border:1px solid #2a2a2a;}
.countdown-panel-unit{text-align:center;padding:10px 16px;border-right:1px solid #2a2a2a;}
.countdown-panel-unit:last-child{border-right:none;}
.countdown-panel-num{font-family:'Barlow Condensed',sans-serif;font-size:42px;font-weight:900;color:#fff;line-height:1;}
.countdown-panel-lbl{font-size:8px;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;}

/* ── SECTION HEADERS ── */
.section-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;}
.section-title{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:clamp(28px,4vw,40px);text-transform:uppercase;letter-spacing:.04em;color:#fff;}
.section-title span{color:var(--accent);}
.section-sub{font-size:13px;color:var(--muted);margin-top:4px;}
.section-link{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;border:1px solid #333;color:var(--text);cursor:pointer;background:none;transition:all .15s;border-radius:2px;}
.section-link:hover{border-color:var(--accent);color:var(--accent);}

/* ── VIP BANNER ── */
.vip-banner{background:linear-gradient(135deg,#1a2000 0%,#0d1300 100%);border:1px solid #2a3a00;padding:48px 20px;text-align:center;position:relative;overflow:hidden;}

/* ── FOOTER ── */
.pub-footer{background:#0a0a0a;border-top:1px solid #1a1a1a;padding:48px 24px 24px;}
.pub-footer-inner{max-width:1200px;margin:0 auto;}
.pub-footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px;}
@media(max-width:900px){.pub-footer-grid{grid-template-columns:1fr 1fr;gap:24px;}}
@media(max-width:600px){.pub-footer-grid{grid-template-columns:1fr;}}
.pub-footer-logo{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.pub-footer-logo-box{background:var(--accent);width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:900;color:#000;border-radius:2px;}
.pub-footer-logo-text{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:800;letter-spacing:.1em;color:#fff;text-transform:uppercase;}
.pub-footer-desc{font-size:13px;color:var(--muted);line-height:1.7;max-width:280px;}
.pub-footer-col-title{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#fff;margin-bottom:14px;font-family:'Barlow Condensed',sans-serif;}
.pub-footer-link{display:block;font-size:13px;color:var(--muted);padding:4px 0;cursor:pointer;transition:color .15s;background:none;border:none;text-align:left;width:100%;}
.pub-footer-link:hover{color:var(--accent);}
.pub-footer-contact{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);padding:4px 0;}
.pub-footer-bottom{border-top:1px solid #1a1a1a;padding-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}
.pub-footer-copy{font-size:12px;color:var(--muted);}
.pub-footer-legal{font-size:11px;color:#444;}
.pub-footer-social{display:flex;gap:12px;}
.pub-footer-social-btn{width:34px;height:34px;background:#1a1a1a;border:1px solid #2a2a2a;display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;transition:all .15s;color:var(--muted);border-radius:2px;}
.pub-footer-social-btn:hover{background:var(--accent);color:#000;border-color:var(--accent);}

/* ── TICKER / MARQUEE ── */
@keyframes skeletonShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.site-banners{display:flex;flex-direction:column;gap:12px;padding:16px 20px;background:#0a0d08;border-bottom:1px solid #1a2808;}
.site-banner{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 16px;font-family:'Share Tech Mono',monospace;font-size:13px;font-weight:400;letter-spacing:.04em;line-height:1.7;border:1px solid;position:relative;}
.site-banner-icon{font-size:15px;flex-shrink:0;}
.site-banner-text{flex:1;text-align:center;}

/* ── RESPONSIVE ── */
@media(max-width:768px){
  .pub-nav-inner{padding:0 12px;}
  .pub-nav-logo{margin-right:0;}
  .pub-nav-links{display:none;}
  .pub-nav-actions{display:none;}
  .pub-nav-hamburger{display:flex;align-items:center;justify-content:center;}
  .bottom-nav{display:block;}
  .pub-page-wrap{padding-bottom:calc(var(--bottom-nav-h) + 16px);}
  .hero-cta{flex-direction:column;}
  .vip-banner{padding:32px 16px;}
  .hero-stat-num{font-size:24px;}
  .page-content{padding:24px 14px;}
  .page-content-sm{padding:24px 14px;}
}
@media(max-width:700px){
  .feature-strip{grid-template-columns:1fr;}
}
@media(min-width:769px){
  .pub-nav-hamburger{display:none;}
  .bottom-nav{display:none;}
}
`

export { CSS };
