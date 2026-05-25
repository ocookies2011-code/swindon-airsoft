// pages/BlockedPage.jsx — shown to non-UK / VPN users
import React from "react";

const MIL = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };

export function BlockedPage({ reason }) {
  const isVPN = reason === "vpn" || reason === "tor";
  return (
    <div style={{ minHeight:"100vh", background:"#050805", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, textAlign:"center" }}>
      <div style={{ maxWidth:480, width:"100%" }}>
        {/* Logo */}
        <img src="/logo.png" alt="Swindon Airsoft" style={{ height:80, marginBottom:32, opacity:.9 }} onError={e=>e.target.style.display="none"}/>

        <div style={{ background:"#0d0a08", border:`2px solid ${isVPN?"#f97316":"#ef4444"}`, padding:"32px 28px", marginBottom:20 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>{isVPN ? "🔒" : "🌍"}</div>

          <div style={{ ...MIL, fontWeight:900, fontSize:28, letterSpacing:".06em", textTransform:"uppercase", color: isVPN?"#f97316":"#ef4444", marginBottom:8 }}>
            {isVPN ? "VPN DETECTED" : "ACCESS RESTRICTED"}
          </div>

          <div style={{ ...MONO, fontSize:9, letterSpacing:".2em", color:"#5a3a30", marginBottom:24 }}>
            ◈ SWINDON AIRSOFT · SECURITY CHECKPOINT ◈
          </div>

          {isVPN ? (
            <div style={{ fontSize:14, color:"#c8b4a0", lineHeight:1.8, marginBottom:20 }}>
              A <strong style={{ color:"#f97316" }}>VPN or proxy connection</strong> has been detected on your network.<br/><br/>
              To access Swindon Airsoft, please <strong style={{ color:"#fff" }}>disable your VPN</strong> and refresh the page.<br/><br/>
              This restriction is in place to protect our players and their data.
            </div>
          ) : (
            <div style={{ fontSize:14, color:"#c8b4a0", lineHeight:1.8, marginBottom:20 }}>
              Swindon Airsoft is a <strong style={{ color:"#fff" }}>UK-only</strong> service.<br/><br/>
              Access to this site is restricted to users located within the <strong style={{ color:"#fff" }}>United Kingdom</strong>.<br/><br/>
              If you believe this is an error, please contact us directly.
            </div>
          )}

          <div style={{ background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.15)", padding:"12px 16px" }}>
            <div style={{ ...MONO, fontSize:10, color:"#7a4040", letterSpacing:".12em" }}>
              {isVPN
                ? "DISABLE VPN → REFRESH PAGE → ACCESS GRANTED"
                : "CONTACT: swindonairsoftfield@gmail.com"}
            </div>
          </div>
        </div>

        <div style={{ ...MONO, fontSize:8, color:"#2a1a1a", letterSpacing:".1em" }}>
          ACCESS DENIED · {new Date().toUTCString()}
        </div>
      </div>
    </div>
  );
}
