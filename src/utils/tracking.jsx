// utils/tracking.jsx — parcel tracking constants, fetch helpers, UI components
import React, { useState, useEffect } from "react";

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
    const { supabase } = await import('../supabaseClient');
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
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(200,255,0,.1)", border: "1px solid rgba(200,255,0,.35)", color: "#c8ff00", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: ".18em", padding: adminMode ? "6px 12px" : "8px 16px", textDecoration: "none", whiteSpace: "nowrap" }}
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
            <span style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: ".1em", color: statusColor, textTransform: "uppercase" }}>
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

export {
  TRACKING_CACHE_KEY, TRACKING_TTL_MS, TRACKING_TTL_SHORT_MS,
  TM_STATUS_MAP, TM_CARRIER_MAP,
  getTrackingKey, fetchTrackingStatus,
  detectCourier,
  AdminTrackStatusCell, AdminTrackBadge, TrackingBlock,
};
