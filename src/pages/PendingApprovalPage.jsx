// pages/PendingApprovalPage.jsx — shown to registered but unapproved users
import React from "react";

const MIL = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };

export function PendingApprovalPage({ cu, onSignOut }) {
  return (
    <div style={{ minHeight:"100vh", background:"#080b06", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, textAlign:"center" }}>
      <div style={{ maxWidth:480, width:"100%" }}>
        <img src="/logo.png" alt="Swindon Airsoft" style={{ height:72, marginBottom:28, opacity:.9 }} onError={e=>e.target.style.display="none"}/>

        <div style={{ background:"#0d1209", border:"2px solid rgba(200,255,0,.3)", padding:"32px 28px", marginBottom:16 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⏳</div>

          <div style={{ ...MIL, fontWeight:900, fontSize:26, letterSpacing:".08em", textTransform:"uppercase", color:"#c8ff00", marginBottom:8 }}>
            AWAITING APPROVAL
          </div>

          <div style={{ ...MONO, fontSize:8, color:"#3a5010", letterSpacing:".2em", marginBottom:24 }}>
            ◈ ACCOUNT VERIFICATION PENDING ◈
          </div>

          <div style={{ fontSize:13, color:"#8aaa60", lineHeight:1.9, marginBottom:20 }}>
            Hi <strong style={{ color:"#fff" }}>{cu?.name || cu?.email}</strong>,<br/><br/>
            Your account has been created and is currently being reviewed by our team.<br/><br/>
            You will receive an <strong style={{ color:"#c8ff00" }}>email confirmation</strong> once your account has been approved, typically within <strong style={{ color:"#fff" }}>24 hours</strong>.
          </div>

          <div style={{ background:"rgba(200,255,0,.05)", border:"1px solid rgba(200,255,0,.15)", padding:"14px 18px", marginBottom:20, fontSize:12, color:"#5a6e42", lineHeight:1.7 }}>
            📧 If you have any questions, contact us at:<br/>
            <strong style={{ color:"#c8ff00" }}>swindonairsoftfield@gmail.com</strong>
          </div>

          <button
            onClick={onSignOut}
            style={{ background:"transparent", border:"1px solid #2a4018", color:"#5a6e42", fontFamily:"'Oswald',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".15em", padding:"10px 24px", cursor:"pointer", textTransform:"uppercase" }}
          >
            Sign Out
          </button>
        </div>

        <div style={{ ...MONO, fontSize:8, color:"#1e2e12", letterSpacing:".1em" }}>
          ◈ SWINDON AIRSOFT · FIELD COMMAND ◈
        </div>
      </div>
    </div>
  );
}
