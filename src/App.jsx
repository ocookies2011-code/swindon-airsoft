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
import { AdminPanel, AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage } from "./index";

// Pages
import EventsPage from "./pages/EventsPage";
import GiftVoucherPage from "./pages/GiftVoucherPage";
import ShopClosedPage from "./pages/ShopClosedPage";
import ShopPage from "./pages/ShopPage";
import ProductPage from "./pages/ProductPage";
import MarshalCheckinPage from "./pages/MarshalCheckinPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import GalleryPage from "./pages/GalleryPage";
import VipPage from "./pages/VipPage";
import QAPage from "./pages/QAPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import ProfilePage from "./pages/ProfilePage";
import UKARAPage from "./pages/UKARAPage";

// Components
import { ProductReviews } from "./components/ProductReviews";
import { PlayerOrders, ReturnRequestBlock, CustomerOrderDetail } from "./components/PlayerOrders";
import LoadoutTab from "./components/LoadoutTab";
import { RankInsignia, DesignationInsignia } from "./components/Insignia";
import ReportCheatTab from "./components/ReportCheatTab";
import ErrorBoundary from "./components/ErrorBoundary";

function AppInner() {
  const { data, loading, loadError, save, updateUser, updateEvent, refresh } = useData();
  // ── Offline detection ─────────────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online",  goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

  // ── Hash routing ──────────────────────────────────────────
  // Format: #page  |  #admin/section  |  #admin/section/tab
  //         #profile/tab  |  #events/eventId
  const PUBLIC_PAGES = ["home","events","shop","gallery","qa","vip","gift-vouchers","leaderboard","profile","about","ukara","staff","contact","terms","player"];
  const getInitialPage = () => {
    const parts = window.location.hash.replace("#","").split("/");
    const p = parts[0];
    if (p === "admin") return "admin";
    return PUBLIC_PAGES.includes(p) ? p : "home";
  };
  const [page, setPageState] = useState(getInitialPage);
  const [publicProfileId, setPublicProfileId] = useState(() => {
    const parts = window.location.hash.replace("#","").split("/");
    return parts[0] === "player" ? (parts[1] || null) : null;
  });
  const [prevPage, setPrevPage] = useState("leaderboard");

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

  // ── Backfill user info on anonymous visit rows ────────────
  // When auth resolves after the initial page track (e.g. returning player
  // whose session loads asynchronously), patch all rows for this tab session
  // that were recorded before cu was known so their name appears on the map.
  useEffect(() => {
    if (!cu?.id || page === "admin") return;
    const sid = sessionStorage.getItem("sa_sid");
    if (!sid) return;
    api.visits.backfillUser({ sessionId: sid, userId: cu.id, userName: cu.name });
  }, [cu?.id]);


  useEffect(() => {
    const onHash = () => {
      const parts = window.location.hash.replace("#","").split("/");
      const p = parts[0];
      if (p === "admin") { setPageState("admin"); return; }
      if (p === "player") { setPublicProfileId(parts[1] || null); setPageState("player"); return; }
      if (PUBLIC_PAGES.includes(p)) setPageState(p);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // Shop state — lifted to App level so cart persists between shop & product page
  const [shopCart, setShopCart] = useState([]);
  const [shopCartOpen, setShopCartOpen] = useState(false);
  // ── Shop cart funnel tracking ──────────────────────────────
  useEffect(() => {
    if (page !== "shop") return;
    const sid = sessionStorage.getItem("sa_sid");
    const itemCount = shopCart.reduce((s, i) => s + i.qty, 0);
    if (itemCount === 0) return; // nothing in cart — already tracked as 'shop'
    const funnelPage = shopCartOpen ? "shop:checkout" : "shop:basket";
    api.visits.track({
      page:      funnelPage,
      userId:    cu?.id   || null,
      userName:  cu?.name || null,
      sessionId: sid,
    });
  }, [shopCart.length, shopCartOpen, page]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  // Reset product view when navigating away from shop
  useEffect(() => { if (page !== "shop") setSelectedProduct(null); }, [page]);
  // Track recently viewed products (max 4, no duplicates, most recent first)
  const trackRecentlyViewed = useCallback((item) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(p => p.id !== item.id);
      return [item, ...filtered].slice(0, 4);
    });
  }, []);

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
              const newName = meta.name || session.user.email?.split('@')[0] || 'Player';
              await supabase.from('profiles').insert({
                id: session.user.id, name: newName,
                phone: meta.phone || '', role: 'player', games_attended: 0,
              }).select().single();
              const profile2 = await api.profiles.getById(session.user.id);
              if (profile2) {
                setCu(normaliseProfile(profile2));
                // Send welcome email to new players
                sendWelcomeEmail({ name: newName, email: session.user.email }).catch(() => {});
              }
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
    // Fire VIP activation email when admin sets a player to active
    if (patch.vipStatus === "active" || patch.vip_status === "active") {
      try {
        const target = data?.users?.find(u => u.id === id);
        if (target?.email) {
          sendEmail({
            toEmail: target.email,
            toName:  target.name || "Operative",
            subject: "⭐ Your Swindon Airsoft VIP Membership is Active!",
            htmlContent: `
              <div style="font-family:sans-serif;max-width:600px;background:#111;color:#ddd;padding:32px;border-radius:8px;border:1px solid #2a2a2a">
                <div style="text-align:center;margin-bottom:28px">
                  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;letter-spacing:.18em;color:#e8f0d8;text-transform:uppercase">
                    SWINDON <span style="color:#c8ff00">AIRSOFT</span>
                  </div>
                  <div style="font-size:11px;letter-spacing:.2em;color:#c8a000;margin-top:4px;text-transform:uppercase">⭐ Elite Operative Status</div>
                </div>
                <div style="background:linear-gradient(135deg,#0c1009,#111a06);border:1px solid #2a3a10;border-left:3px solid #c8a000;border-radius:6px;padding:24px;text-align:center;margin-bottom:24px">
                  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:36px;letter-spacing:.15em;color:#c8a000;text-transform:uppercase;margin-bottom:8px">VIP ACTIVATED</div>
                  <div style="font-size:13px;color:#aaa;line-height:1.7">Welcome to the elite, <strong style="color:#fff">${target.name || "Operative"}</strong>. Your VIP membership is now live.</div>
                </div>
                <div style="margin-bottom:20px">
                  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:13px;letter-spacing:.15em;color:#c8ff00;text-transform:uppercase;margin-bottom:12px">YOUR BENEFITS</div>
                  ${["10% discount on all game day bookings","10% discount at Airsoft Armoury UK","Free game day on your birthday","Access to VIP-only events","Priority booking for special events","VIP badge on your player profile"].map(b =>
                    `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #1a2808;font-size:13px;color:#8aaa50"><span style="color:#c8a000;font-size:10px">★</span>${b}</div>`
                  ).join("")}
                </div>
                <div style="text-align:center;margin-top:24px">
                  <a href="${window.location.origin}${window.location.pathname}#profile/vip" style="display:inline-block;background:#c8a000;color:#000;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:13px;letter-spacing:.2em;text-transform:uppercase;padding:12px 28px;text-decoration:none">VIEW MY VIP STATUS →</a>
                </div>
              </div>
            `,
          }).catch(() => {});
        }
      } catch {}
    }
  }, [updateUser, cu, refreshCu, data]);

  const [geoStatus, setGeoStatus] = useState("checking"); // "checking" | "allowed" | "blocked"

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      // SECURITY NOTE: This geo-check is client-side and can be bypassed with a VPN or DevTools.
      // It is a UX-level restriction only, not a security control.
      // For legally binding geo-restriction, enforce it server-side:
      //   - Supabase Edge Function: check CF-IPCountry header
      //   - Or your hosting provider's edge rules (Vercel, Netlify, Cloudflare)

      const apis = [
        { url: "https://ipwho.is/",             getCode: g => g.success ? g.country_code : null },
        { url: "https://freeipapi.com/api/json", getCode: g => g.countryCode || null },
        { url: "https://api.country.is/",        getCode: g => g.country || null },
      ];

      // Race all three APIs in parallel — use whichever responds first with a valid code
      const tryApi = async ({ url, getCode }) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error("non-ok");
        const g = await res.json();
        const code = (getCode(g) || "").toUpperCase();
        if (!code) throw new Error("no code");
        return code;
      };

      try {
        const code = await Promise.any(apis.map(tryApi));
        if (!cancelled) setGeoStatus(ALLOWED_COUNTRY_CODES.has(code) ? "allowed" : "blocked");
      } catch {
        // All APIs failed (network issue) — fail open so real UK/EU visitors aren't locked out
        if (!cancelled) setGeoStatus("allowed");
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

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
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", background:"#080a06", overflow:"hidden", position:"relative", fontFamily:"'Barlow Condensed',sans-serif" }}>
        {/* Crosshair reticle background */}
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", opacity:.04, pointerEvents:"none" }}>
          <svg width="520" height="520" viewBox="0 0 520 520" fill="none">
            <circle cx="260" cy="260" r="200" stroke="#c8ff00" strokeWidth="1"/>
            <circle cx="260" cy="260" r="120" stroke="#c8ff00" strokeWidth="1"/>
            <circle cx="260" cy="260" r="40" stroke="#c8ff00" strokeWidth="1"/>
            <line x1="0" y1="260" x2="520" y2="260" stroke="#c8ff00" strokeWidth="1"/>
            <line x1="260" y1="0" x2="260" y2="520" stroke="#c8ff00" strokeWidth="1"/>
            <line x1="80" y1="260" x2="80" y2="240" stroke="#c8ff00" strokeWidth="1.5"/>
            <line x1="440" y1="260" x2="440" y2="240" stroke="#c8ff00" strokeWidth="1.5"/>
            <line x1="260" y1="80" x2="240" y2="80" stroke="#c8ff00" strokeWidth="1.5"/>
            <line x1="260" y1="440" x2="240" y2="440" stroke="#c8ff00" strokeWidth="1.5"/>
          </svg>
        </div>
        {/* Corner bracket decorations */}
        <div style={{ position:"absolute", top:32, left:32, width:40, height:40, borderTop:"2px solid rgba(200,255,0,.2)", borderLeft:"2px solid rgba(200,255,0,.2)" }}/>
        <div style={{ position:"absolute", top:32, right:32, width:40, height:40, borderTop:"2px solid rgba(200,255,0,.2)", borderRight:"2px solid rgba(200,255,0,.2)" }}/>
        <div style={{ position:"absolute", bottom:32, left:32, width:40, height:40, borderBottom:"2px solid rgba(200,255,0,.2)", borderLeft:"2px solid rgba(200,255,0,.2)" }}/>
        <div style={{ position:"absolute", bottom:32, right:32, width:40, height:40, borderBottom:"2px solid rgba(200,255,0,.2)", borderRight:"2px solid rgba(200,255,0,.2)" }}/>
        {/* Logo mark */}
        <div style={{ marginBottom:32, display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
          {/* SA logo */}
          <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ width:480, height:"auto", objectFit:"contain", animation:"aimIn 0.6s ease-out forwards", filter:"drop-shadow(0 0 40px rgba(200,255,0,0.4))" }} />
        </div>
        {/* Site name */}
        <div style={{ fontSize:32, fontWeight:900, letterSpacing:".12em", color:"#fff", textTransform:"uppercase", lineHeight:1, marginBottom:4 }}>
          SWINDON <span style={{ color:"#c8ff00" }}>AIRSOFT</span>
        </div>
        <div style={{ fontSize:10, letterSpacing:".35em", color:"#3a5010", textTransform:"uppercase", marginBottom:32 }}>
          TACTICAL OPERATIONS CENTRE
        </div>
        {/* Progress bar */}
        <div style={{ width:220, height:2, background:"#1a2808", marginBottom:14, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, height:"100%", width:"100%", background:"linear-gradient(90deg,transparent,#c8ff00,transparent)", animation:"scanBar 1.4s ease-in-out infinite" }}/>
        </div>
        {/* Status text */}
        <div style={{ fontSize:11, letterSpacing:".2em", color:"#3a5010", textTransform:"uppercase", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ display:"inline-block", width:6, height:6, background:"#c8ff00", borderRadius:"50%", animation:"pulse 1s infinite" }}/>
          {isSlowLoad ? "WAKING UP DATABASE…" : "INITIALISING SYSTEMS…"}
        </div>
        {isSlowLoad && (
          <div style={{ marginTop:12, fontSize:11, color:"#333", letterSpacing:".05em", textAlign:"center", maxWidth:260 }}>
            Cold start — database coming online, hold tight
          </div>
        )}
        <style>{`
          @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.2;}}
          @keyframes scanBar{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}
          @keyframes aimIn{from{opacity:0;transform:translateX(-20px);}to{opacity:1;transform:translateX(0);}}
        `}</style>
      </div>
    );
  }

  if (!data) return null;

  // ── Geo-block screens ─────────────────────────────────────
  if (geoStatus === "checking") {
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, background:"#080a06", fontFamily:"'Barlow Condensed',sans-serif" }}>
        <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ width:120, height:"auto", objectFit:"contain", marginBottom:4 }} />
        <div style={{ width:160, height:2, background:"#1a2808", position:"relative", overflow:"hidden", marginTop:8 }}>
          <div style={{ position:"absolute", top:0, left:0, height:"100%", width:"100%", background:"linear-gradient(90deg,transparent,#c8ff00,transparent)", animation:"scanBar 1.4s ease-in-out infinite" }}/>
        </div>
        <div style={{ color:"#3a5010", fontSize:10, letterSpacing:".25em", textTransform:"uppercase", marginTop:4 }}>VERIFYING LOCATION…</div>
        <style>{`@keyframes scanBar{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}`}</style>
      </div>
    );
  }

  if (geoStatus === "blocked" && cu?.role !== "admin") {
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:20, background:"#0d1117", padding:24, textAlign:"center" }}>
        <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ width:80, height:"auto", objectFit:"contain" }} />
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, fontWeight:900, letterSpacing:".1em", color:"#fff" }}>NOT AVAILABLE IN YOUR REGION</div>
        <div style={{ fontSize:14, color:"#555", maxWidth:340, lineHeight:1.7 }}>
          Swindon Airsoft is only available to visitors in the UK, Ireland, and EU member states.
        </div>
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
      {isOffline && (
        <div style={{ background:"#1a0a00", borderBottom:"1px solid #3a1a00", padding:"8px 16px", display:"flex", alignItems:"center", gap:10, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#ff9944", letterSpacing:".15em" }}>
          <span style={{ fontSize:14 }}>📡</span>
          <span>NO SIGNAL — YOU ARE OFFLINE. SOME FEATURES MAY NOT WORK.</span>
        </div>
      )}
      <PublicNav page={page} setPage={setPage} cu={cu} setCu={setCu} setAuthModal={setAuthModal} shopClosed={data?.shopClosed} />

      <div className="pub-page-wrap">
        {page === "home"        && <HomePage data={data} setPage={setPage} onProductClick={(item) => { setSelectedProduct(item); setPageState("shop"); window.location.hash = "shop"; }} />}
        {page === "events"      && <EventsPage data={data} cu={cu} updateEvent={updateEvent} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} save={save} setPage={setPage} />}
        {page === "shop" && data.shopClosed && (
          <ShopClosedPage setPage={setPage} />
        )}
        {page === "shop" && !data.shopClosed && !selectedProduct && (
          <ShopPage
            data={data} cu={cu} showToast={showToast} save={save}
            recentlyViewed={recentlyViewed}
            cart={shopCart} setCart={setShopCart}
            cartOpen={shopCartOpen} setCartOpen={setShopCartOpen}
            onProductClick={(item) => { setSelectedProduct(item); trackRecentlyViewed(item); }}
            setPage={setPage}
          />
        )}
        {page === "shop" && !data.shopClosed && selectedProduct && (
          <ProductPage
            item={selectedProduct}
            cu={cu}
            shopItems={data.shop || []}
            onProductClick={(p) => { setSelectedProduct(p); trackRecentlyViewed(p); }}
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
        {page === "leaderboard" && <LeaderboardPage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} onPlayerClick={id => { setPrevPage("leaderboard"); setPublicProfileId(id); setPageState("player"); window.location.hash = "player/" + id; }} />}
        {page === "marshal"     && cu?.canMarshal && <MarshalCheckinPage data={data} showToast={showToast} save={save} updateUser={updateUserAndRefresh} />}
        {page === "marshal"     && !cu?.canMarshal && <div style={{ textAlign:"center", padding:60, color:"var(--muted)" }}>Access denied.</div>}
        {page === "gallery"     && <GalleryPage data={data} />}
        {page === "qa"          && <QAPage data={data} />}
        {page === "gift-vouchers" && <GiftVoucherPage cu={cu} showToast={showToast} setAuthModal={setAuthModal} />}
        {page === "vip"         && <VipPage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} setAuthModal={setAuthModal} setPage={setPage} />}
        {page === "profile"     && cu  && <ProfilePage data={data} cu={cu} updateUser={updateUserAndRefresh} showToast={showToast} save={save} refresh={refreshCu} setPage={setPage} />}
        {page === "profile"     && !cu && <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>Please log in to view your profile.</div>}
        {page === "player"      && <PublicProfilePage userId={publicProfileId} prevPage={prevPage} setPage={setPage} />}
        {page === "ukara"       && <UKARAPage cu={cu} setPage={setPage} showToast={showToast} setAuthModal={setAuthModal} />}
        {page === "about"       && <AboutPage setPage={setPage} />}
        {page === "staff"       && <StaffPage staff={data.staff || []} />}
        {page === "contact"     && <ContactPage data={data} cu={cu} showToast={showToast} />}
        {page === "terms"       && <TermsPage setPage={setPage} />}
      </div>

      {/* FOOTER */}
      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-grid">
            {/* Brand col */}
            <div>
              <div className="pub-footer-logo">
                <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:70, width:"auto", objectFit:"contain" }} />
              </div>
              <p className="pub-footer-desc">Premier airsoft venue. Experience tactical gameplay like never before.</p>
              {(data.socialFacebook || data.socialInstagram || data.socialWhatsapp) && (
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
                  {data.socialWhatsapp && (
                    <a href={data.socialWhatsapp} target="_blank" rel="noopener noreferrer" className="pub-footer-social-btn" title="WhatsApp">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
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
                ["Gift Vouchers", "gift-vouchers"],
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
                ["Sign Waiver",        "profile"],
                ["UKARA Registration", "ukara"],
                ["Site Rules",         "qa"],
                ["FAQ",                "qa"],
                ["Terms & Privacy",    "terms"],
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
            <div style={{ display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
              <div className="pub-footer-legal">Players must be 18+ or accompanied by adult. Valid ID required.</div>
              <button onClick={() => setPage("terms")} style={{ background:"none", border:"none", color:"var(--muted)", fontSize:12, cursor:"pointer", padding:0, textDecoration:"underline" }}>Terms & Privacy Policy</button>
            </div>
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


export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

// ── UKARA Page ─────────────────────────────────────────────────
