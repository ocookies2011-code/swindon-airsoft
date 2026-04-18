// pages/PublicProfilePage.jsx — public player profile view
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { RankInsignia, DesignationInsignia, useMobile, fmtDate } from "../utils";

function PublicProfilePage({ userId, prevPage, setPage }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const isMounted = useRef(true);

  const loadProfile = useCallback(async () => {
    if (!isMounted.current) return;
    if (!userId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.loadouts.getPublic(userId);
      if (!isMounted.current) return;
      if (!data) setNotFound(true);
      else setProfile(data);
    } catch { if (isMounted.current) setNotFound(true); }
    finally { if (isMounted.current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    isMounted.current = true;
    loadProfile();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current && !profile) loadProfile(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [loadProfile]);

  if (loading) return (
    <div style={{ background: "#080a06", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, letterSpacing: ".25em", color: "#2a3a10" }}>RETRIEVING OPERATIVE FILE…</div>
    </div>
  );
  if (notFound) return (
    <div style={{ background: "#080a06", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, letterSpacing: ".15em", color: "#c8ff00" }}>FILE NOT FOUND</div>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#3a5010" }}>OPERATIVE HAS NOT ENABLED PUBLIC PROFILE</div>
      <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setPage(prevPage || "leaderboard")}>← BACK</button>
    </div>
  );

  const games       = profile.games_attended || 0;
  const customRank  = profile.custom_rank || null;
  const designation = profile.designation || null;
  const autoRank    = games === 0 ? "CIVILIAN" : games < 3 ? "PRIVATE" : games < 6 ? "RECRUIT" : games < 10 ? "OPERATIVE" : games < 20 ? "SENIOR OPERATIVE" : "FIELD COMMANDER";
  const rankTitle   = customRank || autoRank;
  const hasWeapons  = profile.primary_name || profile.secondary_name || profile.support_name;
  const hasGear     = ["helmet","vest","camo","eyepro","comms","boots","other_gear"].some(f => profile[f]);

  const SectionHeader = ({ label }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", textTransform: "uppercase" }}>▸ {label}</div>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,#1e2c0a,transparent)" }} />
    </div>
  );

  const GunCard = ({ title, name, fps, mags, upgrades }) => {
    if (!name) return null;
    return (
      <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "12px 14px", marginBottom: 8 }}>
        <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: ".2em", color: "#c8ff00", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
        {[["MODEL", name], ["FPS", fps], ["MAGS", mags], ["UPGRADES", upgrades]].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid #1a2808", fontSize: 12 }}>
            <span style={{ color: "#3a5010", minWidth: 72, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", fontFamily: "'Share Tech Mono',monospace", paddingTop: 1, flexShrink: 0 }}>{k}</span>
            <span style={{ color: "#b0c090", fontFamily: "'Share Tech Mono',monospace", fontSize: 11 }}>{v}</span>
          </div>
        ))}
      </div>
    );
  };

  const GearRow = ({ label, value }) => {
    if (!value) return null;
    return (
      <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid #1a2808", fontSize: 12 }}>
        <span style={{ color: "#3a5010", minWidth: 96, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", fontFamily: "'Share Tech Mono',monospace", paddingTop: 1, flexShrink: 0 }}>{label.toUpperCase()}</span>
        <span style={{ color: "#b0c090", fontFamily: "'Share Tech Mono',monospace", fontSize: 11 }}>{value}</span>
      </div>
    );
  };

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "40px 24px 36px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 24, height: 24,
            top: v==="top" ? 12 : "auto", bottom: v==="bottom" ? 12 : "auto",
            left: h==="left" ? 12 : "auto", right: h==="right" ? 12 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <button onClick={() => setPage(prevPage || "leaderboard")} style={{ background: "none", border: "1px solid #2a3a10", color: "#3a5010", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 11, letterSpacing: ".15em", padding: "4px 12px", cursor: "pointer", marginBottom: 20 }}>← BACK</button>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            {/* Avatar */}
            <div style={{ width: 88, height: 88, border: "2px solid #c8ff00", overflow: "hidden", background: "#0a0c08", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "#c8ff00", fontFamily: "'Oswald','Barlow Condensed',sans-serif", flexShrink: 0, position: "relative" }}>
              {profile.profile_pic
                ? <img src={profile.profile_pic} alt="" onError={e => { e.target.style.display="none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.05) saturate(0.8)" }} />
                : (profile.callsign || "?")[0].toUpperCase()}
              {profile.can_marshal && (
                <div style={{ position: "absolute", bottom: 0, right: 0, background: "#c8ff00", color: "#000", fontSize: 7, fontWeight: 900, fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".08em", padding: "2px 4px" }}>MSHL</div>
              )}
            </div>
            {/* Name block */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".25em", color: "#3a5010", marginBottom: 4 }}>OPERATIVE FILE // SWINDON AIRSOFT</div>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(22px,5vw,38px)", letterSpacing: ".1em", color: "#e8f0d8", textTransform: "uppercase", lineHeight: 1, marginBottom: 4 }}>
                {profile.callsign || "OPERATIVE"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {profile.vip_status === "active" && (
                  <span style={{ background: "rgba(200,160,0,.15)", border: "1px solid rgba(200,160,0,.4)", color: "#c8a000", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: ".15em", padding: "2px 8px" }}>★ VIP OPERATIVE</span>
                )}
                {profile.can_marshal && (
                  <span style={{ background: "rgba(200,255,0,.12)", border: "1px solid rgba(200,255,0,.4)", color: "#c8ff00", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: ".15em", padding: "2px 8px" }}>🎖 MARSHAL</span>
                )}
                {designation && (() => {
                  const DESIG_ICONS = { "GHOST":"👻","SNIPER":"🎯","MEDIC":"🩹","DEMOLITIONS":"💥","RECON":"🔭","HEAVY GUNNER":"🔫","SUPPORT":"🛡","SQUAD LEADER":"⚔️","VETERAN":"🎖","LEGEND":"🏆" };
                  return <span style={{ background: "rgba(79,195,247,.1)", border: "1px solid rgba(79,195,247,.4)", color: "#4fc3f7", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: ".15em", padding: "2px 8px" }}>{DESIG_ICONS[designation] || "◆"} {designation}</span>;
                })()}
                {profile.join_date && (
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".1em" }}>ENLISTED {new Date(profile.join_date).getFullYear()}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 80px" }}>

        {/* Field Stats grid */}
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Field Stats" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>

            {/* Deployments */}
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>DEPLOYMENTS</div>
              <svg width={48} height={48} viewBox="0 0 48 48">
                <rect width={48} height={48} fill="#080a06" rx={3}/>
                {/* Map with pin */}
                <path d="M10,14 L22,10 L26,14 L38,10 L38,34 L26,38 L22,34 L10,38 Z" fill="none" stroke="#1e3008" strokeWidth="1.5"/>
                <path d="M10,14 L22,10 L22,34 L10,38 Z" fill="rgba(200,255,0,.04)" stroke="#1e3008" strokeWidth="1"/>
                <path d="M26,14 L38,10 L38,34 L26,38 Z" fill="rgba(200,255,0,.04)" stroke="#1e3008" strokeWidth="1"/>
                <circle cx={24} cy={20} r={5} fill="none" stroke="#c8ff00" strokeWidth="1.8"/>
                <circle cx={24} cy={20} r={1.5} fill="#c8ff00"/>
                <path d="M24,25 Q18,30 18,35" fill="none" stroke="#c8ff00" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M24,25 Q30,30 30,35" fill="none" stroke="#c8ff00" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 36, color: "#c8ff00", lineHeight: 1 }}>{games}</div>
            </div>

            {/* Rank */}
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>RANK</div>
              <RankInsignia rank={rankTitle} size={48}/>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, color: "#c8ff00", lineHeight: 1.1, letterSpacing: ".06em" }}>{rankTitle}</div>
            </div>

            {/* Designation — only if set */}
            {designation && (
              <div style={{ background: "#0c1009", border: "1px solid rgba(79,195,247,.25)", padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#1a3a4a" }}>DESIGNATION</div>
                <DesignationInsignia desig={designation} size={48}/>
                <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, color: "#4fc3f7", lineHeight: 1.1, letterSpacing: ".06em" }}>{designation}</div>
              </div>
            )}

            {/* VIP Status */}
            <div style={{ background: "#0c1009", border: `1px solid ${profile.vip_status === "active" ? "rgba(200,160,0,.35)" : "#1a2808"}`, padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>VIP STATUS</div>
              <svg width={48} height={48} viewBox="0 0 48 48">
                <rect width={48} height={48} fill="#080a06" rx={3}/>
                {profile.vip_status === "active" ? (
                  <g>
                    {/* Star */}
                    <polygon points="24,8 27.5,18 38,18 29.5,24.5 32.5,35 24,28.5 15.5,35 18.5,24.5 10,18 20.5,18" fill="rgba(200,160,0,.2)" stroke="#c8a000" strokeWidth="1.8" strokeLinejoin="round"/>
                    {/* Shine lines */}
                    <line x1="24" y1="4" x2="24" y2="7" stroke="#c8a000" strokeWidth="1.5"/>
                    <line x1="38" y1="14" x2="35.5" y2="16" stroke="#c8a000" strokeWidth="1.5"/>
                    <line x1="10" y1="14" x2="12.5" y2="16" stroke="#c8a000" strokeWidth="1.5"/>
                  </g>
                ) : (
                  <g>
                    {/* Empty star outline, dimmed */}
                    <polygon points="24,8 27.5,18 38,18 29.5,24.5 32.5,35 24,28.5 15.5,35 18.5,24.5 10,18 20.5,18" fill="none" stroke="#1e3008" strokeWidth="1.5" strokeLinejoin="round"/>
                    <line x1="16" y1="16" x2="32" y2="32" stroke="#1e3008" strokeWidth="1.5" strokeLinecap="round"/>
                  </g>
                )}
              </svg>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: profile.vip_status === "active" ? "#c8a000" : "#2a3a10", lineHeight: 1, letterSpacing: ".06em" }}>
                {profile.vip_status === "active" ? "ACTIVE" : profile.vip_status === "expired" ? "EXPIRED" : "STANDARD"}
              </div>
            </div>

            {/* Marshal */}
            <div style={{ background: "#0c1009", border: `1px solid ${profile.can_marshal ? "rgba(200,255,0,.25)" : "#1a2808"}`, padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: ".2em", color: "#2a3a10" }}>MARSHAL</div>
              <svg width={48} height={48} viewBox="0 0 48 48">
                <rect width={48} height={48} fill="#080a06" rx={3}/>
                {profile.can_marshal ? (
                  <g fill="none" stroke="#c8ff00" strokeWidth="1.8">
                    {/* Shield */}
                    <path d="M24,6 L36,11 L36,24 Q36,34 24,42 Q12,34 12,24 L12,11 Z" fill="rgba(200,255,0,.07)" stroke="#c8ff00" strokeWidth="1.8" strokeLinejoin="round"/>
                    {/* Tick inside */}
                    <polyline points="17,24 22,29 31,19" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2"/>
                  </g>
                ) : (
                  <g fill="none" stroke="#1e3008" strokeWidth="1.8">
                    <path d="M24,6 L36,11 L36,24 Q36,34 24,42 Q12,34 12,24 L12,11 Z" strokeLinejoin="round"/>
                    <line x1="19" y1="19" x2="29" y2="29" strokeLinecap="round"/>
                    <line x1="29" y1="19" x2="19" y2="29" strokeLinecap="round"/>
                  </g>
                )}
              </svg>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: profile.can_marshal ? "#c8ff00" : "#2a3a10", lineHeight: 1, letterSpacing: ".06em" }}>
                {profile.can_marshal ? "QUALIFIED" : "NOT QUALIFIED"}
              </div>
            </div>

          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Operative Brief" />
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 16px" }}>
              <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#6a8a40", lineHeight: 1.7, margin: 0 }}>{profile.bio}</p>
            </div>
          </div>
        )}

        {/* Weapons */}
        {hasWeapons && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Weapons Loadout" />
            <GunCard title="PRIMARY WEAPON"    name={profile.primary_name}   fps={profile.primary_fps}   mags={profile.primary_mags}   upgrades={profile.primary_upgrades} />
            <GunCard title="SECONDARY WEAPON"  name={profile.secondary_name} fps={profile.secondary_fps} mags={profile.secondary_mags} upgrades={profile.secondary_upgrades} />
            <GunCard title="SUPPORT / SPECIAL" name={profile.support_name}   fps={profile.support_fps}   mags={profile.support_mags}   upgrades={profile.support_upgrades} />
          </div>
        )}

        {/* Gear */}
        {hasGear && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Kit & Gear" />
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "4px 14px" }}>
              <GearRow label="Helmet"     value={profile.helmet} />
              <GearRow label="Vest / Rig" value={profile.vest} />
              <GearRow label="Camo"       value={profile.camo} />
              <GearRow label="Eye Pro"    value={profile.eyepro} />
              <GearRow label="Comms"      value={profile.comms} />
              <GearRow label="Boots"      value={profile.boots} />
              <GearRow label="Other Gear" value={profile.other_gear} />
            </div>
          </div>
        )}

        {/* Notes */}
        {profile.notes && (
          <div style={{ marginBottom: 24 }}>
            <SectionHeader label="Field Notes" />
            <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "14px 16px" }}>
              <p style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#6a8a40", lineHeight: 1.7, margin: 0 }}>{profile.notes}</p>
            </div>
          </div>
        )}

        {!hasWeapons && !hasGear && !profile.bio && (
          <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: 40, textAlign: "center" }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".2em", color: "#2a3a10" }}>LOADOUT DATA NOT YET FILED</div>
          </div>
        )}
      </div>
    </div>
  );
}


export { PublicProfilePage };
