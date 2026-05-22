// pages/PasswordResetPage.jsx — shown when user clicks email reset link (#reset/TOKEN)
import React, { useState } from "react";
import { supabase } from "../supabaseClient";

export function PasswordResetPage({ token, setPage, showToast }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState(false);
  const [err, setErr]           = useState("");

  const submit = async () => {
    setErr("");
    if (password.length < 8)       { setErr("Password must be at least 8 characters."); return; }
    if (password !== confirm)      { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      // Supabase recovery flow: user is already authenticated via the email link
      // Just update the password directly
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      showToast("✅ Password updated! You can now log in.");
      setTimeout(() => setPage("home"), 3000);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  const inp = {
    style: { width:"100%", background:"#0f0f0f", border:"1px solid #2a2a2a", color:"var(--text)", padding:"10px 14px", fontSize:14, fontFamily:"inherit", boxSizing:"border-box", marginBottom:12 }
  };

  return (
    <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420, background:"#0d0d0d", border:"1px solid #2a2a2a", padding:32 }}>
        <div style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:700, fontSize:22, letterSpacing:".1em", color:"var(--accent)", marginBottom:8 }}>
          RESET PASSWORD
        </div>

        {done ? (
          <div style={{ color:"var(--accent)", fontSize:14, lineHeight:1.6 }}>
            ✅ Password updated successfully! Redirecting you to the home page…
          </div>
        ) : (<>
          <div style={{ fontSize:13, color:"var(--muted)", marginBottom:20, lineHeight:1.6 }}>
            Enter your new password below.
          </div>

          {err && (
            <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", color:"#ef4444", padding:"10px 14px", fontSize:13, marginBottom:14 }}>
              {err}
            </div>
          )}

          <div style={{ fontSize:11, color:"var(--muted)", marginBottom:4, letterSpacing:".08em", textTransform:"uppercase" }}>New Password</div>
          <input {...inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />

          <div style={{ fontSize:11, color:"var(--muted)", marginBottom:4, letterSpacing:".08em", textTransform:"uppercase" }}>Confirm Password</div>
          <input {...inp} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Repeat password" />

          <button
            onClick={submit}
            disabled={busy || !password || !confirm}
            className="btn btn-primary"
            style={{ width:"100%", marginTop:4 }}
          >
            {busy ? "Updating…" : "SET NEW PASSWORD"}
          </button>

          <button onClick={() => setPage("home")} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:12, marginTop:12, display:"block", width:"100%", textAlign:"center" }}>
            Cancel — back to site
          </button>
        </>)}
      </div>
    </div>
  );
}
