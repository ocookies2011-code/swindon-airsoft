import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { normaliseProfile } from "./api";
// jsQR is loaded via CDN in the QRScanner component — no import needed

// ── Mock Payment Button ───────────────────────────────────────────────
// Replace PayPalCheckoutButton with real payment provider when ready.
// Set VITE_PAYMENT_MODE=live in .env to hide the mock button.
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "";
const PAYMENT_LIVE = PAYPAL_CLIENT_ID && !PAYPAL_CLIENT_ID.includes("YOUR_LIVE");

function PayPalCheckoutButton({ amount, description, onSuccess, disabled }) {
  const [ppReady, setPpReady] = useState(!!window.paypal);
  const [ppError, setPpError] = useState(null);
  const containerRef = useRef(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!PAYMENT_LIVE) return;
    if (window.paypal) { setPpReady(true); return; }
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=GBP`;
    script.onload = () => setPpReady(true);
    script.onerror = () => setPpError("PayPal failed to load.");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!PAYMENT_LIVE || !ppReady || !containerRef.current || rendered.current || disabled) return;
    rendered.current = true;
    window.paypal.Buttons({
      style: { layout: "vertical", color: "black", shape: "rect", label: "pay" },
      createOrder: (data, actions) => actions.order.create({
        purchase_units: [{ amount: { value: Number(amount).toFixed(2), currency_code: "GBP" }, description }]
      }),
      onApprove: async (data, actions) => {
        const order = await actions.order.capture();
        onSuccess({ id: order.id, status: order.status });
      },
      onError: (err) => setPpError("Payment failed. Please try again."),
    }).render(containerRef.current);
  }, [ppReady, disabled, amount]);

  if (!PAYMENT_LIVE) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "#2d7a2d", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", letterSpacing: ".15em", fontFamily: "'Barlow Condensed',sans-serif", flexShrink: 0 }}>TEST MODE</span>
          <span style={{ fontSize: 11, color: "#5aab5a", fontFamily: "'Share Tech Mono',monospace" }}>Mock payments — no real money taken.</span>
        </div>
        <div style={{ background: "#111", border: "1px solid #2a2a2a", padding: "10px 14px", marginBottom: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
          <span>{description}</span>
          <span style={{ color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16 }}>£{Number(amount).toFixed(2)}</span>
        </div>
        <button className="btn btn-primary" style={{ width: "100%", padding: "13px", fontSize: 14, letterSpacing: ".15em", opacity: disabled ? .5 : 1 }}
          disabled={disabled} onClick={() => onSuccess({ id: "MOCK-" + Date.now(), status: "COMPLETED", mock: true })}>
          ✓ CONFIRM TEST PAYMENT · £{Number(amount).toFixed(2)}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {ppError && <div className="alert alert-red" style={{ marginBottom: 8 }}>{ppError}</div>}
      {!ppReady && <div style={{ color: "var(--muted)", fontSize: 12, padding: 8 }}>Loading PayPal...</div>}
      <div ref={containerRef} style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }} />
    </div>
  );
}


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
    const emptyData = { events: [], shop: [], postageOptions: [], albums: [], qa: [], homeMsg: "", users: [] };
    const timeout = setTimeout(() => {
      setData(prev => prev || emptyData);
      setLoading(false);
    }, 5000);
    try {
      const errors = {};
      const safe = (key, p) => p.catch(e => { errors[key] = e.message; return []; });

      const [evList, shopList, postageList, albumList, qaList, homeMsg] = await Promise.all([
        safe("events",  api.events.getAll()),
        safe("shop",    api.shop.getAll()),
        safe("postage", api.postage.getAll()),
        safe("gallery", api.gallery.getAll()),
        safe("qa",      api.qa.getAll()),
        api.settings.get("home_message").catch(() => ""),
      ]);

      if (Object.keys(errors).length > 0) {
        console.error("loadAll partial errors:", errors);
        // Show first error to help diagnose
        const firstErr = Object.values(errors)[0];
        setLoadError(firstErr);
      }

      clearTimeout(timeout);
      setData(prev => ({
        ...(prev || emptyData),
        events: evList,
        shop: shopList,
        postageOptions: postageList,
        albums: albumList,
        qa: qaList,
        homeMsg,
      }));

      // Load profiles after public data — only succeeds when authed, silently skipped for guests
      api.profiles.getAll()
        .then(userList => setData(prev => prev ? { ...prev, users: userList.map(normaliseProfile) } : prev))
        .catch(() => {}); // guests can't see profiles — that's fine
    } catch (e) {
      clearTimeout(timeout);
      console.error("loadAll critical error:", e);
      setLoadError(e.message);
      setData(prev => prev || emptyData);
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
  --sidebar-w:230px;--nav-h:60px;--bottom-nav-h:64px;
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
.pub-nav-inner{max-width:1280px;margin:0 auto;padding:0 24px;height:var(--nav-h);display:flex;align-items:center;gap:0;position:relative;}
.pub-nav-logo{display:flex;align-items:center;gap:12px;cursor:pointer;margin-right:32px;flex-shrink:0;}
.pub-nav-logo-box{background:var(--accent);width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:900;color:#000;letter-spacing:.05em;border-radius:2px;}
.pub-nav-logo-text{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;letter-spacing:.12em;color:#fff;text-transform:uppercase;}
.pub-nav-logo-text span{color:var(--accent);}
.pub-nav-links{display:flex;gap:0;flex:1;}
.pub-nav-link{background:none;border:none;color:var(--muted);font-size:12px;font-weight:700;padding:0 16px;height:var(--nav-h);cursor:pointer;white-space:nowrap;letter-spacing:.12em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;transition:color .15s;}
.pub-nav-link:hover{color:#fff;}
.pub-nav-link.active{color:#fff;}
.pub-nav-actions{display:flex;gap:10px;align-items:center;margin-left:auto;flex-shrink:0;}
.pub-nav-hamburger{display:none;background:none;border:1px solid #333;color:var(--text);padding:6px 10px;font-size:18px;cursor:pointer;}

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
.bottom-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:none;background:none;color:var(--muted);font-size:8px;font-weight:700;letter-spacing:.1em;cursor:pointer;font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;transition:color .1s;}
.bottom-nav-btn.active{color:var(--accent);}
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
.data-table tbody tr:hover td{background:rgba(255,255,255,.02);}

/* ── MODAL ── */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;}
.modal-box{background:#111;border:1px solid #2a2a2a;padding:28px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;border-radius:4px;box-shadow:0 24px 80px rgba(0,0,0,.9);}
.modal-box.wide{max-width:780px;}
@media(max-width:768px){.overlay{align-items:flex-end;padding:0;}.modal-box,.modal-box.wide{max-width:100%;border-radius:0;}}
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

/* ── EVENT CARDS ── */
.event-card{background:var(--bg2);border:1px solid var(--border);overflow:hidden;cursor:pointer;transition:all .15s;position:relative;border-radius:4px;}
.event-card:hover{border-color:#3a3a3a;transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,.6);}
.event-banner-img{height:160px;overflow:hidden;position:relative;background:#1a1a1a;}
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
.sb-logo{padding:16px 14px 14px;border-bottom:1px solid #1a1a1a;margin-bottom:6px;}
.sb-logo-text{font-size:16px;font-weight:900;letter-spacing:.1em;font-family:'Barlow Condensed',sans-serif;color:#fff;text-transform:uppercase;}
.sb-logo-text span{color:var(--accent);}
.sb-time{font-size:10px;color:var(--muted);font-family:'Share Tech Mono',monospace;margin-top:3px;}
.sb-label{font-size:9px;font-weight:700;letter-spacing:.2em;color:#333;padding:10px 12px 4px;font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;}
.sb-item{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;font-size:11px;font-weight:700;color:var(--muted);transition:all .1s;border-left:2px solid transparent;margin-bottom:1px;letter-spacing:.1em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;}
.sb-item:hover{background:#1a1a1a;color:#fff;}
.sb-item.active{background:rgba(200,255,0,.05);color:var(--accent);border-left-color:var(--accent);}
.sb-icon{font-size:14px;flex-shrink:0;width:18px;text-align:center;}
.sb-badge{margin-left:auto;background:var(--red);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;min-width:18px;text-align:center;border-radius:2px;}
.sb-badge.gold{background:var(--gold);color:#000;}
.sb-badge.blue{background:var(--blue);}
.admin-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:49;}

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
.hero-bg{position:relative;min-height:100vh;overflow:hidden;display:flex;align-items:center;background:#000;}
.hero-bg::before{content:'';position:absolute;inset:0;background-size:cover;background-position:center;opacity:.35;}
.hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,.92) 0%,rgba(0,0,0,.7) 55%,rgba(0,0,0,.2) 100%);}
.hero-content{position:relative;z-index:1;padding:clamp(40px,6vw,80px) clamp(24px,4vw,80px);max-width:700px;}
.hero-eyebrow{font-size:11px;letter-spacing:.3em;color:var(--accent);font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;margin-bottom:20px;display:flex;align-items:center;gap:10px;}
.hero-eyebrow::before{content:'';width:24px;height:2px;background:var(--accent);}
.hero-h1{font-family:'Barlow Condensed',sans-serif;font-size:clamp(56px,9vw,110px);line-height:.9;color:#fff;letter-spacing:.02em;margin-bottom:24px;text-transform:uppercase;font-weight:900;}
.hero-h1 span{color:var(--accent);}
.hero-p{color:#888;font-size:15px;line-height:1.7;max-width:460px;margin-bottom:36px;}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap;}
.hero-stats{display:flex;gap:0;border-top:1px solid #1f1f1f;border-bottom:1px solid #1f1f1f;background:rgba(0,0,0,.8);}
.hero-stats-inner{max-width:1100px;margin:0 auto;display:flex;width:100%;}
.hero-stat{flex:1;padding:20px;text-align:center;border-right:1px solid #1f1f1f;}
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
.vip-banner{background:linear-gradient(135deg,#1a2000 0%,#0d1300 100%);border:1px solid #2a3a00;padding:48px 40px;text-align:center;position:relative;overflow:hidden;}

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
.ticker-wrap{overflow:hidden;background:#000;border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;padding:0;white-space:nowrap;position:relative;}
.ticker-wrap::before{content:'';position:absolute;left:0;top:0;bottom:0;width:60px;background:linear-gradient(90deg,#000,transparent);z-index:2;pointer-events:none;}
.ticker-wrap::after{content:'';position:absolute;right:0;top:0;bottom:0;width:60px;background:linear-gradient(270deg,#000,transparent);z-index:2;pointer-events:none;}
.ticker-track{display:inline-flex;animation:ticker-scroll 18s linear infinite;}
.ticker-track:hover{animation-play-state:paused;}
.ticker-item{display:inline-flex;align-items:center;gap:20px;padding:10px 40px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);white-space:nowrap;}
.ticker-sep{color:#333;font-size:18px;flex-shrink:0;}
@keyframes ticker-scroll{0%{transform:translateX(0);}100%{transform:translateX(-50%);}}

/* ── RESPONSIVE ── */
@media(max-width:768px){
  .pub-nav-links{display:none;}
  .pub-nav-hamburger{display:flex;align-items:center;justify-content:center;}
  .bottom-nav{display:block;}
  .pub-page-wrap{padding-bottom:calc(var(--bottom-nav-h) + 16px);}
  .hero-bg{min-height:100svh;}
  .hero-cta{flex-direction:column;}
}
@media(min-width:769px){
  .pub-nav-hamburger{display:none;}
  .bottom-nav{display:none;}
}
`
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
  const detectorRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [method, setMethod] = useState("loading");

  useEffect(() => {
    let active = true;

    // Load jsQR from CDN if not already loaded
    const ensureJsQR = () => new Promise((resolve) => {
      if (window.jsQR) { resolve(true); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });

    (async () => {
      try {
        // Try BarcodeDetector first (native, works great on mobile)
        if ('BarcodeDetector' in window) {
          const formats = await BarcodeDetector.getSupportedFormats().catch(() => ['qr_code']);
          if (formats.includes('qr_code')) {
            detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] });
            setMethod("native");
          }
        }
        if (!detectorRef.current) {
          await ensureJsQR();
          setMethod(window.jsQR ? "jsqr" : "none");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setScanning(true);
        }
      } catch (e) {
        setError("Camera access denied. Please allow camera access and try again.");
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
    const tick = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      try {
        if (detectorRef.current) {
          // Native BarcodeDetector
          const codes = await detectorRef.current.detect(video);
          if (codes.length > 0) { onScan(codes[0].rawValue); return; }
        } else if (window.jsQR) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "attemptBoth" });
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
function SupabaseAuthModal({ mode, setMode, onClose, showToast, onLogin }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const login = async () => {
    if (!form.email || !form.password) { showToast("Email and password required", "red"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (error) throw error;
      // Immediately load profile and update cu — don't wait for onAuthStateChange
      if (data.user) {
        try {
          const profile = await api.profiles.getById(data.user.id);
          if (profile && onLogin) onLogin(normaliseProfile(profile));
        } catch {}
      }
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
          I understand airsoft activities carry inherent risk of injury. I agree to follow all safety rules on site, wear mandatory eye protection at all times, and acknowledge that Zulu's Airsoft Ltd is not liable for injuries sustained during gameplay. I confirm all information is accurate and I am fit to participate.
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
  const go = (id) => {
    // Guard: admin page requires admin role — never navigate there otherwise
    if (id === "admin" && cu?.role !== "admin") return;
    setPage(id);
    setDrawerOpen(false);
  };

  const signOut = async () => {
    // Force-clear the session from localStorage regardless of Supabase's response
    // (noopLock can cause signOut to silently fail)
    try { await supabase.auth.signOut(); } catch {}
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
    setCu(null);
    setDrawerOpen(false);
  };

  return (
    <>
      <nav className="pub-nav">
        <div className="pub-nav-inner">
          {/* Logo */}
          <div className="pub-nav-logo" onClick={() => go("home")}>
            <div className="pub-nav-logo-box">ZA</div>
            <span className="pub-nav-logo-text">ZULU'S <span>AIRSOFT</span></span>
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
                {cu.role === "admin" && (
                  <button className="btn btn-sm btn-gold" onClick={() => go("admin")}>⚙ Admin</button>
                )}
                <button className="btn btn-sm btn-ghost" onClick={() => go("profile")}>{cu.name.split(" ")[0]}</button>
                <button className="btn btn-sm btn-ghost" onClick={signOut}>Sign Out</button>
              </>
            ) : (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => setAuthModal("login")} style={{ padding:"8px 20px", fontSize:12 }}>LOGIN</button>
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
            ZULU'S <span style={{ color: "var(--accent)" }}>AIRSOFT</span>
          </div>
          {links.map(l => (
            <button key={l.id} className={`pub-nav-drawer-link ${page === l.id ? "active" : ""}`} onClick={() => go(l.id)}>
              <span style={{ fontSize: 20 }}>{l.icon}</span> {l.label}
            </button>
          ))}
          <hr className="pub-nav-drawer-divider" />
          {cu ? (
            <>
              {cu.role === "admin" && (
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

  const totalPlayers  = data.users.filter(u => u.role === "player").length;
  const totalEvents   = data.events.filter(e => e.published).length;
  const totalBookings = data.events.flatMap(e => e.bookings).length;

  return (
    <div>
      {data.homeMsg && (
        <div className="ticker-wrap">
          {/* Duplicate content so ticker scrolls seamlessly */}
          <div className="ticker-track">
            {[...Array(6)].map((_, i) => (
              <span key={i} className="ticker-item">
                <span style={{ color:"var(--accent)", fontSize:16 }}>⚡</span>
                {data.homeMsg}
                <span className="ticker-sep">◆</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* HERO */}
      <div className="hero-bg" style={{ backgroundImage:"url('https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1600&q=80&auto=format&fit=crop')" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", width:"100%", position:"relative", zIndex:1, padding:"0 24px" }}>
          <div className="hero-content">
            {/* ── MILITARY BANNER ── */}
            <div style={{ marginBottom:32, maxWidth:640 }}>
              <svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" style={{ width:"100%", height:"auto", display:"block", filter:"drop-shadow(0 8px 32px rgba(0,0,0,.8))" }}>
                <defs>
                  {/* Camo pattern */}
                  <pattern id="camo" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                    <rect width="60" height="60" fill="#1a2210"/>
                    <ellipse cx="12" cy="10" rx="10" ry="7" fill="#243015" opacity=".9"/>
                    <ellipse cx="42" cy="22" rx="14" ry="9" fill="#2d3a18" opacity=".8"/>
                    <ellipse cx="28" cy="42" rx="12" ry="8" fill="#1e2a10" opacity=".9"/>
                    <ellipse cx="55" cy="50" rx="8" ry="6" fill="#3a4a20" opacity=".7"/>
                    <ellipse cx="8" cy="48" rx="7" ry="5" fill="#243015" opacity=".8"/>
                    <ellipse cx="50" cy="5" rx="9" ry="6" fill="#2d3a18" opacity=".7"/>
                  </pattern>
                  {/* Battle damage overlay */}
                  <filter id="roughen">
                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise"/>
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G"/>
                  </filter>
                  {/* Grunge texture */}
                  <filter id="grunge" x="-5%" y="-5%" width="110%" height="110%">
                    <feTurbulence type="turbulence" baseFrequency="0.065" numOctaves="3" stitchTiles="stitch" result="t"/>
                    <feColorMatrix type="saturate" values="0" in="t" result="g"/>
                    <feBlend in="SourceGraphic" in2="g" mode="multiply" result="b"/>
                    <feComposite in="b" in2="SourceGraphic" operator="in"/>
                  </filter>
                  <clipPath id="bannerClip">
                    <polygon points="0,0 635,0 640,5 640,215 635,220 5,220 0,215"/>
                  </clipPath>
                </defs>

                {/* Base camo background */}
                <g clipPath="url(#bannerClip)">
                  <rect width="640" height="220" fill="url(#camo)"/>

                  {/* Dark overlay for text contrast */}
                  <rect width="640" height="220" fill="rgba(0,0,0,0.55)"/>

                  {/* Top accent stripe */}
                  <rect x="0" y="0" width="640" height="5" fill="#c8ff00" opacity=".9"/>

                  {/* Bottom accent stripe */}
                  <rect x="0" y="215" width="640" height="5" fill="#c8ff00" opacity=".9"/>

                  {/* Left tactical stripe */}
                  <rect x="0" y="0" width="4" height="220" fill="#c8ff00" opacity=".7"/>

                  {/* Right tactical stripe */}
                  <rect x="636" y="0" width="4" height="220" fill="#c8ff00" opacity=".7"/>

                  {/* Crosshair — top left */}
                  <g opacity=".25" transform="translate(42,38)">
                    <circle cx="0" cy="0" r="18" fill="none" stroke="#c8ff00" strokeWidth="1.5"/>
                    <circle cx="0" cy="0" r="4" fill="none" stroke="#c8ff00" strokeWidth="1"/>
                    <line x1="-24" y1="0" x2="-8" y2="0" stroke="#c8ff00" strokeWidth="1.5"/>
                    <line x1="8"  y1="0" x2="24"  y2="0" stroke="#c8ff00" strokeWidth="1.5"/>
                    <line x1="0" y1="-24" x2="0" y2="-8" stroke="#c8ff00" strokeWidth="1.5"/>
                    <line x1="0" y1="8"  x2="0" y2="24"  stroke="#c8ff00" strokeWidth="1.5"/>
                  </g>

                  {/* Crosshair — bottom right */}
                  <g opacity=".2" transform="translate(596,182)">
                    <circle cx="0" cy="0" r="14" fill="none" stroke="#c8ff00" strokeWidth="1.2"/>
                    <circle cx="0" cy="0" r="3" fill="none" stroke="#c8ff00" strokeWidth="1"/>
                    <line x1="-20" y1="0" x2="-6" y2="0" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="6"  y1="0" x2="20"  y2="0" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="0" y1="-20" x2="0" y2="-6" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="0" y1="6"  x2="0" y2="20"  stroke="#c8ff00" strokeWidth="1.2"/>
                  </g>

                  {/* Dog-tag shape top-right */}
                  <g transform="translate(566, 14)" opacity=".18">
                    <rect x="0" y="0" width="54" height="28" rx="4" fill="none" stroke="#c8ff00" strokeWidth="1.2"/>
                    <line x1="14" y1="0" x2="14" y2="28" stroke="#c8ff00" strokeWidth=".8" opacity=".5"/>
                    <text x="6"  y="11" fontFamily="'Share Tech Mono',monospace" fontSize="5" fill="#c8ff00" letterSpacing=".08em">ZULU-ALPHA</text>
                    <text x="6"  y="18" fontFamily="'Share Tech Mono',monospace" fontSize="4.5" fill="#c8ff00" letterSpacing=".06em">BLOOD: O-POS</text>
                    <text x="6"  y="25" fontFamily="'Share Tech Mono',monospace" fontSize="4.5" fill="#c8ff00" letterSpacing=".06em">UKARA: ACTIVE</text>
                  </g>

                  {/* Bullet holes */}
                  <circle cx="580" cy="58" r="5" fill="#000" opacity=".8"/>
                  <circle cx="580" cy="58" r="5" fill="none" stroke="#333" strokeWidth="1.5"/>
                  <line x1="578" y1="54" x2="574" y2="48" stroke="#222" strokeWidth=".8" opacity=".6"/>
                  <line x1="582" y1="54" x2="587" y2="49" stroke="#222" strokeWidth=".8" opacity=".6"/>
                  <line x1="584" y1="58" x2="590" y2="58" stroke="#222" strokeWidth=".8" opacity=".6"/>
                  <line x1="576" y1="62" x2="570" y2="65" stroke="#222" strokeWidth=".8" opacity=".6"/>

                  <circle cx="60" cy="175" r="4" fill="#000" opacity=".8"/>
                  <circle cx="60" cy="175" r="4" fill="none" stroke="#333" strokeWidth="1.2"/>
                  <line x1="58" y1="171" x2="55" y2="166" stroke="#222" strokeWidth=".7" opacity=".6"/>
                  <line x1="62" y1="171" x2="66" y2="167" stroke="#222" strokeWidth=".7" opacity=".6"/>
                  <line x1="64" y1="175" x2="68" y2="175" stroke="#222" strokeWidth=".7" opacity=".6"/>

                  {/* Grid / tactical overlay lines */}
                  <line x1="0" y1="40" x2="640" y2="40" stroke="#c8ff00" strokeWidth=".4" opacity=".08"/>
                  <line x1="0" y1="180" x2="640" y2="180" stroke="#c8ff00" strokeWidth=".4" opacity=".08"/>
                  <line x1="80" y1="0" x2="80" y2="220" stroke="#c8ff00" strokeWidth=".4" opacity=".06"/>
                  <line x1="560" y1="0" x2="560" y2="220" stroke="#c8ff00" strokeWidth=".4" opacity=".06"/>

                  {/* OP ZULU-ECHO classification stamp — faint */}
                  <text x="320" y="195" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontSize="9" fontWeight="900"
                    fill="none" stroke="#c8ff00" strokeWidth=".5" letterSpacing=".4em" opacity=".2">
                    ✦ CLASSIFIED — OP ZULU-ECHO — AUTHORISED PERSONNEL ONLY ✦
                  </text>

                  {/* TOP LABEL */}
                  <text x="320" y="42" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="11" fontWeight="700"
                    fill="#c8ff00" letterSpacing=".45em" opacity=".9">
                    ◆  TACTICAL AIRSOFT EXPERIENCE  ◆
                  </text>

                  {/* WELCOME TO — outline style */}
                  <text x="320" y="98" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="38" fontWeight="900"
                    fill="none" stroke="#fff" strokeWidth="1.2"
                    letterSpacing=".12em" opacity=".55">
                    WELCOME TO
                  </text>
                  <text x="320" y="98" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="38" fontWeight="900"
                    fill="#fff" letterSpacing=".12em" opacity=".9">
                    WELCOME TO
                  </text>

                  {/* ZULU'S — large lime stencil */}
                  <text x="320" y="155" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="72" fontWeight="900"
                    fill="none" stroke="#c8ff00" strokeWidth="2.5"
                    letterSpacing=".08em" opacity=".3">
                    ZULU'S
                  </text>
                  <text x="320" y="155" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="72" fontWeight="900"
                    fill="#c8ff00" letterSpacing=".08em"
                    style={{ filter:"drop-shadow(0 0 12px rgba(200,255,0,.6))" }}>
                    ZULU'S
                  </text>

                  {/* AIRSOFT — medium white */}
                  <text x="320" y="185" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="30" fontWeight="800"
                    fill="#fff" letterSpacing=".3em" opacity=".85">
                    AIRSOFT
                  </text>

                  {/* Corner bracket marks */}
                  <g stroke="#c8ff00" strokeWidth="2" fill="none" opacity=".6">
                    <polyline points="8,22 8,8 22,8"/>
                    <polyline points="618,8 632,8 632,22"/>
                    <polyline points="8,198 8,212 22,212"/>
                    <polyline points="618,212 632,212 632,198"/>
                  </g>

                </g>
              </svg>
            </div>

            <p className="hero-p">
              Experience the ultimate airsoft gameplay. From intense skirmishes to special ops events, gear up and join the action.
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary" style={{ padding:"13px 32px", fontSize:14 }} onClick={() => setPage("events")}>BOOK NOW</button>
              <button className="btn btn-ghost"   style={{ padding:"13px 28px", fontSize:14 }} onClick={() => setPage("vip")}>BECOME VIP</button>
            </div>
          </div>
        </div>
      </div>

      {/* MISSION COUNTDOWN */}
      {nextEvent && (() => {
        const target = nextEvent.date + "T" + nextEvent.time + ":00";
        return (
          <div style={{ borderTop:"1px solid #1a1a1a", borderBottom:"1px solid #1a1a1a", background:"#0a0a0a" }}>
            <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 24px" }}>
              <div style={{ background:"var(--accent)", padding:"6px 16px", display:"flex", alignItems:"center", gap:12, marginBottom:0 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:10, letterSpacing:".4em", color:"#000", fontWeight:800 }}>MISSION BRIEFING</span>
                <span style={{ marginLeft:"auto", fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"rgba(0,0,0,.6)", letterSpacing:".1em" }}>
                  OP-{(nextEvent.id || "ALPHA").slice(0,8).toUpperCase()}
                </span>
              </div>
              <div className="countdown-panel" style={{ border:"none", borderRadius:0, padding:"24px 0" }}>
                <div className="countdown-panel-info">
                  <div className="countdown-panel-label">▶ NEXT DEPLOYMENT</div>
                  <div className="countdown-panel-title">{nextEvent.title}</div>
                  <div className="countdown-panel-meta">
                    📍 {nextEvent.location}<br />
                    🗓 {nextEvent.date} · {nextEvent.time} HRS GMT
                  </div>
                  <button className="btn btn-primary mt-2" style={{ padding:"9px 28px", letterSpacing:".2em" }} onClick={() => setPage("events")}>DEPLOY →</button>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end" }}>
                  <div style={{ fontSize:9, letterSpacing:".3em", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginBottom:6 }}>T-MINUS</div>
                  <div className="countdown-panel-timer">
                    <CountdownPanel target={target} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* STAT BAR */}
      <div className="hero-stats">
        <div className="hero-stats-inner">
          {[
            { num: totalPlayers  || "—", label: "ACTIVE OPERATORS" },
            { num: totalEvents   || "—", label: "SCHEDULED OPS"   },
            { num: totalBookings || "—", label: "CONFIRMED BOOTS"  },
            { num: "10%",               label: "VIP DISCOUNT"     },
          ].map(s => (
            <div key={s.label} className="hero-stat" style={{ flex:1 }}>
              <div className="hero-stat-num">{s.num}</div>
              <div className="hero-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURE STRIP */}
      <div style={{ background:"#0d0d0d", borderTop:"1px solid #1a1a1a", borderBottom:"3px solid var(--accent)" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, padding:"40px 24px", maxWidth:1200, margin:"0 auto" }}>
          {[
            { icon:"🛡", title:"SAFETY FIRST", desc:"Full safety briefings, quality equipment, and experienced marshals on every game day." },
            { icon:"👥", title:"ALL SKILL LEVELS", desc:"Whether you're a beginner or veteran, we have game modes for everyone." },
            { icon:"⭐", title:"VIP BENEFITS", desc:"10% off all bookings and shop items. Exclusive VIP-only events and UKARA registration support." },
          ].map(feat => (
            <div key={feat.title} className="feature-card">
              <div style={{ fontSize:32, color:"var(--accent)", marginBottom:14 }}>{feat.icon}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:17, fontWeight:800, letterSpacing:".08em", color:"#fff", marginBottom:8, textTransform:"uppercase" }}>{feat.title}</div>
              <div style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7 }}>{feat.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="page-content">

        {/* UPCOMING EVENTS */}
        {data.events.filter(e => e.published).length > 0 && (
          <div style={{ marginBottom:48 }}>
            <div className="section-header">
              <div>
                <div className="section-title">UPCOMING <span>EVENTS</span></div>
                <div className="section-sub">Book your next game day</div>
              </div>
              <button className="section-link" onClick={() => setPage("events")}>VIEW ALL →</button>
            </div>
            <div className="grid-3">
              {data.events.filter(e => e.published).slice(0, 3).map(ev => {
                const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
                const total  = ev.walkOnSlots + ev.rentalSlots;
                const spotsLeft = total - booked;
                return (
                  <div key={ev.id} className="event-card" onClick={() => setPage("events")}>
                    <div className="event-banner-img" style={{ position:"relative" }}>
                      {ev.banner
                        ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" />
                        : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"#333", fontSize:40 }}>📅</div>
                      }
                      <div style={{ position:"absolute", top:12, left:12 }}>
                        <span style={{ background:"var(--accent)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>SKIRMISH</span>
                      </div>
                    </div>
                    <div className="event-card-body">
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".06em", textTransform:"uppercase", marginBottom:10, color:"#fff" }}>{ev.title}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:3, marginBottom:12 }}>
                        <div style={{ fontSize:12, color:"var(--muted)" }}>📅 {ev.date}</div>
                        <div style={{ fontSize:12, color:"var(--muted)" }}>📍 {ev.location}</div>
                        <div style={{ fontSize:12, color:"var(--muted)" }}>👥 {spotsLeft} spots left</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:17, color:"var(--accent)" }}>£{Math.min(ev.walkOnPrice, ev.rentalPrice)}</span>
                        <button className="btn btn-primary" style={{ padding:"7px 16px", fontSize:11 }}>BOOK NOW</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TACTICAL GEAR */}
        {data.shop.filter(p => p.published !== false).length > 0 && (
          <div style={{ marginBottom:48 }}>
            <div className="section-header">
              <div>
                <div className="section-title">TACTICAL <span>GEAR</span></div>
                <div className="section-sub">BBs, gas, pyro and more</div>
              </div>
              <button className="section-link" onClick={() => setPage("shop")}>SHOP ALL →</button>
            </div>
            <div className="grid-4">
              {data.shop.filter(p => p.published !== false).slice(0, 4).map(prod => (
                <div key={prod.id} className="shop-card" onClick={() => setPage("shop")} style={{ cursor:"pointer" }}>
                  <div className="shop-img">
                    {prod.image ? <img src={prod.image} alt={prod.name} /> : <span style={{ fontSize:32, opacity:.3 }}>📦</span>}
                  </div>
                  <div className="shop-body">
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:".12em", color:"var(--muted)", textTransform:"uppercase", fontFamily:"'Barlow Condensed',sans-serif", marginBottom:4 }}>{prod.category || "GEAR"}</div>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:6, color:"#fff" }}>{prod.name}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)" }}>£{prod.price}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* VIP BANNER */}
      <div className="vip-banner">
        <div style={{ maxWidth:700, margin:"0 auto" }}>
          <div className="section-title" style={{ marginBottom:16 }}>BECOME A <span>VIP MEMBER</span></div>
          <p style={{ fontSize:15, color:"#aaa", marginBottom:28, lineHeight:1.7 }}>
            After 3 game days, unlock VIP membership for just £30/year. Get 10% off everything, access exclusive events, and UKARA registration support.
          </p>
          <button className="btn btn-primary" style={{ padding:"13px 36px", fontSize:14 }} onClick={() => setPage("vip")}>LEARN MORE</button>
        </div>
      </div>

    </div>
  );
}

// Inline countdown for panel
function CountdownPanel({ target }) {
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
    <>
      {[["DAYS", d], ["HRS", h], ["MIN", m], ["SEC", s]].map(([l, n]) => (
        <div className="countdown-panel-unit" key={l}>
          <div className="countdown-panel-num">{String(n).padStart(2, "0")}</div>
          <div className="countdown-panel-lbl">{l}</div>
        </div>
      ))}
    </>
  );
}

// ── Events Page ───────────────────────────────────────────
function EventsPage({ data, cu, updateEvent, updateUser, showToast, setAuthModal, save }) {
  const [detail, setDetail] = useState(null);
  const [waiverModal, setWaiverModal] = useState(false);
  const [tab, setTab] = useState("info");
  const [paypalError, setPaypalError] = useState(null);
  const [bookingBusy, setBookingBusy] = useState(false);

  // ── Booking cart: { walkOn: qty, rental: qty, extras: { [id]: qty } }
  const [bCart, setBCart] = useState({ walkOn: 0, rental: 0, extras: {} });

  const ev = detail ? data.events.find(e => e.id === detail) : null;

  const resetCart = () => setBCart({ walkOn: 0, rental: 0, extras: {} });

  if (ev) {
    const vipDisc   = cu?.vipStatus === "active" ? 0.1 : 0;
    const waiverValid = (cu?.waiverSigned && cu?.waiverYear === new Date().getFullYear()) || cu?.role === "admin";
    const myBookings  = cu ? ev.bookings.filter(b => b.userId === cu.id) : [];

    // Per-type slots remaining
    const walkOnBooked = ev.bookings.filter(b => b.type === "walkOn").reduce((s,b) => s + b.qty, 0);
    const rentalBooked = ev.bookings.filter(b => b.type === "rental").reduce((s,b) => s + b.qty, 0);
    const walkOnLeft   = ev.walkOnSlots - walkOnBooked;
    const rentalLeft   = ev.rentalSlots - rentalBooked;
    const totalBooked  = walkOnBooked + rentalBooked;
    const totalSlots   = ev.walkOnSlots + ev.rentalSlots;

    // Cart totals
    const walkOnTotal  = bCart.walkOn  * ev.walkOnPrice * (1 - vipDisc);
    const rentalTotal  = bCart.rental  * ev.rentalPrice * (1 - vipDisc);
    const shopData = data.shop || [];
    const visibleExtras = ev.extras; // show all event extras
    // extras keyed by "extraId" (no variant) or "extraId:variantId"
    const extraKey = (id, variantId) => variantId ? id + ":" + variantId : id;
    const getExtraQty = (id, variantId) => bCart.extras[extraKey(id, variantId)] || 0;
    const extrasTotal = visibleExtras.reduce((s, ex) => {
      const lp = shopData.find(p => p.id === ex.productId);
      if (lp?.variants?.length > 0) {
        return s + lp.variants.reduce((vs, v) => vs + getExtraQty(ex.id, v.id) * Number(v.price), 0);
      }
      return s + getExtraQty(ex.id, null) * (lp ? lp.price : ex.price);
    }, 0);
    const grandTotal   = walkOnTotal + rentalTotal + extrasTotal;
    const cartEmpty    = bCart.walkOn === 0 && bCart.rental === 0 && extrasTotal === 0;
    const setExtra = (id, qty, variantId) => {
      const k = extraKey(id, variantId);
      setBCart(p => {
        const next = { ...p.extras };
        if (qty > 0) next[k] = Math.max(0, qty); else delete next[k];
        return { ...p, extras: next };
      });
    };

    const setWalkOn = (n) => setBCart(p => ({ ...p, walkOn: Math.max(0, Math.min(n, walkOnLeft)) }));
    const setRental = (n) => setBCart(p => ({ ...p, rental: Math.max(0, Math.min(n, rentalLeft)) }));


    const confirmBookingAfterPayment = async (paypalOrder) => {
      setBookingBusy(true);
      setPaypalError(null);
      const safety = setTimeout(() => setBookingBusy(false), 30000);
      try {
        const extrasSnapshot = Object.fromEntries(Object.entries(bCart.extras).filter(([,v]) => v > 0));
        // Create booking records in parallel
        const bookingPromises = [];
        if (bCart.walkOn > 0) {
          bookingPromises.push(api.bookings.create({
            eventId: ev.id, userId: cu.id, userName: cu.name,
            type: "walkOn", qty: bCart.walkOn,
            extras: extrasSnapshot,
            total: walkOnTotal + extrasTotal,
            paypalOrderId: paypalOrder.id,
          }));
        }
        if (bCart.rental > 0) {
          bookingPromises.push(api.bookings.create({
            eventId: ev.id, userId: cu.id, userName: cu.name,
            type: "rental", qty: bCart.rental,
            extras: bCart.walkOn > 0 ? {} : extrasSnapshot,
            total: rentalTotal + (bCart.walkOn > 0 ? 0 : extrasTotal),
            paypalOrderId: paypalOrder.id,
          }));
        }
        await Promise.all(bookingPromises);

        // Show success immediately — stock deduction and refresh happen in background
        resetCart();
        showToast("🎉 Booked! Payment confirmed.");

        // Background: deduct stock (non-blocking)
        const deductPromises = Object.entries(extrasSnapshot)
          .filter(([,qty]) => qty > 0)
          .map(([key, qty]) => {
            const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
            const extra = visibleExtras.find(e => e.id === extraId);
            if (!extra?.productId) return Promise.resolve();
            return variantId
              ? supabase.rpc("deduct_variant_stock", { product_id: extra.productId, variant_id: variantId, qty }).catch(() => {})
              : supabase.rpc("deduct_stock", { product_id: extra.productId, qty }).catch(() => {});
          });

        // Refresh data in background
        Promise.all([
          ...deductPromises,
          api.events.getAll().then(evList => save({ events: evList })).catch(() => {}),
          api.shop.getAll().then(freshShop => save({ shop: freshShop })).catch(() => {}),
        ]);

      } catch (e) {
        setPaypalError("Payment taken but booking failed — please contact us. Error: " + (e.message || String(e)));
      } finally {
        clearTimeout(safety);
        setBookingBusy(false);
      }
    };

    const bookingBlocked = !cu || !waiverValid || cartEmpty;

    return (
      <div className="page-content">
        <button className="btn btn-ghost btn-sm mb-2" onClick={() => { setDetail(null); setTab("info"); resetCart(); }}>← Back to Events</button>

        {/* Banner */}
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
          <div style={{ height:160, background:"linear-gradient(135deg,#150e08,#111827)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {ev.banner ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" /> : <span style={{ fontSize:28, fontWeight:900, color:"var(--accent)" }}>{ev.title}</span>}
          </div>
          <div style={{ padding:20 }}>
            <div className="gap-2 mb-1">
              <h2 style={{ fontSize:24, fontWeight:800 }}>{ev.title}</h2>
              {myBookings.length > 0 && <span className="tag tag-green">✓ BOOKED</span>}
            </div>
            <div className="gap-2 mb-2">
              <span className="tag tag-green">{ev.date}</span>
              <span className="tag tag-blue">{ev.time} GMT</span>
              <span className="tag tag-purple">{ev.location}</span>
              <span style={{ fontSize:12, color: totalBooked/totalSlots > 0.8 ? "var(--red)" : "var(--muted)" }}>{totalBooked}/{totalSlots} slots</span>
            </div>
            <div className="progress-bar" style={{ marginBottom:16 }}>
              <div className={`progress-fill ${totalBooked/totalSlots > 0.8 ? "red" : ""}`} style={{ width:Math.min(100, totalBooked/totalSlots*100)+"%" }} />
            </div>
          </div>
        </div>

        <div className="nav-tabs">
          {["info","map"].map(t => <button key={t} className={`nav-tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
        </div>

        {tab === "info" && (
          <div>
            {/* Description */}
            <div className="card mb-2">
              <p style={{ color:"var(--muted)", lineHeight:1.7, marginBottom:0 }}>{ev.description}</p>
            </div>

            {/* ── BOOKING CARD ── */}
            <div className="card" style={{ borderTop:"3px solid var(--accent)" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:11, letterSpacing:".25em", color:"var(--accent)", marginBottom:16 }}>BOOK THIS EVENT</div>

              {!cu && <div className="alert alert-gold mb-2">You must be <button className="btn btn-sm btn-ghost" style={{ marginLeft:4 }} onClick={() => setAuthModal("login")}>logged in</button> to book.</div>}
              {cu && !waiverValid && <div className="alert alert-red mb-2">⚠️ Waiver required. <button className="btn btn-sm btn-ghost" style={{ marginLeft:8 }} onClick={() => setWaiverModal(true)}>Sign Waiver</button></div>}
              {cu?.vipStatus === "active" && <div className="alert alert-gold mb-2">⭐ VIP 10% discount applied</div>}

              {/* Existing bookings */}
              {myBookings.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:9, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, marginBottom:8 }}>YOUR EXISTING BOOKINGS</div>
                  {myBookings.map(b => (
                    <div key={b.id} style={{ background:"var(--bg4)", border:"1px solid #2a2a2a", borderLeft:"3px solid #7dc840", padding:"10px 14px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:12, color:"#fff" }}>
                          {b.type === "walkOn" ? "🎯 Walk-On" : "🪖 Rental"} ×{b.qty}
                        </div>
                        <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>£{b.total.toFixed(2)} · ID: {b.id.slice(0,8)}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:10, color:"var(--muted)", marginBottom:4 }}>Check-in QR</div>
                        <QRCode value={b.id} size={56} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── TICKET BUILDER ── */}
              <div style={{ border:"1px solid #2a2a2a", marginBottom:16 }}>
                <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #1e1e1e" }}>
                  ADD TICKETS TO ORDER
                </div>

                {/* Walk-On row */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:"1px solid #1a1a1a" }}>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🎯 Walk-On</div>
                    <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
                      £{ev.walkOnPrice}{vipDisc > 0 ? ` → £${(ev.walkOnPrice*(1-vipDisc)).toFixed(2)} VIP` : ""} · {walkOnLeft} slots left
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid #333", background:"#111" }}>
                    <button onClick={() => setWalkOn(bCart.walkOn - 1)} disabled={bCart.walkOn === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.walkOn===0?.4:1 }}>−</button>
                    <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.walkOn>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.walkOn}</span>
                    <button onClick={() => setWalkOn(bCart.walkOn + 1)} disabled={walkOnLeft === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: walkOnLeft===0?.4:1 }}>+</button>
                  </div>
                </div>

                {/* Rental row */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom: ev.extras.length > 0 ? "1px solid #1a1a1a" : "none" }}>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🪖 Rental Package</div>
                    <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
                      £{ev.rentalPrice}{vipDisc > 0 ? ` → £${(ev.rentalPrice*(1-vipDisc)).toFixed(2)} VIP` : ""} · {rentalLeft} slots left
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid #333", background:"#111" }}>
                    <button onClick={() => setRental(bCart.rental - 1)} disabled={bCart.rental === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.rental===0?.4:1 }}>−</button>
                    <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.rental>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.rental}</span>
                    <button onClick={() => setRental(bCart.rental + 1)} disabled={rentalLeft === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: rentalLeft===0?.4:1 }}>+</button>
                  </div>
                </div>

                {/* Extras */}
                {ev.extras.length > 0 && (
                  <div style={{ padding:"0 16px 14px" }}>
                    <div style={{ fontSize:9, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, margin:"12px 0 8px" }}>EXTRAS</div>
                    {visibleExtras.map(ex => {
                      const lp = (data.shop || []).find(s => s.id === ex.productId);
                      const liveNoPost = lp ? lp.noPost : ex.noPost;
                      const hasVariants = lp?.variants?.length > 0;
                      return (
                        <div key={ex.id} style={{ padding:"12px 0", borderBottom:"1px solid #1a1a1a" }}>
                          {/* Extra name header */}
                          <div style={{ fontSize:13, fontWeight:600, color:"#fff", marginBottom:8 }}>
                            {ex.name}
                            {liveNoPost && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:6 }}>Collect Only</span>}
                          </div>
                          {hasVariants ? (
                            /* One counter row per variant */
                            lp.variants.map(v => {
                              const qty = getExtraQty(ex.id, v.id);
                              const stock = Number(v.stock);
                              const outOfStock = stock < 1;
                              return (
                                <div key={v.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", opacity: outOfStock ? 0.4 : 1 }}>
                                  <div>
                                    <span style={{ fontSize:12, color:"var(--text)" }}>{v.name}</span>
                                    <span style={{ fontSize:11, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", marginLeft:10 }}>£{Number(v.price).toFixed(2)}</span>
                                    <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginLeft:8 }}>{outOfStock ? "Out of stock" : `${stock} left`}</span>
                                  </div>
                                  <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#111", flexShrink:0 }}>
                                    <button onClick={() => setExtra(ex.id, qty - 1, v.id)} disabled={qty === 0 || outOfStock} style={{ background:"none", border:"none", color:"var(--text)", padding:"5px 11px", cursor:"pointer", opacity: qty===0?0.3:1 }}>−</button>
                                    <span style={{ padding:"0 10px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:15, color: qty > 0 ? "var(--accent)" : "var(--text)", minWidth:26, textAlign:"center" }}>{qty}</span>
                                    <button onClick={() => setExtra(ex.id, qty + 1, v.id)} disabled={outOfStock || qty >= stock} style={{ background:"none", border:"none", color:"var(--text)", padding:"5px 11px", cursor:"pointer", opacity: (outOfStock||qty>=stock)?0.3:1 }}>+</button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            /* No variants — single counter */
                            (() => {
                              const qty = getExtraQty(ex.id, null);
                              const livePrice = lp ? lp.price : ex.price;
                              const stock = lp ? lp.stock : 999;
                              return (
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                  <span style={{ fontSize:12, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>£{Number(livePrice).toFixed(2)}</span>
                                  <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#111" }}>
                                    <button onClick={() => setExtra(ex.id, qty - 1, null)} disabled={qty === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"6px 12px", cursor:"pointer", opacity: qty===0?0.3:1 }}>−</button>
                                    <span style={{ padding:"0 12px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, color: qty > 0 ? "var(--accent)" : "var(--text)", minWidth:30, textAlign:"center" }}>{qty}</span>
                                    <button onClick={() => setExtra(ex.id, qty + 1, null)} disabled={qty >= stock} style={{ background:"none", border:"none", color:"var(--text)", padding:"6px 12px", cursor:"pointer", opacity: qty>=stock?0.3:1 }}>+</button>
                                  </div>
                                </div>
                              );
                            })()
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Order summary */}
              {!cartEmpty && (
                <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:9, letterSpacing:".25em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, marginBottom:12 }}>ORDER SUMMARY</div>
                  {bCart.walkOn > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                      <span className="text-muted">🎯 Walk-On ×{bCart.walkOn}</span>
                      <span>£{walkOnTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {bCart.rental > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                      <span className="text-muted">🪖 Rental ×{bCart.rental}</span>
                      <span>£{rentalTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {visibleExtras.flatMap(ex => {
                    const lp = (data.shop || []).find(s => s.id === ex.productId);
                    if (lp?.variants?.length > 0) {
                      return lp.variants
                        .filter(v => getExtraQty(ex.id, v.id) > 0)
                        .map(v => {
                          const q = getExtraQty(ex.id, v.id);
                          return (
                            <div key={ex.id + ":" + v.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                              <span className="text-muted">{ex.name} — {v.name} ×{q}</span>
                              <span>£{(q * Number(v.price)).toFixed(2)}</span>
                            </div>
                          );
                        });
                    }
                    const q = getExtraQty(ex.id, null);
                    if (!q) return [];
                    const livePrice = lp ? lp.price : ex.price;
                    return [(
                      <div key={ex.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                        <span className="text-muted">{ex.name} ×{q}</span>
                        <span>£{(q * Number(livePrice)).toFixed(2)}</span>
                      </div>
                    )];
                  })}
                  {vipDisc > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6, color:"var(--gold)" }}>
                      <span>VIP 10% discount applied</span>
                    </div>
                  )}
                  <div style={{ borderTop:"1px solid #2a2a2a", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, color:"#fff" }}>
                    <span>TOTAL</span>
                    <span style={{ color:"var(--accent)" }}>£{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {cartEmpty && cu && waiverValid && (
                <div style={{ textAlign:"center", padding:"20px 0", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>
                  Add tickets above to continue
                </div>
              )}

              {paypalError && <div className="alert alert-red mt-1">⚠️ {paypalError}</div>}
              {bookingBusy && <div className="alert alert-blue mt-1">⏳ Confirming your booking…</div>}

              {!cu && (
                <button className="btn btn-primary" style={{ width:"100%", padding:"12px", fontSize:14, letterSpacing:".1em" }} onClick={() => setAuthModal("login")}>
                  LOG IN TO BOOK
                </button>
              )}
              {cu && !waiverValid && (
                <button className="btn btn-primary" style={{ width:"100%", padding:"12px", fontSize:14 }} onClick={() => setWaiverModal(true)}>
                  SIGN WAIVER TO CONTINUE
                </button>
              )}
              {!bookingBlocked && (
                <PayPalCheckoutButton
                  amount={grandTotal}
                  description={`${ev.title} — ${[bCart.walkOn>0 && `${bCart.walkOn}x Walk-On`, bCart.rental>0 && `${bCart.rental}x Rental`].filter(Boolean).join(", ")}`}
                  onSuccess={confirmBookingAfterPayment}
                  disabled={bookingBusy}
                />
              )}
            </div>
          </div>
        )}

        {tab === "map" && (
          <div style={{ borderRadius:4, overflow:"hidden", border:"1px solid var(--border)" }}>
            {ev.mapEmbed ? (
              <div
                style={{ width:"100%", height:"clamp(340px,60vh,620px)", lineHeight:0 }}
                dangerouslySetInnerHTML={{ __html: ev.mapEmbed.replace(/height="[^"]*"/g,'height="100%"').replace(/width="[^"]*"/g,'width="100%"').replace(/<iframe /g,'<iframe style="width:100%;height:100%;border:0;display:block;" ') }}
              />
            ) : (
              <div style={{ height:260, background:"var(--bg4)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--muted)", fontSize:13 }}>
                No map configured for this event
              </div>
            )}
            <div style={{ background:"var(--bg2)", padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>📍 {ev.location}</div>
                <div style={{ fontSize:12, color:"var(--muted)" }}>{ev.date} · {ev.time} GMT</div>
              </div>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.location)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                <button className="btn btn-primary" style={{ padding:"9px 20px", fontSize:13 }}>🗺️ Get Directions</button>
              </a>
            </div>
          </div>
        )}

        {waiverModal && <WaiverModal cu={cu} updateUser={updateUser} onClose={() => setWaiverModal(false)} showToast={showToast} />}
      </div>
    );
  }

  // ── Event list ──
  return (
    <div className="page-content">
      <div className="page-header">
        <div><div className="page-title">Events</div><div className="page-sub">Book your next game day</div></div>
      </div>
      <div className="grid-3">
        {data.events.filter(e => e.published).map(ev => {
          const booked = ev.bookings.reduce((s,b) => s + b.qty, 0);
          const total  = ev.walkOnSlots + ev.rentalSlots;
          return (
            <div key={ev.id} className="event-card" onClick={() => { setDetail(ev.id); setTab("info"); resetCart(); }}>
              <div className="event-banner-img" style={{ position:"relative" }}>
                {ev.banner
                  ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" />
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"#333", fontSize:32 }}>📅</div>
                }
                <div style={{ position:"absolute", top:12, left:12 }}>
                  <span style={{ background:"var(--accent)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>SKIRMISH</span>
                </div>
              </div>
              <div className="event-card-body">
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".06em", textTransform:"uppercase", marginBottom:10, color:"#fff" }}>{ev.title}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--muted)" }}>
                    <span>📅</span> {ev.date}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--muted)" }}>
                    <span>⏱</span> {ev.time} GMT
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--muted)" }}>
                    <span>📍</span> {ev.location}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--muted)" }}>
                    <span>👥</span> {booked} / {total} spots
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)" }}>
                    From £{Math.min(ev.walkOnPrice, ev.rentalPrice)}
                  </div>
                  <button className="btn btn-primary" style={{ padding:"8px 18px", fontSize:12 }}>BOOK NOW</button>
                </div>
              </div>
            </div>
          );
        })}
        {data.events.filter(e => e.published).length === 0 && (
          <div className="card" style={{ gridColumn:"1/-1", textAlign:"center", color:"var(--muted)", padding:40 }}>No events published yet.</div>
        )}
      </div>
    </div>
  );
}

// ── Shop ──────────────────────────────────────────────────
function ShopPage({ data, cu, showToast, save, onProductClick, cart, setCart, cartOpen, setCartOpen }) {
  const [placing, setPlacing] = useState(false);
  const [shopPaypalError, setShopPaypalError] = useState(null);

  const postageOptions = data.postageOptions || [];
  const [postageId, setPostageId] = useState(() => postageOptions[0]?.id || "");
  useEffect(() => {
    if (!postageId && postageOptions.length > 0) setPostageId(postageOptions[0].id);
  }, [postageOptions.length]);

  const postage = postageOptions.find(p => p.id === postageId) || postageOptions[0] || { name: "Collection", price: 0 };
  const hasNoPost = cart.some(i => i.noPost);

  const cartKey = (item, variant) => variant ? `${item.id}::${variant.id}` : item.id;

  const addToCart = (item, variant, qty = 1) => {
    const key = cartKey(item, variant);
    const price = variant ? Number(variant.price) : (item.onSale && item.salePrice ? item.salePrice : item.price);
    const label = variant ? `${item.name} — ${variant.name}` : item.name;
    const availStock = variant ? Number(variant.stock) : item.stock;
    setCart(c => {
      const ex = c.find(x => x.key === key);
      const currentQty = ex ? ex.qty : 0;
      if (currentQty + qty > availStock) { showToast("Not enough stock", "red"); return c; }
      if (ex) return c.map(x => x.key === key ? { ...x, qty: x.qty + qty } : x);
      return [...c, { key, id: item.id, variantId: variant?.id || null, name: label, price, qty, noPost: item.noPost, stock: availStock }];
    });
    showToast(`${label} × ${qty} added to cart`);
  };

  const removeFromCart = (key) => setCart(c => c.filter(x => x.key !== key));
  const updateCartQty = (key, qty) => {
    if (qty < 1) { removeFromCart(key); return; }
    setCart(c => c.map(x => x.key === key ? { ...x, qty: Math.min(qty, x.stock) } : x));
  };

  const subTotal = cart.reduce((s, i) => s + i.price * i.qty * (cu?.vipStatus === "active" ? 0.9 : 1), 0);
  const postageTotal = hasNoPost ? 0 : (postage?.price || 0);
  const grandTotal = subTotal + postageTotal;

  const placeOrderAfterPayment = async (paypalOrder) => {
    if (!cu || cart.length === 0) return;
    setPlacing(true); setShopPaypalError(null);
    const safety = setTimeout(() => setPlacing(false), 30000);
    try {
      await api.shopOrders.create({
        customerName: cu.name, customerEmail: cu.email || "",
        customerAddress: cu.address || "", userId: cu.id,
        items: cart.map(i => ({ id: i.id, variantId: i.variantId, name: i.name, price: i.price, qty: i.qty })),
        subtotal: subTotal, postage: postageTotal,
        postageName: hasNoPost ? "Collection Only" : (postage?.name || ""),
        total: grandTotal, paypalOrderId: paypalOrder.id,
      });

      // Success — clear cart immediately
      showToast("✅ Order confirmed! Thank you.");
      setCart([]); setCartOpen(false);

      // Background: deduct stock + refresh (non-blocking)
      const cartSnapshot = [...cart];
      Promise.all([
        ...cartSnapshot.map(ci => (
          ci.variantId
            ? supabase.rpc("deduct_variant_stock", { product_id: ci.id, variant_id: ci.variantId, qty: ci.qty }).catch(() => {})
            : supabase.rpc("deduct_stock", { product_id: ci.id, qty: ci.qty }).catch(() => {})
        )),
        api.shop.getAll().then(freshShop => save({ shop: freshShop })).catch(() => {}),
      ]);

    } catch (e) {
      setShopPaypalError("Order failed — please contact us. Error: " + (e.message || String(e)));
    } finally {
      clearTimeout(safety);
      setPlacing(false);
    }
  };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="page-content">
      <div className="page-header">
        <div><div className="page-title">Armoury</div><div className="page-sub">Gear up for battle</div></div>
        <button className="btn btn-ghost" onClick={() => setCartOpen(true)}>
          🛒 Cart {cartCount > 0 && <span style={{ background:"var(--accent)", color:"#fff", padding:"1px 7px", fontSize:11, marginLeft:6, fontWeight:700 }}>{cartCount}</span>}
        </button>
      </div>

      {cu?.vipStatus === "active" && <div className="alert alert-gold mb-2">⭐ VIP member — 10% discount applied</div>}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16 }}>
        {data.shop.map(item => {
          const hasV = item.variants?.length > 0;
          const displayPrice = hasV
            ? Math.min(...item.variants.map(v => Number(v.price)))
            : (item.onSale && item.salePrice ? item.salePrice : item.price);
          const inStock = item.stock > 0;
          return (
            <div key={item.id} className="shop-card" style={{ cursor:"pointer" }} onClick={() => onProductClick(item)}>
              <div className="shop-img">
                {item.image ? <img src={item.image} alt="" /> : <span style={{ fontSize:40 }}>🎯</span>}
                {!inStock && (
                  <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.65)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span className="tag tag-red" style={{ fontSize:11 }}>OUT OF STOCK</span>
                  </div>
                )}
              </div>
              <div className="shop-body">
                <div className="gap-2 mb-1">
                  {item.noPost && <span className="tag tag-gold">Collect Only</span>}
                  {hasV && <span className="tag tag-blue">{item.variants.length} variants</span>}
                  {item.onSale && !hasV && <span className="tag tag-red">SALE</span>}
                </div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, marginBottom:4, letterSpacing:".03em", color:"#fff" }}>{item.name}</div>
                <p style={{ fontSize:11, color:"var(--muted)", marginBottom:10, lineHeight:1.5, fontFamily:"'Share Tech Mono',monospace" }}>{item.description}</p>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    {hasV && <span style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>from </span>}
                    <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:20, color:"var(--accent)" }}>
                      £{cu?.vipStatus === "active" ? (displayPrice * 0.9).toFixed(2) : Number(displayPrice).toFixed(2)}
                    </span>
                    {cu?.vipStatus === "active" && <span className="text-gold" style={{ fontSize:10, marginLeft:4 }}>VIP</span>}
                  </div>
                  <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
                    {hasV ? `${item.variants.length} options` : `Stock: ${item.stock}`}
                  </span>
                </div>
                <button className="btn btn-primary" style={{ width:"100%", padding:"8px", fontSize:12 }} disabled={!inStock}>
                  {!inStock ? "OUT OF STOCK" : "VIEW PRODUCT →"}
                </button>
              </div>
            </div>
          );
        })}
        {data.shop.length === 0 && (
          <div style={{ gridColumn:"1/-1", textAlign:"center", padding:60, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
            No products in the armoury yet.
          </div>
        )}
      </div>

      {/* CART MODAL */}
      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🛒 Cart</div>
            {cart.length === 0
              ? <p className="text-muted" style={{ fontFamily:"'Share Tech Mono',monospace" }}>Your cart is empty.</p>
              : (
              <>
                {cart.map(item => (
                  <div key={item.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".05em", fontSize:14 }}>{item.name}</div>
                      <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>£{item.price.toFixed(2)} each</div>
                    </div>
                    <div className="gap-2" style={{ alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#111" }}>
                        <button onClick={() => updateCartQty(item.key, item.qty - 1)} style={{ background:"none", border:"none", color:"var(--text)", padding:"4px 10px", cursor:"pointer" }}>−</button>
                        <span style={{ padding:"0 8px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:14 }}>{item.qty}</span>
                        <button onClick={() => updateCartQty(item.key, item.qty + 1)} style={{ background:"none", border:"none", color:"var(--text)", padding:"4px 10px", cursor:"pointer" }}>+</button>
                      </div>
                      <span className="text-green" style={{ fontFamily:"'Barlow Condensed',sans-serif", minWidth:60, textAlign:"right" }}>£{(item.price * item.qty).toFixed(2)}</span>
                      <button style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:16 }} onClick={() => removeFromCart(item.key)}>✕</button>
                    </div>
                  </div>
                ))}

                {!hasNoPost && postageOptions.length > 0 && (
                  <div className="form-group mt-2">
                    <label>Postage</label>
                    <select value={postageId} onChange={e => setPostageId(e.target.value)}>
                      {postageOptions.map(p => <option key={p.id} value={p.id}>{p.name} — £{Number(p.price).toFixed(2)}</option>)}
                    </select>
                  </div>
                )}
                {hasNoPost && <div className="alert alert-gold mt-1">🔥 Collection-only items in cart — no posting</div>}
                {cu?.vipStatus === "active" && <div className="alert alert-gold mt-1">⭐ VIP 10% discount applied</div>}

                <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, marginTop:14, color:"#fff" }}>
                  <span>TOTAL</span>
                  <span style={{ color:"var(--accent)" }}>£{grandTotal.toFixed(2)}</span>
                </div>
                {!hasNoPost && postageTotal > 0 && (
                  <div style={{ fontSize:11, color:"var(--muted)", textAlign:"right", marginTop:2, fontFamily:"'Share Tech Mono',monospace" }}>
                    incl. {postage.name} £{postageTotal.toFixed(2)}
                  </div>
                )}

                {!cu && <div className="alert alert-red mt-2">Log in to checkout with PayPal</div>}
                {shopPaypalError && <div className="alert alert-red mt-1">⚠️ {shopPaypalError}</div>}
                {placing && <div className="alert alert-blue mt-1">⏳ Confirming your order…</div>}
                {cu && grandTotal > 0 && (
                  <PayPalCheckoutButton
                    amount={grandTotal}
                    description={`Zulu's Airsoft Shop — ${cart.length} item${cart.length > 1 ? "s" : ""}`}
                    onSuccess={placeOrderAfterPayment}
                    disabled={placing}
                  />
                )}
              </>
            )}
            <button className="btn btn-ghost mt-1" style={{ width:"100%" }} onClick={() => setCartOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Page ──────────────────────────────────────────
function ProductPage({ item, cu, onBack, onAddToCart, cartCount, onCartOpen }) {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);

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

  const handleAdd = () => {
    if (!canAdd) return;
    onAddToCart(item, hasVariants ? selectedVariant : null, qty);
    setQty(1);
  };

  // Related items — same category approximated by stock/naming, just show a few others
  return (
    <div className="page-content">
      {/* Breadcrumb */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".1em", fontSize:12 }}>
          ← ARMOURY
        </button>
        <span style={{ color:"#333" }}>/</span>
        <span style={{ color:"var(--text)", textTransform:"uppercase", letterSpacing:".1em" }}>{item.name}</span>
        <div style={{ marginLeft:"auto" }}>
          <button className="btn btn-ghost btn-sm" onClick={onCartOpen}>
            🛒 {cartCount > 0 && <span style={{ background:"var(--accent)", color:"#fff", padding:"1px 6px", fontSize:10, marginLeft:4, fontWeight:700 }}>{cartCount}</span>}
          </button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:32, marginBottom:40 }}>

        {/* LEFT — Image */}
        <div>
          <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", borderTop:"3px solid var(--accent)", position:"relative", overflow:"hidden" }}>
            {/* Corner brackets */}
            <div style={{ position:"absolute", top:10, left:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", top:10, right:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, left:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, right:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            {item.image
              ? <img src={item.image} alt={item.name} style={{ width:"100%", aspectRatio:"4/3", objectFit:"cover", display:"block", filter:"contrast(1.05)" }} />
              : <div style={{ aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:80, color:"#333" }}>🎯</div>
            }
            {!item.stock && (
              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, letterSpacing:".2em", color:"var(--red)", border:"3px solid var(--red)", padding:"8px 24px", transform:"rotate(-5deg)" }}>OUT OF STOCK</span>
              </div>
            )}
          </div>

          {/* Spec strip */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:1, marginTop:2 }}>
            {[
              { label:"STOCK", val: hasVariants ? `${item.stock} total` : `${item.stock} units` },
              { label:"POSTAGE", val: item.noPost ? "Collect Only" : "Standard" },
              { label:"STATUS", val: item.stock > 0 ? "IN STOCK" : "OUT OF STOCK" },
            ].map(s => (
              <div key={s.label} style={{ background:"#0d0d0d", border:"1px solid #1a1a1a", padding:"8px 12px" }}>
                <div style={{ fontSize:8, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, textTransform:"uppercase", marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:12, fontFamily:"'Share Tech Mono',monospace", color:s.label === "STATUS" ? (item.stock > 0 ? "#7dc840" : "var(--red)") : "var(--text)" }}>{s.val}</div>
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
            {item.stock > 0 ? <span className="tag tag-green">IN STOCK</span> : <span className="tag tag-red">OUT OF STOCK</span>}
          </div>

          {/* Name */}
          <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, color:"#fff", letterSpacing:".04em", textTransform:"uppercase", lineHeight:1, marginBottom:12 }}>{item.name}</h1>

          {/* Description */}
          <p style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, color:"var(--muted)", lineHeight:1.8, marginBottom:20, borderLeft:"3px solid var(--accent)", paddingLeft:12 }}>
            {item.description || "No description available."}
          </p>

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
                        {outV ? "Out of stock" : `£${Number(v.price).toFixed(2)}`}
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

          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", display:"flex", gap:16 }}>
            <span>{item.noPost ? "⚠️ Collection at game day only" : "✓ Standard postage available"}</span>
            {stockAvail > 0 && <span style={{ color:"#7dc840" }}>✓ {stockAvail} in stock</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────
function LeaderboardPage({ data, cu, updateUser, showToast }) {
  const board = data.users
    .filter(u => !u.leaderboardOptOut && u.role === "player")
    .sort((a, b) => b.gamesAttended - a.gamesAttended);

  return (
    <div className="page-content-sm">
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
  const [lightbox, setLightbox] = useState(null); // { url, album, index }
  const albums = active ? data.albums.filter(a => a.id === active) : data.albums;

  const openLightbox = (url, album, index) => setLightbox({ url, album, index });
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

  return (
    <div className="page-content">
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
            : <div className="photo-grid">
                {album.images.map((img, i) => (
                  <div key={i} className="photo-cell" onClick={() => openLightbox(img, album, i)}>
                    <img src={img} alt="" />
                    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "all .2s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,.4)"; e.currentTarget.style.opacity = 1; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0)"; e.currentTarget.style.opacity = 0; }}>
                      <span style={{ fontSize: 28, color: "#fff" }}>🔍</span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      ))}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={closeLightbox} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button onClick={e => { e.stopPropagation(); prevImg(); }}
            style={{ position: "absolute", left: 16, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 28, width: 52, height: 52, borderRadius: "50%", cursor: "pointer" }}>‹</button>
          <img src={lightbox.url} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 0 60px rgba(0,0,0,.8)" }} />
          <button onClick={e => { e.stopPropagation(); nextImg(); }}
            style={{ position: "absolute", right: 16, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 28, width: 52, height: 52, borderRadius: "50%", cursor: "pointer" }}>›</button>
          <button onClick={closeLightbox}
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", fontSize: 20, width: 40, height: 40, borderRadius: "50%", cursor: "pointer" }}>✕</button>
          <div style={{ position: "absolute", bottom: 16, color: "rgba(255,255,255,.5)", fontSize: 13 }}>
            {lightbox.index + 1} / {lightbox.album.images.length}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Q&A ───────────────────────────────────────────────────
// ── VIP Page ──────────────────────────────────────────────
function VipPage({ data, cu, updateUser, showToast, setAuthModal, setPage }) {
  const [applying, setApplying] = useState(false);

  const myBookings = cu ? data.events.flatMap(ev =>
    ev.bookings.filter(b => b.userId === cu.id && b.checkedIn).map(b => b)
  ) : [];
  const gamesAttended = cu ? Math.max(cu.gamesAttended || 0, myBookings.length) : 0;
  const gamesNeeded = Math.max(0, 3 - gamesAttended);
  const canApply = cu && gamesAttended >= 3 && cu.vipStatus !== "active" && !cu.vipApplied;
  const isVip = cu?.vipStatus === "active";
  const hasPending = cu?.vipApplied && !isVip;

  const applyForVip = async () => {
    if (!cu) { setAuthModal("login"); return; }
    setApplying(true);
    try {
      await updateUser(cu.id, { vipApplied: true });
      showToast("VIP application submitted! Admin will review shortly.");
    } catch(e) { showToast("Failed: " + e.message, "red"); }
    finally { setApplying(false); }
  };

  const benefits = [
    "10% discount on all game day bookings",
    "10% discount on all shop purchases",
    "Access to exclusive VIP-only events",
    "Private game day bookings",
    "UKARA registration support",
    "Priority booking for special events",
    "VIP badge on player profile",
    "Valid for calendar year",
  ];

  return (
    <div>
      {/* Hero */}
      <div style={{ background:"linear-gradient(135deg,#0d1300 0%,#0a0a0a 100%)", borderBottom:"1px solid #2a3a00", padding:"64px 24px", textAlign:"center" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.2)", padding:"6px 16px", borderRadius:20, marginBottom:20 }}>
          <span>👑</span>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:".2em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase" }}>ELITE MEMBERSHIP</span>
        </div>
        <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(44px,8vw,80px)", textTransform:"uppercase", letterSpacing:".04em", marginBottom:16 }}>
          BECOME A <span style={{ color:"var(--accent)" }}>VIP</span>
        </h1>
        <p style={{ fontSize:15, color:"#888", maxWidth:560, margin:"0 auto", lineHeight:1.7 }}>
          Unlock exclusive benefits, discounts, and VIP-only events. Join our elite squad of dedicated operators.
        </p>
      </div>

      <div className="page-content" style={{ maxWidth:960 }}>

        {/* Status banner for logged-in users */}
        {isVip && (
          <div className="alert alert-green mb-2" style={{ display:"flex", alignItems:"center", gap:10, fontSize:14 }}>
            ⭐ You are an active VIP member! Your membership is valid through December {new Date().getFullYear()}.
          </div>
        )}
        {hasPending && (
          <div className="alert alert-blue mb-2" style={{ fontSize:14 }}>
            ⏳ Your VIP application is pending admin review. We'll notify you once it's approved.
          </div>
        )}

        <div className="grid-2" style={{ gap:24, marginBottom:32 }}>

          {/* Benefits */}
          <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px", position:"relative" }}>
            <div style={{ position:"absolute", top:0, left:0, width:16, height:16, borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)" }} />
            <div style={{ position:"absolute", bottom:0, right:0, width:16, height:16, borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)" }} />
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:20, color:"var(--accent)", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>VIP BENEFITS</div>
            {benefits.map((b, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #1a1a1a" }}>
                <div style={{ width:20, height:20, background:"rgba(200,255,0,.15)", border:"1px solid var(--accent)", borderRadius:2, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ color:"var(--accent)", fontSize:11, fontWeight:900 }}>✓</span>
                </div>
                <span style={{ fontSize:13, color:"#ccc" }}>{b}</span>
              </div>
            ))}
          </div>

          {/* Apply box */}
          <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px" }}>
            {/* Price */}
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:64, color:"var(--accent)", lineHeight:1 }}>£30</div>
              <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>per year</div>
            </div>

            {/* Requirements */}
            <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", padding:"16px", marginBottom:20 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".15em", textTransform:"uppercase", color:"var(--muted)", marginBottom:12 }}>REQUIREMENTS</div>
              {[
                { label:"Registered account", met: !!cu },
                { label:`3 game days completed (${gamesAttended}/3)`, met: gamesAttended >= 3 },
              ].map(({ label, met }) => (
                <div key={label} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0" }}>
                  <span style={{ color: met ? "var(--accent)" : "var(--red)", fontSize:16, lineHeight:1 }}>{met ? "✓" : "✗"}</span>
                  <span style={{ fontSize:13, color: met ? "#ccc" : "var(--muted)" }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Progress bar if not yet eligible */}
            {cu && !isVip && gamesNeeded > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--muted)", marginBottom:6 }}>
                  <span>GAME DAY PROGRESS</span>
                  <span>{gamesAttended} / 3</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: Math.min(100, gamesAttended / 3 * 100) + "%" }} />
                </div>
                <div style={{ fontSize:12, color:"var(--muted)", marginTop:6 }}>{gamesNeeded} more game day{gamesNeeded !== 1 ? "s" : ""} needed to apply</div>
              </div>
            )}

            {/* CTA */}
            {!cu && (
              <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14 }}
                onClick={() => setAuthModal("login")}>LOGIN TO CONTINUE</button>
            )}
            {cu && isVip && (
              <div className="alert alert-green" style={{ textAlign:"center" }}>⭐ You are already a VIP member!</div>
            )}
            {cu && hasPending && (
              <div className="alert alert-blue" style={{ textAlign:"center" }}>⏳ Application under review</div>
            )}
            {cu && canApply && (
              <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14 }} onClick={applyForVip} disabled={applying}>
                {applying ? "Submitting…" : "APPLY FOR VIP — £30/YEAR"}
              </button>
            )}
            {cu && !isVip && !hasPending && !canApply && (
              <div>
                <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14, opacity:.5, cursor:"not-allowed" }} disabled>
                  APPLY FOR VIP — £30/YEAR
                </button>
                <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", marginTop:8 }}>
                  Complete {gamesNeeded} more game day{gamesNeeded !== 1 ? "s" : ""} to unlock
                </div>
              </div>
            )}

            <div style={{ marginTop:16, fontSize:11, color:"var(--muted)", lineHeight:1.6, textAlign:"center" }}>
              Payment will be collected by the admin upon approval. VIP status is activated manually after review.
            </div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px", marginBottom:32 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"#fff", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>HOW IT WORKS</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {[
              { num:"01", title:"PLAY 3 GAMES", desc:"Attend 3 game days to meet the eligibility requirement. Check-ins are tracked automatically." },
              { num:"02", title:"SUBMIT APPLICATION", desc:"Once eligible, apply for VIP membership through this page. Admin will review your application." },
              { num:"03", title:"PAY & ACTIVATE", desc:"After approval, pay the £30 annual fee and your VIP status is activated immediately." },
            ].map(step => (
              <div key={step.num} style={{ padding:16, background:"#0d0d0d", border:"1px solid #1a1a1a" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:36, color:"var(--accent)", opacity:.4, lineHeight:1, marginBottom:8 }}>{step.num}</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"#fff", letterSpacing:".06em", textTransform:"uppercase", marginBottom:6 }}>{step.title}</div>
                <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign:"center" }}>
          <button className="btn btn-ghost" onClick={() => setPage("events")}>← Browse Events</button>
        </div>
      </div>
    </div>
  );
}

function QAPage({ data }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="page-content-sm">
      <div className="page-header"><div><div className="page-title">Q&amp;A</div><div className="page-sub">Got questions? We've got answers.</div></div></div>
      {data.qa.length === 0 && <div style={{ textAlign:"center", color:"var(--muted)", padding:40 }}>No questions yet — check back soon.</div>}
      {data.qa.map(item => (
        <div key={item.id} className="accordion-item">
          <div className="accordion-q" onClick={() => setOpen(open === item.id ? null : item.id)}>
            <span>{item.q}</span>
            <span style={{ color:"var(--accent)", fontSize:20, lineHeight:1 }}>{open === item.id ? "−" : "+"}</span>
          </div>
          {open === item.id && (
            <div className="accordion-a">
              {renderQAAnswer(item.a)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────
function ProfilePage({ data, cu, updateUser, showToast, save }) {
  const [tab, setTab] = useState("profile");

  // Parse stored address string back into structured fields
  const parseAddress = (addr) => {
    const parts = (addr || "").split("\n");
    return {
      line1:    parts[0] || "",
      line2:    parts[1] || "",
      city:     parts[2] || "",
      county:   parts[3] || "",
      postcode: parts[4] || "",
    };
  };
  const composeAddress = (a) =>
    [a.line1, a.line2, a.city, a.county, a.postcode].map(s => s.trim()).filter(Boolean).join("\n");

  const [edit, setEdit] = useState({
    name: cu.name,
    phone: cu.phone || "",
    ...parseAddress(cu.address),
  });
  const setAddr = (field, val) => setEdit(p => ({ ...p, [field]: val }));

  const [waiverModal, setWaiverModal] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const waiverValid = (cu.waiverSigned && cu.waiverYear === new Date().getFullYear()) || cu.role === "admin";
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

  const saveProfile = () => {
    updateUser(cu.id, {
      name:    edit.name,
      phone:   edit.phone,
      address: composeAddress(edit),
    });
    showToast("Profile updated!");
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px solid var(--accent)", overflow: "hidden", background: "var(--bg4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>
              {cu.profilePic ? <img src={cu.profilePic} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : cu.name[0]}
            </div>
            <label style={{ position: "absolute", bottom: 0, right: 0, background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}>
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
            <div className="form-group"><label>Phone</label><input value={edit.phone} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} placeholder="07700 000000" /></div>
          </div>

          <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "var(--muted)", textTransform: "uppercase", fontFamily: "'Barlow Condensed', sans-serif" }}>Delivery Address</div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 2, padding: "14px 16px", marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Address Line 1</label>
              <input value={edit.line1} onChange={e => setAddr("line1", e.target.value)} placeholder="House number and street name" />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Address Line 2 <span style={{ color: "var(--subtle)", fontWeight: 400, letterSpacing: 0 }}>(optional)</span></label>
              <input value={edit.line2} onChange={e => setAddr("line2", e.target.value)} placeholder="Flat, apartment, unit, etc." />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Town / City</label>
                <input value={edit.city} onChange={e => setAddr("city", e.target.value)} placeholder="Swindon" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>County <span style={{ color: "var(--subtle)", fontWeight: 400, letterSpacing: 0 }}>(optional)</span></label>
                <input value={edit.county} onChange={e => setAddr("county", e.target.value)} placeholder="Wiltshire" />
              </div>
            </div>
            <div className="form-group mt-1" style={{ marginBottom: 0 }}>
              <label>Postcode</label>
              <input value={edit.postcode} onChange={e => setAddr("postcode", e.target.value.toUpperCase())} placeholder="SN1 1AA" style={{ maxWidth: 160 }} />
            </div>
          </div>

          <div className="gap-2">
            <button className="btn btn-primary" onClick={saveProfile}>Save</button>
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
                    <div style={{ fontWeight: 900, fontSize: 20, color: "var(--accent)" }}>£{b.total.toFixed(2)}</div>
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
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: ".05em" }}>VIP Membership</div>
          <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>VIP members receive 10% off all game days and shop purchases, plus UKARA ID registration. Annual membership costs <strong style={{ color: "var(--gold)" }}>£30/year</strong>.</p>
          {[
            { label: "Games Attended", value: `${gamesAttended} / 3 required`, ok: gamesAttended >= 3 },
            { label: "VIP Status", value: cu.vipStatus === "active" ? "Active" : cu.vipApplied ? "Application Pending" : "Not Applied", ok: cu.vipStatus === "active" },
            { label: "UKARA ID", value: cu.ukara || "Not assigned", ok: !!cu.ukara },
            { label: "VIP Discount", value: "10% off game days & shop", ok: cu.vipStatus === "active" },
          ].map(({ label, value, ok }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "var(--bg4)", borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
              <span className="text-muted">{label}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{value} <span style={{ color: ok ? "var(--accent)" : "var(--subtle)" }}>{ok ? "✓" : "○"}</span></span>
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

function AdminPanel({ data, cu, save, updateUser, updateEvent, showToast, setPage, refresh }) {
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
    { id: "events", label: "Events & Bookings", icon: "📅", badge: totalBookings, badgeColor: "blue", group: "OPERATIONS" },
    { id: "players", label: "Players", icon: "👥", badge: pendingVip > 0 ? pendingVip : (deleteReqs > 0 ? deleteReqs : null), badgeColor: pendingVip > 0 ? "gold" : "", group: null },
    { id: "waivers", label: "Waivers", icon: "📋", badge: pendingWaivers || unsigned || null, group: null },
    { id: "shop", label: "Shop", icon: "🛒", group: null },
    { id: "orders", label: "Shop Orders", icon: "📦", group: null },
    { id: "leaderboard-admin", label: "Leaderboard", icon: "🏆", group: null },
    { id: "revenue", label: "Revenue", icon: "💰", group: "ANALYTICS" },
    { id: "gallery-admin", label: "Gallery", icon: "🖼", group: null },
    { id: "qa-admin", label: "Q&A", icon: "❓", group: null },
    { id: "messages", label: "Site Messages", icon: "📢", group: null },
    { id: "cash", label: "Cash Sales", icon: "💵", group: "TOOLS" },
  ];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-shell">
      {/* Mobile overlay */}
      <div className={`admin-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sb-logo">
          <div className="sb-logo-text">ZULU'S <span>AIRSOFT</span></div>
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
          {section === "events" && <AdminEventsBookings data={data} save={save} updateEvent={updateEvent} updateUser={updateUser} showToast={showToast} />}
          {section === "players" && <AdminPlayers data={data} save={save} updateUser={updateUser} showToast={showToast} />}
          {section === "waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "shop" && <AdminShop data={data} save={save} showToast={showToast} />}
          {section === "orders" && <AdminOrders showToast={showToast} />}
          {section === "leaderboard-admin" && <AdminLeaderboard data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "revenue" && <AdminRevenue data={data} />}
          {section === "gallery-admin" && <AdminGallery data={data} save={save} showToast={showToast} />}
          {section === "qa-admin" && <AdminQA data={data} save={save} showToast={showToast} />}
          {section === "messages" && <AdminMessages data={data} save={save} showToast={showToast} />}
          {section === "cash" && <AdminCash data={data} cu={cu} showToast={showToast} />}
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
function BookingsTab({ allBookings, data, doCheckin, save, showToast }) {
  const [editBooking, setEditBooking] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [viewBooking, setViewBooking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = allBookings.filter(b =>
    !search || b.userName.toLowerCase().includes(search.toLowerCase()) ||
    b.eventTitle.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (b) => setEditBooking({
    id: b.id, userId: b.userId, userName: b.userName,
    eventTitle: b.eventTitle, eventObj: b.eventObj,
    type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn,
  });

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.bookings.update(editBooking.id, editBooking);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Booking updated!");
      setEditBooking(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.bookings.delete(delConfirm.id);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Booking deleted!");
      setDelConfirm(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player or event…"
          style={{ maxWidth: 280 }} />
      </div>
      <div className="table-wrap"><table className="data-table">
        <thead>
          <tr><th>Player</th><th>Event</th><th>Date</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No bookings found</td></tr>
          )}
          {filtered.map(b => (
            <tr key={b.id}>
              <td style={{ fontWeight: 600 }}>{b.userName}</td>
              <td>{b.eventTitle}</td>
              <td className="mono" style={{ fontSize: 11 }}>{gmtShort(b.date)}</td>
              <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
              <td>{b.qty}</td>
              <td style={{ fontSize: 11 }}>
                {(() => {
                  const entries = Object.entries(b.extras || {}).filter(([,v]) => v > 0);
                  if (!entries.length) return <span style={{ color: "var(--muted)" }}>—</span>;
                  return entries.map(([key, qty]) => {
                    const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
                    const ex = b.eventObj?.extras?.find(e => e.id === extraId);
                    const lp = (data?.shop || []).find(p => p.id === ex?.productId);
                    const v = variantId ? lp?.variants?.find(v => v.id === variantId) : null;
                    const label = ex ? (v ? `${ex.name} — ${v.name}` : ex.name) : key;
                    return (
                      <div key={key} style={{ fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap", color: "var(--accent)" }}>
                        {label} ×{qty}
                      </div>
                    );
                  });
                })()}
              </td>
              <td className="text-green">£{b.total.toFixed(2)}</td>
              <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
              <td>
                <div className="gap-2">
                  {!b.checkedIn && (
                    <button className="btn btn-sm btn-primary" onClick={() => doCheckin(b, b.eventObj)}>✓ In</button>
                  )}
                  <button className="btn btn-sm btn-ghost" onClick={() => setViewBooking(b)}>View</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => openEdit(b)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDelConfirm(b)}>Del</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {/* Edit modal */}
      {editBooking && (
        <div className="overlay" onClick={() => setEditBooking(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">✏️ Edit Booking</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              {editBooking.userName} — {editBooking.eventTitle}
            </div>
            <div className="form-group">
              <label>Ticket Type</label>
              <select value={editBooking.type} onChange={e => setEditBooking(p => ({ ...p, type: e.target.value }))}>
                <option value="walkOn">Walk-On</option>
                <option value="rental">Rental</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" min={1} value={editBooking.qty}
                  onChange={e => setEditBooking(p => ({ ...p, qty: +e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Total (£)</label>
                <input type="number" step="0.01" min={0} value={editBooking.total}
                  onChange={e => setEditBooking(p => ({ ...p, total: +e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="ci-edit" checked={editBooking.checkedIn}
                onChange={e => setEditBooking(p => ({ ...p, checkedIn: e.target.checked }))} />
              <label htmlFor="ci-edit" style={{ cursor: "pointer", fontSize: 13 }}>Checked In</label>
            </div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" disabled={busy} onClick={saveEdit}>
                {busy ? "Saving…" : "Save Changes"}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditBooking(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {viewBooking && (() => {
        const b = viewBooking;
        const extras = Object.entries(b.extras || {}).filter(([,v]) => v > 0);
        const ticketLabel = b.type === "walkOn" ? "Walk-On" : "Rental Package";
        const ticketPrice = b.type === "walkOn" ? b.eventObj?.walkOnPrice : b.eventObj?.rentalPrice;
        return (
          <div className="overlay" onClick={() => setViewBooking(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()}>
              <div className="modal-title">🎟 Booking Details</div>

              {/* Header info */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px 24px", background:"#0d0d0d", border:"1px solid #2a2a2a", padding:16, marginBottom:16, fontSize:13 }}>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>PLAYER</span><div style={{ fontWeight:700, marginTop:3 }}>{b.userName}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>EVENT</span><div style={{ fontWeight:700, marginTop:3 }}>{b.eventTitle}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>DATE</span><div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, marginTop:3 }}>{gmtShort(b.date)}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>STATUS</span><div style={{ marginTop:3 }}>{b.checkedIn ? <span className="tag tag-green">✓ Checked In</span> : <span className="tag tag-blue">Booked</span>}</div></div>
              </div>

              {/* Order breakdown */}
              <div style={{ border:"1px solid #2a2a2a", marginBottom:16 }}>
                <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #2a2a2a" }}>ORDER</div>
                <div style={{ padding:"0 14px" }}>
                  {/* Ticket */}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 }}>
                    <span>{b.type === "walkOn" ? "🎯" : "🪖"} {ticketLabel} ×{b.qty}</span>
                    <span style={{ color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>£{(Number(ticketPrice) * b.qty).toFixed(2)}</span>
                  </div>
                  {/* Extras */}
                  {extras.length > 0 && extras.map(([key, qty]) => {
                    const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
                    const ex = b.eventObj?.extras?.find(e => e.id === extraId);
                    const lp = (data?.shop || []).find(p => p.id === ex?.productId);
                    const v = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
                    const label = ex ? (v ? `${ex.name} — ${v.name}` : ex.name) : key;
                    const unitPrice = v ? Number(v.price) : (lp ? Number(lp.price) : 0);
                    return (
                      <div key={key} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 }}>
                        <span style={{ color:"var(--muted)" }}>+ {label} ×{qty}</span>
                        <span style={{ color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>£{(unitPrice * qty).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  {/* Total */}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", fontSize:16, fontFamily:"'Barlow Condensed',sans-serif" }}>
                    <span>TOTAL</span>
                    <span style={{ color:"var(--accent)" }}>£{b.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="gap-2">
                <button className="btn btn-ghost" onClick={() => setViewBooking(null)}>Close</button>
                <button className="btn btn-ghost" onClick={() => { setViewBooking(null); openEdit(b); }}>Edit Booking</button>
              </div>
            </div>
          </div>
        );
      })()}

      {delConfirm && (
        <div className="overlay" onClick={() => setDelConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Booking?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 20px" }}>
              Delete <strong style={{ color: "var(--text)" }}>{delConfirm.userName}</strong>'s booking for <strong style={{ color: "var(--text)" }}>{delConfirm.eventTitle}</strong>?
              This cannot be undone.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={busy} onClick={confirmDelete}>
                {busy ? "Deleting…" : "Yes, Delete"}
              </button>
              <button className="btn btn-ghost" onClick={() => setDelConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminEventsBookings({ data, save, updateEvent, updateUser, showToast }) {
  const [tab, setTab] = useState("events");

  // ── Events state ──
  const [modal, setModal] = useState(null);
  const [viewId, setViewId] = useState(null);
  const blank = { title: "", date: "", time: "09:00", location: "", description: "", walkOnSlots: 40, rentalSlots: 20, walkOnPrice: 25, rentalPrice: 35, banner: "", mapEmbed: "", extras: [], published: true };
  const [form, setForm] = useState(blank);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Check-in state ──
  const [evId, setEvId] = useState(data.events[0]?.id || "");
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);

  const ev = data.events.find(e => e.id === evId);
  const checkedInCount = ev ? ev.bookings.filter(b => b.checkedIn).length : 0;

  const allBookings = data.events.flatMap(ev =>
    ev.bookings.map(b => ({ ...b, eventTitle: ev.title, eventDate: ev.date, eventObj: ev }))
  );

  // ── Check-in logic ──
  const doCheckin = async (booking, evObj) => {
    if (!booking?.id || !booking?.userId) {
      showToast("Invalid booking data", "red"); return;
    }
    try {
      const actualCount = await api.bookings.checkIn(booking.id, booking.userId);
      const evList = await api.events.getAll();
      save({ events: evList });
      const u = data.users.find(x => x.id === booking.userId);
      if (u) updateUser(u.id, { gamesAttended: actualCount });
      showToast(`✅ ${booking.userName} checked in! Games: ${actualCount}`);
    } catch (e) {
      showToast("Check-in failed: " + e.message, "red");
    }
  };

  const manualCheckin = () => {
    if (!ev || !manual.trim()) return;
    const b = ev.bookings.find(x =>
      x.userName.toLowerCase().includes(manual.toLowerCase()) || x.id === manual.trim()
    );
    if (!b) { showToast("Booking not found", "red"); return; }
    if (b.checkedIn) { showToast("Already checked in", "gold"); return; }
    doCheckin(b, ev); setManual("");
  };

  const onQRScan = (code) => {
    setScanning(false);
    for (const evObj of data.events) {
      const b = evObj.bookings.find(x => x.id === code);
      if (b) {
        if (b.checkedIn) { showToast(`${b.userName} already checked in`, "gold"); return; }
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

  // ── Events logic ──
  const [savingEvent, setSavingEvent] = useState(false);
  const saveEvent = async () => {
    if (!form.title || !form.date) { showToast("Title and date required", "red"); return; }
    setSavingEvent(true);
    // Safety: always reset button after 30s even if something hangs
    const safetyTimer = setTimeout(() => setSavingEvent(false), 30000);
    try {
      if (modal === "new") {
        await api.events.create(form);
      } else {
        await api.events.update(form.id, form);
      }
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Event saved!");
      setModal(null);
    } catch (e) {
      console.error("saveEvent failed:", e);
      showToast("Save failed: " + (e.message || String(e)), "red");
    } finally {
      clearTimeout(safetyTimer);
      setSavingEvent(false);
    }
  };

  // ── Add Booking (admin) ──
  const [addBookingModal, setAddBookingModal] = useState(false);
  const [addBookingForm, setAddBookingForm] = useState({ userId: "", type: "walkOn", qty: 1, extras: {} });
  const [addBookingBusy, setAddBookingBusy] = useState(false);
  const abf = (k, v) => setAddBookingForm(p => ({ ...p, [k]: v }));

  const submitAddBooking = async () => {
    const targetEv = data.events.find(e => e.id === evId);
    const player = data.users.find(u => u.id === addBookingForm.userId);
    if (!player) { showToast("Select a player", "red"); return; }
    if (!targetEv) { showToast("Select an event", "red"); return; }
    setAddBookingBusy(true);
    try {
      const ticketPrice = addBookingForm.type === "walkOn" ? targetEv.walkOnPrice : targetEv.rentalPrice;
      const extrasTotal = Object.entries(addBookingForm.extras).filter(([,v]) => v > 0).reduce((s, [key, qty]) => {
        const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
        const ex = targetEv.extras.find(e => e.id === extraId);
        const lp = (data.shop || []).find(p => p.id === ex?.productId);
        const v = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        const price = v ? Number(v.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
        return s + price * qty;
      }, 0);
      const total = ticketPrice * addBookingForm.qty + extrasTotal;
      await api.bookings.create({
        eventId: targetEv.id,
        userId: player.id,
        userName: player.name,
        type: addBookingForm.type,
        qty: addBookingForm.qty,
        extras: Object.fromEntries(Object.entries(addBookingForm.extras).filter(([,v]) => v > 0)),
        total,
        paypalOrderId: "ADMIN-" + Date.now(),
      });
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast(`Booking added for ${player.name}!`);
      setAddBookingModal(false);
      setAddBookingForm({ userId: "", type: "walkOn", qty: 1, extras: {} });
    } catch (e) {
      showToast("Failed: " + (e.message || String(e)), "red");
    } finally {
      setAddBookingBusy(false);
    }
  };

  const clone = async (ev) => {
    try {
      const { id: _id, bookings: _b, ...evData } = ev;
      await api.events.create({ ...evData, title: ev.title + " (Copy)", published: false });
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Event cloned! (saved as draft)");
    } catch (e) {
      showToast("Clone failed: " + e.message, "red");
    }
  };

  const [delEventConfirm, setDelEventConfirm] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const deleteEvent = async () => {
    if (!delEventConfirm) return;
    setDeletingEvent(true);
    try {
      await api.events.delete(delEventConfirm.id);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Event deleted!");
      setDelEventConfirm(null);
    } catch (e) {
      showToast("Delete failed: " + e.message, "red");
    } finally {
      setDeletingEvent(false);
    }
  };

  const viewEv = viewId ? data.events.find(e => e.id === viewId) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Events &amp; Bookings</div>
          <div className="page-sub">{data.events.length} events · {allBookings.length} bookings · {allBookings.filter(b => b.checkedIn).length} checked in</div>
        </div>
        <div className="gap-2">
          {tab === "events" && <button className="btn btn-primary" onClick={() => { setForm(blank); setModal("new"); }}>+ New Event</button>}
          {tab === "checkin" && <>
            <button className="btn btn-primary" onClick={() => setScanning(true)}>📷 Scan QR</button>
            <button className="btn btn-ghost" onClick={downloadList}>⬇ Export</button>
          </>}
        </div>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "events" ? "active" : ""}`} onClick={() => setTab("events")}>📅 Events</button>
        <button className={`nav-tab ${tab === "bookings" ? "active" : ""}`} onClick={() => setTab("bookings")}>🎟 All Bookings</button>
        <button className={`nav-tab ${tab === "checkin" ? "active" : ""}`} onClick={() => setTab("checkin")}>✅ Check-In</button>
      </div>

      {/* ── EVENTS TAB ── */}
      {tab === "events" && (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Event</th><th>Date / Time</th><th>Slots</th><th>Booked</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.events.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No events yet</td></tr>}
            {data.events.map(ev => {
              const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
              return (
                <tr key={ev.id}>
                  <td>
                    <button style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 13 }}
                      onClick={() => setViewId(ev.id)}>{ev.title}</button>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{ev.date} {ev.time}</td>
                  <td>{ev.walkOnSlots + ev.rentalSlots}</td>
                  <td>{booked}</td>
                  <td>{ev.published ? <span className="tag tag-green">Live</span> : <span className="tag tag-red">Draft</span>}</td>
                  <td>
                    <div className="gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...ev }); setModal(ev.id); }}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => clone(ev)}>Clone</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDelEventConfirm(ev)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}

      {/* ── ALL BOOKINGS TAB ── */}
      {tab === "bookings" && (
        <BookingsTab
          allBookings={allBookings}
          data={data}
          doCheckin={doCheckin}
          save={save}
          showToast={showToast}
        />
      )}

      {/* ── CHECK-IN TAB ── */}
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
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5, letterSpacing: ".06em", textTransform: "uppercase" }}>Name / Booking ID</div>
                <input value={manual} onChange={e => setManual(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && manualCheckin()}
                  placeholder="Search player name or paste booking ID" />
              </div>
              <button className="btn btn-primary" onClick={manualCheckin}>Check In</button>
            </div>
          </div>

          {ev && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{ev.title} — {ev.date}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="text-green" style={{ fontSize: 13, fontWeight: 700 }}>
                    {checkedInCount} / {ev.bookings.length} checked in
                  </span>
                  <div className="progress-bar" style={{ width: 100 }}>
                    <div className="progress-fill" style={{ width: ev.bookings.length ? (checkedInCount / ev.bookings.length * 100) + "%" : "0%" }} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => { setAddBookingForm({ userId: "", type: "walkOn", qty: 1, extras: {} }); setAddBookingModal(true); }}>+ Add Booking</button>
                </div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead>
                  <tr><th>Player</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Booked</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {ev.bookings.length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>No bookings for this event</td></tr>
                  )}
                  {ev.bookings.map(b => {
                    const bookedExtras = b.extras && typeof b.extras === "object"
                      ? ev.extras.filter(ex => (b.extras[ex.id] || 0) > 0)
                      : [];
                    return (
                      <tr key={b.id} style={{ background: b.checkedIn ? "#1a0e08" : "transparent" }}>
                        <td style={{ fontWeight: 600 }}>{b.userName}</td>
                        <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                        <td>{b.qty}</td>
                        <td style={{ fontSize: 11 }}>
                          {bookedExtras.length === 0
                            ? <span style={{ color: "var(--muted)" }}>—</span>
                            : bookedExtras.map(ex => (
                                <div key={ex.id} style={{ fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap", color: "var(--accent)" }}>
                                  {ex.name} ×{b.extras[ex.id]}
                                </div>
                              ))
                          }
                        </td>
                        <td className="text-green">£{b.total.toFixed(2)}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{gmtShort(b.date)}</td>
                        <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                        <td>
                          {!b.checkedIn
                            ? <button className="btn btn-sm btn-primary" onClick={() => doCheckin(b, ev)}>✓ Check In</button>
                            : <span className="text-muted" style={{ fontSize: 11 }}>✓ Done</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      )}

      {/* Event view modal */}
      {viewEv && (
        <div className="overlay" onClick={() => setViewId(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📅 {viewEv.title}</div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>{viewEv.date} @ {viewEv.time} GMT | {viewEv.location}</p>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Type</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {viewEv.bookings.map(b => (
                  <tr key={b.id}><td>{b.userName}</td><td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td><td>{b.qty}</td>
                    <td className="text-green">£{b.total.toFixed(2)}</td>
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

      {/* Event edit/new modal */}
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
                    <div className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📁 Upload Image</div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files[0]; if (!file) return;
                      const img = new Image();
                      const reader = new FileReader();
                      reader.onload = ev => {
                        img.onload = () => {
                          const MAX = 1200;
                          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                          const canvas = document.createElement("canvas");
                          canvas.width  = Math.round(img.width  * scale);
                          canvas.height = Math.round(img.height * scale);
                          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                          f("banner", canvas.toDataURL("image/jpeg", 0.75));
                        };
                        img.src = ev.target.result;
                      };
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Or paste a URL:</div>
                  <input value={form.banner && form.banner.startsWith("data:") ? "" : (form.banner || "")}
                    onChange={e => f("banner", e.target.value)} placeholder="https://..." />
                </div>
                {form.banner && (
                  <div style={{ position: "relative" }}>
                    <img src={form.banner} style={{ width: 100, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} alt="" />
                    <button onClick={() => f("banner", "")} style={{ position: "absolute", top: -6, right: -6, background: "var(--red)", border: "none", color: "#fff", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                )}
              </div>
            </div>
            <div className="form-group"><label>Map Embed HTML (optional)</label><textarea rows={2} value={form.mapEmbed} onChange={e => f("mapEmbed", e.target.value)} placeholder='<iframe src="..." ...></iframe>' /></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
              <input type="checkbox" id="epub" checked={form.published} onChange={e => f("published", e.target.checked)} />
              <label htmlFor="epub" style={{ cursor: "pointer", fontSize: 13 }}>Published (visible to players)</label>
            </div>

            {/* ── Game Day Extras ── */}
            <div style={{ border:"1px solid #2a2a2a", borderLeft:"3px solid var(--accent)", marginBottom:16 }}>
              <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #2a2a2a" }}>
                GAME DAY EXTRAS — tick shop products to offer on this event
              </div>
              <div style={{ padding:14 }}>
                {data.shop.filter(p => p.gameExtra).length === 0 && (
                  <div style={{ fontSize:12, color:"var(--muted)" }}>No products marked as Game Day Extra yet. Tick "Available as Game Day Extra" on a product in the Shop section.</div>
                )}
                {data.shop.filter(p => p.gameExtra).map(p => {
                  const alreadyAdded = (form.extras || []).some(ex => ex.productId === p.id);
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #1a1a1a" }}>
                      <input type="checkbox" checked={alreadyAdded} onChange={e => {
                        const extras = form.extras || [];
                        if (e.target.checked) {
                          f("extras", [...extras, { id: uid(), name: p.name, price: p.price, noPost: p.noPost, productId: p.id, variantId: null }]);
                        } else {
                          f("extras", extras.filter(ex => ex.productId !== p.id));
                        }
                      }} />
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{p.name}</span>
                        {p.noPost && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:6 }}>Collect Only</span>}
                        <span style={{ fontSize:11, color:"var(--muted)", marginLeft:8 }}>£{p.price} · stock: {p.stock}</span>
                        {p.variants?.length > 0 && <span style={{ fontSize:11, color:"var(--accent)", marginLeft:8 }}>{p.variants.length} variants</span>}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>

            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEvent} disabled={savingEvent}>{savingEvent ? "Saving…" : "Save Event"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scanning && <QRScanner onScan={onQRScan} onClose={() => setScanning(false)} />}

      {/* ── Add Booking Modal ── */}
      {addBookingModal && (() => {
        const targetEv = data.events.find(e => e.id === evId);
        const players = [...(data.users || [])].filter(u => u.role !== "admin").sort((a,b) => a.name.localeCompare(b.name));
        const selectedPlayer = players.find(p => p.id === addBookingForm.userId);
        const ticketPrice = addBookingForm.type === "walkOn" ? (targetEv?.walkOnPrice || 0) : (targetEv?.rentalPrice || 0);
        // Calculate extras total for price preview
        const extrasPreviewTotal = Object.entries(addBookingForm.extras).filter(([,v]) => v > 0).reduce((s, [key, qty]) => {
          const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
          const ex = targetEv?.extras?.find(e => e.id === extraId);
          const lp = (data.shop || []).find(p => p.id === ex?.productId);
          const v = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
          const price = v ? Number(v.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
          return s + price * qty;
        }, 0);
        const previewTotal = ticketPrice * addBookingForm.qty + extrasPreviewTotal;

        return (
          <div className="overlay" onClick={() => !addBookingBusy && setAddBookingModal(false)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()}>
              <div className="modal-title">➕ Add Booking — {targetEv?.title}</div>

              {/* Player picker */}
              <div className="form-group">
                <label>Player</label>
                <select value={addBookingForm.userId} onChange={e => abf("userId", e.target.value)}
                  style={{ fontSize: 13 }}>
                  <option value="">— Select a registered player —</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.vipStatus === "active" ? " ⭐ VIP" : ""} — {p.email || "no email"}
                    </option>
                  ))}
                </select>
                {selectedPlayer && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace" }}>
                    Waiver: {selectedPlayer.waiverSigned && selectedPlayer.waiverYear === new Date().getFullYear()
                      ? <span style={{ color: "var(--accent)" }}>✓ Signed {selectedPlayer.waiverYear}</span>
                      : <span style={{ color: "var(--red)" }}>✗ Not signed</span>}
                    {" · "} UKARA: {selectedPlayer.ukara || "—"}
                  </div>
                )}
              </div>

              {/* Ticket type + qty */}
              <div className="form-row">
                <div className="form-group">
                  <label>Ticket Type</label>
                  <select value={addBookingForm.type} onChange={e => abf("type", e.target.value)}>
                    <option value="walkOn">🎯 Walk-On — £{targetEv?.walkOnPrice}</option>
                    <option value="rental">🪖 Rental Package — £{targetEv?.rentalPrice}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" min={1} max={10} value={addBookingForm.qty}
                    onChange={e => abf("qty", Math.max(1, +e.target.value))} />
                </div>
              </div>

              {/* Game day extras */}
              {targetEv?.extras?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".1em" }}>GAME DAY EXTRAS</label>
                  <div style={{ border: "1px solid #2a2a2a", marginTop: 6 }}>
                    {targetEv.extras.map(ex => {
                      const lp = (data.shop || []).find(p => p.id === ex.productId);
                      const hasVariants = lp?.variants?.length > 0;
                      return (
                        <div key={ex.id} style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a1a" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: hasVariants ? 8 : 0 }}>
                            {ex.name}
                            {lp && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>£{lp.price}</span>}
                          </div>
                          {hasVariants ? lp.variants.map(v => {
                            const key = ex.id + ":" + v.id;
                            const qty = addBookingForm.extras[key] || 0;
                            return (
                              <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>{v.name} — £{Number(v.price).toFixed(2)}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [key]: Math.max(0, qty - 1) })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>−</button>
                                  <span style={{ minWidth: 20, textAlign: "center", fontFamily: "'Barlow Condensed',sans-serif" }}>{qty}</span>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [key]: qty + 1 })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>+</button>
                                </div>
                              </div>
                            );
                          }) : (() => {
                            const qty = addBookingForm.extras[ex.id] || 0;
                            return (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "var(--accent)" }}>£{lp ? lp.price : ex.price}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [ex.id]: Math.max(0, qty - 1) })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>−</button>
                                  <span style={{ minWidth: 20, textAlign: "center", fontFamily: "'Barlow Condensed',sans-serif" }}>{qty}</span>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [ex.id]: qty + 1 })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>+</button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Price preview */}
              <div style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {addBookingForm.type === "walkOn" ? "Walk-On" : "Rental"} ×{addBookingForm.qty}
                  {extrasPreviewTotal > 0 && ` + extras`}
                </span>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, color: "var(--accent)" }}>£{previewTotal.toFixed(2)}</span>
              </div>

              <div className="gap-2">
                <button className="btn btn-primary" onClick={submitAddBooking} disabled={addBookingBusy || !addBookingForm.userId}>
                  {addBookingBusy ? "Adding…" : "✓ Add Booking"}
                </button>
                <button className="btn btn-ghost" onClick={() => setAddBookingModal(false)} disabled={addBookingBusy}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {delEventConfirm && (
        <div className="overlay" onClick={() => !deletingEvent && setDelEventConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Event?</div>
            <p style={{ fontSize:13, color:"var(--muted)", margin:"12px 0 4px" }}>
              Permanently delete <strong style={{ color:"var(--text)" }}>{delEventConfirm.title}</strong>?
            </p>
            <p style={{ fontSize:12, color:"var(--red)", marginBottom:20 }}>
              ⚠️ This will also delete all {delEventConfirm.bookings?.length || 0} booking(s) for this event. This cannot be undone.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingEvent} onClick={deleteEvent}>
                {deletingEvent ? "Deleting…" : "Yes, Delete Event"}
              </button>
              <button className="btn btn-ghost" disabled={deletingEvent} onClick={() => setDelEventConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Events (alias — kept for any legacy references) ──────

// ── Admin Players ─────────────────────────────────────────
function AdminPlayers({ data, save, updateUser, showToast }) {
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState("all");
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [localUsers, setLocalUsers] = useState(null); // null = not yet fetched

  const loadUsers = () =>
    api.profiles.getAll()
      .then(list => {
        const users = list.map(normaliseProfile);
        setLocalUsers(users);
        save({ users });
      })
      .catch(e => showToast("Failed to load players: " + e.message, "red"));

  // Fetch fresh from DB on mount
  useEffect(() => { loadUsers(); }, []);

  // Wrapper that updates DB then refreshes localUsers
  const updateUserAndRefresh = async (id, patch) => {
    await updateUser(id, patch);
    await loadUsers(); // pull fresh data so VIP tab updates immediately
  };

  // Use local (fresh) users if available, fall back to global data.users
  const allUsers = localUsers ?? data.users;
  const players = allUsers.filter(u => u.role !== "admin");
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
          {localUsers === null && <div style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Loading players…</div>}
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
                    {u.ukara && <span className="mono" style={{ fontSize: 10, color: "var(--accent)", marginLeft: 6 }}>{u.ukara}</span>}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{vipApps.length} pending application{vipApps.length !== 1 ? "s" : ""}</div>
            <button className="btn btn-ghost btn-sm" onClick={loadUsers}>🔄 Refresh</button>
          </div>
          {vipApps.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No pending VIP applications.</div>
          ) : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Email</th><th>Games</th><th>Joined</th><th>Fee (£30)</th><th>Actions</th></tr></thead>
              <tbody>
                {vipApps.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                    <td style={{ color: u.gamesAttended >= 3 ? "var(--accent)" : "var(--red)" }}>{u.gamesAttended} / 3</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.joinDate}</td>
                    <td>
                      <span style={{ fontSize:11, color:"var(--gold)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700 }}>£30 due on approval</span>
                    </td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-primary" onClick={async () => {
                          const ukara = `UKARA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100).padStart(3,"0")}`;
                          await updateUserAndRefresh(u.id, { vipStatus: "active", vipApplied: true, ukara });
                          showToast(`✅ VIP approved for ${u.name}! UKARA: ${ukara}. Collect £30 fee.`);
                        }}>✓ Approve</button>
                        <button className="btn btn-sm btn-danger" onClick={async () => {
                          await updateUserAndRefresh(u.id, { vipApplied: false });
                          showToast(`VIP application rejected for ${u.name}`, "red");
                        }}>✗ Reject</button>
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
            </div>
            <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "var(--muted)", textTransform: "uppercase", fontFamily: "'Barlow Condensed', sans-serif" }}>Delivery Address</div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 2, padding: "12px 14px", marginBottom: 14 }}>
              {(() => {
                const parts = (edit.address || "").split("\n");
                const setAddrPart = (idx, val) => {
                  const p = (edit.address || "").split("\n");
                  while (p.length <= idx) p.push("");
                  p[idx] = val;
                  setEdit(prev => ({ ...prev, address: p.join("\n") }));
                };
                return (
                  <>
                    <div className="form-group" style={{ marginBottom: 8 }}><label>Line 1</label><input value={parts[0] || ""} onChange={e => setAddrPart(0, e.target.value)} placeholder="House number and street" /></div>
                    <div className="form-group" style={{ marginBottom: 8 }}><label>Line 2</label><input value={parts[1] || ""} onChange={e => setAddrPart(1, e.target.value)} placeholder="Flat, apartment, etc." /></div>
                    <div className="form-row" style={{ marginBottom: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Town / City</label><input value={parts[2] || ""} onChange={e => setAddrPart(2, e.target.value)} placeholder="Swindon" /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>County</label><input value={parts[3] || ""} onChange={e => setAddrPart(3, e.target.value)} placeholder="Wiltshire" /></div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>Postcode</label><input value={parts[4] || ""} onChange={e => setAddrPart(4, e.target.value.toUpperCase())} placeholder="SN1 1AA" style={{ maxWidth: 160 }} /></div>
                  </>
                );
              })()}
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
  const [localUsers, setLocalUsers] = useState(null);

  useEffect(() => {
    api.profiles.getAll()
      .then(list => setLocalUsers(list.map(normaliseProfile)))
      .catch(() => {});
  }, []);

  const allUsers = localUsers ?? data.users;
  const withWaiver = allUsers.filter(u => u.waiverData || u.waiverPending);

  const approve = (u) => {
    updateUser(u.id, { waiverData: u.waiverPending, waiverPending: null, waiverSigned: true, waiverYear: new Date().getFullYear() });
    showToast("Waiver changes approved!"); setView(null);
  };
  const reject = (u) => {
    updateUser(u.id, { waiverPending: null }); showToast("Changes rejected"); setView(null);
  };

  const vw = view ? allUsers.find(u => u.id === view) : null;

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
function AdminOrders({ showToast }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const STATUS_COLORS = { pending: "blue", processing: "gold", dispatched: "green", completed: "teal", cancelled: "red" };

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.shopOrders.getAll();
      setOrders(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Small delay so auth session is confirmed before querying RLS-protected table
    const t = setTimeout(fetchOrders, 600);
    return () => clearTimeout(t);
  }, []);

  const setStatus = async (id, status) => {
    try {
      await api.shopOrders.updateStatus(id, status);
      setOrders(o => o.map(x => x.id === id ? { ...x, status } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status }));
      showToast("Status updated!");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const pending = orders.filter(o => o.status === "pending").length;

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Shop Orders</div><div className="page-sub">{orders.length} orders · £{totalRevenue.toFixed(2)} total</div></div>
        <button className="btn btn-ghost" onClick={fetchOrders} disabled={loading}>🔄 Refresh</button>
      </div>
      <div className="grid-4 mb-2">
        {[
          { label: "Total Orders", val: orders.length, color: "" },
          { label: "Pending", val: pending, color: "blue" },
          { label: "Dispatched", val: orders.filter(o => o.status === "dispatched").length, color: "gold" },
          { label: "Revenue", val: `£${totalRevenue.toFixed(2)}`, color: "teal" },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-val">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Loading orders…</div>
      ) : error ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: "var(--red)", marginBottom: 12 }}>Failed to load orders: {error}</div>
          <button className="btn btn-ghost" onClick={fetchOrders}>Retry</button>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Date</th><th>Customer</th><th>Items</th><th>Postage</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No orders yet</td></tr>}
              {orders.map(o => {
                const items = Array.isArray(o.items) ? o.items : [];
                return (
                  <tr key={o.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{gmtShort(o.created_at)}</td>
                    <td style={{ fontWeight: 600 }}>
                      <button style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 13 }} onClick={() => setDetail(o)}>
                        {o.customer_name}
                      </button>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{items.map(i => `${i.name} ×${i.qty}`).join(", ")}</td>
                    <td style={{ fontSize: 12 }}>{o.postage_name || "—"}</td>
                    <td className="text-green">£{Number(o.total).toFixed(2)}</td>
                    <td><span className={`tag tag-${STATUS_COLORS[o.status] || "blue"}`}>{o.status}</span></td>
                    <td>
                      <select value={o.status} onChange={e => setStatus(o.id, e.target.value)}
                        style={{ fontSize: 12, padding: "4px 8px", background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 4 }}>
                        {["pending","processing","dispatched","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
              <div className="modal-title" style={{ margin: 0 }}>📦 Order Details</div>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const addr = detail.customer_address || "No address on file";
                const items = (Array.isArray(detail.items) ? detail.items : []).map(i => `${i.name} x${i.qty}`).join(", ");
                const win = window.open('', '_blank', 'width=400,height=300');
                win.document.write(`
                  <html><head><title>Postage Label</title>
                  <style>
                    body{font-family:Arial,sans-serif;padding:24px;border:3px solid #000;margin:20px;}
                    h2{font-size:18px;margin:0 0 4px;}
                    .to{font-size:22px;font-weight:bold;margin:16px 0 8px;}
                    .addr{font-size:16px;line-height:1.6;white-space:pre-line;}
                    .from{font-size:11px;color:#555;margin-top:20px;border-top:1px solid #ccc;padding-top:10px;}
                    .items{font-size:10px;color:#777;margin-top:8px;}
                    @media print{body{margin:0;border:none;}}
                  </style></head>
                  <body>
                    <div style="font-size:11px;color:#888;">ORDER #${detail.id?.slice(-8).toUpperCase()} · ${gmtShort(detail.created_at)}</div>
                    <div class="to">TO:</div>
                    <div style="font-size:20px;font-weight:bold;">${detail.customer_name}</div>
                    <div class="addr">${addr}</div>
                    <div class="from">FROM: Zulu's Airsoft</div>
                    <script>window.onload=()=>window.print();<\/script>
                  </body></html>`);
                win.document.close();
              }}>🖨️ Print Postage Label</button>
            </div>

            <div className="grid-2 mb-2">
              <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, letterSpacing: ".08em" }}>CUSTOMER</div><div style={{ fontWeight: 700 }}>{detail.customer_name}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, letterSpacing: ".08em" }}>EMAIL</div><div style={{ fontSize: 13 }}>{detail.customer_email || "—"}</div></div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, letterSpacing: ".08em" }}>SHIPPING ADDRESS</div>
                <div style={{ fontSize: 13, whiteSpace: "pre-line", background: "var(--bg4)", padding: "10px 12px", borderRadius: 3, border: "1px solid var(--border)" }}>
                  {detail.customer_address || <span style={{ color: "var(--muted)" }}>No address on file — player may need to update their profile</span>}
                </div>
              </div>
              <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, letterSpacing: ".08em" }}>DATE</div><div className="mono" style={{ fontSize: 12 }}>{gmtShort(detail.created_at)}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, letterSpacing: ".08em" }}>PAYPAL REF</div><div className="mono" style={{ fontSize: 11, color: detail.paypal_order_id ? "var(--text)" : "var(--muted)" }}>{detail.paypal_order_id || "—"}</div></div>
              <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, letterSpacing: ".08em" }}>STATUS</div>
                <select value={detail.status} onChange={e => setStatus(detail.id, e.target.value)}
                  style={{ fontSize: 12, padding: "6px 10px", background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 3, width: "100%" }}>
                  {["pending","processing","dispatched","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8, letterSpacing: ".1em" }}>ITEMS</div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Line Total</th></tr></thead>
              <tbody>
                {(Array.isArray(detail.items) ? detail.items : []).map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.name}</td><td>{i.qty}</td>
                    <td>£{Number(i.price).toFixed(2)}</td>
                    <td className="text-green">£{(Number(i.price) * i.qty).toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={3} style={{ fontWeight: 700 }}>Postage ({detail.postage_name})</td>
                  <td>£{Number(detail.postage).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 900, fontSize: 15 }}>TOTAL</td>
                  <td className="text-green" style={{ fontWeight: 900, fontSize: 15 }}>£{Number(detail.total).toFixed(2)}</td>
                </tr>
              </tbody>
            </table></div>
            <button className="btn btn-ghost mt-2" onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Shop ─────────────────────────────────────────────
function AdminShop({ data, save, showToast }) {
  const [tab, setTab] = useState("products");
  const [modal, setModal] = useState(null);
  const uid = () => Math.random().toString(36).slice(2,10);
  const blank = { name: "", description: "", price: 0, salePrice: null, onSale: false, image: "", stock: 0, noPost: false, gameExtra: false, variants: [] };
  const [form, setForm] = useState(blank);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Variant editor state
  const [newVariant, setNewVariant] = useState({ name: "", price: "", stock: "" });

  const addVariant = () => {
    if (!newVariant.name) { showToast("Variant name required", "red"); return; }
    const v = { id: uid(), name: newVariant.name, price: Number(newVariant.price) || 0, stock: Number(newVariant.stock) || 0 };
    f("variants", [...(form.variants || []), v]);
    setNewVariant({ name: "", price: "", stock: "" });
  };
  const removeVariant = (id) => f("variants", form.variants.filter(v => v.id !== id));
  const updateVariant = (id, key, val) => f("variants", form.variants.map(v => v.id === id ? { ...v, [key]: key === "name" ? val : Number(val) } : v));

  const hasVariants = (form.variants || []).length > 0;

  // Postage state
  const [postModal, setPostModal] = useState(null);
  const blankPost = { name: "", price: 0 };
  const [postForm, setPostForm] = useState(blankPost);
  const pf = (k, v) => setPostForm(p => ({ ...p, [k]: v }));

  const handleImg = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const img2 = new Image();
    const reader2 = new FileReader();
    reader2.onload = ev => {
      img2.onload = () => {
        const MAX2 = 900;
        const scale2 = Math.min(1, MAX2 / Math.max(img2.width, img2.height));
        const canvas2 = document.createElement("canvas");
        canvas2.width  = Math.round(img2.width  * scale2);
        canvas2.height = Math.round(img2.height * scale2);
        canvas2.getContext("2d").drawImage(img2, 0, 0, canvas2.width, canvas2.height);
        f("image", canvas2.toDataURL("image/jpeg", 0.75));
      };
      img2.src = ev.target.result;
    };
    reader2.readAsDataURL(file);
  };

  const [savingProduct, setSavingProduct] = useState(false);
  const saveItem = async () => {
    if (!form.name) { showToast("Name required", "red"); return; }
    setSavingProduct(true);
    const safety = setTimeout(() => setSavingProduct(false), 20000);
    try {
      if (modal === "new") await api.shop.create(form);
      else await api.shop.update(form.id, form);
      const freshShop = await api.shop.getAll();
      save({ shop: freshShop });
      showToast("Product saved!");
      setModal(null);
    } catch (e) {
      console.error("saveItem FAILED at:", e?.message, e);
      showToast("Save failed: " + (e?.message || String(e)), "red");
    } finally {
      clearTimeout(safety);
      setSavingProduct(false);
    }
  };

  const savePostage = async () => {
    if (!postForm.name) { showToast("Name required", "red"); return; }
    try {
      if (postModal === "new") await api.postage.create(postForm);
      else await api.postage.update(postForm.id, postForm);
      save({ postageOptions: await api.postage.getAll() });
      showToast("Postage saved!"); setPostModal(null);
    } catch (e) { showToast("Save failed: " + e.message, "red"); }
  };

  const deletePostage = async (id) => {
    try {
      await api.postage.delete(id);
      save({ postageOptions: await api.postage.getAll() });
      showToast("Removed");
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Shop</div></div>
        {tab === "products"
          ? <button className="btn btn-primary" onClick={() => { setForm(blank); setNewVariant({ name:"", price:"", stock:"" }); setModal("new"); }}>+ Add Product</button>
          : <button className="btn btn-primary" onClick={() => { setPostForm(blankPost); setPostModal("new"); }}>+ Add Postage</button>
        }
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>Products</button>
        <button className={`nav-tab ${tab === "postage" ? "active" : ""}`} onClick={() => setTab("postage")}>Postage Options</button>
      </div>

      {tab === "products" && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Product</th><th>Base Price</th><th>Variants</th><th>Stock</th><th>Sale</th><th>No Post</th><th>Game Extra</th><th></th></tr></thead>
            <tbody>
              {data.shop.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight:600 }}>{item.name}</td>
                  <td className="text-green">{item.variants?.length > 0 ? <span style={{color:"var(--muted)",fontSize:11}}>see variants</span> : `£${Number(item.price).toFixed(2)}`}</td>
                  <td>
                    {item.variants?.length > 0
                      ? <span className="tag tag-blue">{item.variants.length} variants</span>
                      : <span style={{color:"var(--muted)"}}>—</span>
                    }
                  </td>
                  <td>
                    {item.variants?.length > 0
                      ? item.variants.map(v => (
                          <div key={v.id} style={{fontSize:11,fontFamily:"'Share Tech Mono',monospace",whiteSpace:"nowrap"}}>
                            {v.name}: <span style={{color:Number(v.stock)>0?"var(--accent)":"var(--red)"}}>{v.stock}</span>
                          </div>
                        ))
                      : item.stock
                    }
                  </td>
                  <td>{item.onSale ? <span className="tag tag-red">£{item.salePrice}</span> : "—"}</td>
                  <td>{item.noPost ? <span className="tag tag-gold">Yes</span> : "—"}</td>
                  <td>{item.gameExtra ? <span className="tag tag-green">✓</span> : "—"}</td>
                  <td>
                    <div className="gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...item, variants: item.variants || [] }); setNewVariant({ name:"", price:"", stock:"" }); setModal(item.id); }}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={async () => { try { await api.shop.delete(item.id); save({ shop: await api.shop.getAll() }); showToast("Deleted"); } catch(e) { showToast("Delete failed", "red"); } }}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.shop.length === 0 && <tr><td colSpan={7} style={{textAlign:"center",color:"var(--muted)",padding:30}}>No products yet</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "postage" && (
        <div className="card">
          <p className="text-muted mb-2" style={{fontSize:13}}>Postage options shown at checkout. Items marked <strong>No Post</strong> are always collection-only.</p>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Option Name</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {(data.postageOptions || []).map(p => (
                <tr key={p.id}>
                  <td style={{fontWeight:600}}>{p.name}</td>
                  <td className="text-green">£{Number(p.price).toFixed(2)}</td>
                  <td><div className="gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => { setPostForm({ ...p }); setPostModal(p.id); }}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deletePostage(p.id)}>Del</button>
                  </div></td>
                </tr>
              ))}
              {(data.postageOptions || []).length === 0 && <tr><td colSpan={3} style={{textAlign:"center",color:"var(--muted)",padding:30}}>No postage options configured</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {/* ── PRODUCT MODAL ── */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === "new" ? "Add Product" : "Edit Product"}</div>

            <div className="form-row">
              <div className="form-group"><label>Name</label><input value={form.name} onChange={e => f("name", e.target.value)} /></div>
              <div className="form-group"><label>Description</label><input value={form.description} onChange={e => f("description", e.target.value)} /></div>
            </div>

            {/* Base price + stock — only relevant if no variants */}
            {!hasVariants && (
              <div className="form-row">
                <div className="form-group"><label>Base Price (£)</label><input type="number" step="0.01" value={form.price} onChange={e => f("price", +e.target.value)} /></div>
                <div className="form-group"><label>Stock</label><input type="number" value={form.stock} onChange={e => f("stock", +e.target.value)} /></div>
              </div>
            )}
            {hasVariants && (
              <div className="alert alert-blue mb-2" style={{fontSize:12}}>ℹ️ Variants are active — base price and stock are ignored. Each variant has its own price and stock.</div>
            )}

            {/* Sale price — only if no variants */}
            {!hasVariants && (
              <>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                  <input type="checkbox" checked={form.onSale} onChange={e => f("onSale", e.target.checked)} />
                  <label style={{fontSize:13}}>On Sale</label>
                </div>
                {form.onSale && <div className="form-group"><label>Sale Price (£)</label><input type="number" step="0.01" value={form.salePrice || ""} onChange={e => f("salePrice", +e.target.value)} /></div>}
              </>
            )}

            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
              <input type="checkbox" checked={form.noPost} onChange={e => f("noPost", e.target.checked)} />
              <label style={{fontSize:13}}>No Post — Collection Only (e.g. Pyro)</label>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              <input type="checkbox" checked={form.gameExtra || false} onChange={e => f("gameExtra", e.target.checked)} />
              <label style={{fontSize:13}}>Available as Game Day Extra <span style={{color:"var(--muted)",fontSize:11}}>(shows in event extras product picker)</span></label>
            </div>

            {/* ── VARIANTS EDITOR ── */}
            <div style={{border:"1px solid #2a2a2a",borderLeft:"3px solid var(--accent)",marginBottom:14}}>
              <div style={{background:"#0d0d0d",padding:"8px 14px",fontSize:9,letterSpacing:".25em",color:"var(--accent)",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,textTransform:"uppercase",borderBottom:"1px solid #2a2a2a"}}>
                VARIANTS (optional) — e.g. sizes, colours
              </div>
              <div style={{padding:14}}>
                {(form.variants || []).length === 0 && (
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:"var(--muted)",marginBottom:10}}>No variants — product uses base price and stock above.</div>
                )}
                {(form.variants || []).map(v => (
                  <div key={v.id} style={{display:"grid",gridTemplateColumns:"1fr 100px 100px 36px",gap:8,alignItems:"center",marginBottom:8}}>
                    <input value={v.name} onChange={e => updateVariant(v.id, "name", e.target.value)} placeholder="Variant name (e.g. Red, Large)" style={{fontSize:12}} />
                    <input type="number" step="0.01" value={v.price} onChange={e => updateVariant(v.id, "price", e.target.value)} placeholder="Price £" style={{fontSize:12}} />
                    <input type="number" value={v.stock} onChange={e => updateVariant(v.id, "stock", e.target.value)} placeholder="Stock" style={{fontSize:12}} />
                    <button className="btn btn-sm btn-danger" onClick={() => removeVariant(v.id)} style={{padding:"6px 10px"}}>✕</button>
                  </div>
                ))}
                {/* Add new variant row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 100px 100px auto",gap:8,alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid #1e1e1e"}}>
                  <input value={newVariant.name} onChange={e => setNewVariant(p => ({...p, name: e.target.value}))} placeholder="New variant name" style={{fontSize:12}} />
                  <input type="number" step="0.01" value={newVariant.price} onChange={e => setNewVariant(p => ({...p, price: e.target.value}))} placeholder="£" style={{fontSize:12}} />
                  <input type="number" value={newVariant.stock} onChange={e => setNewVariant(p => ({...p, stock: e.target.value}))} placeholder="Stock" style={{fontSize:12}} />
                  <button className="btn btn-sm btn-primary" onClick={addVariant} style={{whiteSpace:"nowrap"}}>+ Add</button>
                </div>
              </div>
            </div>

            <div className="form-group"><label>Product Image</label><input type="file" accept="image/*" onChange={handleImg} /></div>
            {form.image && <img src={form.image} style={{width:"100%",maxHeight:110,objectFit:"cover",marginBottom:10}} alt="" />}

            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveItem} disabled={savingProduct}>{savingProduct ? "Saving…" : "Save Product"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Postage modal */}
      {postModal && (
        <div className="overlay" onClick={() => setPostModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{postModal === "new" ? "Add Postage Option" : "Edit Postage"}</div>
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
    eventObj: ev,
    type: b.type,
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
      // Ticket line — work out ticket unit price from event
      const ev = t.eventObj || data.events.find(e => e.title === t.eventTitle);
      const unitPrice = t.type === "walkOn" ? (ev?.walkOnPrice || 0) : (ev?.rentalPrice || 0);
      const ticketLine = unitPrice * t.qty;
      const lines = [{ name: `${t.ticketType} ticket`, qty: t.qty, price: unitPrice, line: ticketLine }];
      // Extras — keys are "extraId" or "extraId:variantId"
      Object.entries(t.extras || {}).filter(([,v]) => v > 0).forEach(([key, qty]) => {
        const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
        const ex = t.eventExtras?.find(e => e.id === extraId);
        const lp = (data.shop || []).find(p => p.id === ex?.productId);
        const v = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        const label = ex ? (v ? `${ex.name} — ${v.name}` : ex.name) : key;
        const unitP = v ? Number(v.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
        lines.push({ name: label, qty, price: unitP, line: unitP * qty });
      });
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
                <td>
                  {t.source === "cash"
                    ? `Cash Sale (${t.items?.length || 0} items)`
                    : (() => {
                        const extrasCount = Object.values(t.extras || {}).filter(v => v > 0).length;
                        return `${t.eventTitle} — ${t.ticketType} ×${t.qty}${extrasCount ? ` + ${extrasCount} extra${extrasCount > 1 ? "s" : ""}` : ""}`;
                      })()
                  }
                </td>
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
                    <td>
                  {t.source === "cash"
                    ? `Cash Sale (${t.items?.length || 0} items)`
                    : (() => {
                        const extrasCount = Object.values(t.extras || {}).filter(v => v > 0).length;
                        return `${t.eventTitle} — ${t.ticketType} ×${t.qty}${extrasCount ? ` + ${extrasCount} extra${extrasCount > 1 ? "s" : ""}` : ""}`;
                      })()
                  }
                </td>
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
// ── Simple rich-text helpers ──────────────────────────────
function insertMarkdown(text, setText, before, after = "") {
  const ta = document.activeElement;
  if (!ta || ta.tagName !== "TEXTAREA") { setText(p => p + before + after); return; }
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = text.slice(s, e);
  const newVal = text.slice(0, s) + before + sel + after + text.slice(e);
  setText(newVal);
  setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + before.length + sel.length + after.length; ta.focus(); }, 0);
}

// Render answer markdown for public QA page
function renderQAAnswer(text) {
  if (!text) return null;
  // Parse basic markdown: **bold**, *italic*, # headings, - lists, ![alt](url) images, bare URLs
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Heading
    if (line.startsWith("### ")) return <h4 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:"#fff", margin:"10px 0 4px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(4)}</h4>;
    if (line.startsWith("## "))  return <h3 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)", margin:"12px 0 6px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(3)}</h3>;
    if (line.startsWith("# "))   return <h2 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"var(--accent)", margin:"14px 0 8px" }}>{line.slice(2)}</h2>;
    // Image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) return <img key={i} src={imgMatch[2]} alt={imgMatch[1]} style={{ maxWidth:"100%", margin:"8px 0", borderRadius:2 }} />;
    // List item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", fontSize:13, color:"var(--muted)" }}><span style={{ color:"var(--accent)", flexShrink:0 }}>▸</span>{renderInline(line.slice(2))}</div>;
    }
    // Blank line
    if (line.trim() === "") return <div key={i} style={{ height:8 }} />;
    // Normal paragraph
    return <p key={i} style={{ fontSize:13, color:"var(--muted)", lineHeight:1.8, margin:"2px 0" }}>{renderInline(line)}</p>;
  });
}

function renderInline(text) {
  // Split by **bold**, *italic*, or backtick code spans
  const INLINE_RE = new RegExp("(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|" + String.fromCharCode(96) + "[^" + String.fromCharCode(96) + "]+" + String.fromCharCode(96) + ")", "g");
  const TICK = String.fromCharCode(96);
  const parts = text.split(INLINE_RE);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color:"#fff", fontWeight:700 }}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("*")  && p.endsWith("*"))  return <em key={i} style={{ color:"var(--accent)", fontStyle:"italic" }}>{p.slice(1,-1)}</em>;
    if (p.startsWith(TICK) && p.endsWith(TICK)) return <code key={i} style={{ background:"#1a1a1a", padding:"1px 5px", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--accent)" }}>{p.slice(1,-1)}</code>;
    return p;
  });
}

function AdminQA({ data, save, showToast }) {
  const blank = { q: "", a: "", image: "" };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const fq = v => setForm(p => ({ ...p, q: v }));
  const fa = v => setForm(p => ({ ...p, a: v }));

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `qa/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("gallery").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("gallery").getPublicUrl(path);
      const url = urlData.publicUrl;
      setForm(p => ({ ...p, a: p.a + (p.a && !p.a.endsWith("\n") ? "\n" : "") + `![image](${url})\n`, image: url }));
      showToast("Image uploaded!");
    } catch (err) { showToast("Upload failed: " + err.message, "red"); }
    finally { setUploading(false); }
  };

  const save_ = async () => {
    if (!form.q.trim() || !form.a.trim()) { showToast("Fill in both question and answer", "red"); return; }
    try {
      if (editId) { await api.qa.update(editId, form); setEditId(null); }
      else         { await api.qa.create(form); }
      save({ qa: await api.qa.getAll() });
      setForm(blank); setPreview(false);
      showToast(editId ? "Q&A updated!" : "Q&A added!");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this Q&A?")) return;
    try { await api.qa.delete(id); save({ qa: await api.qa.getAll() }); showToast("Deleted"); }
    catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const startEdit = (item) => { setForm({ q: item.q, a: item.a, image: item.image || "" }); setEditId(item.id); setPreview(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancel = () => { setForm(blank); setEditId(null); setPreview(false); };

  const toolbar = [
    { label: "B",  title: "Bold",        action: () => insertMarkdown(form.a, fa, "**", "**") },
    { label: "I",  title: "Italic",      action: () => insertMarkdown(form.a, fa, "*", "*") },
    { label: "#",  title: "Heading",     action: () => insertMarkdown(form.a, fa, "## ") },
    { label: "—",  title: "Subheading",  action: () => insertMarkdown(form.a, fa, "### ") },
    { label: "• ", title: "List item",   action: () => insertMarkdown(form.a, fa, "- ") },
    { label: "` `",title: "Code",        action: () => insertMarkdown(form.a, fa, "`", "`") },
  ];

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Q&amp;A Manager</div><div className="page-sub">Supports **bold**, *italic*, ## headings, - lists, and images</div></div></div>

      <div className="card mb-2">
        <div style={{ fontWeight:700, fontSize:15, marginBottom:14, color:"var(--accent)" }}>{editId ? "✏️ Edit Q&A" : "➕ New Q&A"}</div>
        <div className="form-group"><label>Question</label><input value={form.q} onChange={e => fq(e.target.value)} placeholder="e.g. What should I wear?" /></div>

        {/* Toolbar */}
        <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
          {toolbar.map(t => (
            <button key={t.label} title={t.title} onClick={t.action}
              style={{ background:"#1a1a1a", border:"1px solid #333", color:"#fff", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2 }}>
              {t.label}
            </button>
          ))}
          <label title="Upload image" style={{ background:"#1a1a1a", border:"1px solid #333", color:uploading ? "var(--muted)" : "var(--accent)", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2, display:"flex", alignItems:"center", gap:4 }}>
            🖼 {uploading ? "Uploading…" : "Add Image"}
            <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageUpload} disabled={uploading} />
          </label>
          <button onClick={() => setPreview(p => !p)}
            style={{ background: preview ? "var(--accent)" : "#1a1a1a", border:"1px solid #333", color: preview ? "#000" : "#fff", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2, marginLeft:"auto" }}>
            👁 {preview ? "Edit" : "Preview"}
          </button>
        </div>

        {preview ? (
          <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", padding:"12px 16px", minHeight:80, borderRadius:2 }}>
            {renderQAAnswer(form.a)}
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom:0 }}>
            <label>Answer (Markdown supported)</label>
            <textarea rows={6} value={form.a} onChange={e => fa(e.target.value)} placeholder="Write your answer here. Use the toolbar above for formatting." />
          </div>
        )}

        <div className="gap-2 mt-2">
          <button className="btn btn-primary" onClick={save_}>{editId ? "Save Changes" : "Add Q&A"}</button>
          {editId && <button className="btn btn-ghost" onClick={cancel}>Cancel</button>}
        </div>
      </div>

      {data.qa.length === 0 && <div style={{ textAlign:"center", color:"var(--muted)", padding:32 }}>No Q&A items yet.</div>}
      {data.qa.map((item, idx) => (
        <div key={item.id} className="card mb-1" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <span style={{ background:"var(--accent)", color:"#000", fontSize:9, fontWeight:800, padding:"2px 6px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em" }}>Q{idx+1}</span>
              <span style={{ fontWeight:700, fontSize:14, color:"#fff" }}>{item.q}</span>
            </div>
            <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{(item.a || "").slice(0, 120)}{(item.a || "").length > 120 ? "…" : ""}</div>
          </div>
          <div className="gap-2" style={{ flexShrink:0 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => startEdit(item)}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => del(item.id)}>Del</button>
          </div>
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
  const [diagResult, setDiagResult] = useState(null);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  const add = (item) => setItems(c => {
    const ex = c.find(x => x.id === item.id);
    return ex ? c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...item, qty: 1 }];
  });

  // Diagnostic: test if cash_sales table is reachable at all
  const runDiag = async () => {
    setDiagResult("Testing…");
    try {
      const { data: rows, error } = await supabase.from('cash_sales').select('id').limit(1);
      if (error) setDiagResult("SELECT error: " + (error.message || JSON.stringify(error)));
      else setDiagResult("SELECT ok — " + (rows?.length ?? 0) + " rows visible. Table is accessible.");
    } catch (e) {
      setDiagResult("Exception: " + e.message);
    }
  };

  const completeSale = async () => {
    if (items.length === 0) { showToast("Add items first", "red"); return; }
    setLastError(null);
    setBusy(true);

    try {
      const player = playerId !== "manual" ? data.users.find(u => u.id === playerId) : null;
      const payload = {
        customer_name:  player ? player.name : (manual.name || "Walk-in"),
        customer_email: player ? (player.email || "") : (manual.email || ""),
        user_id:        player?.id ?? null,
        items:          items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        total,
      };

      // Race the insert against a 6s timeout — whichever settles first wins
      const insertPromise = supabase.from('cash_sales').insert(payload).select();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), 6000)
      );

      const { data: result, error } = await Promise.race([insertPromise, timeoutPromise]);

      if (error) {
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" | ") || JSON.stringify(error);
        setLastError("DB Error: " + msg);
        showToast("Failed: " + msg.slice(0, 80), "red");
        return;
      }

      // Deduct stock
      for (const item of items) {
        await supabase.rpc('deduct_stock', { product_id: item.id, qty: item.qty });
      }
      showToast(`✅ Sale £${total.toFixed(2)} saved!`);
      setItems([]);
      setManual({ name: "", email: "" });
      setPlayerId("manual");
      setLastError(null);
      setDiagResult(null);

    } catch (e) {
      const isTimed = e.message === "TIMEOUT";
      const msg = isTimed
        ? "Insert timed out — RLS is blocking the write. Run master-rls-admin-only.sql in Supabase SQL Editor, then click 'Test Table Access' below to confirm."
        : "Exception: " + e.message;
      setLastError(msg);
      showToast(isTimed ? "RLS blocking insert — see error below" : "Error: " + e.message, "red");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Cash Sales</div><div className="page-sub">Walk-in or unregistered customer sales</div></div></div>
      {lastError && (
        <div className="alert alert-red mb-2" style={{ wordBreak: "break-all", fontSize: 12 }}>
          <strong>Error:</strong> {lastError}
          <div className="mt-1">
            <button className="btn btn-sm btn-ghost" onClick={runDiag}>🔍 Test Table Access</button>
          </div>
        </div>
      )}
      {diagResult && (
        <div className="alert alert-blue mb-2" style={{ fontSize: 12, wordBreak: "break-all" }}>
          <strong>Diagnostic:</strong> {diagResult}
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

  // Shop state — lifted to App level so cart persists between shop & product page
  const [shopCart, setShopCart] = useState([]);
  const [shopCartOpen, setShopCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  // Reset product view when navigating away from shop
  useEffect(() => { if (page !== "shop") setSelectedProduct(null); }, [page]);

  // Auth — runs in background, never blocks site from rendering
  useEffect(() => {
    const timeout = setTimeout(() => setAuthLoading(false), 3000);

    const loadSession = async () => {
      try {
        // Try getSession first
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          clearTimeout(timeout);
          try {
            const profile = await api.profiles.getById(session.user.id);
            setCu(normaliseProfile(profile));
            api.profiles.getAll().catch(() => []).then(list =>
              save({ users: list.map(normaliseProfile) })
            );
          } catch { setCu(null); }
          setAuthLoading(false);
          return;
        }

        // Fallback: read raw session from localStorage directly
        // (needed when noopLock causes getSession to return null on refresh)
        const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (storageKey) {
          try {
            const raw = JSON.parse(localStorage.getItem(storageKey));
            const userId = raw?.user?.id;
            if (userId) {
              const profile = await api.profiles.getById(userId);
              if (profile) {
                setCu(normaliseProfile(profile));
                // Restore session properly
                if (raw.access_token) {
                  await supabase.auth.setSession({ access_token: raw.access_token, refresh_token: raw.refresh_token });
                }
              }
            }
          } catch { /* localStorage entry malformed, ignore */ }
        }
      } catch { /* getSession failed, stay logged out */ }

      clearTimeout(timeout);
      setAuthLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;
      if (session?.user) {
        try {
          const profile = await api.profiles.getById(session.user.id);
          if (profile) setCu(normaliseProfile(profile));
          else {
            // Profile may not exist yet (new signup before confirmation) — try creating it
            try {
              const meta = session.user.user_metadata || {};
              await supabase.from('profiles').insert({
                id: session.user.id, name: meta.name || session.user.email?.split('@')[0] || 'Player',
                phone: meta.phone || '', role: 'player', games_attended: 0,
              }).select().single();
              const profile2 = await api.profiles.getById(session.user.id);
              if (profile2) setCu(normaliseProfile(profile2));
            } catch { setCu(null); }
          }
        } catch { setCu(null); }
        if (event === "SIGNED_IN") refresh();
      } else {
        setCu(null);
        if (event === "SIGNED_OUT") refresh();
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

  // Only show loading screen while initial data fetch is in progress
  // Auth loads in the background - never block the site on it
  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "#0d1117", padding: 24 }}>
        <div style={{ width: 48, height: 48, background: "var(--accent,#e05c00)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 16, animation: "pulse 1s infinite", fontFamily: "'Barlow Condensed',sans-serif" }}>ZA</div>
        <div style={{ color: "var(--muted)", fontSize: 13, letterSpacing: ".15em" }}>LOADING...</div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}`}</style>
      </div>
    );
  }

  const isAdmin = cu?.role === "admin";

  // Error banner — shown at top but doesn't block the site
  const errorBanner = loadError ? (
    <div style={{ background: "#f85149", color: "#fff", padding: "10px 20px", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span>⚠️ Database error: {loadError}</span>
      <button onClick={refresh} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Retry</button>
    </div>
  ) : null;

  if (page === "admin") {
    // First gate: must be logged in at all
    if (!cu) {
      setPage("home");
      return null;
    }
    // Second gate: client-side role pre-check (server verification happens inside AdminPanel)
    if (!isAdmin) {
      return (
        <>
          <style>{CSS}</style>
          <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 48 }}>🔒</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 32, letterSpacing: ".1em", color: "var(--red)" }}>ACCESS DENIED</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>Admin access only.</div>
            <button className="btn btn-ghost" onClick={() => setPage("home")}>← Back to Site</button>
          </div>
        </>
      );
    }
    return (
      <>
        <style>{CSS}</style>
        <Toast {...toast} />
        {errorBanner}
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
      {errorBanner}
      <PublicNav page={page} setPage={setPage} cu={cu} setCu={setCu} setAuthModal={setAuthModal} />

      <div className="pub-page-wrap">
        {page === "home"        && <HomePage data={data} setPage={setPage} />}
        {page === "events"      && <EventsPage data={data} cu={cu} updateEvent={updateEvent} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} save={save} />}
        {page === "shop" && !selectedProduct && (
          <ShopPage
            data={data} cu={cu} showToast={showToast} save={save}
            cart={shopCart} setCart={setShopCart}
            cartOpen={shopCartOpen} setCartOpen={setShopCartOpen}
            onProductClick={(item) => setSelectedProduct(item)}
          />
        )}
        {page === "shop" && selectedProduct && (
          <ProductPage
            item={selectedProduct}
            cu={cu}
            onBack={() => setSelectedProduct(null)}
            cartCount={shopCart.reduce((s, i) => s + i.qty, 0)}
            onCartOpen={() => { setShopCartOpen(true); setSelectedProduct(null); }}
            onAddToCart={(item, variant, qty) => {
              const key = variant ? `${item.id}::${variant.id}` : item.id;
              const price = variant ? Number(variant.price) : (item.onSale && item.salePrice ? item.salePrice : item.price);
              const label = variant ? `${item.name} — ${variant.name}` : item.name;
              const availStock = variant ? Number(variant.stock) : item.stock;
              setShopCart(c => {
                const ex = c.find(x => x.key === key);
                const currentQty = ex ? ex.qty : 0;
                if (currentQty + qty > availStock) { showToast("Not enough stock", "red"); return c; }
                if (ex) return c.map(x => x.key === key ? { ...x, qty: x.qty + qty } : x);
                return [...c, { key, id: item.id, variantId: variant?.id || null, name: label, price, qty, noPost: item.noPost, stock: availStock }];
              });
              showToast(`${label} × ${qty} added to cart`);
            }}
          />
        )}
        {page === "leaderboard" && <LeaderboardPage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} />}
        {page === "gallery"     && <GalleryPage data={data} />}
        {page === "qa"          && <QAPage data={data} />}
        {page === "vip"         && <VipPage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} setPage={setPage} />}
        {page === "profile"     && cu  && <ProfilePage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} save={save} refresh={refreshCu} />}
        {page === "profile"     && !cu && <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Please log in to view your profile.</div>}
      </div>

      {/* FOOTER */}
      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-grid">
            {/* Brand col */}
            <div>
              <div className="pub-footer-logo">
                <div className="pub-footer-logo-box">ZA</div>
                <div className="pub-footer-logo-text">ZULU'S AIRSOFT</div>
              </div>
              <p className="pub-footer-desc">Premier airsoft venue. Experience tactical gameplay like never before.</p>
              <div className="pub-footer-social" style={{ marginTop:16 }}>
                {["📘","📸","▶️"].map((icon,i) => (
                  <button key={i} className="pub-footer-social-btn">{icon}</button>
                ))}
              </div>
            </div>
            {/* Quick Links */}
            <div>
              <div className="pub-footer-col-title">QUICK LINKS</div>
              {[
                ["Upcoming Events", "events"],
                ["Shop", "shop"],
                ["VIP Membership", "vip"],
                ["Gallery", "gallery"],
              ].map(([label, pg]) => (
                <button key={label} className="pub-footer-link" onClick={() => setPage(pg)}>{label}</button>
              ))}
            </div>
            {/* Information */}
            <div>
              <div className="pub-footer-col-title">INFORMATION</div>
              {[
                ["Sign Waiver", "profile"],
                ["Site Rules", "qa"],
                ["FAQ", "qa"],
              ].map(([label, pg]) => (
                <button key={label} className="pub-footer-link" onClick={() => setPage(pg)}>{label}</button>
              ))}
            </div>
            {/* Contact */}
            <div>
              <div className="pub-footer-col-title">CONTACT</div>
              <div className="pub-footer-contact">📍 Swindon, Wiltshire, UK</div>
              <div className="pub-footer-contact">📞 +44 1234 567890</div>
              <div className="pub-footer-contact">✉️ info@zulusairsoft.co.uk</div>
            </div>
          </div>
          <div className="pub-footer-bottom">
            <div className="pub-footer-copy">© {new Date().getFullYear()} Zulu's Airsoft. All rights reserved.</div>
            <div className="pub-footer-legal">Players must be 18+ or accompanied by adult. Valid ID required.</div>
          </div>
        </div>
      </footer>

      {authModal && (
        <SupabaseAuthModal
          mode={authModal} setMode={setAuthModal}
          onClose={() => setAuthModal(null)} showToast={showToast}
          onLogin={profile => { setCu(profile); refresh(); }}
        />
      )}
    </>
  );
}
