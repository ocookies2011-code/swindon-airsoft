import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { normaliseProfile } from "./api";
// jsQR is loaded via CDN in the QRScanner component — no import needed

// ── Mock Payment Button ───────────────────────────────────────────────
// Replace PayPalCheckoutButton with real payment provider when ready.
// Set VITE_PAYMENT_MODE=live in .env to hide the mock button.
// ── Markdown renderer ─────────────────────────────────────────
function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^## (.+)$/gm, "<div style='font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:900;color:#c8ff00;letter-spacing:.08em;text-transform:uppercase;display:block;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #2a3a10'>$1</div>")
    .replace(/^### (.+)$/gm, "<div style='font-family:\'Barlow Condensed\',sans-serif;font-size:14px;font-weight:800;color:#a0cc60;letter-spacing:.06em;text-transform:uppercase;display:block;margin:12px 0 4px'>$1</div>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#e8ffb0;font-weight:800'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em style='color:#aaa'>$1</em>")
    .replace(/^- (.+)$/gm, "<div style='display:flex;gap:8px;margin:4px 0;padding-left:4px'><span style='color:#c8ff00;flex-shrink:0;margin-top:1px'>▸</span><span>$1</span></div>")
    .replace(/^\d+\. (.+)$/gm, "<div style='margin:4px 0;padding-left:4px'>$1</div>")
    .replace(/^---$/gm, "<div style='border:none;border-top:1px solid #2a3a10;margin:14px 0;opacity:.6'></div>")
    .replace(/\n/g, "<br>");
}
function stockLabel(qty) {
  const n = Number(qty);
  if (n < 1)  return { text: "OUT OF STOCK", color: "var(--red)" };
  if (n < 10) return { text: "LOW STOCK",    color: "var(--gold)" };
  if (n < 20) return { text: "MED STOCK",    color: "#4fc3f7" };
  return        { text: "IN STOCK",      color: "var(--accent)" };
}




// ── Network error helper ─────────────────────────────────────
// Converts raw error messages into friendly UI text.
// NETWORK_TIMEOUT means the Supabase fetch was killed after 10s —
// most commonly happens when the browser resumes from sleep with
// stale TCP connections. Tell the user to try again.
function fmtErr(e) {
  if (!e) return "Unknown error";
  const msg = e.message || String(e);
  if (msg === "NETWORK_TIMEOUT" || msg.includes("NETWORK_TIMEOUT"))
    return "Request timed out — your connection may have dropped. Please try again.";
  if (msg.includes("JWT") || msg.includes("expired") || msg.includes("token"))
    return "Your session expired. Please refresh the page and log in again.";
  return msg;
}

// ── PayPal config — loaded dynamically from Supabase site_settings ──
// Fallback to env vars so local dev still works without DB rows.
let _paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "";
let _paypalMode = "sandbox"; // "live" | "sandbox"
let _paypalConfigLoaded = false;

async function loadPaypalConfig() {
  if (_paypalConfigLoaded) return;
  try {
    const [clientId, mode] = await Promise.all([
      api.settings.get("paypal_client_id"),
      api.settings.get("paypal_mode"),
    ]);
    if (clientId) _paypalClientId = clientId;
    if (mode === "live" || mode === "sandbox") _paypalMode = mode;
  } catch {}
  _paypalConfigLoaded = true;
}

function PayPalCheckoutButton({ amount, description, onSuccess, disabled }) {
  const [ppReady, setPpReady] = useState(false);
  const [ppError, setPpError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [clientId, setClientId] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);
  const containerRef = useRef(null);
  const rendered = useRef(false);

  // Load config from Supabase on mount
  useEffect(() => {
    loadPaypalConfig().then(() => {
      setClientId(_paypalClientId);
      setIsLive(_paypalMode === "live");
      setConfigLoaded(true);
    });
  }, []);

  // Load PayPal SDK once config is ready and mode is live
  useEffect(() => {
    if (!configLoaded || !isLive || !clientId) return;
    if (window.paypal) { setPpReady(true); return; }
    // Remove any old PayPal script to avoid double-loading
    const old = document.getElementById("paypal-sdk");
    if (old) old.remove();
    rendered.current = false;
    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=GBP`;
    script.onload = () => setPpReady(true);
    script.onerror = () => setPpError("PayPal failed to load. Check your Client ID in Admin → Settings.");
    document.head.appendChild(script);
  }, [configLoaded, isLive, clientId]);

  // Render PayPal buttons
  useEffect(() => {
    if (!isLive || !ppReady || !containerRef.current || rendered.current || disabled) return;
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
      onError: () => setPpError("Payment failed. Please try again."),
    }).render(containerRef.current);
  }, [ppReady, disabled, amount, isLive]);

  if (!configLoaded) {
    return <div style={{ color: "var(--muted)", fontSize: 12, padding: 8, marginTop: 12 }}>Loading payment options...</div>;
  }

  if (!isLive) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "#2d7a2d", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", letterSpacing: ".15em", fontFamily: "'Barlow Condensed',sans-serif", flexShrink: 0 }}>TEST MODE</span>
          <span style={{ fontSize: 11, color: "#5aab5a", fontFamily: "'Share Tech Mono',monospace" }}>Mock payments — no real money taken. Set PayPal to Live in Admin → Settings.</span>
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
          const scriptEl = document.createElement('script');
          scriptEl.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
          scriptEl.onload = resolve; scriptEl.onerror = reject;
          document.head.appendChild(scriptEl);
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

  // Guard: prevent concurrent loadAll calls from racing each other.
  // If one is already running, the next call is a no-op until it finishes.
  const loadingRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return; // already in progress — skip
    loadingRef.current = true;
    setLoadError(null);
    const emptyData = { events: [], shop: [], postageOptions: [], albums: [], qa: [], homeMsg: "", users: [], staff: [] };

    // Single top-level timeout — if the whole thing takes too long, unblock the UI
    const globalTimeout = setTimeout(() => {
      loadingRef.current = false;
      setData(prev => prev || emptyData);
      setLoading(false);
    }, 20000);

    // Retry up to 3 times with increasing delays to handle cold DB / Supabase wake-up
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [3000, 5000, 8000]; // ms to wait before each retry

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const isLastAttempt = attempt === MAX_RETRIES;

        // On retries, wait before trying again (gives DB time to wake up)
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
        }

        try {
          const errors = {};
          const safe = (key, p) => p.catch(e => { errors[key] = e.message; return []; });

          const [evList, shopList, postageList, albumList, qaList, staffList, homeMsg,
                 socialFacebook, socialInstagram, contactAddress, contactPhone, contactEmail,
                 contactDepartmentsRaw] = await Promise.all([
            safe("events",  api.events.getAll()),
            safe("shop",    api.shop.getAll()),
            safe("postage", api.postage.getAll()),
            safe("gallery", api.gallery.getAll()),
            safe("qa",      api.qa.getAll()),
            safe("staff",   api.staff.getAll()),
            api.settings.get("home_message").catch(() => ""),
            api.settings.get("social_facebook").catch(() => ""),
            api.settings.get("social_instagram").catch(() => ""),
            api.settings.get("contact_address").catch(() => ""),
            api.settings.get("contact_phone").catch(() => ""),
            api.settings.get("contact_email").catch(() => ""),
            api.settings.get("contact_departments").catch(() => ""),
          ]);

          // If all key collections came back empty and it's a partial error, treat as a cold-start failure
          const allEmpty = evList.length === 0 && shopList.length === 0 && staffList.length === 0;
          const hasErrors = Object.keys(errors).length > 0;

          if (hasErrors && allEmpty && !isLastAttempt) {
            // Data looks like a cold-start failure — retry
            console.warn(`loadAll attempt ${attempt + 1} got empty data with errors, retrying...`, errors);
            continue;
          }

          if (hasErrors) {
            const errSummary = Object.entries(errors).map(([k,v]) => `${k}: ${v}`).join(" | ");
            console.error("loadAll partial errors:", errSummary, errors);
            setLoadError(Object.values(errors)[0]);
          }

          setData(prev => ({
            ...(prev || emptyData),
            events: evList,
            shop: shopList,
            postageOptions: postageList,
            albums: albumList,
            qa: qaList,
            staff: staffList,
            homeMsg,
            socialFacebook,
            socialInstagram,
            contactAddress,
            contactPhone,
            contactEmail,
            contactDepartments: (() => { try { return JSON.parse(contactDepartmentsRaw || "[]"); } catch { return []; } })(),
          }));

          // Load profiles after public data — only succeeds when authed, silently skipped for guests
          api.profiles.getAll()
            .then(userList => {
              const profiles = userList.map(normaliseProfile);
              // Auto-expire any VIP members whose expiry date has passed
              const now = new Date();
              profiles.forEach(u => {
                if (u.vipStatus === "active" && u.vipExpiresAt && new Date(u.vipExpiresAt) < now) {
                  supabase.from('profiles').update({ vip_status: "expired" }).eq('id', u.id).catch(() => {});
                  u.vipStatus = "expired";
                }
              });
              setData(prev => prev ? { ...prev, users: profiles } : prev);
            })
            .catch(() => {}); // guests can't see profiles — that's fine

          clearTimeout(globalTimeout);
          setLoading(false);
          return; // success — exit retry loop
        } catch (e) {
          console.error(`loadAll attempt ${attempt + 1} critical error:`, e);
          if (isLastAttempt) {
            setLoadError(e.message);
            setData(prev => prev || emptyData);
          }
          // Otherwise loop continues to next retry
        }
      } // end retry loop
    } finally {
      // Always release the guard, even if something threw unexpectedly
      clearTimeout(globalTimeout);
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // When the tab becomes visible after being hidden:
  //  - Always force-release loadingRef (may have been frozen mid-fetch)
  //  - After 30s hidden, reload all data (stale content)
  //  - After 5min hidden, also re-validate the Supabase session
  //    (JWT may have expired; this forces a token refresh before next write)
  const lastHiddenRef = useRef(0);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenRef.current = Date.now();
        return;
      }
      // Always release the guard — a frozen async may have left it stuck
      loadingRef.current = false;

      const hiddenMs = Date.now() - lastHiddenRef.current;

      // Re-validate session if hidden for 5+ minutes.
      // Use refreshSession (not just getSession) so a stale JWT gets renewed
      // without the user being logged out.
      if (hiddenMs > 5 * 60 * 1000) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            // Session gone — try to recover via refresh_token
            const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
            if (storageKey) {
              try {
                const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
                if (raw?.refresh_token) {
                  supabase.auth.refreshSession({ refresh_token: raw.refresh_token }).catch(() => {});
                }
              } catch {}
            }
          }
        }).catch(() => {});
      }

      // Reload data if hidden for 30+ seconds
      if (hiddenMs > 30000) {
        loadAll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadAll]);

  // save() now delegates to specific API calls based on what changed
  const save = useCallback(async (patch) => {
    // Optimistic local update
    setData(prev => ({ ...prev, ...patch }));

    // homeMsg is written directly by AdminMessages — do NOT re-write here
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
      name: "name", email: "email", phone: "phone", address: "address", role: "role",
      gamesAttended: "games_attended", waiverSigned: "waiver_signed",
      waiverYear: "waiver_year", waiverData: "waiver_data", extraWaivers: "extra_waivers",
      waiverPending: "waiver_pending", vipStatus: "vip_status",
      vipApplied: "vip_applied", vipExpiresAt: "vip_expires_at", ukara: "ukara", credits: "credits",
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
.pub-nav-inner{max-width:1280px;margin:0 auto;padding:0 16px;height:var(--nav-h);display:flex;align-items:center;gap:0;position:relative;overflow:hidden;}
.pub-nav-logo{display:flex;align-items:center;gap:12px;cursor:pointer;margin-right:32px;flex-shrink:0;min-width:0;}
.pub-nav-logo-box{background:var(--accent);width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:900;color:#000;letter-spacing:.05em;border-radius:2px;flex-shrink:0;}
.pub-nav-logo-text{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;letter-spacing:.12em;color:#fff;text-transform:uppercase;white-space:nowrap;}
.pub-nav-logo-text span{color:var(--accent);}
.pub-nav-links{display:flex;gap:0;flex:1;}
.pub-nav-link{background:none;border:none;color:var(--muted);font-size:12px;font-weight:700;padding:0 16px;height:var(--nav-h);cursor:pointer;white-space:nowrap;letter-spacing:.12em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;transition:color .15s;}
.pub-nav-link:hover{color:#fff;}
.pub-nav-link.active{color:#fff;}
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
.ticker-wrap{overflow:hidden;background:#000;border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;padding:10px 24px;white-space:nowrap;position:relative;}
.ticker-wrap::before{content:'';position:absolute;left:0;top:0;bottom:0;width:60px;background:linear-gradient(90deg,#000,transparent);z-index:2;pointer-events:none;}
.ticker-wrap::after{content:'';position:absolute;right:0;top:0;bottom:0;width:60px;background:linear-gradient(270deg,#000,transparent);z-index:2;pointer-events:none;}
.ticker-track{display:inline-block;animation:ticker-bounce 22s ease-in-out infinite;}
.ticker-track:hover{animation-play-state:paused;}
.ticker-item{display:inline-flex;align-items:center;gap:12px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);white-space:nowrap;}
.ticker-sep{color:#333;font-size:18px;flex-shrink:0;}
@keyframes ticker-bounce{
  0%   { transform:translateX(0); }
  45%  { transform:translateX(calc(100vw - 100% - 80px)); }
  55%  { transform:translateX(calc(100vw - 100% - 80px)); }
  100% { transform:translateX(0); }
}

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
}
@media(max-width:700px){
  .feature-strip{grid-template-columns:1fr;}
}
@media(min-width:769px){
  .pub-nav-hamburger{display:none;}
  .bottom-nav{display:none;}
}
`
function Toast({ msg, type }) {
  return msg ? <div className={`toast toast-${type || "green"}`}>{msg}</div> : null;
}

function useMobile(bp = 640) {
  const [mobile, setMobile] = useState(() => window.innerWidth <= bp);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= bp);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return mobile;
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
    const clockInterval = setInterval(() => setTime(gmtNow()), 1000);
    return () => clearInterval(clockInterval);
  }, []);
  return <span className="mono" style={{ fontSize: 11, color: "var(--muted)", ...style }}>{time} GMT</span>;
}

// ── Countdown ─────────────────────────────────────────────
function Countdown({ target }) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const tick = () => setDiff(Math.max(0, new Date(target) - new Date()));
    tick();
    const tickInterval = setInterval(tick, 1000);
    return () => clearInterval(tickInterval);
  }, [target]);
  const diffDays = Math.floor(diff / 86400000);
  const diffHours = Math.floor((diff % 86400000) / 3600000);
  const diffMins = Math.floor((diff % 3600000) / 60000);
  const diffSecs = Math.floor((diff % 60000) / 1000);
  return (
    <div className="countdown-wrap">
      {[["DAYS", diffDays], ["HRS", diffHours], ["MIN", diffMins], ["SEC", diffSecs]].map(([l, n]) => (
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
      const qrScriptEl = document.createElement('script');
      qrScriptEl.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
      qrScriptEl.onload = () => resolve(true);
      qrScriptEl.onerror = () => resolve(false);
      document.head.appendChild(qrScriptEl);
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
    <div className="overlay" onClick={onClose} style={{ alignItems: "flex-start" }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ position: "sticky", top: 0 }}>
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
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));

  const sendReset = async () => {
    if (!form.email || !form.email.includes("@")) { showToast("Enter your email address first", "red"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (e) {
      showToast(e.message || "Failed to send reset email", "red");
    } finally { setBusy(false); }
  };

  const login = async () => {
    if (!form.email || !form.password) { showToast("Email and password required", "red"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (error) throw error;
      // Fetch profile — if this fails, still close the modal.
      // onAuthStateChange will also fire and set the user, so the UI will update either way.
      try {
        const profile = await api.profiles.getById(data.user.id);
        if (profile) onLogin(normaliseProfile(profile));
      } catch {
        // Profile fetch failed (e.g. timeout) — auth is still valid.
        // onAuthStateChange will recover the session on next render.
      }
      onClose();
    } catch (e) {
      showToast(e.message || "Login failed", "red");
      setBusy(false);
    }
  };

  const register = async () => {
    if (!form.name || !form.email || !form.password) { showToast("All fields required", "red"); return; }
    setBusy(true);
    try {
      await api.auth.signUp({ email: form.email, password: form.password, name: form.name, phone: form.phone });
      showToast("Account created! Check your email to confirm.");
      // Send welcome email
      sendWelcomeEmail({ name: form.name, email: form.email }).catch(() => {});
      onClose();
    } catch (e) {
      console.error("Registration error:", e);
      showToast(e.message || "Registration failed", "red");
    } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {resetMode ? (
          <>
            <div className="modal-title">🔑 Reset Password</div>
            {resetSent ? (
              <>
                <div className="alert alert-green" style={{ marginBottom: 16 }}>
                  ✅ Check your email — a reset link has been sent to <strong>{form.email}</strong>.
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Click the link in the email to set a new password. Check your spam folder if it doesn't arrive within a minute.</div>
                <button className="btn btn-ghost" onClick={() => { setResetMode(false); setResetSent(false); }}>← Back to Login</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Enter your email address and we'll send you a link to reset your password.</div>
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setField("email", e.target.value)} onKeyDown={e => e.key === "Enter" && sendReset()} autoFocus /></div>
                <div className="gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy} onClick={sendReset}>{busy ? "Sending…" : "Send Reset Link"}</button>
                  <button className="btn btn-ghost" onClick={() => setResetMode(false)}>← Back</button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="modal-title">{mode === "login" ? "🔐 Sign In" : "🎯 Create Account"}</div>
            {mode === "register" && (
              <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="John Smith" /></div>
            )}
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setField("email", e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => setField("password", e.target.value)} onKeyDown={e => e.key === "Enter" && (mode === "login" ? login() : register())} /></div>
            {mode === "register" && (
              <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="07700..." /></div>
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
            {mode === "login" && (
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px", color: "var(--muted)" }} onClick={() => setResetMode(true)}>
                  Forgot password?
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function WaiverModal({ cu, updateUser, onClose, showToast, editMode, existing, addPlayerMode }) {
  const TERMS = [
    "I understand that airsoft is a physical activity that carries inherent risks of injury.",
    "I will wear appropriate eye protection at all times during gameplay.",
    "I agree to follow all safety rules and marshal instructions.",
    "I confirm that I am at least 18 years of age or have parental/guardian consent.",
    "I will not consume alcohol or drugs before or during gameplay.",
    "I release Swindon Airsoft and its staff from liability for any injuries sustained during play.",
    "I understand that my participation is voluntary and at my own risk.",
    "I agree to treat all participants with respect and follow the site's code of conduct.",
    "I confirm that any replica firearms I bring to the site are legal to own in the UK.",
    "I understand that failure to comply with safety rules may result in removal from the site.",
  ];

  const blankForm = (prefill) => ({
    name: prefill?.name || "", dob: prefill?.dob || "",
    addr1: prefill?.addr1 || "", addr2: prefill?.addr2 || "",
    city: prefill?.city || "", county: prefill?.county || "",
    postcode: prefill?.postcode || "", country: prefill?.country || "United Kingdom",
    emergencyName: prefill?.emergencyName || "", emergencyPhone: prefill?.emergencyPhone || "",
    medical: prefill?.medical || "", isChild: prefill?.isChild || false,
    guardian: prefill?.guardian || "", sigData: prefill?.sigData || "", agreed: false,
  });

  const existingData = editMode && existing ? existing : {};
  const buildInitialWaivers = () => {
    if (addPlayerMode) {
      // Pre-load all existing waivers + one new blank for the new player
      const existingWaivers = [cu.waiverData, ...(cu.extraWaivers || [])].map(w => blankForm(w));
      return [...existingWaivers, blankForm()];
    }
    if (editMode) {
      // Load ALL waivers (primary + extras) for editing
      return [cu.waiverData, ...(cu.extraWaivers || [])].map(w => blankForm(w));
    }
    return [blankForm({
      name: existingData.name || cu?.name || "", dob: existingData.dob || "",
      addr1: e.addr1 || "", addr2: e.addr2 || "",
      city: e.city || "", county: e.county || "",
      postcode: e.postcode || "", country: e.country || "United Kingdom",
      emergencyName: e.emergencyName || "", emergencyPhone: e.emergencyPhone || "",
      medical: e.medical || "", isChild: e.isChild || false, guardian: e.guardian || "",
    })];
  };
  const [waivers, setWaivers] = useState(buildInitialWaivers);
  const [activeIdx, setActiveIdx] = useState(addPlayerMode ? (cu.extraWaivers ? cu.extraWaivers.length + 1 : 1) : 0);
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  const fw = (k, v) => setWaivers(ws => ws.map((w, i) => i === activeIdx ? { ...w, [k]: v } : w));
  const active = waivers[activeIdx];

  const addWaiver = () => { setWaivers(ws => [...ws, blankForm()]); setActiveIdx(waivers.length); };
  const removeWaiver = (idx) => {
    if (waivers.length === 1) return;
    setWaivers(ws => ws.filter((_, i) => i !== idx));
    setActiveIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (active.sigData) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = active.sigData;
    }
  }, [activeIdx]);

  const getPos = (ev, canvas) => {
    const canvasRect = canvas.getBoundingClientRect();
    const src = ev.touches ? ev.touches[0] : ev;
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return { x: (src.clientX - canvasRect.left) * scaleX, y: (src.clientY - canvasRect.top) * scaleY };
  };
  const startDraw = (ev) => { ev.preventDefault(); const canvasEl = canvasRef.current; const ctx = canvasEl.getContext("2d"); const canvasPos = getPos(ev, c); ctx.beginPath(); ctx.moveTo(canvasPos.x, canvasPos.y); setDrawing(true); };
  const draw = (ev) => { if (!drawing) return; ev.preventDefault(); const canvasEl = canvasRef.current; const ctx = canvasEl.getContext("2d"); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#c8ff00"; const canvasPos = getPos(ev, c); ctx.lineTo(canvasPos.x, canvasPos.y); ctx.stroke(); };
  const endDraw = () => { if (!drawing) return; setDrawing(false); fw("sigData", canvasRef.current.toDataURL()); };
  const clearSig = () => { canvasRef.current.getContext("2d").clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); fw("sigData", ""); };

  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    for (let waiverIdx = 0; waiverIdx < waivers.length; waiverIdx++) {
      const waiverItem = waivers[i];
      if (!waiverItem.name)  { showToast(`Waiver ${i+1}: Full name required`, "red"); setActiveIdx(i); return; }
      if (!waiverItem.dob)   { showToast(`Waiver ${i+1}: Date of birth required`, "red"); setActiveIdx(i); return; }
      if (!w.addr1 || !w.city || !w.postcode) { showToast(`Waiver ${i+1}: Address required`, "red"); setActiveIdx(i); return; }
      if (!w.emergencyName || !w.emergencyPhone) { showToast(`Waiver ${i+1}: Emergency contact required`, "red"); setActiveIdx(i); return; }
      if (!w.sigData) { showToast(`Waiver ${i+1}: Signature required`, "red"); setActiveIdx(i); return; }
      if (!w.agreed) { showToast(`Waiver ${i+1}: Please agree to the terms`, "red"); setActiveIdx(i); return; }
      if (w.isChild && !w.guardian) { showToast(`Waiver ${i+1}: Guardian name required`, "red"); setActiveIdx(i); return; }
    }
    const primary = { ...waivers[0], signed: true, date: new Date().toISOString() };
    const extras = waivers.slice(1).map(w => ({ ...w, signed: true, date: new Date().toISOString() }));
    setSubmitting(true);
    try {
      if (editMode) {
        await updateUser(cu.id, {
          waiverData: primary,
          extraWaivers: extras,
          waiverPending: null,
        });
        showToast(extras.length > 0 ? `${waivers.length} waivers updated!` : "Waiver updated!");
      } else {
        await updateUser(cu.id, { waiverSigned: true, waiverYear: new Date().getFullYear(), waiverData: primary, waiverPending: null, extraWaivers: extras });
        showToast(extras.length > 0 ? `${waivers.length} waivers signed!` : "Waiver signed successfully!");
      }
      onClose();
    } catch (e) {
      showToast("Failed to save waiver: " + (e.message || "Unknown error. Please try again."), "red");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose} style={{ alignItems: "flex-start", paddingTop: 0 }}>
      <div className="modal-box wide" onClick={ev => ev.stopPropagation()} style={{ maxWidth: 780, margin: "0 auto", borderRadius: 0, minHeight: "100vh" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, paddingBottom:16, borderBottom:"1px solid #1a1a1a" }}>
          <span style={{ fontSize:26 }}>📋</span>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:24, letterSpacing:".05em", textTransform:"uppercase" }}>
              PLAYER <span style={{ color:"var(--accent)" }}>WAIVER</span>
            </div>
            <div style={{ fontSize:11, color:"var(--muted)", letterSpacing:".1em" }}>VALID UNTIL 31 DECEMBER {new Date().getFullYear()}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"none", border:"none", color:"var(--muted)", fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        {/* Important notice */}
        <div className="alert alert-gold" style={{ marginBottom:20, display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight:700, marginBottom:2 }}>Important Notice</div>
            <div style={{ fontSize:13 }}>You must sign this waiver before participating in any game day. Waivers are valid for the current calendar year and expire on December 31st.</div>
          </div>
        </div>

        {/* Player tabs */}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
          {waivers.map((w, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:0 }}>
              <button onClick={() => setActiveIdx(i)}
                style={{ padding:"6px 14px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".08em", textTransform:"uppercase",
                  background: activeIdx === i ? "var(--accent)" : "#1a1a1a", color: activeIdx === i ? "#000" : "var(--muted)",
                  border:"1px solid " + (activeIdx === i ? "var(--accent)" : "#333"), borderRadius:"2px 0 0 2px", cursor:"pointer" }}>
                {w.name || `Player ${i+1}`}
              </button>
              {i > 0 && (
                <button onClick={() => removeWaiver(i)}
                  style={{ padding:"6px 8px", background: activeIdx === i ? "var(--accent)" : "#1a1a1a", color: activeIdx === i ? "#000" : "#666",
                    border:"1px solid " + (activeIdx === i ? "var(--accent)" : "#333"), borderLeft:"none", borderRadius:"0 2px 2px 0", cursor:"pointer", fontSize:11 }}>✕</button>
              )}
              {i === 0 && <div style={{ borderRadius:"0 2px 2px 0" }} />}
            </div>
          ))}
          <button onClick={addWaiver}
            style={{ padding:"6px 14px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".08em", textTransform:"uppercase",
              background:"none", color:"var(--accent)", border:"1px dashed var(--accent)", borderRadius:2, cursor:"pointer", marginLeft:4 }}>
            + Add Player
          </button>
        </div>

        {/* T&C box */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", borderRadius:4, padding:20, marginBottom:20 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, letterSpacing:".12em", color:"var(--accent)", textTransform:"uppercase", marginBottom:12 }}>
            TERMS &amp; CONDITIONS
          </div>
          <div style={{ maxHeight:170, overflowY:"auto", paddingRight:4 }}>
            <p style={{ fontSize:13, color:"#ccc", marginBottom:10 }}>By signing this waiver, I acknowledge and agree to the following:</p>
            {TERMS.map((t, i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom:7, fontSize:13, color:"#aaa", lineHeight:1.5 }}>
                <span style={{ color:"var(--accent)", fontWeight:700, flexShrink:0, minWidth:18 }}>{i+1}.</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Under 18 */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", borderRadius:4, padding:14, marginBottom:16, display:"flex", gap:12, alignItems:"flex-start" }}>
          <input type="checkbox" id={`wchild-${activeIdx}`} checked={active.isChild} onChange={ev => fw("isChild", ev.target.checked)}
            style={{ width:18, height:18, marginTop:2, accentColor:"var(--accent)", flexShrink:0 }} />
          <div>
            <label htmlFor={`wchild-${activeIdx}`} style={{ cursor:"pointer", fontWeight:700, fontSize:14 }}>⏱ I am under 18 years old</label>
            <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>If under 18, a parent or legal guardian must also sign.</div>
          </div>
        </div>
        {active.isChild && (
          <div className="form-group" style={{ marginBottom:16 }}>
            <label>Parent/Guardian Full Name *</label>
            <input value={active.guardian} onChange={ev => fw("guardian", ev.target.value)} placeholder="Type full name as guardian signature" />
          </div>
        )}

        {/* Personal details */}
        <div className="form-row" style={{ marginBottom:12 }}>
          <div className="form-group"><label>FULL LEGAL NAME *</label><input value={active.name} onChange={ev => fw("name", ev.target.value)} /></div>
          <div className="form-group"><label>DATE OF BIRTH *</label><input type="date" value={active.dob} onChange={ev => fw("dob", ev.target.value)} /></div>
        </div>

        {/* Address */}
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase", marginBottom:8 }}>ADDRESS</div>
        <div className="form-group" style={{ marginBottom:10 }}><label>ADDRESS LINE 1 *</label><input value={active.addr1} onChange={ev => fw("addr1", ev.target.value)} /></div>
        <div className="form-group" style={{ marginBottom:10 }}><label>ADDRESS LINE 2</label><input value={active.addr2} onChange={ev => fw("addr2", ev.target.value)} /></div>
        <div className="form-row" style={{ marginBottom:10 }}>
          <div className="form-group"><label>CITY *</label><input value={active.city} onChange={ev => fw("city", ev.target.value)} /></div>
          <div className="form-group"><label>COUNTY</label><input value={active.county} onChange={ev => fw("county", ev.target.value)} /></div>
        </div>
        <div className="form-row" style={{ marginBottom:16 }}>
          <div className="form-group"><label>POSTCODE *</label><input value={active.postcode} onChange={ev => fw("postcode", ev.target.value)} /></div>
          <div className="form-group"><label>COUNTRY</label><input value={active.country} onChange={ev => fw("country", ev.target.value)} /></div>
        </div>

        {/* Emergency contact */}
        <div className="form-row" style={{ marginBottom:16 }}>
          <div className="form-group"><label>EMERGENCY CONTACT NAME *</label><input value={active.emergencyName} onChange={ev => fw("emergencyName", ev.target.value)} /></div>
          <div className="form-group"><label>EMERGENCY CONTACT PHONE *</label><input value={active.emergencyPhone} onChange={ev => fw("emergencyPhone", ev.target.value)} /></div>
        </div>

        {/* Medical */}
        <div className="form-group" style={{ marginBottom:16 }}>
          <label>MEDICAL CONDITIONS</label>
          <textarea rows={2} value={active.medical} onChange={ev => fw("medical", ev.target.value)} placeholder="List any relevant conditions, or leave blank if none" />
        </div>

        {/* Signature */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
            <label style={{ fontWeight:700, fontSize:11, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>✏️ SIGNATURE *</label>
            <button onClick={clearSig} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18, padding:4 }} title="Clear">↺</button>
          </div>
          <canvas ref={canvasRef} width={700} height={150}
            style={{ width:"100%", background:"#0d0d0d", border:"1px solid #333", borderRadius:4, cursor:"crosshair", touchAction:"none", display:"block" }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>Draw your signature above using mouse or touch</div>
        </div>

        {/* Agree */}
        <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:20, padding:14, background:"#111", border:"1px solid #2a2a2a", borderRadius:4 }}>
          <input type="checkbox" id={`wagree-${activeIdx}`} checked={active.agreed} onChange={ev => fw("agreed", ev.target.checked)}
            style={{ width:18, height:18, marginTop:2, accentColor:"var(--accent)", flexShrink:0 }} />
          <label htmlFor={`wagree-${activeIdx}`} style={{ cursor:"pointer", fontSize:13, lineHeight:1.6 }}>
            I have read and agree to the terms and conditions above. I understand that this waiver is legally binding and will be valid until December 31st of this year.
          </label>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-primary" style={{ flex:1, padding:"12px", fontSize:14, letterSpacing:".1em" }} onClick={submit} disabled={submitting}>
            {submitting ? "SAVING…" : editMode ? "SUBMIT CHANGES" : `SIGN WAIVER${waivers.length > 1 ? ` (${waivers.length} PLAYERS)` : ""}`}
          </button>
          <button className="btn btn-ghost" style={{ padding:"12px 18px" }} onClick={onClose} disabled={submitting}>Cancel</button>
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
    { id: "about", label: "About", icon: "ℹ️" },
    { id: "staff", label: "Staff", icon: "🪖" },
    { id: "contact", label: "Contact", icon: "✉️" },
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
            <div className="pub-nav-logo-box">SA</div>
            <span className="pub-nav-logo-text">SWINDON <span>AIRSOFT</span></span>
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
            SWINDON <span style={{ color: "var(--accent)" }}>AIRSOFT</span>
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
  const isMobile = useMobile(700);
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
          <div className="ticker-track">
            <span className="ticker-item">
              <span style={{ color:"var(--accent)", fontSize:16 }}>⚡</span>
              {data.homeMsg}
              <span style={{ color:"var(--accent)", fontSize:16 }}>⚡</span>
            </span>
          </div>
        </div>
      )}

      {/* HERO */}
      <div className="hero-bg">
        <div className="hero-bg-img" style={{ backgroundImage:"url('https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1600&q=80&auto=format&fit=crop')" }} />
        <div className="hero-bg-grad" />
        <div style={{ maxWidth:1280, margin:"0 auto", width:"100%", position:"relative", zIndex:1, padding:"0 24px" }}>
          <div className="hero-content">
            {/* ── MILITARY BANNER ── */}
            <div style={{ width:"100%", marginBottom:16 }}>
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

                  {/* SWINDON — large lime stencil */}
                  <text x="320" y="155" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="72" fontWeight="900"
                    fill="none" stroke="#c8ff00" strokeWidth="2.5"
                    letterSpacing=".08em" opacity=".3">
                    SWINDON
                  </text>
                  <text x="320" y="155" textAnchor="middle"
                    fontFamily="'Barlow Condensed',sans-serif" fontSize="72" fontWeight="900"
                    fill="#c8ff00" letterSpacing=".08em"
                    style={{ filter:"drop-shadow(0 0 12px rgba(200,255,0,.6))" }}>
                    SWINDON
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
          <div style={{ background:"#0a0a0a", padding:"24px" }}>
            <div style={{ maxWidth:1100, margin:"0 auto", position:"relative",
              background:"#111", border:"1px solid #2a2a2a",
              padding:"0" }}>
              {/* bracket corners — top-left */}
              <div style={{ position:"absolute", top:0, left:0, width:16, height:16,
                borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
              {/* bracket corners — bottom-right */}
              <div style={{ position:"absolute", bottom:0, right:0, width:16, height:16,
                borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
              {/* MISSION BRIEFING header */}
              <div style={{ background:"var(--accent)", padding:"6px 16px", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:10, letterSpacing:".4em", color:"#000", fontWeight:800 }}>MISSION BRIEFING</span>
                <span style={{ marginLeft:"auto", fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"rgba(0,0,0,.6)", letterSpacing:".1em" }}>
                  OP-{(nextEvent.id || "ALPHA").slice(0,8).toUpperCase()}
                </span>
              </div>
              <div className="countdown-panel" style={{ border:"none", borderRadius:0, padding:"24px" }}>
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
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:16, padding: isMobile ? "24px 16px" : "40px 24px", maxWidth:1200, margin:"0 auto" }}>
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
                      <div style={{ position:"absolute", top:12, left:12, display:"flex", flexDirection:"column", gap:4 }}>
                        <span style={{ background:"var(--accent)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>SKIRMISH</span>
                        {ev.vipOnly && <span style={{ background:"var(--gold)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>⭐ VIP ONLY</span>}
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
              {data.shop.filter(p => p.published !== false).slice(0, 4).map(prod => {
                const hasV = prod.variants?.length > 0;
                const lowestVariant = hasV ? Math.min(...prod.variants.map(v => Number(v.price))) : null;
                const displayPrice = hasV
                  ? lowestVariant
                  : (prod.onSale && prod.salePrice ? prod.salePrice : prod.price);
                const priceLabel = hasV ? `From £${displayPrice}` : `£${Number(displayPrice).toFixed(2)}`;
                return (
                <div key={prod.id} className="shop-card" onClick={() => setPage("shop")} style={{ cursor:"pointer" }}>
                  <div className="shop-img">
                    {prod.image ? <img src={prod.image} alt={prod.name} /> : <span style={{ fontSize:32, opacity:.3 }}>📦</span>}
                  </div>
                  <div className="shop-body">
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:".12em", color:"var(--muted)", textTransform:"uppercase", fontFamily:"'Barlow Condensed',sans-serif", marginBottom:4 }}>{prod.category || "GEAR"}</div>
                    <div style={{ fontWeight:700, fontSize:14, marginBottom:6, color:"#fff" }}>{prod.name}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)" }}>{priceLabel}</div>
                  </div>
                </div>
                );
              })}
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
    const countdownInterval = setInterval(tick, 1000);
    return () => clearInterval(countdownInterval);
  }, [target]);
  const cdDays = Math.floor(diff / 86400000);
  const cdHours = Math.floor((diff % 86400000) / 3600000);
  const cdMins = Math.floor((diff % 3600000) / 60000);
  const cdSecs = Math.floor((diff % 60000) / 1000);
  return (
    <>
      {[["DAYS", cdDays], ["HRS", cdHours], ["MIN", cdMins], ["SEC", cdSecs]].map(([l, n]) => (
        <div className="countdown-panel-unit" key={l}>
          <div className="countdown-panel-num">{String(n).padStart(2, "0")}</div>
          <div className="countdown-panel-lbl">{l}</div>
        </div>
      ))}
    </>
  );
}

// ── Events Page ───────────────────────────────────────────
// ── Send Ticket Email ────────────────────────────────────────
// ── EmailJS shared helper ────────────────────────────────────
const EMAILJS_SERVICE_ID  = "service_np4zvqs";
const EMAILJS_TEMPLATE_ID = "template_d84acm9";
const EMAILJS_PUBLIC_KEY  = "jC6heZ9LvgHiaHTFq";
async function sendEmail({ toEmail, toName, subject, htmlContent }) {
  if (!toEmail) throw new Error("No email address");
  if (!window.emailjs) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email:     toEmail,
    to_name:      toName || "",
    subject:      subject,
    html_content: htmlContent,
  });
}

async function sendTicketEmail({ cu, ev, bookings, extras }) {
  const extrasText = Object.entries(extras || {}).filter(([,v])=>v>0).map(([k,v])=>`${k} ×${v}`).join(", ") || "None";
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  const totalPaid = bookings.reduce((s, b) => s + (b.total || 0), 0);

  const ticketRows = bookings.map(b => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(b.id||'ticket')}`;
    return `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px 24px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;">
        <div>
          <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:6px;">TICKET</div>
          <div style="font-size:20px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:.05em;">${b.type === "walkOn" ? "Walk-On" : "Rental"}</div>
          <div style="font-size:13px;color:#aaa;margin-top:4px;">Qty: ${b.qty}${b.total > 0 ? ` · £${(b.total||0).toFixed(2)}` : ' · Complimentary'}</div>
          <div style="font-size:10px;color:#555;margin-top:8px;font-family:monospace;">REF: ${(b.id||"").slice(0,8).toUpperCase()}</div>
        </div>
        <div style="text-align:center;">
          <div style="background:#fff;padding:8px;border-radius:4px;display:inline-block;">
            <img src="${qrUrl}" width="120" height="120" alt="QR Code" />
          </div>
          <div style="font-size:10px;color:#888;margin-top:4px;">Show on arrival</div>
        </div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #333;font-size:12px;color:#888;">
        📱 <strong style="color:#ccc;">To save this ticket:</strong> Screenshot this email, or use your email app's print/save option. Your QR code above is all you need for check-in.
      </div>
    </div>`;
  }).join("");

  const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
      <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Booking Confirmation</div>
    </div>
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">EVENT</div>
      <div style="font-size:22px;font-weight:900;color:#fff;">${ev.title}</div>
      <div style="font-size:14px;color:#aaa;margin-top:6px;">📅 ${dateStr}</div>
      <div style="font-size:14px;color:#aaa;margin-top:2px;">🕐 ${ev.time || ""} GMT</div>
      <div style="font-size:14px;color:#aaa;margin-top:2px;">📍 ${ev.location || ""}</div>
    </div>
    <div style="margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:10px;">YOUR TICKETS</div>
      ${ticketRows}
    </div>
    ${extrasText !== "None" ? `<div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:6px;">GAME DAY EXTRAS</div>
      <div style="font-size:14px;color:#ddd;">${extrasText}</div>
    </div>` : ""}
    ${totalPaid > 0 ? `<div style="background:#e05c00;border-radius:8px;padding:16px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:13px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.08em;">Total Paid</div>
      <div style="font-size:24px;font-weight:900;color:#fff;">£${totalPaid.toFixed(2)}</div>
    </div>` : ""}
    <div style="background:#111;border:1px solid #333;border-left:3px solid #e05c00;border-radius:4px;padding:16px 24px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#aaa;margin-bottom:8px;">IMPORTANT</div>
      <ul style="font-size:13px;color:#ccc;padding-left:18px;line-height:2;">
        <li>Show your QR code on arrival for check-in</li>
        <li>Arrive 30 minutes before start time</li>
        <li>Mandatory eye protection must be worn at all times</li>
        <li>Under 18s must have signed parental consent</li>
      </ul>
    </div>
    <div style="text-align:center;font-size:11px;color:#444;padding-top:16px;border-top:1px solid #1a1a1a;">Swindon Airsoft</div>
  </div>`;

  await sendEmail({
    toEmail:     cu.email || "",
    toName:      cu.name || "Player",
    subject:     `🎯 Booking Confirmed — ${ev.title}`,
    htmlContent,
  });
}


// ── Send Welcome/Registration Email ──────────────────────────
async function sendWelcomeEmail({ name, email }) {
  const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
      <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Welcome to the Team</div>
    </div>
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;">
      <div style="font-size:22px;font-weight:900;margin-bottom:12px;">Hey ${name}! 👋</div>
      <p style="font-size:14px;color:#ccc;line-height:1.8;">Your account has been created. You're now part of the Swindon Airsoft community.</p>
      <p style="font-size:14px;color:#ccc;line-height:1.8;margin-top:8px;">Here's what to do next:</p>
      <ul style="font-size:13px;color:#ccc;padding-left:18px;line-height:2.2;margin-top:8px;">
        <li>Sign your liability waiver in your profile</li>
        <li>Browse upcoming events and book your slot</li>
        <li>Attend 3 games to qualify for VIP membership</li>
      </ul>
    </div>
    <div style="background:#e05c00;border-radius:8px;padding:16px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:14px;font-weight:700;color:#fff;">See you on the field, soldier. 🎯</div>
    </div>
    <div style="text-align:center;font-size:11px;color:#444;padding-top:16px;border-top:1px solid #1a1a1a;">Swindon Airsoft</div>
  </div>`;

  await sendEmail({
    toEmail:     email,
    toName:      name,
    subject:     "Welcome to Swindon Airsoft! 🎯",
    htmlContent,
  });
}

// ── Send Order Confirmation Email ─────────────────────────────
async function sendOrderEmail({ cu, order, items, postageName }) {
  const itemRows = (items || []).map(i => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:13px;color:#ddd;">${i.name}${i.variant ? ` — ${i.variant}` : ""}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:13px;color:#aaa;text-align:center;">${i.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:13px;color:#e05c00;text-align:right;">£${(Number(i.price)*i.qty).toFixed(2)}</td>
    </tr>`).join("");

  const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
      <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Order Confirmation</div>
    </div>
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">ORDER #${(order.id||"").slice(0,8).toUpperCase()}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;font-size:11px;letter-spacing:.1em;color:#666;padding:8px 12px;border-bottom:1px solid #333;text-transform:uppercase;">Item</th>
          <th style="text-align:center;font-size:11px;letter-spacing:.1em;color:#666;padding:8px 12px;border-bottom:1px solid #333;text-transform:uppercase;">Qty</th>
          <th style="text-align:right;font-size:11px;letter-spacing:.1em;color:#666;padding:8px 12px;border-bottom:1px solid #333;text-transform:uppercase;">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="padding:10px 12px;display:flex;justify-content:space-between;font-size:13px;color:#aaa;border-bottom:1px solid #222;">
        <span>Postage (${postageName || "Standard"})</span>
        <span>£${Number(order.postage||0).toFixed(2)}</span>
      </div>
      <div style="padding:12px;display:flex;justify-content:space-between;font-size:16px;font-weight:900;color:#fff;">
        <span>TOTAL PAID</span>
        <span style="color:#e05c00;">£${Number(order.total||0).toFixed(2)}</span>
      </div>
    </div>
    ${order.customerAddress ? `<div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">SHIPPING TO</div>
      <div style="font-size:13px;color:#ccc;white-space:pre-line;">${order.customerAddress}</div>
    </div>` : ""}
    <div style="background:#111;border:1px solid #333;border-left:3px solid #e05c00;border-radius:4px;padding:14px 20px;margin-bottom:20px;font-size:13px;color:#aaa;">
      We'll notify you when your order is dispatched. Allow 3–5 working days for delivery.
    </div>
    <div style="text-align:center;font-size:11px;color:#444;padding-top:16px;border-top:1px solid #1a1a1a;">Swindon Airsoft</div>
  </div>`;

  await sendEmail({
    toEmail,
    toName:      cu.name || "Customer",
    subject:     `✅ Order Confirmed #${(order.id||"").slice(0,8).toUpperCase()}`,
    htmlContent,
  });
}

// ── Send Order Dispatch Email ─────────────────────────────────
async function sendDispatchEmail({ toEmail, toName, order, items, tracking }) {
  const itemRows = (items || []).map(i => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:13px;color:#ddd;">${i.name}${i.variant ? ` — ${i.variant}` : ""}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:13px;color:#aaa;text-align:center;">${i.qty}</td>
    </tr>`).join("");

  const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
      <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Order Dispatched</div>
    </div>
    <div style="background:#1a2808;border:1px solid #2a3a10;border-radius:8px;padding:20px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">📦</div>
      <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.08em;text-transform:uppercase;">Your order is on its way!</div>
      <div style="font-size:13px;color:#8aaa60;margin-top:8px;">Order #${(order.id||"").slice(0,8).toUpperCase()}</div>
    </div>
    ${itemRows ? `<div style="background:#111;border:1px solid #222;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:12px;">ITEMS DISPATCHED</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;font-size:11px;letter-spacing:.1em;color:#666;padding:8px 12px;border-bottom:1px solid #333;text-transform:uppercase;">Item</th>
          <th style="text-align:center;font-size:11px;letter-spacing:.1em;color:#666;padding:8px 12px;border-bottom:1px solid #333;text-transform:uppercase;">Qty</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>` : ""}
    ${order.customerAddress ? `<div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#e05c00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">SHIPPING TO</div>
      <div style="font-size:13px;color:#ccc;white-space:pre-line;">${order.customerAddress}</div>
    </div>` : ""}
    ${tracking ? `<div style="background:#1a2808;border:1px solid #2a3a10;border-radius:8px;padding:16px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#c8ff00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">📮 TRACKING NUMBER</div>
      <div style="font-size:18px;font-weight:900;color:#fff;font-family:monospace;letter-spacing:.08em;">${tracking}</div>
    </div>` : ""}
    <div style="background:#111;border:1px solid #333;border-left:3px solid #c8ff00;border-radius:4px;padding:14px 20px;margin-bottom:20px;font-size:13px;color:#aaa;">
      Allow 3–5 working days for delivery. If you have any questions reply to this email or contact us through the website.
    </div>
    <div style="text-align:center;font-size:11px;color:#444;padding-top:16px;border-top:1px solid #1a1a1a;">Swindon Airsoft</div>
  </div>`;

  await sendEmail({
    toEmail,
    toName:      toName || "Customer",
    subject:     `📦 Your Order Has Been Dispatched — #${(order.id||"").slice(0,8).toUpperCase()}`,
    htmlContent,
  });
}

// ── Send New Event Announcement Email ────────────────────────
async function sendNewEventEmail({ ev, users }) {
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const timeStr = ev.endTime ? `${ev.time}–${ev.endTime} GMT` : ev.time ? `${ev.time} GMT` : "";
  const lowestPrice = Math.min(
    Number(ev.walkOnPrice) || 0,
    Number(ev.rentalPrice) || 0
  );

  const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:0;font-family:Arial,sans-serif;color:#e0e0e0;">

    <!-- Top accent bar -->
    <div style="height:3px;background:#c8ff00;"></div>

    <!-- Header -->
    <div style="background:#0d0d0d;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;padding:28px 32px;text-align:center;">
      <div style="font-size:11px;letter-spacing:.3em;color:#c8ff00;text-transform:uppercase;margin-bottom:10px;font-weight:700;">◈ NEW EVENT</div>
      <div style="font-size:34px;font-weight:900;letter-spacing:.08em;color:#fff;line-height:1;">SWINDON <span style="color:#c8ff00;">AIRSOFT</span></div>
      <div style="font-size:10px;color:#3a3a3a;letter-spacing:.25em;margin-top:6px;text-transform:uppercase;">FIELD INTELLIGENCE</div>
    </div>

    <!-- Banner / title block -->
    ${ev.banner ? `<div style="background:#111;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;"><img src="${ev.banner}" style="width:100%;display:block;max-height:260px;object-fit:cover;opacity:.85;" alt="${ev.title}" /></div>` : ""}

    <!-- Event title -->
    <div style="background:#0d1300;border:1px solid #1a2808;border-top:none;padding:28px 32px;">
      <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:10px;font-weight:700;">MISSION BRIEFING</div>
      <div style="font-size:30px;font-weight:900;letter-spacing:.05em;color:#e8f0d8;text-transform:uppercase;line-height:1.1;margin-bottom:20px;">${ev.title}</div>

      <!-- Key details grid -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">DATE</div>
            <div style="font-size:14px;font-weight:700;color:#c8ff00;">${dateStr}</div>
          </td>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-left:none;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">TIME</div>
            <div style="font-size:14px;font-weight:700;color:#4fc3f7;">${timeStr || "TBC"}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-top:none;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">LOCATION</div>
            <div style="font-size:14px;font-weight:700;color:#ce93d8;">${ev.location || "Swindon Airsoft Field"}</div>
          </td>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-top:none;border-left:none;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">FROM</div>
            <div style="font-size:22px;font-weight:900;color:#c8ff00;line-height:1;">£${lowestPrice.toFixed(2)}</div>
          </td>
        </tr>
      </table>

      <!-- Description -->
      ${ev.description ? `
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:8px;font-weight:700;">BRIEFING NOTES</div>
        <div style="font-size:13px;color:#8aaa60;line-height:1.8;">${ev.description.replace(/\n/g, "<br>")}</div>
      </div>` : ""}

      <!-- Pricing breakdown -->
      <div style="background:#0a0f06;border:1px solid #1a2808;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:12px;font-weight:700;">TICKET PRICES</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #1a2808;font-size:13px;color:#b0c090;">🎯 Walk-On</td>
            <td style="padding:8px 0;border-bottom:1px solid #1a2808;font-size:16px;font-weight:900;color:#c8ff00;text-align:right;">£${Number(ev.walkOnPrice||0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#b0c090;">🪖 Rental Package</td>
            <td style="padding:8px 0;font-size:16px;font-weight:900;color:#c8ff00;text-align:right;">£${Number(ev.rentalPrice||0).toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <!-- Max players -->
      ${ev.maxPlayers ? `<div style="font-size:11px;color:#3a5010;text-align:center;margin-bottom:20px;letter-spacing:.1em;">⚠ LIMITED TO ${ev.maxPlayers} PLAYERS — BOOK EARLY</div>` : ""}

      <!-- CTA -->
      <div style="text-align:center;margin-top:8px;">
        <a href="https://swindonairsoft.co.uk/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK YOUR SLOT →</a>
      </div>
    </div>

    <!-- Rules reminder -->
    <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;padding:20px 32px;">
      <div style="font-size:8px;letter-spacing:.25em;color:#2a2a2a;text-transform:uppercase;margin-bottom:10px;">FIELD RULES</div>
      <table style="width:100%;border-collapse:collapse;">
        ${["Full-seal eye protection mandatory at all times","Arrive 30 minutes before start time","Under 18s require signed parental consent","All players must have a valid waiver on file"].map(rule => `
        <tr><td style="padding:5px 0;font-size:12px;color:#3a3a3a;"><span style="color:#c8ff00;margin-right:8px;">▸</span>${rule}</td></tr>`).join("")}
      </table>
    </div>

    <!-- Bottom bar -->
    <div style="height:1px;background:#1a1a1a;"></div>
    <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;padding:16px 32px;text-align:center;">
      <div style="font-size:9px;color:#2a2a2a;letter-spacing:.2em;text-transform:uppercase;">SWINDON AIRSOFT · swindonairsoft.co.uk</div>
      <div style="font-size:9px;color:#1e1e1e;margin-top:4px;letter-spacing:.1em;">You're receiving this because you have an account. Log in to manage your preferences.</div>
    </div>
    <div style="height:3px;background:#1a2808;"></div>
  </div>`;

  const recipients = (users || []).filter(u => u.email && u.role !== "admin");
  const results = { sent: 0, failed: 0, errors: [] };
  for (const u of recipients) {
    try {
      await sendEmail({
        toEmail:     u.email,
        toName:      u.name || "Player",
        subject:     `🎯 New Event: ${ev.title} — ${dateStr}`,
        htmlContent,
      });
      results.sent++;
      // Small delay to avoid rate-limiting
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      results.failed++;
      results.errors.push(`${u.email}: ${e.message}`);
    }
  }
  return results;
}

function EventsPage({ data, cu, updateEvent, updateUser, showToast, setAuthModal, save, setPage }) {
  const getInitDetail = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="events" && p[1] ? p[1] : null;
  };
  const [detail, setDetailState] = useState(getInitDetail);
  const setDetail = (id) => {
    setDetailState(id);
    window.location.hash = id ? "events/" + id : "events";
  };
  const [waiverModal, setWaiverModal] = useState(false);
  const [tab, setTab] = useState("info");
  const [paypalError, setPaypalError] = useState(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [useCredits, setUseCredits] = useState(false);

  // ── Booking cart: { walkOn: qty, rental: qty, extras: { [id]: qty } }
  const [bCart, setBCart] = useState({ walkOn: 0, rental: 0, extras: {} });

  const ev = detail ? data.events.find(e => e.id === detail) : null;

  const resetCart = () => { setBCart({ walkOn: 0, rental: 0, extras: {} }); setUseCredits(false); };

  if (ev) {
    const vipDisc   = cu?.vipStatus === "active" ? 0.1 : 0;
    const waiverValid = (cu?.waiverSigned === true && cu?.waiverYear === new Date().getFullYear()) || cu?.role === "admin";
    const myBookings  = cu ? ev.bookings.filter(b => b.userId === cu.id) : [];

    // Per-type slots remaining
    const walkOnBooked = ev.bookings.filter(b => b.type === "walkOn").reduce((s,b) => s + b.qty, 0);
    const rentalBooked = ev.bookings.filter(b => b.type === "rental").reduce((s,b) => s + b.qty, 0);
    const walkOnLeft   = ev.walkOnSlots - walkOnBooked;
    const rentalLeft   = ev.rentalSlots - rentalBooked;
    const totalBooked  = walkOnBooked + rentalBooked;
    const totalSlots   = ev.walkOnSlots + ev.rentalSlots;

    // Cart totals
    // VIP discount: 10% on 1 ticket only (cheapest first), but NOT when using credits
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
    const availCredits = cu?.credits || 0;
    // Determine if VIP discount can apply: only when NOT using credits
    const vipDiscActive = vipDisc > 0 && !useCredits;
    // VIP discount applies to 1 ticket only — cheapest ticket gets the discount
    const walkOnUnitPrice = ev.walkOnPrice;
    const rentalUnitPrice = ev.rentalPrice;
    const totalTickets = bCart.walkOn + bCart.rental;
    let vipSavings = 0;
    let walkOnTotal = bCart.walkOn * walkOnUnitPrice;
    let rentalTotal = bCart.rental * rentalUnitPrice;
    if (vipDiscActive && totalTickets > 0) {
      // Apply discount to 1 ticket — whichever type was added (walkOn first, then rental)
      if (bCart.walkOn > 0) {
        const saving = walkOnUnitPrice * 0.1;
        walkOnTotal = (bCart.walkOn * walkOnUnitPrice) - saving;
        vipSavings = saving;
      } else if (bCart.rental > 0) {
        const saving = rentalUnitPrice * 0.1;
        rentalTotal = (bCart.rental * rentalUnitPrice) - saving;
        vipSavings = saving;
      }
    }
    const grandTotal   = walkOnTotal + rentalTotal + extrasTotal;
    const cartEmpty    = bCart.walkOn === 0 && bCart.rental === 0 && extrasTotal === 0;
    const creditsApplied = useCredits ? Math.min(availCredits, grandTotal) : 0;
    const payTotal     = Math.max(0, grandTotal - creditsApplied);
    const setExtra = (id, qty, variantId) => {
      const extraKeyVal = extraKey(id, variantId);
      setBCart(p => {
        const next = { ...p.extras };
        if (qty > 0) next[extraKeyVal] = Math.max(0, qty); else delete next[extraKeyVal];
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

        // ── Stock check: verify extras haven't sold out between cart and payment ──
        const extrasToCheck = Object.entries(extrasSnapshot).filter(([,qty]) => qty > 0);
        if (extrasToCheck.length > 0) {
          const productIds = [...new Set(extrasToCheck.map(([key]) => {
            const [extraId] = key.includes(":") ? key.split(":") : [key, null];
            return visibleExtras.find(e => e.id === extraId)?.productId;
          }).filter(Boolean))];

          if (productIds.length > 0) {
            const { data: freshProducts } = await supabase
              .from('shop_products').select('id, stock, variants').in('id', productIds);

            const stockInsufficient = extrasToCheck.find(([key, qty]) => {
              const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
              const extra = visibleExtras.find(e => e.id === extraId);
              if (!extra?.productId) return false;
              const product = (freshProducts || []).find(p => p.id === extra.productId);
              if (!product) return false;
              if (variantId) {
                const variants = Array.isArray(product.variants) ? product.variants : [];
                const variant = variants.find(v => v.id === variantId);
                return !variant || Number(variant.stock) < qty;
              }
              return Number(product.stock) < qty;
            });

            if (stockInsufficient) {
              const [key] = stockInsufficient;
              const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
              const extra = visibleExtras.find(e => e.id === extraId);
              const name = extra?.name || "an item";
              clearTimeout(safety);
              setBookingBusy(false);
              setPaypalError(`Sorry — ${name}${variantId ? " (selected variant)" : ""} just sold out while you were paying. Your payment has been taken — please contact us immediately with your PayPal reference (${paypalOrder.id}) and we will refund or substitute.`);
              return;
            }
          }
        }

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

        // Deduct credits if used
        if (creditsApplied > 0) {
          const newCredits = Math.max(0, availCredits - creditsApplied);
          await supabase.from('profiles').update({ credits: newCredits }).eq('id', cu.id);
          updateUser(cu.id, { credits: newCredits });
        }

        // Show success immediately — stock deduction and refresh happen in background
        resetCart();
        showToast("🎉 Booked! Payment confirmed." + (creditsApplied > 0 ? ` £${creditsApplied.toFixed(2)} credits used.` : ""));

        // Send ticket email with real booking IDs
        try {
          const { data: freshBookings } = await supabase
            .from('bookings').select('id, type, qty, total')
            .eq('user_id', cu.id).eq('event_id', ev.id)
            .order('created_at', { ascending: false }).limit(2);
          const emailBookings = (freshBookings || []).map(b => ({ id: b.id, type: b.type, qty: b.qty, total: b.total }));
          if (emailBookings.length > 0) {
            await sendTicketEmail({ cu, ev, bookings: emailBookings, extras: Object.fromEntries(Object.entries(bCart.extras).filter(([,v]) => v > 0)) });
            showToast("📧 Confirmation email sent!");
          } else {
            console.warn("No bookings found for email");
          }
        } catch (emailErr) {
          console.error("Ticket email failed:", emailErr);
          showToast("Booking confirmed but email failed: " + (emailErr?.message || String(emailErr)), "gold");
        }

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

    const bookingBlocked = !cu || !waiverValid || cartEmpty || (ev.vipOnly && cu?.vipStatus !== "active");

    return (
      <div className="page-content">
        <button className="btn btn-ghost btn-sm mb-2" onClick={() => { setDetail(null); setTab("info"); resetCart(); }}>← Back to Events</button>

        {/* Banner */}
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
          <div style={{ height:160, background:"linear-gradient(135deg,#150e08,#111827)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {ev.banner ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" /> : <span style={{ fontSize:28, fontWeight:900, color:"var(--accent)" }}>{ev.title}</span>}
          </div>
          {/* Military-style header */}
          <div style={{
            background:"linear-gradient(135deg,#0d1400 0%,#111 60%,#0a1000 100%)",
            padding:"18px 22px 16px",
            position:"relative",
            overflow:"hidden",
          }}>
            {/* Hex watermark */}
            <div style={{ position:"absolute", right:16, top:8, fontSize:36, opacity:.05, letterSpacing:4, color:"#c8ff00", pointerEvents:"none" }}>⬡⬡⬡⬡⬡</div>
            {/* Corner brackets */}
            {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
              <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:2,
                top:v==="top"?6:"auto", bottom:v==="bottom"?6:"auto",
                left:h==="left"?6:"auto", right:h==="right"?6:"auto",
                borderTop:v==="top"?"2px solid #c8ff00":"none",
                borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
                borderLeft:h==="left"?"2px solid #c8ff00":"none",
                borderRight:h==="right"?"2px solid #c8ff00":"none",
              }} />
            ))}
            <div style={{ fontSize:9, letterSpacing:".22em", color:"#c8ff00", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:8, display:"flex", gap:10, alignItems:"center" }}>
              <span>⬡ SWINDON AIRSOFT</span>
              <span style={{ color:"#3a5010" }}>◆</span>
              <span style={{ color:"#4a6820" }}>OPERATION BRIEFING</span>
              {myBookings.length > 0 && <span style={{ marginLeft:"auto", background:"rgba(0,100,0,.3)", border:"1px solid #c8ff00", color:"#c8ff00", fontSize:9, padding:"2px 10px", letterSpacing:".15em" }}>✓ DEPLOYED</span>}
            </div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, textTransform:"uppercase", letterSpacing:".05em", color:"#e8ffb0", lineHeight:1, marginBottom:10, textShadow:"0 0 30px rgba(200,255,0,.1)" }}>
              {ev.title}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
              {[
                { icon:"📅", val:ev.date, color:"#c8ff00" },
                { icon:"⏱", val: ev.endTime ? `${ev.time}–${ev.endTime} GMT` : `${ev.time} GMT`, color:"#4fc3f7" },
                { icon:"📍", val:ev.location, color:"#ce93d8" },
              ].map(({icon,val,color}) => (
                <span key={val} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".12em", color, background:"rgba(0,0,0,.4)", border:`1px solid ${color}33`, padding:"3px 10px" }}>
                  {icon} {val}
                </span>
              ))}
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:11, letterSpacing:".1em", color: totalBooked/totalSlots > 0.8 ? "#ff6b6b" : "#6a8a40", padding:"3px 0", marginLeft:4 }}>
                {totalBooked}/{totalSlots} SLOTS
              </span>
            </div>
            {/* Styled progress bar */}
            <div style={{ height:4, background:"#1a2a08", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:Math.min(100, totalBooked/totalSlots*100)+"%", background: totalBooked/totalSlots > 0.8 ? "#ff6b6b" : "#c8ff00", boxShadow: totalBooked/totalSlots > 0.8 ? "0 0 8px #ff6b6b" : "0 0 8px rgba(200,255,0,.5)", borderRadius:2, transition:"width .4s" }} />
            </div>
          </div>
        </div>

        <div className="nav-tabs">
          {["info","map"].map(t => <button key={t} className={`nav-tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
        </div>

        {tab === "info" && (
          <div>
            {/* Description */}
            <div style={{ marginBottom:16, position:"relative", overflow:"hidden",
              background:"radial-gradient(ellipse at 10% 20%,rgba(45,70,15,.45) 0%,transparent 45%),radial-gradient(ellipse at 85% 80%,rgba(30,55,8,.35) 0%,transparent 40%),#0b1007",
              border:"1px solid #2a3a10" }}>
              {/* Scanlines */}
              <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)" }} />
              {/* Corner brackets */}
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:2,
                  top:v==="top"?7:"auto", bottom:v==="bottom"?7:"auto",
                  left:h==="left"?7:"auto", right:h==="right"?7:"auto",
                  borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
                  borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
                }} />
              ))}
              {/* Header strip */}
              <div style={{ background:"linear-gradient(135deg,rgba(8,18,2,.97) 0%,rgba(14,26,4,.92) 100%)", borderBottom:"1px solid #2a3a10", padding:"10px 18px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:10, letterSpacing:".22em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ OPERATION BRIEFING</span>
                <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#4a6820" }}>INTEL DOCUMENT</span>
              </div>
              {/* Content */}
              <div style={{ position:"relative", zIndex:1, padding:"16px 18px", color:"#8aaa50", lineHeight:1.8, fontSize:14 }}
                dangerouslySetInnerHTML={{ __html: renderMd(ev.description) || "<span style='color:#3a5010'>No briefing available.</span>" }}
              />
            </div>

            {/* ── BOOKING CARD ── */}
            <div style={{ position:"relative", overflow:"hidden",
              background:"radial-gradient(ellipse at 15% 25%,rgba(45,70,15,.5) 0%,transparent 42%),radial-gradient(ellipse at 80% 75%,rgba(30,55,8,.4) 0%,transparent 38%),#0b1007",
              border:"1px solid #2a3a10" }}>
              {/* Scanlines */}
              <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)" }} />
              {/* Corner brackets */}
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:3,
                  top:v==="top"?7:"auto", bottom:v==="bottom"?7:"auto",
                  left:h==="left"?7:"auto", right:h==="right"?7:"auto",
                  borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
                  borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
                }} />
              ))}
              {/* Header strip */}
              <div style={{ background:"linear-gradient(135deg,rgba(8,18,2,.97) 0%,rgba(14,26,4,.92) 100%)", borderBottom:"1px solid #2a3a10", padding:"10px 18px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:10, letterSpacing:".22em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ BOOK THIS EVENT</span>
                <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#4a6820" }}>SWINDON AIRSOFT</span>
              </div>
              <div style={{ position:"relative", zIndex:1, padding:"16px 18px" }}>

              {!cu && <div className="alert alert-gold mb-2">You must be <button className="btn btn-sm btn-ghost" style={{ marginLeft:4 }} onClick={() => setAuthModal("login")}>logged in</button> to book.</div>}
              {cu && !waiverValid && <div className="alert alert-red mb-2">⚠️ Waiver required. <button className="btn btn-sm btn-ghost" style={{ marginLeft:8 }} onClick={() => setWaiverModal(true)}>Sign Waiver</button></div>}
              {ev.vipOnly && cu?.vipStatus !== "active" && (
                <div className="alert alert-gold mb-2" style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:18 }}>⭐</span>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"var(--gold)", letterSpacing:".06em" }}>VIP MEMBERS ONLY EVENT</div>
                    <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>
                      {!cu ? "Log in and" : "You need to"} become a VIP member to book this event.{" "}
                      <button className="btn btn-sm btn-ghost" style={{ padding:"2px 8px", fontSize:11 }} onClick={() => setPage("vip")}>Learn about VIP →</button>
                    </div>
                  </div>
                </div>
              )}
              {cu?.vipStatus === "active" && <div className="alert alert-gold mb-2">⭐ VIP 10% discount applied</div>}

              {/* Existing bookings */}
              {myBookings.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:9, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, marginBottom:8 }}>YOUR EXISTING BOOKINGS</div>
                  {myBookings.map(b => (
                    <div key={b.id} style={{
                      marginBottom:10, position:"relative", overflow:"hidden",
                      background:"radial-gradient(ellipse at 15% 30%,rgba(45,70,15,.5) 0%,transparent 45%),radial-gradient(ellipse at 80% 70%,rgba(30,55,8,.4) 0%,transparent 40%),#0b1007",
                      border:"1px solid #2a3a10",
                    }}>
                      {/* Scanlines */}
                      <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)" }} />
                      {/* Corner brackets */}
                      {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                        <div key={v+h} style={{ position:"absolute", width:10, height:10, zIndex:2,
                          top:v==="top"?5:"auto", bottom:v==="bottom"?5:"auto",
                          left:h==="left"?5:"auto", right:h==="right"?5:"auto",
                          borderTop:v==="top"?"1px solid #c8ff00":"none", borderBottom:v==="bottom"?"1px solid #c8ff00":"none",
                          borderLeft:h==="left"?"1px solid #c8ff00":"none", borderRight:h==="right"?"1px solid #c8ff00":"none",
                        }} />
                      ))}
                      {/* Header strip */}
                      <div style={{ background:"linear-gradient(135deg,rgba(8,18,2,.95) 0%,rgba(14,26,4,.9) 100%)", borderBottom:"1px dashed #2a3a10", padding:"7px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:9, letterSpacing:".2em", color:"#c8ff00", textTransform:"uppercase" }}>⬡ SWINDON AIRSOFT · FIELD PASS</span>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, letterSpacing:".15em", color:"#c8ff00", background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", padding:"1px 8px" }}>✓ DEPLOYED</span>
                      </div>
                      {/* Body */}
                      <div style={{ position:"relative", zIndex:1, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                        <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:"8px 12px" }}>
                          {[
                            ["KIT", b.type === "walkOn" ? "Walk-On" : "Rental"],
                            ["UNITS", `×${b.qty}`],
                            ["LEVY", b.total > 0 ? `£${b.total.toFixed(2)}` : "N/A"],
                            ["REF", b.id.slice(0,8).toUpperCase()],
                          ].map(([lbl,val]) => (
                            <div key={lbl}>
                              <div style={{ fontSize:7, letterSpacing:".2em", color:"#4a6820", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:2 }}>{lbl}</div>
                              <div style={{ fontSize:13, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", color:"#c8e878" }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderLeft:"1px dashed #2a3a10", paddingLeft:12, textAlign:"center", flexShrink:0 }}>
                          <div style={{ background:"#0a0f05", border:"1px solid #2a3a10", padding:5, display:"inline-block" }}>
                            <QRCode value={b.id} size={56} />
                          </div>
                          <div style={{ fontSize:7, color:"#4a6820", marginTop:3, letterSpacing:".15em", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase" }}>Scan in</div>
                        </div>
                      </div>
                      {/* Footer barcode */}
                      <div style={{ background:"rgba(4,8,1,.8)", borderTop:"1px solid #1a2808", padding:"4px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontSize:7, color:"#283810", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>MISSION ID: {b.id.toUpperCase()}</div>
                        <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
                          {Array.from({length:20},(_,i) => <div key={i} style={{ background:"#2a3a10", width:i%3===0?2:1, height:3+Math.abs(Math.sin(i*1.4)*7), borderRadius:1 }} />)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── TICKET BUILDER ── */}
              <div style={{ border:"1px solid #2a3a10", marginBottom:16, background:"rgba(4,8,1,.5)" }}>
                <div style={{ background:"linear-gradient(90deg,rgba(8,18,2,.98) 0%,rgba(12,22,3,.95) 100%)", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, borderBottom:"1px solid #2a3a10", display:"flex", alignItems:"center", gap:8 }}>
                  <span>◈ ADD TICKETS TO ORDER</span>
                  <div style={{ flex:1, borderTop:"1px dashed #2a3a10" }} />
                </div>

                {/* Walk-On row */}
                {ev.vipOnly && cu?.vipStatus !== "active" && (
                  <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--muted)", fontSize:13 }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>⭐</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, color:"var(--gold)", fontSize:16, letterSpacing:".06em", marginBottom:4 }}>VIP MEMBERS ONLY</div>
                    <div>Booking is restricted to VIP members for this event.</div>
                    <button className="btn btn-primary" style={{ marginTop:14, padding:"9px 24px" }} onClick={() => setPage("vip")}>Become a VIP →</button>
                  </div>
                )}
                {(!ev.vipOnly || cu?.vipStatus === "active") && <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:"1px solid #2a3a10", background:"rgba(200,255,0,.02)" }}>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🎯 Walk-On</div>
                    <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
                      £{ev.walkOnPrice}{vipDisc > 0 ? ` → £${(ev.walkOnPrice*(1-vipDisc)).toFixed(2)} VIP` : ""} · {walkOnLeft} slots left
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid #2a3a10", background:"#0a0f05" }}>
                    <button onClick={() => setWalkOn(bCart.walkOn - 1)} disabled={bCart.walkOn === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.walkOn===0?.4:1 }}>−</button>
                    <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.walkOn>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.walkOn}</span>
                    <button onClick={() => setWalkOn(bCart.walkOn + 1)} disabled={walkOnLeft === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: walkOnLeft===0?.4:1 }}>+</button>
                  </div>
                </div>}

                {/* Rental row */}
                {(!ev.vipOnly || cu?.vipStatus === "active") && <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom: ev.extras.length > 0 ? "1px solid #1a1a1a" : "none" }}>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#fff" }}>🪖 Rental Package</div>
                    <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>
                      £{ev.rentalPrice}{vipDisc > 0 ? ` → £${(ev.rentalPrice*(1-vipDisc)).toFixed(2)} VIP` : ""} · {rentalLeft} slots left
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:0, border:"1px solid #2a3a10", background:"#0a0f05" }}>
                    <button onClick={() => setRental(bCart.rental - 1)} disabled={bCart.rental === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: bCart.rental===0?.4:1 }}>−</button>
                    <span style={{ padding:"0 14px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, color: bCart.rental>0?"var(--accent)":"var(--text)", minWidth:36, textAlign:"center" }}>{bCart.rental}</span>
                    <button onClick={() => setRental(bCart.rental + 1)} disabled={rentalLeft === 0} style={{ background:"none", border:"none", color:"var(--text)", padding:"8px 14px", fontSize:18, cursor:"pointer", opacity: rentalLeft===0?.4:1 }}>+</button>
                  </div>
                </div>}

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
                                    <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginLeft:8 }}>{stockLabel(stock).text}</span>
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
                          const extraQty = getExtraQty(ex.id, v.id);
                          return (
                            <div key={ex.id + ":" + v.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                              <span className="text-muted">{ex.name} — {v.name} ×{extraQty}</span>
                              <span>£{(extraQty * Number(v.price)).toFixed(2)}</span>
                            </div>
                          );
                        });
                    }
                    const extraQty = getExtraQty(ex.id, null);
                    if (!extraQty) return [];
                    const livePrice = lp ? lp.price : ex.price;
                    return [(
                      <div key={ex.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                        <span className="text-muted">{ex.name} ×{extraQty}</span>
                        <span>£{(extraQty * Number(livePrice)).toFixed(2)}</span>
                      </div>
                    )];
                  })}
                  {vipDisc > 0 && !cartEmpty && (
                    <div style={{ fontSize:11, color: useCredits ? "var(--muted)" : "var(--gold)", marginBottom:8, padding:"6px 10px", background: useCredits ? "rgba(255,255,255,.03)" : "rgba(200,160,0,.06)", border:"1px solid", borderColor: useCredits ? "#2a2a2a" : "rgba(200,160,0,.2)", borderRadius:3 }}>
                      {useCredits
                        ? "⚠️ VIP discount is not applied when using credits"
                        : totalTickets > 1
                          ? `★ VIP discount: 10% off 1 ticket (−£${vipSavings.toFixed(2)}). Full price applies to remaining ${totalTickets - 1} ticket${totalTickets - 1 > 1 ? "s" : ""}.`
                          : `★ VIP 10% discount applied — saving £${vipSavings.toFixed(2)}`
                      }
                    </div>
                  )}
                  {/* Credits toggle */}
                  {cu && availCredits > 0 && !cartEmpty && (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", background:"rgba(0,120,255,.06)", border:"1px solid rgba(0,120,255,.2)", borderRadius:3, marginTop:4, marginBottom:4 }}>
                      <div>
                        <span style={{ fontSize:12, color:"#60a0ff" }}>💳 Account Credits — £{availCredits.toFixed(2)} available</span>
                        {vipDisc > 0 && <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>Note: using credits disables the VIP discount</div>}
                      </div>
                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                        <input type="checkbox" checked={useCredits} onChange={e => setUseCredits(e.target.checked)} />
                        <span style={{ fontSize:11, color:"var(--muted)" }}>Apply</span>
                      </label>
                    </div>
                  )}
                  {creditsApplied > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4, color:"#60a0ff" }}>
                      <span>Credits applied</span>
                      <span>−£{creditsApplied.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ borderTop:"1px solid #2a2a2a", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, color:"#fff" }}>
                    <span>TOTAL</span>
                    <span style={{ color:"var(--accent)" }}>£{payTotal.toFixed(2)}</span>
                  </div>
                  {creditsApplied > 0 && payTotal === 0 && (
                    <div style={{ fontSize:11, color:"var(--muted)", textAlign:"center", marginTop:4 }}>Fully covered by credits — no payment needed</div>
                  )}
                </div>
              )}

              {cartEmpty && cu && waiverValid && (
                <div style={{ textAlign:"center", padding:"20px 0", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>
                  ▸ Select tickets above to proceed
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
              {!bookingBlocked && payTotal > 0 && (
                <PayPalCheckoutButton
                  amount={payTotal}
                  description={`${ev.title} — ${[bCart.walkOn>0 && `${bCart.walkOn}x Walk-On`, bCart.rental>0 && `${bCart.rental}x Rental`].filter(Boolean).join(", ")}`}
                  onSuccess={confirmBookingAfterPayment}
                  disabled={bookingBusy}
                />
              )}
              {!bookingBlocked && payTotal === 0 && !cartEmpty && (
                <button className="btn btn-primary" style={{ width:"100%", padding:"13px", fontSize:14, letterSpacing:".1em" }}
                  disabled={bookingBusy}
                  onClick={() => confirmBookingAfterPayment({ id: "CREDITS-" + Date.now(), status: "COMPLETED" })}>
                  {bookingBusy ? "⏳ Confirming…" : "✓ CONFIRM — FULLY COVERED BY CREDITS"}
                </button>
              )}
              </div>
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
                <div style={{ fontSize:12, color:"var(--muted)" }}>{ev.date} · {ev.time}{ev.endTime ? `–${ev.endTime}` : ""} GMT</div>
              </div>
              <a href={(() => {
  // Extract exact coordinates from the map embed (most precise)
  if (ev.mapEmbed) {
    const srcMatch = ev.mapEmbed.match(/src="([^"]+)"/);
    if (srcMatch) {
      const embedUrl = decodeURIComponent(srcMatch[1]);
      // Google Maps embed pb= format: !2d<longitude>!3d<latitude>
      const coordMatch = embedUrl.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      if (coordMatch) {
        return `https://www.google.com/maps/dir/?api=1&destination=${coordMatch[2]},${coordMatch[1]}`;
      }
      // q= param (place name or coords)
      const qMatch = embedUrl.match(/[?&]q=([^&]+)/);
      if (qMatch) {
        return `https://www.google.com/maps/dir/?api=1&destination=${qMatch[1]}`;
      }
    }
  }
  // Fall back to location text field
  if (ev.location && ev.location.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.location.trim())}`;
  }
  return `https://www.google.com/maps/search/Swindon+Airsoft+Field`;
})()} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
  <button className="btn btn-primary" style={{ padding:"9px 20px", fontSize:13 }}>🗺️ Get Directions</button>
</a>
            </div>
          </div>
        )}

        {waiverModal && <WaiverModal cu={cu} updateUser={updateUser} onClose={() => setWaiverModal(false)} showToast={showToast} editMode={waiverModal === "edit"} existing={cu.waiverData} addPlayerMode={waiverModal === "addPlayer"} />}
      </div>
    );
  }

  // ── Event list ──
  const publishedEvents = data.events.filter(e => e.published);
  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      {/* Header */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:1100, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — ACTIVE OPERATIONS — ◈</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            UPCOMING <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>OPERATIONS</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>▸ SELECT A MISSION AND REPORT FOR DUTY ◂</div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 16px 80px" }}>
        {publishedEvents.length === 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>NO OPERATIONS SCHEDULED — CHECK BACK SOON</div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
          {publishedEvents.map((ev, idx) => {
            const booked = ev.bookings.reduce((s,b) => s + b.qty, 0);
            const total  = ev.walkOnSlots + ev.rentalSlots;
            const fillPct = total > 0 ? booked / total : 0;
            const isFull = fillPct >= 1;
            const isAlmostFull = fillPct >= 0.8;
            const operationCodes = ["ALPHA","BRAVO","CHARLIE","DELTA","ECHO","FOXTROT","GOLF","HOTEL"];
            const opCode = operationCodes[idx % operationCodes.length];
            return (
              <div key={ev.id}
                onClick={() => { setDetail(ev.id); setTab("info"); resetCart(); }}
                style={{
                  background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden",
                  cursor:"pointer", position:"relative", transition:"border-color .15s, transform .15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-3px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}
              >
                {/* Scanlines */}
                <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents:"none", zIndex:5 }} />
                {/* Corner brackets */}
                {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                  <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:6,
                    top:v==="top"?6:"auto", bottom:v==="bottom"?6:"auto",
                    left:h==="left"?6:"auto", right:h==="right"?6:"auto",
                    borderTop:v==="top"?"1px solid #c8ff00":"none", borderBottom:v==="bottom"?"1px solid #c8ff00":"none",
                    borderLeft:h==="left"?"1px solid #c8ff00":"none", borderRight:h==="right"?"1px solid #c8ff00":"none",
                    opacity:.5,
                  }} />
                ))}

                {/* Banner image */}
                <div style={{ height:180, background:"#080a06", overflow:"hidden", position:"relative" }}>
                  {ev.banner
                    ? <img src={ev.banner} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.8)", transition:"transform .3s" }}
                        onMouseOver={e => e.currentTarget.style.transform="scale(1.03)"}
                        onMouseOut={e => e.currentTarget.style.transform=""} alt="" />
                    : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#0c1009,#080a06)", gap:8 }}>
                        <div style={{ fontSize:36, opacity:.1 }}>🎯</div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#1e2c0a" }}>NO IMAGERY CLASSIFIED</div>
                      </div>
                  }
                  {/* Gradient overlay */}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:60, background:"linear-gradient(to top,rgba(12,16,9,1),transparent)", zIndex:2 }} />
                  {/* Top ID strip */}
                  <div style={{ position:"absolute", top:0, left:0, right:0, background:"rgba(0,0,0,.7)", borderBottom:"1px solid rgba(200,255,0,.15)", padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:3 }}>
                    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#c8ff00", opacity:.7 }}>SA · OP-{opCode}</span>
                    <div style={{ display:"flex", gap:4 }}>
                      <span style={{ background:"#c8ff00", color:"#000", fontSize:8, fontWeight:900, padding:"2px 8px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".12em" }}>SKIRMISH</span>
                      {ev.vipOnly && <span style={{ background:"#c8a000", color:"#000", fontSize:8, fontWeight:900, padding:"2px 8px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".12em" }}>★ VIP</span>}
                    </div>
                  </div>
                  {/* Full badge */}
                  {isFull && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:4 }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".2em", color:"#ef4444", border:"2px solid #ef4444", padding:"6px 18px", transform:"rotate(-5deg)" }}>FULLY DEPLOYED</div>
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div style={{ padding:"14px 14px 0", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:".08em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1.1, marginBottom:10 }}>{ev.title}</div>
                  {/* Data rows */}
                  <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
                    {[
                      { icon:"▸", label:"DATE", val:ev.date, color:"#c8ff00" },
                      { icon:"▸", label:"TIME", val:`${ev.time}${ev.endTime ? `–${ev.endTime}` : ""} GMT`, color:"#4fc3f7" },
                      { icon:"▸", label:"LOCATION", val:ev.location, color:"#ce93d8" },
                    ].map(row => (
                      <div key={row.label} style={{ display:"flex", gap:8, alignItems:"baseline" }}>
                        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"#2a3a10", flexShrink:0, width:58 }}>{row.label}</span>
                        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, fontWeight:700, color:"#6a8050", letterSpacing:".04em" }}>{row.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Capacity bar */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"#2a3a10" }}>CAPACITY</span>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color: isAlmostFull ? "#ef4444" : "#3a5010", letterSpacing:".1em" }}>{booked}/{total} SLOTS</span>
                    </div>
                    <div style={{ height:3, background:"#0a0f06", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.min(100, fillPct*100)}%`, background: isAlmostFull ? "#ef4444" : "#c8ff00", boxShadow: isAlmostFull ? "0 0 6px #ef4444" : "0 0 6px rgba(200,255,0,.5)", borderRadius:2, transition:"width .4s" }} />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.3)", position:"relative", zIndex:6 }}>
                  <div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".15em", color:"#2a3a10", marginBottom:2 }}>FROM</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"#c8ff00", lineHeight:1 }}>
                      £{Math.min(ev.walkOnPrice, ev.rentalPrice)}
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ padding:"8px 20px", fontSize:11, letterSpacing:".18em", borderRadius:0 }}>
                    ▸ DEPLOY
                  </button>
                </div>

                {/* Barcode strip */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"4px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".08em" }}>
                    {ev.id ? ev.id.slice(0,12).toUpperCase() : "------------"}
                  </div>
                  <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
                    {Array.from({length:22},(_,i) => (
                      <div key={i} style={{ background:"#1a2808", width:i%3===0?2:1, height:3+Math.abs(Math.sin(i*1.9)*5), borderRadius:1 }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
      showToast("✅ Order confirmed! Thank you.");
      try {
        const cartSnapshot = [...cart];
        sendOrderEmail({
          cu,
          order: { id: paypalOrder.id, postage: postageTotal, total: grandTotal, customerAddress: cu.address || "" },
          items: cartSnapshot.map(i => ({ name: i.name, variant: i.variantName || "", price: i.price, qty: i.qty })),
          postageName: hasNoPost ? "Collection Only" : (postage?.name || ""),
        }).catch(() => {});
      } catch (emailErr) { console.warn("Order email failed:", emailErr); }
      setCart([]); setCartOpen(false);
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

  const [shopCatFilter, setShopCatFilter] = useState("");
  const allShopCategories = useMemo(() => {
    const cats = [...new Set((data.shop || []).map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [data.shop]);
  const filteredShop = shopCatFilter ? (data.shop || []).filter(p => p.category === shopCatFilter) : (data.shop || []);

  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      {/* Header */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:1100, margin:"0 auto", position:"relative", zIndex:1, display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
          <div style={{ textAlign:"center", flex:1 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — QUARTERMASTER — ◈</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
              FIELD <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>ARMOURY</span>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>▸ PROCURE YOUR GEAR — REPORT TO QUARTERMASTER ◂</div>
          </div>
          {/* Cart button */}
          <div style={{ flexShrink:0, marginTop:4 }}>
            <button style={{ background:"rgba(200,255,0,.06)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", padding:"10px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background="rgba(200,255,0,.12)"; e.currentTarget.style.borderColor="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.background="rgba(200,255,0,.06)"; e.currentTarget.style.borderColor="#2a3a10"; }}
              onClick={() => setCartOpen(true)}>
              ◈ LOADOUT
              {cartCount > 0 && <span style={{ background:"#c8ff00", color:"#000", padding:"1px 8px", fontSize:11, fontWeight:900 }}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 16px 80px" }}>
        {cu?.vipStatus === "active" && (
          <div style={{ background:"rgba(200,160,0,.06)", border:"1px solid rgba(200,160,0,.2)", padding:"10px 16px", marginBottom:24, display:"flex", alignItems:"center", gap:10, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"#c8a000" }}>
            ★ VIP OPERATIVE — 10% DISCOUNT APPLIED ON ALL ITEMS
          </div>
        )}

        {data.shop.length === 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>ARMOURY IS EMPTY — AWAITING RESUPPLY</div>
        )}

        {allShopCategories.length > 0 && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:24, alignItems:"center" }}>
            <button
              onClick={() => setShopCatFilter("")}
              style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", textTransform:"uppercase",
                padding:"6px 16px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                background: shopCatFilter === "" ? "#c8ff00" : "transparent",
                borderColor: shopCatFilter === "" ? "#c8ff00" : "#2a3a10",
                color: shopCatFilter === "" ? "#000" : "#5a7a30" }}
            >ALL</button>
            {allShopCategories.map(cat => (
              <button key={cat}
                onClick={() => setShopCatFilter(shopCatFilter === cat ? "" : cat)}
                style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", textTransform:"uppercase",
                  padding:"6px 16px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                  background: shopCatFilter === cat ? "#c8ff00" : "transparent",
                  borderColor: shopCatFilter === cat ? "#c8ff00" : "#2a3a10",
                  color: shopCatFilter === cat ? "#000" : "#5a7a30" }}
              >{cat}</button>
            ))}
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
          {filteredShop.map((item, idx) => {
            const hasV = item.variants?.length > 0;
            const displayPrice = hasV
              ? Math.min(...item.variants.map(v => Number(v.price)))
              : (item.onSale && item.salePrice ? item.salePrice : item.price);
            const inStock = item.stock > 0;
            const sl = stockLabel(hasV ? item.variants.reduce((s,v)=>s+Number(v.stock),0) : item.stock);
            return (
              <div key={item.id}
                style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", position:"relative", transition:"border-color .15s, transform .15s" }}
                onClick={() => onProductClick(item)}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-3px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}
              >
                {/* Scanlines */}
                <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents:"none", zIndex:5 }} />
                {/* Corner brackets */}
                {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                  <div key={v+h} style={{ position:"absolute", width:12, height:12, zIndex:6,
                    top:v==="top"?5:"auto", bottom:v==="bottom"?5:"auto",
                    left:h==="left"?5:"auto", right:h==="right"?5:"auto",
                    borderTop:v==="top"?"1px solid rgba(200,255,0,.4)":"none",
                    borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.4)":"none",
                    borderLeft:h==="left"?"1px solid rgba(200,255,0,.4)":"none",
                    borderRight:h==="right"?"1px solid rgba(200,255,0,.4)":"none",
                  }} />
                ))}

                {/* Top ID strip */}
                <div style={{ background:"rgba(0,0,0,.7)", borderBottom:"1px solid #1a2808", padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"relative", zIndex:6 }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"rgba(200,255,0,.5)" }}>QM · ITEM-{String(idx+1).padStart(3,"0")}</span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:sl.color, letterSpacing:".12em" }}>{sl.text}</span>
                </div>

                {/* Image */}
                <div style={{ height:170, background:"#080a06", overflow:"hidden", position:"relative" }}>
                  {(() => { const cardImg = (item.images && item.images.length > 0) ? item.images[0] : item.image; return cardImg
                    ? <img src={cardImg} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.8)", transition:"transform .3s" }}
                        onMouseOver={e => e.currentTarget.style.transform="scale(1.05)"}
                        onMouseOut={e => e.currentTarget.style.transform=""} />
                    : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                        <div style={{ fontSize:40, opacity:.08 }}>🎯</div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".15em", color:"#1e2c0a" }}>NO IMAGERY</div>
                      </div>;
                  })()}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:40, background:"linear-gradient(to top,rgba(12,16,9,1),transparent)", zIndex:2 }} />
                  {(item.images && item.images.length > 1) && (
                    <div style={{ position:"absolute", bottom:6, right:8, zIndex:3, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"rgba(200,255,0,.7)", letterSpacing:".1em" }}>📷 {item.images.length}</div>
                  )}
                  {!inStock && !hasV && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, letterSpacing:".2em", color:"#ef4444", border:"2px solid #ef4444", padding:"4px 14px", transform:"rotate(-3deg)" }}>OUT OF STOCK</span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding:"12px 12px 0", position:"relative", zIndex:6 }}>
                  <div className="gap-2 mb-1" style={{ flexWrap:"wrap" }}>
                    {item.noPost && <span className="tag tag-gold" style={{ fontSize:9 }}>COLLECT ONLY</span>}
                    {hasV && <span className="tag tag-blue" style={{ fontSize:9 }}>{item.variants.length} VARIANTS</span>}
                    {item.onSale && !hasV && <span className="tag tag-red" style={{ fontSize:9 }}>SALE</span>}
                  </div>
                  {item.category && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#4a6a20", textTransform:"uppercase", marginBottom:4 }}>◈ {item.category}</div>
                  )}
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".06em", textTransform:"uppercase", color:"#dce8c8", lineHeight:1.1, marginBottom:6 }}>{item.name}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", lineHeight:1.6, marginBottom:10 }}>
                    {(item.description||"").replace(/[*#_~`]/g,"").slice(0,70)}{(item.description||"").length>70?"…":""}
                  </div>
                </div>

                {/* Footer */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.3)", position:"relative", zIndex:6 }}>
                  <div>
                    {hasV && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", marginBottom:2, letterSpacing:".1em" }}>FROM</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color:"#c8ff00", lineHeight:1 }}>
                      £{cu?.vipStatus === "active" ? (displayPrice * 0.9).toFixed(2) : Number(displayPrice).toFixed(2)}
                      {cu?.vipStatus === "active" && <span style={{ fontSize:9, color:"#c8a000", marginLeft:5, fontFamily:"'Share Tech Mono',monospace" }}>VIP</span>}
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ padding:"7px 16px", fontSize:10, letterSpacing:".15em", borderRadius:0 }} disabled={!inStock && !hasV}>
                    {!inStock && !hasV ? "OUT OF STOCK" : "▸ ACQUIRE"}
                  </button>
                </div>

                {/* Barcode strip */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"3px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".06em" }}>
                    {item.id ? item.id.slice(0,10).toUpperCase() : "----------"}
                  </div>
                  <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
                    {Array.from({length:16},(_,i) => (
                      <div key={i} style={{ background:"#1a2808", width:i%3===0?2:1, height:2+Math.abs(Math.sin(i*2.1)*5), borderRadius:1 }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CART MODAL */}
      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background:"#0c1009", border:"1px solid #2a3a10", borderRadius:0 }}>
            {/* Modal header */}
            <div style={{ borderBottom:"1px solid #2a3a10", paddingBottom:16, marginBottom:16 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".25em", color:"#3a5010", marginBottom:4 }}>◈ — QUARTERMASTER</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:24, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>LOADOUT REVIEW</div>
            </div>

            {cart.length === 0
              ? <div style={{ textAlign:"center", padding:"32px 0", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#2a3a10", letterSpacing:".15em" }}>LOADOUT IS EMPTY</div>
              : (
              <>
                {cart.map(item => (
                  <div key={item.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #1a2808" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, letterSpacing:".06em", fontSize:14, textTransform:"uppercase", color:"#b0c090" }}>{item.name}</div>
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", marginTop:2 }}>£{item.price.toFixed(2)} EACH</div>
                    </div>
                    <div className="gap-2" style={{ alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", border:"1px solid #2a3a10", background:"#080a06" }}>
                        <button onClick={() => updateCartQty(item.key, item.qty - 1)} style={{ background:"none", border:"none", color:"#c8ff00", padding:"4px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>−</button>
                        <span style={{ padding:"0 8px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#c8ff00" }}>{item.qty}</span>
                        <button onClick={() => updateCartQty(item.key, item.qty + 1)} style={{ background:"none", border:"none", color:"#c8ff00", padding:"4px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>+</button>
                      </div>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, fontWeight:900, color:"#c8ff00", minWidth:60, textAlign:"right" }}>£{(item.price * item.qty).toFixed(2)}</span>
                      <button style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }} onClick={() => removeFromCart(item.key)}>✕</button>
                    </div>
                  </div>
                ))}

                {!hasNoPost && postageOptions.length > 0 && (
                  <div className="form-group mt-2">
                    <label style={{ color:"#3a5010", fontSize:9, letterSpacing:".2em" }}>POSTAGE METHOD</label>
                    <select value={postageId} onChange={e => setPostageId(e.target.value)} style={{ background:"#080a06", border:"1px solid #2a3a10", borderRadius:0, color:"#b0c090", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {postageOptions.map(p => <option key={p.id} value={p.id}>{p.name} — £{Number(p.price).toFixed(2)}</option>)}
                    </select>
                  </div>
                )}
                {hasNoPost && <div className="alert alert-gold mt-1" style={{ borderRadius:0 }}>⚠ COLLECTION-ONLY ITEMS — NO POSTING</div>}
                {cu?.vipStatus === "active" && <div style={{ background:"rgba(200,160,0,.06)", border:"1px solid rgba(200,160,0,.2)", padding:"8px 12px", marginTop:8, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".12em", color:"#c8a000" }}>★ VIP 10% DISCOUNT APPLIED</div>}

                <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"'Barlow Condensed',sans-serif", fontSize:24, marginTop:16, paddingTop:12, borderTop:"1px solid #2a3a10", color:"#e8f0d8" }}>
                  <span>TOTAL</span>
                  <span style={{ color:"#c8ff00" }}>£{grandTotal.toFixed(2)}</span>
                </div>
                {!hasNoPost && postageTotal > 0 && (
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", textAlign:"right", marginTop:2 }}>
                    incl. {postage.name} £{postageTotal.toFixed(2)}
                  </div>
                )}

                {!cu && <div className="alert alert-red mt-2" style={{ borderRadius:0 }}>LOG IN TO COMPLETE REQUISITION</div>}
                {shopPaypalError && <div className="alert alert-red mt-1" style={{ borderRadius:0 }}>⚠ {shopPaypalError}</div>}
                {placing && <div className="alert alert-blue mt-1" style={{ borderRadius:0 }}>⏳ PROCESSING REQUISITION…</div>}
                {cu && grandTotal > 0 && (
                  <PayPalCheckoutButton
                    amount={grandTotal}
                    description={`Swindon Airsoft Armoury — ${cart.length} item${cart.length > 1 ? "s" : ""}`}
                    onSuccess={placeOrderAfterPayment}
                    disabled={placing}
                  />
                )}
              </>
            )}
            <button style={{ width:"100%", marginTop:12, background:"transparent", border:"1px solid #2a3a10", color:"#3a5010", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".2em", padding:"10px", cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#c8ff00"; e.currentTarget.style.color="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#3a5010"; }}
              onClick={() => setCartOpen(false)}>✕ CLOSE LOADOUT</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Page ──────────────────────────────────────────
function ProductPage({ item, cu, onBack, onAddToCart, cartCount, onCartOpen }) {
  const isMobile = useMobile(700);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImgIdx, setActiveImgIdx] = useState(0);

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

  return (
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
                    ? <img src={displayImg} alt={item.name} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", display:"block", background:"#0a0a0a", transition:"opacity .2s" }} />
                    : <div style={{ aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:80, color:"#333" }}>🎯</div>
                  }
                  {allImgs.length > 1 && (
                    <div style={{ display:"flex", gap:4, padding:"8px 8px 4px", background:"#080a06", flexWrap:"wrap" }}>
                      {allImgs.map((img, i) => (
                        <div key={i} onClick={() => setActiveImgIdx(i)}
                          style={{ width:52, height:52, border: i === activeImgIdx ? "2px solid var(--accent)" : "1px solid #1a2808", cursor:"pointer", overflow:"hidden", flexShrink:0, opacity: i === activeImgIdx ? 1 : 0.55, transition:"all .15s" }}>
                          <img src={img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
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
          <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, color:"#fff", letterSpacing:".04em", textTransform:"uppercase", lineHeight:1, marginBottom:12 }}>{item.name}</h1>

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
  );
}

// ── Leaderboard ───────────────────────────────────────────
function LeaderboardPage({ data, cu, updateUser, showToast }) {
  const board = data.users
    .filter(u => !u.leaderboardOptOut && u.role === "player")
    .sort((a, b) => b.gamesAttended - a.gamesAttended);

  const RANK_INSIGNIA = ["★★★★★", "★★★★", "★★★", "★★", "★"];
  const RANK_TITLES = ["FIELD COMMANDER", "SENIOR OPERATIVE", "OPERATIVE", "RECRUIT", "PRIVATE"];

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — FIELD RECORDS — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            COMBAT <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>ROLL</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ RANKED BY FIELD DEPLOYMENTS — DEDICATION, NOT KILLS ◂</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22, justifyContent: "center" }}>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color: "#c8ff00", fontSize: 18, opacity: .6 }}>✦</div>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 16px 80px" }}>
        {cu?.role === "player" && (
          <div style={{ background: "#0c1009", border: "1px solid #1e2c0a", padding: "12px 18px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: ".2em", color: "#c8ff00", marginBottom: 2 }}>FIELD VISIBILITY</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010" }}>{cu.leaderboardOptOut ? "STATUS: GHOST — YOUR NAME IS HIDDEN" : "STATUS: ACTIVE — YOUR NAME IS VISIBLE"}</div>
            </div>
            <button className={`btn btn-sm ${cu.leaderboardOptOut ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { updateUser(cu.id, { leaderboardOptOut: !cu.leaderboardOptOut }); showToast("Preference saved"); }}>
              {cu.leaderboardOptOut ? "GO ACTIVE" : "GO GHOST"}
            </button>
          </div>
        )}

        {board.length === 0 && (
          <div style={{ textAlign: "center", padding: 80, fontFamily: "'Share Tech Mono',monospace", color: "#2a3a10", fontSize: 11, letterSpacing: ".2em" }}>NO COMBAT RECORDS ON FILE</div>
        )}

        {board.map((player, i) => {
          const isTop3 = i < 3;
          const medalColor = i === 0 ? "#c8a000" : i === 1 ? "#8a8a8a" : i === 2 ? "#8b4513" : null;
          const rankTitle = i === 0 ? "FIELD COMMANDER" : i === 1 ? "SENIOR OPERATIVE" : i === 2 ? "OPERATIVE" : i < 10 ? "RECRUIT" : "PRIVATE";
          return (
            <div key={player.id} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", marginBottom: 3,
              background: isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.04)` : "#0c1009",
              border: `1px solid ${isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.25)` : "#1a2808"}`,
              position: "relative", overflow: "hidden",
              transition: "border-color .15s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.5)` : "#2a3a10"}
              onMouseLeave={e => e.currentTarget.style.borderColor = isTop3 ? `rgba(${i===0?"200,160,0":i===1?"130,130,130":"139,69,19"},.25)` : "#1a2808"}
            >
              {/* Scanlines */}
              <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px)", pointerEvents: "none" }} />
              {/* Rank number */}
              <div style={{ width: 40, textAlign: "center", flexShrink: 0, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: isTop3 ? 26 : 18, color: medalColor || "#2a3a10", lineHeight: 1 }}>
                {i + 1}
              </div>
              {/* Avatar */}
              <div style={{ width: 38, height: 38, background: "#0a0c08", border: `1px solid ${medalColor || "#1a2808"}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, overflow: "hidden", flexShrink: 0, color: "#c8ff00", fontFamily: "'Barlow Condensed',sans-serif" }}>
                {player.profilePic ? <img src={player.profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.05) saturate(0.85)" }} /> : player.name[0]}
              </div>
              {/* Name + rank */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: ".08em", color: isTop3 ? (medalColor || "#e8f0d8") : "#b0c090", textTransform: "uppercase", lineHeight: 1.1 }}>{player.name}</div>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".15em", color: medalColor || "#2a3a10", marginTop: 3 }}>{rankTitle}</div>
                {player.vipStatus === "active" && <span className="tag tag-gold" style={{ marginTop: 4, display: "inline-flex" }}>★ VIP OPERATIVE</span>}
              </div>
              {/* Games count */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 28, color: medalColor || "#c8ff00", lineHeight: 1 }}>{player.gamesAttended}</div>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, letterSpacing: ".2em", color: "#2a3a10", marginTop: 2 }}>DEPLOYMENTS</div>
              </div>
              {/* Left accent bar for top 3 */}
              {isTop3 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: medalColor }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Gallery ───────────────────────────────────────────────
function GalleryPage({ data }) {
  const [active, setActive] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const albums = active ? data.albums.filter(a => a.id === active) : data.albums;

  const openLightbox = (url, album, index) => setLightbox({ url, album, index });
  const closeLightbox = () => setLightbox(null);
  const prevImg = () => {
    const imgs = lightbox.album.images;
    const prevImgIdx = (lightbox.index - 1 + imgs.length) % imgs.length;
    setLightbox({ ...lightbox, url: imgs[i], index: prevImgIdx });
  };
  const nextImg = () => {
    const imgs = lightbox.album.images;
    const nextImgIdx = (lightbox.index + 1) % imgs.length;
    setLightbox({ ...lightbox, url: imgs[i], index: nextImgIdx });
  };

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — FIELD INTELLIGENCE — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            MISSION <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>ARCHIVE</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ CLASSIFIED FIELD FOOTAGE — AUTHORISED VIEWING ONLY ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px 80px" }}>
        {/* Album filter tabs */}
        {data.albums.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28 }}>
            <button style={{ background: !active ? "var(--accent)" : "transparent", color: !active ? "#000" : "#3a5010", border: `1px solid ${!active ? "var(--accent)" : "#1a2808"}`, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: ".2em", padding: "6px 16px", textTransform: "uppercase", cursor: "pointer", transition: "all .15s" }} onClick={() => setActive(null)}>ALL MISSIONS</button>
            {data.albums.map(a => (
              <button key={a.id} style={{ background: active === a.id ? "var(--accent)" : "transparent", color: active === a.id ? "#000" : "#3a5010", border: `1px solid ${active === a.id ? "var(--accent)" : "#1a2808"}`, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: ".2em", padding: "6px 16px", textTransform: "uppercase", cursor: "pointer", transition: "all .15s" }} onClick={() => setActive(a.id)}>{a.title}</button>
            ))}
          </div>
        )}

        {albums.map((album, ai) => (
          <div key={album.id} style={{ marginBottom: 36 }}>
            {/* Album label */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 12 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 13, letterSpacing: ".3em", color: "#c8ff00", textTransform: "uppercase" }}>▸ {album.title}</div>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,#1e2c0a,transparent)" }} />
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em" }}>{album.images.length} IMAGES</div>
            </div>
            {album.images.length === 0
              ? <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: 30, textAlign: "center", fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#2a3a10", letterSpacing: ".15em" }}>NO FOOTAGE ON FILE</div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 4 }}>
                  {album.images.map((img, i) => (
                    <div key={i} style={{ aspectRatio: "4/3", overflow: "hidden", background: "#0a0c08", position: "relative", cursor: "pointer", border: "1px solid #1a2808" }}
                      onClick={() => openLightbox(img, album, i)}>
                      <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .3s, filter .3s", filter: "contrast(1.05) saturate(0.8)" }} />
                      {/* Corner brackets on hover */}
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,.5)"; e.currentTarget.querySelector(".gal-hover-label").style.opacity = 1; e.currentTarget.previousElementSibling.style.filter = "contrast(1.1) saturate(1.1)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0)"; e.currentTarget.querySelector(".gal-hover-label").style.opacity = 0; e.currentTarget.previousElementSibling.style.filter = "contrast(1.05) saturate(0.8)"; }}>
                        <div className="gal-hover-label" style={{ opacity: 0, transition: "opacity .2s", fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#c8ff00", textAlign: "center" }}>
                          <div style={{ fontSize: 22, marginBottom: 4 }}>⊕</div>
                          ENLARGE
                        </div>
                      </div>
                      {/* Frame index */}
                      <div style={{ position: "absolute", bottom: 4, right: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "rgba(200,255,0,.4)", letterSpacing: ".1em" }}>{String(i+1).padStart(3,"0")}</div>
                    </div>
                  ))}
                </div>
            }
          </div>
        ))}

        {data.albums.length === 0 && (
          <div style={{ textAlign: "center", padding: 80, fontFamily: "'Share Tech Mono',monospace", color: "#2a3a10", fontSize: 11, letterSpacing: ".2em" }}>NO MISSION FOOTAGE ON FILE</div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={closeLightbox} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.96)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Corner brackets */}
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position: "absolute", width: 32, height: 32, zIndex: 501,
              top: v==="top" ? 12 : "auto", bottom: v==="bottom" ? 12 : "auto",
              left: h==="left" ? 12 : "auto", right: h==="right" ? 12 : "auto",
              borderTop: v==="top" ? "2px solid rgba(200,255,0,.4)" : "none", borderBottom: v==="bottom" ? "2px solid rgba(200,255,0,.4)" : "none",
              borderLeft: h==="left" ? "2px solid rgba(200,255,0,.4)" : "none", borderRight: h==="right" ? "2px solid rgba(200,255,0,.4)" : "none",
            }} />
          ))}
          <button onClick={e => { e.stopPropagation(); prevImg(); }}
            style={{ position: "absolute", left: 16, background: "rgba(200,255,0,.08)", border: "1px solid #2a3a10", color: "#c8ff00", fontSize: 24, width: 48, height: 48, cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900 }}>‹</button>
          <img src={lightbox.url} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "88vw", maxHeight: "84vh", objectFit: "contain", boxShadow: "0 0 80px rgba(0,0,0,.9), 0 0 0 1px #1a2808" }} />
          <button onClick={e => { e.stopPropagation(); nextImg(); }}
            style={{ position: "absolute", right: 16, background: "rgba(200,255,0,.08)", border: "1px solid #2a3a10", color: "#c8ff00", fontSize: 24, width: 48, height: 48, cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900 }}>›</button>
          <button onClick={closeLightbox}
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(200,255,0,.08)", border: "1px solid #2a3a10", color: "#c8ff00", fontSize: 14, width: 36, height: 36, cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, letterSpacing: ".1em", zIndex: 502 }}>✕</button>
          <div style={{ position: "absolute", bottom: 16, fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "rgba(200,255,0,.4)", letterSpacing: ".2em" }}>
            FRAME {String(lightbox.index+1).padStart(3,"0")} / {String(lightbox.album.images.length).padStart(3,"0")}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Q&A ───────────────────────────────────────────────────
// ── VIP Page ──────────────────────────────────────────────
function VipPage({ data, cu, updateUser, showToast, setAuthModal, setPage }) {
  const isMobile = useMobile(640);
  const [applying, setApplying] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [vipPayError, setVipPayError] = useState(null);

  const myBookings = cu ? data.events.flatMap(ev =>
    ev.bookings.filter(b => b.userId === cu.id && b.checkedIn).map(b => b)
  ) : [];
  const gamesAttended = cu ? Math.max(cu.gamesAttended || 0, myBookings.length) : 0;
  const gamesNeeded = Math.max(0, 3 - gamesAttended);
  const canApply = cu && gamesAttended >= 3 && (cu.vipStatus === "none" || cu.vipStatus === "expired") && !cu.vipApplied;
  const isVip = cu?.vipStatus === "active";
  const isExpired = cu?.vipStatus === "expired";
  const hasPending = cu?.vipApplied && !isVip;

  const handleVipPaymentSuccess = async (paypalOrder) => {
    setApplying(true);
    setVipPayError(null);
    try {
      await updateUser(cu.id, { vipApplied: true });
      setShowPayment(false);
      showToast("🎉 Payment received! VIP application submitted — admin will activate your status shortly.");
    } catch (e) {
      setVipPayError("Payment succeeded but application failed — please contact us. Ref: " + paypalOrder.id);
    } finally {
      setApplying(false);
    }
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
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8a000" : "none", borderBottom: v==="bottom" ? "2px solid #c8a000" : "none",
            borderLeft: h==="left" ? "2px solid #c8a000" : "none", borderRight: h==="right" ? "2px solid #c8a000" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — ELITE CLEARANCE — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            ELITE <span style={{ color: "#c8a000", textShadow: "0 0 30px rgba(200,160,0,.35)" }}>OPERATIVE</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ UNLOCK EXCLUSIVE CLEARANCE — JOIN OUR ELITE SQUAD ◂</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22, justifyContent: "center" }}>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to right,transparent,#3a2a00)" }} />
            <div style={{ color: "#c8a000", fontSize: 18, opacity: .6 }}>★</div>
            <div style={{ flex: 1, maxWidth: 160, height: 1, background: "linear-gradient(to left,transparent,#3a2a00)" }} />
          </div>
        </div>
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
              <div className="alert alert-blue" style={{ textAlign:"center" }}>⏳ Payment received — application under review. Admin will activate your status shortly.</div>
            )}
            {cu && canApply && !showPayment && (
              <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14 }}
                onClick={() => { setShowPayment(true); setVipPayError(null); }}>
                {isExpired ? "RENEW VIP — £30/YEAR" : "APPLY & PAY — £30/YEAR"}
              </button>
            )}
            {cu && canApply && showPayment && (
              <div>
                <div style={{ background:"#0d1a0d", border:"1px solid #1e3a1e", padding:"10px 14px", marginBottom:12, fontSize:12, color:"#8aaa60" }}>
                  💳 {isExpired ? "Pay now to renew your VIP membership for another year." : "Pay now to submit your VIP application. Your status will be activated by admin after payment is confirmed."}
                </div>
                {vipPayError && (
                  <div className="alert alert-red" style={{ marginBottom:10 }}>{vipPayError}</div>
                )}
                <PayPalCheckoutButton
                  amount={30}
                  description={`Swindon Airsoft — VIP Membership (Annual${isExpired ? " Renewal" : ""})`}
                  disabled={applying}
                  onSuccess={handleVipPaymentSuccess}
                />
                <button className="btn btn-ghost" style={{ width:"100%", marginTop:10, fontSize:12 }}
                  onClick={() => setShowPayment(false)}>Cancel</button>
              </div>
            )}
            {cu && !isVip && !hasPending && !canApply && (
              <div>
                <button className="btn btn-primary" style={{ width:"100%", padding:"14px", fontSize:14, opacity:.5, cursor:"not-allowed" }} disabled>
                  APPLY &amp; PAY — £30/YEAR
                </button>
                <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", marginTop:8 }}>
                  Complete {gamesNeeded} more game day{gamesNeeded !== 1 ? "s" : ""} to unlock
                </div>
              </div>
            )}

            <div style={{ marginTop:16, fontSize:11, color:"var(--muted)", lineHeight:1.6, textAlign:"center" }}>
              Pay the £30 annual fee now. Admin will review and activate your VIP status — usually within 24 hours.
            </div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", padding:"28px 24px", marginBottom:32 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"#fff", letterSpacing:".08em", textTransform:"uppercase", marginBottom:20 }}>HOW IT WORKS</div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:16 }}>
            {[
              { num:"01", title:"PLAY 3 GAMES", desc:"Attend 3 game days to meet the eligibility requirement. Check-ins are tracked automatically." },
              { num:"02", title:"PAY & APPLY", desc:"Once eligible, pay the £30 annual fee directly on this page. Your application is submitted automatically on payment." },
              { num:"03", title:"ADMIN ACTIVATES", desc:"Admin reviews your application and activates your VIP status — usually within 24 hours of payment." },
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
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — FIELD BRIEFING — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            INTEL <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>BRIEFING</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ PRE-MISSION INTELLIGENCE — READ BEFORE DEPLOYMENT ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 16px 80px" }}>
        {data.qa.length === 0 && (
          <div style={{ textAlign: "center", padding: 80, fontFamily: "'Share Tech Mono',monospace", color: "#2a3a10", fontSize: 11, letterSpacing: ".2em" }}>NO INTELLIGENCE ON FILE — CHECK BACK SOON</div>
        )}
        {data.qa.map((item, i) => (
          <div key={item.id} style={{ marginBottom: 3, background: "#0c1009", border: `1px solid ${open === item.id ? "#2a3a10" : "#1a2808"}`, overflow: "hidden", transition: "border-color .15s" }}>
            <div style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
              onClick={() => setOpen(open === item.id ? null : item.id)}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 3 }}>Q{String(i+1).padStart(2,"0")}</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: ".06em", color: "#b0c090", lineHeight: 1.3 }}>{item.q}</div>
              </div>
              <div style={{ color: "#c8ff00", fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 2, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900 }}>
                {open === item.id ? "−" : "+"}
              </div>
            </div>
            {open === item.id && (
              <div style={{ padding: "0 18px 18px 18px", borderTop: "1px solid #1a2808" }}>
                <div style={{ paddingTop: 14, fontSize: 13, color: "#3a5028", lineHeight: 1.7, fontFamily: "'Share Tech Mono',monospace" }}>
                  {renderQAAnswer(item.a)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────
// ── Player Order History ─────────────────────────────────────
function PlayerOrders({ cu }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    supabase.from('shop_orders').select('*')
      .eq('user_id', cu.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setOrders(data || []);
        setLoading(false);
      });
  }, [cu.id]);

  const STATUS_COLORS = { pending: "blue", processing: "gold", dispatched: "green", completed: "teal", cancelled: "red" };

  if (loading) return <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Loading orders…</div>;
  if (orders.length === 0) return <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No orders yet.</div>;

  return (
    <div>
      {orders.map(o => {
        const items = Array.isArray(o.items) ? o.items : [];
        return (
          <div key={o.id} className="card mb-1" style={{ cursor: "pointer" }} onClick={() => setDetail(detail?.id === o.id ? null : o)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{items.map(i => `${i.name} ×${i.qty}`).join(", ")}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {gmtShort(o.created_at)} · <span style={{ fontFamily: "'Share Tech Mono',monospace" }}>#{(o.id||"").slice(-8).toUpperCase()}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className={`tag tag-${STATUS_COLORS[o.status] || "blue"}`}>{o.status}</span>
                <span style={{ fontWeight: 800, color: "var(--accent)" }}>£{Number(o.total).toFixed(2)}</span>
              </div>
            </div>
            {detail?.id === o.id && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".1em", marginBottom: 8 }}>ORDER DETAILS</div>
                <div className="table-wrap"><table className="data-table">
                  <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                  <tbody>
                    {items.map((i, idx) => (
                      <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>£{Number(i.price).toFixed(2)}</td><td className="text-green">£{(Number(i.price) * i.qty).toFixed(2)}</td></tr>
                    ))}
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td colSpan={3}>Postage ({o.postage_name || "—"})</td>
                      <td>£{Number(o.postage || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} style={{ fontWeight: 900 }}>TOTAL</td>
                      <td className="text-green" style={{ fontWeight: 900 }}>£{Number(o.total).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table></div>
                {o.customer_address && (
                  <div style={{ marginTop: 10, fontSize: 12 }}>
                    <span style={{ color: "var(--muted)" }}>Shipping to: </span>
                    <span style={{ whiteSpace: "pre-line" }}>{o.customer_address}</span>
                  </div>
                )}
                {o.tracking_number && (
                  <div style={{ marginTop: 10, padding: "10px 14px", background: "#0c1009", border: "1px solid #2a3a10", borderRadius: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".15em", color: "var(--accent)", marginBottom: 4 }}>📮 TRACKING NUMBER</div>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{o.tracking_number}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProfilePage({ data, cu, updateUser, showToast, save, setPage }) {
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="profile" && ["profile","waiver","bookings","orders","vip"].includes(p[1]) ? p[1] : "profile";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "profile/" + t; };

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
    email: cu.email || "",
    phone: cu.phone || "",
    ...parseAddress(cu.address),
  });
  const [emailSaving, setEmailSaving] = useState(false);

  const changeEmail = async () => {
    if (!edit.email || !edit.email.includes("@")) { showToast("Valid email required", "red"); return; }
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: edit.email });
      if (error) throw error;
      await updateUser(cu.id, { email: edit.email });
      showToast("Check your new email for a confirmation link!");
    } catch (e) {
      showToast("Email update failed: " + e.message, "red");
    } finally { setEmailSaving(false); }
  };
  const setAddr = (field, val) => setEdit(p => ({ ...p, [field]: val }));

  const [waiverModal, setWaiverModal] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const waiverValid = (cu.waiverSigned === true && cu.waiverYear === new Date().getFullYear()) || cu.role === "admin";
  const myBookings = data.events.flatMap(ev => ev.bookings.filter(b => b.userId === cu.id).map(b => ({ ...b, eventTitle: ev.title, eventDate: ev.date })));

  // Count actual checked-in games from booking records — source of truth
  const actualGamesAttended = myBookings.filter(b => b.checkedIn).length;
  // Use the higher of stored count vs actual (in case bookings haven't all loaded)
  const gamesAttended = Math.max(cu.gamesAttended || 0, actualGamesAttended);
  const canApplyVip = gamesAttended >= 3 && cu.vipStatus === "none" && !cu.vipApplied;

  const [picUploading, setPicUploading] = useState(false);
  const handlePic = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setPicUploading(true);
    try {
      const url = await api.profiles.uploadProfilePic(cu.id, file);
      updateUser(cu.id, { profilePic: url });
      showToast("Profile picture updated!");
    } catch (err) {
      showToast("Upload failed: " + err.message, "red");
    } finally { setPicUploading(false); }
  };

  const saveProfile = async () => {
    try {
      await updateUser(cu.id, {
        name:    edit.name,
        phone:   edit.phone,
        address: composeAddress(edit),
      });
      showToast("Profile updated!");
    } catch(e) {
      showToast("Failed to save: " + (e.message || "unknown error"), "red");
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px solid var(--accent)", overflow: "hidden", background: "var(--bg4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>
              {cu.profilePic ? <img src={cu.profilePic} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : cu.name[0]}
            </div>
            <label style={{ position: "absolute", bottom: 0, right: 0, background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: picUploading ? "wait" : "pointer", fontSize: 12, opacity: picUploading ? 0.6 : 1 }}>
              {picUploading ? "⏳" : "📷"}<input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePic} disabled={picUploading} />
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

      <div className="nav-tabs profile-tabs">
        {[["profile","👤 Profile"],["waiver","📋 Waiver"],["bookings","🎟 Bookings"],["orders","📦 Orders"],["vip","⭐ VIP"]].map(([t, label]) => (
          <button key={t} className={`nav-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      <select
        className="profile-tab-select"
        value={tab}
        onChange={e => setTab(e.target.value)}
      >
        <option value="profile">👤 Profile</option>
        <option value="waiver">📋 Waiver</option>
        <option value="bookings">🎟 Bookings</option>
        <option value="orders">📦 Orders</option>
        <option value="vip">⭐ VIP</option>
      </select>

      {tab === "profile" && (
        <div className="card">
          <div className="form-row">
            <div className="form-group"><label>Full Name</label><input value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="form-group"><label>Phone</label><input value={edit.phone} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} placeholder="07700 000000" /></div>
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <div className="gap-2">
              <input value={edit.email} onChange={e => setEdit(p => ({ ...p, email: e.target.value }))} placeholder="your@email.com" type="email" style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={changeEmail} disabled={emailSaving} style={{ flexShrink: 0 }}>{emailSaving ? "Saving..." : "Update Email"}</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Changing your email requires confirmation via a link sent to your new address.</div>
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
              ? <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setWaiverModal("edit")}>Request Changes</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setWaiverModal("addPlayer")}>+ Add Player Waiver</button>
                </div>
              : <button className="btn btn-primary btn-sm" onClick={() => setWaiverModal("new")}>Sign Waiver {new Date().getFullYear()}</button>}
          </div>
          {cu.waiverPending && <div className="alert alert-gold">⏳ Changes submitted — awaiting admin approval</div>}
          {cu.waiverData && (() => {
            const allWaivers = [cu.waiverData, ...(cu.extraWaivers || [])];
            return (
              <div style={{ marginTop: 12 }}>
                {/* Player tabs if multiple waivers */}
                {allWaivers.length > 1 && (
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:12 }}>
                    {allWaivers.map((w, i) => (
                      <button key={i} style={{
                        padding:"4px 12px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700,
                        fontSize:11, letterSpacing:".1em", textTransform:"uppercase",
                        background:"var(--accent)", color:"#000", border:"none", borderRadius:2, cursor:"default"
                      }}>
                        {w.name || `Player ${i+1}`}{i === 0 ? " ★" : ""}
                      </button>
                    ))}
                  </div>
                )}
                {allWaivers.map((w, i) => (
                  <div key={i} style={{ marginBottom: i < allWaivers.length - 1 ? 20 : 0, paddingBottom: i < allWaivers.length - 1 ? 20 : 0, borderBottom: i < allWaivers.length - 1 ? "1px solid #2a2a2a" : "none" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      {allWaivers.length > 1 && (
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase" }}>
                          PLAYER {i + 1}{i === 0 ? " (PRIMARY)" : " (ADDITIONAL)"}
                        </div>
                      )}
                      {i > 0 && (
                        <button onClick={() => {
                          const updated = (cu.extraWaivers || []).filter((_, ei) => ei !== i - 1);
                          updateUser(cu.id, { extraWaivers: updated });
                          showToast("Waiver removed");
                        }} style={{ background:"none", border:"1px solid var(--red)", color:"var(--red)", fontSize:11, padding:"2px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em" }}>
                          🗑 REMOVE
                        </button>
                      )}
                    </div>
                    {[["Name", w.name], ["DOB", w.dob], ["Address", [w.addr1, w.addr2, w.city, w.county, w.postcode].filter(Boolean).join(", ") || "—"], ["Emergency", w.emergencyName ? `${w.emergencyName} · ${w.emergencyPhone}` : "—"], ["Medical", w.medical || "None"], ["Minor", w.isChild ? `Yes — Guardian: ${w.guardian}` : "No"], ["Signed", gmtShort(w.date)]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                        <span className="text-muted" style={{ minWidth: 130 }}>{k}:</span><span>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
          {waiverModal && <WaiverModal cu={cu} updateUser={updateUser} onClose={() => setWaiverModal(false)} showToast={showToast} editMode={waiverModal === "edit"} existing={cu.waiverData} />}
        </div>
      )}

      {tab === "bookings" && (
        <div>
          {myBookings.length === 0 ? <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No bookings yet.</div> : (
            myBookings.map(b => {
              const printTicket = () => {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(b.id)}&bgcolor=0d0d0d&color=c8ff00&qzone=1`;
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FIELD PASS — ${b.eventTitle || 'EVENT'}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @media print {
    .noprint { display:none !important; }
    body { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  }
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=Share+Tech+Mono&display=swap');
  body {
    font-family:'Barlow Condensed',Arial,sans-serif;
    background: #0a0a0a;
    color:#fff;
    min-height:100vh;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    padding:24px;
  }
  .ticket {
    width:520px;
    background:#111;
    border:1px solid #2a2a2a;
    position:relative;
    overflow:hidden;
  }
  /* Camo texture overlay */
  .ticket::before {
    content:'';
    position:absolute;
    inset:0;
    background-image:
      radial-gradient(ellipse at 20% 30%, rgba(30,50,10,.25) 0%, transparent 50%),
      radial-gradient(ellipse at 70% 70%, rgba(20,40,5,.2) 0%, transparent 40%),
      radial-gradient(ellipse at 50% 50%, rgba(10,20,0,.15) 0%, transparent 60%);
    pointer-events:none;
    z-index:0;
  }
  .ticket > * { position:relative; z-index:1; }

  /* Corner brackets */
  .corner { position:absolute; width:20px; height:20px; z-index:2; }
  .corner.tl { top:8px; left:8px; border-top:2px solid #c8ff00; border-left:2px solid #c8ff00; }
  .corner.tr { top:8px; right:8px; border-top:2px solid #c8ff00; border-right:2px solid #c8ff00; }
  .corner.bl { bottom:8px; left:8px; border-bottom:2px solid #c8ff00; border-left:2px solid #c8ff00; }
  .corner.br { bottom:8px; right:8px; border-bottom:2px solid #c8ff00; border-right:2px solid #c8ff00; }

  .header {
    background: linear-gradient(135deg, #0d1400 0%, #111 60%, #0a1000 100%);
    padding:18px 24px 14px;
    border-bottom:1px solid #1e1e1e;
  }
  .header-top {
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:10px;
  }
  .org {
    font-size:10px;
    letter-spacing:.25em;
    color:#c8ff00;
    font-weight:800;
    text-transform:uppercase;
  }
  .classification {
    font-size:9px;
    letter-spacing:.2em;
    color:#555;
    text-transform:uppercase;
    border:1px solid #333;
    padding:2px 8px;
  }
  .event-name {
    font-size:28px;
    font-weight:900;
    text-transform:uppercase;
    letter-spacing:.06em;
    line-height:1;
    color:#fff;
    margin-bottom:4px;
  }
  .event-date {
    font-size:13px;
    color:#888;
    letter-spacing:.08em;
    font-family:'Share Tech Mono',monospace;
  }

  /* Tear line */
  .tear {
    display:flex;
    align-items:center;
    background:#0d0d0d;
  }
  .notch { width:18px; height:36px; background:#0a0a0a; flex-shrink:0; }
  .notch.l { border-radius:0 18px 18px 0; margin-left:-1px; }
  .notch.r { border-radius:18px 0 0 18px; margin-right:-1px; }
  .tear-line { flex:1; border-top:2px dashed #222; }

  .body {
    padding:16px 24px 20px;
    display:flex;
    gap:20px;
    align-items:stretch;
  }
  .fields {
    flex:1;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:12px 20px;
    align-content:start;
  }
  .field .lbl {
    font-size:8px;
    letter-spacing:.22em;
    color:#555;
    font-weight:800;
    text-transform:uppercase;
    margin-bottom:3px;
  }
  .field .val {
    font-size:17px;
    font-weight:800;
    letter-spacing:.04em;
    color:#e0e0e0;
    line-height:1;
  }
  .field.wide { grid-column:1/-1; }
  .ref {
    grid-column:1/-1;
    font-family:'Share Tech Mono',monospace;
    font-size:10px;
    color:#444;
    letter-spacing:.1em;
    padding-top:10px;
    border-top:1px solid #1a1a1a;
    margin-top:4px;
  }
  .status-badge {
    display:inline-block;
    padding:4px 12px;
    font-size:10px;
    font-weight:900;
    letter-spacing:.18em;
    text-transform:uppercase;
  }

  /* QR side */
  .qr-side {
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:8px;
    padding-left:16px;
    border-left:1px dashed #222;
    flex-shrink:0;
  }
  .qr-wrap {
    background:#0d0d0d;
    border:1px solid #2a2a2a;
    padding:8px;
  }
  .qr-label {
    font-size:8px;
    letter-spacing:.18em;
    color:#555;
    text-transform:uppercase;
    text-align:center;
    font-weight:700;
  }

  /* Barcode-style bottom strip */
  .footer {
    background:#0d0d0d;
    border-top:1px solid #1a1a1a;
    padding:8px 24px;
    display:flex;
    justify-content:space-between;
    align-items:center;
  }
  .footer-text {
    font-size:9px;
    letter-spacing:.15em;
    color:#444;
    text-transform:uppercase;
  }
  .bars { display:flex; gap:2px; align-items:center; }
  .bar { background:#333; width:2px; border-radius:1px; }

  .print-btn {
    margin-top:20px;
    padding:13px 32px;
    background:#c8ff00;
    color:#000;
    font-family:'Barlow Condensed',sans-serif;
    font-weight:900;
    font-size:14px;
    letter-spacing:.15em;
    text-transform:uppercase;
    border:none;
    cursor:pointer;
    width:520px;
  }
</style></head><body>
<div class="ticket">
  <div class="corner tl"></div><div class="corner tr"></div>
  <div class="corner bl"></div><div class="corner br"></div>

  <div class="header">
    <div class="header-top">
      <div class="org">⬡ Swindon Airsoft</div>
      <div class="classification">FIELD PASS // ${new Date().getFullYear()}</div>
    </div>
    <div class="event-name">${b.eventTitle || 'Operation'}</div>
    <div class="event-date">${b.eventDate || '—'}</div>
  </div>

  <div class="tear">
    <div class="notch l"></div>
    <div class="tear-line"></div>
    <div class="notch r"></div>
  </div>

  <div class="body">
    <div class="fields">
      <div class="field">
        <div class="lbl">Operator</div>
        <div class="val">${(b.eventTitle || '').slice(0,12) || '—'}</div>
      </div>
      <div class="field">
        <div class="lbl">Clearance</div>
        <div class="val" style="color:${b.checkedIn ? '#c8ff00' : '#4fc3f7'}">${b.checkedIn ? 'CLEARED' : 'PENDING'}</div>
      </div>
      <div class="field">
        <div class="lbl">Kit Type</div>
        <div class="val">${b.type === 'walkOn' ? 'Walk-On' : 'Rental'}</div>
      </div>
      <div class="field">
        <div class="lbl">Units</div>
        <div class="val">${b.qty}</div>
      </div>
      <div class="field">
        <div class="lbl">Levy</div>
        <div class="val">${b.total > 0 ? '£' + b.total.toFixed(2) : 'N/A'}</div>
      </div>
      <div class="field">
        <div class="lbl">Status</div>
        <div class="val" style="font-size:13px;color:${b.checkedIn ? '#c8ff00' : '#4fc3f7'};border:1px solid ${b.checkedIn ? '#c8ff00' : '#4fc3f7'};padding:2px 8px;display:inline-block">${b.checkedIn ? '✓ CHECKED IN' : '⏳ BOOKED'}</div>
      </div>
      <div class="ref">MISSION ID: ${b.id.toUpperCase()}</div>
    </div>

    <div class="qr-side">
      <img class="qr-wrap" src="${qrUrl}" width="140" height="140" alt="QR" />
      <div class="qr-label">Scan on arrival</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-text">Valid for date shown only &bull; Non-transferable</div>
    <div class="bars">
      ${Array.from({length:28}, (_,i) => `<div class="bar" style="height:${8+Math.sin(i*1.3)*6}px"></div>`).join('')}
    </div>
  </div>
</div>
<button class="print-btn noprint" onclick="window.print()">🖨 PRINT / SAVE FIELD PASS</button>
</body></html>`;
                const printWin = window.open('', '_blank');
                printWin.document.write(html);
                printWin.document.close();
              };

              return (
                <div key={b.id} style={{
                  marginBottom: 20,
                  position: "relative",
                  background: `radial-gradient(ellipse at 12% 20%, rgba(50,80,15,.6) 0%, transparent 42%),radial-gradient(ellipse at 82% 75%, rgba(35,60,8,.5) 0%, transparent 38%),radial-gradient(ellipse at 55% 48%, rgba(25,45,5,.35) 0%, transparent 32%),radial-gradient(ellipse at 88% 12%, rgba(55,85,12,.45) 0%, transparent 28%),radial-gradient(ellipse at 28% 82%, rgba(40,65,10,.4) 0%, transparent 38%),radial-gradient(ellipse at 65% 30%, rgba(20,38,4,.3) 0%, transparent 25%),#0b1007`,
                  border: "1px solid #2a3a10",
                  overflow: "hidden",
                }}>
                  {/* Scanlines */}
                  <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.07) 2px,rgba(0,0,0,.07) 3px)" }} />
                  {/* Noise texture dots */}
                  <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1, opacity:.04,
                    backgroundImage:"radial-gradient(circle, #c8ff00 1px, transparent 1px)",
                    backgroundSize:"18px 18px"
                  }} />

                  {/* Corner brackets */}
                  {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                    <div key={v+h} style={{
                      position:"absolute", width:18, height:18, zIndex:3,
                      top: v==="top" ? 7 : "auto", bottom: v==="bottom" ? 7 : "auto",
                      left: h==="left" ? 7 : "auto", right: h==="right" ? 7 : "auto",
                      borderTop: v==="top" ? "2px solid #c8ff00" : "none",
                      borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
                      borderLeft: h==="left" ? "2px solid #c8ff00" : "none",
                      borderRight: h==="right" ? "2px solid #c8ff00" : "none",
                    }} />
                  ))}

                  {/* Header */}
                  <div style={{ position:"relative", zIndex:2, background:"linear-gradient(135deg,rgba(8,18,2,.97) 0%,rgba(14,26,4,.92) 40%,rgba(6,14,1,.97) 100%)", borderBottom:"1px solid #283810", padding:"14px 22px 12px" }}>
                    <div style={{ position:"absolute", right:20, top:10, display:"flex", gap:3, opacity:.07 }}>
                      {["⬡","⬡","⬡","⬡","⬡","⬡"].map((h,i) => <span key={i} style={{ fontSize:22, color:"#c8ff00" }}>{h}</span>)}
                    </div>
                    <div style={{ fontSize:9, letterSpacing:".2em", color:"#7aaa30", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:7, display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ color:"#c8ff00" }}>⬡ SWINDON AIRSOFT</span>
                      <span style={{ color:"#3a5010" }}>◆</span>
                      <span>FIELD PASS // {new Date().getFullYear()}</span>
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, textTransform:"uppercase", letterSpacing:".06em", color:"#e8ffb0", lineHeight:1, marginBottom:5, textShadow:"0 0 30px rgba(200,255,0,.12)" }}>
                      {b.eventTitle}
                    </div>
                    <div style={{ fontSize:11, color:"#4a6820", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>
                      📅 {b.eventDate}
                    </div>
                  </div>

                  {/* Tear line */}
                  <div style={{ position:"relative", zIndex:2, display:"flex", alignItems:"center", height:24 }}>
                    <div style={{ width:14, height:28, background:"var(--bg,#0a0a0a)", borderRadius:"0 14px 14px 0", marginLeft:-1, flexShrink:0, zIndex:3 }} />
                    <div style={{ flex:1, borderTop:"1px dashed #283810" }} />
                    <div style={{ width:14, height:28, background:"var(--bg,#0a0a0a)", borderRadius:"14px 0 0 14px", marginRight:-1, flexShrink:0, zIndex:3 }} />
                  </div>

                  {/* Body */}
                  <div style={{ position:"relative", zIndex:2, padding:"14px 22px 18px", display:"flex", gap:16, alignItems:"center" }}>
                    <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:"14px 16px" }}>
                      {[
                        ["KIT TYPE", b.type === "walkOn" ? "Walk-On" : "Rental"],
                        ["UNITS", b.qty],
                        ["LEVY", b.total > 0 ? `£${b.total.toFixed(2)}` : "N/A"],
                        ["REF", b.id.slice(0,8).toUpperCase()],
                        ["STATUS", b.checkedIn ? "CLEARED" : "PENDING"],
                      ].map(([lbl, val]) => (
                        <div key={lbl}>
                          <div style={{ fontSize:8, letterSpacing:".22em", color:"#4a6820", fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase", marginBottom:3 }}>{lbl}</div>
                          <div style={{ fontSize:17, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".04em",
                            color: lbl==="STATUS" ? (b.checkedIn ? "#c8ff00" : "#4fc3f7") : "#c8e878",
                            textShadow: lbl==="STATUS" ? `0 0 14px ${b.checkedIn ? "rgba(200,255,0,.25)" : "rgba(79,195,247,.25)"}` : "none",
                          }}>{val}</div>
                        </div>
                      ))}
                      <div style={{ display:"flex", alignItems:"flex-end" }}>
                        <button onClick={printTicket} style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.25)", color:"#c8ff00", fontSize:10, fontWeight:800, padding:"5px 14px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".12em", textTransform:"uppercase" }}>
                          🖨 PRINT
                        </button>
                      </div>
                    </div>

                    <div style={{ width:1, alignSelf:"stretch", borderLeft:"1px dashed #283810", flexShrink:0 }} />

                    <div style={{ textAlign:"center", flexShrink:0 }}>
                      <div style={{ background:"#07100304", border:"2px solid #2a3a10", padding:8, display:"inline-block", boxShadow:"0 0 20px rgba(200,255,0,.06), inset 0 0 10px rgba(0,0,0,.5)" }}>
                        <QRCode value={b.id} size={92} />
                      </div>
                      <div style={{ fontSize:8, color:"#3a5818", marginTop:5, letterSpacing:".18em", fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase" }}>Scan on arrival</div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ position:"relative", zIndex:2, background:"rgba(4,8,1,.85)", borderTop:"1px solid #1a2808", padding:"6px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ fontSize:8, letterSpacing:".15em", color:"#283810", fontFamily:"'Share Tech Mono',monospace" }}>
                      MISSION ID: {b.id.toUpperCase()}
                    </div>
                    <div style={{ display:"flex", gap:"2px", alignItems:"center" }}>
                      {Array.from({length:32}, (_,i) => (
                        <div key={i} style={{ background: i % 7 === 0 ? "#3a5010" : "#1e2c08", width: i % 3 === 0 ? 3 : 2, height: 4 + Math.abs(Math.sin(i*1.37)*11), borderRadius:1 }} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "orders" && <PlayerOrders cu={cu} />}

      {tab === "vip" && (() => {
        const THREE_WEEKS = 21 * 24 * 60 * 60 * 1000;
        const expiry      = cu.vipExpiresAt ? new Date(cu.vipExpiresAt) : null;
        const now         = new Date();
        const isExpired   = expiry && expiry < now;
        const nearExpiry  = expiry && !isExpired && (expiry - now) < THREE_WEEKS;
        return (
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: ".05em" }}>VIP Membership</div>
          <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>VIP members receive 10% off all game days and shop purchases, plus UKARA ID registration. Annual membership costs <strong style={{ color: "var(--gold)" }}>£30/year</strong>.</p>
          {[
            { label: "Games Attended", value: `${gamesAttended} / 3 required`, ok: gamesAttended >= 3 },
            { label: "VIP Status", value: cu.vipStatus === "active" ? "Active" : cu.vipApplied ? "Application Pending" : "Not Applied", ok: cu.vipStatus === "active" },
            cu.vipStatus === "active" && expiry && { label: "Expires", value: expiry.toLocaleDateString("en-GB"), ok: !isExpired },
            { label: "UKARA ID", value: cu.ukara || "Not assigned", ok: !!cu.ukara },
            { label: "VIP Discount", value: "10% off game days & shop", ok: cu.vipStatus === "active" },
          ].filter(Boolean).map(({ label, value, ok }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "var(--bg4)", borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
              <span className="text-muted">{label}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{value} <span style={{ color: ok ? "var(--accent)" : "var(--red)" }}>{ok ? "✓" : "✗"}</span></span>
            </div>
          ))}
          {/* Active — near expiry: show renew button */}
          {cu.vipStatus === "active" && nearExpiry && (
            <div style={{ background: "rgba(200,160,0,.08)", border: "1px solid rgba(200,160,0,.3)", padding: "14px 16px", marginTop: 8, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--gold)", marginBottom: 6 }}>
                ⚠ VIP expires {expiry.toLocaleDateString("en-GB")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Renew now to keep your discount and UKARA registration.</div>
              <button className="btn btn-gold" style={{ width: "100%" }} onClick={() => setPage("vip")}>
                Renew VIP — £30/year →
              </button>
            </div>
          )}
          {/* Active — not near expiry */}
          {cu.vipStatus === "active" && !nearExpiry && (
            <div className="alert alert-gold mt-2">⭐ You are an active VIP member!</div>
          )}
          {/* Expired */}
          {cu.vipStatus === "expired" && (
            <div style={{ background: "rgba(200,0,0,.07)", border: "1px solid rgba(200,0,0,.25)", padding: "14px 16px", marginTop: 8, borderRadius: 4 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 14, color: "var(--red)", marginBottom: 6 }}>✗ VIP Membership Expired</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Your membership has lapsed. Renew to restore your benefits.</div>
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setPage("vip")}>
                Renew VIP — £30/year →
              </button>
            </div>
          )}
          {canApplyVip && cu.vipStatus !== "expired" && (
            <button className="btn btn-gold mt-2" style={{ width:"100%" }} onClick={() => setPage("vip")}>
              Apply &amp; Pay for VIP Membership — £30/year →
            </button>
          )}
          {cu.vipApplied && cu.vipStatus !== "active" && <div className="alert alert-blue mt-2">⏳ Application pending admin review</div>}
          {!canApplyVip && !cu.vipApplied && cu.vipStatus === "none" && (
            <div className="alert alert-gold mt-2">Need {Math.max(0, 3 - gamesAttended)} more game(s) to be eligible for VIP.</div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════

function AdminPanel({ data, cu, save, updateUser, updateEvent, showToast, setPage, refresh }) {
  const getInitialSection = () => {
    const parts = window.location.hash.replace("#","").split("/");
    const ADMIN_SECTIONS = ["dashboard","events","waivers","unsigned-waivers","players","shop",
      "leaderboard-admin","revenue","visitor-stats","gallery-admin","qa-admin","staff-admin",
      "contact-admin","messages","cash","settings"];
    return parts[0] === "admin" && ADMIN_SECTIONS.includes(parts[1]) ? parts[1] : "dashboard";
  };
  const [section, setSectionState] = useState(getInitialSection);
  const setSection = (s) => {
    setSectionState(s);
    window.location.hash = "admin/" + s;
  };

  const isMain = cu.role === "admin";

  const hasPerm = (p) => isMain || cu.permissions?.includes(p) || cu.permissions?.includes("all");

  const pendingWaivers = data.users.filter(u => u.waiverPending).length;
  const pendingVip = data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length;  const deleteReqs = data.users.filter(u => u.deleteRequest).length;
  const [pendingOrders, setPendingOrders] = useState(0);
  useEffect(() => {
    const fetchPending = () =>
      api.shopOrders.getAll()
        .then(orders => setPendingOrders(orders.filter(o => o.status === "pending").length))
        .catch(() => {});
    fetchPending();
    // Refresh every 2 minutes so badge stays current
    const interval = setInterval(fetchPending, 120000);
    return () => clearInterval(interval);
  }, []);
  const unsigned = data.users.filter(u => u.role === "player" && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear())).length;
  const upcomingEvents = data.events.filter(e => e.published && new Date(e.date) >= new Date()).length;
  const totalBookings = data.events.flatMap(e => e.bookings).length;
  const checkins = data.events.flatMap(e => e.bookings).filter(b => b.checkedIn).length;

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "📊", group: "OPERATIONS" },
    { id: "events", label: "Events & Bookings", icon: "📅", badge: totalBookings, badgeColor: "blue", group: "OPERATIONS" },
    { id: "players", label: "Players", icon: "👥", badge: pendingVip > 0 ? pendingVip : (deleteReqs > 0 ? deleteReqs : null), badgeColor: pendingVip > 0 ? "gold" : "", group: null },
    { id: "shop", label: "Shop", icon: "🛒", badge: pendingOrders, badgeColor: "red", group: null },
    { id: "leaderboard-admin", label: "Leaderboard", icon: "🏆", group: null },
    { id: "revenue", label: "Revenue", icon: "💰", group: "ANALYTICS" },
    { id: "visitor-stats", label: "Visitor Stats", icon: "📈", group: null },
    { id: "gallery-admin", label: "Gallery", icon: "🖼", group: null },
    { id: "qa-admin", label: "Q&A", icon: "❓", group: null },
    { id: "staff-admin", label: "Staff", icon: "🪖", group: null },
    { id: "contact-admin", label: "Contact Depts", icon: "✉️", group: null },
    { id: "messages", label: "Site Messages", icon: "📢", group: null },
    { id: "cash", label: "Cash Sales", icon: "💵", group: "TOOLS" },
    { id: "settings", label: "Settings", icon: "⚙️", group: "SYSTEM" },
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
          {section === "events" && <AdminEventsBookings data={data} save={save} updateEvent={updateEvent} updateUser={updateUser} showToast={showToast} />}
          {section === "waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "unsigned-waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} filterUnsigned />}
          {section === "players" && <AdminPlayers data={data} save={save} updateUser={updateUser} showToast={showToast} />}
          {section === "shop" && <AdminShop data={data} save={save} showToast={showToast} />}
          {section === "leaderboard-admin" && <AdminLeaderboard data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "revenue" && <AdminRevenue data={data} />}
          {section === "visitor-stats" && <AdminVisitorStats />}
          {section === "gallery-admin" && <AdminGallery data={data} save={save} showToast={showToast} />}
          {section === "qa-admin" && <AdminQA data={data} save={save} showToast={showToast} />}
          {section === "staff-admin" && <AdminStaff showToast={showToast} />}
          {section === "contact-admin" && <AdminContactDepts showToast={showToast} save={save} />}
          {section === "messages" && <AdminMessages data={data} save={save} showToast={showToast} />}
          {section === "cash" && <AdminCash data={data} cu={cu} showToast={showToast} />}
          {section === "settings" && <AdminSettings showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────
function AdminDash({ data, setSection }) {
  const allBookings = data.events.flatMap(e => e.bookings);
  const revenue = allBookings.filter(b => !b.paypalOrderId?.startsWith("ADMIN-MANUAL-")).reduce((s, b) => s + b.total, 0);
  const checkins = allBookings.filter(b => b.checkedIn).length;
  const players = data.users.filter(u => u.role === "player").length;
  const unsigned = data.users.filter(u => u.role === "player" && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear())).length;
  const activeEvents = data.events.filter(e => e.published && new Date(e.date) >= new Date()).length;
  const pendingWaivers = data.users.filter(u => u.waiverPending).length;

  // Weekly bookings bar chart
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const weekCounts = [0, 0, 0, 0, 0, 0, 0];
  allBookings.forEach(b => {
    const weekday = new Date(b.date).getDay();
    weekCounts[(weekday + 6) % 7]++;
  });
  const maxBar = Math.max(...weekCounts, 1);

  const alerts = [
    unsigned > 0 && { msg: `${unsigned} player(s) with unsigned waivers.`, section: "unsigned-waivers" },
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
      const { error } = await supabase.from('bookings').delete().eq('id', delConfirm.id);
      if (error) throw new Error(error.message);
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
                    const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
                    const label = ex ? (selectedVariant ? `${ex.name} — ${selectedVariant.name}` : ex.name) : key;
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
        const currentBooking = viewBooking;
        const extras = Object.entries(currentBooking.extras || {}).filter(([,v]) => v > 0);
        const ticketLabel = currentBooking.type === "walkOn" ? "Walk-On" : "Rental Package";
        const ticketPrice = currentBooking.type === "walkOn" ? currentBooking.eventObj?.walkOnPrice : currentBooking.eventObj?.rentalPrice;
        return (
          <div className="overlay" onClick={() => setViewBooking(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()}>
              <div className="modal-title">🎟 Booking Details</div>

              {/* Header info */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px 24px", background:"#0d0d0d", border:"1px solid #2a2a2a", padding:16, marginBottom:16, fontSize:13 }}>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>PLAYER</span><div style={{ fontWeight:700, marginTop:3 }}>{currentBooking.userName}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>EVENT</span><div style={{ fontWeight:700, marginTop:3 }}>{currentBooking.eventTitle}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>DATE</span><div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, marginTop:3 }}>{gmtShort(currentBooking.date)}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>STATUS</span><div style={{ marginTop:3 }}>{currentBooking.checkedIn ? <span className="tag tag-green">✓ Checked In</span> : <span className="tag tag-blue">Booked</span>}</div></div>
              </div>

              {/* Order breakdown */}
              <div style={{ border:"1px solid #2a2a2a", marginBottom:16 }}>
                <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #2a2a2a" }}>ORDER</div>
                <div style={{ padding:"0 14px" }}>
                  {/* Ticket */}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 }}>
                    <span>{currentBooking.type === "walkOn" ? "🎯" : "🪖"} {ticketLabel} ×{currentBooking.qty}</span>
                    <span style={{ color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>£{(Number(ticketPrice) * currentBooking.qty).toFixed(2)}</span>
                  </div>
                  {/* Extras */}
                  {extras.length > 0 && extras.map(([key, qty]) => {
                    const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
                    const ex = currentBooking.eventObj?.extras?.find(e => e.id === extraId);
                    const lp = (data?.shop || []).find(p => p.id === ex?.productId);
                    const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
                    const label = ex ? (selectedVariant ? `${ex.name} — ${selectedVariant.name}` : ex.name) : key;
                    const unitPrice = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : 0);
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
                    <span style={{ color:"var(--accent)" }}>£{currentBooking.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="gap-2">
                <button className="btn btn-ghost" onClick={() => setViewBooking(null)}>Close</button>
                <button className="btn btn-ghost" onClick={() => { setViewBooking(null); openEdit(currentBooking); }}>Edit Booking</button>
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
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="events" && ["events","bookings","checkin"].includes(p[2]) ? p[2] : "events";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/events/" + t; };

  // ── Events state ──
  const [modal, setModal] = useState(null);
  const [viewId, setViewId] = useState(null);
  const blank = { title: "", date: "", time: "09:00", endTime: "17:00", location: "", description: "", walkOnSlots: 40, rentalSlots: 20, walkOnPrice: 25, rentalPrice: 35, banner: "", mapEmbed: "", extras: [], published: true, vipOnly: false };
  const [form, setForm] = useState(blank);
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));
  const f = setField;

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
      const checkedInUser = data.users.find(x => x.id === booking.userId);
      if (checkedInUser) updateUser(checkedInUser.id, { gamesAttended: actualCount });
      showToast(`✅ ${booking.userName} checked in! Games: ${actualCount}`);
    } catch (e) {
      showToast("Check-in failed: " + e.message, "red");
    }
  };

  const manualCheckin = () => {
    if (!ev || !manual.trim()) return;
    const foundBooking = ev.bookings.find(x =>
      x.userName.toLowerCase().includes(manual.toLowerCase()) || x.id === manual.trim()
    );
    if (!foundBooking) { showToast("Booking not found", "red"); return; }
    if (foundBooking.checkedIn) { showToast("Already checked in", "gold"); return; }
    doCheckin(foundBooking, ev); setManual("");
  };

  const onQRScan = (code) => {
    setScanning(false);
    for (const evObj of data.events) {
      const scannedBooking = evObj.bookings.find(x => x.id === code);
      if (b) {
        if (scannedBooking.checkedIn) { showToast(`${scannedBooking.userName} already checked in`, "gold"); return; }
        doCheckin(b, evObj); return;
      }
    }
    showToast("QR code not recognised", "red");
  };

  const downloadList = () => {
    if (!ev) return;
    const rows = ["Name,Type,Qty,Total,Checked In",
      ...ev.bookings.map(b => `${scannedBooking.userName},${b.type},${b.qty},${b.total.toFixed(2)},${scannedBooking.checkedIn}`)
    ].join("\n");
    const downloadLink = document.createElement("a");
    downloadLink.href = "data:text/csv," + encodeURIComponent(rows);
    downloadLink.download = ev.title + "-players.csv"; downloadLink.click();
    showToast("Player list downloaded!");
  };

  // ── Events logic ──
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setSavingEvent(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const printPlayerList = (ev) => {
    const bookings = ev.bookings || [];
    const ticketTypes = {};
    const extraCounts = {};
    bookings.forEach(b => {
      ticketTypes[b.type] = (ticketTypes[b.type] || 0) + (b.qty || 1);
      if (b.extras) Object.entries(b.extras).forEach(([k, v]) => {
        if (v) extraCounts[k] = (extraCounts[k] || 0) + (typeof v === 'number' ? v : 1);
      });
    });
    const rows = bookings.map(b => `
      <tr>
        <td>${b.userName || 'Unknown'}</td>
        <td>${b.type}</td>
        <td>${b.qty || 1}</td>
        <td>${b.checkedIn ? '✓' : ''}</td>
        <td style="font-size:11px">${b.extras ? Object.entries(b.extras).filter(([,v])=>v).map(([k,v])=>`${k}${typeof v==='number'?` x${v}`:''}`).join(', ') : '—'}</td>
      </tr>`).join('');
    const ticketSummary = Object.entries(ticketTypes).map(([t,c])=>`<span style="margin-right:16px"><strong>${c}</strong> × ${t}</span>`).join('');
    const extraSummary = Object.entries(extraCounts).length ? Object.entries(extraCounts).map(([k,v])=>`<span style="margin-right:16px"><strong>${v}</strong> × ${k}</span>`).join('') : 'None';
    const win = window.open('','_blank','width=900,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>Player List — ${ev.title}</title><style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:Arial,sans-serif;padding:32px;color:#111;}
      h1{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
      .meta{font-size:13px;color:#555;margin-bottom:20px;}
      .summary{background:#f5f5f5;border:1px solid #ddd;padding:14px 16px;border-radius:4px;margin-bottom:20px;}
      .summary h3{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px;}
      .summary p{font-size:14px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th{background:#111;color:#fff;padding:8px 12px;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;}
      td{padding:8px 12px;border-bottom:1px solid #eee;}
      tr:nth-child(even) td{background:#fafafa;}
      .footer{margin-top:20px;font-size:11px;color:#aaa;text-align:right;}
      @media print{body{padding:16px;}}
    </style></head><body>
      <h1>Player List — ${ev.title}</h1>
      <div class="meta">${new Date(ev.date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${bookings.length} player(s) booked</div>
      <div class="summary">
        <h3>Ticket Types</h3><p>${ticketSummary || 'None'}</p>
        <h3 style="margin-top:10px">Game Day Extras</h3><p>${extraSummary}</p>
      </div>
      <table>
        <thead><tr><th>Player</th><th>Ticket Type</th><th>Qty</th><th>Checked In</th><th>Extras</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Printed ${new Date().toLocaleString('en-GB')} · Swindon Airsoft</div>
      <script>window.onload=()=>window.print();<\/script>
    </body></html>`);
    win.document.close();
  };

  const withTimeout = (promise, ms = 30000) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out after 30s — check your internet connection and Supabase is reachable")), ms))]);

  const saveEvent = async () => {
    if (!form.title || !form.date) { showToast("Title and date required", "red"); return; }
    setSavingEvent(true);
    try {
      if (modal === "new") {
        const { _descTab: _dt, _emailUsers, ...createForm } = form;
        const created = await withTimeout(api.events.create(createForm));
        if (form.banner && form.banner.startsWith("data:") && created?.id) {
          try {
            const res = await fetch(form.banner);
            const blob = await res.blob();
            const file = new File([blob], "banner.jpg", { type: "image/jpeg" });
            await api.events.uploadBanner(created.id, file);
          } catch (bannerErr) {
            console.warn("Banner upload failed (non-fatal):", bannerErr);
          }
        }
        // Email all users if checkbox was ticked
        if (form._emailUsers && created) {
          const evToSend = { ...createForm, id: created.id };
          showToast("Sending announcement emails…", "gold");
          try {
            const results = await sendNewEventEmail({ ev: evToSend, users: data.users });
            showToast(`📧 Emails sent: ${results.sent} delivered${results.failed > 0 ? `, ${results.failed} failed` : ""}`, results.failed > 0 ? "gold" : "");
          } catch (emailErr) {
            showToast("Event saved but emails failed: " + emailErr.message, "gold");
          }
        }
      } else {
        const { _descTab, ...formToSave } = form;
        await withTimeout(api.events.update(formToSave.id, formToSave));
        if (form.banner && form.banner.startsWith("data:") && form.id) {
          try {
            const res = await fetch(form.banner);
            const blob = await res.blob();
            const file = new File([blob], "banner.jpg", { type: "image/jpeg" });
            await api.events.uploadBanner(form.id, file);
          } catch (bannerErr) {
            console.warn("Banner upload failed (non-fatal):", bannerErr);
          }
        }
      }
      const evList = await withTimeout(api.events.getAll());
      save({ events: evList });
      showToast("Event saved!");
      setModal(null);
    } catch (e) {
      console.error("saveEvent failed:", e);
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
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
        const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        const price = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
        return s + price * qty;
      }, 0);
      const newBooking = await api.bookings.create({
        eventId: targetEv.id,
        userId: player.id,
        userName: player.name,
        type: addBookingForm.type,
        qty: addBookingForm.qty,
        extras: Object.fromEntries(Object.entries(addBookingForm.extras).filter(([,v]) => v > 0)),
        total: 0, // Manual bookings don't count toward revenue
        paypalOrderId: "ADMIN-MANUAL-" + Date.now(),
      });
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast(`Booking added for ${player.name}!`);
      setAddBookingModal(false);
      setAddBookingForm({ userId: "", type: "walkOn", qty: 1, extras: {} });
      // Send ticket confirmation email using real booking ID
      try {
        const emailBookings = [{ id: newBooking.id, type: addBookingForm.type, qty: addBookingForm.qty, total: 0 }];
        await sendTicketEmail({ cu: player, ev: targetEv, bookings: emailBookings, extras: Object.fromEntries(Object.entries(addBookingForm.extras).filter(([,v]) => v > 0)) });
        showToast("📧 Confirmation email sent to " + player.email);
      } catch (emailErr) {
        showToast("Email failed: " + (emailErr?.message || String(emailErr)), "red");
      }
    } catch (e) {
      showToast("Failed: " + (e.message || String(e)), "red");
    } finally {
      setAddBookingBusy(false);
    }
  };

  const clone = async (ev) => {
    try {
      // Strip all DB-generated fields; only keep content fields
      const cloneData = {
        title:        ev.title + " (Copy)",
        date:         ev.date,
        time:         ev.time,
        location:     ev.location,
        description:  ev.description,
        walkOnSlots:  ev.walkOnSlots,
        rentalSlots:  ev.rentalSlots,
        walkOnPrice:  ev.walkOnPrice,
        rentalPrice:  ev.rentalPrice,
        published:    false,
        vipOnly:      ev.vipOnly || false,
        mapEmbed:     ev.mapEmbed || "",
        // Only carry URL banners — strip base64
        banner:       (ev.banner && !ev.banner.startsWith("data:")) ? ev.banner : "",
        // Strip old extra IDs so DB assigns new ones
        extras:       (ev.extras || []).map(({ id: _id, ...ex }) => ex),
      };
      await api.events.create(cloneData);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("✓ Event cloned as draft!");
    } catch (e) {
      console.error("Clone failed:", e);
      showToast("Clone failed: " + (e.message || String(e)), "red");
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
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:4 }}>
              <div className="modal-title" style={{ margin:0 }}>📅 {viewEv.title}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => printPlayerList(viewEv)}>🖨️ Print Player List</button>
            </div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>{viewEv.date} @ {viewEv.time} GMT | {viewEv.location} · {viewEv.bookings.length} booked</p>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {viewEv.bookings.map(b => (
                  <tr key={b.id}>
                    <td>{b.userName}</td>
                    <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                    <td>{b.qty}</td>
                    <td style={{fontSize:11,color:"var(--muted)"}}>{b.extras ? Object.entries(b.extras).filter(([,v])=>v).map(([k,v])=>`${k}${typeof v==='number'?` x${v}`:''}`).join(', ') : '—'}</td>
                    <td className="text-green">£{b.total.toFixed(2)}</td>
                    <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                  </tr>
                ))}
                {viewEv.bookings.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No bookings</td></tr>}
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
              <div className="form-group"><label>Start Time (GMT)</label><input type="time" value={form.time} onChange={e => f("time", e.target.value)} /></div>
              <div className="form-group"><label>End Time (GMT)</label><input type="time" value={form.endTime||""} onChange={e => f("endTime", e.target.value)} /></div>
              <div className="form-group"><label>Location</label><input value={form.location} onChange={e => f("location", e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <div style={{ border:"1px solid var(--border)", borderRadius:4, overflow:"hidden" }}>
                {/* Toolbar */}
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", padding:"6px 8px", background:"#1a1a1a", borderBottom:"1px solid var(--border)" }}>
                  {[
                    { label:"B", title:"Bold", wrap:["**","**"] },
                    { label:"I", title:"Italic", wrap:["*","*"] },
                    { label:"H2", title:"Heading 2", line:"## " },
                    { label:"H3", title:"Heading 3", line:"### " },
                    { label:"•", title:"Bullet list", line:"- " },
                    { label:"—", title:"Divider", insert:"\n---\n" },
                  ].map(btn => (
                    <button key={btn.label} title={btn.title} type="button"
                      style={{ background:"#2a2a2a", border:"1px solid #333", color:"#ccc", width:30, height:26, fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:2 }}
                      onClick={() => {
                        const ta = document.getElementById("evt-desc-ta");
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        const val = form.description;
                        let newVal, cursor;
                        if (btn.wrap) {
                          newVal = val.slice(0,start) + btn.wrap[0] + val.slice(start,end) + btn.wrap[1] + val.slice(end);
                          cursor = end + btn.wrap[0].length + btn.wrap[1].length;
                        } else if (btn.line) {
                          const lineStart = val.lastIndexOf("\n", start-1)+1;
                          newVal = val.slice(0,lineStart) + btn.line + val.slice(lineStart);
                          cursor = start + btn.line.length;
                        } else {
                          newVal = val.slice(0,start) + btn.insert + val.slice(end);
                          cursor = start + btn.insert.length;
                        }
                        f("description", newVal);
                        setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
                      }}
                    >{btn.label}</button>
                  ))}
                  <span style={{ fontSize:10, color:"#555", marginLeft:4, alignSelf:"center" }}>Markdown supported · **bold** *italic* ## heading - list ---</span>
                </div>
                {/* Editor / Preview toggle */}
                {(() => {
                  const [descTab, setDescTab] = [form._descTab||"edit", v => f("_descTab", v)];
                  return (
                    <>
                      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"#111" }}>
                        {["edit","preview"].map(t => (
                          <button key={t} type="button" onClick={() => setDescTab(t)}
                            style={{ padding:"5px 16px", fontSize:11, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", background:"none", border:"none", borderBottom: descTab===t ? "2px solid var(--accent)" : "2px solid transparent", color: descTab===t ? "var(--accent)" : "#555", cursor:"pointer" }}>
                            {t==="edit"?"✏ EDIT":"👁 PREVIEW"}
                          </button>
                        ))}
                      </div>
                      {descTab !== "preview"
                        ? <textarea id="evt-desc-ta" rows={8} value={form.description} onChange={e => f("description", e.target.value)} style={{ width:"100%", background:"#111", border:"none", padding:"10px", resize:"vertical", color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:"none" }} />
                        : <div style={{ minHeight:160, padding:"10px 14px", background:"#0d0d0d", color:"var(--muted)", fontSize:14, lineHeight:1.8 }} dangerouslySetInnerHTML={{ __html: renderMd(form.description) || "<span style='color:#444'>Nothing to preview yet...</span>" }} />
                      }
                    </>
                  );
                })()}
              </div>
            </div>
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
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="checkbox" id="epub" checked={form.published} onChange={e => f("published", e.target.checked)} />
                <label htmlFor="epub" style={{ cursor:"pointer", fontSize:13 }}>Published (visible to players)</label>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="checkbox" id="eviponly" checked={form.vipOnly || false} onChange={e => f("vipOnly", e.target.checked)} />
                <label htmlFor="eviponly" style={{ cursor:"pointer", fontSize:13 }}>
                  <span style={{ color:"var(--gold)", fontWeight:700 }}>⭐ VIP Members Only</span>
                  <span style={{ color:"var(--muted)", fontSize:11, marginLeft:6 }}>— visible to all but only VIPs can book</span>
                </label>
              </div>
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

            {modal === "new" && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="email-announce"
                  checked={!!form._emailUsers}
                  onChange={e => f("_emailUsers", e.target.checked)}
                  style={{ accentColor: "#c8ff00", width: 16, height: 16 }}
                />
                <label htmlFor="email-announce" style={{ cursor: "pointer", fontSize: 13, color: "#8aaa60" }}>
                  📧 Send announcement email to all players <span style={{ color: "#3a5010", fontSize: 11 }}>({(data.users||[]).filter(u => u.email && u.role !== "admin").length} recipients)</span>
                </label>
              </div>
            )}
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
          const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
          const price = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
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
                    Waiver: {selectedPlayer.waiverSigned === true && selectedPlayer.waiverYear === new Date().getFullYear()
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
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="players" && ["all","vip","del","waivers"].includes(p[2]) ? p[2] : "all";
  };
  const [edit, setEdit] = useState(null);
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/players/" + t; };
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [localUsers, setLocalUsers] = useState(null); // null = not yet fetched
  const [playerSearch, setPlayerSearch] = useState("");

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
    loadUsers().catch(() => {}); // refresh in background — non-blocking
  };

  // Use local (fresh) users if available, fall back to global data.users
  const allUsers = localUsers ?? data.users;
  const players = allUsers.filter(u => u.role !== "admin");
  const vipApps = players.filter(u => u.vipApplied && u.vipStatus !== "active");
  const filteredPlayers = playerSearch.trim()
    ? players.filter(u => {
        const q = playerSearch.toLowerCase();
        return u.name?.toLowerCase().includes(q) ||
               u.email?.toLowerCase().includes(q) ||
               u.phone?.toLowerCase().includes(q) ||
               u.ukara?.toLowerCase().includes(q);
      })
    : players;

  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setSavingEdit(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const [delAccountConfirm, setDelAccountConfirm] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [vipApproveModal, setVipApproveModal] = useState(null); // user being approved
  const [vipUkara, setVipUkara] = useState("");
  const [vipApproveBusy, setVipApproveBusy] = useState(false);
  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await api.profiles.delete(delAccountConfirm.id);
      save({ users: data.users.filter(x => x.id !== delAccountConfirm.id) });
      showToast(`Account deleted: ${delAccountConfirm.name}`, "red");
      setDelAccountConfirm(null);
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setDeletingAccount(false); }
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      // Determine vip_applied and vip_expires_at based on status change
      let vipApplied = edit.vipApplied ?? false;
      let vipExpiresAt = edit.vipExpiresAt || null;
      if (edit.vipStatus === "none") {
        // Demoting to None — clear applied flag, player must go through the full apply+pay flow again
        vipApplied   = false;
        vipExpiresAt = null;
      } else if (edit.vipStatus === "active" && !edit.vipExpiresAt) {
        // Manually setting active without an expiry — set 1 year from now
        const exp = new Date();
        exp.setFullYear(exp.getFullYear() + 1);
        vipExpiresAt = exp.toISOString();
      } else if (edit.vipStatus === "expired") {
        vipExpiresAt = null;
      }

      const { error } = await supabase.from('profiles').update({
        name:           edit.name,
        email:          edit.email,
        phone:          edit.phone || '',
        games_attended: edit.gamesAttended,
        vip_status:     edit.vipStatus,
        vip_applied:    vipApplied,
        vip_expires_at: vipExpiresAt,
        ukara:          edit.ukara || '',
        credits:        Number(edit.credits) || 0,
        address:        edit.address || '',
        delete_request: edit.deleteRequest || false,
      }).eq('id', edit.id);
      if (error) throw new Error(error.message);
      // Refresh from DB and update global state
      const allProfiles = await api.profiles.getAll();
      const updated = allProfiles.map(normaliseProfile);
      setLocalUsers(updated);
      save({ users: updated });
      showToast("Player updated!");
      setEdit(null);
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
      setSavingEdit(false);
    }
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
        <button className={`nav-tab ${tab === "waivers" ? "active" : ""}`} onClick={() => setTab("waivers")}>
          Waivers {allUsers.filter(u => u.waiverPending).length > 0 && <span style={{ background: "var(--gold)", color: "#000", borderRadius: 10, padding: "1px 7px", fontSize: 10, marginLeft: 6, fontWeight: 700 }}>{allUsers.filter(u => u.waiverPending).length}</span>}
        </button>
      </div>

      {tab === "all" && (
        <div className="card">
          {localUsers === null && <div style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Loading players…</div>}
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              placeholder="Search by name, email, phone or UKARA…"
              style={{ flex: 1, fontSize: 13 }}
            />
            {playerSearch && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPlayerSearch("")}>✕ Clear</button>
            )}
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {filteredPlayers.length} / {players.length}
            </span>
          </div>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Games</th><th>VIP / UKARA</th><th>Waiver</th><th>Credits</th><th></th></tr></thead>
            <tbody>
              {filteredPlayers.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.gamesAttended}</td>
                  <td>
                    {u.vipStatus === "active" ? <span className="tag tag-gold">⭐ VIP</span> : u.vipApplied ? <span className="tag tag-blue">Applied</span> : "—"}
                    {u.vipStatus === "active" && u.vipExpiresAt && (
                      <span style={{ fontSize: 10, color: new Date(u.vipExpiresAt) < new Date() ? "var(--red)" : "var(--muted)", marginLeft: 4, fontFamily: "'Share Tech Mono',monospace" }}>
                        exp {new Date(u.vipExpiresAt).toLocaleDateString("en-GB")}
                      </span>
                    )}
                    {u.ukara && <span className="mono" style={{ fontSize: 10, color: "var(--accent)", marginLeft: 6 }}>{u.ukara}</span>}
                  </td>
                  <td>{u.waiverSigned === true && u.waiverYear === new Date().getFullYear() ? <span className="tag tag-green">✓</span> : <span className="tag tag-red">✗</span>}</td>
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
              <thead><tr><th>Player</th><th>Email</th><th>Games</th><th>Joined</th><th>Payment</th><th>Actions</th></tr></thead>
              <tbody>
                {vipApps.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                    <td style={{ color: u.gamesAttended >= 3 ? "var(--accent)" : "var(--red)" }}>{u.gamesAttended} / 3</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{u.joinDate}</td>
                    <td>
                      <span className="tag tag-green" style={{ fontSize:11 }}>✓ £30 paid</span>
                    </td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-primary" onClick={() => {
                          setVipUkara(`UKARA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100).padStart(3,"0")}`);
                          setVipApproveModal(u);
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
                        <button className="btn btn-sm btn-danger" onClick={() => setDelAccountConfirm(u)}>Delete Account</button>
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

      {tab === "waivers" && <AdminWaivers data={{ ...data, users: allUsers }} updateUser={updateUserAndRefresh} showToast={showToast} embedded />}

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
                {edit.vipStatus === "none" && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Player will need to apply and pay again to rejoin VIP.</div>
                )}
                {edit.vipStatus === "active" && edit.vipExpiresAt && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Expires: <span style={{ color: new Date(edit.vipExpiresAt) < new Date() ? "var(--red)" : "var(--accent)" }}>
                      {new Date(edit.vipExpiresAt).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                )}
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
                  const addrLines = (edit.address || "").split("\n");
                  while (addrLines.length <= idx) p.push("");
                  p[idx] = val;
                  setEdit(prev => ({ ...prev, address: addrLines.join("\n") }));
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
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setEdit(null)} disabled={savingEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {delAccountConfirm && (
        <div className="overlay" onClick={() => !deletingAccount && setDelAccountConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Account?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 4px" }}>
              Permanently delete the account for <strong style={{ color: "var(--text)" }}>{delAccountConfirm.name}</strong>?
            </p>
            <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 20 }}>
              ⚠️ This will delete their profile, waiver data, and auth account. Their booking history will be unlinked. This cannot be undone.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingAccount} onClick={confirmDeleteAccount}>
                {deletingAccount ? "Deleting…" : "Yes, Delete Account"}
              </button>
              <button className="btn btn-ghost" disabled={deletingAccount} onClick={() => setDelAccountConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {vipApproveModal && (
        <div className="overlay" onClick={() => !vipApproveBusy && setVipApproveModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⭐ Approve VIP — {vipApproveModal.name}</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 16px" }}>
              Set the UKARA ID for this player. A unique ID has been pre-generated — edit it if needed.
            </p>
            <div className="form-group">
              <label>UKARA ID</label>
              <input
                value={vipUkara}
                onChange={e => setVipUkara(e.target.value)}
                placeholder="e.g. UKARA-2025-042"
                style={{ fontFamily: "'Share Tech Mono',monospace" }}
                disabled={vipApproveBusy}
              />
            </div>
            <div className="gap-2" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" disabled={vipApproveBusy || !vipUkara.trim()} onClick={async () => {
                setVipApproveBusy(true);
                try {
                  // Step 1: read the current games_attended from DB before touching anything
                  const { data: freshProfile, error: readErr } = await supabase
                    .from('profiles').select('games_attended').eq('id', vipApproveModal.id).single();
                  if (readErr) throw new Error(readErr.message);
                  const preservedCount = freshProfile?.games_attended ?? vipApproveModal.gamesAttended ?? 0;

                  // Step 2: write the VIP fields
                  const vipExpiry = new Date();
                  vipExpiry.setFullYear(vipExpiry.getFullYear() + 1);
                  const { error: vipErr } = await supabase.from('profiles').update({
                    vip_status:     "active",
                    vip_applied:    true,
                    ukara:          vipUkara.trim(),
                    vip_expires_at: vipExpiry.toISOString(),
                  }).eq('id', vipApproveModal.id);
                  if (vipErr) throw new Error(vipErr.message);

                  // Step 3: immediately restore games_attended in case any trigger reset it
                  await supabase.from('profiles')
                    .update({ games_attended: preservedCount })
                    .eq('id', vipApproveModal.id);

                  await loadUsers();
                  showToast(`✅ VIP approved for ${vipApproveModal.name}! UKARA: ${vipUkara.trim()}`);
                  setVipApproveModal(null);
                } catch (e) {
                  showToast("Approval failed: " + e.message, "red");
                } finally {
                  setVipApproveBusy(false);
                }
              }}>
                {vipApproveBusy ? "Approving…" : "✓ Confirm Approval"}
              </button>
              <button className="btn btn-ghost" disabled={vipApproveBusy} onClick={() => setVipApproveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Waivers ─────────────────────────────────────────
function AdminWaivers({ data, updateUser, showToast, embedded, filterUnsigned }) {
  const [view, setView] = useState(null);
  const [localUsers, setLocalUsers] = useState(null);

  useEffect(() => {
    api.profiles.getAll()
      .then(list => setLocalUsers(list.map(normaliseProfile)))
      .catch(() => {});
  }, []);

  const allUsers = localUsers ?? data.users;
  const withWaiver = allUsers.filter(u => u.role !== 'admin' && (u.waiverData || u.waiverPending));
  const displayUsers = filterUnsigned
    ? allUsers.filter(u => u.role === 'player' && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear()))
    : withWaiver;

  const approve = (u) => {
    updateUser(u.id, { waiverData: u.waiverPending, waiverPending: null, waiverSigned: true, waiverYear: new Date().getFullYear() });
    showToast("Waiver changes approved!"); setView(null);
  };
  const reject = (u) => {
    updateUser(u.id, { waiverPending: null }); showToast("Changes rejected"); setView(null);
  };

  const vw = view ? allUsers.find(u => u.id === view) : null;

  const waiverFields = (w) => [
    ["Name", w.name],
    ["DOB", w.dob],
    ["Address", [w.addr1, w.addr2, w.city, w.county, w.postcode, w.country].filter(Boolean).join(", ") || "—"],
    ["Emergency", w.emergencyName ? `${w.emergencyName} · ${w.emergencyPhone}` : "—"],
    ["Medical", w.medical || "None"],
    ["Minor", w.isChild ? `Yes — Guardian: ${w.guardian}` : "No"],
    ["Signed", gmtShort(w.date)],
  ];

  return (
    <div>
      {!embedded && <div className="page-header"><div><div className="page-title">{filterUnsigned ? "Unsigned Waivers" : "Waivers"}</div><div className="page-sub">{filterUnsigned ? `${displayUsers.length} player(s) without a signed waiver` : `Valid for ${new Date().getFullYear()} calendar year`}</div></div></div>}
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Player</th><th>Signed</th><th>Year</th><th>Players</th><th>Pending</th><th></th></tr></thead>
          <tbody>
            {displayUsers.map(u => {
              const totalWaivers = 1 + (u.extraWaivers?.length || 0);
              return (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.waiverSigned ? <span className="tag tag-green">✓</span> : <span className="tag tag-red">✗</span>}</td>
                  <td>{u.waiverYear || "—"}</td>
                  <td>{totalWaivers > 1 ? <span className="tag tag-blue">{totalWaivers} players</span> : <span style={{ color:"var(--muted)", fontSize:12 }}>1</span>}</td>
                  <td>{u.waiverPending ? <span className="tag tag-gold">⚠ Pending</span> : "—"}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => setView(u.id)}>View</button></td>
                </tr>
              );
            })}
            {displayUsers.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>{filterUnsigned ? "All players have signed waivers ✓" : "No waivers on file"}</td></tr>}
          </tbody>
        </table></div>
      </div>

      {vw && (() => {
        const allWaivers = [vw.waiverData, ...(vw.extraWaivers || [])].filter(Boolean);
        return (
          <div className="overlay" onClick={() => setView(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
              <div className="modal-title">📋 Waivers — {vw.name}</div>

              {/* Player tabs */}
              {allWaivers.length > 1 && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:16 }}>
                  {allWaivers.map((w, i) => (
                    <span key={i} style={{ padding:"4px 12px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", textTransform:"uppercase", background:"var(--accent)", color:"#000", borderRadius:2 }}>
                      {w.name || `Player ${i+1}`}{i === 0 ? " ★" : ""}
                    </span>
                  ))}
                </div>
              )}

              {/* All waivers */}
              {allWaivers.map((w, i) => (
                <div key={i} style={{ marginBottom:20, paddingBottom:20, borderBottom: i < allWaivers.length - 1 ? "1px solid #2a2a2a" : "none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase" }}>
                      {allWaivers.length > 1 ? `PLAYER ${i+1}${i === 0 ? " (PRIMARY)" : " (ADDITIONAL)"}` : "WAIVER DETAILS"}
                    </div>
                    {i > 0 && (
                      <button onClick={() => {
                        const updated = (vw.extraWaivers || []).filter((_, ei) => ei !== i - 1);
                        updateUser(vw.id, { extraWaivers: updated });
                        showToast("Waiver removed");
                        setView(null);
                      }} style={{ background:"none", border:"1px solid var(--red)", color:"var(--red)", fontSize:11, padding:"2px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em" }}>
                        🗑 REMOVE
                      </button>
                    )}
                  </div>
                  {waiverFields(w).map(([k, v]) => (
                    <div key={k} style={{ display:"flex", gap:12, padding:"7px 0", borderBottom:"1px solid var(--border)", fontSize:13 }}>
                      <span className="text-muted" style={{ minWidth:140 }}>{k}:</span>
                      <span>{v}</span>
                    </div>
                  ))}
                  {w.sigData && (
                    <div style={{ marginTop:10 }}>
                      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:4, letterSpacing:".08em" }}>SIGNATURE</div>
                      <div style={{ background:"#0d0d0d", border:"1px solid #333", padding:8, display:"inline-block", borderRadius:4 }}>
                        <img src={w.sigData} alt="Signature" style={{ maxWidth:300, height:"auto", display:"block" }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Pending changes */}
              {vw.waiverPending && (
                <div style={{ marginTop:16, padding:16, background:"#1a1200", border:"1px solid #4a3800", borderRadius:4 }}>
                  <div className="alert alert-gold mb-2">⚠️ Player has submitted waiver changes for approval</div>
                  <div style={{ fontSize:11, letterSpacing:".1em", fontWeight:700, color:"var(--muted)", marginBottom:10 }}>PROPOSED CHANGES</div>
                  {waiverFields(vw.waiverPending).map(([k, v]) => {
                    const oldVal = vw.waiverData ? waiverFields(vw.waiverData).find(([ok]) => ok === k)?.[1] : null;
                    const changed = oldVal !== null && v !== oldVal;
                    return (
                      <div key={k} style={{ display:"flex", gap:12, padding: changed ? "7px 8px" : "7px 0", borderBottom:"1px solid var(--border)", fontSize:13, background: changed ? "#2d1e0a" : "transparent", borderRadius: changed ? 4 : 0 }}>
                        <span className="text-muted" style={{ minWidth:140 }}>{k}:</span>
                        <span style={{ color: changed ? "var(--gold)" : "var(--text)" }}>{v}</span>
                        {changed && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:"auto" }}>CHANGED</span>}
                      </div>
                    );
                  })}
                  <div className="gap-2 mt-2">
                    <button className="btn btn-primary" onClick={() => approve(vw)}>Approve Changes</button>
                    <button className="btn btn-danger" onClick={() => reject(vw)}>Reject</button>
                  </div>
                </div>
              )}

              <button className="btn btn-ghost mt-2" style={{ width:"100%" }} onClick={() => setView(null)}>Close</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Admin Orders (inline, used as tab inside AdminShop) ──────────
function AdminOrdersInline({ showToast }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [trackingModal, setTrackingModal] = useState(null); // { id, tracking }
  const STATUS_COLORS = { pending: "blue", processing: "gold", dispatched: "green", completed: "teal", cancelled: "red" };

  const fetchOrders = async () => {
    setLoading(true); setError(null);
    try { setOrders(await api.shopOrders.getAll()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { const ordersTimeout = setTimeout(fetchOrders, 400); return () => clearTimeout(ordersTimeout); }, []);

  const doDispatch = async (id, tracking) => {
    try {
      await api.shopOrders.updateStatus(id, "dispatched", tracking || null);
      setOrders(o => o.map(x => x.id === id ? { ...x, status: "dispatched" } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status: "dispatched" }));
      showToast("Order marked as dispatched!");
      const order = orders.find(o => o.id === id);
      const toEmail = order?.customer_email || order?.customerEmail;
      if (toEmail) {
        sendDispatchEmail({
          toEmail,
          toName:  order.customer_name || order.customerName || "Customer",
          order:   { ...order, customerAddress: order.customer_address || order.customerAddress || "" },
          items:   Array.isArray(order.items) ? order.items : [],
          tracking: tracking || null,
        }).then(() => showToast("📧 Dispatch email sent!")).catch(e => showToast("⚠️ Email failed: " + (e?.message || e?.text || JSON.stringify(e)), "red"));
      }
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    setTrackingModal(null);
  };

  const setStatus = async (id, status) => {
    if (status === "dispatched") { setTrackingModal({ id, tracking: "" }); return; }
    try {
      await api.shopOrders.updateStatus(id, status);
      setOrders(o => o.map(x => x.id === id ? { ...x, status } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status }));
      showToast("Status updated!");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const [statusTab, setStatusTab] = useState("pending");
  const STATUS_TABS = ["pending","processing","dispatched","completed","cancelled","all"];
  const visibleOrders = statusTab === "all" ? orders : orders.filter(o => o.status === statusTab);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <div style={{ fontSize:13, color:"var(--muted)" }}>{orders.length} orders · <span style={{ color:"var(--accent)" }}>£{totalRevenue.toFixed(2)}</span> total</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchOrders} disabled={loading}>🔄 Refresh</button>
      </div>
      <div className="grid-4 mb-2">
        {[
          { label: "Total Orders", val: orders.length, color: "" },
          { label: "Pending", val: orders.filter(o => o.status === "pending").length, color: "blue" },
          { label: "Dispatched", val: orders.filter(o => o.status === "dispatched").length, color: "gold" },
          { label: "Revenue", val: `£${totalRevenue.toFixed(2)}`, color: "teal" },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-val">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="nav-tabs" style={{ marginBottom:12 }}>
        {STATUS_TABS.map(t => {
          const cnt = t === "all" ? orders.length : orders.filter(o => o.status === t).length;
          return (
            <button key={t} className={`nav-tab${statusTab === t ? " active" : ""}`} onClick={() => setStatusTab(t)} style={{ textTransform:"capitalize" }}>
              {t}{cnt > 0 && <span style={{ marginLeft:5, background: statusTab===t ? "rgba(0,0,0,.3)" : "var(--border)", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{cnt}</span>}
            </button>
          );
        })}
      </div>
      {loading ? (
        <div className="card" style={{ textAlign:"center", color:"var(--muted)", padding:40 }}>Loading orders…</div>
      ) : error ? (
        <div className="card" style={{ textAlign:"center", padding:40 }}>
          <div style={{ color:"var(--red)", marginBottom:12 }}>Failed: {error}</div>
          <button className="btn btn-ghost" onClick={fetchOrders}>Retry</button>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Order ID</th><th>Date</th><th>Customer</th><th>Items</th><th>Postage</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleOrders.length === 0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--muted)", padding:30 }}>No {statusTab === "all" ? "" : statusTab + " "}orders yet</td></tr>}
              {visibleOrders.map(o => {
                const items = Array.isArray(o.items) ? o.items : [];
                return (
                  <tr key={o.id}>
                    <td className="mono" style={{ fontSize:10, color:"var(--muted)" }}>#{(o.id||"").slice(-8).toUpperCase()}</td>
                    <td className="mono" style={{ fontSize:11 }}>{gmtShort(o.created_at)}</td>
                    <td style={{ fontWeight:600 }}>
                      <button style={{ background:"none", border:"none", color:"var(--blue)", cursor:"pointer", fontWeight:700, fontFamily:"inherit", fontSize:13 }} onClick={() => setDetail(o)}>{o.customer_name}</button>
                    </td>
                    <td style={{ fontSize:12, color:"var(--muted)" }}>{items.map(i => `${i.name} ×${i.qty}`).join(", ")}</td>
                    <td style={{ fontSize:12 }}>{o.postage_name || "—"}</td>
                    <td className="text-green">£{Number(o.total).toFixed(2)}</td>
                    <td><span className={`tag tag-${STATUS_COLORS[o.status] || "blue"}`}>{o.status}</span></td>
                    <td>
                      <select value={o.status} onChange={e => setStatus(o.id, e.target.value)}
                        style={{ fontSize:12, padding:"4px 8px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:4 }}>
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
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, flexWrap:"wrap", gap:10 }}>
              <div className="modal-title" style={{ margin:0 }}>📦 Order Details</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", marginTop:2 }}>#{(detail.id||"").slice(-8).toUpperCase()}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const addr = detail.customer_address || "No address on file";
                const items = (Array.isArray(detail.items) ? detail.items : []).map(i => `${i.name} x${i.qty}`).join(", ");
                const win = window.open("", "_blank", "width=400,height=300");
                win.document.write(`<html><head><title>Postage Label</title><style>body{font-family:Arial,sans-serif;padding:24px;border:3px solid #000;margin:20px;}.to{font-size:22px;font-weight:bold;margin:16px 0 8px;}.addr{font-size:16px;line-height:1.6;white-space:pre-line;}.from{font-size:11px;color:#555;margin-top:20px;border-top:1px solid #ccc;padding-top:10px;}@media print{body{margin:0;border:none;}}</style></head><body><div style="font-size:11px;color:#888;">ORDER #${detail.id?.slice(-8).toUpperCase()} · ${gmtShort(detail.created_at)}</div><div class="to">TO:</div><div style="font-size:20px;font-weight:bold;">${detail.customer_name}</div><div class="addr">${addr}</div><div class="from">FROM: Swindon Airsoft</div><script>window.onload=()=>window.print();<\/script></body></html>`);
                win.document.close();
              }}>🖨️ Print Label</button>
            </div>
            <div className="grid-2 mb-2">
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>CUSTOMER</div><div style={{ fontWeight:700 }}>{detail.customer_name}</div></div>
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>EMAIL</div><div style={{ fontSize:13 }}>{detail.customer_email || "—"}</div></div>
              <div style={{ gridColumn:"1 / -1" }}>
                <div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>SHIPPING ADDRESS</div>
                <div style={{ fontSize:13, whiteSpace:"pre-line", background:"var(--bg4)", padding:"10px 12px", borderRadius:3, border:"1px solid var(--border)" }}>{detail.customer_address || <span style={{ color:"var(--muted)" }}>No address on file</span>}</div>
              </div>
              {detail.tracking_number && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>📮 TRACKING NUMBER</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:14, fontWeight:700, background:"#0c1009", padding:"8px 12px", borderRadius:3, border:"1px solid var(--accent)", color:"var(--accent)" }}>{detail.tracking_number}</div>
                </div>
              )}
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>STATUS</div>
                <select value={detail.status} onChange={e => setStatus(detail.id, e.target.value)}
                  style={{ fontSize:12, padding:"6px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:3, width:"100%" }}>
                  {["pending","processing","dispatched","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--muted)", marginBottom:8, letterSpacing:".1em" }}>ITEMS</div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                {(Array.isArray(detail.items) ? detail.items : []).map((i, idx) => (
                  <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>£{Number(i.price).toFixed(2)}</td><td className="text-green">£{(Number(i.price)*i.qty).toFixed(2)}</td></tr>
                ))}
                <tr style={{ borderTop:"2px solid var(--border)" }}>
                  <td colSpan={3} style={{ fontWeight:700 }}>Postage ({detail.postage_name})</td>
                  <td>£{Number(detail.postage).toFixed(2)}</td>
                </tr>
                <tr><td colSpan={3} style={{ fontWeight:900, fontSize:15 }}>TOTAL</td><td className="text-green" style={{ fontWeight:900, fontSize:15 }}>£{Number(detail.total).toFixed(2)}</td></tr>
              </tbody>
            </table></div>
            <button className="btn btn-ghost mt-2" onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      )}

      {trackingModal && (
        <div className="overlay" onClick={() => setTrackingModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📦 Mark as Dispatched</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
              Optionally enter a tracking number — it will be included in the dispatch email to the customer.
            </p>
            <div className="form-group">
              <label>Tracking Number <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <input
                value={trackingModal.tracking}
                onChange={e => setTrackingModal(m => ({ ...m, tracking: e.target.value }))}
                placeholder="e.g. JD000000000000000000"
                onKeyDown={e => e.key === "Enter" && doDispatch(trackingModal.id, trackingModal.tracking)}
                autoFocus
              />
            </div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={() => doDispatch(trackingModal.id, trackingModal.tracking)}>
                ✓ Confirm Dispatch &amp; Send Email
              </button>
              <button className="btn btn-ghost" onClick={() => setTrackingModal(null)}>Cancel</button>
            </div>
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
  const [trackingModal, setTrackingModal] = useState(null); // { id, tracking }
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
    const ordersTimer = setTimeout(fetchOrders, 600);
    return () => clearTimeout(ordersTimer);
  }, []);

  const doDispatch = async (id, tracking) => {
    try {
      await api.shopOrders.updateStatus(id, "dispatched", tracking || null);
      setOrders(o => o.map(x => x.id === id ? { ...x, status: "dispatched" } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status: "dispatched" }));
      showToast("Order marked as dispatched!");
      const order = orders.find(o => o.id === id);
      const toEmail = order?.customer_email || order?.customerEmail;
      if (toEmail) {
        sendDispatchEmail({
          toEmail,
          toName:  order.customer_name || order.customerName || "Customer",
          order:   { ...order, customerAddress: order.customer_address || order.customerAddress || "" },
          items:   Array.isArray(order.items) ? order.items : [],
          tracking: tracking || null,
        }).then(() => showToast("📧 Dispatch email sent!")).catch(e => showToast("⚠️ Email failed: " + (e?.message || e?.text || JSON.stringify(e)), "red"));
      }
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    setTrackingModal(null);
  };

  const setStatus = async (id, status) => {
    if (status === "dispatched") { setTrackingModal({ id, tracking: "" }); return; }
    try {
      await api.shopOrders.updateStatus(id, status);
      setOrders(o => o.map(x => x.id === id ? { ...x, status } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status }));
      showToast("Status updated!");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const pending = orders.filter(o => o.status === "pending").length;
  const [statusTab, setStatusTab] = useState("pending");
  const STATUS_TABS = ["pending","processing","dispatched","completed","cancelled","all"];
  const visibleOrders = statusTab === "all" ? orders : orders.filter(o => o.status === statusTab);

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

      <div className="nav-tabs" style={{ marginBottom:12 }}>
        {STATUS_TABS.map(t => {
          const cnt = t === "all" ? orders.length : orders.filter(o => o.status === t).length;
          return (
            <button key={t} className={`nav-tab${statusTab === t ? " active" : ""}`} onClick={() => setStatusTab(t)} style={{ textTransform:"capitalize" }}>
              {t}{cnt > 0 && <span style={{ marginLeft:5, background: statusTab===t ? "rgba(0,0,0,.3)" : "var(--border)", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{cnt}</span>}
            </button>
          );
        })}
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
            <thead><tr><th>Order ID</th><th>Date</th><th>Customer</th><th>Items</th><th>Postage</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleOrders.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No {statusTab === "all" ? "" : statusTab + " "}orders yet</td></tr>}
              {visibleOrders.map(o => {
                const items = Array.isArray(o.items) ? o.items : [];
                return (
                  <tr key={o.id}>
                    <td className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>#{(o.id||"").slice(-8).toUpperCase()}</td>
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
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", marginTop:2 }}>#{(detail.id||"").slice(-8).toUpperCase()}</div>
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
                    <div class="from">FROM: Swindon Airsoft</div>
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
              {detail.tracking_number && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, letterSpacing: ".08em" }}>📮 TRACKING NUMBER</div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 14, fontWeight: 700, background: "#0c1009", padding: "8px 12px", borderRadius: 3, border: "1px solid var(--accent)", color: "var(--accent)" }}>{detail.tracking_number}</div>
                </div>
              )}
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

      {trackingModal && (
        <div className="overlay" onClick={() => setTrackingModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📦 Mark as Dispatched</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
              Optionally enter a tracking number — it will be included in the dispatch email to the customer.
            </p>
            <div className="form-group">
              <label>Tracking Number <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <input
                value={trackingModal.tracking}
                onChange={e => setTrackingModal(m => ({ ...m, tracking: e.target.value }))}
                placeholder="e.g. JD000000000000000000"
                onKeyDown={e => e.key === "Enter" && doDispatch(trackingModal.id, trackingModal.tracking)}
                autoFocus
              />
            </div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={() => doDispatch(trackingModal.id, trackingModal.tracking)}>
                ✓ Confirm Dispatch &amp; Send Email
              </button>
              <button className="btn btn-ghost" onClick={() => setTrackingModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Shop ─────────────────────────────────────────────
function AdminShop({ data, save, showToast }) {
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="shop" && ["products","postage","orders"].includes(p[2]) ? p[2] : "products";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/shop/" + t; };
  const [modal, setModal] = useState(null);
  const uid = () => Math.random().toString(36).slice(2,10);
  const blank = { name: "", description: "", price: 0, salePrice: null, onSale: false, image: "", images: [], stock: 0, noPost: false, gameExtra: false, costPrice: null, category: "", variants: [] };

  // Drag-to-reorder state for products
  const [shopOrder, setShopOrder] = useState(data.shop);
  const dragProductIdx = useRef(null);
  // Keep shopOrder in sync when data.shop changes (after save/refresh)
  useEffect(() => { setShopOrder(data.shop); }, [data.shop]);

  // Product search + category filter
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const allCategories = useMemo(() => {
    const cats = [...new Set(shopOrder.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [shopOrder]);
  const filteredShopOrder = useMemo(() => {
    let list = shopOrder;
    if (categoryFilter) list = list.filter(p => p.category === categoryFilter);
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
    }
    return list;
  }, [shopOrder, productSearch, categoryFilter]);

  // Drag-to-reorder ref for variants (inside modal)
  const dragVariantIdx = useRef(null);
  const [form, setForm] = useState(blank);
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));

  // Variant editor state
  const [newVariant, setNewVariant] = useState({ name: "", price: "", stock: "", costPrice: "" });

  const addVariant = () => {
    if (!newVariant.name) { showToast("Variant name required", "red"); return; }
    const newVar = { id: uid(), name: newVariant.name, price: Number(newVariant.price) || 0, stock: Number(newVariant.stock) || 0, costPrice: newVariant.costPrice !== "" ? Number(newVariant.costPrice) : null, image: "" };
    setField("variants", [...(form.variants || []), newVar]);
    setNewVariant({ name: "", price: "", stock: "", costPrice: "" });
  };
  const removeVariant = (id) => setField("variants", form.variants.filter(varItem => varItem.id !== id));
  const updateVariant = (id, key, val) => setField("variants", form.variants.map(v => v.id === id ? { ...v, [key]: key === "name" ? val : Number(val) } : v));
  const updateVariantRaw = (id, key, val) => setField("variants", form.variants.map(v => v.id === id ? { ...v, [key]: val } : v));

  const handleVariantImg = (id, e) => {
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
        updateVariantRaw(id, "image", canvas2.toDataURL("image/jpeg", 0.75));
      };
      img2.src = ev.target.result;
    };
    reader2.readAsDataURL(file);
  };

  const hasVariants = (form.variants || []).length > 0;

  // Postage state
  const [postModal, setPostModal] = useState(null);
  const blankPost = { name: "", price: 0 };
  const [postForm, setPostForm] = useState(blankPost);
  const pf = (k, v) => setPostForm(p => ({ ...p, [k]: v }));

  const compressImage = (file) => new Promise(resolve => {
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
        resolve(canvas2.toDataURL("image/jpeg", 0.75));
      };
      img2.src = ev.target.result;
    };
    reader2.readAsDataURL(file);
  });

  const handleImg = (e) => {
    const files = Array.from(e.target.files); if (!files.length) return;
    Promise.all(files.map(compressImage)).then(newImgs => {
      setForm(prev => {
        const merged = [...(prev.images || []), ...newImgs];
        return { ...prev, images: merged, image: merged[0] || prev.image };
      });
    });
    e.target.value = ""; // allow re-selecting same file
  };

  const removeProductImage = (idx) => {
    setForm(prev => {
      const next = prev.images.filter((_, i) => i !== idx);
      return { ...prev, images: next, image: next[0] || "" };
    });
  };

  const moveProductImage = (from, to) => {
    setForm(prev => {
      const next = [...prev.images];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, images: next, image: next[0] || "" };
    });
  };

  const [delProductConfirm, setDelProductConfirm] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const confirmDeleteProduct = async () => {
    setDeletingProduct(true);
    try {
      await api.shop.delete(delProductConfirm.id);
      save({ shop: await api.shop.getAll() });
      showToast("Product deleted");
      setDelProductConfirm(null);
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setDeletingProduct(false); }
  };

  const [savingProduct, setSavingProduct] = useState(false);

  // Reset any stuck saving state when the tab becomes visible again
  // (browser can freeze JS mid-async when tab is hidden, leaving busy=true forever)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setSavingProduct(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const saveItem = async () => {
    if (!form.name) { showToast("Name required", "red"); return; }
    setSavingProduct(true);
    try {
      if (modal === "new") {
        const created = await api.shop.create(form);
        // Update form with real DB id so a follow-up edit works immediately
        setForm(prev => ({ ...prev, id: created.id }));
      } else {
        await api.shop.update(form.id, form);
      }
      const freshShop = await api.shop.getAll();
      save({ shop: freshShop });
      showToast("Product saved!");
      setModal(null);
    } catch (e) {
      console.error("saveItem FAILED at:", e?.message, e);
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
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
    } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
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
        {tab === "products" && <button className="btn btn-primary" onClick={() => { setForm(blank); setNewVariant({ name:"", price:"", stock:"", costPrice:"" }); setSavingProduct(false); setModal("new"); }}>+ Add Product</button>}
        {tab === "postage" && <button className="btn btn-primary" onClick={() => { setPostForm(blankPost); setPostModal("new"); }}>+ Add Postage</button>}
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>Products</button>
        <button className={`nav-tab ${tab === "postage" ? "active" : ""}`} onClick={() => setTab("postage")}>Postage Options</button>
        <button className={`nav-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>Orders</button>
      </div>

      {tab === "products" && (
        <div className="card">
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
            <input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="🔍 Search products…"
              style={{ flex:1, minWidth:160, fontSize:13 }}
            />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{ fontSize:13, padding:"7px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:4, minWidth:140 }}
            >
              <option value="">All categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(productSearch || categoryFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setProductSearch(""); setCategoryFilter(""); }}>✕ Clear</button>
            )}
            <span style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>
              {filteredShopOrder.length} / {shopOrder.length}
            </span>
          </div>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>
            ☰ Drag rows to reorder. Variants can be reordered inside the edit modal.
          </p>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th style={{width:28}}></th><th>Product</th><th>Category</th><th>Base Price</th><th>Cost</th><th>Margin</th><th>Variants</th><th>Stock</th><th>Sale</th><th>No Post</th><th>Game Extra</th><th></th></tr></thead>
            <tbody>
              {filteredShopOrder.map((item) => {
                const idx = shopOrder.findIndex(p => p.id === item.id);
                return (
                <tr key={item.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed="move"; dragProductIdx.current = idx; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = dragProductIdx.current;
                    if (from === idx) return;
                    const next = [...shopOrder];
                    const [moved] = next.splice(from, 1);
                    next.splice(idx, 0, moved);
                    setShopOrder(next);
                    dragProductIdx.current = null;
                    // Persist to DB
                    api.shop.reorder(next.map(p => p.id))
                      .then(() => save({ shop: next }))
                      .catch(() => showToast("Reorder failed", "red"));
                  }}
                  style={{cursor:"grab"}}
                >
                  <td style={{color:"var(--muted)",fontSize:16,textAlign:"center",userSelect:"none"}}>☰</td>
                  <td style={{ fontWeight:600 }}>{item.name}</td>
                  <td>{item.category ? <span className="tag tag-blue" style={{fontSize:10}}>{item.category}</span> : <span style={{color:"var(--muted)"}}>—</span>}</td>
                  <td className="text-green">{item.variants?.length > 0 ? <span style={{color:"var(--muted)",fontSize:11}}>see variants</span> : `£${Number(item.price).toFixed(2)}`}</td>
                  <td style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11}}>
                    {item.variants?.length > 0
                      ? item.variants.some(v => v.costPrice)
                        ? item.variants.map(v => (
                            <div key={v.id} style={{whiteSpace:"nowrap"}}>
                              {v.name}: {v.costPrice ? `£${Number(v.costPrice).toFixed(2)}` : <span style={{color:"var(--muted)"}}>—</span>}
                            </div>
                          ))
                        : <span style={{color:"var(--muted)"}}>—</span>
                      : item.costPrice ? `£${Number(item.costPrice).toFixed(2)}` : <span style={{color:"var(--muted)"}}>—</span>
                    }
                  </td>
                  <td style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11}}>
                    {item.variants?.length > 0
                      ? item.variants.some(v => v.costPrice && v.price > 0)
                        ? item.variants.filter(v => v.costPrice && v.price > 0).map(v => {
                            const m = v.price - v.costPrice;
                            const pct = ((m / v.price) * 100).toFixed(0);
                            return (
                              <div key={v.id} style={{whiteSpace:"nowrap",color: m >= 0 ? "var(--accent)" : "var(--red)"}}>
                                {v.name}: £{m.toFixed(2)} ({pct}%)
                              </div>
                            );
                          })
                        : <span style={{color:"var(--muted)"}}>—</span>
                      : item.costPrice && item.price > 0 ? (() => {
                          const sell = item.onSale && item.salePrice ? item.salePrice : item.price;
                          const m = sell - item.costPrice;
                          const pct = ((m / sell) * 100).toFixed(0);
                          return <span style={{color: m >= 0 ? "var(--accent)" : "var(--red)"}}>£{m.toFixed(2)} ({pct}%)</span>;
                        })()
                      : <span style={{color:"var(--muted)"}}>—</span>
                    }
                  </td>
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
                      <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...item, variants: item.variants || [] }); setNewVariant({ name:"", price:"", stock:"", costPrice:"" }); setSavingProduct(false); setModal(item.id); }}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDelProductConfirm(item)}>Del</button>
                    </div>
                  </td>
                </tr>
              );
              })}
              {filteredShopOrder.length === 0 && <tr><td colSpan={12} style={{textAlign:"center",color:"var(--muted)",padding:30}}>{productSearch || categoryFilter ? "No matching products" : "No products yet"}</td></tr>}
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

      {tab === "orders" && <AdminOrdersInline showToast={showToast} />}

      {/* ── PRODUCT MODAL ── */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === "new" ? "Add Product" : "Edit Product"}</div>

            <div className="form-row">
              <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setField("name", e.target.value)} /></div>
              <div className="form-group">
                <label>Category <span style={{fontWeight:400,color:"var(--muted)",fontSize:11}}>(optional — e.g. BBs, Guns, Accessories)</span></label>
                <input
                  list="category-suggestions"
                  value={form.category || ""}
                  onChange={e => setField("category", e.target.value)}
                  placeholder="Type or choose a category…"
                />
                <datalist id="category-suggestions">
                  {allCategories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            {/* Rich description editor */}
            <div className="form-group">
              <label>Description</label>
              <div style={{ border:"1px solid var(--border)", borderRadius:4, overflow:"hidden" }}>
                {/* Toolbar */}
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", padding:"6px 8px", background:"#1a1a1a", borderBottom:"1px solid var(--border)" }}>
                  {[
                    { label:"B",  title:"Bold",      wrap:["**","**"] },
                    { label:"I",  title:"Italic",     wrap:["*","*"] },
                    { label:"H2", title:"Heading",    line:"## " },
                    { label:"•",  title:"Bullet",     line:"- " },
                    { label:"—",  title:"Divider",    insert:"\n---\n" },
                  ].map(btn => (
                    <button key={btn.label} title={btn.title} type="button"
                      style={{ background:"#2a2a2a", border:"1px solid #333", color:"#ccc", width:30, height:26, fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:2 }}
                      onClick={() => {
                        const ta = document.getElementById("prod-desc-ta");
                        if (!ta) return;
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        const val = form.description || "";
                        let newVal, cursor;
                        if (btn.wrap) {
                          newVal = val.slice(0,start) + btn.wrap[0] + val.slice(start,end) + btn.wrap[1] + val.slice(end);
                          cursor = end + btn.wrap[0].length + btn.wrap[1].length;
                        } else if (btn.line) {
                          const lineStart = val.lastIndexOf("\n", start-1)+1;
                          newVal = val.slice(0,lineStart) + btn.line + val.slice(lineStart);
                          cursor = start + btn.line.length;
                        } else {
                          newVal = val.slice(0,start) + btn.insert + val.slice(end);
                          cursor = start + btn.insert.length;
                        }
                        setField("description", newVal);
                        setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
                      }}
                    >{btn.label}</button>
                  ))}
                  <span style={{ fontSize:10, color:"#555", marginLeft:4, alignSelf:"center" }}>**bold** *italic* ## heading - bullet ---</span>
                </div>
                {/* Edit / Preview tabs */}
                <div style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"#111" }}>
                  {["edit","preview"].map(t => (
                    <button key={t} type="button" onClick={() => setField("_descTab", t)}
                      style={{ padding:"5px 16px", fontSize:11, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", background:"none", border:"none", borderBottom:(form._descTab||"edit")===t?"2px solid var(--accent)":"2px solid transparent", color:(form._descTab||"edit")===t?"var(--accent)":"#555", cursor:"pointer" }}>
                      {t==="edit"?"✏ EDIT":"👁 PREVIEW"}
                    </button>
                  ))}
                </div>
                {(form._descTab||"edit") !== "preview"
                  ? <textarea id="prod-desc-ta" rows={6} value={form.description||""} onChange={e => setField("description", e.target.value)}
                      style={{ width:"100%", background:"#111", border:"none", padding:"10px", resize:"vertical", color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  : <div style={{ minHeight:120, padding:"10px 14px", background:"#0d0d0d", color:"var(--muted)", fontSize:13, lineHeight:1.8 }}
                      dangerouslySetInnerHTML={{ __html: renderMd(form.description) || "<span style='color:#444'>Nothing to preview yet…</span>" }} />
                }
              </div>
            </div>

            {/* Base price + stock — only relevant if no variants */}
            {!hasVariants && (
              <div className="form-row">
                <div className="form-group"><label>Base Price (£)</label><input type="number" step="0.01" value={form.price} onChange={e => setField("price", +e.target.value)} /></div>
                <div className="form-group"><label>Stock</label><input type="number" value={form.stock} onChange={e => setField("stock", +e.target.value)} /></div>
              </div>
            )}
            {hasVariants && (
              <div className="alert alert-blue mb-2" style={{fontSize:12}}>ℹ️ Variants are active — base price and stock are ignored. Each variant has its own price and stock.</div>
            )}

            {/* Sale price — only if no variants */}
            {!hasVariants && (
              <>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                  <input type="checkbox" checked={form.onSale} onChange={e => setField("onSale", e.target.checked)} />
                  <label style={{fontSize:13}}>On Sale</label>
                </div>
                {form.onSale && <div className="form-group"><label>Sale Price (£)</label><input type="number" step="0.01" value={form.salePrice || ""} onChange={e => setField("salePrice", +e.target.value)} /></div>}
              </>
            )}

            {/* Cost price — admin only, never shown to public */}
            <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:3,padding:"10px 14px",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:".12em",color:"var(--muted)",marginBottom:8,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>🔒 Admin Only — Cost &amp; Margin</div>
              <div className="form-row" style={{marginBottom:0}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label>Your Cost Price (£) <span style={{fontWeight:400,color:"var(--muted)"}}>— not shown to customers</span></label>
                  <input type="number" step="0.01" min="0" value={form.costPrice ?? ""} onChange={e => setField("costPrice", e.target.value === "" ? null : +e.target.value)} placeholder="0.00" />
                </div>
                {form.costPrice != null && form.costPrice > 0 && (() => {
                  const sellPrice = form.onSale && form.salePrice ? form.salePrice : form.price;
                  const margin = sellPrice - form.costPrice;
                  const pct = sellPrice > 0 ? ((margin / sellPrice) * 100).toFixed(0) : 0;
                  const colour = margin > 0 ? "var(--accent)" : "var(--red)";
                  return (
                    <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end",paddingBottom:2}}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:colour}}>
                        Margin: <strong>£{margin.toFixed(2)}</strong> ({pct}%)
                      </div>
                      {!hasVariants && form.costPrice > 0 && (
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:"var(--muted)",marginTop:3}}>
                          Break-even sell: £{(form.costPrice * 1.0).toFixed(2)} · 2× cost: £{(form.costPrice * 2).toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
              <input type="checkbox" checked={form.noPost} onChange={e => setField("noPost", e.target.checked)} />
              <label style={{fontSize:13}}>No Post — Collection Only (e.g. Pyro)</label>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              <input type="checkbox" checked={form.gameExtra || false} onChange={e => setField("gameExtra", e.target.checked)} />
              <label style={{fontSize:13}}>Available as Game Day Extra <span style={{color:"var(--muted)",fontSize:11}}>(shows in event extras product picker)</span></label>
            </div>

            {/* ── VARIANTS EDITOR ── */}
            <div style={{border:"1px solid #2a2a2a",borderLeft:"3px solid var(--accent)",marginBottom:14}}>
              <div style={{background:"#0d0d0d",padding:"8px 14px",fontSize:9,letterSpacing:".25em",color:"var(--accent)",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,textTransform:"uppercase",borderBottom:"1px solid #2a2a2a"}}>
                VARIANTS (optional) — e.g. sizes, colours &nbsp;<span style={{fontWeight:400,fontSize:10,color:"var(--muted)",letterSpacing:".05em"}}>☰ drag to reorder</span>
              </div>
              <div style={{padding:14}}>
                {(form.variants || []).length === 0 && (
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:"var(--muted)",marginBottom:10}}>No variants — product uses base price and stock above.</div>
                )}
                {(form.variants || []).map((v, vIdx) => (
                  <div key={v.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed="move"; dragVariantIdx.current = vIdx; }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
                    onDrop={e => {
                      e.preventDefault();
                      const from = dragVariantIdx.current;
                      if (from === vIdx) return;
                      const next = [...form.variants];
                      const [moved] = next.splice(from, 1);
                      next.splice(vIdx, 0, moved);
                      setField("variants", next);
                      dragVariantIdx.current = null;
                    }}
                    style={{marginBottom:10,background:"#0a0a0a",border:"1px solid #1e1e1e",borderRadius:2,padding:"10px 12px",cursor:"grab"}}
                  >
                    <div style={{display:"grid",gridTemplateColumns:"20px 1fr 90px 90px 90px 36px",gap:8,alignItems:"center",marginBottom:4}}>
                      <span style={{color:"var(--muted)",fontSize:14,textAlign:"center",userSelect:"none",cursor:"grab"}}>☰</span>
                      <input value={v.name} onChange={e => updateVariant(v.id, "name", e.target.value)} placeholder="Variant name (e.g. Red, Large)" style={{fontSize:12}} />
                      <input type="number" step="0.01" value={v.price} onChange={e => updateVariant(v.id, "price", e.target.value)} placeholder="Sell £" style={{fontSize:12}} />
                      <input type="number" step="0.01" value={v.costPrice ?? ""} onChange={e => updateVariantRaw(v.id, "costPrice", e.target.value === "" ? null : Number(e.target.value))} placeholder="Cost £" style={{fontSize:12,borderColor:"#2a2a2a"}} title="Your cost price (admin only)" />
                      <input type="number" value={v.stock} onChange={e => updateVariant(v.id, "stock", e.target.value)} placeholder="Stock" style={{fontSize:12}} />
                      <button className="btn btn-sm btn-danger" onClick={() => removeVariant(v.id)} style={{padding:"6px 10px"}}>✕</button>
                    </div>
                    {v.costPrice != null && v.costPrice > 0 && v.price > 0 && (() => {
                      const margin = v.price - v.costPrice;
                      const pct = ((margin / v.price) * 100).toFixed(0);
                      return (
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color: margin >= 0 ? "var(--accent)" : "var(--red)",marginBottom:6,paddingLeft:28}}>
                          Margin: £{margin.toFixed(2)} ({pct}%) · 2× cost: £{(v.costPrice * 2).toFixed(2)}
                        </div>
                      );
                    })()}
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {v.image && <img src={v.image} style={{width:52,height:52,objectFit:"cover",border:"1px solid #333",flexShrink:0}} alt="" />}
                      <label style={{cursor:"pointer",flex:1}}>
                        <div className="btn btn-sm btn-ghost" style={{pointerEvents:"none",fontSize:11,padding:"4px 10px"}}>
                          {v.image ? "📷 Change Image" : "📷 Add Image"}
                        </div>
                        <input type="file" accept="image/*" style={{display:"none"}} onChange={e => handleVariantImg(v.id, e)} />
                      </label>
                      {v.image && <button className="btn btn-sm btn-ghost" style={{fontSize:11,padding:"4px 8px",color:"var(--red)"}} onClick={() => updateVariantRaw(v.id, "image", "")}>✕ Remove</button>}
                    </div>
                  </div>
                ))}
                {/* Add new variant row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 90px auto",gap:8,alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid #1e1e1e"}}>
                  <input value={newVariant.name} onChange={e => setNewVariant(p => ({...p, name: e.target.value}))} placeholder="New variant name" style={{fontSize:12}} />
                  <input type="number" step="0.01" value={newVariant.price} onChange={e => setNewVariant(p => ({...p, price: e.target.value}))} placeholder="Sell £" style={{fontSize:12}} />
                  <input type="number" step="0.01" value={newVariant.costPrice} onChange={e => setNewVariant(p => ({...p, costPrice: e.target.value}))} placeholder="Cost £" style={{fontSize:12,borderColor:"#2a2a2a"}} title="Your cost price (admin only)" />
                  <input type="number" value={newVariant.stock} onChange={e => setNewVariant(p => ({...p, stock: e.target.value}))} placeholder="Stock" style={{fontSize:12}} />
                  <button className="btn btn-sm btn-primary" onClick={addVariant} style={{whiteSpace:"nowrap"}}>+ Add</button>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Product Images <span style={{fontWeight:400,color:"var(--muted)",fontSize:11}}>(first image shown on shop card — drag to reorder)</span></label>
              {(form.images || []).length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                  {(form.images || []).map((img, i) => (
                    <div key={i} style={{ position:"relative", width:90, height:90, border: i===0 ? "2px solid var(--accent)" : "1px solid var(--border)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                      <img src={img} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" />
                      {i === 0 && <div style={{ position:"absolute", top:2, left:2, background:"var(--accent)", color:"#000", fontSize:7, fontWeight:900, padding:"1px 4px", letterSpacing:".05em" }}>MAIN</div>}
                      <button onClick={() => removeProductImage(i)} title="Remove" style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,.75)", border:"none", color:"#fff", width:18, height:18, cursor:"pointer", fontSize:10, borderRadius:2, lineHeight:1, padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                      <div style={{ position:"absolute", bottom:2, left:0, right:0, display:"flex", justifyContent:"center", gap:3 }}>
                        {i > 0 && <button onClick={() => moveProductImage(i, i-1)} title="Move left" style={{ background:"rgba(0,0,0,.75)", border:"none", color:"#fff", width:16, height:16, cursor:"pointer", fontSize:9, borderRadius:2, padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>◀</button>}
                        {i < (form.images||[]).length-1 && <button onClick={() => moveProductImage(i, i+1)} title="Move right" style={{ background:"rgba(0,0,0,.75)", border:"none", color:"#fff", width:16, height:16, cursor:"pointer", fontSize:9, borderRadius:2, padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>▶</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display:"inline-flex", alignItems:"center", gap:6, cursor:"pointer", background:"var(--bg4)", border:"1px dashed var(--border)", padding:"8px 14px", borderRadius:3, fontSize:12, color:"var(--muted)" }}>
                📷 {(form.images||[]).length === 0 ? "Upload images" : "Add more images"}
                <input type="file" accept="image/*" multiple onChange={handleImg} style={{ display:"none" }} />
              </label>
            </div>

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
            <div className="form-group"><label>Option Name</label><input value={postForm.name} onChange={e => psetField("name", e.target.value)} placeholder="e.g. Standard (3-5 days)" /></div>
            <div className="form-group"><label>Price (£) — set 0 for free/collection</label><input type="number" min={0} step={0.01} value={postForm.price} onChange={e => psetField("price", +e.target.value)} /></div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={savePostage}>Save</button>
              <button className="btn btn-ghost" onClick={() => setPostModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {delProductConfirm && (
        <div className="overlay" onClick={() => !deletingProduct && setDelProductConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Product?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 4px" }}>
              Permanently delete <strong style={{ color: "var(--text)" }}>{delProductConfirm.name}</strong>?
            </p>
            <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 20 }}>
              ⚠️ This cannot be undone. Any event extras linked to this product will also lose their pricing reference.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingProduct} onClick={confirmDeleteProduct}>
                {deletingProduct ? "Deleting…" : "Yes, Delete Product"}
              </button>
              <button className="btn btn-ghost" disabled={deletingProduct} onClick={() => setDelProductConfirm(null)}>Cancel</button>
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
            {board.map((boardPlayer, i) => (
              <tr key={boardPlayer.id}>
                <td>{i + 1}</td><td style={{ fontWeight: 600 }}>{boardPlayer.name}</td><td>{boardPlayer.gamesAttended}</td>
                <td>{boardPlayer.vipStatus === "active" ? <span className="tag tag-gold">⭐</span> : "—"}</td>
                <td>{boardPlayer.leaderboardOptOut ? <span className="tag tag-red">Hidden</span> : <span className="tag tag-green">Visible</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ── Admin Visitor Stats ───────────────────────────────────
function AdminVisitorStats() {
  const [visitData, setVisitData] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState("7d");

  useEffect(() => {
    setLoading(true);
    api.visits.getAll()
      .then(rows => { setVisitData(rows); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, []);

  const nowDate = new Date();
  const cutoffDate = new Date(nowDate);
  if      (dateRange === "1d")  cutoffDate.setDate(nowDate.getDate() - 1);
  else if (dateRange === "7d")  cutoffDate.setDate(nowDate.getDate() - 7);
  else if (dateRange === "30d") cutoffDate.setDate(nowDate.getDate() - 30);
  else if (dateRange === "90d") cutoffDate.setDate(nowDate.getDate() - 90);
  else cutoffDate.setFullYear(2000);

  const filtered = visitData.filter(row => new Date(row.created_at) >= cutoffDate);

  // ── Derived stats ──
  const totalVisits    = filtered.length;
  const uniqueSessions = new Set(filtered.map(row => row.session_id).filter(Boolean)).size;
  const uniqueUsers    = new Set(filtered.map(row => row.user_id).filter(Boolean)).size;
  const loggedInVisits = filtered.filter(row => row.user_id).length;
  const anonVisits     = totalVisits - loggedInVisits;

  // Page breakdown
  const pageCounts = filtered.reduce((acc, row) => {
    acc[row.page] = (acc[row.page] || 0) + 1; return acc;
  }, {});
  const pageRows = Object.entries(pageCounts).sort((aa, bb) => bb[1] - aa[1]);

  // Visits by day
  const dayMap = {};
  filtered.forEach(row => {
    const dayKey = row.created_at?.slice(0, 10);
    if (dayKey) dayMap[dayKey] = (dayMap[dayKey] || 0) + 1;
  });
  const daysToShow = dateRange === "1d" ? 1 : dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 14;
  const dayBars = [];
  for (let offset = daysToShow - 1; offset >= 0; offset--) {
    const dayDate = new Date(nowDate);
    dayDate.setDate(nowDate.getDate() - offset);
    const dayKey = dayDate.toISOString().slice(0, 10);
    dayBars.push({ date: dayKey, label: dayDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), count: dayMap[dayKey] || 0 });
  }
  const maxDayCount = Math.max(...dayBars.map(db => db.count), 1);

  // Visits by hour
  const hourCounts = Array(24).fill(0);
  filtered.forEach(row => {
    if (row.created_at) hourCounts[new Date(row.created_at).getHours()]++;
  });
  const maxHourCount = Math.max(...hourCounts, 1);

  // Country breakdown
  const countryCounts = filtered.reduce((acc, row) => {
    const ckey = row.country || "Unknown";
    acc[ckey] = (acc[ckey] || 0) + 1; return acc;
  }, {});
  const countryRows = Object.entries(countryCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 10);

  // City breakdown
  const cityCounts = filtered.reduce((acc, row) => {
    const ckey = row.city ? `${row.city}${row.country ? ", " + row.country : ""}` : "Unknown";
    acc[ckey] = (acc[ckey] || 0) + 1; return acc;
  }, {});
  const cityRows = Object.entries(cityCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 12);

  // Logged-in user breakdown
  const userVisitMap = {};
  filtered.filter(row => row.user_id).forEach(row => {
    if (!userVisitMap[row.user_id]) {
      userVisitMap[row.user_id] = { name: row.user_name || row.user_id, count: 0, pages: {}, last: row.created_at };
    }
    userVisitMap[row.user_id].count++;
    userVisitMap[row.user_id].pages[row.page] = (userVisitMap[row.user_id].pages[row.page] || 0) + 1;
    if (row.created_at > userVisitMap[row.user_id].last) userVisitMap[row.user_id].last = row.created_at;
  });
  const userRows = Object.values(userVisitMap).sort((aa, bb) => bb.count - aa.count).slice(0, 20);

  // Recent feed
  const recentRows = [...filtered].slice(0, 50);

  // Referrers
  const refCounts = filtered.reduce((acc, row) => {
    const refKey = row.referrer ? (row.referrer.replace(/^https?:\/\//, "").split("/")[0] || "Direct") : "Direct";
    acc[refKey] = (acc[refKey] || 0) + 1; return acc;
  }, {});
  const refRows = Object.entries(refCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 8);

  const PAGE_ICONS = { home:"🏠", events:"📅", shop:"🛒", gallery:"🖼", staff:"🪖", leaderboard:"🏆", vip:"⭐", qa:"❓", contact:"✉️", profile:"👤" };

  const CORNERS = [["top","left"],["top","right"],["bottom","left"],["bottom","right"]];

  const statCard = (cardLabel, cardValue, cardSub, cardColor = "#c8ff00") => (
    <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents:"none" }} />
      {CORNERS.map(([cv, ch]) => (
        <div key={cv + ch} style={{ position:"absolute", width:10, height:10,
          top:cv==="top"?5:"auto", bottom:cv==="bottom"?5:"auto",
          left:ch==="left"?5:"auto", right:ch==="right"?5:"auto",
          borderTop:cv==="top"?`1px solid ${cardColor}`:0,
          borderBottom:cv==="bottom"?`1px solid ${cardColor}`:0,
          borderLeft:ch==="left"?`1px solid ${cardColor}`:0,
          borderRight:ch==="right"?`1px solid ${cardColor}`:0,
          opacity:.5,
        }} />
      ))}
      <div style={{ position:"relative", zIndex:1 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010", marginBottom:6, textTransform:"uppercase" }}>{cardLabel}</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:cardColor, lineHeight:1 }}>{cardValue}</div>
        {cardSub && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", marginTop:4 }}>{cardSub}</div>}
      </div>
    </div>
  );

  const barRow = (barLabel, barCount, barTotal, barColor = "#c8ff00") => (
    <div key={barLabel} style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, color:"#b0c090", textTransform:"uppercase", letterSpacing:".04em" }}>{barLabel}</span>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#c8ff00" }}>{barCount} <span style={{ color:"#3a5010" }}>({Math.round(barCount / barTotal * 100)}%)</span></span>
      </div>
      <div style={{ height:4, background:"#0a0f06", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${Math.round(barCount / barTotal * 100)}%`, background:barColor, boxShadow:`0 0 6px ${barColor}80`, transition:"width .4s" }} />
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ padding:60, textAlign:"center", fontFamily:"'Share Tech Mono',monospace", color:"#3a5010", letterSpacing:".2em", fontSize:11 }}>
      ◈ LOADING INTEL…
    </div>
  );
  if (error) return (
    <div style={{ padding:40, textAlign:"center" }}>
      <div style={{ color:"var(--red)", fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>⚠ {error}</div>
      <div style={{ marginTop:8, fontSize:12, color:"#3a5010", fontFamily:"'Share Tech Mono',monospace" }}>
        Make sure the <code>page_visits</code> table exists in Supabase.
      </div>
    </div>
  );

  return (
    <div style={{ padding:"0 0 60px" }}>
      {/* Header */}
      <div style={{ borderBottom:"1px solid #1a2808", padding:"20px 24px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".25em", color:"#3a5010", marginBottom:4 }}>◈ ANALYTICS</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".1em", color:"#e8f0d8" }}>VISITOR INTELLIGENCE</div>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[["1d","24H"],["7d","7D"],["30d","30D"],["90d","90D"],["all","ALL"]].map(([rangeVal, rangeLabel]) => (
            <button key={rangeVal} onClick={() => setDateRange(rangeVal)} style={{
              fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em",
              padding:"6px 12px", cursor:"pointer", border:"1px solid",
              borderColor: dateRange===rangeVal ? "#c8ff00" : "#2a3a10",
              background:  dateRange===rangeVal ? "rgba(200,255,0,.1)" : "transparent",
              color:       dateRange===rangeVal ? "#c8ff00" : "#3a5010",
            }}>{rangeLabel}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom:"1px solid #1a2808", padding:"0 24px", display:"flex", gap:0 }}>
        {[["overview","OVERVIEW"],["pages","PAGES"],["locations","LOCATIONS"],["users","USERS"]].map(([tabId, tabLabel]) => (
          <button key={tabId} onClick={() => setActiveTab(tabId)} style={{
            fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em",
            padding:"12px 16px", cursor:"pointer", background:"none", border:"none",
            borderBottom: activeTab===tabId ? "2px solid #c8ff00" : "2px solid transparent",
            color: activeTab===tabId ? "#c8ff00" : "#3a5010",
            marginBottom:-1,
          }}>{tabLabel}</button>
        ))}
      </div>

      <div style={{ padding:"24px" }}>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12, marginBottom:28 }}>
              {statCard("Total Visits",     totalVisits.toLocaleString())}
              {statCard("Unique Sessions",  uniqueSessions.toLocaleString(), null, "#4fc3f7")}
              {statCard("Logged-In Visits", loggedInVisits.toLocaleString(), `${uniqueUsers} unique users`, "#c8a000")}
              {statCard("Anonymous Visits", anonVisits.toLocaleString(), null, "#6a8050")}
            </div>

            {/* Day chart */}
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px", marginBottom:20 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>VISITS PER DAY</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
                {dayBars.map(dayBar => (
                  <div key={dayBar.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#3a5010" }}>{dayBar.count || ""}</div>
                    <div style={{ width:"100%", background: dayBar.count ? "#c8ff00" : "#1a2808", height:`${Math.round((dayBar.count / maxDayCount) * 56) + 4}px`, minHeight:4, boxShadow: dayBar.count ? "0 0 4px rgba(200,255,0,.3)" : "none", transition:"height .3s" }} />
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#2a3a10", whiteSpace:"nowrap", transform:"rotate(-45deg)", transformOrigin:"top left", marginTop:4, marginLeft:4 }}>{dayBar.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hour heatmap */}
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px", marginBottom:20 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>VISITS BY HOUR (LOCAL TIME)</div>
              <div style={{ display:"flex", gap:3 }}>
                {hourCounts.map((hourCount, hourIndex) => {
                  const intensity = hourCount / maxHourCount;
                  const heatBg = hourCount === 0 ? "#0a0f06" : `rgba(200,255,0,${0.1 + intensity * 0.9})`;
                  return (
                    <div key={hourIndex} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }} title={`${hourIndex}:00 — ${hourCount} visits`}>
                      <div style={{ width:"100%", height:32, background:heatBg, border:"1px solid #1a2808", transition:"background .3s" }} />
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#2a3a10" }}>{hourIndex % 6 === 0 ? `${hourIndex}h` : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top pages + referrers */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>TOP PAGES</div>
                {pageRows.slice(0, 6).map(([pg, cnt]) => barRow(`${PAGE_ICONS[pg] || "▸"} ${pg}`, cnt, totalVisits))}
                {pageRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No data</div>}
              </div>
              <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>REFERRERS</div>
                {refRows.map(([refKey, cnt]) => barRow(refKey, cnt, totalVisits, "#4fc3f7"))}
                {refRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No data</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── PAGES ── */}
        {activeTab === "pages" && (
          <div style={{ background:"#0c1009", border:"1px solid #1a2808" }}>
            <div style={{ borderBottom:"1px solid #1a2808", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8 }}>
              {["PAGE","VISITS","SHARE"].map(colHead => (
                <div key={colHead} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010" }}>{colHead}</div>
              ))}
            </div>
            {pageRows.map(([pg, cnt]) => (
              <div key={pg} style={{ borderBottom:"1px solid #0f1a08", padding:"12px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8, alignItems:"center" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:15, color:"#b0c090", textTransform:"uppercase", letterSpacing:".05em" }}>
                  {PAGE_ICONS[pg] || "▸"} {pg}
                </div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:900, color:"#c8ff00" }}>{cnt}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ flex:1, height:3, background:"#0a0f06" }}>
                    <div style={{ height:"100%", width:`${Math.round(cnt / totalVisits * 100)}%`, background:"#c8ff00" }} />
                  </div>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", minWidth:32 }}>{Math.round(cnt / totalVisits * 100)}%</span>
                </div>
              </div>
            ))}
            {pageRows.length === 0 && <div style={{ padding:40, textAlign:"center", color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>NO DATA IN RANGE</div>}
          </div>
        )}

        {/* ── LOCATIONS ── */}
        {activeTab === "locations" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>BY COUNTRY</div>
              {countryRows.map(([countryName, cnt]) => barRow(countryName, cnt, totalVisits))}
              {countryRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No location data yet — geo lookup fires on each new visit.</div>}
            </div>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>BY CITY</div>
              {cityRows.map(([cityName, cnt]) => barRow(cityName, cnt, totalVisits, "#ce93d8"))}
              {cityRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No location data yet.</div>}
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {activeTab === "users" && (
          <div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>
              {uniqueUsers} UNIQUE LOGGED-IN USERS · {loggedInVisits} VISITS
            </div>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808" }}>
              <div style={{ borderBottom:"1px solid #1a2808", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 2fr 2fr", gap:8 }}>
                {["USER","VISITS","TOP PAGE","LAST SEEN"].map(colHead => (
                  <div key={colHead} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010" }}>{colHead}</div>
                ))}
              </div>
              {userRows.map((userRow, userIdx) => {
                const topPage = Object.entries(userRow.pages).sort((aa, bb) => bb[1] - aa[1])[0]?.[0] || "—";
                return (
                  <div key={userIdx} style={{ borderBottom:"1px solid #0f1a08", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 2fr 2fr", gap:8, alignItems:"center" }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, fontWeight:700, color:"#b0c090" }}>{userRow.name}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:900, color:"#c8ff00" }}>{userRow.count}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, color:"#3a5010", textTransform:"uppercase" }}>{PAGE_ICONS[topPage] || "▸"} {topPage}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010" }}>{new Date(userRow.last).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}</div>
                  </div>
                );
              })}
              {userRows.length === 0 && <div style={{ padding:40, textAlign:"center", color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>NO LOGGED-IN VISITS IN RANGE</div>}
            </div>
          </div>
        )}

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
    const monthKey = new Date(b.date).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" });
    byMonth[monthKey] = (byMonth[monthKey] || 0) + b.total;
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
        const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        const label = ex ? (selectedVariant ? `${ex.name} — ${selectedVariant.name}` : ex.name) : key;
        const unitP = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
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
  // Find the active textarea - if focus was lost use the last known textarea
  const ta = document.activeElement?.tagName === "TEXTAREA" ? document.activeElement : null;
  if (!ta) {
    // No active textarea - just append to end
    setText(text + before + after);
    return;
  }
  const selStart = ta.selectionStart ?? text.length;
  const selEnd = ta.selectionEnd ?? text.length;
  const sel = text.slice(selStart, selEnd);
  const newVal = text.slice(0, selStart) + before + sel + after + text.slice(selEnd);
  const newCursor = selStart + before.length + sel.length + after.length;
  setText(newVal);
  // Restore cursor after React re-render
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(newCursor, newCursor);
  });
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
  const [qaList, setQaList] = useState(data.qa || []);
  const fq = v => setForm(p => ({ ...p, q: v }));
  const fa = v => setForm(p => ({ ...p, a: v }));

  const refreshQA = async () => {
    const { data: freshData } = await supabase
      .from('qa_items').select('id, question, answer, sort_order').order('created_at', { ascending: true });
    const sorted = (freshData || []).slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
    const mapped = sorted.map(i => ({ id: i.id, q: i.question, a: i.answer, image: '', sort_order: i.sort_order }));
    setQaList(mapped);
    save({ qa: mapped });
  };

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

  const [qaSaving, setQASaving] = useState(false);
  // Safety reset — if stuck, clicking the button area will unstick it
  useEffect(() => { if (qaSaving) { const qaSaveTimer = setTimeout(() => setQASaving(false), 10000); return () => clearTimeout(qaSaveTimer); } }, [qaSaving]);
  const dragIdx = useRef(null);
  const dragOver = useRef(null);

  const save_ = async () => {
    if (!form.q.trim() || !form.a.trim()) { showToast("Fill in both question and answer", "red"); return; }
    // Snapshot editId at call time — never trust stale state
    const currentEditId = editId || null;
    const wasEditing = !!currentEditId;
    setQASaving(true);
    try {
      let result;
      if (wasEditing) {
        result = await supabase.from('qa_items').update({ question: form.q, answer: form.a }).eq('id', currentEditId);
      } else {
        const { data: maxData } = await supabase.from('qa_items').select('sort_order').order('sort_order', { ascending: false }).limit(1);
        const nextOrder = maxData?.[0]?.sort_order != null ? maxData[0].sort_order + 1 : 0;
        result = await supabase.from('qa_items').insert({ question: form.q, answer: form.a, sort_order: nextOrder });
      }
      if (result.error) throw new Error(result.error.message || result.error.code || JSON.stringify(result.error));
      setEditId(null);
      setForm(blank);
      setPreview(false);
      await refreshQA();
      showToast(wasEditing ? "✓ Q&A updated!" : "✓ Q&A added!");
    } catch (e) {
      console.error("QA save failed:", e);
      showToast("Save failed: " + (e?.message || JSON.stringify(e)), "red");
    } finally {
      setQASaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this Q&A?")) return;
    try {
      await api.qa.delete(id);
      await refreshQA();
      showToast("Deleted");
    } catch (e) {
      console.error("QA delete failed:", e);
      showToast("Delete failed: " + (e?.message || e?.code || JSON.stringify(e)), "red");
    }
  };

  const startEdit = (item) => { setForm({ q: item.q, a: item.a, image: item.image || "" }); setEditId(item.id); setPreview(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancel = () => { setForm(blank); setEditId(null); setPreview(false); };
  // Reset form when component unmounts (e.g. navigating away mid-edit)
  useEffect(() => () => { setForm(blank); setEditId(null); }, []);

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
            <button key={t.label} type="button" title={t.title}
              onMouseDown={e => { e.preventDefault(); t.action(); }}
              style={{ background:"#1a1a1a", border:"1px solid #333", color:"#fff", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2 }}>
              {t.label}
            </button>
          ))}
          <label title="Upload image" style={{ background:"#1a1a1a", border:"1px solid #333", color:uploading ? "var(--muted)" : "var(--accent)", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2, display:"flex", alignItems:"center", gap:4 }}>
            🖼 {uploading ? "Uploading…" : "Add Image"}
            <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageUpload} disabled={uploading} />
          </label>
          <button type="button" onClick={() => setPreview(p => !p)}
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
          <button type="button" className="btn btn-primary" onClick={save_} disabled={qaSaving}>{qaSaving ? "Saving…" : editId ? "Save Changes" : "Add Q&A"}</button>
          {editId && <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel</button>}
        </div>
      </div>

      {qaList.length === 0 && <div style={{ textAlign:"center", color:"var(--muted)", padding:32 }}>No Q&A items yet.</div>}
      {qaList.length > 0 && <div style={{ fontSize:11, color:"var(--muted)", marginBottom:8, textAlign:"right" }}>⠿ Drag to reorder</div>}
      {qaList.map((item, idx) => (
        <div key={item.id}
          draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = "move"; dragIdx.current = idx; }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move";
            const el = e.currentTarget;
            const over = dragOver.current;
            if (over !== idx) { dragOver.current = idx; el.style.borderTop = idx < dragIdx.current ? "2px solid var(--accent)" : "none"; el.style.borderBottom = idx > dragIdx.current ? "2px solid var(--accent)" : "none"; }
          }}
          onDragLeave={e => { e.currentTarget.style.borderTop = "none"; e.currentTarget.style.borderBottom = "none"; }}
          onDrop={e => {
            e.currentTarget.style.borderTop = "none"; e.currentTarget.style.borderBottom = "none";
            const from = dragIdx.current; const to = dragOver.current;
            if (from === null || from === to) return;
            const reordered = [...data.qa];
            const [moved] = reordered.splice(from, 1);
            reordered.splice(to, 0, moved);
            // Update sort_order on each item
            const withOrder = reordered.map((q, i) => ({ ...q, sort_order: i }));
            setQaList(withOrder);
            save({ qa: withOrder });
            dragIdx.current = null; dragOver.current = null;
            // Persist new order to Supabase
            withOrder.forEach(q =>
              supabase.from('qa_items').update({ sort_order: q.sort_order }).eq('id', q.id).then(r => {
                if (r.error) console.error('sort_order save failed:', r.error);
              })
            );
          }}
          onDragEnd={e => { e.currentTarget.style.borderTop = "none"; e.currentTarget.style.borderBottom = "none"; dragIdx.current = null; dragOver.current = null; }}
          className="card mb-1" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, cursor:"grab" }}>
          <div style={{ color:"var(--muted)", fontSize:18, paddingTop:2, flexShrink:0, cursor:"grab" }}>⠿</div>
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

// ── About Page ────────────────────────────────────────────
function AboutPage({ setPage }) {
  const Divider = () => (
    <div style={{ display:"flex", alignItems:"center", gap:16, margin:"40px 0" }}>
      <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
      <div style={{ color:"#c8ff00", fontSize:14, opacity:.5 }}>✦</div>
      <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
    </div>
  );
  const InfoRow = ({ icon, children }) => (
    <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:14 }}>
      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{icon}</span>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#8aaa60", lineHeight:1.8 }}>{children}</div>
    </div>
  );
  const TimelineItem = ({ time, title, desc }) => (
    <div style={{ display:"flex", gap:0, marginBottom:0 }}>
      <div style={{ flexShrink:0, width:120, paddingTop:3, paddingBottom:24 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8ff00", letterSpacing:".08em", lineHeight:1.4 }}>{time}</div>
      </div>
      <div style={{ flex:1, borderLeft:"1px solid #2a3a10", paddingLeft:20, paddingBottom:24, position:"relative" }}>
        <div style={{ position:"absolute", left:-5, top:5, width:8, height:8, background:"#c8ff00", borderRadius:"50%", boxShadow:"0 0 8px rgba(200,255,0,.5)" }} />
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".1em", color:"#e8f0d8", textTransform:"uppercase", marginBottom:5 }}>{title}</div>
        {desc && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#5a7a40", lineHeight:1.8 }}>{desc}</div>}
      </div>
    </div>
  );
  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>

      {/* ── HEADER ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>
            ◈ — SWINDON AIRSOFT — OPERATIONAL BRIEF — ◈
          </div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            ABOUT <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>US</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, letterSpacing:".2em", color:"#5a7a30", marginTop:10 }}>
            RUN BY AIRSOFTERS, FOR AIRSOFTERS
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"48px 20px 100px" }}>

        {/* ── WELCOME CARD ── */}
        <div style={{ background:"linear-gradient(135deg,#0c1009,#0a0f07)", border:"1px solid #2a3a10", borderLeft:"4px solid #c8ff00", padding:"26px 30px", marginBottom:44, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", right:20, top:8, fontSize:80, opacity:.04, color:"#c8ff00", pointerEvents:"none", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, lineHeight:1 }}>SA</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".1em", color:"#c8ff00", textTransform:"uppercase", marginBottom:12 }}>
            Welcome to Swindon Airsoft
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#7a9a50", lineHeight:1.9 }}>
            Located just off <span style={{ color:"#c8ff00" }}>Junction 16 of the M4</span>, we bring you Swindon Airsoft — run by Airsofters for Airsofters. Whether you are a seasoned player or completely new to the sport, we have got you covered.
          </div>
        </div>

        {/* ── SECTION LABEL helper ── */}
        {/* ── NEED TO KNOW ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 01</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            NEED TO <span style={{ color:"#c8ff00" }}>KNOW</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px", marginBottom:44 }}>
          <InfoRow icon="🎯">
            New to Airsoft? We have a limited number of <span style={{ color:"#c8ff00" }}>rental kits available to pre-book</span>. Full details on the rental kit can be found in our Shop.
          </InfoRow>
          <InfoRow icon="👶">
            Due to insurance requirements, the minimum age on site is <span style={{ color:"#c8ff00" }}>12 years with a parent or guardian playing</span>, or <span style={{ color:"#c8ff00" }}>14 years with a parent or guardian on-site</span>.
          </InfoRow>
          <InfoRow icon="🥾">
            As this is a woodland site, <span style={{ color:"#c8ff00" }}>boots are a MUST</span> at all times — no trainers or open footwear.
          </InfoRow>
          <InfoRow icon="📋">
            Please ensure the <span style={{ color:"#c8ff00" }}>digital waiver is signed</span> before attending. You can do this from your Profile page.
          </InfoRow>
        </div>
        <Divider />

        {/* ── DAY SCHEDULE ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 02</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:24 }}>
            A DAY AT <span style={{ color:"#c8ff00" }}>SWINDON AIRSOFT</span>
          </div>
        </div>
        <TimelineItem time="08:00" title="Gates Open" desc="Arrive and be greeted with a free tea or coffee. Get yourself set up in the safe zone." />
        <TimelineItem time="08:45" title="Chrono" desc="All weapons are chronographed. Make sure your kit is prepped and ready to go." />
        <TimelineItem time="09:30" title="Morning Brief" desc="Led by one of our staff — we outline the site rules and make sure everyone knows what to expect on the day." />
        <TimelineItem time="10:00" title="First Game On" desc="Make sure you are kitted up and ready. First game kicks off — get stuck in!" />
        <TimelineItem time="12:30 – 13:00" title="Lunch Break" desc="We stop for lunch and set up the second half of the day. We have an onsite shop with drinks available. We recommend bringing your own lunch — there is also a local Co-op just down the road. Times can sometimes change." />
        <TimelineItem time="Afternoon" title="Second Half" desc="Back into it for the afternoon games until end of day." />

        <Divider />

        {/* ── LOCATION ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 03</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            HOW TO <span style={{ color:"#c8ff00" }}>FIND US</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px", marginBottom:44 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".08em", color:"#e8f0d8", marginBottom:16 }}>SWINDON AIRSOFT</div>
          <InfoRow icon="📍">
            <span>Manor Hl, Swindon, <span style={{ color:"#c8ff00", fontWeight:700 }}>SN5 4EG</span></span>
          </InfoRow>
          <InfoRow icon="🔤">
            What3Words: <span style={{ color:"#c8ff00" }}>///massaged.flasks.blunders</span>
          </InfoRow>
          <InfoRow icon="🛣️">
            Located just off Junction 16 of the M4 — easy to reach from all directions. A marshal will greet you on arrival.
          </InfoRow>
          <InfoRow icon="🚗">
            <span><span style={{ color:"#c8ff00" }}>Parking is limited</span> — car sharing is strongly encouraged where possible. A marshal will direct you where to park on arrival.</span>
          </InfoRow>
        </div>

        <Divider />

        {/* ── PRE-ORDERS ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 04</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            PRE-<span style={{ color:"#c8ff00" }}>ORDERS</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px" }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#7a9a50", lineHeight:1.9, marginBottom:20 }}>
            Want to order from{" "}
            <a href="https://www.airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
              style={{ color:"#c8ff00", textDecoration:"none", borderBottom:"1px solid rgba(200,255,0,.35)", paddingBottom:1 }}>
              Airsoft Armoury UK (www.airsoftarmoury.uk)
            </a>
            ? Place your order online and use code{" "}
            <span style={{ color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em" }}>COLLECTION</span>
            {" "}at checkout — we will bring your products to game day.
          </div>
          <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.3)", padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ color:"#c8ff00", fontSize:22, flexShrink:0 }}>⚠</span>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em", color:"#c8ff00", textTransform:"uppercase" }}>
                Order Deadline
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#7a9a50", marginTop:4, lineHeight:1.6 }}>
                You MUST place your order by the Friday prior to game day — no exceptions.
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div style={{ textAlign:"center", marginTop:56 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:18 }}>▸ READY TO DEPLOY? ◂</div>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="btn btn-primary" style={{ padding:"13px 36px", fontSize:13, letterSpacing:".15em" }} onClick={() => setPage("events")}>
              BOOK A GAME DAY →
            </button>
            <button className="btn btn-ghost" style={{ padding:"13px 28px", fontSize:13, letterSpacing:".15em" }} onClick={() => setPage("contact")}>
              CONTACT US →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Staff Page (public) ──────────────────────────────────
function StaffPage({ staff = [] }) {
  const RANK_LABELS = {
    1: "COMMANDING OFFICER",
    4: "SENIOR MARSHAL", 5: "MARSHAL", 7: "VOLUNTEER",
  };
  const RANK_PIPS = { 1: 5, 4: 3, 5: 2, 7: 1 };
  const getRankLabel = r => RANK_LABELS[r] || "MARSHAL";

  const tiers = staff.reduce((acc, member) => {
    const existingTier = acc.find(tier => tier.rank === member.rank_order);
    if (existingTier) existingTier.members.push(member);
    else acc.push({ rank: member.rank_order, members: [member] });
    return acc;
  }, []).sort((tierA, tierB) => tierA.rank - tierB.rank);

  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>

      {/* ── HEADER ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {/* Corner brackets */}
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>
            ◈ — SWINDON AIRSOFT — PERSONNEL DOSSIER — ◈
          </div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            CHAIN OF <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>COMMAND</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>
            ▸ FIELD OPERATIONS — AUTHORISED PERSONNEL ONLY ◂
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 80px" }}>

        {/* Empty */}
        {staff.length === 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>
            NO PERSONNEL ON FILE
          </div>
        )}

        {/* Tiers */}
        {tiers.map((tier, tierIdx) => (
          <div key={tier.rank}>
            {/* Connector from above */}
            {tierIdx > 0 && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", margin:"0 0 0" }}>
                <div style={{ width:1, height:28, background:"linear-gradient(to bottom,#2a3a10,transparent)" }} />
                <div style={{ color:"#2a3a10", fontSize:10 }}>▼</div>
              </div>
            )}

            {/* Rank label */}
            <div style={{ display:"flex", alignItems:"center", margin: tierIdx===0 ? "36px 0 28px" : "4px 0 28px" }}>
              <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#1e2c0a)" }} />
              <div style={{
                fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11,
                letterSpacing:".3em", textTransform:"uppercase",
                padding:"5px 22px", margin:"0 12px",
                color: tier.rank===1 ? "#c8a000" : tier.rank===4 ? "#c8ff00" : "#3a5010",
                border:`1px solid ${tier.rank===1 ? "rgba(200,160,0,.4)" : tier.rank===4 ? "rgba(200,255,0,.2)" : "#1a2808"}`,
                background: tier.rank===1 ? "rgba(200,160,0,.06)" : "rgba(200,255,0,.02)",
                whiteSpace:"nowrap", position:"relative",
              }}>
                {Array.from({length: RANK_PIPS[tier.rank] || 1}).map((_,i) => (
                  <span key={i} style={{ marginRight:3, opacity:.7 }}>★</span>
                ))}
                {getRankLabel(tier.rank)}
              </div>
              <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#1e2c0a)" }} />
            </div>

            {/* Cards */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:20, justifyContent:"center", paddingBottom:8 }}>
              {tier.members.map(member => (
                <StaffCard key={member.id} member={member} rank={tier.rank} pips={RANK_PIPS[tier.rank] || 1} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffCard({ member, rank, pips }) {
  const isOwner   = rank === 1;
  const isCommand = rank === 4;
  const gold   = "#c8a000";
  const green  = "#c8ff00";
  const accent = isOwner ? gold : isCommand ? green : "#4a6820";
  const border = isOwner ? "rgba(200,160,0,.35)" : isCommand ? "rgba(200,255,0,.18)" : "#1a2808";
  const bg     = isOwner
    ? "linear-gradient(180deg,#171200 0%,#0c0b06 100%)"
    : "linear-gradient(180deg,#0c1009 0%,#080a06 100%)";

  return (
    <div style={{
      width:210, overflow:"hidden", position:"relative",
      background:bg, border:`1px solid ${border}`,
      boxShadow: isOwner ? `0 0 40px rgba(200,160,0,.12), inset 0 1px 0 rgba(200,160,0,.06)` : `inset 0 1px 0 rgba(200,255,0,.02)`,
      transition:"transform .2s, box-shadow .2s",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-5px)";
        e.currentTarget.style.boxShadow = isOwner
          ? "0 16px 48px rgba(200,160,0,.22), inset 0 1px 0 rgba(200,160,0,.1)"
          : "0 10px 36px rgba(200,255,0,.07), inset 0 1px 0 rgba(200,255,0,.04)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = isOwner
          ? "0 0 40px rgba(200,160,0,.12), inset 0 1px 0 rgba(200,160,0,.06)"
          : "inset 0 1px 0 rgba(200,255,0,.02)";
      }}
    >
      {/* Scanlines */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.07) 3px,rgba(0,0,0,.07) 4px)", pointerEvents:"none", zIndex:5 }} />

      {/* ID strip */}
      <div style={{ background:"rgba(0,0,0,.7)", borderBottom:`1px solid ${border}`, padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:6, position:"relative" }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:accent, opacity:.6 }}>SA · FIELD PASS</div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:accent, opacity:.4 }}>
          {Array.from({length:pips}).map((_,i)=><span key={i}>★</span>)}
        </div>
      </div>

      {/* Photo */}
      <div style={{ width:"100%", height:195, background:"#06080500", overflow:"hidden", position:"relative" }}>
        {member.photo
          ? <img src={member.photo} alt={member.name} style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top", filter:"contrast(1.05) saturate(0.85)" }} />
          : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0a0c08", gap:8 }}>
              <div style={{ fontSize:52, opacity:.08 }}>👤</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#1e2c0a" }}>NO PHOTO ON FILE</div>
            </div>
        }
        {/* Gradient overlay */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:70, background:"linear-gradient(to top,rgba(8,10,6,.98),transparent)", zIndex:2 }} />
        {/* Corner brackets on photo */}
        {[["top","left"],["top","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:3, top:7,
            left:h==="left"?7:"auto", right:h==="right"?7:"auto",
            borderTop:`1px solid ${accent}`, opacity:.5,
            borderLeft:h==="left"?`1px solid ${accent}`:"none",
            borderRight:h==="right"?`1px solid ${accent}`:"none",
          }} />
        ))}
        {/* Rank badge for owner */}
        {isOwner && (
          <div style={{ position:"absolute", top:8, right:8, background:gold, color:"#000", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:8, letterSpacing:".15em", padding:"2px 8px", zIndex:4 }}>
            ★ C/O
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding:"12px 12px 10px", position:"relative", zIndex:6 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:17, letterSpacing:".1em", color: isOwner ? gold : "#dce8c8", textTransform:"uppercase", lineHeight:1.15, marginBottom:5 }}>
          {member.name}
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".16em", color:accent, opacity:.85, marginBottom:8 }}>
          ▸ {member.job_title}
        </div>
        {/* Rank bar */}
        <div style={{ display:"flex", gap:2, marginBottom: member.bio ? 10 : 4 }}>
          {Array.from({length:5}).map((_,i) => (
            <div key={i} style={{ flex:1, height:2, background: i < pips ? accent : "#141a0e", borderRadius:1 }} />
          ))}
        </div>
        {member.bio && (
          <div style={{ fontSize:11, color:"#3a4f28", lineHeight:1.65, borderTop:"1px solid #141a0e", paddingTop:8, fontFamily:"'Share Tech Mono',monospace" }}>
            {member.bio}
          </div>
        )}
      </div>

      {/* Barcode footer */}
      <div style={{ borderTop:`1px solid ${border}`, padding:"4px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", zIndex:6, position:"relative" }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".08em" }}>
          {member.id ? member.id.slice(0,8).toUpperCase() : "--------"}
        </div>
        <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
          {Array.from({length:18},(_,i) => (
            <div key={i} style={{ background:border, width:i%3===0?2:1, height:3+Math.abs(Math.sin(i*1.9)*6), borderRadius:1, opacity:.7 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin Staff ────────────────────────────────────────────
function AdminStaff({ showToast }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const RANK_OPTIONS = [
    { value: 1, label: "1 — Owner" },
    { value: 4, label: "4 — Senior Marshal" },
    { value: 5, label: "5 — Marshal" },
    { value: 7, label: "7 — Volunteer" },
  ];

  const blank = { name: "", jobTitle: "", bio: "", photo: "", rankOrder: 5 };
  const [form, setForm] = useState(blank);
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadStaff = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    api.staff.getAll()
      .then(data => { setStaffList(data); })
      .catch(e => { setLoadError(e.message || "Failed to load staff"); showToast("Failed to load staff: " + e.message, "red"); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadStaff(); }, []);

  const openNew = () => { setForm(blank); setModal("new"); };
  const openEdit = (m) => { setForm({ name: m.name, jobTitle: m.job_title, bio: m.bio || "", photo: m.photo || "", rankOrder: m.rank_order }); setModal(m); };

  const handlePhotoFile = async (e, existingId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (existingId) {
      setUploading(true);
      try { const url = await api.staff.uploadPhoto(existingId, file); ff("photo", url); showToast("Photo uploaded!"); }
      catch (err) { showToast("Upload failed: " + err.message, "red"); }
      finally { setUploading(false); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => ff("photo", reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name.trim()) { showToast("Name is required", "red"); return; }
    if (!form.jobTitle.trim()) { showToast("Job title is required", "red"); return; }
    setBusy(true);
    try {
      if (modal === "new") {
        const photoData = form.photo?.startsWith("data:") ? form.photo : "";
        const created = await api.staff.create({ ...form, photo: "" });
        if (photoData && created?.id) {
          const res = await fetch(photoData);
          const blob = await res.blob();
          const file = new File([blob], "photo.jpg", { type: blob.type });
          await api.staff.uploadPhoto(created.id, file);
        }
      } else {
        await api.staff.update(modal.id, form);
      }
      showToast(modal === "new" ? "Staff member added!" : "Staff member updated!");
      setModal(null);
      loadStaff(true); // silent refresh — no loading flash
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try { await api.staff.delete(deleteConfirm.id); showToast("Staff member removed", "red"); setDeleteConfirm(null); loadStaff(true); }
    catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Staff</div><div className="page-sub">Manage chain of command — changes appear live on the Staff page</div></div>
        <div className="gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff(true)}>🔄 Refresh</button>
          <button className="btn btn-primary" onClick={openNew}>+ Add Staff Member</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading...</div>}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 13 }}>⚠️ {loadError}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff()}>🔄 Try Again</button>
        </div>
      )}
      {!loading && !loadError && staffList.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No staff added yet. Click <strong>+ Add Staff Member</strong> to get started.</div>
      )}
      {!loading && !loadError && staffList.length > 0 && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Photo</th><th>Name</th><th>Job Title</th><th>Rank</th><th>Bio</th><th>Actions</th></tr></thead>
            <tbody>
              {staffList.map(m => (
                <tr key={m.id}>
                  <td>{m.photo ? <img src={m.photo} alt={m.name} style={{ width: 40, height: 40, borderRadius: 2, objectFit: "cover" }} /> : <div style={{ width: 40, height: 40, background: "var(--bg3)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--muted)" }}>👤</div>}</td>
                  <td style={{ fontWeight: 700 }}>{m.name}</td>
                  <td style={{ color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".05em" }}>{m.job_title}</td>
                  <td><span style={{ fontSize: 11, color: m.rank_order === 1 ? "var(--gold)" : "var(--muted)", fontFamily: "'Barlow Condensed',sans-serif" }}>{RANK_OPTIONS.find(r => r.value === m.rank_order)?.label || `Rank ${m.rank_order}`}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.bio || "—"}</td>
                  <td><div className="gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(m)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(m)}>Remove</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {modal !== null && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-title">{modal === "new" ? "➕ Add Staff Member" : `✏️ Edit — ${modal.name}`}</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ width: 90, height: 90, borderRadius: 4, overflow: "hidden", background: "#111", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.photo ? <img src={form.photo} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, opacity: .3 }}>👤</span>}
                </div>
                <label style={{ display: "block", marginTop: 8, cursor: "pointer" }}>
                  <div className="btn btn-sm btn-ghost" style={{ textAlign: "center", pointerEvents: "none" }}>{uploading ? "Uploading…" : "📷 Photo"}</div>
                  <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={e => handlePhotoFile(e, modal !== "new" ? modal.id : null)} />
                </label>
              </div>
              <div style={{ flex: 1 }}>
                <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="e.g. John Smith" /></div>
                <div className="form-group"><label>Job Title *</label><input value={form.jobTitle} onChange={e => ff("jobTitle", e.target.value)} placeholder="e.g. Head Marshal" /></div>
              </div>
            </div>
            <div className="form-group">
              <label>Rank / Position</label>
              <select value={form.rankOrder} onChange={e => ff("rankOrder", Number(e.target.value))}>
                {RANK_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Lower number = higher up the chain of command.</div>
            </div>
            <div className="form-group">
              <label>Bio <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <textarea rows={3} value={form.bio} onChange={e => ff("bio", e.target.value)} placeholder="Short description shown on the staff card…" />
            </div>
            <div className="gap-2" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy || uploading}>{busy ? "Saving…" : modal === "new" ? "Add Member" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚠️ Remove Staff Member</div>
            <p style={{ color: "var(--muted)", marginBottom: 20 }}>Are you sure you want to remove <strong style={{ color: "var(--text)" }}>{deleteConfirm.name}</strong> from the staff page?</p>
            <div className="gap-2">
              <button className="btn btn-danger" onClick={confirmDelete} disabled={busy}>{busy ? "Removing…" : "Yes, Remove"}</button>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contact Page (public) ─────────────────────────────────
function ContactPage({ data, cu, showToast }) {
  const isMobile = useMobile(640);
  const departments = data.contactDepartments || [];

  const blank = { name: cu?.name || "", email: cu?.email || "", department: "", subject: "", message: "" };
  const [form, setForm]     = useState(blank);
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedDept = departments.find(d => d.name === form.department);

  const handleSend = async () => {
    if (!form.name.trim())    { showToast("Please enter your name", "red"); return; }
    if (!form.email.trim() || !form.email.includes("@")) { showToast("Please enter a valid email", "red"); return; }
    if (!form.department)     { showToast("Please select a department", "red"); return; }
    if (!form.subject.trim()) { showToast("Please enter a subject", "red"); return; }
    if (!form.message.trim()) { showToast("Please enter a message", "red"); return; }
    if (!selectedDept?.email) { showToast("This department has no email configured yet", "red"); return; }

    setSending(true);
    try {
      await sendEmail({
        toEmail: selectedDept.email,
        toName:  selectedDept.name,
        subject: `[${selectedDept.name}] ${form.subject}`,
        htmlContent: `
          <div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#c8ff00;font-family:'Barlow Condensed',sans-serif;letter-spacing:.08em;text-transform:uppercase">
              New Contact Message — ${selectedDept.name}
            </h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px;width:120px">FROM</td><td style="padding:8px;background:#111;color:#fff">${form.name}</td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">EMAIL</td><td style="padding:8px;background:#111;color:#fff"><a href="mailto:${form.email}" style="color:#c8ff00">${form.email}</a></td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">DEPT</td><td style="padding:8px;background:#111;color:#fff">${selectedDept.name}</td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">SUBJECT</td><td style="padding:8px;background:#111;color:#fff">${form.subject}</td></tr>
            </table>
            <div style="background:#111;border-left:3px solid #c8ff00;padding:16px;white-space:pre-wrap;color:#ccc;line-height:1.6">${form.message}</div>
          </div>
        `,
      });
      setSent(true);
      showToast("Message sent successfully!");
    } catch (e) {
      showToast("Failed to send: " + (e.message || "Please try again"), "red");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div style={{ background: "#080a06", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ position: "relative", display: "inline-block", marginBottom: 28 }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position: "absolute", width: 20, height: 20, zIndex: 2,
              top: v==="top" ? -8 : "auto", bottom: v==="bottom" ? -8 : "auto",
              left: h==="left" ? -8 : "auto", right: h==="right" ? -8 : "auto",
              borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
              borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
            }} />
          ))}
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 48, color: "#c8ff00", padding: "8px 24px", letterSpacing: ".1em" }}>✓</div>
        </div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, letterSpacing: ".2em", textTransform: "uppercase", color: "#e8f0d8", marginBottom: 12 }}>TRANSMISSION SENT</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#3a5010", letterSpacing: ".1em", marginBottom: 8 }}>MESSAGE ROUTED TO: <span style={{ color: "#c8ff00" }}>{form.department.toUpperCase()}</span></div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#2a3a10", letterSpacing: ".08em", marginBottom: 32 }}>REPLY WILL BE SENT TO: {form.email}</div>
        <button className="btn btn-primary" style={{ letterSpacing: ".15em" }} onClick={() => { setSent(false); setForm(blank); }}>SEND ANOTHER TRANSMISSION</button>
      </div>
    );
  }

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — COMMAND COMMS — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            OPEN <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>CHANNEL</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ SECURE TRANSMISSION LINE — ALL COMMS MONITORED ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 24 }}>

          {/* Form */}
          <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "28px 24px" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 22, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,#c8ff00,transparent)", opacity: .3 }} />
              SEND TRANSMISSION
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to left,#c8ff00,transparent)", opacity: .3 }} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>OPERATIVE NAME *</label>
                <input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="Full name" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
              </div>
              <div className="form-group">
                <label>COMMS ADDRESS *</label>
                <input value={form.email} onChange={e => ff("email", e.target.value)} placeholder="you@example.com" type="email" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
              </div>
            </div>

            <div className="form-group">
              <label>TARGET DEPARTMENT *</label>
              <select value={form.department} onChange={e => ff("department", e.target.value)} style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }}>
                <option value="">— SELECT DEPARTMENT —</option>
                {departments.length === 0
                  ? <option disabled>No departments configured yet</option>
                  : departments.map(d => <option key={d.name} value={d.name}>{d.name.toUpperCase()}</option>)
                }
              </select>
              {selectedDept?.description && (
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", marginTop: 6, letterSpacing: ".05em", lineHeight: 1.5 }}>▸ {selectedDept.description}</div>
              )}
            </div>

            <div className="form-group">
              <label>SUBJECT *</label>
              <input value={form.subject} onChange={e => ff("subject", e.target.value)} placeholder="Brief summary of your enquiry" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
            </div>

            <div className="form-group">
              <label>MESSAGE BODY *</label>
              <textarea rows={6} value={form.message} onChange={e => ff("message", e.target.value)} placeholder="Describe your enquiry in detail…" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
            </div>

            <button className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: 14, letterSpacing: ".2em", borderRadius: 0 }} onClick={handleSend} disabled={sending}>
              {sending ? "TRANSMITTING…" : "▸ SEND TRANSMISSION"}
            </button>
          </div>

          {/* Side panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {departments.length > 0 && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ DEPARTMENTS</div>
                {departments.map((d, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: i < departments.length-1 ? "1px solid #1a2808" : "none" }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: ".15em", color: "#c8ff00", textTransform: "uppercase", marginBottom: 4 }}>▸ {d.name}</div>
                    {d.description && <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", lineHeight: 1.5 }}>{d.description}</div>}
                  </div>
                ))}
              </div>
            )}

            {(data.contactAddress || data.contactPhone || data.contactEmail) && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ BASE COORDINATES</div>
                {data.contactEmail && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>✉</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>COMMS</div>
                      <a href={`mailto:${data.contactEmail}`} style={{ color: "#c8ff00", fontSize: 12, fontFamily: "'Share Tech Mono',monospace", textDecoration: "none" }}>{data.contactEmail}</a>
                    </div>
                  </div>
                )}
                {data.contactPhone && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>☎</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>FIELD LINE</div>
                      <a href={`tel:${data.contactPhone}`} style={{ color: "#b0c090", fontSize: 12, fontFamily: "'Share Tech Mono',monospace", textDecoration: "none" }}>{data.contactPhone}</a>
                    </div>
                  </div>
                )}
                {data.contactAddress && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>⊕</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>GRID REF</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#b0c090", lineHeight: 1.6, whiteSpace: "pre-line" }}>{data.contactAddress}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Contact Departments ──────────────────────────────
function AdminContactDepts({ showToast, save }) {
  const [depts, setDepts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]  = useState(false);
  const [modal, setModal]    = useState(null); // null | "new" | index
  const [form, setForm]      = useState({ name:"", email:"", description:"" });
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api.settings.get("contact_departments")
      .then(raw => { try { setDepts(JSON.parse(raw || "[]")); } catch { setDepts([]); } })
      .catch(() => setDepts([]))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (updated) => {
    setSaving(true);
    try {
      await api.settings.set("contact_departments", JSON.stringify(updated));
      setDepts(updated);
      // Refresh global data so ContactPage sees new depts immediately
      save({ contactDepartments: updated });
      showToast("Departments saved!");
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const openNew  = () => { setForm({ name:"", email:"", description:"" }); setModal("new"); };
  const openEdit = (i) => { setForm({ ...depts[i] }); setModal(i); };

  const saveDept = async () => {
    if (!form.name.trim())  { showToast("Name is required", "red"); return; }
    if (!form.email.trim() || !form.email.includes("@")) { showToast("Valid email required", "red"); return; }
    const updated = modal === "new"
      ? [...depts, { name: form.name.trim(), email: form.email.trim(), description: form.description.trim() }]
      : depts.map((d, i) => i === modal ? { name: form.name.trim(), email: form.email.trim(), description: form.description.trim() } : d);
    await persist(updated);
    setModal(null);
  };

  const deleteDept = async (i) => {
    await persist(depts.filter((_, idx) => idx !== i));
  };

  const moveUp   = (i) => { if (i === 0) return; const deptsArr = [...depts]; [deptsArr[i-1], deptsArr[i]] = [deptsArr[i], deptsArr[i-1]]; persist(deptsArr); };
  const moveDown = (i) => { if (i === depts.length-1) return; const deptsArr = [...depts]; [deptsArr[i], deptsArr[i+1]] = [deptsArr[i+1], deptsArr[i]]; persist(deptsArr); };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contact Departments</div>
          <div className="page-sub">Manage the dropdown options and destination emails on the Contact Us page</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Department</button>
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>Loading…</div>}

      {!loading && depts.length === 0 && (
        <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>
          No departments yet. Click <strong>+ Add Department</strong> to get started.
        </div>
      )}

      {!loading && depts.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Order</th><th>Department</th><th>Email Address</th><th>Description</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {depts.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                        <button className="btn btn-sm btn-ghost" style={{ padding:"2px 6px", fontSize:10 }} onClick={() => moveUp(i)} disabled={i === 0 || saving}>▲</button>
                        <button className="btn btn-sm btn-ghost" style={{ padding:"2px 6px", fontSize:10 }} onClick={() => moveDown(i)} disabled={i === depts.length-1 || saving}>▼</button>
                      </div>
                    </td>
                    <td style={{ fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".06em", color:"var(--accent)", textTransform:"uppercase" }}>{d.name}</td>
                    <td style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>{d.email}</td>
                    <td style={{ fontSize:12, color:"var(--muted)", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.description || "—"}</td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(i)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteDept(i)} disabled={saving}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:12 }}>Emails are never shown publicly — they only receive the contact form submissions.</div>
        </div>
      )}

      {modal !== null && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:480 }}>
            <div className="modal-title">{modal === "new" ? "➕ Add Department" : `✏️ Edit — ${depts[modal]?.name}`}</div>

            <div className="form-group">
              <label>Department Name *</label>
              <input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="e.g. Bookings, General, Marshals" />
            </div>
            <div className="form-group">
              <label>Email Address * <span style={{ color:"var(--muted)", fontWeight:400 }}>(not shown publicly)</span></label>
              <input value={form.email} onChange={e => ff("email", e.target.value)} placeholder="department@example.com" type="email" />
            </div>
            <div className="form-group">
              <label>Description <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional — shown to users in dropdown)</span></label>
              <textarea rows={2} value={form.description} onChange={e => ff("description", e.target.value)} placeholder="e.g. For questions about booking events and game days" />
            </div>

            <div className="gap-2" style={{ marginTop:18 }}>
              <button className="btn btn-primary" onClick={saveDept} disabled={saving}>{saving ? "Saving…" : modal === "new" ? "Add Department" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Test Card ────────────────────────────────────────
function EmailTestCard({ showToast, sectionHead }) {
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { ok, msg }

  const runTest = async () => {
    if (!testEmail || !testEmail.includes("@")) { showToast("Enter a valid email address", "red"); return; }
    setTesting(true);
    setLastResult(null);
    try {
      await sendEmail({
        toEmail: testEmail.trim(),
        toName: "Admin Test",
        subject: "✅ Swindon Airsoft — Email Test",
        htmlContent: `
          <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
            <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
              <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
              <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Email Test</div>
            </div>
            <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;text-align:center;">
              <div style="font-size:40px;margin-bottom:12px;">✅</div>
              <div style="font-size:22px;font-weight:900;color:#c8ff00;">EmailJS is working!</div>
              <div style="font-size:13px;color:#aaa;margin-top:10px;">
                Sent at ${new Date().toLocaleString("en-GB")}<br/>
                Service: ${EMAILJS_SERVICE_ID} · Template: ${EMAILJS_TEMPLATE_ID}
              </div>
            </div>
          </div>`,
      });
      setLastResult({ ok: true, msg: "Email sent successfully! Check your inbox (and spam)." });
      showToast("📧 Test email sent!");
    } catch (e) {
      const msg = e?.text || e?.message || JSON.stringify(e);
      setLastResult({ ok: false, msg: "Failed: " + msg });
      showToast("Email failed: " + msg, "red");
    } finally { setTesting(false); }
  };

  return (
    <div className="card mb-2">
      {sectionHead("📧 Email Diagnostics")}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.7 }}>
        Send a test email to verify EmailJS is configured correctly.<br/>
        Service: <span className="mono" style={{ color: "var(--accent)" }}>{EMAILJS_SERVICE_ID}</span> ·
        Template: <span className="mono" style={{ color: "var(--accent)" }}>{EMAILJS_TEMPLATE_ID}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          type="email"
          value={testEmail}
          onChange={e => setTestEmail(e.target.value)}
          placeholder="your@email.com"
          onKeyDown={e => e.key === "Enter" && runTest()}
          style={{ flex: 1, fontSize: 13 }}
        />
        <button className="btn btn-primary" onClick={runTest} disabled={testing} style={{ whiteSpace: "nowrap" }}>
          {testing ? "Sending…" : "Send Test Email"}
        </button>
      </div>
      {lastResult && (
        <div className={`alert ${lastResult.ok ? "alert-green" : "alert-red"}`} style={{ fontSize: 12 }}>
          {lastResult.ok ? "✅ " : "❌ "}{lastResult.msg}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, lineHeight: 1.7 }}>
        <strong style={{ color: "var(--text)" }}>If the test fails, check:</strong><br/>
        • EmailJS dashboard → your template has variables: <span className="mono">to_email</span>, <span className="mono">to_name</span>, <span className="mono">subject</span>, <span className="mono">html_content</span><br/>
        • The service is connected and verified in EmailJS<br/>
        • Your EmailJS free tier hasn't hit its monthly limit (200/month)<br/>
        • The template's "To Email" field is set to <span className="mono">{"{{to_email}}"}</span>
      </div>
    </div>
  );
}

// ── Admin Settings ────────────────────────────────────────
function AdminSettings({ showToast }) {
  const S = (key, def = "") => {
    const [val, setVal] = useState(def);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      api.settings.get(key).then(v => { if (v) setVal(v); setLoaded(true); }).catch(() => setLoaded(true));
    }, []);
    return [val, setVal, loaded];
  };

  const [paypalClientId, setPaypalClientId] = S("paypal_client_id");
  const [paypalMode, setPaypalMode, ppLoaded] = S("paypal_mode", "sandbox");
  const [savingPP, setSavingPP] = useState(false);
  const [showClientId, setShowClientId] = useState(false);

  const savePaypal = async () => {
    setSavingPP(true);
    try {
      await api.settings.set("paypal_client_id", paypalClientId.trim());
      await api.settings.set("paypal_mode", paypalMode);
      // Reset cached config so next checkout reloads it
      _paypalConfigLoaded = false;
      showToast("✅ PayPal settings saved! Changes take effect on next checkout.");
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingPP(false); }
  };

  const sectionHead = (label) => (
    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Payment configuration and API keys</div>
        </div>
      </div>

      {/* PayPal */}
      <div className="card mb-2">
        {sectionHead("💳 PayPal Payments")}

        <div className="form-group">
          <label>Mode</label>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {["sandbox", "live"].map(m => (
              <button key={m} onClick={() => setPaypalMode(m)}
                style={{
                  padding: "8px 22px", borderRadius: 4, border: "1px solid",
                  fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer",
                  background: paypalMode === m ? (m === "live" ? "var(--accent)" : "#2d7a2d") : "var(--card)",
                  color: paypalMode === m ? "#000" : "var(--muted)",
                  borderColor: paypalMode === m ? (m === "live" ? "var(--accent)" : "#2d7a2d") : "var(--border)",
                }}>
                {m === "live" ? "🟠 Live" : "🟢 Sandbox / Test"}
              </button>
            ))}
          </div>
          {paypalMode === "live"
            ? <div className="alert alert-red mt-2" style={{ fontSize: 12 }}>⚠️ LIVE mode — real payments will be charged to customers.</div>
            : <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>Sandbox mode — test payments only, no real money taken.</div>
          }
        </div>

        <div className="form-group">
          <label>PayPal Client ID {paypalMode === "live" ? "(Live)" : "(Sandbox)"}</label>
          <div style={{ position: "relative" }}>
            <input
              type={showClientId ? "text" : "password"}
              value={paypalClientId}
              onChange={e => setPaypalClientId(e.target.value)}
              placeholder={paypalMode === "live" ? "AaBbCc... (Live Client ID from PayPal Developer Dashboard)" : "AaBbCc... (Sandbox Client ID)"}
              style={{ paddingRight: 80 }}
            />
            <button onClick={() => setShowClientId(v => !v)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>
              {showClientId ? "Hide" : "Show"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            Get your Client ID from{" "}
            <a href="https://developer.paypal.com/developer/applications" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              developer.paypal.com → My Apps &amp; Credentials
            </a>
            . Use the <strong>Live</strong> Client ID for real payments.
          </div>
        </div>

        <button className="btn btn-primary" onClick={savePaypal} disabled={savingPP || !ppLoaded}>
          {savingPP ? "Saving..." : "Save PayPal Settings"}
        </button>

        {paypalMode === "live" && paypalClientId && (
          <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>
            ✅ Live PayPal is configured. Customers will see the real PayPal button at checkout.
          </div>
        )}
        {paypalMode === "live" && !paypalClientId && (
          <div className="alert alert-red mt-2" style={{ fontSize: 12 }}>
            ⚠️ Mode is set to Live but no Client ID is saved — checkouts will show an error.
          </div>
        )}
      </div>

      {/* How to get PayPal keys guide */}
      <div className="card mb-2" style={{ background: "#0a140a", border: "1px solid #1a2e1a" }}>
        {sectionHead("📋 PayPal Setup Guide")}
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 2 }}>
          <div>1. Go to <a href="https://developer.paypal.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>developer.paypal.com</a> and log in with your PayPal business account.</div>
          <div>2. Click <strong style={{ color: "var(--text)" }}>Apps &amp; Credentials</strong> → switch to <strong style={{ color: "var(--text)" }}>Live</strong> tab.</div>
          <div>3. Click your app (or create one) → copy the <strong style={{ color: "var(--text)" }}>Client ID</strong>.</div>
          <div>4. Paste it above, set Mode to <strong style={{ color: "var(--accent)" }}>Live</strong>, and click Save.</div>
          <div>5. Payments will now go directly into your PayPal business account.</div>
        </div>
      </div>

      {/* EmailJS test */}
      <EmailTestCard showToast={showToast} sectionHead={sectionHead} />
    </div>
  );
}

// ── Admin Messages ────────────────────────────────────────
function AdminMessages({ data, save, showToast }) {
  const [msg, setMsg] = useState(data.homeMsg || "");
  const [facebook, setFacebook] = useState(data.socialFacebook || "");
  const [instagram, setInstagram] = useState(data.socialInstagram || "");
  const [contactAddress, setContactAddress] = useState(data.contactAddress || "");
  const [contactPhone, setContactPhone] = useState(data.contactPhone || "");
  const [contactEmail, setContactEmail] = useState(data.contactEmail || "swindonairsoftfield@gmail.com");
  const [saving, setSaving] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const saveMsg = async (val) => {
    setSaving(true);
    try {
      await api.settings.set("home_message", val);
      setMsg(val);
      save({ homeMsg: val });
      showToast(val ? "Message saved!" : "Message cleared");
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const upsertSetting = (key, value) => api.settings.set(key, value);

  const saveSocial = async () => {
    setSavingSocial(true);
    try {
      await upsertSetting("social_facebook", facebook);
      await upsertSetting("social_instagram", instagram);
      save({ socialFacebook: facebook, socialInstagram: instagram });
      showToast("Social links saved!");
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingSocial(false); }
  };

  const saveContact = async () => {
    setSavingContact(true);
    try {
      await upsertSetting("contact_address", contactAddress);
      await upsertSetting("contact_phone", contactPhone);
      await upsertSetting("contact_email", contactEmail);
      save({ contactAddress, contactPhone, contactEmail });
      showToast("Contact details saved!");
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingContact(false); }
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Site Messages</div><div className="page-sub">Ticker, social links and contact details</div></div></div>

      <div className="card mb-2">
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Ticker Message</div>
        <div className="form-group">
          <label>Message</label>
          <textarea rows={3} value={msg} onChange={e => setMsg(e.target.value)} placeholder="e.g. Next event booking now open! — Saturday 14th June" />
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>Leave blank to hide the ticker.</div>
        </div>
        <div className="gap-2">
          <button className="btn btn-primary" onClick={() => saveMsg(msg)} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button className="btn btn-danger" onClick={() => { setMsg(""); saveMsg(""); }} disabled={saving}>Clear</button>
        </div>
        {data.homeMsg && <div className="alert alert-green mt-2" style={{ fontSize:12 }}>Active: {data.homeMsg}</div>}
      </div>

      <div className="card mb-2">
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Contact Details</div>
        <div className="form-group"><label>Address / Location</label><input value={contactAddress} onChange={e => setContactAddress(e.target.value)} placeholder="Swindon, Wiltshire, UK" /></div>
        <div className="form-group"><label>Phone Number</label><input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+44 1234 567890" /></div>
        <div className="form-group"><label>Email Address</label><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="info@swindon-airsoft.com" /></div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>Shown in the footer. Leave blank to hide a field.</div>
        <button className="btn btn-primary" onClick={saveContact} disabled={savingContact}>{savingContact ? "Saving..." : "Save Contact Details"}</button>
      </div>

      <div className="card">
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Social Links</div>
        <div className="form-group"><label>Facebook URL</label><input value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="https://facebook.com/your-page" /></div>
        <div className="form-group"><label>Instagram URL</label><input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/your-account" /></div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>Icons appear in the footer. Leave blank to hide.</div>
        <button className="btn btn-primary" onClick={saveSocial} disabled={savingSocial}>{savingSocial ? "Saving..." : "Save Social Links"}</button>
      </div>
    </div>
  );
}

// ── Admin Cash Sales ──────────────────────────────────────
function AdminCash({ data, cu, showToast }) {
  const [items, setItems] = useState([]);
  const [shopProducts, setShopProducts] = useState(data.shop || []);
  const [shopLoading, setShopLoading] = useState(true);
  const [playerId, setPlayerId] = useState("manual");
  const [manual, setManual] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [diagResult, setDiagResult] = useState(null);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  useEffect(() => {
    api.shop.getAll()
      .then(list => { setShopProducts(list); setShopLoading(false); })
      .catch(() => { setShopProducts(data.shop || []); setShopLoading(false); });
  }, []);

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
          {shopLoading && <p className="text-muted" style={{ fontSize: 13 }}>Loading products…</p>}
          {!shopLoading && shopProducts.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No products in shop yet. Add products in the Shop section.</p>}
          {!shopLoading && shopProducts.map(item => {
            const effectivePrice = item.onSale && item.salePrice ? item.salePrice : item.price;
            if (item.variants && item.variants.length > 0) {
              return (
                <div key={item.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{item.name}</div>
                  {item.variants.map(v => (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0 3px 12px" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{v.name}</span>
                      <div className="gap-2">
                        <span className="text-green" style={{ fontSize: 12 }}>£{Number(v.price).toFixed(2)}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>({v.stock})</span>
                        <button className="btn btn-sm btn-primary" onClick={() => add({ id: `${item.id}::${v.id}`, name: `${item.name} — ${v.name}`, price: Number(v.price) })}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ fontSize: 13 }}>{item.name}</span>
                  {item.onSale && item.salePrice && <span className="tag tag-red" style={{ fontSize: 9, marginLeft: 6 }}>SALE</span>}
                </div>
                <div className="gap-2">
                  <span className="text-green">£{Number(effectivePrice).toFixed(2)}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>({item.stock})</span>
                  <button className="btn btn-sm btn-primary" onClick={() => add({ id: item.id, name: item.name, price: Number(effectivePrice) })}>+</button>
                </div>
              </div>
            );
          })}
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
  // ── Hash routing ──────────────────────────────────────────
  // Format: #page  |  #admin/section  |  #admin/section/tab
  //         #profile/tab  |  #events/eventId
  const PUBLIC_PAGES = ["home","events","shop","gallery","qa","vip","leaderboard","profile","about","staff","contact"];
  const ADMIN_SECTIONS = ["dashboard","events","waivers","unsigned-waivers","players","shop",
    "leaderboard-admin","revenue","visitor-stats","gallery-admin","qa-admin","staff-admin",
    "contact-admin","messages","cash","settings"];

  const getInitialPage = () => {
    const parts = window.location.hash.replace("#","").split("/");
    const p = parts[0];
    if (p === "admin") return "admin";
    return PUBLIC_PAGES.includes(p) ? p : "home";
  };
  const [page, setPageState] = useState(getInitialPage);

  // setPage writes the hash AND updates state
  const setPage = (p) => {
    setPageState(p);
    // Preserve admin sub-hash when returning; otherwise just set the page
    if (p !== "admin") window.location.hash = p;
    else {
      const cur = window.location.hash.replace("#","").split("/");
      const sec = cur[0] === "admin" && cur[1] ? cur[1] : "dashboard";
      const tab = cur[2] || "";
      window.location.hash = "admin/" + sec + (tab ? "/" + tab : "");
    }
  };

  const [cu, setCu] = useState(null);          // current user profile
  const [authLoading, setAuthLoading] = useState(true);
  const [authModal, setAuthModal] = useState(null);
  const [toast, showToast] = useToast();

  // ── Page visit tracking ──────────────────────────────────
  useEffect(() => {
    // Only track public pages, not admin
    if (page === "admin") return;
    // Stable session ID for this browser tab
    let sid = sessionStorage.getItem("sa_sid");
    if (!sid) { sid = Math.random().toString(36).slice(2); sessionStorage.setItem("sa_sid", sid); }
    api.visits.track({
      page,
      userId:    cu?.id   || null,
      userName:  cu?.name || null,
      sessionId: sid,
    });
  }, [page, cu?.id]);
  useEffect(() => {
    const onHash = () => {
      const parts = window.location.hash.replace("#","").split("/");
      const p = parts[0];
      if (p === "admin") { setPageState("admin"); return; }
      if (PUBLIC_PAGES.includes(p)) setPageState(p);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
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
        // Try getSession first — Supabase will auto-refresh if the access token is expired
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          clearTimeout(timeout);
          try {
            const profile = await api.profiles.getById(session.user.id);
            setCu(normaliseProfile(profile));
          } catch { /* profile fetch failed — session is still valid, user stays logged in */ }
          setAuthLoading(false);
          return;
        }

        // getSession returned null — could be a noopLock issue or the access token
        // was cleared. Try using the refresh_token from localStorage to get a new session.
        const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (storageKey) {
          try {
            const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
            // Try refresh_token first (most reliable — gets a brand new access token)
            if (raw?.refresh_token) {
              const { data: refreshed } = await supabase.auth.refreshSession({ refresh_token: raw.refresh_token });
              if (refreshed?.session?.user) {
                const profile = await api.profiles.getById(refreshed.session.user.id).catch(() => null);
                if (profile) setCu(normaliseProfile(profile));
                clearTimeout(timeout);
                setAuthLoading(false);
                return;
              }
            }
            // Fall back to setSession with stored tokens
            if (raw?.access_token) {
              const { data: restored } = await supabase.auth.setSession({
                access_token: raw.access_token,
                refresh_token: raw.refresh_token,
              });
              if (restored?.session?.user) {
                const profile = await api.profiles.getById(restored.session.user.id).catch(() => null);
                if (profile) setCu(normaliseProfile(profile));
                clearTimeout(timeout);
                setAuthLoading(false);
                return;
              }
            }
          } catch { /* localStorage entry malformed or tokens truly expired */ }
        }
      } catch { /* getSession threw — network error, stay with current state */ }

      clearTimeout(timeout);
      setAuthLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") return;

      // TOKEN_REFRESHED — JWT silently renewed, nothing to do.
      if (event === "TOKEN_REFRESHED") return;

      // SIGNED_OUT fired by Supabase's own refresh logic (e.g. tab sleep, network blip).
      // We do NOT log the user out here — only the Logout button should do that.
      // Instead, try to recover the session from localStorage so the user stays in.
      if (event === "SIGNED_OUT") {
        try {
          const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
          if (storageKey) {
            const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (raw?.refresh_token) {
              const { data: refreshed } = await supabase.auth.refreshSession({ refresh_token: raw.refresh_token });
              if (refreshed?.session?.user) {
                // Session recovered — keep the user logged in silently
                return;
              }
            }
          }
        } catch { /* recovery failed — fall through, but still don't force logout */ }
        // Only truly log out if we genuinely have no session at all
        const { data: { session: currentSession } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (!currentSession) setCu(null);
        return;
      }

      if (session?.user) {
        try {
          const profile = await api.profiles.getById(session.user.id);
          if (profile) {
            setCu(normaliseProfile(profile));
          } else {
            // Profile may not exist yet (new signup before confirmation) — try creating it
            try {
              const meta = session.user.user_metadata || {};
              await supabase.from('profiles').insert({
                id: session.user.id, name: meta.name || session.user.email?.split('@')[0] || 'Player',
                phone: meta.phone || '', role: 'player', games_attended: 0,
              }).select().single();
              const profile2 = await api.profiles.getById(session.user.id);
              if (profile2) setCu(normaliseProfile(profile2));
            } catch { /* profile creation failed — keep existing cu state */ }
          }
        } catch { /* profile fetch failed — keep existing cu state, don't log out */ }
        // Do NOT call refresh() here — onLogin already calls it
      }
      // NOTE: we intentionally do NOT setCu(null) when session is null here.
      // The only place that should log the user out is the Logout button (signOut()).
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
    if (cu?.id === id) {
      setCu(prev => prev ? { ...prev, ...patch } : prev);
      refreshCu().catch(() => {});
    }
  }, [updateUser, cu, refreshCu]);

  const [loadingSeconds, setLoadingSeconds] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Only show loading screen while initial data fetch is in progress
  // Auth loads in the background - never block the site on it
  if (loading) {
    const isSlowLoad = loadingSeconds >= 6;
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "#0d1117", padding: 24 }}>
        <div style={{ width: 48, height: 48, background: "var(--accent,#e05c00)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 16, animation: "pulse 1s infinite", fontFamily: "'Barlow Condensed',sans-serif" }}>SA</div>
        <div style={{ color: "var(--muted)", fontSize: 13, letterSpacing: ".15em" }}>
          {isSlowLoad ? "WAKING UP DATABASE..." : "LOADING..."}
        </div>
        {isSlowLoad && (
          <div style={{ color: "#555", fontSize: 11, letterSpacing: ".05em", textAlign: "center", maxWidth: 260 }}>
            This can take a moment after a period of inactivity
          </div>
        )}
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
        {page === "events"      && <EventsPage data={data} cu={cu} updateEvent={updateEvent} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} save={save} setPage={setPage} />}
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
        {page === "profile"     && cu  && <ProfilePage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} save={save} refresh={refreshCu} setPage={setPage} />}
        {page === "profile"     && !cu && <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Please log in to view your profile.</div>}
        {page === "about"       && <AboutPage setPage={setPage} />}
        {page === "staff"       && <StaffPage staff={data.staff || []} />}
        {page === "contact"     && <ContactPage data={data} cu={cu} showToast={showToast} />}
      </div>

      {/* FOOTER */}
      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-grid">
            {/* Brand col */}
            <div>
              <div className="pub-footer-logo">
                <div className="pub-footer-logo-box">SA</div>
                <div className="pub-footer-logo-text">SWINDON AIRSOFT</div>
              </div>
              <p className="pub-footer-desc">Premier airsoft venue. Experience tactical gameplay like never before.</p>
              {(data.socialFacebook || data.socialInstagram) && (
                <div className="pub-footer-social" style={{ marginTop:16 }}>
                  {data.socialFacebook && (
                    <a href={data.socialFacebook} target="_blank" rel="noopener noreferrer" className="pub-footer-social-btn" title="Facebook">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                    </a>
                  )}
                  {data.socialInstagram && (
                    <a href={data.socialInstagram} target="_blank" rel="noopener noreferrer" className="pub-footer-social-btn" title="Instagram">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    </a>
                  )}
                </div>
              )}
            </div>
            {/* Quick Links */}
            <div>
              <div className="pub-footer-col-title">QUICK LINKS</div>
              {[
                ["Upcoming Events", "events"],
                ["Shop", "shop"],
                ["VIP Membership", "vip"],
                ["Gallery", "gallery"],
                ["Meet the Staff", "staff"],
                ["Contact Us", "contact"],
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
              {data.contactAddress && <div className="pub-footer-contact">📍 {data.contactAddress}</div>}
              {data.contactPhone && <div className="pub-footer-contact">📞 <a href={`tel:${data.contactPhone}`} style={{color:"inherit",textDecoration:"none"}}>{data.contactPhone}</a></div>}
              {data.contactEmail && <div className="pub-footer-contact">✉️ <a href={`mailto:${data.contactEmail}`} style={{color:"inherit",textDecoration:"none"}}>{data.contactEmail}</a></div>}
              {!data.contactAddress && !data.contactPhone && !data.contactEmail && (
                <div className="pub-footer-contact" style={{color:"#444"}}>Contact details coming soon</div>
              )}
            </div>
          </div>
          <div className="pub-footer-bottom">
            <div className="pub-footer-copy">© {new Date().getFullYear()} Swindon Airsoft. All rights reserved.</div>
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
