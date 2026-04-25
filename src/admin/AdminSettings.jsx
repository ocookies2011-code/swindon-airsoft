// admin/AdminSettings.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtErr, resetSquareConfig, trackKeyCache } from "../utils";
import { logAction } from "./adminHelpers";
import { EmailTestCard } from "./EmailTestCard";

function AdminSettings({ showToast, cu }) {
  const S = (key, def = "") => {
    const [val, setVal] = useState(def);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      api.settings.get(key).then(v => { if (v) setVal(v); setLoaded(true); }).catch(() => setLoaded(true));
    }, []);
    return [val, setVal, loaded];
  };

  const [squareAppId, setSquareAppId] = S("square_app_id");
  const [trackApiKey, setTrackApiKey] = S("trackingmore_api_key");
  React.useEffect(() => { if (trackApiKey) trackKeyCache.value = trackApiKey; }, [trackApiKey]);
  const [savingTrack, setSavingTrack] = useState(false);
  const [squareLocationId, setSquareLocationId] = S("square_location_id");
  const [squareEnv, setSquareEnv, sqLoaded] = S("square_env", "sandbox");
  const [squareTerminalDeviceId, setSquareTerminalDeviceId] = S("square_terminal_device_id");
  const [savingSQ, setSavingSQ] = useState(false);
  const [showAppId, setShowAppId] = useState(false);

  // Shop closed toggle
  const [shopClosedSetting, setShopClosedSetting] = useState(false);
  const [savingShopClosed, setSavingShopClosed] = useState(false);
  React.useEffect(() => {
    api.settings.get("shop_closed").then(v => setShopClosedSetting(v === "true")).catch(() => {});
  }, []);

  const saveSquare = async () => {
    setSavingSQ(true);
    try {
      await api.settings.set("square_app_id", squareAppId.trim());
      await api.settings.set("square_location_id", squareLocationId.trim());
      await api.settings.set("square_env", squareEnv);
      await api.settings.set("square_terminal_device_id", squareTerminalDeviceId.trim());
      // Access token is stored in Supabase Edge Function secrets, not the DB
      resetSquareConfig();
      showToast("✅ Square settings saved! Changes take effect on next checkout.");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Square settings saved", detail: `env: ${squareEnv}` });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingSQ(false); }
  };

  const [openSections, setOpenSections] = React.useState({});
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const sectionHead = (label, key) => {
    const isOpen = openSections[key] === true; // default collapsed
    return (
      <div
        onClick={() => toggleSection(key)}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", userSelect:"none", fontWeight:700, fontSize:14, color:"var(--accent)", fontFamily:"'Oswald','Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase", marginBottom: isOpen ? 14 : 0 }}
      >
        <span>{label}</span>
        <span style={{ fontSize:16, color:"var(--muted)", transition:"transform .2s", display:"inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </div>
    );
  };

  const sectionBody = (key, children) => {
    const isOpen = openSections[key] === true;
    return isOpen ? <div style={{ marginTop: 14 }}>{children}</div> : null;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Payment configuration and API keys</div>
        </div>
      </div>

      {/* Shop Closed Toggle */}
      <div className="card mb-2">
        {sectionHead("🛒 Shop Status", "shop")}
        {sectionBody("shop", <>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:13, color:"var(--text)", marginBottom:4 }}>
              {shopClosedSetting
                ? <span style={{ color:"var(--red)", fontWeight:700 }}>⛔ Shop is currently CLOSED</span>
                : <span style={{ color:"var(--accent)", fontWeight:700 }}>✅ Shop is currently OPEN</span>}
            </div>
            <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.6 }}>
              When closed, the shop page shows a redirect to Airsoft Armoury UK with the <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 4px" }}>COLLECTION</code> code for game day pickup.
            </div>
          </div>
          <button
            className={shopClosedSetting ? "btn btn-primary" : "btn btn-ghost"}
            style={{ minWidth:160, borderColor: shopClosedSetting ? "var(--red)" : "var(--accent)", color: shopClosedSetting ? "var(--red)" : "var(--accent)" }}
            disabled={savingShopClosed}
            onClick={async () => {
              setSavingShopClosed(true);
              try {
                const next = !shopClosedSetting;
                await api.settings.set("shop_closed", String(next));
                setShopClosedSetting(next);
                showToast(next ? "🔒 Shop closed — customers will see the Airsoft Armoury UK redirect." : "✅ Shop is now open.");
                logAction({ adminEmail: cu?.email, adminName: cu?.name, action: next ? "Shop closed" : "Shop opened", detail: null });
              } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
              finally { setSavingShopClosed(false); }
            }}>
            {savingShopClosed ? "Saving…" : shopClosedSetting ? "🔓 Reopen Shop" : "🔒 Close Shop"}
          </button>
        </div>
        </>)}
      </div>

      {/* Square */}
      <div className="card mb-2">
        {sectionHead("💳 Square Payments", "square")}
        {sectionBody("square", <>

        <div className="form-group">
          <label>Environment</label>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {["sandbox", "production"].map(m => (
              <button key={m} onClick={() => setSquareEnv(m)}
                style={{
                  padding: "8px 22px", borderRadius: 4, border: "1px solid",
                  fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer",
                  background: squareEnv === m ? (m === "production" ? "var(--accent)" : "#2d7a2d") : "var(--card)",
                  color: squareEnv === m ? "#000" : "var(--muted)",
                  borderColor: squareEnv === m ? (m === "production" ? "var(--accent)" : "#2d7a2d") : "var(--border)",
                }}>
                {m === "production" ? "🟠 Production" : "🟢 Sandbox / Test"}
              </button>
            ))}
          </div>
          {squareEnv === "production"
            ? <div className="alert alert-red mt-2" style={{ fontSize: 12 }}>⚠️ PRODUCTION mode — real payments will be charged to customers.</div>
            : <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>Sandbox mode — test payments only, no real money taken.</div>
          }
        </div>

        <div className="form-group">
          <label>Application ID {squareEnv === "production" ? "(Production)" : "(Sandbox)"}</label>
          <div style={{ position: "relative" }}>
            <input
              type={showAppId ? "text" : "password"}
              value={squareAppId}
              onChange={e => setSquareAppId(e.target.value)}
              placeholder={squareEnv === "production" ? "sq0idp-... (Production Application ID)" : "sandbox-sq0idb-... (Sandbox Application ID)"}
              style={{ paddingRight: 80 }}
            />
            <button onClick={() => setShowAppId(v => !v)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>
              {showAppId ? "Hide" : "Show"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            Found in your <a href="https://developer.squareup.com/apps" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Square Developer Dashboard</a> under your application's Credentials tab.
          </div>
        </div>

        <div className="form-group">
          <label>Location ID</label>
          <input
            value={squareLocationId}
            onChange={e => setSquareLocationId(e.target.value)}
            placeholder="L... (from Square Dashboard → Locations)"
          />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
            Found in Square Dashboard → <strong style={{ color: "var(--text)" }}>Locations</strong>. Each business location has a unique ID.
          </div>
        </div>

        <div className="form-group">
          <label>Terminal Device ID <span style={{ color:"var(--muted)", fontSize:11, fontWeight:400 }}>— for Cash Sales terminal payments</span></label>
          <input
            value={squareTerminalDeviceId}
            onChange={e => setSquareTerminalDeviceId(e.target.value)}
            placeholder="device:... (from Square Dashboard → Devices)"
          />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.7 }}>
            Found in <a href="https://squareup.com/dashboard/devices" target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>Square Dashboard → Devices</a>.
            Click your Terminal → copy the <strong style={{ color:"var(--text)" }}>Device ID</strong> (starts with <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 4px", borderRadius:2 }}>device:</code>).
            Leave blank to hide the terminal option in Cash Sales.
          </div>
        </div>

        <div className="form-group">
          <label>Access Token <span style={{ color: "var(--red)", fontSize: 10 }}>Required for refunds</span></label>
          <div className="alert alert-green" style={{ fontSize: 12, lineHeight: 1.8 }}>
            🔒 <strong>Your Access Token is stored securely.</strong><br/>
            It lives in your Supabase Edge Function secrets — not in the database — so it is never exposed to the browser.<br/>
            <span style={{ color: "var(--muted)" }}>To update it: Supabase Dashboard → Edge Functions → square-payment → Secrets → <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 4px", borderRadius:2 }}>SQUARE_ACCESS_TOKEN</code></span>
          </div>
        </div>

        <button className="btn btn-primary" onClick={saveSquare} disabled={savingSQ || !sqLoaded}>
          {savingSQ ? "Saving..." : "Save Square Settings"}
        </button>

        {squareEnv === "production" && squareAppId && squareLocationId && (
          <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>
            ✅ Production Square is configured. Customers will see the card payment form at checkout.
          </div>
        )}
        {squareEnv === "production" && (!squareAppId || !squareLocationId) && (
          <div className="alert alert-red mt-2" style={{ fontSize: 12 }}>
            ⚠️ Environment is Production but Application ID or Location ID is missing — checkouts will show an error.
          </div>
        )}
        </>)}
      </div>

      {/* How to get Square keys guide */}
      <div className="card mb-2" style={{ background: "#0a140a", border: "1px solid #1a2e1a" }}>
        {sectionHead("📋 Square Setup Guide", "squareguide")}
        {sectionBody("squareguide", <>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 2 }}>
          <div>1. Go to <a href="https://developer.squareup.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>developer.squareup.com</a> and log in with your Square account.</div>
          <div>2. Create an application (or open an existing one) → go to <strong style={{ color: "var(--text)" }}>Credentials</strong>.</div>
          <div>3. Switch to the <strong style={{ color: "var(--text)" }}>Production</strong> tab → copy your <strong style={{ color: "var(--text)" }}>Application ID</strong> and <strong style={{ color: "var(--text)" }}>Access Token</strong>.</div>
          <div>4. Go to your <a href="https://squareup.com/dashboard/locations" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Square Dashboard → Locations</a> → copy your <strong style={{ color: "var(--text)" }}>Location ID</strong>.</div>
          <div>5. Paste all three above, set Environment to <strong style={{ color: "var(--accent)" }}>Production</strong>, and click Save.</div>
          <div>6. Deploy the <strong style={{ color: "var(--text)" }}>square-payment</strong> Supabase Edge Function (see README) to handle server-side payment creation and refunds.</div>
        </div>
        </>)}
      </div>

      {/* TrackingMore */}
      <div className="card mb-2">
        {sectionHead("📦 Parcel Tracking (TrackingMore)", "tracking")}
        {sectionBody("tracking", <>
        <div className="form-group">
          <label>TrackingMore API Key</label>
          <div style={{ position: "relative" }}>
            <input
              type="password"
              value={trackApiKey}
              onChange={e => { setTrackApiKey(e.target.value); trackKeyCache.value = undefined; }}
              placeholder="Paste your TrackingMore API key here"
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            Get a free key at <a href="https://www.trackingmore.com/api" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>trackingmore.com/api</a> — the free tier gives 500 tracking requests/month and covers Royal Mail, DPD, Evri, Parcelforce, UPS, FedEx and more. Once saved, the STATUS column in Orders will show live courier statuses (In Transit, Delivered, etc.).
          </div>
        </div>
        <button className="btn btn-primary" disabled={savingTrack} onClick={async () => {
          setSavingTrack(true);
          try {
            await api.settings.set("trackingmore_api_key", trackApiKey.trim());
            trackKeyCache.value = undefined;
            showToast("✅ TrackingMore API key saved!");
            logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "TrackingMore API key saved", detail: null });
          } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
          finally { setSavingTrack(false); }
        }}>
          {savingTrack ? "Saving…" : "Save Tracking Key"}
        </button>
        {trackApiKey && (
          <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>
            ✅ API key is set. Live tracking will show courier statuses in the Orders table.
          </div>
        )}
        {!trackApiKey && (
          <div className="alert mt-2" style={{ fontSize: 12, background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.15)", color: "var(--muted)" }}>
            No key set — tracking status will not be available. Add a free TrackingMore key above to enable it.
          </div>
        )}
        </>)}
      </div>

      {/* EmailJS test */}
      <EmailTestCard showToast={showToast} sectionHead={sectionHead} />

      {/* Push Notifications */}
      <div className="card mb-2">
        {sectionHead("🔔 Push Notifications", "push")}
        {sectionBody("push", <PushNotificationPanel showToast={showToast} />)}
      </div>
    </div>
  );
}

function PushNotificationPanel({ showToast }) {
  const [title, setTitle]     = React.useState("Swindon Airsoft");
  const [message, setMessage] = React.useState("");
  const [url, setUrl]         = React.useState("/");
  const [sending, setSending] = React.useState(false);
  const [subCount, setSubCount] = React.useState(null);
  const { supabase: sb } = { supabase: null }; // fallback

  React.useEffect(() => {
    import("../supabaseClient").then(({ supabase }) => {
      supabase.from("push_subscriptions").select("id", { count:"exact", head:true })
        .then(({ count }) => setSubCount(count || 0));
    });
  }, []);

  const send = async () => {
    if (!message.trim()) { showToast("Message is required", "red"); return; }
    setSending(true);
    try {
      const { supabase } = await import("../supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
          },
          body: JSON.stringify({ title, message, url }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      showToast(`✓ Sent to ${data.sent} of ${data.total} subscribers`, "green");
      setMessage("");
    } catch (e) {
      showToast("Send failed: " + e.message, "red");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:12, color:"var(--muted)" }}>
        {subCount === null ? "Counting subscribers…" : `${subCount} player${subCount !== 1 ? "s" : ""} currently subscribed`}
      </div>
      <div>
        <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:4 }}>TITLE</label>
        <input className="inp" value={title} onChange={e => setTitle(e.target.value)} placeholder="Swindon Airsoft" />
      </div>
      <div>
        <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:4 }}>MESSAGE *</label>
        <textarea className="inp" rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="New game day announced! Book your slot now." style={{ resize:"vertical" }} />
      </div>
      <div>
        <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:4 }}>LINK — where View takes the player</label>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
          {[["Home","/"],["Events","/#events"],["Shop","/#shop"],["News","/#news"],["VIP","/#vip"]].map(([label, val]) => (
            <button key={label} className="btn btn-ghost btn-sm" style={{ fontSize:10, padding:"3px 10px", background: url===val ? "rgba(200,255,0,.15)" : undefined, borderColor: url===val ? "var(--accent)" : undefined }} onClick={() => setUrl(val)}>{label}</button>
          ))}
        </div>
        <input className="inp" value={url} onChange={e => setUrl(e.target.value)} placeholder="/" />
      </div>
      <div style={{ fontSize:11, color:"var(--muted)", background:"rgba(200,255,0,.04)", border:"1px solid rgba(200,255,0,.1)", padding:"8px 12px" }}>
        💡 Tip: Set the message before sending. Players see the notification even with the browser closed.
      </div>
      <button className="btn btn-primary" onClick={send} disabled={sending || !message.trim()}>
        {sending ? "Sending…" : `🔔 Send to ${subCount ?? "all"} subscribers`}
      </button>
    </div>
  );
}


// ── Admin Messages ────────────────────────────────────────
const PRESET_ICONS = ["⚡","🎯","⚠️","🔥","📢","✅","❗","🎮","🏆","🛡️","💥","📅"];
const PRESET_COMBOS = [
  { label:"Lime / Black",   color:"#c8ff00", bg:"#080a06" },
  { label:"White / Dark",   color:"#ffffff", bg:"#111418" },
  { label:"Amber / Black",  color:"#ffb300", bg:"#100900" },
  { label:"Red / Dark",     color:"#ff4444", bg:"#120808" },
  { label:"Cyan / Dark",    color:"#4fc3f7", bg:"#060e12" },
  { label:"Green / Black",  color:"#4caf50", bg:"#070d07" },
  { label:"Purple / Dark",  color:"#ce93d8", bg:"#0d080f" },
  { label:"Orange / Black", color:"#ff7043", bg:"#0f0800" },
];
const emptyBanner = () => ({ text:"", color:"#c8ff00", bg:"#080a06", icon:"⚡" });


export { AdminSettings };
