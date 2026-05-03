// utils/useData.js — primary data loading hook
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { normaliseProfile } from "../api";

function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Ref to hold fetched news rows so loadAll can pick them up even if
  // the independent fetchNews effect resolves before data is set.
  const newsRowsRef = useRef([]);

  // Fetch news completely independently — isolated from the main data load.
  // Polls every 2s until data is set, then patches news in directly.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('news_posts')
      .select('*')
      .eq('published', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) { console.error('[news]', error.message); return; }
        if (!rows || rows.length === 0) return;
        newsRowsRef.current = rows;
        // Poll until main data has loaded, then patch news in
        const patch = () => {
          if (cancelled) return;
          setData(prev => {
            if (!prev) { setTimeout(patch, 300); return prev; }
            if (prev.news && prev.news.length > 0) return prev; // already set
            return { ...prev, news: rows };
          });
        };
        patch();
      });
    return () => { cancelled = true; };
  }, []);

  // Guard: prevent concurrent loadAll calls from racing each other.
  // If one is already running, the next call is a no-op until it finishes.
  const loadingRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return; // already in progress — skip
    loadingRef.current = true;
    setLoadError(null);
    const emptyData = { events: [], shop: [], postageOptions: [], albums: [], qa: [], homeMsg: "", users: [], staff: [], news: [] };

    // Single top-level timeout — if the whole thing takes too long, unblock the UI
    const globalTimeout = setTimeout(() => {
      loadingRef.current = false;
      setData(prev => prev || emptyData);
      setLoading(false);
    }, 20000);

    // Fetch news independently — outside the retry loop so cold-start retries
    // on events/shop never cause news to be wiped back to [].
    const newsPromise = api.news.getAll()
      .catch(e => { console.error("[news] fetch failed:", e?.message || e); return []; });

    // Retry up to 3 times with increasing delays to handle cold DB / Supabase wake-up
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [3000, 5000, 8000]; // ms to wait before each retry

    // Preserve the best news result across retries — news loads fast and may
    // succeed on attempt 1 while events/shop cold-start, then get overwritten
    // with [] on the forced retry.
    let bestNewsList = [];

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

          const [evList, shopList, postageList, albumList, qaList, staffList, newsList, homeMsg,
                 socialFacebook, socialInstagram, socialWhatsapp, contactAddress, contactPhone, contactEmail,
                 contactDepartmentsRaw, shopClosed] = await Promise.all([
            safe("events",  api.events.getAll()),
            safe("shop",    api.shop.getAll()),
            safe("postage", api.postage.getAll()),
            safe("gallery", api.gallery.getAll()),
            safe("qa",      api.qa.getAll()),
            safe("staff",   api.staff.getAll()),
            // News fetched once above, outside retry loop
            attempt === 0 ? newsPromise : Promise.resolve(bestNewsList.length > 0 ? bestNewsList : []),
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

          // Keep the best news result — don't let a cold-start retry overwrite a good result with []
          if (newsList.length > 0) bestNewsList = newsList;

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
            news: newsList.length > 0 ? newsList : (bestNewsList.length > 0 ? bestNewsList : newsRowsRef.current),
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

          // Load profiles after public data.
          // Full load succeeds for authenticated users; guests fall back to the
          // public leaderboard subset so the Combat Roll is never empty.
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
            .catch(() => {
              // Authenticated profile load failed (guest / RLS restriction).
              // Fetch the minimal public subset needed to render the leaderboard.
              // Only selects non-sensitive fields; email, phone, credits etc. are excluded.
              supabase
                .from("profiles")
                .select("id, name, callsign, role, games_attended, vip_status, vip_expires_at, profile_pic, public_profile, leaderboard_opt_out")
                .eq("role", "player")
                .then(({ data: rows }) => {
                  if (!rows || rows.length === 0) return;
                  const now = new Date();
                  const publicProfiles = rows.map(r => ({
                    id:                r.id,
                    name:              r.name              || "",
                    callsign:          r.callsign          || "",
                    role:              r.role              || "player",
                    gamesAttended:     r.games_attended    || 0,
                    vipStatus:         r.vip_status && r.vip_expires_at && new Date(r.vip_expires_at) < now
                                         ? "expired"
                                         : (r.vip_status   || "none"),
                    vipExpiresAt:      r.vip_expires_at    || null,
                    profilePic:        r.profile_pic       || null,
                    publicProfile:     r.public_profile    ?? false,
                    leaderboardOptOut: r.leaderboard_opt_out ?? false,
                  }));
                  setData(prev => prev ? { ...prev, users: publicProfiles } : prev);
                })
                .catch(() => {}); // truly public fetch failed — board stays empty
            });

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
      vipSquarePaymentId: "vip_square_payment_id", vipSquareReceiptUrl: "vip_square_receipt_url",
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

export { useData };
