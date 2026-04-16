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
import { AdminPanel, AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage } from "../index";

// ── Loadout field config ──────────────────────────────────────
const LOADOUT_WEAPON_FIELDS = [
  { key: "Name",     field: "name",     placeholder: "e.g. Tokyo Marui M4A1" },
  { key: "FPS",      field: "fps",      placeholder: "e.g. 350 FPS" },
  { key: "Mags",     field: "mags",     placeholder: "e.g. 5× mid-cap 120rnd" },
  { key: "Upgrades", field: "upgrades", placeholder: "e.g. Prometheus hop rubber, SHS motor" },
];
const LOADOUT_GEAR_FIELDS = [
  { key: "Helmet",      field: "helmet",     placeholder: "e.g. Ops-Core FAST Carbon" },
  { key: "Vest / Rig",  field: "vest",       placeholder: "e.g. Crye JPC 2.0" },
  { key: "Camo",        field: "camo",       placeholder: "e.g. Multicam / MTP" },
  { key: "Eye Pro",     field: "eyepro",     placeholder: "e.g. Revision Sawfly" },
  { key: "Comms",       field: "comms",      placeholder: "e.g. Baofeng UV-5R + Peltor" },
  { key: "Boots",       field: "boots",      placeholder: "e.g. Haix Black Eagle" },
  { key: "Other Gear",  field: "other_gear", placeholder: "Knee pads, gloves, chest rig extras…" },
];

export default function LoadoutTab({ cu, showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publicProfile, setPublicProfile] = useState(cu.publicProfile ?? false);
  const [bio, setBio] = useState(cu.bio || "");
  const defaultLoadout = {
    primary_name: "", primary_fps: "", primary_mags: "", primary_upgrades: "",
    secondary_name: "", secondary_fps: "", secondary_mags: "", secondary_upgrades: "",
    support_name: "", support_fps: "", support_mags: "", support_upgrades: "",
    helmet: "", vest: "", camo: "", eyepro: "", comms: "", boots: "", other_gear: "",
    notes: "",
  };
  const [draft, setDraft] = useState(defaultLoadout);
  const isMounted = useRef(true);

  const loadLoadout = useCallback(async () => {
    if (!cu?.id || !isMounted.current) return;
    setLoading(true);
    try {
      const data = await api.loadouts.getMyLoadout(cu.id);
      if (isMounted.current && data) setDraft(prev => ({ ...prev, ...data }));
    } catch (e) { console.warn("Loadout fetch:", e.message); }
    finally { if (isMounted.current) setLoading(false); }
  }, [cu?.id]);

  useEffect(() => {
    isMounted.current = true;
    loadLoadout();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) loadLoadout(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [loadLoadout]);

  const set = (field, val) => setDraft(p => ({ ...p, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.loadouts.save(cu.id, draft);
      const { error } = await supabase.from("profiles").update({ public_profile: publicProfile, bio }).eq("id", cu.id);
      if (error) throw error;
      showToast("Loadout saved!");
    } catch (e) {
      showToast("Save failed: " + (e.message || "unknown error"), "red");
    } finally { setSaving(false); }
  };

  const profileUrl = `${window.location.origin}${window.location.pathname}#player/${cu.id}`;

  if (loading) return (
    <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading loadout…</div>
  );

  return (
    <div className="card">
      <div style={{ background: "rgba(200,255,0,.06)", border: "1px solid rgba(200,255,0,.2)", padding: "14px 16px", marginBottom: 24, borderRadius: 4, display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".12em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 4 }}>🌐 Public Profile</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>When enabled, anyone can view your callsign, profile picture, games attended, and loadout via a shareable link. Personal details are never shown.</div>
          {publicProfile && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontFamily: "'Share Tech Mono',monospace", color: "var(--accent)", background: "rgba(200,255,0,.08)", padding: "4px 10px", border: "1px solid rgba(200,255,0,.2)", borderRadius: 2 }}>{profileUrl}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(profileUrl); showToast("Link copied!"); }}>Copy Link</button>
            </div>
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0, marginTop: 4 }}>
          <div style={{ width: 44, height: 24, borderRadius: 12, background: publicProfile ? "var(--accent)" : "var(--bg4)", border: `1px solid ${publicProfile ? "var(--accent)" : "var(--border)"}`, position: "relative", transition: "background .2s", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: publicProfile ? "#000" : "#888", position: "absolute", top: 2, left: publicProfile ? 22 : 2, transition: "left .2s" }} />
          </div>
          <input type="checkbox" checked={publicProfile} onChange={e => setPublicProfile(e.target.checked)} style={{ display: "none" }} />
          <span style={{ fontSize: 12, color: publicProfile ? "var(--accent)" : "var(--muted)", fontWeight: 700, letterSpacing: ".08em", fontFamily: "'Barlow Condensed',sans-serif" }}>{publicProfile ? "PROFILE PUBLIC" : "PROFILE PRIVATE"}</span>
        </label>
      </div>

      <div className="form-group" style={{ marginBottom: 24 }}>
        <label>Player Bio <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(shown on your public profile)</span></label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the community about your play style, team, or experience…" maxLength={300} rows={3} style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{bio.length}/300</div>
      </div>

      {[
        { label: "Primary Weapon",              prefix: "primary" },
        { label: "Secondary Weapon",            prefix: "secondary" },
        { label: "Support / Special (optional)",prefix: "support" },
      ].map(({ label, prefix }) => (
        <div key={prefix} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".14em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>🔫 {label}</div>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "12px 14px", borderRadius: 2 }}>
            {LOADOUT_WEAPON_FIELDS.map(({ key, field, placeholder }) => (
              <div className="form-group" key={field} style={{ marginBottom: 10 }}>
                <label style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 11 }}>{key}</label>
                <input value={draft[`${prefix}_${field}`] || ""} onChange={e => set(`${prefix}_${field}`, e.target.value)} placeholder={placeholder} maxLength={120} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".14em", color: "var(--accent)", textTransform: "uppercase", marginBottom: 10 }}>🪖 Kit &amp; Gear</div>
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "12px 14px", borderRadius: 2 }}>
          {LOADOUT_GEAR_FIELDS.map(({ key, field, placeholder }) => (
            <div className="form-group" key={field} style={{ marginBottom: 10 }}>
              <label style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 11 }}>{key}</label>
              <input value={draft[field] || ""} onChange={e => set(field, e.target.value)} placeholder={placeholder} maxLength={120} />
            </div>
          ))}
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 24 }}>
        <label>Loadout Notes <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(role, play style, etc.)</span></label>
        <textarea value={draft.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="e.g. Run-and-gun CQB player, medic role, prefer night ops…" maxLength={400} rows={3} style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Loadout"}</button>
    </div>
  );
}

