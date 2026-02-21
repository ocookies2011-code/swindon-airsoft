import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { normaliseProfile } from "./api";
// jsQR is loaded via CDN in the QRScanner component — no import needed

// ── GMT helpers ───────────────────────────────────────────────
const gmtNow = () => new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false });
const gmtDate = (d) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false });
const gmtShort = (d) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" });
const uid = () => crypto.randomUUID();

// ── QR Code component using qrcode-svg ───────────────────────
function QRCode({ value, size = 120 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    // Load QRCode library dynamically from CDN
    const loadQR = async () => {
      if (!window.QRCode) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      if (ref.current) {
        ref.current.innerHTML = '';
        new window.QRCode(ref.current, {
          text: value, width: size, height: size,
          colorDark: '#000000', colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
      }
    };
    loadQR().catch(console.error);
  }, [value, size]);
  return <div ref={ref} style={{ background: '#fff', padding: 8, borderRadius: 6, display: 'inline-block' }} />;
}

function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    // Hard timeout — show site after 8 seconds no matter what
    const timeout = setTimeout(() => setLoading(false), 8000);
    try {
      const [evList, shopList, postageList, albumList, qaList, homeMsg] = await Promise.all([
        api.events.getAll().catch(e => { console.error("events:", e); return []; }),
        api.shop.getAll().catch(e => { console.error("shop:", e); return []; }),
        api.postage.getAll().catch(e => { console.error("postage:", e); return []; }),
        api.gallery.getAll().catch(e => { console.error("gallery:", e); return []; }),
        api.qa.getAll().catch(e => { console.error("qa:", e); return []; }),
        api.settings.get("home_message").catch(() => ""),
      ]);
      clearTimeout(timeout);
      setData({
        events: evList,
        shop: shopList,
        postageOptions: postageList,
        albums: albumList,
        qa: qaList,
        homeMsg,
        users: [],
      });
    } catch (e) {
      clearTimeout(timeout);
      console.error("loadAll critical error:", e);
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // save() now delegates to specific API calls based on what changed
  const save = useCallback(async (patch) => {
    // Optimistic local update
    setData(prev => ({ ...prev, ...patch }));

    if (patch.homeMsg !== undefined) {
      await api.settings.set("home_message", patch.homeMsg);
    }
    if (patch.postageOptions !== undefined) {
      // Diff is handled by admin components calling api.postage directly
      // This just keeps local state in sync
    }
    if (patch.qa !== undefined) {
      // Handled by admin components calling api.qa directly
    }
    if (patch.albums !== undefined) {
      // Handled by admin components calling api.gallery directly
    }
    if (patch.shop !== undefined) {
      // Handled by admin components calling api.shop directly
    }
    if (patch.events !== undefined) {
      // Handled by admin components calling api.events directly
    }
    if (patch.users !== undefined) {
      // Local admin user list — refresh from DB
      const allProfiles = await api.profiles.getAll();
      setData(prev => ({ ...prev, users: allProfiles.map(normaliseProfile) }));
    }
  }, []);

  const updateUser = useCallback(async (id, patch) => {
    // Convert camelCase patch to snake_case for Supabase
    const snakePatch = {};
    const map = {
      name: "name", phone: "phone", address: "address", role: "role",
      gamesAttended: "games_attended", waiverSigned: "waiver_signed",
      waiverYear: "waiver_year", waiverData: "waiver_data",
      waiverPending: "waiver_pending", vipStatus: "vip_status",
      vipApplied: "vip_applied", ukara: "ukara", credits: "credits",
      leaderboardOptOut: "leaderboard_opt_out", profilePic: "profile_pic",
      deleteRequest: "delete_request", permissions: "permissions",
    };
    Object.entries(patch).forEach(([k, v]) => {
      if (map[k]) snakePatch[map[k]] = v;
    });
    try {
      await api.profiles.update(id, snakePatch);
    } catch (e) {
      console.error("updateUser failed:", e.message, snakePatch);
      throw e;
    }
    // Refresh local data
    setData(prev => {
      if (!prev) return prev;
      const users = prev.users.map(u => u.id === id ? { ...u, ...patch } : u);
      return { ...prev, users };
    });
  }, []);

  const updateEvent = useCallback(async (id, patch) => {
    await api.events.update(id, patch);
    // Refresh events from DB to get accurate state
    const evList = await api.events.getAll();
    setData(prev => ({ ...prev, events: evList }));
  }, []);

  const refresh = useCallback(() => loadAll(), [loadAll]);

  return { data, loading, loadError, save, updateUser, updateEvent, refresh };
}

// ── useAdminUsers — load all profiles (admin only) ────────────
function useAdminUsers(isAdmin) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (!isAdmin) return;
    api.profiles.getAll()
      .then(list => setUsers(list.map(normaliseProfile)))
      .catch(console.error);
  }, [isAdmin]);
  return [users, setUsers];
}


// (SEED data removed — all data comes from Supabase)

// ── CSS ──────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700;800;900&family=Share+Tech+Mono&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body,#root{background:#0d1117;color:#c9d1d9;font-family:'Exo 2',sans-serif;min-height:100vh;}
:root{
  --bg:#0d1117; --bg2:#161b22; --bg3:#1c2333; --bg4:#21262d;
  --border:#30363d; --text:#c9d1d9; --muted:#8b949e; --subtle:#484f58;
  --green:#3fb950; --green2:#238636; --red:#f85149; --gold:#d29922;
  --blue:#58a6ff; --purple:#bc8cff; --orange:#e3b341; --teal:#39d353;
  --sidebar-w:220px; --nav-h:56px; --bottom-nav-h:64px;
}
/* Scrollbar */
::-webkit-scrollbar{width:6px;height:6px;}
::-webkit-scrollbar-track{background:var(--bg2);}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:var(--subtle);}

/* ── Public Nav ── */
.pub-nav{background:var(--bg2);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;}
.pub-nav-inner{max-width:1200px;margin:0 auto;padding:0 16px;height:var(--nav-h);display:flex;align-items:center;gap:4px;}
.pub-nav-logo{display:flex;align-items:center;gap:8px;cursor:pointer;margin-right:8px;flex-shrink:0;}
.pub-nav-logo-box{background:var(--green);width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#000;font-size:13px;}
.pub-nav-logo-text{font-weight:900;font-size:15px;letter-spacing:.02em;white-space:nowrap;}
.pub-nav-links{display:flex;gap:2px;flex:1;}
.pub-nav-link{background:none;border:none;color:var(--muted);font-size:13px;font-weight:600;padding:6px 10px;border-radius:4px;cursor:pointer;white-space:nowrap;}
.pub-nav-link.active{color:var(--green);}
.pub-nav-link:hover{color:var(--text);}
.pub-nav-actions{display:flex;gap:6px;align-items:center;margin-left:auto;flex-shrink:0;}
/* Mobile hamburger menu */
.pub-nav-hamburger{display:none;background:none;border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:6px;font-size:18px;cursor:pointer;}
.pub-nav-drawer{display:none;position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.7);}
.pub-nav-drawer.open{display:block;}
.pub-nav-drawer-panel{position:absolute;top:0;left:0;width:80%;max-width:300px;height:100%;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:20px 0;overflow-y:auto;}
.pub-nav-drawer-logo{padding:0 16px 16px;border-bottom:1px solid var(--border);margin-bottom:8px;font-weight:900;font-size:18px;}
.pub-nav-drawer-link{display:flex;align-items:center;gap:12px;padding:14px 20px;font-size:15px;font-weight:600;color:var(--muted);cursor:pointer;border:none;background:none;width:100%;text-align:left;}
.pub-nav-drawer-link.active{color:var(--green);background:#0d2818;}
.pub-nav-drawer-link:hover{background:var(--bg4);color:var(--text);}
.pub-nav-drawer-divider{border:none;border-top:1px solid var(--border);margin:8px 0;}

/* ── Bottom nav for mobile public pages ── */
.bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;z-index:100;
  background:var(--bg2);border-top:1px solid var(--border);height:var(--bottom-nav-h);
  padding:0 4px;padding-bottom:env(safe-area-inset-bottom);}
.bottom-nav-inner{display:flex;height:100%;}
.bottom-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;border:none;background:none;color:var(--muted);font-size:9px;font-weight:700;
  letter-spacing:.05em;cursor:pointer;padding:4px 2px;border-radius:8px;}
.bottom-nav-btn.active{color:var(--green);}
.bottom-nav-btn:hover{color:var(--text);}
.bottom-nav-icon{font-size:20px;line-height:1;}

/* ── Page content padding for mobile bottom nav ── */
.pub-page-wrap{padding-bottom:80px;}

/* ── Cards ── */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:20px;}
.card-sm{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 18px;}
.stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:18px 20px;
  border-top:3px solid var(--green);position:relative;overflow:hidden;}
.stat-card.red{border-top-color:var(--red);}
.stat-card.blue{border-top-color:var(--blue);}
.stat-card.gold{border-top-color:var(--gold);}
.stat-card.purple{border-top-color:var(--purple);}
.stat-card.teal{border-top-color:var(--teal);}
.stat-icon{font-size:22px;margin-bottom:10px;}
.stat-val{font-size:32px;font-weight:800;color:var(--text);line-height:1;}
.stat-label{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--muted);margin-top:4px;text-transform:uppercase;}
.stat-sub{font-size:11px;color:var(--subtle);margin-top:6px;}
.stat-sub.red{color:var(--red);}
.stat-sub.green{color:var(--green);}

/* ── Buttons ── */
button{cursor:pointer;font-family:'Exo 2',sans-serif;font-weight:600;border:none;border-radius:6px;transition:all .15s;}
.btn{padding:8px 18px;font-size:13px;}
.btn-primary{background:var(--green2);color:#fff;border:1px solid var(--green);}
.btn-primary:hover{background:#2ea043;}
.btn-danger{background:#b91c1c;color:#fff;}
.btn-danger:hover{background:var(--red);}
.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text);}
.btn-ghost:hover{background:var(--bg4);}
.btn-sm{padding:5px 12px;font-size:12px;}
.btn-gold{background:#92400e;color:var(--orange);border:1px solid var(--gold);}
.btn-gold:hover{background:#a16207;}

/* ── Tags ── */
.tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:.04em;}
.tag-green{background:#1a4d2e;color:var(--green);border:1px solid var(--green2);}
.tag-red{background:#3d1c1c;color:var(--red);border:1px solid #6b2222;}
.tag-gold{background:#3d2e0a;color:var(--gold);border:1px solid #6b4f0a;}
.tag-blue{background:#1a2d4d;color:var(--blue);border:1px solid #1a4a8a;}
.tag-purple{background:#2d1a4d;color:var(--purple);border:1px solid #4a1a8a;}

/* ── Forms ── */
.form-group{margin-bottom:14px;}
.form-group label{display:block;font-size:12px;font-weight:600;letter-spacing:.06em;color:var(--muted);margin-bottom:5px;text-transform:uppercase;}
input,select,textarea{background:var(--bg4);border:1px solid var(--border);color:var(--text);
  padding:10px 12px;border-radius:6px;font-family:'Exo 2',sans-serif;font-size:14px;width:100%;outline:none;transition:border .15s;}
input:focus,select:focus,textarea:focus{border-color:var(--blue);}
input[type=checkbox]{width:auto;accent-color:var(--green);cursor:pointer;}
input[type=file]{padding:6px;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:600px){.form-row{grid-template-columns:1fr;}}

/* ── Table (scrollable on mobile) ── */
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:6px;}
.data-table{width:100%;border-collapse:collapse;min-width:500px;}
.data-table th{text-align:left;padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.1em;
  color:var(--muted);border-bottom:1px solid var(--border);text-transform:uppercase;white-space:nowrap;}
.data-table td{padding:10px 14px;font-size:13px;border-bottom:1px solid #21262d;}
.data-table tbody tr:hover td{background:#ffffff05;}

/* ── Modal ── */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:0;}
.modal-box{background:var(--bg2);border:1px solid var(--border);border-radius:16px 16px 0 0;padding:24px;
  width:100%;max-width:600px;max-height:92vh;overflow-y:auto;}
.modal-box.wide{max-width:100%;border-radius:16px 16px 0 0;}
.modal-title{font-size:17px;font-weight:800;margin-bottom:18px;display:flex;align-items:center;gap:10px;}

/* ── Misc ── */
.divider{border:none;border-top:1px solid var(--border);margin:16px 0;}
.alert{padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:12px;line-height:1.5;}
.alert-green{background:#0d2818;border:1px solid var(--green2);color:var(--green);}
.alert-red{background:#2d0d0d;border:1px solid #6b2222;color:var(--red);}
.alert-gold{background:#2d1e0a;border:1px solid #6b4f0a;color:var(--gold);}
.alert-blue{background:#0d1a2d;border:1px solid #1a4a8a;color:var(--blue);}
.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;}
.page-title{font-size:22px;font-weight:800;letter-spacing:.02em;}
.page-sub{font-size:13px;color:var(--muted);margin-top:2px;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
.grid-6{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;}
@media(max-width:1100px){.grid-6{grid-template-columns:repeat(3,1fr);}.grid-4{grid-template-columns:repeat(2,1fr);}}
@media(max-width:700px){.grid-2,.grid-3,.grid-4,.grid-6{grid-template-columns:1fr;}}
.gap-2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.mt-1{margin-top:8px;}.mt-2{margin-top:16px;}.mt-3{margin-top:24px;}
.mb-1{margin-bottom:8px;}.mb-2{margin-bottom:16px;}
.text-muted{color:var(--muted);}
.text-green{color:var(--green);}
.text-red{color:var(--red);}
.text-gold{color:var(--gold);}
.text-blue{color:var(--blue);}
.mono{font-family:'Share Tech Mono',monospace;}
.progress-bar{background:var(--bg4);border-radius:4px;height:6px;overflow:hidden;}
.progress-fill{height:100%;background:var(--green);border-radius:4px;transition:width .4s;}
.progress-fill.red{background:var(--red);}
.countdown-wrap{display:flex;gap:16px;justify-content:center;}
.countdown-unit{text-align:center;}
.countdown-num{font-size:42px;font-weight:900;color:var(--green);line-height:1;font-family:'Share Tech Mono',monospace;}
.countdown-lbl{font-size:10px;letter-spacing:.15em;color:var(--muted);margin-top:2px;}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;}
.photo-cell{aspect-ratio:4/3;border-radius:6px;overflow:hidden;background:var(--bg4);position:relative;cursor:pointer;}
.photo-cell img{width:100%;height:100%;object-fit:cover;transition:transform .3s;}
.photo-cell:hover img{transform:scale(1.06);}
.qr-box{width:120px;height:120px;background:#fff;padding:8px;border-radius:6px;margin:0 auto;}
.qr-inner{width:100%;height:100%;background:repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0 0/16px 16px;}
.nav-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;}
.nav-tab{padding:10px 16px;font-size:13px;font-weight:600;background:transparent;border:none;
  color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;border-radius:0;cursor:pointer;white-space:nowrap;flex-shrink:0;}
.nav-tab:hover{color:var(--text);}
.nav-tab.active{color:var(--green);border-bottom-color:var(--green);}
.event-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;overflow:hidden;cursor:pointer;transition:border .15s;}
.event-card:hover{border-color:var(--green);}
.event-banner-img{height:120px;background:linear-gradient(135deg,#0d2818,#162035);display:flex;align-items:center;
  justify-content:center;font-size:18px;font-weight:800;color:var(--green);letter-spacing:.05em;}
.event-card-body{padding:16px;}
.shop-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;overflow:hidden;}
.shop-img{height:130px;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--muted);overflow:hidden;}
.shop-img img{width:100%;height:100%;object-fit:cover;}
.shop-body{padding:14px;}
.lb-row{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:6px;margin-bottom:6px;background:var(--bg4);}
.lb-rank{font-size:20px;font-weight:900;width:32px;text-align:center;font-family:'Share Tech Mono',monospace;color:var(--muted);}
.lb-rank.top{color:var(--gold);}
.lb-avatar{width:38px;height:38px;border-radius:50%;background:var(--bg2);border:2px solid var(--border);
  display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;overflow:hidden;flex-shrink:0;}
.lb-avatar img{width:100%;height:100%;object-fit:cover;}
.lb-games{margin-left:auto;font-size:20px;font-weight:900;color:var(--green);font-family:'Share Tech Mono',monospace;}
.accordion-item{border:1px solid var(--border);border-radius:6px;margin-bottom:8px;overflow:hidden;}
.accordion-q{padding:14px 16px;cursor:pointer;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center;}
.accordion-q:hover{background:var(--bg4);}
.accordion-a{padding:14px 16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);line-height:1.6;}

/* ── Admin shell ── */
.admin-shell{display:flex;min-height:100vh;}
.admin-sidebar{width:var(--sidebar-w);background:var(--bg2);border-right:1px solid var(--border);
  flex-shrink:0;position:fixed;top:0;left:0;height:100vh;overflow-y:auto;z-index:50;transition:transform .25s;}
.admin-main{margin-left:var(--sidebar-w);flex:1;min-height:100vh;display:flex;flex-direction:column;}
.admin-topbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:0 16px;
  height:52px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:40;}
.admin-content{padding:16px;flex:1;}
.sb-logo{padding:16px 14px 12px;border-bottom:1px solid var(--border);}
.sb-logo-text{font-size:18px;font-weight:900;letter-spacing:.02em;}
.sb-logo-text span{color:var(--green);}
.sb-time{font-size:11px;color:var(--muted);font-family:'Share Tech Mono',monospace;margin-top:3px;}
.sb-label{font-size:10px;font-weight:700;letter-spacing:.12em;color:var(--subtle);padding:0 8px;margin-bottom:6px;}
.sb-item{display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:6px;cursor:pointer;
  font-size:13px;font-weight:500;color:var(--muted);transition:all .15s;position:relative;margin-bottom:2px;}
.sb-item:hover{background:var(--bg4);color:var(--text);}
.sb-item.active{background:#238636;color:#fff;}
.sb-icon{font-size:16px;flex-shrink:0;}
.sb-badge{margin-left:auto;background:var(--red);color:#fff;border-radius:10px;
  font-size:10px;font-weight:700;padding:1px 7px;min-width:20px;text-align:center;}
.sb-badge.gold{background:var(--gold);}
.sb-badge.blue{background:var(--blue);color:#000;}
/* Admin mobile sidebar overlay */
.admin-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:49;}

/* ── Bar chart ── */
.bar-chart{display:flex;align-items:flex-end;gap:6px;height:80px;}
.bar{background:var(--green2);border-radius:3px 3px 0 0;flex:1;min-height:4px;transition:height .4s;}
.bar:hover{background:var(--green);}
.bar-labels{display:flex;gap:6px;}
.bar-label{flex:1;text-align:center;font-size:10px;color:var(--muted);padding-top:4px;}

/* ── Toast ── */
.toast{position:fixed;bottom:80px;right:16px;z-index:999;padding:12px 18px;border-radius:8px;
  font-size:13px;font-weight:600;animation:slideUp .2s ease;max-width:300px;}
.toast-green{background:#0d2818;border:1px solid var(--green);color:var(--green);}
.toast-red{background:#2d0d0d;border:1px solid var(--red);color:var(--red);}
.toast-gold{background:#2d1e0a;border:1px solid var(--gold);color:var(--gold);}
@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}

/* ── QR Scanner ── */
.qr-scanner-wrap{position:relative;width:100%;max-width:340px;margin:0 auto;}
.qr-scanner-wrap video{width:100%;border-radius:8px;display:block;}
.qr-overlay{position:absolute;inset:0;border-radius:8px;border:2px solid var(--green);pointer-events:none;}
.qr-corner{position:absolute;width:24px;height:24px;border-color:var(--green);border-style:solid;}
.qr-corner.tl{top:8px;left:8px;border-width:3px 0 0 3px;}
.qr-corner.tr{top:8px;right:8px;border-width:3px 3px 0 0;}
.qr-corner.bl{bottom:8px;left:8px;border-width:0 0 3px 3px;}
.qr-corner.br{bottom:8px;right:8px;border-width:0 3px 3px 0;}

/* ── RESPONSIVE BREAKPOINTS ── */
@media(max-width:768px){
  /* Show hamburger, hide desktop links */
  .pub-nav-links{display:none;}
  .pub-nav-hamburger{display:block;}
  .pub-nav-logo-text{display:none;}
  /* Show bottom nav */
  .bottom-nav{display:flex;}
  .pub-page-wrap{padding-bottom:var(--bottom-nav-h);}
  /* Admin: sidebar hidden by default, slides in */
  .admin-sidebar{transform:translateX(-100%);}
  .admin-sidebar.open{transform:translateX(0);}
  .admin-overlay.open{display:block;}
  .admin-main{margin-left:0;}
  .admin-content{padding:12px;}
  /* Shrink page titles */
  .page-title{font-size:18px;}
  /* Modals full width */
  .modal-box,.modal-box.wide{border-radius:16px 16px 0 0;max-width:100%;}
  /* Toast above bottom nav */
  .toast{bottom:calc(var(--bottom-nav-h) + 12px);right:12px;}
  /* Stat cards 2 col */
  .grid-4{grid-template-columns:1fr 1fr;}
  /* Countdown smaller */
  .countdown-num{font-size:32px;}
}
@media(max-width:480px){
  .grid-4{grid-template-columns:1fr 1fr;}
  .admin-content{padding:10px;}
  .card{padding:14px;}
  .stat-val{font-size:24px;}
}
`;

function Toast({ msg, type }) {
  return msg ? <div className={`toast toast-${type || "green"}`}>{msg}</div> : null;
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, type = "green") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  return [toast, show];
}

// ── Live GMT Clock ────────────────────────────────────────
function GmtClock({ style }) {
  const [time, setTime] = useState(gmtNow());
  useEffect(() => {
    const t = setInterval(() => setTime(gmtNow()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="mono" style={{ fontSize: 11, color: "var(--muted)", ...style }}>{time} GMT</span>;
}

// ── Countdown ─────────────────────────────────────────────
function Countdown({ target }) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const tick = () => setDiff(Math.max(0, new Date(target) - new Date()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <div className="countdown-wrap">
      {[["DAYS", d], ["HRS", h], ["MIN", m], ["SEC", s]].map(([l, n]) => (
        <div className="countdown-unit" key={l}>
          <div className="countdown-num">{String(n).padStart(2, "0")}</div>
          <div className="countdown-lbl">{l}</div>
        </div>
      ))}
    </div>
  );
}

// ── QR Scanner (real camera) ──────────────────────────────
function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 640, height: 480 }
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setScanning(true);
        }
      } catch (e) {
        setError("Camera access denied or unavailable. Use manual check-in instead.");
      }
    })();
    return () => {
      active = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!scanning) return;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (window.jsQR) {
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
          if (code?.data) { onScan(code.data); return; }
        }
      } catch {}
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [scanning, onScan]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">📷 Scan QR Code</div>
        {error ? (
          <div className="alert alert-red">{error}</div>
        ) : (
          <div className="qr-scanner-wrap">
            <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 8 }} />
            <div className="qr-overlay">
              <div className="qr-corner tl" /><div className="qr-corner tr" />
              <div className="qr-corner bl" /><div className="qr-corner br" />
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        )}
        <p className="text-muted" style={{ fontSize: 12, marginTop: 12, textAlign: "center" }}>
          Point camera at player's booking QR code
        </p>
        <button className="btn btn-ghost mt-2" style={{ width: "100%" }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── Auth Modal ────────────────────────────────────────────

// ── Supabase Auth Modal ───────────────────────────────────────
// Replaces the old homebrew AuthModal
function SupabaseAuthModal({ mode, setMode, onClose, showToast }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const login = async () => {
    if (!form.email || !form.password) { showToast("Email and password required", "red"); return; }
    setBusy(true);
    try {
      await api.auth.signIn({ email: form.email, password: form.password });
      showToast("Welcome back!");
      onClose();
    } catch (e) {
      showToast(e.message || "Login failed", "red");
    } finally { setBusy(false); }
  };

  const register = async () => {
    if (!form.name || !form.email || !form.password) { showToast("All fields required", "red"); return; }
    setBusy(true);
    try {
      await api.auth.signUp({ email: form.email, password: form.password, name: form.name, phone: form.phone });
      showToast("Account created! Check your email to confirm.");
      onClose();
    } catch (e) {
      showToast(e.message || "Registration failed", "red");
    } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{mode === "login" ? "🔐 Sign In" : "🎯 Create Account"}</div>
        {mode === "register" && (
          <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e => f("name", e.target.value)} placeholder="John Smith" /></div>
        )}
        <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => f("email", e.target.value)} /></div>
        <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => f("password", e.target.value)} onKeyDown={e => e.key === "Enter" && (mode === "login" ? login() : register())} /></div>
        {mode === "register" && (
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="07700..." /></div>
        )}
        {mode === "register" && (
          <div className="alert alert-blue" style={{ marginBottom: 12 }}>
            📧 You'll receive a confirmation email — click the link to activate your account.
          </div>
        )}
        <div className="gap-2 mt-2">
          <button className="btn btn-primary" disabled={busy} onClick={mode === "login" ? login : register}>
            {busy ? "Please wait…" : mode === "login" ? "Login" : "Register"}
          </button>
          <button className="btn btn-ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "New? Register →" : "Have account? Login →"}
          </button>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
function WaiverModal({ cu, updateUser, onClose, showToast, editMode, existing }) {
  const e = editMode && existing ? existing : {};
  const [form, setForm] = useState({
    name: e.name || cu?.name || "", dob: e.dob || "", fps: e.fps || false,
    medical: e.medical || "", isChild: e.isChild || false, guardian: e.guardian || "", agreed: false
  });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = () => {
    if (!form.dob) { showToast("Date of birth required", "red"); return; }
    if (!form.agreed) { showToast("Please agree to the waiver terms", "red"); return; }
    if (form.isChild && !form.guardian) { showToast("Guardian signature required for minors", "red"); return; }
    const d = { ...form, signed: true, date: new Date().toISOString() };
    if (editMode) {
      updateUser(cu.id, { waiverPending: { ...d, pendingDate: new Date().toISOString() } });
      showToast("Changes submitted for admin approval");
    } else {
      updateUser(cu.id, { waiverSigned: true, waiverYear: new Date().getFullYear(), waiverData: d, waiverPending: null });
      showToast("Waiver signed successfully!");
    }
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box wide" onClick={e => e.stopPropagation()}>
        <div className="modal-title">📋 Liability Waiver {new Date().getFullYear()}</div>
        <div className="alert alert-gold" style={{ marginBottom: 16 }}>
          Valid for {new Date().getFullYear()} calendar year only. Re-signing required each January.
        </div>
        <div className="form-row">
          <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e => f("name", e.target.value)} /></div>
          <div className="form-group"><label>Date of Birth</label><input type="date" value={form.dob} onChange={e => f("dob", e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Medical Conditions</label>
          <textarea rows={2} value={form.medical} onChange={e => f("medical", e.target.value)} placeholder="List any relevant conditions, or type 'None'" /></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <input type="checkbox" id="wchild" checked={form.isChild} onChange={e => f("isChild", e.target.checked)} />
          <label htmlFor="wchild" style={{ cursor: "pointer", fontSize: 13 }}>This waiver is for a minor (under 18)</label>
        </div>
        {form.isChild && (
          <div className="form-group"><label>Parent/Guardian Full Name (acts as signature)</label>
            <input value={form.guardian} onChange={e => f("guardian", e.target.value)} placeholder="Type full name to sign" /></div>
        )}
        <div style={{ background: "var(--bg4)", padding: 14, borderRadius: 6, fontSize: 12, color: "var(--muted)", lineHeight: 1.7, marginBottom: 14 }}>
          I understand airsoft activities carry inherent risk of injury. I agree to follow all safety rules on site, wear mandatory eye protection at all times, and acknowledge that Swindon Airsoft Ltd is not liable for injuries sustained during gameplay. I confirm all information is accurate and I am fit to participate.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
          <input type="checkbox" id="wagree" checked={form.agreed} onChange={e => f("agreed", e.target.checked)} />
          <label htmlFor="wagree" style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>I agree to the above terms and conditions</label>
        </div>
        <div className="gap-2">
          <button className="btn btn-primary" onClick={submit}>{editMode ? "Submit Changes" : "Sign Waiver"}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Public Nav ────────────────────────────────────────────
function PublicNav({ page, setPage, cu, setCu, setAuthModal }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const links = [
    { id: "home", label: "Home", icon: "🏠" },
    { id: "events", label: "Events", icon: "📅" },
    { id: "shop", label: "Shop", icon: "🛒" },
    { id: "leaderboard", label: "Leaderboard", icon: "🏆" },
    { id: "gallery", label: "Gallery", icon: "🖼" },
    { id: "qa", label: "Q&A", icon: "❓" },
  ];
  const go = (id) => { setPage(id); setDrawerOpen(false); };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCu(null);
    setDrawerOpen(false);
  };

  return (
    <>
      <nav className="pub-nav">
        <div className="pub-nav-inner">
          {/* Logo */}
          <div className="pub-nav-logo" onClick={() => go("home")}>
            <div className="pub-nav-logo-box">SA</div>
            <span className="pub-nav-logo-text">SWINDON <span style={{ color: "var(--green)" }}>AIRSOFT</span></span>
          </div>
          {/* Desktop links */}
          <div className="pub-nav-links">
            {links.map(l => (
              <button key={l.id} className={`pub-nav-link ${page === l.id ? "active" : ""}`} onClick={() => go(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          {/* Desktop actions */}
          <div className="pub-nav-actions">
            {cu ? (
              <>
                {(cu.role === "admin" || cu.role === "staff") && (
                  <button className="btn btn-sm btn-gold" onClick={() => go("admin")}>⚙ Admin</button>
                )}
                <button className="btn btn-sm btn-ghost" onClick={() => go("profile")}>{cu.name.split(" ")[0]}</button>
                <button className="btn btn-sm btn-ghost" onClick={signOut}>Sign Out</button>
              </>
            ) : (
              <>
                <button className="btn btn-sm btn-ghost" onClick={() => setAuthModal("login")}>Login</button>
                <button className="btn btn-sm btn-primary" onClick={() => setAuthModal("register")}>Register</button>
              </>
            )}
          </div>
          {/* Hamburger (mobile only) */}
          <button className="pub-nav-hamburger" onClick={() => setDrawerOpen(true)}>☰</button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`pub-nav-drawer ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)}>
        <div className="pub-nav-drawer-panel" onClick={e => e.stopPropagation()}>
          <div className="pub-nav-drawer-logo">
            SWINDON <span style={{ color: "var(--green)" }}>AIRSOFT</span>
          </div>
          {links.map(l => (
            <button key={l.id} className={`pub-nav-drawer-link ${page === l.id ? "active" : ""}`} onClick={() => go(l.id)}>
              <span style={{ fontSize: 20 }}>{l.icon}</span> {l.label}
            </button>
          ))}
          <hr className="pub-nav-drawer-divider" />
          {cu ? (
            <>
              {(cu.role === "admin" || cu.role === "staff") && (
                <button className="pub-nav-drawer-link" onClick={() => go("admin")}>
                  <span style={{ fontSize: 20 }}>⚙</span> Admin Panel
                </button>
              )}
              <button className="pub-nav-drawer-link" onClick={() => go("profile")}>
                <span style={{ fontSize: 20 }}>👤</span> {cu.name}
              </button>
              <button className="pub-nav-drawer-link" style={{ color: "var(--red)" }} onClick={signOut}>
                <span style={{ fontSize: 20 }}>🚪</span> Sign Out
              </button>
            </>
          ) : (
            <>
              <button className="pub-nav-drawer-link" onClick={() => { setAuthModal("login"); setDrawerOpen(false); }}>
                <span style={{ fontSize: 20 }}>🔐</span> Login
              </button>
              <button className="pub-nav-drawer-link" onClick={() => { setAuthModal("register"); setDrawerOpen(false); }}>
                <span style={{ fontSize: 20 }}>🎯</span> Register
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom nav (mobile only) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {[
            { id: "home", icon: "🏠", label: "Home" },
            { id: "events", icon: "📅", label: "Events" },
            { id: "shop", icon: "🛒", label: "Shop" },
            { id: "leaderboard", icon: "🏆", label: "Ranks" },
            { id: "profile", icon: "👤", label: "Profile" },
          ].map(b => (
            <button key={b.id} className={`bottom-nav-btn ${page === b.id ? "active" : ""}`} onClick={() => go(b.id)}>
              <span className="bottom-nav-icon">{b.icon}</span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

// ── Home Page ─────────────────────────────────────────────
function HomePage({ data, setPage }) {
  const nextEvent = data.events
    .filter(e => e.published && new Date(e.date + "T" + e.time) > new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px" }}>
      {data.homeMsg && <div className="alert alert-green mb-2">{data.homeMsg}</div>}

      {/* Hero */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderTop: "3px solid var(--green)", borderRadius: 8, padding: "clamp(20px,5vw,40px) clamp(16px,5vw,30px)", textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: ".2em", color: "var(--green)", marginBottom: 12, fontWeight: 700 }}>SWINDON'S #1 AIRSOFT SITE</div>
        <h1 style={{ fontSize: "clamp(36px,6vw,72px)", fontWeight: 900, lineHeight: 1, marginBottom: 14 }}>
          LOCK <span style={{ color: "var(--green)" }}>AND</span> LOAD
        </h1>
        <p style={{ color: "var(--muted)", maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.6, fontSize: 15 }}>
          Swindon's premier airsoft experience. Skirmishes, events, and the full tactical package.
        </p>
        <div className="gap-2" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" style={{ padding: "10px 28px", fontSize: 15 }} onClick={() => setPage("events")}>Book a Game Day</button>
          <button className="btn btn-ghost" style={{ padding: "10px 28px", fontSize: 15 }} onClick={() => setPage("shop")}>Visit Shop</button>
        </div>
      </div>

      {/* Countdown */}
      {nextEvent && (
        <div className="card mb-2" style={{ textAlign: "center", borderTop: "3px solid var(--green)" }}>
          <div style={{ fontSize: 10, letterSpacing: ".2em", color: "var(--muted)", marginBottom: 6, fontWeight: 700 }}>NEXT GAME DAY</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>{nextEvent.title}</div>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>{nextEvent.date} @ {nextEvent.time} GMT — {nextEvent.location}</div>
          <Countdown target={nextEvent.date + "T" + nextEvent.time + ":00"} />
          <button className="btn btn-primary mt-2" onClick={() => setPage("events")}>View &amp; Book →</button>
        </div>
      )}

      {/* Events grid */}
      <div style={{ fontSize: 11, letterSpacing: ".15em", fontWeight: 700, color: "var(--muted)", marginBottom: 12, marginTop: 24 }}>UPCOMING EVENTS</div>
      <div className="grid-3 mb-2">
        {data.events.filter(e => e.published).slice(0, 3).map(ev => {
          const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
          const total = ev.walkOnSlots + ev.rentalSlots;
          return (
            <div key={ev.id} className="event-card">
              <div className="event-banner-img">{ev.banner ? <img src={ev.banner} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : ev.title}</div>
              <div className="event-card-body">
                <div className="gap-2 mb-1">
                  <span className="tag tag-green">{ev.date}</span>
                  <span className="tag tag-blue">{ev.time} GMT</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, margin: "8px 0 4px" }}>{ev.title}</div>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 10 }}>{ev.location}</div>
                <div className="progress-bar mb-1"><div className="progress-fill" style={{ width: Math.min(100, booked / total * 100) + "%" }} /></div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{booked}/{total} booked</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Events Page ───────────────────────────────────────────
function EventsPage({ data, cu, updateEvent, updateUser, showToast, setAuthModal, save }) {
  const [detail, setDetail] = useState(null);
  const [waiverModal, setWaiverModal] = useState(false);
  const [tab, setTab] = useState("info");
  const [ticketType, setTicketType] = useState("walkOn");
  const [qty, setQty] = useState(1);
  const [extras, setExtras] = useState({});

  const ev = detail ? data.events.find(e => e.id === detail) : null;

  if (ev) {
    const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
    const total = ev.walkOnSlots + ev.rentalSlots;
    const price = ticketType === "walkOn" ? ev.walkOnPrice : ev.rentalPrice;
    const vipDisc = cu?.vipStatus === "active" ? 0.1 : 0;
    const extrasTotal = ev.extras.reduce((s, ex) => s + (extras[ex.id] || 0) * ex.price, 0);
    const grandTotal = price * qty * (1 - vipDisc) + extrasTotal;
    const waiverValid = (cu?.waiverSigned && cu?.waiverYear === new Date().getFullYear()) || cu?.role === "admin" || cu?.role === "staff";
    const myBooking = cu && ev.bookings.find(b => b.userId === cu.id);

    const doBook = async () => {
      if (!cu) { setAuthModal("login"); return; }
      if (!waiverValid) { setWaiverModal(true); return; }
      if (booked + qty > total) { showToast("Not enough slots available", "red"); return; }
      if (myBooking) { showToast("You already have a booking for this event", "red"); return; }
      try {
        await api.bookings.create({
          eventId: ev.id,
          userId: cu.id,
          userName: cu.name,
          type: ticketType,
          qty,
          extras,
          total: grandTotal,
        });
        // Refresh events to show new booking
        const evList = await api.events.getAll();
        save({ events: evList });
        showToast("🎉 Booking confirmed!");
      } catch (e) {
        console.error("Booking failed:", e);
        showToast("Booking failed: " + e.message, "red");
      }
    };

    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
        <button className="btn btn-ghost btn-sm mb-2" onClick={() => { setDetail(null); setTab("info"); setExtras({}); }}>← Back to Events</button>
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ height: 160, background: "linear-gradient(135deg,#0d2010,#111827)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: "var(--green)", letterSpacing: ".04em" }}>
            {ev.banner ? <img src={ev.banner} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : ev.title}
          </div>
          <div style={{ padding: 20 }}>
            <div className="gap-2 mb-1">
              <h2 style={{ fontSize: 24, fontWeight: 800 }}>{ev.title}</h2>
              {myBooking && <span className="tag tag-green">✓ BOOKED</span>}
            </div>
            <div className="gap-2 mb-2">
              <span className="tag tag-green">{ev.date}</span>
              <span className="tag tag-blue">{ev.time} GMT</span>
              <span className="tag tag-purple">{ev.location}</span>
              <span style={{ fontSize: 12, color: booked / total > 0.8 ? "var(--red)" : "var(--muted)" }}>{booked}/{total} slots</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
              <div className={`progress-fill ${booked / total > 0.8 ? "red" : ""}`} style={{ width: Math.min(100, booked / total * 100) + "%" }} />
            </div>
          </div>
        </div>

        <div className="nav-tabs">
          {["info", "map"].map(t => <button key={t} className={`nav-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
        </div>

        {tab === "info" && (
          <div>
            <div className="card mb-2">
              <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 18 }}>{ev.description}</p>
              <div className="form-row mb-2">
                <div style={{ background: "var(--bg4)", borderRadius: 6, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "var(--green)" }}>£{ev.walkOnPrice}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Walk-On Ticket</div>
                  <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 2 }}>{ev.walkOnSlots} slots</div>
                </div>
                <div style={{ background: "var(--bg4)", borderRadius: 6, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "var(--gold)" }}>£{ev.rentalPrice}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Rental Package</div>
                  <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 2 }}>{ev.rentalSlots} slots</div>
                </div>
              </div>
              {ev.extras.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, letterSpacing: ".1em", fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>AVAILABLE EXTRAS</div>
                  {ev.extras.map(ex => (
                    <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <span>{ex.name} {ex.noPost && <span className="tag tag-red" style={{ fontSize: 10, marginLeft: 6 }}>Collection Only</span>}</span>
                      <span className="text-green">£{ex.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Inline booking on Info tab ── */}
            <div className="card" style={{ borderTop: "3px solid var(--green)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 16 }}>BOOK THIS EVENT</div>
              {!cu && <div className="alert alert-gold mb-2">You must be <button className="btn btn-sm btn-ghost" style={{ marginLeft: 4 }} onClick={() => setAuthModal("login")}>logged in</button> to book.</div>}
              {cu && !waiverValid && <div className="alert alert-red mb-2">⚠️ A signed waiver is required before booking. <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setWaiverModal(true)}>Sign Waiver</button></div>}
              {cu?.vipStatus === "active" && <div className="alert alert-green mb-2">⭐ VIP 10% discount applied</div>}
              {myBooking ? (
                <div>
                  <div className="alert alert-green">✓ You're booked in for this event!</div>
                  <div className="mt-2 text-muted" style={{ fontSize: 12 }}>Your check-in QR code:</div>
                  <div style={{ margin: "10px 0" }}><QRCode value={myBooking.id} size={120} /></div>
                  <div className="text-muted mt-1" style={{ fontSize: 10 }}>Booking ID: {myBooking.id}</div>
                </div>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Ticket Type</label>
                      <select value={ticketType} onChange={e => setTicketType(e.target.value)}>
                        <option value="walkOn">Walk-On — £{ev.walkOnPrice}</option>
                        <option value="rental">Rental Package — £{ev.rentalPrice}</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Number of Tickets</label>
                      <input type="number" min={1} max={10} value={qty} onChange={e => setQty(Math.max(1, +e.target.value))} />
                    </div>
                  </div>
                  {ev.extras.length > 0 && (
                    <div className="mb-2">
                      <div style={{ fontSize: 11, letterSpacing: ".1em", fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>ADD EXTRAS</div>
                      {ev.extras.map(ex => (
                        <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ fontSize: 13 }}>{ex.name} — <span className="text-green">£{ex.price}</span>{ex.noPost && <span className="tag tag-red" style={{ fontSize: 10, marginLeft: 6 }}>Collect Only</span>}</span>
                          <input type="number" min={0} max={20} value={extras[ex.id] || 0} onChange={e => setExtras(p => ({ ...p, [ex.id]: +e.target.value }))} style={{ width: 70 }} />
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ background: "var(--bg4)", padding: 14, borderRadius: 6, marginBottom: 16 }}>
                    {[
                      ["Tickets", `£${(price * qty).toFixed(2)}`],
                      vipDisc > 0 ? ["VIP Discount", `-£${(price * qty * vipDisc).toFixed(2)}`] : null,
                      extrasTotal > 0 ? ["Extras", `£${extrasTotal.toFixed(2)}`] : null,
                      cu?.credits > 0 ? [`Credits (£${cu.credits} available)`, "Applied at checkout"] : null,
                    ].filter(Boolean).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                        <span className="text-muted">{k}</span><span>{v}</span>
                      </div>
                    ))}
                    <div className="divider" style={{ margin: "8px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20 }}>
                      <span>TOTAL</span><span className="text-green">£{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%", padding: "11px", fontSize: 14 }} onClick={doBook}>
                    {waiverValid ? "Confirm Booking" : "Sign Waiver & Book"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "map" && (
          <div className="card">
            {ev.mapEmbed ? <div dangerouslySetInnerHTML={{ __html: ev.mapEmbed }} /> : (
              <div style={{ height: 160, background: "var(--bg4)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>No map configured for this event</div>
            )}
            <p className="text-muted mt-1" style={{ fontSize: 13 }}>{ev.location}</p>
          </div>
        )}

        {waiverModal && <WaiverModal cu={cu} updateUser={updateUser} onClose={() => setWaiverModal(false)} showToast={showToast} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px" }}>
      <div className="page-header">
        <div><div className="page-title">Events</div><div className="page-sub">Book your next game day</div></div>
      </div>
      <div className="grid-3">
        {data.events.filter(e => e.published).map(ev => {
          const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
          const total = ev.walkOnSlots + ev.rentalSlots;
          return (
            <div key={ev.id} className="event-card" onClick={() => { setDetail(ev.id); setTab("info"); setExtras({}); setQty(1); }}>
              <div className="event-banner-img">{ev.banner ? <img src={ev.banner} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : ev.title}</div>
              <div className="event-card-body">
                <div className="gap-2 mb-1"><span className="tag tag-green">{ev.date}</span><span className="tag tag-blue">{ev.time} GMT</span></div>
                <div style={{ fontWeight: 700, fontSize: 16, margin: "8px 0 4px" }}>{ev.title}</div>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>{ev.location}</div>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>{ev.description?.slice(0, 90)}…</p>
                <div className="form-row" style={{ gap: 8 }}>
                  <div style={{ background: "var(--bg4)", padding: "8px 0", borderRadius: 6, textAlign: "center" }}>
                    <div style={{ fontWeight: 900, color: "var(--green)" }}>£{ev.walkOnPrice}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>Walk-On</div>
                  </div>
                  <div style={{ background: "var(--bg4)", padding: "8px 0", borderRadius: 6, textAlign: "center" }}>
                    <div style={{ fontWeight: 900, color: "var(--gold)" }}>£{ev.rentalPrice}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>Rental</div>
                  </div>
                </div>
                <div className="progress-bar mt-2"><div className="progress-fill" style={{ width: Math.min(100, booked / total * 100) + "%" }} /></div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{booked}/{total} booked</div>
                <button className="btn btn-primary mt-2" style={{ width: "100%" }}>View Details & Book →</button>
              </div>
            </div>
          );
        })}
        {data.events.filter(e => e.published).length === 0 && <div className="card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--muted)", padding: 40 }}>No events published yet.</div>}
      </div>
    </div>
  );
}

// ── Shop ──────────────────────────────────────────────────
function ShopPage({ data, cu, showToast }) {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [postageId, setPostageId] = useState("post1");
  const postage = (data.postageOptions || []).find(p => p.id === postageId) || { name: "Collection", price: 0 };
  const hasNoPost = cart.some(i => i.noPost);

  const addToCart = (item) => {
    setCart(c => { const ex = c.find(x => x.id === item.id); return ex ? c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...item, qty: 1 }]; });
    showToast(item.name + " added to cart");
  };

  const subTotal = cart.reduce((s, i) => { const p = i.onSale && i.salePrice ? i.salePrice : i.price; return s + p * i.qty * (cu?.vipStatus === "active" ? 0.9 : 1); }, 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px" }}>
      <div className="page-header">
        <div><div className="page-title">Shop</div><div className="page-sub">Gear up for battle</div></div>
        <button className="btn btn-ghost" onClick={() => setCartOpen(true)}>
          🛒 Cart {cart.length > 0 && <span style={{ background: "var(--green)", color: "#000", borderRadius: 10, padding: "1px 7px", fontSize: 11, marginLeft: 6, fontWeight: 700 }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>}
        </button>
      </div>
      {cu?.vipStatus === "active" && <div className="alert alert-gold mb-2">⭐ VIP member — 10% discount applied</div>}
      {hasNoPost && <div className="alert alert-red mb-2">🔥 Your cart contains pyro/collection-only items — these cannot be posted</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
        {data.shop.map(item => {
          const dp = item.onSale && item.salePrice ? item.salePrice : item.price;
          const vipP = cu?.vipStatus === "active" ? (dp * 0.9).toFixed(2) : null;
          return (
            <div key={item.id} className="shop-card">
              <div className="shop-img">{item.image ? <img src={item.image} alt="" /> : "📦"}</div>
              <div className="shop-body">
                <div className="gap-2 mb-1">
                  {item.onSale && <span className="tag tag-red">SALE</span>}
                  {item.noPost && <span className="tag tag-gold">Collect Only</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{item.name}</div>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>{item.description}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    {item.onSale && <span className="text-muted" style={{ textDecoration: "line-through", fontSize: 12, marginRight: 6 }}>£{item.price}</span>}
                    <span style={{ fontWeight: 900, fontSize: 22, color: "var(--green)" }}>£{vipP || dp}</span>
                    {vipP && <span className="text-gold" style={{ fontSize: 10, marginLeft: 4 }}>VIP</span>}
                  </div>
                  <span className="text-muted" style={{ fontSize: 11 }}>Stock: {item.stock}</span>
                </div>
                <button className="btn btn-primary" style={{ width: "100%" }} disabled={item.stock < 1} onClick={() => addToCart(item)}>
                  {item.stock < 1 ? "Out of Stock" : "Add to Cart"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🛒 Cart</div>
            {cart.length === 0 ? <p className="text-muted">Your cart is empty.</p> : (
              <>
                {cart.map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <span>{item.name} ×{item.qty}</span>
                    <div className="gap-2">
                      <span className="text-green">£{((item.onSale && item.salePrice ? item.salePrice : item.price) * item.qty).toFixed(2)}</span>
                      <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }} onClick={() => setCart(c => c.filter(x => x.id !== item.id))}>✕</button>
                    </div>
                  </div>
                ))}
                {!hasNoPost && (data.postageOptions || []).length > 0 && (
                  <div className="form-group mt-2">
                    <label>Postage</label>
                    <select value={postageId} onChange={e => setPostageId(e.target.value)}>
                      {(data.postageOptions || []).map(p => <option key={p.id} value={p.id}>{p.name} — £{p.price.toFixed(2)}</option>)}
                    </select>
                  </div>
                )}
                {hasNoPost && <div className="alert alert-gold mt-1">Pyro items — collect at game day only</div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20, marginTop: 14 }}>
                  <span>TOTAL</span>
                  <span className="text-green">£{(subTotal + (hasNoPost ? 0 : postage.price)).toFixed(2)}</span>
                </div>
                <button className="btn btn-primary mt-2" style={{ width: "100%", padding: "11px" }} onClick={() => { showToast("Order placed! (Demo — connect payment gateway)"); setCart([]); setCartOpen(false); }}>
                  Place Order
                </button>
              </>
            )}
            <button className="btn btn-ghost mt-1" style={{ width: "100%" }} onClick={() => setCartOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────
function LeaderboardPage({ data, cu, updateUser, showToast }) {
  const board = data.users
    .filter(u => !u.leaderboardOptOut && u.role === "player")
    .sort((a, b) => b.gamesAttended - a.gamesAttended);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px" }}>
      <div className="page-header">
        <div><div className="page-title">Leaderboard</div><div className="page-sub">Ranked by game days attended — dedication, not kills</div></div>
      </div>
      {cu?.role === "player" && (
        <div className="card mb-2" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>Show my name on the leaderboard</span>
          <div className="gap-2">
            <span className="text-muted" style={{ fontSize: 12 }}>{cu.leaderboardOptOut ? "Hidden" : "Visible"}</span>
            <button className={`btn btn-sm ${cu.leaderboardOptOut ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { updateUser(cu.id, { leaderboardOptOut: !cu.leaderboardOptOut }); showToast("Preference saved"); }}>
              {cu.leaderboardOptOut ? "Opt In" : "Opt Out"}
            </button>
          </div>
        </div>
      )}
      <div>
        {board.map((u, i) => (
          <div key={u.id} className="lb-row">
            <div className={`lb-rank ${i < 3 ? "top" : ""}`}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
            <div className="lb-avatar">{u.profilePic ? <img src={u.profilePic} alt="" /> : u.name[0]}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
              <div className="gap-2 mt-1">{u.vipStatus === "active" && <span className="tag tag-gold">⭐ VIP</span>}</div>
            </div>
            <div className="lb-games">{u.gamesAttended}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>games</div>
          </div>
        ))}
        {board.length === 0 && <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No players on the leaderboard yet.</div>}
      </div>
    </div>
  );
}

// ── Gallery ───────────────────────────────────────────────
function GalleryPage({ data }) {
  const [active, setActive] = useState(null);
  const albums = active ? data.albums.filter(a => a.id === active) : data.albums;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px" }}>
      <div className="page-header"><div className="page-title">Gallery</div></div>
      <div className="gap-2 mb-2">
        <button className={`btn btn-sm ${!active ? "btn-primary" : "btn-ghost"}`} onClick={() => setActive(null)}>All</button>
        {data.albums.map(a => <button key={a.id} className={`btn btn-sm ${active === a.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setActive(a.id)}>{a.title}</button>)}
      </div>
      {albums.map(album => (
        <div key={album.id} className="mb-2">
          <div style={{ fontSize: 11, letterSpacing: ".1em", fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>{album.title.toUpperCase()}</div>
          {album.images.length === 0
            ? <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>No photos yet.</div>
            : <div className="photo-grid">{album.images.map((img, i) => <div key={i} className="photo-cell"><img src={img} alt="" /></div>)}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Q&A ───────────────────────────────────────────────────
function QAPage({ data }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px" }}>
      <div className="page-header"><div><div className="page-title">Q&amp;A</div><div className="page-sub">Got questions? We've got answers.</div></div></div>
      {data.qa.map(item => (
        <div key={item.id} className="accordion-item">
          <div className="accordion-q" onClick={() => setOpen(open === item.id ? null : item.id)}>
            <span>{item.q}</span><span className="text-green">{open === item.id ? "−" : "+"}</span>
          </div>
          {open === item.id && <div className="accordion-a">{item.a}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────
function ProfilePage({ data, cu, updateUser, showToast, save }) {
  const [tab, setTab] = useState("profile");
  const [edit, setEdit] = useState({ name: cu.name, phone: cu.phone || "", address: cu.address || "" });
  const [waiverModal, setWaiverModal] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const waiverValid = (cu.waiverSigned && cu.waiverYear === new Date().getFullYear()) || cu.role === "admin" || cu.role === "staff";
  const myBookings = data.events.flatMap(ev => ev.bookings.filter(b => b.userId === cu.id).map(b => ({ ...b, eventTitle: ev.title, eventDate: ev.date })));

  // Count actual checked-in games from booking records — source of truth
  const actualGamesAttended = myBookings.filter(b => b.checkedIn).length;
  // Use the higher of stored count vs actual (in case bookings haven't all loaded)
  const gamesAttended = Math.max(cu.gamesAttended || 0, actualGamesAttended);
  const canApplyVip = gamesAttended >= 3 && cu.vipStatus === "none" && !cu.vipApplied;

  const handlePic = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = (ev) => updateUser(cu.id, { profilePic: ev.target.result }); r.readAsDataURL(file);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px solid var(--green)", overflow: "hidden", background: "var(--bg4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>
              {cu.profilePic ? <img src={cu.profilePic} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : cu.name[0]}
            </div>
            <label style={{ position: "absolute", bottom: 0, right: 0, background: "var(--green)", color: "#000", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}>
              📷<input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePic} />
            </label>
          </div>
          <div>
            <div className="page-title">{cu.name}</div>
            <div className="gap-2 mt-1">
              {cu.vipStatus === "active" && <span className="tag tag-gold">⭐ VIP</span>}
              <span className="tag tag-green">{gamesAttended} Games</span>
              {cu.credits > 0 && <span className="tag tag-blue">£{cu.credits} Credits</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="nav-tabs">
        {["profile", "waiver", "bookings", "vip"].map(t => <button key={t} className={`nav-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
      </div>

      {tab === "profile" && (
        <div className="card">
          <div className="form-row">
            <div className="form-group"><label>Full Name</label><input value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="form-group"><label>Phone</label><input value={edit.phone} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Address</label><textarea rows={2} value={edit.address} onChange={e => setEdit(p => ({ ...p, address: e.target.value }))} /></div>
          <div className="gap-2">
            <button className="btn btn-primary" onClick={() => { updateUser(cu.id, edit); showToast("Profile updated!"); }}>Save</button>
            <button className="btn btn-danger" onClick={() => setDelConfirm(true)}>Request Account Deletion</button>
          </div>
          {delConfirm && (
            <div className="alert alert-red mt-2">
              <div style={{ marginBottom: 10, fontSize: 13 }}>This will flag your account for deletion. You'll lose access. Confirm?</div>
              <div className="gap-2">
                <button className="btn btn-danger btn-sm" onClick={() => { updateUser(cu.id, { deleteRequest: true }); showToast("Deletion request sent", "red"); setDelConfirm(false); }}>Confirm</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDelConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "waiver" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Waiver Status</div>
              {waiverValid ? <span className="tag tag-green">✓ Signed {cu.waiverYear}</span> : <span className="tag tag-red">✗ Not Signed</span>}
            </div>
            {waiverValid
              ? <button className="btn btn-ghost btn-sm" onClick={() => setWaiverModal("edit")}>Request Changes</button>
              : <button className="btn btn-primary btn-sm" onClick={() => setWaiverModal("new")}>Sign Waiver {new Date().getFullYear()}</button>}
          </div>
          {cu.waiverPending && <div className="alert alert-gold">⏳ Changes submitted — awaiting admin approval</div>}
          {cu.waiverData && (
            <div style={{ marginTop: 12 }}>
              {[["Name", cu.waiverData.name], ["DOB", cu.waiverData.dob], ["Medical", cu.waiverData.medical || "None"], ["Signed", gmtShort(cu.waiverData.date)]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span className="text-muted" style={{ minWidth: 130 }}>{k}:</span><span>{v}</span>
                </div>
              ))}
            </div>
          )}
          {waiverModal && <WaiverModal cu={cu} updateUser={updateUser} onClose={() => setWaiverModal(false)} showToast={showToast} editMode={waiverModal === "edit"} existing={cu.waiverData} />}
        </div>
      )}

      {tab === "bookings" && (
        <div>
          {myBookings.length === 0 ? <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No bookings yet.</div> : (
            myBookings.map(b => (
              <div key={b.id} className="card mb-1">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{b.eventTitle}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{b.eventDate} — {b.type === "walkOn" ? "Walk-On" : "Rental"} ×{b.qty}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900, fontSize: 20, color: "var(--green)" }}>£{b.total.toFixed(2)}</div>
                    <div className="mt-1">{b.checkedIn ? <span className="tag tag-green">✓ Checked In</span> : <span className="tag tag-blue">Booked</span>}</div>
                  </div>
                </div>
                {!b.checkedIn && (
                  <div style={{ marginTop: 14 }}>
                    <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>Your check-in QR code:</div>
                    <QRCode value={b.id} size={120} />
                    <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>ID: {b.id}</div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "vip" && (
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>VIP Membership</div>
          <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>VIP members receive 10% off all game days and shop purchases, plus UKARA ID registration.</p>
          {[
            { label: "Games Attended", value: `${gamesAttended} / 3 required`, ok: gamesAttended >= 3 },
            { label: "VIP Status", value: cu.vipStatus === "active" ? "Active" : cu.vipApplied ? "Application Pending" : "Not Applied", ok: cu.vipStatus === "active" },
            { label: "UKARA ID", value: cu.ukara || "Not assigned", ok: !!cu.ukara },
            { label: "VIP Discount", value: "10% off game days & shop", ok: cu.vipStatus === "active" },
          ].map(({ label, value, ok }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "var(--bg4)", borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
              <span className="text-muted">{label}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{value} <span style={{ color: ok ? "var(--green)" : "var(--subtle)" }}>{ok ? "✓" : "○"}</span></span>
            </div>
          ))}
          {canApplyVip && <button className="btn btn-gold mt-2" onClick={() => { updateUser(cu.id, { vipApplied: true }); showToast("VIP application submitted!"); }}>Apply for VIP Membership</button>}
          {cu.vipApplied && cu.vipStatus !== "active" && <div className="alert alert-blue mt-2">⏳ Application pending admin review</div>}
          {cu.vipStatus === "active" && <div className="alert alert-gold mt-2">⭐ You are an active VIP member!</div>}
          {!canApplyVip && !cu.vipApplied && cu.vipStatus !== "active" && <div className="alert alert-gold mt-2">Need {Math.max(0, 3 - gamesAttended)} more game(s) to be eligible for VIP.</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════

function AdminPanel({ data, cu, save, updateUser, updateEvent, showToast, setPage }) {
  const [section, setSection] = useState("dashboard");
  const isMain = cu.role === "admin";

  const hasPerm = (p) => isMain || cu.permissions?.includes(p) || cu.permissions?.includes("all");

  const pendingWaivers = data.users.filter(u => u.waiverPending).length;
  const pendingVip = data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length;  const deleteReqs = data.users.filter(u => u.deleteRequest).length;
  const unsigned = data.users.filter(u => u.role === "player" && !u.waiverSigned).length;
  const upcomingEvents = data.events.filter(e => e.published && new Date(e.date) >= new Date()).length;
  const totalBookings = data.events.flatMap(e => e.bookings).length;
  const checkins = data.events.flatMap(e => e.bookings).filter(b => b.checkedIn).length;

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "📊", group: "OPERATIONS" },
    { id: "bookings", label: "Bookings & Check-In", icon: "🎟", badge: totalBookings, badgeColor: "blue", group: null },
    { id: "events", label: "Events", icon: "📅", badge: upcomingEvents, group: null },
    { id: "players", label: "Players", icon: "👥", badge: pendingVip > 0 ? pendingVip : (deleteReqs > 0 ? deleteReqs : null), badgeColor: pendingVip > 0 ? "gold" : "", group: null },
    { id: "waivers", label: "Waivers", icon: "📋", badge: pendingWaivers || unsigned || null, group: null },
    { id: "shop", label: "Shop", icon: "🛒", group: null },
    { id: "leaderboard-admin", label: "Leaderboard", icon: "🏆", group: null },
    { id: "revenue", label: "Revenue", icon: "💰", group: "ANALYTICS" },
    { id: "gallery-admin", label: "Gallery", icon: "🖼", group: null },
    { id: "qa-admin", label: "Q&A", icon: "❓", group: null },
    { id: "messages", label: "Site Messages", icon: "📢", group: null },
    { id: "cash", label: "Cash Sales", icon: "💵", group: "TOOLS" },
    ...(isMain ? [{ id: "staff", label: "Staff", icon: "🔑", group: null }] : []),
  ];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-shell">
      {/* Mobile overlay */}
      <div className={`admin-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sb-logo">
          <div className="sb-logo-text">SWINDON <span>AIRSOFT</span></div>
          <div className="sb-time"><GmtClock /></div>
        </div>
        <div style={{ padding: "8px 8px 0" }}>
          {NAV.map((item, idx) => {
            const showGroup = item.group && (idx === 0 || NAV[idx - 1]?.group !== item.group);
            return (
              <div key={item.id}>
                {showGroup && <div className="sb-label" style={{ marginTop: idx > 0 ? 16 : 8 }}>{item.group}</div>}
                <div className={`sb-item ${section === item.id ? "active" : ""}`} onClick={() => { setSection(item.id); setSidebarOpen(false); }}>
                  <span className="sb-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge > 0 && <span className={`sb-badge ${item.badgeColor || ""}`}>{item.badge}</span>}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 16, padding: "0 0 16px" }}>
            <div className="sb-label">SYSTEM</div>
            <div className="sb-item" onClick={() => setPage("home")}>
              <span className="sb-icon">🌐</span><span>Exit Admin</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)", padding: "5px 10px", borderRadius: 6, fontSize: 16 }}>☰</button>
            <div style={{ fontWeight: 800, fontSize: 14 }}>⚙ ADMIN</div>
          </div>
          <div className="gap-2" style={{ alignItems: "center" }}>
            <GmtClock />
            <button className="btn btn-sm btn-ghost" onClick={() => setPage("home")}>← Site</button>
          </div>
        </div>
        <div className="admin-content">
          {section === "dashboard" && <AdminDash data={data} setSection={setSection} />}
          {section === "bookings" && <AdminBookingsCheckin data={data} save={save} updateEvent={updateEvent} updateUser={updateUser} showToast={showToast} />}
          {section === "events" && <AdminEvents data={data} save={save} updateEvent={updateEvent} showToast={showToast} />}
          {section === "players" && <AdminPlayers data={data} save={save} updateUser={updateUser} showToast={showToast} />}
          {section === "waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "shop" && <AdminShop data={data} save={save} showToast={showToast} />}
          {section === "leaderboard-admin" && <AdminLeaderboard data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "revenue" && <AdminRevenue data={data} />}
          {section === "gallery-admin" && <AdminGallery data={data} save={save} showToast={showToast} />}
          {section === "qa-admin" && <AdminQA data={data} save={save} showToast={showToast} />}
          {section === "messages" && <AdminMessages data={data} save={save} showToast={showToast} />}
          {section === "cash" && <AdminCash data={data} cu={cu} showToast={showToast} />}
          {section === "staff" && isMain && <AdminStaff data={data} save={save} showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────
function AdminDash({ data, setSection }) {
  const allBookings = data.events.flatMap(e => e.bookings);
  const revenue = allBookings.reduce((s, b) => s + b.total, 0);
  const checkins = allBookings.filter(b => b.checkedIn).length;
  const players = data.users.filter(u => u.role === "player").length;
  const unsigned = data.users.filter(u => u.role === "player" && !u.waiverSigned).length;
  const activeEvents = data.events.filter(e => e.published && new Date(e.date) >= new Date()).length;
  const pendingWaivers = data.users.filter(u => u.waiverPending).length;

  // Weekly bookings bar chart
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const weekCounts = [0, 0, 0, 0, 0, 0, 0];
  allBookings.forEach(b => {
    const d = new Date(b.date).getDay();
    weekCounts[(d + 6) % 7]++;
  });
  const maxBar = Math.max(...weekCounts, 1);

  const alerts = [
    unsigned > 0 && { msg: `${unsigned} player(s) with unsigned waivers.`, section: "waivers" },
    pendingWaivers > 0 && { msg: `${pendingWaivers} waiver change request(s) pending approval.`, section: "waivers" },
    data.users.filter(u => u.deleteRequest).length > 0 && { msg: `${data.users.filter(u => u.deleteRequest).length} account deletion request(s).`, section: "players" },
    data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length > 0 && { msg: `${data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length} VIP application(s) awaiting review.`, section: "players" },
  ].filter(Boolean);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Dashboard</div><div className="page-sub">Operations overview · All times GMT</div></div>
        <GmtClock />
      </div>

      <div className="grid-6 mb-2">
        {[
          { label: "Total Revenue", val: `£${revenue.toFixed(0)}`, sub: "From bookings", icon: "💰", color: "" },
          { label: "Bookings", val: allBookings.length, sub: `${data.events.length} events`, icon: "🎟", color: "gold" },
          { label: "Registered Players", val: players, sub: "Active accounts", icon: "👥", color: "blue" },
          { label: "Unsigned Waivers", val: unsigned, sub: unsigned > 0 ? "Action required" : "All clear", icon: "📋", color: unsigned > 0 ? "red" : "", subColor: unsigned > 0 ? "red" : "" },
          { label: "Active Events", val: activeEvents, sub: "Upcoming", icon: "📅", color: "teal" },
          { label: "Check-Ins", val: checkins, sub: "All events", icon: "✅", color: "purple" },
        ].map(({ label, val, sub, icon, color, subColor }) => (
          <div key={label} className={`stat-card ${color}`}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-val">{val}</div>
            <div className="stat-label">{label}</div>
            <div className={`stat-sub ${subColor || ""}`}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 14 }}>WEEKLY BOOKINGS</div>
          <div style={{ fontSize: 11, color: "var(--subtle)", marginBottom: 10 }}>Last 7 days</div>
          <div className="bar-chart">
            {weekCounts.map((c, i) => (
              <div key={i} className="bar" style={{ height: (c / maxBar * 72 + (c > 0 ? 8 : 4)) + "px" }} title={`${days[i]}: ${c}`} />
            ))}
          </div>
          <div className="bar-labels">{days.map((d, i) => <div key={i} className="bar-label">{d}</div>)}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 14 }}>ALERTS</div>
          {alerts.length === 0 ? (
            <div className="alert alert-green">✓ All clear — no actions required</div>
          ) : (
            alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#2d0d0d", border: "1px solid #6b2222", borderRadius: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--red)" }}>● {a.msg}</span>
                <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => setSection(a.section)}>View →</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Admin Check-In ────────────────────────────────────────
// ── Admin Bookings & Check-In (merged) ────────────────────
function AdminBookingsCheckin({ data, save, updateEvent, updateUser, showToast }) {
  const [tab, setTab] = useState("all");
  const [evId, setEvId] = useState(data.events[0]?.id || "");
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const ev = data.events.find(e => e.id === evId);

  const allBookings = data.events.flatMap(ev =>
    ev.bookings.map(b => ({ ...b, eventTitle: ev.title, eventDate: ev.date, eventObj: ev }))
  );

  const doCheckin = async (booking, evObj) => {
    try {
      const actualCount = await api.bookings.checkIn(booking.id, booking.userId);
      const evList = await api.events.getAll();
      save({ events: evList });
      // Update local user games count with the accurate DB value
      const u = data.users.find(x => x.id === booking.userId);
      if (u) updateUser(u.id, { gamesAttended: actualCount });
      showToast(`✅ ${booking.userName} checked in! Games attended: ${actualCount}`);
    } catch (e) {
      showToast("Check-in failed: " + e.message, "red");
    }
  };

  const manualCheckin = () => {
    if (!ev || !manual) return;
    const b = ev.bookings.find(x =>
      x.userName.toLowerCase().includes(manual.toLowerCase()) || x.id === manual.trim()
    );
    if (!b) { showToast("Booking not found", "red"); return; }
    if (b.checkedIn) { showToast("Already checked in", "red"); return; }
    doCheckin(b, ev); setManual("");
  };

  const onQRScan = (code) => {
    setScanning(false);
    // Search across all events for the booking ID
    for (const evObj of data.events) {
      const b = evObj.bookings.find(x => x.id === code);
      if (b) {
        if (b.checkedIn) { showToast(`${b.userName} is already checked in`, "red"); return; }
        doCheckin(b, evObj); return;
      }
    }
    showToast("QR code not recognised", "red");
  };

  const downloadList = () => {
    if (!ev) return;
    const rows = ["Name,Type,Qty,Total,Checked In",
      ...ev.bookings.map(b => `${b.userName},${b.type},${b.qty},${b.total.toFixed(2)},${b.checkedIn}`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv," + encodeURIComponent(rows);
    a.download = ev.title + "-players.csv"; a.click();
    showToast("Player list downloaded!");
  };

  const checkedInCount = ev ? ev.bookings.filter(b => b.checkedIn).length : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Bookings &amp; Check-In</div>
          <div className="page-sub">{allBookings.length} total bookings · {allBookings.filter(b => b.checkedIn).length} checked in</div>
        </div>
        <div className="gap-2">
          <button className="btn btn-primary" onClick={() => setScanning(true)}>📷 Scan QR</button>
          <button className="btn btn-ghost" onClick={downloadList}>⬇ Download List</button>
        </div>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>All Bookings</button>
        <button className={`nav-tab ${tab === "checkin" ? "active" : ""}`} onClick={() => setTab("checkin")}>Check-In by Event</button>
      </div>

      {tab === "all" && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead>
              <tr>
                <th>Player</th><th>Event</th><th>Date Booked</th><th>Type</th>
                <th>Qty</th><th>Total</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {allBookings.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No bookings yet</td></tr>
              )}
              {allBookings.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.userName}</td>
                  <td>{b.eventTitle}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{gmtShort(b.date)}</td>
                  <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                  <td>{b.qty}</td>
                  <td className="text-green">£{b.total.toFixed(2)}</td>
                  <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                  <td>
                    {!b.checkedIn
                      ? <button className="btn btn-sm btn-primary" onClick={() => doCheckin(b, b.eventObj)}>✓ Check In</button>
                      : <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "checkin" && (
        <div>
          <div className="grid-2 mb-2">
            <div className="form-group" style={{ margin: 0 }}>
              <label>Select Event</label>
              <select value={evId} onChange={e => setEvId(e.target.value)}>
                {data.events.map(e => <option key={e.id} value={e.id}>{e.title} — {e.date}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5, letterSpacing: ".06em", textTransform: "uppercase" }}>Manual Name / Booking ID</div>
                <input value={manual} onChange={e => setManual(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && manualCheckin()}
                  placeholder="Search player name or paste booking ID" />
              </div>
              <button className="btn btn-primary" onClick={manualCheckin}>Check In</button>
            </div>
          </div>

          {ev && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{ev.title} — {ev.date}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="text-green" style={{ fontSize: 13, fontWeight: 700 }}>
                    {checkedInCount} / {ev.bookings.length} checked in
                  </span>
                  <div className="progress-bar" style={{ width: 100 }}>
                    <div className="progress-fill" style={{ width: ev.bookings.length ? (checkedInCount / ev.bookings.length * 100) + "%" : "0%" }} />
                  </div>
                </div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead>
                  <tr><th>Player</th><th>Type</th><th>Qty</th><th>Total</th><th>Booked</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {ev.bookings.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.userName}</td>
                      <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                      <td>{b.qty}</td>
                      <td className="text-green">£{b.total.toFixed(2)}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{gmtShort(b.date)}</td>
                      <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                      <td>
                        {!b.checkedIn
                          ? <button className="btn btn-sm btn-primary" onClick={() => doCheckin(b, ev)}>✓ Check In</button>
                          : <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                  {ev.bookings.length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>No bookings for this event</td></tr>
                  )}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      )}

      {scanning && <QRScanner onScan={onQRScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

// ── Admin Events ──────────────────────────────────────────
function AdminEvents({ data, save, updateEvent, showToast }) {
  const [modal, setModal] = useState(null);
  const [viewId, setViewId] = useState(null);
  const blank = { title: "", date: "", time: "09:00", location: "", description: "", walkOnSlots: 40, rentalSlots: 20, walkOnPrice: 25, rentalPrice: 35, banner: "", mapEmbed: "", extras: [], published: true };
  const [form, setForm] = useState(blank);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveEvent = async () => {
    if (!form.title || !form.date) { showToast("Title and date required", "red"); return; }
    try {
      if (modal === "new") {
        await api.events.create(form);
      } else {
        await api.events.update(form.id, form);
      }
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Event saved!"); setModal(null);
    } catch (e) {
      showToast("Save failed: " + e.message, "red");
    }
  };

  const clone = async (ev) => {
    try {
      await api.events.create({ ...ev, title: ev.title + " (Copy)", bookings: [] });
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Event cloned!");
    } catch (e) {
      showToast("Clone failed: " + e.message, "red");
    }
  };

  const viewEv = viewId ? data.events.find(e => e.id === viewId) : null;

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Events</div></div>
        <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("new"); }}>+ New Event</button>
      </div>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Event</th><th>Date / Time</th><th>Slots</th><th>Booked</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {data.events.map(ev => {
            const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
            return (
              <tr key={ev.id}>
                <td><button style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 13 }} onClick={() => setViewId(ev.id)}>{ev.title}</button></td>
                <td className="mono" style={{ fontSize: 12 }}>{ev.date} {ev.time}</td>
                <td>{ev.walkOnSlots + ev.rentalSlots}</td>
                <td>{booked}</td>
                <td>{ev.published ? <span className="tag tag-green">Live</span> : <span className="tag tag-red">Draft</span>}</td>
                <td>
                  <div className="gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...ev }); setModal(ev.id); }}>Edit</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => clone(ev)}>Clone</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>

      {viewEv && (
        <div className="overlay" onClick={() => setViewId(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📅 {viewEv.title} — Bookings</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>{viewEv.date} @ {viewEv.time} GMT | {viewEv.location}</p>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Type</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {viewEv.bookings.map(b => (
                  <tr key={b.id}><td>{b.userName}</td><td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td><td>{b.qty}</td><td className="text-green">£{b.total.toFixed(2)}</td>
                    <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                  </tr>
                ))}
                {viewEv.bookings.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No bookings</td></tr>}
              </tbody>
            </table></div>
            <button className="btn btn-ghost mt-2" onClick={() => setViewId(null)}>Close</button>
          </div>
        </div>
      )}

      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === "new" ? "➕ New Event" : "✏️ Edit Event"}</div>
            <div className="form-row">
              <div className="form-group"><label>Title</label><input value={form.title} onChange={e => f("title", e.target.value)} /></div>
              <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => f("date", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Time (GMT)</label><input type="time" value={form.time} onChange={e => f("time", e.target.value)} /></div>
              <div className="form-group"><label>Location</label><input value={form.location} onChange={e => f("location", e.target.value)} /></div>
            </div>
            <div className="form-group"><label>Description</label><textarea rows={3} value={form.description} onChange={e => f("description", e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label>Walk-On Slots</label><input type="number" value={form.walkOnSlots} onChange={e => f("walkOnSlots", +e.target.value)} /></div>
              <div className="form-group"><label>Rental Slots</label><input type="number" value={form.rentalSlots} onChange={e => f("rentalSlots", +e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Walk-On Price (£)</label><input type="number" value={form.walkOnPrice} onChange={e => f("walkOnPrice", +e.target.value)} /></div>
              <div className="form-group"><label>Rental Price (£)</label><input type="number" value={form.rentalPrice} onChange={e => f("rentalPrice", +e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Banner Image</label>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "inline-block", cursor: "pointer", marginBottom: 8 }}>
                    <div className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      📁 Upload Image
                    </div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files[0]; if (!file) return;
                      const r = new FileReader(); r.onload = ev => f("banner", ev.target.result); r.readAsDataURL(file);
                    }} />
                  </label>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Or paste a URL:</div>
                  <input value={form.banner && form.banner.startsWith("data:") ? "" : (form.banner || "")}
                    onChange={e => f("banner", e.target.value)} placeholder="https://..." />
                </div>
                {form.banner && (
                  <div style={{ position: "relative" }}>
                    <img src={form.banner} style={{ width: 100, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} alt="Banner preview" />
                    <button onClick={() => f("banner", "")} style={{ position: "absolute", top: -6, right: -6, background: "var(--red)", border: "none", color: "#fff", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                )}
              </div>
            </div>
            <div className="form-group"><label>Map Embed HTML (optional)</label><textarea rows={2} value={form.mapEmbed} onChange={e => f("mapEmbed", e.target.value)} placeholder='<iframe src="..." ...></iframe>' /></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
              <input type="checkbox" id="epub" checked={form.published} onChange={e => f("published", e.target.checked)} />
              <label htmlFor="epub" style={{ cursor: "pointer", fontSize: 13 }}>Published (visible to players)</label>
            </div>
            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEvent}>Save Event</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Players ─────────────────────────────────────────
function AdminPlayers({ data, save, updateUser, showToast }) {
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState("all");
  const [recalcBusy, setRecalcBusy] = useState(false);
  const players = data.users.filter(u => u.role !== "admin");
  const vipApps = players.filter(u => u.vipApplied && u.vipStatus !== "active");

  const saveEdit = () => {
    updateUser(edit.id, edit); showToast("Player updated!"); setEdit(null);
  };

  // Recalculate every player's game count from actual checked-in bookings in the DB
  const recalcAll = async () => {
    setRecalcBusy(true);
    try {
      const { data: allBookings, error } = await supabase
        .from('bookings').select('user_id').eq('checked_in', true);
      if (error) throw error;

      // Count per user
      const counts = {};
      allBookings.forEach(b => { counts[b.user_id] = (counts[b.user_id] || 0) + 1; });

      // Update each player
      let updated = 0;
      for (const u of players) {
        const correct = counts[u.id] || 0;
        if (u.gamesAttended !== correct) {
          await updateUser(u.id, { gamesAttended: correct });
          updated++;
        }
      }
      // Refresh user list
      const allProfiles = await api.profiles.getAll();
      save({ users: allProfiles.map(normaliseProfile) });
      showToast(`✅ Recalculated! ${updated} player(s) corrected.`);
    } catch (e) {
      showToast("Failed: " + e.message, "red");
    } finally {
      setRecalcBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Players</div><div className="page-sub">{players.length} registered</div></div>
        <button className="btn btn-ghost btn-sm" onClick={recalcAll} disabled={recalcBusy} title="Recalculate all players' game counts from actual check-ins">
          {recalcBusy ? "Recalculating…" : "🔄 Recalc Game Counts"}
        </button>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>All Players</button>
        <button className={`nav-tab ${tab === "vip" ? "active" : ""}`} onClick={() => setTab("vip")}>
          VIP Applications {vipApps.length > 0 && <span style={{ background: "var(--gold)", color: "#000", borderRadius: 10, padding: "1px 7px", fontSize: 10, marginLeft: 6, fontWeight: 700 }}>{vipApps.length}</span>}
        </button>
        <button className={`nav-tab ${tab === "del" ? "active" : ""}`} onClick={() => setTab("del")}>
          Deletion Requests {players.filter(u => u.deleteRequest).length > 0 && <span style={{ background: "var(--red)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, marginLeft: 6, fontWeight: 700 }}>{players.filter(u => u.deleteRequest).length}</span>}
        </button>
      </div>

      {tab === "all" && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Games</th><th>VIP / UKARA</th><th>Waiver</th><th>Credits</th><th></th></tr></thead>
            <tbody>
              {players.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.gamesAttended}</td>
                  <td>
                    {u.vipStatus === "active" ? <span className="tag tag-gold">⭐ VIP</span> : u.vipApplied ? <span className="tag tag-blue">Applied</span> : "—"}
                    {u.ukara && <span className="mono" style={{ fontSize: 10, color: "var(--green)", marginLeft: 6 }}>{u.ukara}</span>}
                  </td>
                  <td>{u.waiverSigned && u.waiverYear === new Date().getFullYear() ? <span className="tag tag-green">✓</span> : <span className="tag tag-red">✗</span>}</td>
                  <td>{u.credits > 0 ? <span className="text-gold">£{u.credits}</span> : "—"}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => setEdit({ ...u })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "vip" && (
        <div className="card">
          {vipApps.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No pending VIP applications.</div>
          ) : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Email</th><th>Games</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {vipApps.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                    <td>{u.gamesAttended}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.joinDate}</td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-primary" onClick={() => {
                          const ukara = `UKARA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100).padStart(3,"0")}`;
                          updateUser(u.id, { vipStatus: "active", vipApplied: true, ukara });
                          showToast(`✅ VIP approved for ${u.name}! UKARA: ${ukara}`);
                        }}>Approve</button>
                        <button className="btn btn-sm btn-danger" onClick={() => {
                          updateUser(u.id, { vipApplied: false });
                          showToast(`VIP application rejected for ${u.name}`, "red");
                        }}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === "del" && (
        <div className="card">
          {players.filter(u => u.deleteRequest).length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No deletion requests.</div>
          ) : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Email</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {players.filter(u => u.deleteRequest).map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.joinDate}</td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-danger" onClick={async () => {
                          try {
                            await api.profiles.delete(u.id);
                            save({ users: data.users.filter(x => x.id !== u.id) });
                            showToast(`Account deleted: ${u.name}`, "red");
                          } catch (e) { showToast("Delete failed: " + e.message, "red"); }
                        }}>Delete Account</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => {
                          updateUser(u.id, { deleteRequest: false });
                          showToast("Deletion request cancelled");
                        }}>Cancel Request</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">✏️ Edit — {edit.name}</div>
            <div className="form-row">
              <div className="form-group"><label>Name</label><input value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="form-group"><label>Email</label><input value={edit.email} onChange={e => setEdit(p => ({ ...p, email: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label><input value={edit.phone || ""} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className="form-group"><label>Games Attended</label><input type="number" value={edit.gamesAttended} onChange={e => setEdit(p => ({ ...p, gamesAttended: +e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>VIP Status</label>
                <select value={edit.vipStatus} onChange={e => setEdit(p => ({ ...p, vipStatus: e.target.value }))}>
                  <option value="none">None</option><option value="active">Active VIP</option><option value="expired">Expired</option>
                </select>
              </div>
              <div className="form-group"><label>UKARA ID</label><input value={edit.ukara || ""} onChange={e => setEdit(p => ({ ...p, ukara: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Credits (£)</label><input type="number" value={edit.credits || 0} onChange={e => setEdit(p => ({ ...p, credits: +e.target.value }))} /></div>
              <div className="form-group"><label>Address</label><input value={edit.address || ""} onChange={e => setEdit(p => ({ ...p, address: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <input type="checkbox" checked={edit.deleteRequest || false} onChange={e => setEdit(p => ({ ...p, deleteRequest: e.target.checked }))} />
              <label style={{ fontSize: 13, color: "var(--red)" }}>Account deletion requested</label>
            </div>
            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
              <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Waivers ─────────────────────────────────────────
function AdminWaivers({ data, updateUser, showToast }) {
  const [view, setView] = useState(null);
  const withWaiver = data.users.filter(u => u.waiverData || u.waiverPending);

  const approve = (u) => {
    updateUser(u.id, { waiverData: u.waiverPending, waiverPending: null, waiverSigned: true, waiverYear: new Date().getFullYear() });
    showToast("Waiver changes approved!"); setView(null);
  };
  const reject = (u) => {
    updateUser(u.id, { waiverPending: null }); showToast("Changes rejected"); setView(null);
  };

  const vw = view ? data.users.find(u => u.id === view) : null;

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Waivers</div><div className="page-sub">Valid for {new Date().getFullYear()} calendar year</div></div></div>
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Player</th><th>Signed</th><th>Year</th><th>Pending Changes</th><th></th></tr></thead>
          <tbody>
            {withWaiver.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td>{u.waiverSigned ? <span className="tag tag-green">✓</span> : <span className="tag tag-red">✗</span>}</td>
                <td>{u.waiverYear || "—"}</td>
                <td>{u.waiverPending ? <span className="tag tag-gold">⚠ Pending</span> : "—"}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => setView(u.id)}>View</button></td>
              </tr>
            ))}
            {withWaiver.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No waivers on file</td></tr>}
          </tbody>
        </table></div>
      </div>

      {vw && (
        <div className="overlay" onClick={() => setView(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📋 Waiver — {vw.name}</div>
            {vw.waiverData && (
              <div className="mb-2">
                <div style={{ fontSize: 11, letterSpacing: ".1em", fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>CURRENT WAIVER</div>
                {[["Name", vw.waiverData.name], ["DOB", vw.waiverData.dob], ["Medical", vw.waiverData.medical || "None"], ["Minor", vw.waiverData.isChild ? "Yes" : "No"], ["Guardian", vw.waiverData.guardian || "N/A"], ["Signed", gmtShort(vw.waiverData.date)]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <span className="text-muted" style={{ minWidth: 130 }}>{k}:</span><span>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {vw.waiverPending && (
              <div>
                <div className="alert alert-gold mb-2">⚠️ Player has submitted waiver changes for approval</div>
                <div style={{ fontSize: 11, letterSpacing: ".1em", fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>PROPOSED CHANGES</div>
                {[["Name", vw.waiverPending.name, vw.waiverData?.name], ["DOB", vw.waiverPending.dob, vw.waiverData?.dob], ["Medical", vw.waiverPending.medical || "None", vw.waiverData?.medical || "None"], ["Minor", vw.waiverPending.isChild ? "Yes" : "No", vw.waiverData?.isChild ? "Yes" : "No"], ["Guardian", vw.waiverPending.guardian || "N/A", vw.waiverData?.guardian || "N/A"]].map(([k, v, old]) => {
                  const changed = v !== old;
                  return (
                    <div key={k} style={{ display: "flex", gap: 12, padding: changed ? "7px 8px" : "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13, background: changed ? "#2d1e0a" : "transparent", borderRadius: changed ? 4 : 0 }}>
                      <span className="text-muted" style={{ minWidth: 130 }}>{k}:</span>
                      <span style={{ color: changed ? "var(--gold)" : "var(--text)" }}>{v}</span>
                      {changed && <span className="tag tag-gold" style={{ fontSize: 10, marginLeft: "auto" }}>CHANGED</span>}
                    </div>
                  );
                })}
                <div className="gap-2 mt-2">
                  <button className="btn btn-primary" onClick={() => approve(vw)}>Approve Changes</button>
                  <button className="btn btn-danger" onClick={() => reject(vw)}>Reject</button>
                </div>
              </div>
            )}
            <button className="btn btn-ghost mt-2" style={{ width: "100%" }} onClick={() => setView(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Shop ────────────────────────────────────────────
function AdminShop({ data, save, showToast }) {
  const [tab, setTab] = useState("products");
  const [modal, setModal] = useState(null);
  const blank = { name: "", description: "", price: 0, salePrice: null, onSale: false, image: "", stock: 0, noPost: false };
  const [form, setForm] = useState(blank);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Postage state
  const [postModal, setPostModal] = useState(null);
  const blankPost = { name: "", price: 0 };
  const [postForm, setPostForm] = useState(blankPost);
  const pf = (k, v) => setPostForm(p => ({ ...p, [k]: v }));

  const handleImg = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = ev => f("image", ev.target.result); r.readAsDataURL(file);
  };

  const saveItem = async () => {
    if (!form.name) { showToast("Name required", "red"); return; }
    try {
      if (modal === "new") await api.shop.create(form);
      else await api.shop.update(form.id, form);
      save({ shop: await api.shop.getAll() });
      showToast("Product saved!"); setModal(null);
    } catch (e) {
      showToast("Save failed: " + e.message, "red");
    }
  };

  const savePostage = async () => {
    if (!postForm.name) { showToast("Name required", "red"); return; }
    try {
      const opts = data.postageOptions || [];
      if (postModal === "new") await api.postage.create(postForm);
      else await api.postage.update(postForm.id, postForm);
      save({ postageOptions: await api.postage.getAll() });
      showToast("Postage option saved!"); setPostModal(null);
    } catch (e) {
      showToast("Save failed: " + e.message, "red");
    }
  };

  const deletePostage = async (id) => {
    try {
      await api.postage.delete(id);
      save({ postageOptions: await api.postage.getAll() });
      showToast("Postage option removed");
    } catch (e) {
      showToast("Delete failed: " + e.message, "red");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Shop</div></div>
        {tab === "products"
          ? <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("new"); }}>+ Add Product</button>
          : <button className="btn btn-primary" onClick={() => { setPostForm(blankPost); setPostModal("new"); }}>+ Add Postage Option</button>
        }
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>Products</button>
        <button className={`nav-tab ${tab === "postage" ? "active" : ""}`} onClick={() => setTab("postage")}>Postage Options</button>
      </div>

      {tab === "products" && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Product</th><th>Price</th><th>Sale</th><th>Stock</th><th>No Post</th><th></th></tr></thead>
            <tbody>
              {data.shop.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td className="text-green">£{item.price}</td>
                  <td>{item.onSale ? <span className="tag tag-red">SALE £{item.salePrice}</span> : "—"}</td>
                  <td>{item.stock}</td>
                  <td>{item.noPost ? <span className="tag tag-gold">Yes</span> : "—"}</td>
                  <td>
                    <div className="gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...item }); setModal(item.id); }}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={async () => { try { await api.shop.delete(item.id); save({ shop: await api.shop.getAll() }); showToast("Deleted"); } catch(e) { showToast("Delete failed: " + e.message, "red"); } }}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.shop.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No products yet</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "postage" && (
        <div className="card">
          <p className="text-muted mb-2" style={{ fontSize: 13 }}>
            These options appear in the shop cart. Items marked <strong>No Post</strong> (e.g. Pyro) are always collection-only regardless of postage selection.
          </p>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Option Name</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {(data.postageOptions || []).map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="text-green">£{Number(p.price).toFixed(2)}</td>
                  <td>
                    <div className="gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => { setPostForm({ ...p }); setPostModal(p.id); }}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deletePostage(p.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {(data.postageOptions || []).length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No postage options configured</td></tr>
              )}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Product modal */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === "new" ? "Add Product" : "Edit Product"}</div>
            <div className="form-group"><label>Name</label><input value={form.name} onChange={e => f("name", e.target.value)} /></div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => f("description", e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label>Price (£)</label><input type="number" value={form.price} onChange={e => f("price", +e.target.value)} /></div>
              <div className="form-group"><label>Stock</label><input type="number" value={form.stock} onChange={e => f("stock", +e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" checked={form.onSale} onChange={e => f("onSale", e.target.checked)} />
              <label style={{ fontSize: 13 }}>On Sale</label>
            </div>
            {form.onSale && <div className="form-group"><label>Sale Price (£)</label><input type="number" value={form.salePrice || ""} onChange={e => f("salePrice", +e.target.value)} /></div>}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <input type="checkbox" checked={form.noPost} onChange={e => f("noPost", e.target.checked)} />
              <label style={{ fontSize: 13 }}>No Post — Collection Only (e.g. Pyro)</label>
            </div>
            <div className="form-group"><label>Product Image</label><input type="file" accept="image/*" onChange={handleImg} /></div>
            {form.image && <img src={form.image} style={{ width: "100%", maxHeight: 110, objectFit: "cover", borderRadius: 6, marginBottom: 10 }} alt="" />}
            <div className="gap-2"><button className="btn btn-primary" onClick={saveItem}>Save</button><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Postage modal */}
      {postModal && (
        <div className="overlay" onClick={() => setPostModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{postModal === "new" ? "Add Postage Option" : "Edit Postage Option"}</div>
            <div className="form-group"><label>Option Name</label><input value={postForm.name} onChange={e => pf("name", e.target.value)} placeholder="e.g. Standard (3-5 days)" /></div>
            <div className="form-group"><label>Price (£) — set 0 for free/collection</label><input type="number" min={0} step={0.01} value={postForm.price} onChange={e => pf("price", +e.target.value)} /></div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={savePostage}>Save</button>
              <button className="btn btn-ghost" onClick={() => setPostModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Extras (per-event) ──────────────────────────────
function AdminExtras({ data, save, showToast }) {
  const [evId, setEvId] = useState(data.events[0]?.id || "");
  const [form, setForm] = useState({ name: "", price: 0, noPost: false });
  const ev = data.events.find(e => e.id === evId);

  const addExtra = async () => {
    if (!form.name) { showToast("Name required", "red"); return; }
    try {
      const updatedExtras = [...(ev.extras || []), { ...form, id: uid() }];
      await api.events.update(evId, { extras: updatedExtras });
      const evList = await api.events.getAll();
      save({ events: evList });
      setForm({ name: "", price: 0, noPost: false }); showToast("Extra added!");
    } catch (e) {
      showToast("Failed: " + e.message, "red");
    }
  };

  const del = async (id) => {
    try {
      const updatedExtras = ev.extras.filter(x => x.id !== id);
      await api.events.update(evId, { extras: updatedExtras });
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Removed");
    } catch (e) {
      showToast("Failed: " + e.message, "red");
    }
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Game Extras</div><div className="page-sub">Manage per-event add-ons</div></div></div>
      <div className="form-group" style={{ maxWidth: 300 }}>
        <label>Select Event</label>
        <select value={evId} onChange={e => setEvId(e.target.value)}>{data.events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
      </div>
      {ev && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>EXTRAS FOR: {ev.title}</div>
          {ev.extras.map(ex => (
            <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span>{ex.name} {ex.noPost && <span className="tag tag-gold" style={{ fontSize: 10, marginLeft: 6 }}>No Post</span>}</span>
              <div className="gap-2"><span className="text-green">£{ex.price}</span><button className="btn btn-sm btn-danger" onClick={() => del(ex.id)}>Del</button></div>
            </div>
          ))}
          <div className="form-row mt-2">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Extra name" />
            <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: +e.target.value }))} placeholder="Price" />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <input type="checkbox" checked={form.noPost} onChange={e => setForm(p => ({ ...p, noPost: e.target.checked }))} />
            <label style={{ fontSize: 13 }}>Collection only (no post)</label>
          </div>
          <button className="btn btn-primary" onClick={addExtra}>+ Add Extra</button>
        </div>
      )}
    </div>
  );
}

// ── Admin Leaderboard ─────────────────────────────────────
function AdminLeaderboard({ data, updateUser, showToast }) {
  const board = data.users.filter(u => u.role === "player").sort((a, b) => b.gamesAttended - a.gamesAttended);
  return (
    <div>
      <div className="page-header"><div><div className="page-title">Leaderboard</div></div></div>
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Games</th><th>VIP</th><th>Visible</th></tr></thead>
          <tbody>
            {board.map((u, i) => (
              <tr key={u.id}>
                <td>{i + 1}</td><td style={{ fontWeight: 600 }}>{u.name}</td><td>{u.gamesAttended}</td>
                <td>{u.vipStatus === "active" ? <span className="tag tag-gold">⭐</span> : "—"}</td>
                <td>{u.leaderboardOptOut ? <span className="tag tag-red">Hidden</span> : <span className="tag tag-green">Visible</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ── Admin Revenue ─────────────────────────────────────────
function AdminRevenue({ data }) {
  const [cashSales, setCashSales] = useState([]);
  const [selected, setSelected] = useState(null); // selected transaction for detail modal
  const [monthDetail, setMonthDetail] = useState(null);

  useEffect(() => {
    api.cashSales.getAll().then(setCashSales).catch(console.error);
  }, []);

  // Full GMT timestamp: "12/04/2026, 14:35:22"
  const gmtFull = (d) => new Date(d).toLocaleString("en-GB", {
    timeZone: "Europe/London", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });

  const bookingRevenue = data.events.flatMap(ev => ev.bookings.map(b => ({
    id: b.id,
    userName: b.userName,
    userId: b.userId,
    source: "booking",
    eventTitle: ev.title,
    eventDate: ev.date,
    ticketType: b.type === "walkOn" ? "Walk-on" : "Rental",
    qty: b.qty,
    extras: b.extras || {},
    eventExtras: ev.extras || [],
    total: Number(b.total),
    date: b.date || b.created_at,
    checkedIn: b.checkedIn,
  })));

  const cashRevenue = cashSales.map(s => ({
    id: s.id,
    userName: s.customer_name,
    customerEmail: s.customer_email,
    source: "cash",
    eventTitle: "Cash Sale",
    items: Array.isArray(s.items) ? s.items : [],
    total: Number(s.total),
    date: s.created_at,
  }));

  const all = [...bookingRevenue, ...cashRevenue]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalBookings = bookingRevenue.reduce((s, b) => s + b.total, 0);
  const totalCash = cashRevenue.reduce((s, b) => s + b.total, 0);
  const total = totalBookings + totalCash;

  const byMonth = {};
  all.forEach(b => {
    const m = new Date(b.date).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" });
    byMonth[m] = (byMonth[m] || 0) + b.total;
  });
  const months = Object.entries(byMonth).sort((a, b) => new Date("01 " + b[0]) - new Date("01 " + a[0]));

  // Build detail lines for a transaction
  const getLines = (t) => {
    if (t.source === "cash") {
      return t.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, line: i.price * i.qty }));
    } else {
      const lines = [{ name: `${t.ticketType} ticket`, qty: t.qty, price: t.total, line: null }];
      if (t.extras && t.eventExtras) {
        t.eventExtras.forEach(ex => {
          const qty = t.extras[ex.id];
          if (qty) lines.push({ name: ex.name, qty, price: ex.price, line: ex.price * qty });
        });
      }
      return lines;
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Revenue</div><div className="page-sub">All times GMT</div></div>
      </div>

      {/* Stat cards */}
      <div className="grid-4 mb-2">
        {[
          { label: "Total Revenue", val: `£${total.toFixed(2)}`, color: "" },
          { label: "Online Bookings", val: `£${totalBookings.toFixed(2)}`, color: "blue" },
          { label: "Cash Sales", val: `£${totalCash.toFixed(2)}`, color: "teal" },
          { label: "Transactions", val: all.length, color: "gold" },
        ].map(({ label, val, color }) => (
          <div key={label} className={`stat-card ${color}`}><div className="stat-val">{val}</div><div className="stat-label">{label}</div></div>
        ))}
      </div>

      {/* Monthly breakdown */}
      <div className="card mb-2">
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Monthly Breakdown</div>
        {months.length === 0 ? <p className="text-muted">No revenue data yet.</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Month</th><th>Revenue</th><th>Transactions</th><th></th></tr></thead>
            <tbody>
              {months.map(([m, rev]) => {
                const mbs = all.filter(b => new Date(b.date).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" }) === m);
                return (
                  <tr key={m}>
                    <td style={{ fontWeight: 600 }}>{m}</td>
                    <td className="text-green">£{rev.toFixed(2)}</td>
                    <td>{mbs.length}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => setMonthDetail({ m, bookings: mbs })}>View →</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {/* All transactions */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 14 }}>All Transactions <span className="text-muted" style={{ fontSize: 12, fontWeight: 400 }}>— click any row for full detail</span></div>
        <div className="table-wrap"><table className="data-table">
          <thead>
            <tr>
              <th>Date &amp; Time (GMT)</th>
              <th>Customer</th>
              <th>Description</th>
              <th>Source</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {all.map(t => (
              <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setSelected(t)}>
                <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{gmtFull(t.date)}</td>
                <td style={{ fontWeight: 600 }}>{t.userName}</td>
                <td>{t.source === "cash" ? `Cash Sale (${t.items?.length || 0} items)` : `${t.eventTitle} — ${t.ticketType} ×${t.qty}`}</td>
                <td><span className={`tag ${t.source === "cash" ? "tag-gold" : "tag-blue"}`}>{t.source === "cash" ? "💵 Cash" : "🌐 Online"}</span></td>
                <td className="text-green" style={{ fontWeight: 700 }}>£{t.total.toFixed(2)}</td>
                <td><button className="btn btn-sm btn-ghost">Detail →</button></td>
              </tr>
            ))}
            {all.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No transactions yet</td></tr>}
          </tbody>
        </table></div>
      </div>

      {/* Transaction detail modal */}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{selected.source === "cash" ? "💵 Cash Sale" : "🌐 Online Booking"} — Detail</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                ["Customer", selected.userName],
                ["Date & Time (GMT)", gmtFull(selected.date)],
                ["Source", selected.source === "cash" ? "Cash Sale" : "Online Booking"],
                selected.source === "booking" ? ["Event", selected.eventTitle] : ["Customer Email", selected.customerEmail || "—"],
                selected.source === "booking" ? ["Ticket Type", selected.ticketType] : null,
                selected.source === "booking" ? ["Qty", selected.qty] : null,
                selected.source === "booking" ? ["Checked In", selected.checkedIn ? "✅ Yes" : "❌ No"] : null,
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} style={{ background: "var(--bg3)", borderRadius: 6, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 2 }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13, letterSpacing: ".05em", color: "var(--muted)" }}>ITEMS</div>
            <div className="table-wrap"><table className="data-table" style={{ marginBottom: 16 }}>
              <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
              <tbody>
                {getLines(selected).map((line, i) => (
                  <tr key={i}>
                    <td>{line.name}</td>
                    <td>{line.qty}</td>
                    <td>{line.price != null ? `£${Number(line.price).toFixed(2)}` : "—"}</td>
                    <td className="text-green">{line.line != null ? `£${line.line.toFixed(2)}` : `£${Number(selected.total).toFixed(2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>TOTAL <span className="text-green">£{selected.total.toFixed(2)}</span></div>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Month detail modal */}
      {monthDetail && (
        <div className="overlay" onClick={() => setMonthDetail(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📅 {monthDetail.m} — All Transactions</div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Date &amp; Time (GMT)</th><th>Customer</th><th>Description</th><th>Source</th><th>Total</th></tr></thead>
              <tbody>
                {monthDetail.bookings.map(t => (
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => { setMonthDetail(null); setSelected(t); }}>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{gmtFull(t.date)}</td>
                    <td>{t.userName}</td>
                    <td>{t.source === "cash" ? `Cash Sale (${t.items?.length || 0} items)` : `${t.eventTitle} — ${t.ticketType} ×${t.qty}`}</td>
                    <td><span className={`tag ${t.source === "cash" ? "tag-gold" : "tag-blue"}`}>{t.source === "cash" ? "💵 Cash" : "🌐 Online"}</span></td>
                    <td className="text-green">£{t.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Month Total: <span className="text-green">£{monthDetail.bookings.reduce((s, b) => s + b.total, 0).toFixed(2)}</span></div>
              <button className="btn btn-ghost" onClick={() => setMonthDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Gallery ─────────────────────────────────────────
function AdminGallery({ data, save, showToast }) {
  const [urlInput, setUrlInput] = useState({});
  const addAlbum = async () => {
    const name = prompt("Album name:"); if (!name) return;
    try {
      await api.gallery.createAlbum(name);
      save({ albums: await api.gallery.getAll() });
      showToast("Album created!");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };
  const addImg = async (albumId, url) => {
    try {
      await api.gallery.addImageUrl(albumId, url);
      save({ albums: await api.gallery.getAll() });
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };
  const handleFile = async (albumId, e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      await api.gallery.uploadImage(albumId, file);
      save({ albums: await api.gallery.getAll() });
      showToast("Image added!");
    } catch (e) { showToast("Upload failed: " + e.message, "red"); }
  };
  const removeImg = async (albumId, url) => {
    try {
      await api.gallery.removeImage(albumId, url);
      save({ albums: await api.gallery.getAll() });
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };
  return (
    <div>
      <div className="page-header"><div><div className="page-title">Gallery</div></div><button className="btn btn-primary" onClick={addAlbum}>+ New Album</button></div>
      {data.albums.map(album => (
        <div key={album.id} className="card mb-2">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700 }}>{album.title} <span className="text-muted" style={{ fontSize: 12 }}>({album.images.length} photos)</span></div>
            <label className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>+ Upload<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(album.id, e)} /></label>
          </div>
          <div className="gap-2 mb-2">
            <input value={urlInput[album.id] || ""} onChange={e => setUrlInput(p => ({ ...p, [album.id]: e.target.value }))} placeholder="Or paste image URL" style={{ flex: 1 }} />
            <button className="btn btn-sm btn-ghost" onClick={() => { if (urlInput[album.id]) { addImg(album.id, urlInput[album.id]); setUrlInput(p => ({ ...p, [album.id]: "" })); } }}>Add</button>
          </div>
          <div className="photo-grid">
            {album.images.map((img, i) => (
              <div key={i} className="photo-cell">
                <img src={img} alt="" />
                <button style={{ position: "absolute", top: 4, right: 4, background: "var(--red)", border: "none", color: "#fff", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
                  onClick={() => removeImg(album.id, img)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Admin Q&A ─────────────────────────────────────────────
function AdminQA({ data, save, showToast }) {
  const [form, setForm] = useState({ q: "", a: "" });
  const add = async () => {
    if (!form.q || !form.a) return;
    try {
      await api.qa.create(form);
      save({ qa: await api.qa.getAll() });
      setForm({ q: "", a: "" }); showToast("Q&A added!");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };
  const del = async (id) => {
    try {
      await api.qa.delete(id);
      save({ qa: await api.qa.getAll() });
      showToast("Deleted");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };
  return (
    <div>
      <div className="page-header"><div><div className="page-title">Q&amp;A</div></div></div>
      <div className="card mb-2">
        <div className="form-group"><label>Question</label><input value={form.q} onChange={e => setForm(p => ({ ...p, q: e.target.value }))} /></div>
        <div className="form-group"><label>Answer</label><textarea rows={3} value={form.a} onChange={e => setForm(p => ({ ...p, a: e.target.value }))} /></div>
        <button className="btn btn-primary" onClick={add}>Add Q&amp;A</button>
      </div>
      {data.qa.map(item => (
        <div key={item.id} className="card mb-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{item.q}</div>
            <div className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{item.a}</div>
          </div>
          <button className="btn btn-sm btn-danger" style={{ marginLeft: 14, flexShrink: 0 }} onClick={() => del(item.id)}>Del</button>
        </div>
      ))}
    </div>
  );
}

// ── Admin Messages ────────────────────────────────────────
function AdminMessages({ data, save, showToast }) {
  const [msg, setMsg] = useState(data.homeMsg || "");
  const saveMsg = async (val) => {
    try {
      await api.settings.set("home_message", val);
      save({ homeMsg: val });
      showToast(val ? "Message updated!" : "Cleared");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };
  return (
    <div>
      <div className="page-header"><div><div className="page-title">Site Messages</div><div className="page-sub">Banner shown on homepage</div></div></div>
      <div className="card">
        <div className="form-group"><label>Home Page Banner Message</label><textarea rows={3} value={msg} onChange={e => setMsg(e.target.value)} placeholder="e.g. 🎯 Next event booking now open!" /></div>
        <div className="gap-2">
          <button className="btn btn-primary" onClick={() => saveMsg(msg)}>Save</button>
          <button className="btn btn-danger" onClick={() => { setMsg(""); saveMsg(""); }}>Clear</button>
        </div>
        {data.homeMsg && <div className="alert alert-green mt-2">Preview: {data.homeMsg}</div>}
      </div>
    </div>
  );
}

// ── Admin Cash Sales ──────────────────────────────────────
function AdminCash({ data, cu, showToast }) {
  const [items, setItems] = useState([]);
  const [playerId, setPlayerId] = useState("manual");
  const [manual, setManual] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState(null);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  const add = (item) => setItems(c => {
    const ex = c.find(x => x.id === item.id);
    return ex ? c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...item, qty: 1 }];
  });

  const completeSale = async () => {
    if (items.length === 0) { showToast("Add items first", "red"); return; }
    setLastError(null);
    setBusy(true);
    const player = playerId !== "manual" ? data.users.find(u => u.id === playerId) : null;

    const payload = {
      customer_name:  player ? player.name : (manual.name || "Walk-in"),
      customer_email: player ? (player.email || "") : (manual.email || ""),
      user_id:        player ? player.id : null,
      items:          items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      total:          total,
      recorded_by:    null, // omit recorded_by to avoid FK issues if cu.id is stale
    };

    try {
      const response = await supabase.from('cash_sales').insert(payload).select();
      console.log("Cash sale response:", response);

      if (response.error) {
        const msg = response.error.message || response.error.details || JSON.stringify(response.error);
        setLastError(msg);
        showToast("Error: " + msg, "red");
      } else {
        showToast(`✅ Cash sale £${total.toFixed(2)} recorded!`);
        setItems([]);
        setManual({ name: "", email: "" });
        setPlayerId("manual");
      }
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("Cash sale exception:", e);
      setLastError(msg);
      showToast("Error: " + msg, "red");
    }

    setBusy(false);
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Cash Sales</div><div className="page-sub">Walk-in or unregistered customer sales</div></div></div>
      {lastError && (
        <div className="alert alert-red mb-2" style={{ wordBreak: "break-all", fontSize: 12 }}>
          <strong>Error:</strong> {lastError}
        </div>
      )}
      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>PRODUCTS</div>
          {data.shop.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No products in shop yet. Add products in the Shop section.</p>}
          {data.shop.map(item => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13 }}>{item.name}</span>
              <div className="gap-2"><span className="text-green">£{item.price}</span><button className="btn btn-sm btn-primary" onClick={() => add(item)}>+</button></div>
            </div>
          ))}
        </div>
        <div>
          <div className="card mb-2">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>CUSTOMER</div>
            <div className="form-group">
              <label>Player</label>
              <select value={playerId} onChange={e => setPlayerId(e.target.value)}>
                <option value="manual">Manual Entry (walk-in)</option>
                {data.users.filter(u => u.role === "player").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {playerId === "manual" && (
              <>
                <div className="form-group"><label>Name</label><input value={manual.name} onChange={e => setManual(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="form-group"><label>Email (optional)</label><input value={manual.email} onChange={e => setManual(p => ({ ...p, email: e.target.value }))} /></div>
              </>
            )}
          </div>
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>SALE ITEMS</div>
            {items.length === 0 ? <p className="text-muted" style={{ fontSize: 13 }}>No items added yet</p> : (
              items.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span>{item.name} ×{item.qty}</span>
                  <div className="gap-2">
                    <span className="text-green">£{(item.price * item.qty).toFixed(2)}</span>
                    <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }} onClick={() => setItems(c => c.filter(x => x.id !== item.id))}>✕</button>
                  </div>
                </div>
              ))
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 22, marginTop: 12 }}>
              <span>TOTAL</span><span className="text-green">£{total.toFixed(2)}</span>
            </div>
            <button className="btn btn-primary mt-2" style={{ width: "100%", padding: 10 }} disabled={busy} onClick={completeSale}>
              {busy ? "Saving…" : "Complete Sale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Staff ───────────────────────────────────────────
function AdminStaff({ data, save, showToast }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", permissions: [] });
  const staff = data.users.filter(u => u.role === "staff");
  const PERMS = ["events", "players", "waivers", "checkin", "shop", "revenue", "gallery-admin", "qa-admin", "messages", "cash"];

  const toggle = (p) => setForm(f => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p] }));

  const addStaff = async () => {
    if (!form.name || !form.email || !form.password) { showToast("Name, email and password required", "red"); return; }
    try {
      // Use the Supabase admin endpoint via service role — but since we only have anon key,
      // we sign up normally then immediately update their role
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } }
      });
      if (signUpErr) throw signUpErr;
      if (!signUpData.user) throw new Error("No user returned — email may already be registered");

      // Wait for trigger to create profile row
      await new Promise(r => setTimeout(r, 1500));

      // Update their profile to staff role + permissions
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ name: form.name, role: 'staff', permissions: form.permissions })
        .eq('id', signUpData.user.id);
      if (updateErr) throw updateErr;

      const allProfiles = await api.profiles.getAll();
      save({ users: allProfiles.map(normaliseProfile) });
      showToast("✅ Staff account created! They need to confirm their email before logging in.");
      setModal(false);
      setForm({ name: "", email: "", password: "", permissions: [] });
    } catch (e) {
      showToast("Failed: " + e.message, "red");
    }
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Staff Management</div></div><button className="btn btn-primary" onClick={() => setModal(true)}>+ Add Staff</button></div>
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Permissions</th><th></th></tr></thead>
          <tbody>
            {staff.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td><td className="text-muted">{u.email}</td>
                <td style={{ maxWidth: 300 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {u.permissions.map(p => <span key={p} className="tag tag-blue" style={{ fontSize: 10 }}>{p}</span>)}
                  </div>
                </td>
                <td><button className="btn btn-sm btn-danger" onClick={async () => { try { await api.profiles.delete(u.id); save({ users: data.users.filter(x => x.id !== u.id) }); showToast("Staff removed"); } catch(e) { showToast("Failed: " + e.message, "red"); } }}>Remove</button></td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No staff accounts yet</td></tr>}
          </tbody>
        </table></div>
      </div>

      {modal && (
        <div className="overlay" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔑 Add Staff Member</div>
            <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="form-group"><label>Email</label><input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>PERMISSIONS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {PERMS.map(p => (
                <label key={p} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", padding: "5px 10px", borderRadius: 4, background: form.permissions.includes(p) ? "#1a3d1a" : "var(--bg4)", border: `1px solid ${form.permissions.includes(p) ? "var(--green2)" : "var(--border)"}`, fontSize: 12 }}>
                  <input type="checkbox" checked={form.permissions.includes(p)} onChange={() => toggle(p)} style={{ width: 12 }} />{p}
                </label>
              ))}
            </div>
            <div className="gap-2">
              <button className="btn btn-primary" onClick={addStaff}>Create Account</button>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ROOT APP

// ── Root App ──────────────────────────────────────────────────
export default function App() {
  const { data, loading, loadError, save, updateUser, updateEvent, refresh } = useData();
  const [page, setPage] = useState("home");
  const [cu, setCu] = useState(null);          // current user profile
  const [authLoading, setAuthLoading] = useState(true);
  const [authModal, setAuthModal] = useState(null);
  const [toast, showToast] = useToast();

  // Listen for Supabase auth changes
  useEffect(() => {
    // Safety timeout — if auth takes more than 5s, show the site anyway
    const timeout = setTimeout(() => setAuthLoading(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      if (session?.user) {
        try {
          const profile = await api.profiles.getById(session.user.id);
          setCu(normaliseProfile(profile));
        } catch { setCu(null); }
        // Reload events now that we have a session — bookings will be visible
        refresh();
      }
      setAuthLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          const profile = await api.profiles.getById(session.user.id);
          setCu(normaliseProfile(profile));
        } catch { setCu(null); }
        // Reload events when auth state changes (login/logout)
        refresh();
      } else {
        setCu(null);
        refresh(); // reload to clear any auth-dependent data
      }
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  // Refresh current user profile after updates
  const refreshCu = useCallback(async () => {
    if (!cu) return;
    try {
      const profile = await api.profiles.getById(cu.id);
      setCu(normaliseProfile(profile));
    } catch {}
  }, [cu]);

  // Wrap updateUser to also refresh cu if editing self
  const updateUserAndRefresh = useCallback(async (id, patch) => {
    await updateUser(id, patch);
    if (cu?.id === id) await refreshCu();
  }, [updateUser, cu, refreshCu]);

  if (loading || authLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "#0d1117" }}>
        <div style={{ width: 48, height: 48, background: "var(--green)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#000", fontSize: 20, animation: "pulse 1s infinite" }}>SA</div>
        <div style={{ color: "var(--muted)", fontSize: 13, letterSpacing: ".15em" }}>LOADING...</div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}`}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "#0d1117", padding: 24 }}>
        <div style={{ width: 48, height: 48, background: "#f85149", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 20 }}>!</div>
        <div style={{ color: "#f85149", fontSize: 16, fontWeight: 700 }}>Failed to connect to database</div>
        <div style={{ color: "var(--muted)", fontSize: 13, maxWidth: 400, textAlign: "center" }}>{loadError}</div>
        <button onClick={refresh} style={{ background: "var(--green)", border: "none", color: "#000", padding: "10px 24px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Retry</button>
      </div>
    );
  }

  const isAdmin = cu?.role === "admin" || cu?.role === "staff";

  if (page === "admin") {
    if (!isAdmin) { setPage("home"); return null; }
    return (
      <>
        <style>{CSS}</style>
        <Toast {...toast} />
        <AdminPanel
          data={data} cu={cu} save={save}
          updateUser={updateUserAndRefresh} updateEvent={updateEvent}
          showToast={showToast} setPage={setPage} refresh={refresh}
        />
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <Toast {...toast} />
      <PublicNav page={page} setPage={setPage} cu={cu} setCu={setCu} setAuthModal={setAuthModal} />

      <div className="pub-page-wrap">
        {page === "home"        && <HomePage data={data} setPage={setPage} />}
        {page === "events"      && <EventsPage data={data} cu={cu} updateEvent={updateEvent} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} save={save} />}
        {page === "shop"        && <ShopPage data={data} cu={cu} showToast={showToast} />}
        {page === "leaderboard" && <LeaderboardPage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} />}
        {page === "gallery"     && <GalleryPage data={data} />}
        {page === "qa"          && <QAPage data={data} />}
        {page === "profile"     && cu  && <ProfilePage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} save={save} refresh={refreshCu} />}
        {page === "profile"     && !cu && <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Please log in to view your profile.</div>}
      </div>

      {authModal && (
        <SupabaseAuthModal
          mode={authModal} setMode={setAuthModal}
          onClose={() => setAuthModal(null)} showToast={showToast}
        />
      )}
    </>
  );
}
