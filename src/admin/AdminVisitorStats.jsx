// admin/AdminVisitorStats.jsx — visitor map + stats
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtDate } from "../utils";

function UKVisitorMap({ visitData }) {
  const mapRef       = useRef(null);   // DOM node
  const leafletRef   = useRef(null);   // L (library)
  const mapObjRef    = useRef(null);   // map instance
  const markersRef   = useRef([]);     // active markers
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // ── City coordinate fallbacks ─────────────────────────────
  const CITY_COORDS = {
    "swindon":      [51.558, -1.782], "london":       [51.507, -0.128],
    "reading":      [51.454, -0.971], "bristol":      [51.454, -2.588],
    "birmingham":   [52.480, -1.902], "manchester":   [53.480, -2.242],
    "leeds":        [53.800, -1.549], "sheffield":    [53.381, -1.470],
    "liverpool":    [53.408, -2.991], "edinburgh":    [55.953, -3.189],
    "glasgow":      [55.864, -4.252], "cardiff":      [51.481, -3.180],
    "oxford":       [51.752, -1.258], "cambridge":    [52.205,  0.119],
    "coventry":     [52.408, -1.510], "leicester":    [52.637, -1.135],
    "nottingham":   [52.954, -1.150], "newcastle":    [54.978, -1.618],
    "dumbarton":    [55.943, -4.571], "farnborough":  [51.295, -0.758],
    "southampton":  [50.910, -1.404], "portsmouth":   [50.805, -1.087],
    "exeter":       [50.726, -3.527], "york":         [53.958, -1.082],
    "bath":         [51.381, -2.360], "brighton":     [50.827, -0.137],
    "norwich":      [52.628,  1.299], "plymouth":     [50.375, -4.143],
    "worcester":    [52.193, -2.220], "hereford":     [52.056, -2.716],
    "swansea":      [51.621, -3.944], "wrexham":      [53.046, -2.994],
    "chester":      [53.193, -2.893], "stoke":        [53.003, -2.180],
    "derby":        [52.922, -1.478], "lincoln":      [53.235, -0.540],
    "peterborough": [52.573, -0.237], "ipswich":      [52.059,  1.155],
    "colchester":   [51.896,  0.903], "luton":        [51.879, -0.418],
    "milton keynes":[52.041, -0.759], "northampton":  [52.240, -0.898],
  };

  // Country-level fallback coords — used when geo resolved a country but no city/lat/lon
  const COUNTRY_COORDS = {
    "GB": [52.5, -1.5],  "IE": [53.4, -8.2],  "US": [38.9, -77.0],
    "DE": [51.2,  10.5], "FR": [46.2,   2.2],  "ES": [40.4,  -3.7],
    "IT": [42.5,  12.5], "NL": [52.4,   5.3],  "BE": [50.5,   4.5],
    "PL": [52.2,  21.0], "AU": [-25.3, 133.8], "CA": [56.1, -106.3],
    "NZ": [-40.9, 174.9],"ZA": [-30.6,  22.9], "SE": [62.2,  17.6],
    "NO": [60.5,   8.5], "DK": [56.3,   9.5],  "FI": [61.9,  25.7],
    "PT": [39.4,  -8.2], "CH": [46.8,   8.2],  "AT": [47.5,  14.6],
    "RO": [45.9,  24.9], "CZ": [49.8,  15.5],  "HU": [47.2,  19.5],
  };

  // ── Build pin clusters ────────────────────────────────────
  const buildPins = useCallback(() => {
    const pinMap = {};
    visitData.forEach(row => {
      let lat = row.lat, lon = row.lon;
      // 1. Use stored lat/lon if present
      // 2. Fall back to city name lookup
      if ((!lat || !lon) && row.city) {
        const c = CITY_COORDS[row.city.toLowerCase()];
        if (c) { lat = c[0]; lon = c[1]; }
      }
      // 3. Fall back to country-centre coords so the visit still appears on the map
      if ((!lat || !lon) && row.country) {
        const c = COUNTRY_COORDS[row.country.toUpperCase()];
        if (c) { lat = c[0]; lon = c[1]; }
      }
      if (!lat || !lon) return;
      const latR = Math.round(lat * 10) / 10;
      const lonR = Math.round(lon * 10) / 10;
      const key  = latR + ',' + lonR;
      if (!pinMap[key]) pinMap[key] = { lat:latR, lon:lonR, count:0, city:row.city, country:row.country, users:new Map(), sessions:new Set() };
      pinMap[key].count++;
      pinMap[key].sessions.add(row.session_id);
      if (row.user_name) {
        // Normalise to lowercase key to deduplicate case variants (e.g. "Matt kane" vs "Matt Kane")
        // Store the most recently seen casing for display
        const nameKey = row.user_name.toLowerCase();
        pinMap[key].users.set(nameKey, row.user_name);
      }
    });
    return Object.values(pinMap);
  }, [visitData]);

  // ── Load Leaflet from CDN once ────────────────────────────
  useEffect(() => {
    // CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }
    // JS
    if (window.L) { leafletRef.current = window.L; setReady(true); return; }
    if (document.getElementById('leaflet-js')) {
      const poll = setInterval(() => { if (window.L) { clearInterval(poll); leafletRef.current = window.L; setReady(true); } }, 80);
      return () => clearInterval(poll);
    }
    const script    = document.createElement('script');
    script.id       = 'leaflet-js';
    script.src      = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload   = () => { leafletRef.current = window.L; setReady(true); };
    script.onerror  = () => setError('Failed to load map library.');
    document.head.appendChild(script);
  }, []);

  // ── Initialise map once Leaflet + DOM node are both ready ─
  useEffect(() => {
    if (!ready || !mapRef.current || mapObjRef.current) return;
    const L = leafletRef.current;

    const map = L.map(mapRef.current, {
      center:        [54.5, -3.5],
      zoom:          6,
      zoomControl:   true,
      attributionControl: false,
    });

    // OpenStreetMap tile layer — real roads, towns, terrain colours
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Subtle attribution in corner
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('<span style="font-size:9px;opacity:.4">© OpenStreetMap</span>')
      .addTo(map);

    mapObjRef.current = map;
  }, [ready]);

  // ── Re-draw markers whenever visitData or map changes ────
  useEffect(() => {
    if (!mapObjRef.current || !leafletRef.current) return;
    const L   = leafletRef.current;
    const map = mapObjRef.current;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const pins     = buildPins();
    const maxCount = Math.max(...pins.map(p => p.count), 1);

    pins.forEach(pin => {
      const isUK    = pin.country === 'GB';
      const color   = isUK ? '#c8ff00' : '#4fc3f7';
      const size    = Math.round(18 + (pin.count / maxCount) * 22);
      const border  = isUK ? '#6a8800' : '#0288d1';

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};border:2px solid ${border};
          display:flex;align-items:center;justify-content:center;
          font-family:monospace;font-weight:700;font-size:${size > 28 ? 11 : 9}px;
          color:#060e08;cursor:pointer;
          box-shadow:0 0 ${size/2}px ${color}55;
          transition:transform .1s;
        ">${pin.sessions.size}</div>`,
        iconSize:   [size, size],
        iconAnchor: [size/2, size/2],
      });

      const usersHtml = pin.users.size > 0
        ? `<div style="border-top:1px solid #1a2808;padding-top:6px;margin-top:6px">
            <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:.15em;color:#3a5010;margin-bottom:4px">LOGGED-IN PLAYERS</div>
            ${[...pin.users.values()].slice(0,8).map(n=>`<div style="color:#c8ff00;font-size:13px;font-family:'Barlow Condensed',sans-serif;font-weight:700">▸ ${n}</div>`).join('')}
            ${pin.users.size > 8 ? `<div style="color:#3a5010;font-size:10px;margin-top:2px">+${pin.users.size - 8} more</div>` : ''}
          </div>` : '';

      const popup = L.popup({
        className:   'sa-map-popup',
        maxWidth:    220,
        offset:      [0, -size/2],
        closeButton: true,
      }).setContent(`
        <div style="background:#080f04;border:1px solid #2a3a10;padding:12px 14px;font-family:'Share Tech Mono',monospace;color:#b0c090;min-width:180px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:17px;color:#c8ff00;margin-bottom:5px">
            ${pin.city || 'Unknown'}${pin.country ? ', ' + pin.country : ''}
          </div>
          <div style="color:#5a7a30;font-size:11px">
            ${pin.sessions.size} session${pin.sessions.size !== 1 ? 's' : ''} &nbsp;·&nbsp; ${pin.count} page view${pin.count !== 1 ? 's' : ''}
          </div>
          ${usersHtml}
        </div>
      `);

      const marker = L.marker([pin.lat, pin.lon], { icon }).bindPopup(popup);
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [ready, buildPins]);

  // ── Inject popup CSS once ─────────────────────────────────
  useEffect(() => {
    if (document.getElementById('sa-map-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'sa-map-popup-style';
    style.textContent = `
      .sa-map-popup .leaflet-popup-content-wrapper,
      .sa-map-popup .leaflet-popup-tip {
        background: transparent !important;
        border: none !important;
        box-shadow: 0 8px 32px rgba(0,0,0,.8) !important;
        padding: 0 !important;
        border-radius: 0 !important;
      }
      .sa-map-popup .leaflet-popup-content { margin: 0 !important; }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }
    };
  }, []);

  const pins     = buildPins();
  const maxCount = Math.max(...pins.map(p => p.count), 1);

  return (
    <div style={{ background:'#0c1009', border:'1px solid #1a2808', padding:'18px 20px', gridColumn:'1 / -1' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:'.22em', color:'#3a5010' }}>VISITOR MAP</div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#2a3a10' }}>
          {pins.length} location{pins.length !== 1 ? 's' : ''} · {visitData.length} visit{visitData.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Map container */}
      <div style={{ position:'relative', width:'100%', height:480, border:'1px solid #1a2808' }}>
        {!ready && !error && (
          <div style={{ position:'absolute', inset:0, background:'#07100a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:'.2em', color:'#2a3a10' }}>LOADING MAP…</div>
          </div>
        )}
        {error && (
          <div style={{ position:'absolute', inset:0, background:'#07100a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#5a1010' }}>{error}</div>
          </div>
        )}
        <div ref={mapRef} style={{ width:'100%', height:'100%' }} />
      </div>

      {/* Legend */}
      {pins.length > 0 && (
        <div style={{ display:'flex', gap:20, justifyContent:'center', marginTop:10, fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:'#3a5010', flexWrap:'wrap' }}>
          <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#c8ff00' }}/>UK visitor</span>
          <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#4fc3f7' }}/>International</span>
          <span>Number = unique sessions · Size = volume · Click pin for details</span>
        </div>
      )}
      {pins.length === 0 && (
        <div style={{ textAlign:'center', padding:'20px 0 4px', fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:'#2a3a10', letterSpacing:'.2em' }}>NO COORDINATE DATA YET — ACCUMULATES WITH NEW VISITS</div>
      )}
    </div>
  );
}


// ── Admin Visitor Stats ───────────────────────────────────
function AdminVisitorStats() {
  const [visitData, setVisitData]         = useState([]);
  const [allTimeCounts, setAllTimeCounts] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [activeTab, setActiveTab]         = useState("overview");
  const [dateRange, setDateRange]         = useState("7d");

  const rangeToDays = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, "all": 0 };

  // ── Live viewer count — sessions active in the last 5 minutes ──
  const [liveCount, setLiveCount] = useState(null);
  const [liveNames, setLiveNames] = useState([]);

  // Inject livePulse keyframe into document head once
  useEffect(() => {
    const id = 'live-pulse-style';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = '@keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.4)} }';
    document.head.appendChild(s);
    return () => { try { document.head.removeChild(s); } catch {} };
  }, []);

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from('page_visits')
          .select('session_id, user_name, page')
          .gte('created_at', since)
          .order('created_at', { ascending: false });
        if (!data) return;
        // Deduplicate by session_id — keep most recent row per session
        const seen = new Map();
        data.forEach(row => { if (!seen.has(row.session_id)) seen.set(row.session_id, row); });
        const sessions = [...seen.values()];
        setLiveCount(sessions.length);
        setLiveNames(sessions.map(s => ({ name: s.user_name, page: s.page })));
      } catch { /* non-fatal */ }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, []);

  // Re-fetch whenever date range changes — filtering happens server-side
  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = rangeToDays[dateRange] ?? 7;
    Promise.all([
      api.visits.getStats(days),
      // Always fetch all-time counts so the headline total is always accurate
      // regardless of the 10k row fetch cap on getStats
      api.visits.getAllTimeCounts(),
    ])
      .then(([rows, counts]) => {
        setVisitData(rows);
        if (counts) setAllTimeCounts(counts);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [dateRange]); // eslint-disable-line

  // Data arrives pre-filtered from the server
  // Filter out bot/crawler traffic — identified by user_agent strings.
  // Bots (Googlebot, Bingbot etc.) typically hit from US datacenters (San Jose)
  // with no referrer and no user_id, heavily distorting location stats.
  const BOT_PATTERNS = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|google|baidu|yandex|duckduck|semrush|ahrefs|mj12|petalbot|bytespider/i;
  const filtered = visitData.filter(row =>
    !row.user_agent || !BOT_PATTERNS.test(row.user_agent)
  );

  // ── Derived stats ──
  // Each row now represents one user/session — visit_count holds their total visits.
  const totalVisits    = (dateRange === "all" && allTimeCounts)
    ? allTimeCounts.totalRows
    : filtered.reduce((s, r) => s + (r.visit_count || 1), 0);
  const uniqueSessions = (dateRange === "all" && allTimeCounts)
    ? allTimeCounts.uniqueSessions
    : filtered.length; // one row per user/session now, so row count = unique visitors
  const uniqueUsers    = new Set(filtered.map(row => row.user_id).filter(Boolean)).size;
  const loggedInVisits = filtered.filter(row => row.user_id).reduce((s, r) => s + (r.visit_count || 1), 0);
  const anonVisits     = filtered.filter(row => !row.user_id).reduce((s, r) => s + (r.visit_count || 1), 0);

  // Page breakdown — weight by visit_count
  const pageCounts = filtered.reduce((acc, row) => {
    acc[row.page] = (acc[row.page] || 0) + (row.visit_count || 1); return acc;
  }, {});
  const pageRows = Object.entries(pageCounts).sort((aa, bb) => bb[1] - aa[1]);

  // Visits by day — use last_seen_at as the canonical timestamp
  const nowDate = new Date();
  const dayMap = {};
  filtered.forEach(row => {
    const ts = row.last_seen_at || row.created_at;
    const dayKey = ts?.slice(0, 10);
    if (dayKey) dayMap[dayKey] = (dayMap[dayKey] || 0) + (row.visit_count || 1);
  });
  const daysToShow = dateRange === "1d" ? 1 : dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 30;
  const dayBars = [];
  for (let offset = daysToShow - 1; offset >= 0; offset--) {
    const dayDate = new Date(nowDate);
    dayDate.setDate(nowDate.getDate() - offset);
    const dayKey = dayDate.toISOString().slice(0, 10);
    dayBars.push({ date: dayKey, label: dayDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), count: dayMap[dayKey] || 0 });
  }
  const maxDayCount = Math.max(...dayBars.map(db => db.count), 1);

  // Visits by hour — use last_seen_at
  const hourCounts = Array(24).fill(0);
  filtered.forEach(row => {
    const ts = row.last_seen_at || row.created_at;
    if (ts) hourCounts[new Date(ts).getHours()] += (row.visit_count || 1);
  });
  const maxHourCount = Math.max(...hourCounts, 1);

    // Country breakdown
  const countryCounts = filtered.reduce((acc, row) => {
    const ckey = row.country || "Unknown";
    acc[ckey] = (acc[ckey] || 0) + (row.visit_count || 1); return acc;
  }, {});
  const countryRows = Object.entries(countryCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 10)
    .map(([cc, cnt]) => ({ flag: cc !== "Unknown" ? cc : null, label: cc, count: cnt }));

  // City breakdown — store country code separately so we can flag it
  const cityCounts = filtered.reduce((acc, row) => {
    const ckey = row.city ? `${row.city}${row.country ? ", " + row.country : ""}` : "Unknown";
    if (!acc[ckey]) acc[ckey] = { count: 0, country: row.country || null };
    acc[ckey].count += (row.visit_count || 1); return acc;
  }, {});
  const cityRows = Object.entries(cityCounts).sort((aa, bb) => bb[1].count - aa[1].count).slice(0, 12)
    .map(([city, { count, country }]) => ({ flag: country || null, label: city, count }));

  // Logged-in user breakdown — each row IS one user, visit_count is their total
  const userVisitMap = {};
  filtered.filter(row => row.user_id).forEach(row => {
    const ts = row.last_seen_at || row.created_at;
    userVisitMap[row.user_id] = {
      name:     row.user_name || row.user_id,
      count:    row.visit_count || 1,
      pages:    { [row.page]: row.visit_count || 1 },
      last:     ts,
      lastPage: row.page,
    };
  });
  const userRows = Object.values(userVisitMap).sort((aa, bb) => bb.count - aa.count).slice(0, 20);

  // Recent feed — sorted by last_seen_at desc
  const recentRows = [...filtered].sort((a, b) => {
    const ta = a.last_seen_at || a.created_at || '';
    const tb = b.last_seen_at || b.created_at || '';
    return tb.localeCompare(ta);
  }).slice(0, 50);

  // Referrers
  const refCounts = filtered.reduce((acc, row) => {
    const refKey = row.referrer ? (row.referrer.replace(/^https?:\/\//, "").split("/")[0] || "Direct") : "Direct";
    acc[refKey] = (acc[refKey] || 0) + 1; return acc;
  }, {});
  const refRows = Object.entries(refCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 8);

  const PAGE_ICONS = { home:"⌂", events:"📅", shop:"🛒", gallery:"🖼", staff:"👥", leaderboard:"🏆", vip:"⭐", qa:"💬", contact:"✉", profile:"👤",
    "event:browsing":"📅", "event:basket":"🛒", "event:checkout":"💳",
    "shop:basket":"🛍", "shop:checkout":"💳" };
  const PAGE_LABELS = { "event:browsing":"Event — Browsing", "event:basket":"Event — Items in Basket", "event:checkout":"Event — At Checkout",
    "shop:basket":"Shop — Items in Basket", "shop:checkout":"Shop — At Checkout" };

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

  const barRow = (barLabel, barCount, barTotal, barColor = "#c8ff00", barFlag = "") => (
    <div key={barLabel} style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ display:"flex", alignItems:"center", gap:6 }}>
          {barFlag && <img src={`https://flagcdn.com/16x12/${barFlag.toLowerCase()}.png`} width="16" height="12" alt={barFlag} style={{ display:"inline-block", verticalAlign:"middle", borderRadius:1 }} />}
          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, color:"#b0c090", textTransform:"uppercase", letterSpacing:".04em" }}>{barLabel}</span>
        </span>
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
              {/* Live viewers card */}
              <div style={{ background:"#0a0f05", border:"1px solid #1a2808", padding:"18px 20px", position:"relative", overflow:"hidden" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background: liveCount > 0 ? "#c8ff00" : "#2a3a10",
                    boxShadow: liveCount > 0 ? "0 0 8px #c8ff00" : "none",
                    animation: liveCount > 0 ? "livePulse 1.5s ease-in-out infinite" : "none",
                    flexShrink:0, display:"inline-block" }} />
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010", textTransform:"uppercase" }}>Live Now</span>
                </div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:38, color:"#c8ff00", lineHeight:1 }}>
                  {liveCount === null ? "—" : liveCount}
                </div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", marginTop:4 }}>active in last 5 min</div>
                {liveNames.length > 0 && (
                  <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:3 }}>
                    {liveNames.slice(0, 5).map((s, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontFamily:"'Share Tech Mono',monospace", color:"#5a7a30" }}>
                        <span style={{ color: s.name ? "#c8ff00" : "#3a5010" }}>{s.name ? s.name : "anon"}</span>
                        <span style={{ color:"#2a3a10" }}>→</span>
                        <span style={{ textTransform:"uppercase", fontSize:10 }}>{PAGE_LABELS[s.page] || s.page}</span>
                      </div>
                    ))}
                    {liveNames.length > 5 && <div style={{ fontSize:10, color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace" }}>+{liveNames.length - 5} more</div>}
                  </div>
                )}
              </div>
              {statCard("Unique Visitors", uniqueSessions.toLocaleString(), "distinct sessions", "#c8ff00")}
              {statCard("Total Page Views", totalVisits.toLocaleString(), `across ${dateRange === "all" ? "all time" : dateRange}`, "#4fc3f7")}
              {statCard("Logged-In Visits", loggedInVisits.toLocaleString(), `${uniqueUsers} unique members`, "#c8a000")}
              {statCard("Anonymous Views",  anonVisits.toLocaleString(), `${totalVisits > 0 ? Math.round(anonVisits / filtered.length * 100) : 0}% of page views`, "#6a8050")}
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
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))", gap:16 }}>
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
          <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"#0c1009", border:"1px solid #1a2808", minWidth:340 }}>
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
          </div>
        )}

        {/* ── LOCATIONS ── */}
        {activeTab === "locations" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))", gap:16 }}>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>BY COUNTRY</div>
              {countryRows.map(r => barRow(r.label, r.count, totalVisits, "#c8ff00", r.flag))}
              {countryRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No location data yet — geo lookup fires on each new visit.</div>}
            </div>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>BY CITY</div>
              {cityRows.map(r => barRow(r.label, r.count, totalVisits, "#ce93d8", r.flag))}
              {cityRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No location data yet.</div>}
            </div>
            <UKVisitorMap visitData={filtered} />
          </div>
        )}

        {/* ── USERS ── */}
        {activeTab === "users" && (
          <div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>
              {uniqueUsers} UNIQUE LOGGED-IN USERS · {loggedInVisits} VISITS
            </div>
            <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", minWidth:480 }}>
              <div style={{ borderBottom:"1px solid #1a2808", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 2fr 2fr", gap:8 }}>
                {["USER","VISITS","LAST PAGE","LAST SEEN"].map(colHead => (
                  <div key={colHead} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010" }}>{colHead}</div>
                ))}
              </div>
              {userRows.map((userRow, userIdx) => {
                const lastPage = userRow.lastPage || "—";
                return (
                  <div key={userIdx} style={{ borderBottom:"1px solid #0f1a08", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 2fr 2fr", gap:8, alignItems:"center" }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, fontWeight:700, color:"#b0c090" }}>{userRow.name}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:900, color:"#c8ff00" }}>{userRow.count}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, color:"#3a5010", textTransform:"uppercase" }}>{PAGE_ICONS[lastPage] || "▸"} {lastPage}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010" }}>{new Date(userRow.last).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}</div>
                  </div>
                );
              })}
              {userRows.length === 0 && <div style={{ padding:40, textAlign:"center", color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>NO LOGGED-IN VISITS IN RANGE</div>}
            </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Admin Revenue ─────────────────────────────────────────

export { AdminVisitorStats };
