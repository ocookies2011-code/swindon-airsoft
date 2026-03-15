// ─────────────────────────────────────────────────────────────
// utils.jsx  —  Shared helpers, constants, email functions,
//               and reusable UI components used across App.jsx
//               and AdminPanel.jsx
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { squareRefund, waitlistApi, normaliseProfile } from "./api";

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

// ── Square config — loaded dynamically from Supabase site_settings ──
let _squareAppId = "";
let _squareLocationId = "";
let _squareEnv = "sandbox"; // "sandbox" | "production"
let _squareConfigLoaded = false;

async function loadSquareConfig() {
  if (_squareConfigLoaded) return;
  try {
    const [appId, locationId, env] = await Promise.all([
      api.settings.get("square_app_id"),
      api.settings.get("square_location_id"),
      api.settings.get("square_env"),
    ]);
    if (appId) _squareAppId = appId;
    if (locationId) _squareLocationId = locationId;
    if (env === "production" || env === "sandbox") _squareEnv = env;
  } catch {}
  _squareConfigLoaded = true;
}

function SquareCheckoutButton({ amount, description, onSuccess, disabled }) {
  const [sqReady, setSqReady] = useState(false);
  const [sqError, setSqError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [paying, setPaying] = useState(false);
  const cardRef = useRef(null);
  const cardInstance = useRef(null);
  const paymentsRef = useRef(null);

  // Load config from Supabase on mount
  useEffect(() => {
    loadSquareConfig().then(() => {
      setIsLive(_squareEnv === "production");
      setConfigLoaded(true);
    });
  }, []);

  // Load Square Web Payments SDK and mount card field
  useEffect(() => {
    if (!configLoaded || !isLive || !_squareAppId || !_squareLocationId) return;
    let cancelled = false;

    const initSquare = async () => {
      try {
        // Load SDK if not already present
        if (!window.Square) {
          await new Promise((resolve, reject) => {
            const old = document.getElementById("square-sdk");
            if (old) old.remove();
            const s = document.createElement("script");
            s.id = "square-sdk";
            s.src = "https://web.squarecdn.com/v1/square.js";
            s.onload = resolve;
            s.onerror = () => reject(new Error("Square SDK failed to load."));
            document.head.appendChild(s);
          });
        }
        if (cancelled) return;
        const payments = window.Square.payments(_squareAppId, _squareLocationId);
        paymentsRef.current = payments;
        const card = await payments.card();
        if (cancelled) return;
        cardInstance.current = card;
        if (cardRef.current) await card.attach(cardRef.current);
        if (!cancelled) setSqReady(true);
      } catch (e) {
        if (!cancelled) setSqError(e.message || "Square failed to initialise.");
      }
    };

    initSquare();
    return () => {
      cancelled = true;
      if (cardInstance.current) { try { cardInstance.current.destroy(); } catch {} }
    };
  }, [configLoaded, isLive]);

  const handlePay = async () => {
    if (!cardInstance.current || !paymentsRef.current) return;
    setPaying(true); setSqError(null);
    try {
      // 1. Tokenise the card
      const result = await cardInstance.current.tokenize();
      if (result.status !== "OK") {
        setSqError(result.errors?.map(e => e.message).join(", ") || "Card tokenisation failed.");
        setPaying(false); return;
      }
      const sourceId = result.token;

      // 2. Create payment via Square Payments API proxy (Supabase Edge Function)
      const amountPence = Math.round(Number(amount) * 100);
      const res = await fetch("/api/square-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, amount: amountPence, currency: "GBP", note: description }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Payment failed.");
      onSuccess({ id: data.paymentId, status: "COMPLETED" });
    } catch (e) {
      setSqError(e.message || "Payment failed. Please try again.");
    } finally { setPaying(false); }
  };

  if (!configLoaded) {
    return <div style={{ color: "var(--muted)", fontSize: 12, padding: 8, marginTop: 12 }}>Loading payment options...</div>;
  }

  if (!isLive) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "#2d7a2d", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", letterSpacing: ".15em", fontFamily: "'Barlow Condensed',sans-serif", flexShrink: 0 }}>TEST MODE</span>
          <span style={{ fontSize: 11, color: "#5aab5a", fontFamily: "'Share Tech Mono',monospace" }}>Mock payments — no real money taken. Set Square to Production in Admin → Settings.</span>
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
      {sqError && <div className="alert alert-red" style={{ marginBottom: 8 }}>{sqError}</div>}
      <div style={{ background: "#0a0f05", border: "1px solid #2a3a10", padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: ".15em", color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace", marginBottom: 10, textTransform: "uppercase" }}>Card Details</div>
        <div ref={cardRef} style={{ minHeight: 48 }} />
      </div>
      <div style={{ background: "#111", border: "1px solid #1a1a1a", padding: "10px 14px", marginBottom: 10, fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
        <span>{description}</span>
        <span style={{ color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16 }}>£{Number(amount).toFixed(2)}</span>
      </div>
      {!sqReady && !sqError && <div style={{ color: "var(--muted)", fontSize: 12, padding: 8 }}>Loading card form…</div>}
      {sqReady && (
        <button className="btn btn-primary" style={{ width: "100%", padding: "13px", fontSize: 14, letterSpacing: ".15em", opacity: (disabled || paying) ? .6 : 1 }}
          disabled={disabled || paying} onClick={handlePay}>
          {paying ? "⏳ Processing…" : `PAY · £${Number(amount).toFixed(2)}`}
        </button>
      )}
    </div>
  );
}


// ── Shopify Checkout Button ────────────────────────────────────
// Builds a Shopify Storefront API checkout and redirects the player.
// Accepts multiple line items so walk-on + rental can be checked out together.
// After payment, Shopify fires the orders/paid webhook → Supabase Edge Function
// → booking record created in DB automatically.
// Shopify stubs — kept for import compatibility, not used
async function loadShopifyConfig() { return { domain: null }; }
loadShopifyConfig._cache = null;
function ShopifyCheckoutButton() { return null; }

// ── GMT helpers ───────────────────────────────────────────────
const gmtNow = () => new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false });
const gmtDate = (d) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false });
const gmtShort = (d) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" });
const fmtDate = (d) => { if (!d) return ""; const [y,m,day] = String(d).slice(0,10).split("-"); return `${day}/${m}/${y}`; };
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
                 socialFacebook, socialInstagram, socialWhatsapp, contactAddress, contactPhone, contactEmail,
                 contactDepartmentsRaw, shopClosed] = await Promise.all([
            safe("events",  api.events.getAll()),
            safe("shop",    api.shop.getAll()),
            safe("postage", api.postage.getAll()),
            safe("gallery", api.gallery.getAll()),
            safe("qa",      api.qa.getAll()),
            safe("staff",   api.staff.getAll()),
            api.settings.get("home_message").catch(() => ""),
            api.settings.get("social_facebook").catch(() => ""),
            api.settings.get("social_instagram").catch(() => ""),
            api.settings.get("social_whatsapp").catch(() => ""),
            api.settings.get("contact_address").catch(() => ""),
            api.settings.get("contact_phone").catch(() => ""),
            api.settings.get("contact_email").catch(() => ""),
            api.settings.get("contact_departments").catch(() => ""),
            api.settings.get("shop_closed").catch(() => "false"),
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
            // Filter out "Failed to fetch" — these are caused by the browser aborting
            // in-flight requests during page navigation (e.g. Shopify redirect) and are harmless.
            const realErrors = Object.fromEntries(
              Object.entries(errors).filter(([, v]) => !String(v).includes("Failed to fetch"))
            );
            if (Object.keys(realErrors).length > 0) {
              const errSummary = Object.entries(realErrors).map(([k,v]) => `${k}: ${v}`).join(" | ");
              console.error("loadAll partial errors:", errSummary, realErrors);
              setLoadError(Object.values(realErrors)[0]);
            }
          }

          setData(prev => ({
            ...(prev || emptyData),
            events: evList,
            shop: shopList,
            postageOptions: postageList,
            albums: albumList,
            qa: qaList,
            staff: staffList,
            shopClosed: shopClosed === "true",
            homeMsg: (() => { try { const p = JSON.parse(homeMsg); return Array.isArray(p) ? p : (homeMsg ? [{ text: homeMsg, color: "#c8ff00", bg: "#0a0f06", icon: "⚡" }] : []); } catch { return homeMsg ? [{ text: homeMsg, color: "#c8ff00", bg: "#0a0f06", icon: "⚡" }] : []; } })(),
            socialFacebook,
            socialInstagram,
            socialWhatsapp,
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
              const thisYear = now.getFullYear();
              profiles.forEach(u => {
                if (u.vipStatus === "active" && u.vipExpiresAt && new Date(u.vipExpiresAt) < now) {
                  supabase.from('profiles').update({ vip_status: "expired" }).eq('id', u.id).catch(() => {});
                  u.vipStatus = "expired";
                }

                // Birthday free game day: VIP members get 1 free game day in a 14-day window around their birthday
                // Uses waiver DOB only — cannot be gamed by editing profile
                // Guard: only proceeds if birthdayCreditYear !== thisYear (DB update is the true lock)
                const waiverDob = u.waiverData?.dob;
                if (u.vipStatus === "active" && waiverDob && u.birthdayCreditYear !== thisYear) {
                  // Parse DOB components explicitly to avoid UTC vs local midnight mismatch
                  const [dobYear, dobMonth, dobDay] = waiverDob.split("-").map(Number);
                  const bdThisYear = new Date(thisYear, dobMonth - 1, dobDay); // local midnight
                  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const diffDays = Math.round((bdThisYear - nowMidnight) / 86400000);
                  if (diffDays >= -7 && diffDays <= 7) {
                    // Use atomic increment via RPC to prevent race condition double-award
                    // Only updates if birthday_credit_year IS NULL or != thisYear (DB-enforced)
                    const grantAmount = 25;
                    supabase.rpc("award_birthday_credit", {
                      p_user_id: u.id,
                      p_amount: grantAmount,
                      p_year: thisYear,
                    }).then(({ error }) => {
                      if (!error) {
                        u.credits = (u.credits || 0) + grantAmount;
                        u.birthdayCreditYear = thisYear;
                      }
                    }).catch(() => {});
                  }
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

  // save() merges a patch into local state.
  // All actual DB writes happen via specific api.* calls in each admin component;
  // this function is only used to sync local state after those writes complete.
  // The only special case is patch.users, which triggers a full profile re-fetch.
  const save = useCallback(async (patch) => {
    // Optimistic local update
    setData(prev => ({ ...prev, ...patch }));

    if (patch.users !== undefined) {
      // Re-fetch full profiles to ensure local state is consistent with DB
      const allProfiles = await api.profiles.getAll();
      setData(prev => ({ ...prev, users: allProfiles.map(normaliseProfile) }));
    }
  }, []);

  const updateUser = useCallback(async (id, patch) => {
    // Convert camelCase patch to snake_case for Supabase
    const snakePatch = {};
    const map = {
      name: "name", email: "email", phone: "phone", address: "address",
      callsign: "callsign", // NOTE: "role" intentionally excluded — role changes must go via admin Edge Function
      gamesAttended: "games_attended", waiverSigned: "waiver_signed",
      waiverYear: "waiver_year", waiverData: "waiver_data", extraWaivers: "extra_waivers",
      waiverPending: "waiver_pending", vipStatus: "vip_status",
      vipApplied: "vip_applied", vipExpiresAt: "vip_expires_at", ukara: "ukara", credits: "credits",
      leaderboardOptOut: "leaderboard_opt_out", profilePic: "profile_pic",
      deleteRequest: "delete_request", permissions: "permissions",
      publicProfile: "public_profile", bio: "bio", customRank: "custom_rank", designation: "designation",
      birthDate: "birth_date", birthdayCreditYear: "birthday_credit_year",
      cardStatus: "card_status", cardReason: "card_reason", cardIssuedAt: "card_issued_at",
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
.pub-nav-inner{max-width:1280px;margin:0 auto;padding:0 16px;height:var(--nav-h);display:flex;align-items:center;gap:0;position:relative;overflow:visible;}
.pub-nav-logo{display:flex;align-items:center;gap:12px;cursor:pointer;margin-right:32px;flex-shrink:0;min-width:0;}
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
.site-banner{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;font-family:'Share Tech Mono',monospace;font-size:13px;font-weight:400;letter-spacing:.04em;line-height:1.7;border:1px solid;position:relative;}
.site-banner-icon{font-size:15px;flex-shrink:0;margin-top:1px;}
.site-banner-text{flex:1;}

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
// ── Parcel tracking status ───────────────────────────────────
const TRACKING_CACHE_KEY    = (tn) => `tracking_status_${tn}`;
const TRACKING_TTL_MS       = 8 * 60 * 60 * 1000; // 8 hours  — final statuses (Delivered)
const TRACKING_TTL_SHORT_MS = 30 * 60 * 1000;      // 30 mins  — in-progress statuses

// TrackingMore status codes → human labels
// https://www.trackingmore.com/tracking-status.html
const TM_STATUS_MAP = {
  'notfound':      'Not Found',
  'transit':       'In Transit',
  'pickup':        'Out for Delivery',
  'undelivered':   'Undelivered',
  'delivered':     'Delivered',
  'expired':       'Expired',
  'pending':       'Pending',
  'inforeceived':  'Info Received',
  'availableforpickup': 'Pick Up',
};

// TrackingMore courier slugs for UK carriers
const TM_CARRIER_MAP = {
  'Royal Mail':  'royal-mail',
  'UPS':         'ups',
  'FedEx':       'fedex',
  'DPD':         'dpd',
  'Evri':        'evri',
  'Parcelforce': 'parcelforce',
};

// Cache the TrackingMore key so we only hit site_settings once per session.
export const trackKeyCache = { value: undefined };
async function getTrackingKey() {
  if (trackKeyCache.value !== undefined) return trackKeyCache.value;
  try {
    const { supabase } = await import('./supabaseClient');
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'trackingmore_api_key')
      .single();
    trackKeyCache.value = data?.value || null;
  } catch { trackKeyCache.value = null; }
  return trackKeyCache.value;
}

async function fetchTrackingStatus(tn, courier) {
  if (!tn) return null;

  // Return from localStorage cache if still fresh
  try {
    const cached = localStorage.getItem(TRACKING_CACHE_KEY(tn));
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.status) {
        const ttl = ['Delivered','Expired'].includes(parsed.status) ? TRACKING_TTL_MS : TRACKING_TTL_SHORT_MS;
        if (Date.now() - parsed.checkedAt < ttl) return { ...parsed, fromCache: true };
      }
    }
  } catch {}

  const apiKey = await getTrackingKey();
  if (!apiKey) return null;

  const slug = TM_CARRIER_MAP[courier] || null;

  try {
    // TrackingMore v4 API — free tier, no CORS issues, works client-side
    const url = slug
      ? `https://api.trackingmore.com/v4/trackings/${slug}/${tn}`
      : `https://api.trackingmore.com/v4/trackings/detect/${tn}`;

    const res = await fetch(url, {
      headers: { 'Tracking-Api-Key': apiKey },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const d = json?.data;
    if (!d) return null;

    const statusRaw  = (d.delivery_status || d.tag || '').toLowerCase();
    const statusLabel = TM_STATUS_MAP[statusRaw] || d.delivery_status || 'In Transit';

    const events = (d.origin_info?.trackinfo || d.destination_info?.trackinfo || [])
      .map(e => ({ desc: e.tracking_detail, time: e.tracking_time, location: e.location || '' }))
      .filter(e => e.desc);

    const result = { status: statusLabel, events, checkedAt: Date.now(), fromCache: false };
    try {
      localStorage.setItem(TRACKING_CACHE_KEY(tn), JSON.stringify(result));
    } catch {}
    return result;
  } catch { return null; }
}


// ── Admin orders — STATUS cell showing ONLY live courier status ──
function AdminTrackStatusCell({ trackingNumber, courier }) {
  const [liveStatus, setLiveStatus] = React.useState(undefined); // undefined=loading, null=no data
  React.useEffect(() => {
    if (!trackingNumber) { setLiveStatus(null); return; }
    const { tn } = detectCourier(trackingNumber);
    fetchTrackingStatus(tn, courier).then(r => setLiveStatus(r?.status || null));
  }, [trackingNumber, courier]);

  const trackColors = {
    'Delivered':        '#4caf50',
    'In Transit':       '#c8ff00',
    'Out for Delivery': '#ff9800',
    'Pending':          '#4fc3f7',
    'Undelivered':      'var(--red)',
    'Expired':          'var(--muted)',
    'Pick Up':          '#ff9800',
  };

  if (liveStatus === undefined) return (
    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#3a4a20', letterSpacing:'.08em' }}>⏳ CHECKING…</span>
  );
  if (!liveStatus) return (
    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#3a4a20', letterSpacing:'.08em' }}>— NO TRACKING DATA</span>
  );

  const color = trackColors[liveStatus] || '#c8e878';
  const icon = liveStatus === 'Delivered' ? '✅' : liveStatus === 'Out for Delivery' ? '🚚' : '📦';
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, fontWeight:700,
        color, letterSpacing:'.1em', background:'rgba(0,0,0,.5)',
        border:`1px solid ${color}`, padding:'4px 10px', whiteSpace:'nowrap', display:'inline-block' }}>
        {icon} {liveStatus.toUpperCase()}
      </span>
      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:'#3a4a20', letterSpacing:'.05em' }}>LIVE TRACKING</span>
    </div>
  );
}

// ── Inline tracking badge (used inside TrackingBlock detail panels) ─
function AdminTrackBadge({ trackingNumber, courier }) {
  const [liveStatus, setLiveStatus] = React.useState(null);
  React.useEffect(() => {
    if (!trackingNumber) return;
    const { tn } = detectCourier(trackingNumber);
    fetchTrackingStatus(tn, courier).then(r => { if (r?.status) setLiveStatus(r.status); });
  }, [trackingNumber, courier]);
  if (!liveStatus) return null;
  const colors = { 'Delivered':'#4caf50', 'In Transit':'#c8ff00', 'Out for Delivery':'#ff9800', 'Pending':'#4fc3f7', 'Undelivered':'var(--red)', 'Expired':'var(--muted)', 'Pick Up':'#ff9800' };
  const color = colors[liveStatus] || '#c8e878';
  return (
    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, fontWeight:700,
      color, letterSpacing:'.06em', background:'rgba(0,0,0,.3)',
      border:`1px solid ${color}`, padding:'2px 6px', borderRadius:2, whiteSpace:'nowrap' }}>
      {liveStatus.toUpperCase()}
    </span>
  );
}

function detectCourier(rawTn) {
  const tn = (rawTn || "").trim().replace(/\s/g, "");
  if (!tn) return { tn, courier: null, trackUrl: null };
  let courier = null, trackUrl = null;
  if (/^[A-Za-z]{2}\d{9}[A-Za-z]{2}$/i.test(tn) || /^\d{13}$/.test(tn))
    { courier = "Royal Mail"; trackUrl = `https://www.royalmail.com/track-your-item#/tracking-results/${tn}`; }
  else if (/^1Z[A-Z0-9]{16}$/.test(tn))
    { courier = "UPS"; trackUrl = `https://www.ups.com/track?tracknum=${tn}`; }
  else if (/^\d{12}$/.test(tn) || /^\d{15}$/.test(tn) || /^\d{20}$/.test(tn))
    { courier = "FedEx"; trackUrl = `https://www.fedex.com/fedextrack/?trknbr=${tn}`; }
  else if (/^\d{10}$/.test(tn) || /^JD\d{18}$/.test(tn))
    { courier = "DPD"; trackUrl = `https://www.dpd.co.uk/apps/tracking/?ref=${tn}`; }
  else if (/^\d{14}$/.test(tn))
    { courier = "Evri"; trackUrl = `https://www.evri.com/track-a-parcel#/tracking/${tn}`; }
  else if (/^[A-Z]{3}\d{7,8}$/.test(tn) || /^\d{16}$/.test(tn))
    { courier = "Parcelforce"; trackUrl = `https://www.parcelforce.com/track-trace?trackNumber=${tn}`; }
  return { tn, courier, trackUrl };
}

function TrackingBlock({ trackingNumber, adminMode = false, onStatusResolved }) {
  const { tn, courier, trackUrl } = detectCourier(trackingNumber);
  const [trackStatus, setTrackStatus] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);

  useEffect(() => {
    if (!tn) return;
    // Auto-check on mount (uses cache if fresh)
    fetchTrackingStatus(tn, courier).then(result => {
      if (result) {
        setTrackStatus(result);
        if (onStatusResolved) onStatusResolved(result.status);
      }
    });
  }, [tn, courier]);

  const refreshStatus = async () => {
    if (!tn || trackLoading) return;
    // Force fresh fetch by clearing cache
    try { localStorage.removeItem(TRACKING_CACHE_KEY(tn)); } catch {}
    setTrackLoading(true);
    const result = await fetchTrackingStatus(tn, courier);
    if (result) {
      setTrackStatus(result);
      if (onStatusResolved) onStatusResolved(result.status);
    }
    setTrackLoading(false);
  };

  if (!tn) return null;
  // Fallback: search Royal Mail + Google for unknown formats
  const fallbackUrl = `https://www.royalmail.com/track-your-item#/tracking-results/${tn}`;
  const linkUrl = trackUrl || fallbackUrl;

  const statusColors = {
    "Delivered": "#4caf50", "In Transit": "#c8ff00", "Out for Delivery": "#ff9800",
    "Pending": "#4fc3f7", "Undelivered": "var(--red)", "Expired": "var(--muted)",
    "Pick Up": "#ff9800",
  };
  const statusColor = trackStatus ? (statusColors[trackStatus.status] || "#c8e878") : null;

  return (
    <div style={{ background: adminMode ? "rgba(200,255,0,.03)" : "rgba(200,255,0,.05)", border: "1px solid rgba(200,255,0,.25)", padding: adminMode ? "10px 14px" : "14px 18px", marginBottom: adminMode ? 0 : 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".15em", color: "#c8ff00", marginBottom: 3, textTransform: "uppercase" }}>
            📮 Tracking{courier ? ` — ${courier}` : ""}
          </div>
          {/* Tracking number is itself a clickable link */}
          <a href={linkUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: adminMode ? 13 : 16, fontWeight: 700, color: "#fff", letterSpacing: ".08em", textDecoration: "none", display: "inline-block", borderBottom: "1px dashed rgba(200,255,0,.4)", paddingBottom: 1, transition: "color .15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#c8ff00"; e.currentTarget.style.borderBottomStyle = "solid"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderBottomStyle = "dashed"; }}>
            {tn}
          </a>
        </div>
        <a href={linkUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(200,255,0,.1)", border: "1px solid rgba(200,255,0,.35)", color: "#c8ff00", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: ".18em", padding: adminMode ? "6px 12px" : "8px 16px", textDecoration: "none", whiteSpace: "nowrap" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(200,255,0,.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(200,255,0,.1)"}>
          ▸ TRACK{!courier ? " (Royal Mail)" : ""}
        </a>
      </div>
      {!courier && (
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
          Format not recognised — defaulting to Royal Mail. Try your courier's website if this doesn't work.
        </div>
      )}

      {/* Live tracking status */}
      {trackStatus && (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(200,255,0,.15)", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: ".1em", color: statusColor, textTransform: "uppercase" }}>
              {trackStatus.status === "Delivered" ? "✅" : trackStatus.status === "Out for Delivery" ? "🚚" : "📦"} {trackStatus.status}
            </span>
            <button onClick={refreshStatus} disabled={trackLoading}
              style={{ background: "none", border: "1px solid rgba(200,255,0,.2)", color: "#5a7a30", fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".12em", padding: "3px 8px", cursor: trackLoading ? "wait" : "pointer" }}>
              {trackLoading ? "⏳" : "↺ REFRESH"}
            </button>
          </div>
          {trackStatus.events?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {trackStatus.events.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 10, fontSize: 11 }}>
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0, marginTop: 1 }}>
                    {e.time ? new Date(e.time).toLocaleDateString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : ""}
                  </span>
                  <span style={{ color: i === 0 ? "#e8f0d8" : "var(--muted)" }}>{e.desc}{e.location ? ` — ${e.location}` : ""}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", marginTop: 6 }}>
            {trackStatus.fromCache ? "CACHED" : "LIVE"} · CHECKED {new Date(trackStatus.checkedAt).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" })} · AUTO-REFRESHES EVERY 8H
          </div>
        </div>
      )}
      {!trackStatus && !trackLoading && tn && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={refreshStatus}
            style={{ background: "none", border: "1px solid rgba(200,255,0,.2)", color: "#5a7a30", fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".12em", padding: "3px 10px", cursor: "pointer" }}>
            ↺ CHECK STATUS
          </button>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10" }}>FETCH LIVE TRACKING INFO</span>
        </div>
      )}
      {trackLoading && (
        <div style={{ marginTop: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#3a5010", letterSpacing: ".12em" }}>⏳ CHECKING TRACKING…</div>
      )}
    </div>
  );
}

function SkeletonCard({ height = 280, style = {} }) {
  return (
    <div style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", position:"relative", height, ...style }}>
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(90deg,transparent 0%,rgba(200,255,0,.03) 50%,transparent 100%)", backgroundSize:"200% 100%", animation:"skeletonShimmer 1.6s ease-in-out infinite" }} />
      <div style={{ padding:14 }}>
        <div style={{ background:"#1a2808", height:140, marginBottom:12, borderRadius:2 }} />
        <div style={{ background:"#1a2808", height:12, width:"70%", marginBottom:8, borderRadius:2 }} />
        <div style={{ background:"#1a2808", height:10, width:"45%", marginBottom:8, borderRadius:2 }} />
        <div style={{ background:"#1a2808", height:10, width:"55%", borderRadius:2 }} />
      </div>
    </div>
  );
}
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
    const duration = type === "red" ? 5000 : msg.length > 60 ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
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
    if (!form.email.includes("@") || !form.email.includes(".")) { showToast("Please enter a valid email address", "red"); return; }
    if (form.password.length < 8) { showToast("Password must be at least 8 characters", "red"); return; }
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) { showToast("Password must contain at least one letter and one number", "red"); return; }
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
                <br/><span style={{ fontSize: 11, opacity: .8 }}>🔒 Password: 8+ characters, must include at least one letter and one number.</span>
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
      addr1: existingData.addr1 || "", addr2: existingData.addr2 || "",
      city: existingData.city || "", county: existingData.county || "",
      postcode: existingData.postcode || "", country: existingData.country || "United Kingdom",
      emergencyName: existingData.emergencyName || "", emergencyPhone: existingData.emergencyPhone || "",
      medical: existingData.medical || "", isChild: existingData.isChild || false, guardian: existingData.guardian || "",
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
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    return { x: (src.clientX - canvasRect.left) * scaleX, y: (src.clientY - canvasRect.top) * scaleY };
  };
  const startDraw = (ev) => { ev.preventDefault(); const canvasEl = canvasRef.current; const ctx = canvasEl.getContext("2d"); const canvasPos = getPos(ev, canvasEl); ctx.beginPath(); ctx.moveTo(canvasPos.x, canvasPos.y); setDrawing(true); };
  const draw = (ev) => { if (!drawing) return; ev.preventDefault(); const canvasEl = canvasRef.current; const ctx = canvasEl.getContext("2d"); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#c8ff00"; const canvasPos = getPos(ev, canvasEl); ctx.lineTo(canvasPos.x, canvasPos.y); ctx.stroke(); };
  const endDraw = () => { if (!drawing) return; setDrawing(false); fw("sigData", canvasRef.current.toDataURL()); };
  const clearSig = () => { canvasRef.current.getContext("2d").clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); fw("sigData", ""); };

  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    for (let waiverIdx = 0; waiverIdx < waivers.length; waiverIdx++) {
      const waiverItem = waivers[waiverIdx];
      if (!waiverItem.name)  { showToast(`Waiver ${waiverIdx+1}: Full name required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.dob)   { showToast(`Waiver ${waiverIdx+1}: Date of birth required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.addr1 || !waiverItem.city || !waiverItem.postcode) { showToast(`Waiver ${waiverIdx+1}: Address required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.emergencyName || !waiverItem.emergencyPhone) { showToast(`Waiver ${waiverIdx+1}: Emergency contact required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.sigData) { showToast(`Waiver ${waiverIdx+1}: Signature required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.agreed) { showToast(`Waiver ${waiverIdx+1}: Please agree to the terms`, "red"); setActiveIdx(waiverIdx); return; }
      if (waiverItem.isChild && !waiverItem.guardian) { showToast(`Waiver ${waiverIdx+1}: Guardian name required`, "red"); setActiveIdx(waiverIdx); return; }
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
function PublicNav({ page, setPage, cu, setCu, setAuthModal, shopClosed }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const allLinks = [
    { id: "home", label: "Home", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id: "events", label: "Events", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M6 2v4M14 2v4M2 8h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    ...(!shopClosed ? [{ id: "shop", label: "Shop", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M3 5h14l-1.5 9H4.5L3 5z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="17" r="1" fill="currentColor"/><circle cx="14" cy="17" r="1" fill="currentColor"/><path d="M1 2h3l1 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> }] : []),
    { id: "leaderboard", label: "Leaderboard", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="1" y="10" width="4" height="9" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="6" width="4" height="13" stroke="currentColor" strokeWidth="1.4"/><rect x="15" y="13" width="4" height="6" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id: "gallery", label: "Gallery", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4"/><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14l4-4 4 4 3-3 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    {
      id: "about", label: "About", icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4"/><path d="M10 9v6M10 7v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
      children: [
        { id: "about",   label: "About Us",       icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8v.5" strokeLinecap="round"/></svg> },
        { id: "qa",      label: "Q&A / Rules",    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
        { id: "staff",   label: "Staff",          icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
        { id: "contact", label: "Contact",        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
        { id: "terms",   label: "Terms & Privacy",icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
      ]
    },
  ];
  const links = allLinks;
  const aboutPages = ["about","qa","staff","contact","terms"];
  const go = (id) => {
    // Guard: admin page requires admin role — never navigate there otherwise
    if (id === "admin" && cu?.role !== "admin") return;
    setPage(id);
    setDrawerOpen(false);
  };

  const signOut = () => {
    // Do NOT await signOut — it can hang indefinitely due to noopLock in some browsers.
    // Fire-and-forget, wipe tokens manually, then reload immediately.
    supabase.auth.signOut().catch(() => {});
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
    window.location.href = window.location.pathname;
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
              l.children ? (
                <div key={l.id} className="pub-nav-link-wrap" ref={dropdownRef}>
                  <button className={`pub-nav-link ${aboutPages.includes(page) ? "active" : ""}`}
                    onClick={() => setDropdownOpen(v => !v)}>
                    {l.label} <span style={{ fontSize:9, opacity:.6, marginLeft:2 }}>{dropdownOpen ? "▴" : "▾"}</span>
                  </button>
                  {dropdownOpen && (
                    <div className="pub-nav-dropdown">
                      {l.children.map(c => (
                        <button key={c.id} className={`pub-nav-dropdown-item ${page === c.id ? "active" : ""}`}
                          onClick={() => { go(c.id); setDropdownOpen(false); }}>
                          {c.icon} {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button key={l.id} className={`pub-nav-link ${page === l.id ? "active" : ""}`} onClick={() => go(l.id)}>
                  {l.label}
                </button>
              )
            ))}
          </div>
          {/* Desktop actions */}
          <div className="pub-nav-actions">
            {cu ? (
              <>
                {cu.role === "admin" && (
                  <button className="btn btn-sm btn-gold" onClick={() => go("admin")}>⚙ Admin</button>
                )}
                {(cu.canMarshal && cu.role !== "admin") && (
                  <button className="btn btn-sm" style={{ background:"rgba(0,180,100,.15)", border:"1px solid rgba(0,180,100,.4)", color:"#00c864", display:"inline-flex", alignItems:"center", gap:6 }} onClick={() => go("marshal")}><svg width="12" height="12" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M7 5l1-2h4l1 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>Marshal</button>
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
            l.children ? (
              <div key={l.id}>
                <div style={{ padding:"10px 20px 4px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:9, fontWeight:800, letterSpacing:".25em", color:"#3a4a20", textTransform:"uppercase", display:"flex", alignItems:"center", gap:6 }}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#3a4a20" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8v.5" strokeLinecap="round"/></svg> ABOUT</div>
                {l.children.map(c => (
                  <button key={c.id} className={`pub-nav-drawer-link ${page === c.id ? "active" : ""}`} onClick={() => go(c.id)} style={{ paddingLeft:32 }}>
                    <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#3a5010", width:20, display:"inline-block" }}>{c.icon}</span> {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <button key={l.id} className={`pub-nav-drawer-link ${page === l.id ? "active" : ""}`} onClick={() => go(l.id)}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}>{l.icon}</span> {l.label}
              </button>
            )
          ))}
          <hr className="pub-nav-drawer-divider" />
          {cu ? (
            <>
              {cu.role === "admin" && (
                <button className="pub-nav-drawer-link" onClick={() => go("admin")}>
                  <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Admin Panel
                </button>
              )}
              {(cu.canMarshal && cu.role !== "admin") && (
                <button className="pub-nav-drawer-link" style={{ color: "#00c864" }} onClick={() => go("marshal")}>
                  <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M7 5l1-2h4l1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Marshal Check-In
                </button>
              )}
              <button className="pub-nav-drawer-link" onClick={() => go("profile")}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> {cu.name}
              </button>
              <button className="pub-nav-drawer-link" style={{ color: "var(--red)" }} onClick={signOut}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13 3h4v14h-4M9 14l4-4-4-4M13 10H4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span> Sign Out
              </button>
            </>
          ) : (
            <>
              <button className="pub-nav-drawer-link" onClick={() => { setAuthModal("login"); setDrawerOpen(false); }}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="4" y="8" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M7 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Login
              </button>
              <button className="pub-nav-drawer-link" onClick={() => { setAuthModal("register"); setDrawerOpen(false); }}>
                <span style={{ display:"flex", alignItems:"center", width:20 }}><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M14 14l4 4M2 18c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M15 7v4M17 9h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></span> Register
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom nav (mobile only) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {[
            { id: "home", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.4"/></svg>, label: "Home" },
            { id: "events", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M6 2v4M14 2v4M2 8h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, label: "Events" },
            ...(!shopClosed ? [{ id: "shop", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14l-1.5 9H4.5L3 5z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="17" r="1" fill="currentColor"/><circle cx="14" cy="17" r="1" fill="currentColor"/><path d="M1 2h3l1 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, label: "Shop" }] : []),
            { id: "leaderboard", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="1" y="10" width="4" height="9" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="6" width="4" height="13" stroke="currentColor" strokeWidth="1.4"/><rect x="15" y="13" width="4" height="6" stroke="currentColor" strokeWidth="1.4"/></svg>, label: "Ranks" },
            { id: "profile", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>, label: "Profile" },
          ].map(b => (
            <button key={b.id} className={`bottom-nav-btn ${page === b.id ? "active" : ""}`} onClick={() => go(b.id)}>
              <span className="bottom-nav-icon" style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>{b.icon}</span>
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
  const totalBookings = data.events.flatMap(e => e.bookings).reduce((s, b) => s + (b.qty || 1), 0);

  return (
    <div>
      {Array.isArray(data.homeMsg) && data.homeMsg.length > 0 && (
        <div className="site-banners">
          {data.homeMsg.map((msg, i) => (
            <div key={i} className="site-banner" style={{
              background: msg.bg || "#0a0f06",
              color: msg.color || "#c8ff00",
              borderColor: msg.color || "#c8ff00",
              borderLeftWidth: 3,
              boxShadow: `inset 0 0 0 1px ${(msg.color || "#c8ff00")}22`,
            }}>
              {msg.icon && <span className="site-banner-icon">{msg.icon}</span>}
              <span className="site-banner-text">{msg.text}</span>
            </div>
          ))}
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
                    🗓 {fmtDate(nextEvent.date)} · {nextEvent.time} HRS GMT
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
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4,1fr)", gap:0, maxWidth:1200, margin:"0 auto" }}>
          {[
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 2L4 7v9c0 7 5.4 13.5 12 15 6.6-1.5 12-8 12-15V7L16 2z" stroke="#c8ff00" strokeWidth="1.5" fill="none"/><path d="M11 16l3 3 7-7" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round"/></svg>, title:"SAFETY FIRST", desc:"Full safety briefings, quality equipment, and experienced marshals on every game day." },
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="12" cy="10" r="4" stroke="#c8ff00" strokeWidth="1.5"/><circle cx="22" cy="10" r="4" stroke="#c8ff00" strokeWidth="1.5"/><path d="M4 26c0-4.4 3.6-8 8-8h8c4.4 0 8 3.6 8 8" stroke="#c8ff00" strokeWidth="1.5" strokeLinecap="round"/></svg>, title:"ALL SKILL LEVELS", desc:"Whether you're a beginner or veteran, we have game modes for everyone." },
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><polygon points="16,2 19.5,12 30,12 21.5,18.5 24.5,28.5 16,22 7.5,28.5 10.5,18.5 2,12 12.5,12" stroke="#c8ff00" strokeWidth="1.5" fill="none"/></svg>, title:"VIP BENEFITS", desc:"10% off all bookings and shop items. Free game day on your birthday. Exclusive VIP-only events and UKARA registration support." },
            { svg: <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="#c8ff00" strokeWidth="1.5"/><circle cx="16" cy="16" r="6" stroke="#c8ff00" strokeWidth="1.5"/><circle cx="16" cy="16" r="2" fill="#c8ff00"/><line x1="16" y1="2" x2="16" y2="6" stroke="#c8ff00" strokeWidth="1.5"/><line x1="16" y1="26" x2="16" y2="30" stroke="#c8ff00" strokeWidth="1.5"/><line x1="2" y1="16" x2="6" y2="16" stroke="#c8ff00" strokeWidth="1.5"/><line x1="26" y1="16" x2="30" y2="16" stroke="#c8ff00" strokeWidth="1.5"/></svg>, title:"RENTAL GEAR", desc:"Full kit hire available — gun, BBs, and face protection. No prior kit required to play." },
          ].map((feat, i) => (
            <div key={feat.title} className="feature-card" style={{ borderRadius:0, border:"none", borderRight: !isMobile && i < 3 ? "1px solid #2a2a2a" : "none", borderBottom: isMobile && i < 3 ? "1px solid #2a2a2a" : "none", padding:"32px 28px" }}>
              <div style={{ marginBottom:14 }}>{feat.svg}</div>
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
                        : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1400", position:"relative", overflow:"hidden" }}>
                            <svg width="80" height="80" viewBox="0 0 80 80" opacity="0.12" xmlns="http://www.w3.org/2000/svg"><ellipse cx="15" cy="12" rx="13" ry="9" fill="#c8ff00"/><ellipse cx="52" cy="28" rx="18" ry="11" fill="#c8ff00"/><ellipse cx="35" cy="52" rx="15" ry="10" fill="#c8ff00"/><ellipse cx="68" cy="62" rx="10" ry="8" fill="#c8ff00"/><ellipse cx="10" cy="60" rx="9" ry="7" fill="#c8ff00"/></svg>
                            <div style={{ position:"absolute", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".3em", color:"rgba(200,255,0,.2)", textTransform:"uppercase" }}>SA</div>
                          </div>
                      }
                      <div style={{ position:"absolute", top:12, left:12, display:"flex", flexDirection:"column", gap:4 }}>
                        <span style={{ background:"var(--accent)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>SKIRMISH</span>
                        {ev.vipOnly && <span style={{ background:"var(--gold)", color:"#000", fontSize:10, fontWeight:800, padding:"3px 10px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em", textTransform:"uppercase" }}>⭐ VIP ONLY</span>}
                      </div>
                    </div>
                    <div className="event-card-body">
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".06em", textTransform:"uppercase", marginBottom:10, color:"#fff" }}>{ev.title}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:12 }}>
                        <div style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="1" stroke="#6b6b6b" strokeWidth="1.5"/><path d="M5 1v4M11 1v4M1 7h14" stroke="#6b6b6b" strokeWidth="1.5" strokeLinecap="round"/></svg>{fmtDate(ev.date)}</div>
                        <div style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1C5.2 1 3 3.2 3 6c0 3.8 5 9 5 9s5-5.2 5-9c0-2.8-2.2-5-5-5z" stroke="#6b6b6b" strokeWidth="1.5"/><circle cx="8" cy="6" r="1.5" fill="#6b6b6b"/></svg>{ev.location}</div>
                        <div style={{ fontSize:12, color:"var(--muted)", display:"flex", alignItems:"center", gap:6 }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="6" r="3" stroke="#6b6b6b" strokeWidth="1.5"/><circle cx="11" cy="6" r="3" stroke="#6b6b6b" strokeWidth="1.5"/><path d="M1 14c0-2.8 2.2-4 5-4h4c2.8 0 5 1.2 5 4" stroke="#6b6b6b" strokeWidth="1.5" strokeLinecap="round"/></svg>{spotsLeft} spots left</div>
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
      <div style={{ background:"linear-gradient(180deg,#0c1009 0%,#080d05 100%)", borderTop:"2px solid #2a3a10", borderBottom:"2px solid #2a3a10", padding:"52px 20px", position:"relative", overflow:"hidden" }}>
        {/* Scanlines */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.08) 3px,rgba(0,0,0,.08) 4px)", pointerEvents:"none" }} />
        {/* Corner brackets */}
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:24, height:24, zIndex:2,
            top:v==="top"?12:"auto", bottom:v==="bottom"?12:"auto",
            left:h==="left"?12:"auto", right:h==="right"?12:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:700, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".35em", color:"#3a5010", marginBottom:12, textTransform:"uppercase" }}>◈ — MEMBERSHIP — ◈</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(26px,5vw,44px)", letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:18 }}>
            BECOME A <span style={{ color:"#c8ff00", textShadow:"0 0 24px rgba(200,255,0,.3)" }}>VIP OPERATIVE</span>
          </div>
          <p style={{ fontSize:14, color:"#7a9a50", marginBottom:28, lineHeight:1.8, fontFamily:"'Share Tech Mono',monospace", letterSpacing:".03em" }}>
            After 3 game days, unlock VIP membership for just £30/year.<br/>10% off everything · Free birthday game day · Exclusive events · UKARA registration support.
          </p>
          <button style={{ background:"#c8ff00", color:"#000", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".2em", padding:"13px 40px", border:"none", cursor:"pointer", textTransform:"uppercase", transition:"background .15s" }}
            onMouseEnter={e => e.currentTarget.style.background="#d8ff33"}
            onMouseLeave={e => e.currentTarget.style.background="#c8ff00"}
            onClick={() => setPage("vip")}>▸ LEARN MORE</button>
        </div>
      </div>

      {/* PARTNER SHOP + TECH SERVICES — two column banner */}
      <div style={{ background:"#0a0d08", borderTop:"1px solid #1a2808", borderBottom:"1px solid #1a2808", padding:"36px 16px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,480px),1fr))", gap:1, background:"#1a2808" }}>

          {/* ── Column 1: Airsoft Armoury UK ── */}
          <div style={{ background:"#0a0d08", padding:"24px", display:"flex", flexDirection:"column", gap:16 }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, border:"2px solid rgba(200,255,0,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🤝</div>
              <div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010", textTransform:"uppercase", marginBottom:3 }}>OFFICIAL FIELD PARTNER</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(16px,4vw,20px)", letterSpacing:".1em", color:"#e8f0d8", textTransform:"uppercase", lineHeight:1 }}>
                  AIRSOFT <span style={{ color:"#c8ff00" }}>ARMOURY UK</span>
                </div>
              </div>
            </div>

            {/* Tagline */}
            <p style={{ fontSize:13, color:"#7a9a50", lineHeight:1.8, margin:0 }}>
              Your one-stop shop for quality airsoft gear — handpicked kit trusted by players at Swindon Airsoft. Order online and pick up on game day, no postage needed.
            </p>

            {/* Category chips */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {["AEGs & GBBs","Pistols & Sidearms","BBs & Ammo","Eye Pro & Helmets","Tactical Vests","Magazines","Accessories","Batteries & Chargers"].map(cat => (
                <span key={cat} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", color:"#5a8030", border:"1px solid #1e2e0a", padding:"3px 8px", textTransform:"uppercase" }}>
                  {cat}
                </span>
              ))}
            </div>

            {/* Key perks */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:6 }}>
              {[
                ["🚚","Click & Collect", "Order online, pick up at the field — no postage cost"],
                ["💸","Exclusive Discount", "Use code COLLECTION at checkout for your deal"],
                ["✅","Field-Tested Stock", "Kit recommended and used by our own players"],
                ["📦","Fast Dispatch",     "Orders placed before 2pm ship same day"],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{ background:"rgba(200,255,0,.03)", border:"1px solid #1a2808", padding:"10px 12px" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, color:"#c8ff00", letterSpacing:".06em", marginBottom:3 }}>{icon} {title}</div>
                  <div style={{ fontSize:11, color:"#4a6030", lineHeight:1.5 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Collection code callout */}
            <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.2)", padding:"12px 16px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
              <div style={{ flexShrink:0 }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010", marginBottom:4 }}>FIELD COLLECTION CODE</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(20px,5vw,26px)", color:"#c8ff00", letterSpacing:".15em" }}>COLLECTION</div>
              </div>
              <div style={{ fontSize:12, color:"#5a8030", lineHeight:1.6, flex:"1 1 140px" }}>
                Enter at checkout to flag your order for field collection. We'll bring it to game day — saving you postage and getting gear in your hands faster.
              </div>
            </div>

            {/* CTA */}
            <a
              href="https://www.airsoftarmoury.uk"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, background:"transparent", border:"2px solid #c8ff00", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".15em", padding:"12px 22px", textDecoration:"none", textTransform:"uppercase", transition:"background .15s, color .15s", alignSelf:"stretch" }}
              onMouseEnter={e => { e.currentTarget.style.background="#c8ff00"; e.currentTarget.style.color="#000"; }}
              onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#c8ff00"; }}
            >
              🛒 SHOP NOW — AIRSOFTARMOURY.UK
            </a>
          </div>

          {/* ── Column 2: Independent Tech Services ── */}
          <div style={{ background:"#0a0d08", padding:"24px", display:"flex", flexDirection:"column", gap:14, position:"relative" }}>
            {/* Top accent line */}
            <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,rgba(79,195,247,.4),transparent)"}}/> 
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

            {/* Services grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))", gap:"4px 12px" }}>
              {[
                "Repairs & full diagnostics","Spring / FPS / air-seal work",
                "Inner barrel & hop-up upgrades","Feeding & power issue fixes",
                "Gearbox rebuilds & re-shims","Mag repair (GBB/AEG)",
                "General service & regrease","Full strip & inspection report",
              ].map(s => (
                <div key={s} style={{ display:"flex", alignItems:"flex-start", gap:7, fontSize:12, color:"#7ab8c8", lineHeight:1.5, padding:"3px 0" }}>
                  <span style={{ color:"#4fc3f7", fontWeight:900, flexShrink:0, marginTop:1 }}>✓</span>
                  {s}
                </div>
              ))}
            </div>

            <p style={{ fontSize:12, color:"#4a7a8a", lineHeight:1.7, margin:0 }}>
              Whether your replica is shooting weak, misfeeding, or making odd noises — it gets a full strip and inspection. You'll be contacted straight away to discuss findings before any work begins.
            </p>

            {/* Rate + CTA */}
            <div style={{ background:"rgba(79,195,247,.05)", border:"1px solid rgba(79,195,247,.15)", padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                <div>
                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(18px,4vw,22px)", color:"#4fc3f7", letterSpacing:".04em" }}>£40</span>
                  <span style={{ fontSize:11, color:"#4a7a8a", marginLeft:6, letterSpacing:".1em" }}>/ HOUR + PARTS</span>
                </div>
                <a
                  href="https://wa.me/447877731973"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display:"inline-flex", alignItems:"center", gap:7, background:"rgba(37,211,102,.12)", border:"1px solid rgba(37,211,102,.35)", color:"#25d366", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".12em", padding:"9px 16px", textDecoration:"none", textTransform:"uppercase", transition:"background .15s", borderRadius:2 }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(37,211,102,.22)"}
                  onMouseLeave={e => e.currentTarget.style.background="rgba(37,211,102,.12)"}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                  WHATSAPP
                </a>
              </div>
              <p style={{ fontSize:11, color:"#336070", lineHeight:1.6, margin:0 }}>
                💡 Please discuss your repair <em>before</em> purchasing parts — shops often don't accept returns and online specs can be misleading.
              </p>
            </div>

            {/* Independent disclaimer */}
            <div style={{ fontSize:10, color:"#2a3a3a", letterSpacing:".05em", lineHeight:1.6, borderTop:"1px solid #0d1a1a", paddingTop:10 }}>
              ⚠ This technician operates independently and is not affiliated with, employed by, or acting on behalf of Swindon Airsoft. All work is arranged directly between the customer and the technician.
            </div>

          </div>

        </div>

        {/* Responsive: stack on mobile */}
        <style>{`
          @media(max-width:700px){
            .partner-grid{grid-template-columns:1fr !important;}
          }
        `}</style>
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
// Keys should be set in .env as VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
// The fallback values below work but are visible in source — move to .env for production
const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || "service_np4zvqs";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "template_d84acm9";
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || "jC6heZ9LvgHiaHTFq";
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
    subject:     `🎯 Booking Confirmed — ${ev.title.replace(/\//g, '-')}`,
    htmlContent,
  });
}


// ── Send Welcome/Registration Email ──────────────────────────
// ── Send Event Reminder Email ────────────────────────────────
async function sendEventReminderEmail({ ev, bookedUsers }) {
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const timeStr = ev.endTime ? `${ev.time}–${ev.endTime} GMT` : ev.time ? `${ev.time} GMT` : "TBC";
  const hoursUntil = Math.round((new Date(ev.date + "T" + (ev.time || "09:00")) - new Date()) / 3600000);
  const urgency = hoursUntil <= 24 ? "TOMORROW" : hoursUntil <= 48 ? "IN 48 HOURS" : `IN ${Math.round(hoursUntil/24)} DAYS`;

  let sent = 0, failed = 0;

  for (const user of bookedUsers) {
    if (!user.email) { failed++; continue; }
    const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:0;font-family:Arial,sans-serif;color:#e0e0e0;">
    <div style="height:3px;background:#c8ff00;"></div>
    <div style="background:#0d0d0d;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;padding:24px 32px;text-align:center;">
      <div style="font-size:10px;letter-spacing:.3em;color:#c8ff00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">⚠ MISSION REMINDER — ${urgency}</div>
      <div style="font-size:30px;font-weight:900;letter-spacing:.08em;color:#fff;line-height:1;">SWINDON <span style="color:#c8ff00;">AIRSOFT</span></div>
    </div>
    <div style="background:#0d1300;border:1px solid #1a2808;border-top:none;padding:28px 32px;">
      <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:8px;font-weight:700;">YOUR UPCOMING GAME</div>
      <div style="font-size:28px;font-weight:900;color:#e8f0d8;text-transform:uppercase;letter-spacing:.05em;line-height:1.1;margin-bottom:20px;">${ev.title}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">DATE</div>
            <div style="font-size:14px;font-weight:700;color:#c8ff00;">${dateStr}</div>
          </td>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-left:none;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">TIME</div>
            <div style="font-size:14px;font-weight:700;color:#4fc3f7;">${timeStr}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-top:none;vertical-align:top;" colspan="2">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">LOCATION</div>
            <div style="font-size:14px;font-weight:700;color:#ce93d8;">${ev.location || "Swindon Airsoft Field"}</div>
          </td>
        </tr>
      </table>
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:10px;font-weight:700;">PRE-GAME CHECKLIST</div>
        <table style="width:100%;border-collapse:collapse;">
          ${[
            ["Bring your QR code ticket (check your booking confirmation email)", "#c8ff00"],
            ["Arrive at least 15 minutes before start time for sign-in", "#8aaa60"],
            ["Approved full-seal eye protection is mandatory at all times", "#8aaa60"],
            ["Wear appropriate clothing for the weather and terrain", "#8aaa60"],
            ["All personal RIFs will be chronographed before play", "#8aaa60"],
          ].map(([item, col]) => `
          <tr>
            <td style="padding:5px 0;font-size:12px;color:${col};line-height:1.6;">▸ ${item}</td>
          </tr>`).join("")}
        </table>
      </div>
      ${user.bookingType === "rental" ? `
      <div style="background:#0a0f06;border:1px solid rgba(200,150,0,.3);padding:14px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#7a5010;text-transform:uppercase;margin-bottom:6px;font-weight:700;">🪖 YOUR RENTAL PACKAGE</div>
        <div style="font-size:12px;color:#8a7040;line-height:1.7;">Your rental kit will be prepared and waiting. Please collect from the marshal station on arrival. Do not modify or disassemble any equipment.</div>
      </div>` : ""}
      <div style="text-align:center;margin-top:8px;">
        <a href="https://swindonairsoft.co.uk/#profile/bookings" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:12px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:12px 32px;text-decoration:none;">VIEW MY BOOKING →</a>
      </div>
    </div>
    <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;padding:16px 32px;font-size:11px;color:#2a2a2a;text-align:center;">
      Need to cancel? Log in and visit Profile → Bookings. Cancellations within 48h receive game credits. · Swindon Airsoft
    </div>
    <div style="height:1px;background:#1a1a1a;"></div>
  </div>`;
    try {
      await sendEmail({ toEmail: user.email, toName: user.name || "Player", subject: `⚠ Reminder: ${ev.title} is ${urgency.toLowerCase()}`, htmlContent });
      sent++;
    } catch { failed++; }
  }
  return { sent, failed };
}

// ── Waitlist Slot Available Email ────────────────────────────
async function sendWaitlistNotifyEmail({ toEmail, toName, ev, ticketType }) {
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const typeLabel = ticketType === "walkOn" ? "Walk-On" : "Rental Package";
  const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;font-family:Arial,sans-serif;color:#e0e0e0;">
    <div style="height:3px;background:#c8ff00;"></div>
    <div style="background:#0d0d0d;padding:24px 32px;text-align:center;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
      <div style="font-size:10px;letter-spacing:.3em;color:#c8ff00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">🎯 SLOT AVAILABLE — ACT FAST</div>
      <div style="font-size:28px;font-weight:900;letter-spacing:.08em;color:#fff;line-height:1;">SWINDON <span style="color:#c8ff00;">AIRSOFT</span></div>
    </div>
    <div style="background:#0d1300;border:1px solid #1a2808;border-top:none;padding:28px 32px;">
      <p style="font-size:14px;color:#8aaa60;line-height:1.8;margin-bottom:20px;">Good news, ${toName}! A <strong style="color:#c8ff00;">${typeLabel}</strong> slot has just opened up for the event you were waitlisted for:</p>
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:22px;font-weight:900;color:#e8f0d8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">${ev.title}</div>
        <div style="font-size:13px;color:#8aaa60;">${dateStr}</div>
        <div style="font-size:13px;color:#4fc3f7;margin-top:4px;">${ev.time ? ev.time + " GMT" : ""}</div>
        <div style="font-size:13px;color:#ce93d8;margin-top:4px;">${ev.location || "Swindon Airsoft Field"}</div>
      </div>
      <div style="background:rgba(200,150,0,.1);border:1px solid rgba(200,150,0,.3);padding:14px 20px;margin-bottom:24px;">
        <div style="font-size:12px;color:var(--gold,#d4a017);font-weight:700;">⚠ Slots fill fast — book now before it's gone again.</div>
        <div style="font-size:11px;color:#8aaa60;margin-top:4px;">You will not be notified again if this slot fills up.</div>
      </div>
      <div style="text-align:center;">
        <a href="https://swindonairsoft.co.uk/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK NOW →</a>
      </div>
    </div>
    <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;padding:14px 32px;font-size:11px;color:#2a2a2a;text-align:center;">
      You received this because you joined the waitlist for this event. · Swindon Airsoft
    </div>
  </div>`;
  await sendEmail({ toEmail, toName, subject: `🎯 A slot just opened — ${ev.title}`, htmlContent });
}

async function sendCancellationEmail({ cu, eventTitle, eventDate, ticketType, refundAmount, isCredits, isRental }) {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" }) : "—";
  const refundLine = isCredits
    ? `£${refundAmount.toFixed(2)} has been added to your game credits and will automatically apply at your next checkout.`
    : `£${refundAmount.toFixed(2)} has been refunded to your original payment method. Please allow 3–5 working days.`;
  const rentalNote = isRental ? `<p style="margin:8px 0 0;font-size:12px;color:#888;">A 10% rental preparation fee has been applied to this cancellation.</p>` : "";
  const htmlContent = `
  <div style="background:#0a0a0a;font-family:'Barlow Condensed',Arial,sans-serif;padding:32px;max-width:560px;margin:0 auto;border:1px solid #1a1a1a;">
    <div style="border-bottom:2px solid #c8ff00;padding-bottom:16px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:6px;">SWINDON AIRSOFT</div>
      <div style="font-size:26px;font-weight:900;color:#e8f0d8;letter-spacing:.08em;text-transform:uppercase;">Booking Cancelled</div>
    </div>
    <p style="color:#8a9a70;font-size:14px;line-height:1.6;margin:0 0 20px;">Hi ${cu.name || "Operative"},</p>
    <p style="color:#8a9a70;font-size:14px;line-height:1.6;margin:0 0 24px;">Your booking has been successfully cancelled. Here's a summary:</p>
    <div style="background:#111;border:1px solid #1e2a10;padding:16px 20px;margin-bottom:20px;">
      ${[
        ["Event", eventTitle || "—"],
        ["Date", fmtDate(eventDate)],
        ["Ticket", ticketType === "rental" ? "Rental Package" : "Walk-On"],
        ["Refund", `£${refundAmount.toFixed(2)} ${isCredits ? "(game credits)" : "(to original payment)"}`],
      ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a2808;font-size:13px;"><span style="color:#3a5010;letter-spacing:.08em;text-transform:uppercase;">${k}</span><span style="color:#c8e878;font-weight:700;">${v}</span></div>`).join("")}
    </div>
    <p style="color:#8a9a70;font-size:13px;line-height:1.6;margin:0 0 8px;">${refundLine}</p>
    ${rentalNote}
    <div style="margin-top:28px;text-align:center;">
      <a href="https://swindonairsoft.co.uk/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK ANOTHER GAME →</a>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #1a1a1a;font-size:11px;color:#2a2a2a;text-align:center;">
      Questions? Contact us at swindonairsoft.co.uk · Swindon Airsoft
    </div>
  </div>`;
  await sendEmail({ toEmail: cu.email, toName: cu.name, subject: `Booking Cancelled — ${eventTitle}`, htmlContent });
}

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
      ${(ev.walkOnSlots || ev.rentalSlots) ? `<div style="font-size:11px;color:#3a5010;text-align:center;margin-bottom:20px;letter-spacing:.1em;">⚠ LIMITED TO ${(Number(ev.walkOnSlots || 0) + Number(ev.rentalSlots || 0))} PLAYERS — BOOK EARLY</div>` : ""}

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

// ── Admin notification: new booking ─────────────────────────
// Fired after a player successfully books. Sends to the site contact_email.
async function sendAdminBookingNotification({ adminEmail, cu, ev, bookings, total }) {
  if (!adminEmail) return;
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const rows = (bookings || []).map(b =>
    `<tr>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;">${b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;text-align:center;">${b.qty}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-weight:700;">£${Number(b.total).toFixed(2)}</td>
    </tr>`
  ).join("");
  const htmlContent = `
  <div style="background:#0a0a0a;padding:32px 16px;font-family:'Arial',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0d1300;border:1px solid #1a2808;border-radius:4px;overflow:hidden;">
      <div style="background:#0a0f06;padding:16px 24px;border-bottom:1px solid #1a2808;">
        <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">Swindon Airsoft · Admin Alert</div>
        <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.04em;">NEW BOOKING</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:30%;">Player</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${cu.name}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Email</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#4fc3f7;font-size:13px;">${cu.email}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Event</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${ev.title}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Date</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${dateStr}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Total Paid</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:15px;font-weight:900;">£${Number(total).toFixed(2)}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#0a0f06;"><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Ticket Type</th><th style="padding:7px 12px;text-align:center;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Qty</th><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Total</th></tr>
          ${rows}
        </table>
      </div>
      <div style="padding:12px 24px;border-top:1px solid #1a2808;text-align:center;font-size:10px;color:#2a3a10;letter-spacing:.15em;text-transform:uppercase;">Swindon Airsoft Admin · Auto-generated notification</div>
    </div>
  </div>`;
  await sendEmail({ toEmail: adminEmail, toName: "Swindon Airsoft Admin", subject: `📋 New Booking: ${cu.name} — ${ev.title} (£${Number(total).toFixed(2)})`, htmlContent });
}

// ── Admin notification: new shop order ──────────────────────
async function sendAdminOrderNotification({ adminEmail, cu, order, items }) {
  if (!adminEmail) return;
  const rows = (items || []).map(i =>
    `<tr>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;">${i.name}${i.variant ? ` <span style="color:#888;font-size:11px;">(${i.variant})</span>` : ""}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;text-align:center;">${i.qty}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-weight:700;">£${Number(i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join("");
  const htmlContent = `
  <div style="background:#0a0a0a;padding:32px 16px;font-family:'Arial',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0d1300;border:1px solid #1a2808;border-radius:4px;overflow:hidden;">
      <div style="background:#0a0f06;padding:16px 24px;border-bottom:1px solid #1a2808;">
        <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">Swindon Airsoft · Admin Alert</div>
        <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.04em;">NEW SHOP ORDER</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:30%;">Customer</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${cu?.name || order.customerName}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Email</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#4fc3f7;font-size:13px;">${cu?.email || order.customerEmail}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Ship To</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.customerAddress || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Postage</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.postageName || "N/A"} · £${Number(order.postage || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Total</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:15px;font-weight:900;">£${Number(order.total).toFixed(2)}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#0a0f06;"><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Item</th><th style="padding:7px 12px;text-align:center;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Qty</th><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Total</th></tr>
          ${rows}
        </table>
      </div>
      <div style="padding:12px 24px;border-top:1px solid #1a2808;text-align:center;font-size:10px;color:#2a3a10;letter-spacing:.15em;text-transform:uppercase;">Swindon Airsoft Admin · Auto-generated notification</div>
    </div>
  </div>`;
  await sendEmail({ toEmail: adminEmail, toName: "Swindon Airsoft Admin", subject: `🛒 New Order: ${cu?.name || order.customerName} — £${Number(order.total).toFixed(2)}`, htmlContent });
}

// ── Admin: Return Request Notification ───────────────────────
async function sendAdminReturnNotification({ adminEmail, order }) {
  if (!adminEmail) return;
  const htmlContent = `
  <div style="background:#0a0a0a;padding:32px 16px;font-family:'Arial',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0d1300;border:1px solid #1a2808;border-radius:4px;overflow:hidden;">
      <div style="background:#0a0f06;padding:16px 24px;border-bottom:1px solid #1a2808;">
        <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">Swindon Airsoft · Admin Alert</div>
        <div style="font-size:22px;font-weight:900;color:#e0a000;letter-spacing:.04em;">&#8617; RETURN REQUESTED</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:30%;">Customer</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.customer_name || order.customerName || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Email</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#4fc3f7;font-size:13px;">${order.customer_email || order.customerEmail || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Order #</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-family:monospace;">${(order.id || "").slice(0,8).toUpperCase()}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Order Total</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-weight:900;">&#163;${Number(order.total || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Return Ref</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#e0a000;font-size:13px;font-family:monospace;font-weight:700;">${order.return_number || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Reason</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.return_reason || "—"}</td></tr>
          ${order.return_notes ? `<tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Notes</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;">${order.return_notes}</td></tr>` : ""}
        </table>
        <div style="background:#1a1500;border:1px solid #332800;border-radius:4px;padding:12px 16px;font-size:12px;color:#8a7040;line-height:1.6;">
          Log in to the admin panel &#8594; Shop &#8594; Orders to approve or reject this return request.
        </div>
      </div>
      <div style="padding:12px 24px;border-top:1px solid #1a2808;text-align:center;font-size:10px;color:#2a3a10;letter-spacing:.15em;text-transform:uppercase;">Swindon Airsoft Admin · Auto-generated notification</div>
    </div>
  </div>`;
  await sendEmail({ toEmail: adminEmail, toName: "Swindon Airsoft Admin", subject: `Return Request: ${order.customer_name || order.customerName} — Order #${(order.id||"").slice(0,8).toUpperCase()}`, htmlContent });
}

// ── Customer: Return Decision Email ──────────────────────────
async function sendReturnDecisionEmail({ toEmail, toName, order, approved, rejectionReason }) {
  const orderRef = (order.id || "").slice(0, 8).toUpperCase();
  const htmlContent = approved ? `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
      <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Return Approved</div>
    </div>
    <div style="background:#0d1f0a;border:1px solid #1a3a10;border-radius:8px;padding:20px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">&#10003;</div>
      <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.08em;text-transform:uppercase;">Your Return Has Been Approved</div>
      <div style="font-size:13px;color:#8aaa60;margin-top:8px;">Order #${orderRef}</div>
    </div>
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#c8ff00;font-weight:700;text-transform:uppercase;margin-bottom:12px;">NEXT STEPS</div>
      <ol style="color:#ccc;font-size:13px;line-height:2;padding-left:20px;margin:0;">
        <li>Package your item securely in its <strong style="color:#fff;">original packaging where possible</strong>.</li>
        <li>Items must be in <strong style="color:#fff;">unused, unopened condition</strong>. Deductions may apply for items that have been opened or used.</li>
        <li>Write your return reference <strong style="color:#c8ff00;font-family:monospace;">${order.return_number || ""}</strong> clearly on the outside of the package.</li>
        <li>Post the item back to us — <strong style="color:#fff;">return postage is your responsibility</strong>.</li>
        <li>Log in and enter your return tracking number on the order page so we can monitor your shipment.</li>
      </ol>
    </div>
    <div style="background:#111;border:1px solid #333;border-left:3px solid #c8ff00;border-radius:4px;padding:14px 20px;margin-bottom:20px;font-size:13px;color:#aaa;line-height:1.6;">
      Once we receive and inspect your return, a refund will be processed to your original payment method within 5–10 business days. Deductions may be made for items that are not in original unused condition or are missing packaging.
    </div>
    <div style="text-align:center;font-size:11px;color:#444;padding-top:16px;border-top:1px solid #1a1a1a;">Swindon Airsoft — reply to this email or use the Contact page if you have questions.</div>
  </div>` : `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
      <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Return Update</div>
    </div>
    <div style="background:#1a0808;border:1px solid #3a1010;border-radius:8px;padding:20px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">&#10007;</div>
      <div style="font-size:22px;font-weight:900;color:#ff6b6b;letter-spacing:.08em;text-transform:uppercase;">Return Request Not Approved</div>
      <div style="font-size:13px;color:#8a6060;margin-top:8px;">Order #${orderRef}</div>
    </div>
    ${rejectionReason ? `<div style="background:#111;border:1px solid #333;border-left:3px solid #ff6b6b;border-radius:4px;padding:14px 20px;margin-bottom:20px;">
      <div style="font-size:10px;letter-spacing:.15em;color:#ff6b6b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Reason</div>
      <div style="font-size:13px;color:#ddd;line-height:1.6;">${rejectionReason}</div>
    </div>` : ""}
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px 20px;margin-bottom:20px;font-size:13px;color:#aaa;line-height:1.7;">
      If you believe this decision is incorrect or would like to discuss further, please reply to this email or contact us through the website — we are happy to help.
    </div>
    <div style="text-align:center;font-size:11px;color:#444;padding-top:16px;border-top:1px solid #1a1a1a;">Swindon Airsoft — reply to this email or use the Contact page if you have questions.</div>
  </div>`;
  await sendEmail({
    toEmail,
    toName: toName || "Customer",
    subject: approved
      ? `Return Approved — Order #${orderRef}`
      : `Return Request Update — Order #${orderRef}`,
    htmlContent,
  });
}



// ─────────────────────────────────────────────────────────────
// Rank & Designation insignia — shared by App.jsx + AdminPanel
// ─────────────────────────────────────────────────────────────
function RankInsignia({ rank, size = 56 }) {
  const s = size; const c = "#c8ff00"; const dim = "#1e3008"; const gold = "#c8a000"; const cx = s / 2; const cy = s / 2;

  const Chevron = ({ y }) => (
    <polyline points={`${s*.12},${y + s*.14} ${cx},${y} ${s*.88},${y + s*.14}`}
      fill="none" stroke={c} strokeWidth={s * .04} strokeLinecap="round" strokeLinejoin="round"/>
  );
  const Pip = ({ px, py, filled = false }) => (
    <g>
      <polygon points={`${px},${py - s*.13} ${px + s*.12},${py - s*.04} ${px + s*.08},${py + s*.1} ${px - s*.08},${py + s*.1} ${px - s*.12},${py - s*.04}`}
        fill={filled ? gold : "none"} stroke={gold} strokeWidth={s * .03}/>
    </g>
  );
  const Crown = ({ px, py }) => {
    const w = s * .32; const h = s * .2;
    return (
      <g fill="none" stroke={gold} strokeWidth={s * .035} strokeLinejoin="round">
        <polyline points={`${px - w},${py + h*.4} ${px - w},${py - h*.3} ${px - w*.5},${py + h*.05} ${px},${py - h*.6} ${px + w*.5},${py + h*.05} ${px + w},${py - h*.3} ${px + w},${py + h*.4}`}/>
        <line x1={px - w} y1={py + h*.4} x2={px + w} y2={py + h*.4}/>
        <circle cx={px} cy={py - h*.6} r={s*.04} fill={gold}/>
        <circle cx={px - w*.5} cy={py - h*.05} r={s*.03} fill={gold}/>
        <circle cx={px + w*.5} cy={py - h*.05} r={s*.03} fill={gold}/>
      </g>
    );
  };
  const Beret = ({ col = c }) => {
    const bw = s * .7; const bh = s * .32; const bx = cx - bw/2; const by = cy - bh * .3;
    return (
      <g>
        <ellipse cx={cx} cy={by} rx={bw/2} ry={bh} fill="rgba(200,255,0,.06)" stroke={col} strokeWidth={s*.03}/>
        <rect x={bx} y={by + bh*.55} width={bw} height={s*.09} fill="rgba(200,255,0,.1)" stroke={col} strokeWidth={s*.025} rx={s*.01}/>
        <polygon points={`${cx - s*.04},${by - bh*.1} ${cx},${by - bh*.38} ${cx + s*.04},${by - bh*.1} ${cx},${by + bh*.18}`} fill={col} stroke="none" opacity=".7"/>
        <line x1={bx + bw*.05} y1={by + bh*.64} x2={bx - s*.05} y2={by + bh*.9} stroke={col} strokeWidth={s*.02} strokeLinecap="round" opacity=".5"/>
        <line x1={bx + bw*.95} y1={by + bh*.64} x2={bx + bw + s*.05} y2={by + bh*.9} stroke={col} strokeWidth={s*.02} strokeLinecap="round" opacity=".5"/>
      </g>
    );
  };
  const gap = s * .135;
  const insig = {
    "CIVILIAN": (
      <circle cx={cx} cy={cy} r={s*.1} fill="none" stroke={dim} strokeWidth={s*.025} strokeDasharray={`${s*.05},${s*.05}`}/>
    ),
    "PRIVATE": (<Beret/>),
    "RECRUIT": (<Beret col="#6ab030"/>),
    "OPERATIVE": (
      <g><Chevron y={cy - gap*1.6}/><Chevron y={cy - gap*.45}/><Chevron y={cy + gap*.7}/></g>
    ),
    "SENIOR OPERATIVE": (
      <g>
        <Pip px={cx - s*.18} py={cy}/>
        <Pip px={cx}         py={cy}/>
        <Pip px={cx + s*.18} py={cy}/>
      </g>
    ),
    "FIELD COMMANDER": (
      <g>
        <Crown px={cx} py={cy - s*.12}/>
        <Pip px={cx - s*.15} py={cy + s*.2} filled/>
        <Pip px={cx + s*.15} py={cy + s*.2} filled/>
      </g>
    ),
  };
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
      <rect width={s} height={s} fill="#080a06" rx={s * .04}/>
      {insig[rank] || <circle cx={cx} cy={cy} r={s*.08} fill={dim}/>}
    </svg>
  );
}

function DesignationInsignia({ desig, size = 56 }) {
  const s = size; const c = "#4fc3f7"; const gold = "#c8a000"; const cx = s / 2; const cy = s / 2;
  const icons = {
    "GHOST":        <g stroke={c} fill="none" strokeWidth={s*.033}><ellipse cx={cx} cy={cy + s*.04} rx={s*.18} ry={s*.21}/><polyline points={`${cx - s*.18},${cy + s*.25} ${cx - s*.1},${cy + s*.18} ${cx - s*.04},${cy + s*.25} ${cx + s*.04},${cy + s*.18} ${cx + s*.1},${cy + s*.25} ${cx + s*.18},${cy + s*.18}`}/><circle cx={cx - s*.07} cy={cy - s*.02} r={s*.035} fill={c}/><circle cx={cx + s*.07} cy={cy - s*.02} r={s*.035} fill={c}/></g>,
    "SNIPER":       <g stroke={c} fill="none" strokeWidth={s*.033}><circle cx={cx} cy={cy} r={s*.18}/><line x1={cx} y1={cy - s*.28} x2={cx} y2={cy - s*.18}/><line x1={cx} y1={cy + s*.18} x2={cx} y2={cy + s*.28}/><line x1={cx - s*.28} y1={cy} x2={cx - s*.18} y2={cy}/><line x1={cx + s*.18} y1={cy} x2={cx + s*.28} y2={cy}/><circle cx={cx} cy={cy} r={s*.04} fill={c}/></g>,
    "MEDIC":        <g stroke={c} fill="rgba(79,195,247,.12)" strokeWidth={s*.038}><rect x={cx - s*.15} y={cy - s*.07} width={s*.3} height={s*.14} rx={s*.02}/><rect x={cx - s*.07} y={cy - s*.15} width={s*.14} height={s*.3} rx={s*.02}/></g>,
    "DEMOLITIONS":  <g stroke={c} fill="none" strokeWidth={s*.033}><ellipse cx={cx} cy={cy + s*.04} rx={s*.11} ry={s*.16}/><line x1={cx} y1={cy - s*.12} x2={cx} y2={cy - s*.25}/><polyline points={`${cx - s*.07},${cy - s*.25} ${cx},${cy - s*.2} ${cx + s*.07},${cy - s*.25}`}/><line x1={cx - s*.18} y1={cy + s*.04} x2={cx + s*.18} y2={cy + s*.04}/></g>,
    "RECON":        <g stroke={c} fill="none" strokeWidth={s*.033}><circle cx={cx} cy={cy} r={s*.08}/><path d={`M${cx - s*.15},${cy} Q${cx},${cy - s*.25} ${cx + s*.15},${cy}`}/><path d={`M${cx - s*.15},${cy} Q${cx},${cy + s*.25} ${cx + s*.15},${cy}`}/><line x1={cx - s*.28} y1={cy} x2={cx - s*.15} y2={cy}/><line x1={cx + s*.15} y1={cy} x2={cx + s*.28} y2={cy}/></g>,
    "HEAVY GUNNER": <g stroke={c} fill="none" strokeWidth={s*.033}><rect x={cx - s*.2} y={cy - s*.08} width={s*.32} height={s*.11} rx={s*.03}/><rect x={cx + s*.08} y={cy - s*.12} width={s*.07} height={s*.04} rx={s*.01}/><circle cx={cx - s*.14} cy={cy + s*.15} r={s*.055}/><circle cx={cx + s*.04} cy={cy + s*.15} r={s*.055}/><line x1={cx - s*.28} y1={cy - s*.02} x2={cx - s*.2} y2={cy - s*.02}/></g>,
    "SUPPORT":      <g stroke={c} fill="rgba(79,195,247,.1)" strokeWidth={s*.033}><path d={`M${cx},${cy - s*.25} L${cx + s*.22},${cy + s*.15} L${cx - s*.22},${cy + s*.15} Z`}/><line x1={cx} y1={cy - s*.12} x2={cx} y2={cy + s*.04}/><circle cx={cx} cy={cy + s*.1} r={s*.03} fill={c}/></g>,
    "SQUAD LEADER": <g stroke={c} fill="none" strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.22} ${cx + s*.07},${cy - s*.07} ${cx + s*.23},${cy - s*.07} ${cx + s*.11},${cy + s*.04} ${cx + s*.16},${cy + s*.22} ${cx},${cy + s*.13} ${cx - s*.16},${cy + s*.22} ${cx - s*.11},${cy + s*.04} ${cx - s*.23},${cy - s*.07} ${cx - s*.07},${cy - s*.07}`}/></g>,
    "VETERAN":      <g strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.22} ${cx + s*.07},${cy - s*.07} ${cx + s*.23},${cy - s*.07} ${cx + s*.11},${cy + s*.04} ${cx + s*.16},${cy + s*.22} ${cx},${cy + s*.13} ${cx - s*.16},${cy + s*.22} ${cx - s*.11},${cy + s*.04} ${cx - s*.23},${cy - s*.07} ${cx - s*.07},${cy - s*.07}`} fill="rgba(79,195,247,.08)" stroke={c}/><circle cx={cx} cy={cy - s*.01} r={s*.06} fill={c} stroke="none"/></g>,
    "LEGEND":       <g strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.24} ${cx + s*.09},${cy - s*.07} ${cx + s*.26},${cy - s*.07} ${cx + s*.12},${cy + s*.04} ${cx + s*.18},${cy + s*.24} ${cx},${cy + s*.14} ${cx - s*.18},${cy + s*.24} ${cx - s*.12},${cy + s*.04} ${cx - s*.26},${cy - s*.07} ${cx - s*.09},${cy - s*.07}`} fill="rgba(200,160,0,.15)" stroke={gold}/><polygon points={`${cx},${cy - s*.12} ${cx + s*.04},${cy - s*.03} ${cx + s*.12},${cy - s*.03} ${cx + s*.06},${cy + s*.02} ${cx + s*.08},${cy + s*.11} ${cx},${cy + s*.06} ${cx - s*.08},${cy + s*.11} ${cx - s*.06},${cy + s*.02} ${cx - s*.12},${cy - s*.03} ${cx - s*.04},${cy - s*.03}`} fill={gold} stroke="none"/></g>,
  };
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
      <rect width={s} height={s} fill="#080a06" rx={s * .04}/>
      {icons[desig] || <text x={cx} y={cy + s*.07} textAnchor="middle" fontSize={s*.35} fill={c}>{desig[0]}</text>}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Exports — everything that AdminPanel.jsx or App.jsx may need
// ─────────────────────────────────────────────────────────────
export {
  // Helpers / constants
  renderMd, stockLabel, fmtErr,
  gmtNow, gmtDate, gmtShort, fmtDate, uid,
  CSS,
  // Square
  loadSquareConfig, SquareCheckoutButton,
  ShopifyCheckoutButton, loadShopifyConfig,
  _squareAppId, _squareLocationId, _squareEnv,
  // Tracking
  TRACKING_CACHE_KEY, TRACKING_TTL_MS, TRACKING_TTL_SHORT_MS,
  TM_STATUS_MAP, TM_CARRIER_MAP,
  getTrackingKey, fetchTrackingStatus,
  detectCourier,
  AdminTrackStatusCell, AdminTrackBadge, TrackingBlock,
  // Data hook
  useData,
  // UI components
  SkeletonCard, Toast, useMobile, useToast,
  GmtClock, Countdown, QRCode, QRScanner,
  SupabaseAuthModal, WaiverModal, PublicNav,
  // Email
  EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY,
  sendEmail,
  sendTicketEmail, sendEventReminderEmail, sendWaitlistNotifyEmail,
  sendCancellationEmail, sendWelcomeEmail,
  sendOrderEmail, sendDispatchEmail, sendNewEventEmail,
  sendAdminBookingNotification, sendAdminOrderNotification,
  sendAdminReturnNotification, sendReturnDecisionEmail,
  // Home
  HomePage, CountdownPanel,
  // Player insignia
  RankInsignia, DesignationInsignia,
};
