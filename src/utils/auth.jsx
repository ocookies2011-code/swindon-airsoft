// utils/auth.jsx — SupabaseAuthModal, WaiverModal
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { normaliseProfile } from "../api";
import { fmtErr } from "./helpers";

function SupabaseAuthModal({ mode, setMode, onClose, showToast, onLogin }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));

  const sendReset = async () => {
    if (!form.email || !form.email.includes("@")) { showToast("Enter your email address first", "red"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (e) {
      showToast(e.message || "Failed to send reset email", "red");
    } finally { setBusy(false); }
  };

  const login = async () => {
    if (!form.email || !form.password) { showToast("Email and password required", "red"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
      if (error) throw error;
      // Fetch profile — if this fails, still close the modal.
      // onAuthStateChange will also fire and set the user, so the UI will update either way.
      try {
        const profile = await api.profiles.getById(data.user.id);
        if (profile) onLogin(normaliseProfile(profile));
      } catch {
        // Profile fetch failed (e.g. timeout) — auth is still valid.
        // onAuthStateChange will recover the session on next render.
      }
      onClose();
    } catch (e) {
      showToast(e.message || "Login failed", "red");
      setBusy(false);
    }
  };

  const register = async () => {
    if (!form.name || !form.email || !form.password) { showToast("All fields required", "red"); return; }
    if (!form.email.includes("@") || !form.email.includes(".")) { showToast("Please enter a valid email address", "red"); return; }
    if (form.password.length < 8) { showToast("Password must be at least 8 characters", "red"); return; }
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) { showToast("Password must contain at least one letter and one number", "red"); return; }
    setBusy(true);
    try {
      await api.auth.signUp({ email: form.email, password: form.password, name: form.name, phone: form.phone });
      showToast("🎉 Account created! You can now log in.");
      // Send welcome email fire-and-forget — only on confirmed success, never blocks
      setTimeout(() => {
        sendWelcomeEmail({ name: form.name, email: form.email }).catch(() => {});
      }, 500);
      // Switch to login mode so player can sign in immediately
      setMode("login");
      setForm(p => ({ ...p, password: "" }));
    } catch (e) {
      console.error("Registration error:", e);
      const msg = e.message || "";
      if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many") || msg.toLowerCase().includes("exceeded")) {
        showToast("Too many sign-up attempts — please wait a few minutes and try again.", "red");
      } else if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("user already")) {
        showToast("An account with this email already exists. Try logging in instead.", "red");
      } else {
        showToast(msg || "Registration failed — please try again.", "red");
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {resetMode ? (
          <>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:52, width:"auto", objectFit:"contain" }} />
            </div>
            <div className="modal-title">🔑 Reset Password</div>
            {resetSent ? (
              <>
                <div className="alert alert-green" style={{ marginBottom: 16 }}>
                  ✅ Check your email — a reset link has been sent to <strong>{form.email}</strong>.
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Click the link in the email to set a new password. Check your spam folder if it doesn't arrive within a minute.</div>
                <button className="btn btn-ghost" onClick={() => { setResetMode(false); setResetSent(false); }}>← Back to Login</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Enter your email address and we'll send you a link to reset your password.</div>
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setField("email", e.target.value)} onKeyDown={e => e.key === "Enter" && sendReset()} autoFocus /></div>
                <div className="gap-2 mt-2">
                  <button className="btn btn-primary" disabled={busy} onClick={sendReset}>{busy ? "Sending…" : "Send Reset Link"}</button>
                  <button className="btn btn-ghost" onClick={() => setResetMode(false)}>← Back</button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:52, width:"auto", objectFit:"contain" }} />
            </div>
            <div className="modal-title">{mode === "login" ? "🔐 Sign In" : "🎯 Create Account"}</div>
            {mode === "register" && (
              <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="John Smith" /></div>
            )}
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setField("email", e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={e => setField("password", e.target.value)} onKeyDown={e => e.key === "Enter" && (mode === "login" ? login() : register())} /></div>
            {mode === "register" && (
              <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="07700..." /></div>
            )}
            {mode === "register" && (
              <div className="alert alert-blue" style={{ marginBottom: 12 }}>
                📧 A welcome email will be sent once your account is created.
                <br/><span style={{ fontSize: 11, opacity: .8 }}>🔒 Password: 8+ characters, must include at least one letter and one number.</span>
              </div>
            )}
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" disabled={busy} onClick={mode === "login" ? login : register}>
                {busy ? "Please wait…" : mode === "login" ? "Login" : "Register"}
              </button>
              <button className="btn btn-ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "New? Register →" : "Have account? Login →"}
              </button>
              <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={onClose}>Cancel</button>
            </div>
            {mode === "login" && (
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px", color: "var(--muted)" }} onClick={() => setResetMode(true)}>
                  Forgot password?
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function WaiverModal({ cu, updateUser, onClose, showToast, editMode, existing, addPlayerMode }) {
  const TERMS = [
    "I understand that airsoft is a physical activity that carries inherent risks of injury.",
    "I will wear appropriate eye protection at all times during gameplay.",
    "I agree to follow all safety rules and marshal instructions.",
    "I confirm that I am at least 18 years of age or have parental/guardian consent.",
    "I will not consume alcohol or drugs before or during gameplay.",
    "I release Swindon Airsoft and its staff from liability for any injuries sustained during play.",
    "I understand that my participation is voluntary and at my own risk.",
    "I agree to treat all participants with respect and follow the site's code of conduct.",
    "I confirm that any replica firearms I bring to the site are legal to own in the UK.",
    "I understand that failure to comply with safety rules may result in removal from the site.",
  ];

  const blankForm = (prefill) => ({
    name: prefill?.name || "", dob: prefill?.dob || "",
    addr1: prefill?.addr1 || "", addr2: prefill?.addr2 || "",
    city: prefill?.city || "", county: prefill?.county || "",
    postcode: prefill?.postcode || "", country: prefill?.country || "United Kingdom",
    emergencyName: prefill?.emergencyName || "", emergencyPhone: prefill?.emergencyPhone || "",
    medical: prefill?.medical || "", isChild: prefill?.isChild || false,
    guardian: prefill?.guardian || "", sigData: prefill?.sigData || "", agreed: false,
  });

  const existingData = editMode && existing ? existing : {};
  const buildInitialWaivers = () => {
    if (addPlayerMode) {
      // Pre-load all existing waivers + one new blank for the new player
      const existingWaivers = [cu.waiverData, ...(cu.extraWaivers || [])].map(w => blankForm(w));
      return [...existingWaivers, blankForm()];
    }
    if (editMode) {
      // Load ALL waivers (primary + extras) for editing
      return [cu.waiverData, ...(cu.extraWaivers || [])].map(w => blankForm(w));
    }
    return [blankForm({
      name: existingData.name || cu?.name || "", dob: existingData.dob || "",
      addr1: existingData.addr1 || "", addr2: existingData.addr2 || "",
      city: existingData.city || "", county: existingData.county || "",
      postcode: existingData.postcode || "", country: existingData.country || "United Kingdom",
      emergencyName: existingData.emergencyName || "", emergencyPhone: existingData.emergencyPhone || "",
      medical: existingData.medical || "", isChild: existingData.isChild || false, guardian: existingData.guardian || "",
    })];
  };
  const [waivers, setWaivers] = useState(buildInitialWaivers);
  const [activeIdx, setActiveIdx] = useState(addPlayerMode ? (cu.extraWaivers ? cu.extraWaivers.length + 1 : 1) : 0);
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  const fw = (k, v) => setWaivers(ws => ws.map((w, i) => i === activeIdx ? { ...w, [k]: v } : w));
  const active = waivers[activeIdx];

  const addWaiver = () => { setWaivers(ws => [...ws, blankForm()]); setActiveIdx(waivers.length); };
  const removeWaiver = (idx) => {
    if (waivers.length === 1) return;
    setWaivers(ws => ws.filter((_, i) => i !== idx));
    setActiveIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (active.sigData) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = active.sigData;
    }
  }, [activeIdx]);

  const getPos = (ev, canvas) => {
    const canvasRect = canvas.getBoundingClientRect();
    const src = ev.touches ? ev.touches[0] : ev;
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    return { x: (src.clientX - canvasRect.left) * scaleX, y: (src.clientY - canvasRect.top) * scaleY };
  };
  const startDraw = (ev) => { ev.preventDefault(); const canvasEl = canvasRef.current; const ctx = canvasEl.getContext("2d"); const canvasPos = getPos(ev, canvasEl); ctx.beginPath(); ctx.moveTo(canvasPos.x, canvasPos.y); setDrawing(true); };
  const draw = (ev) => { if (!drawing) return; ev.preventDefault(); const canvasEl = canvasRef.current; const ctx = canvasEl.getContext("2d"); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#c8ff00"; const canvasPos = getPos(ev, canvasEl); ctx.lineTo(canvasPos.x, canvasPos.y); ctx.stroke(); };
  const endDraw = () => { if (!drawing) return; setDrawing(false); fw("sigData", canvasRef.current.toDataURL()); };
  const clearSig = () => { canvasRef.current.getContext("2d").clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); fw("sigData", ""); };

  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    for (let waiverIdx = 0; waiverIdx < waivers.length; waiverIdx++) {
      const waiverItem = waivers[waiverIdx];
      if (!waiverItem.name)  { showToast(`Waiver ${waiverIdx+1}: Full name required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.dob)   { showToast(`Waiver ${waiverIdx+1}: Date of birth required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.addr1 || !waiverItem.city || !waiverItem.postcode) { showToast(`Waiver ${waiverIdx+1}: Address required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.emergencyName || !waiverItem.emergencyPhone) { showToast(`Waiver ${waiverIdx+1}: Emergency contact required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.sigData) { showToast(`Waiver ${waiverIdx+1}: Signature required`, "red"); setActiveIdx(waiverIdx); return; }
      if (!waiverItem.agreed) { showToast(`Waiver ${waiverIdx+1}: Please agree to the terms`, "red"); setActiveIdx(waiverIdx); return; }
      if (waiverItem.isChild && !waiverItem.guardian) { showToast(`Waiver ${waiverIdx+1}: Guardian name required`, "red"); setActiveIdx(waiverIdx); return; }
    }
    const primary = { ...waivers[0], signed: true, date: new Date().toISOString() };
    const extras = waivers.slice(1).map(w => ({ ...w, signed: true, date: new Date().toISOString() }));
    setSubmitting(true);
    try {
      if (editMode) {
        // Write to waiverPending for admin approval — do not apply directly
        await updateUser(cu.id, {
          waiverPending: { waiverData: primary, extraWaivers: extras },
        });
        showToast("Changes submitted — awaiting admin approval.");
      } else {
        await updateUser(cu.id, { waiverSigned: true, waiverYear: new Date().getFullYear(), waiverData: primary, waiverPending: null, extraWaivers: extras });
        showToast(extras.length > 0 ? `${waivers.length} waivers signed!` : "Waiver signed successfully!");
      }
      onClose();
    } catch (e) {
      showToast("Failed to save waiver: " + (e.message || "Unknown error. Please try again."), "red");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose} style={{ alignItems: "flex-start", paddingTop: 0 }}>
      <div className="modal-box wide" onClick={ev => ev.stopPropagation()} style={{ maxWidth: 780, margin: "0 auto", borderRadius: 0, minHeight: "100vh" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, paddingBottom:16, borderBottom:"1px solid #1a1a1a" }}>
          <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:44, width:"auto", objectFit:"contain", flexShrink:0 }} />
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:24, letterSpacing:".05em", textTransform:"uppercase" }}>
              PLAYER <span style={{ color:"var(--accent)" }}>WAIVER</span>
            </div>
            <div style={{ fontSize:11, color:"var(--muted)", letterSpacing:".1em" }}>VALID UNTIL 31 DECEMBER {new Date().getFullYear()}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"none", border:"none", color:"var(--muted)", fontSize:22, cursor:"pointer" }}>✕</button>
        </div>

        {/* Important notice */}
        <div className="alert alert-gold" style={{ marginBottom:20, display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight:700, marginBottom:2 }}>Important Notice</div>
            <div style={{ fontSize:13 }}>You must sign this waiver before participating in any game day. Waivers are valid for the current calendar year and expire on December 31st.</div>
          </div>
        </div>

        {/* Player tabs */}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
          {waivers.map((w, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:0 }}>
              <button onClick={() => setActiveIdx(i)}
                style={{ padding:"6px 14px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".08em", textTransform:"uppercase",
                  background: activeIdx === i ? "var(--accent)" : "#1a1a1a", color: activeIdx === i ? "#000" : "var(--muted)",
                  border:"1px solid " + (activeIdx === i ? "var(--accent)" : "#333"), borderRadius:"2px 0 0 2px", cursor:"pointer" }}>
                {w.name || `Player ${i+1}`}
              </button>
              {i > 0 && (
                <button onClick={() => removeWaiver(i)}
                  style={{ padding:"6px 8px", background: activeIdx === i ? "var(--accent)" : "#1a1a1a", color: activeIdx === i ? "#000" : "#666",
                    border:"1px solid " + (activeIdx === i ? "var(--accent)" : "#333"), borderLeft:"none", borderRadius:"0 2px 2px 0", cursor:"pointer", fontSize:11 }}>✕</button>
              )}
              {i === 0 && <div style={{ borderRadius:"0 2px 2px 0" }} />}
            </div>
          ))}
          <button onClick={addWaiver}
            style={{ padding:"6px 14px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".08em", textTransform:"uppercase",
              background:"none", color:"var(--accent)", border:"1px dashed var(--accent)", borderRadius:2, cursor:"pointer", marginLeft:4 }}>
            + Add Player
          </button>
        </div>

        {/* T&C box */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", borderRadius:4, padding:20, marginBottom:20 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, letterSpacing:".12em", color:"var(--accent)", textTransform:"uppercase", marginBottom:12 }}>
            TERMS &amp; CONDITIONS
          </div>
          <div style={{ maxHeight:170, overflowY:"auto", paddingRight:4 }}>
            <p style={{ fontSize:13, color:"#ccc", marginBottom:10 }}>By signing this waiver, I acknowledge and agree to the following:</p>
            {TERMS.map((t, i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom:7, fontSize:13, color:"#aaa", lineHeight:1.5 }}>
                <span style={{ color:"var(--accent)", fontWeight:700, flexShrink:0, minWidth:18 }}>{i+1}.</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Under 18 */}
        <div style={{ background:"#111", border:"1px solid #2a2a2a", borderRadius:4, padding:14, marginBottom:16, display:"flex", gap:12, alignItems:"flex-start" }}>
          <input type="checkbox" id={`wchild-${activeIdx}`} checked={active.isChild} onChange={ev => fw("isChild", ev.target.checked)}
            style={{ width:18, height:18, marginTop:2, accentColor:"var(--accent)", flexShrink:0 }} />
          <div>
            <label htmlFor={`wchild-${activeIdx}`} style={{ cursor:"pointer", fontWeight:700, fontSize:14 }}>⏱ I am under 18 years old</label>
            <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>If under 18, a parent or legal guardian must also sign.</div>
          </div>
        </div>
        {active.isChild && (
          <div className="form-group" style={{ marginBottom:16 }}>
            <label>Parent/Guardian Full Name *</label>
            <input value={active.guardian} onChange={ev => fw("guardian", ev.target.value)} placeholder="Type full name as guardian signature" />
          </div>
        )}

        {/* Personal details */}
        <div className="form-row" style={{ marginBottom:12 }}>
          <div className="form-group"><label>FULL LEGAL NAME *</label><input value={active.name} onChange={ev => fw("name", ev.target.value)} /></div>
          <div className="form-group">
            <label>DATE OF BIRTH *</label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              maxLength={10}
              value={active.dob ? (() => {
                // Convert stored YYYY-MM-DD to display DD/MM/YYYY
                const parts = active.dob.split("-");
                if (parts.length === 3 && parts[0].length === 4) return parts[2] + "/" + parts[1] + "/" + parts[0];
                return active.dob; // already in display format or partial entry
              })() : ""}
              onChange={ev => {
                let v = ev.target.value.replace(/[^0-9/]/g, "");
                // Auto-insert slashes after DD and MM
                if (v.length === 2 && !v.includes("/")) v = v + "/";
                if (v.length === 5 && v.split("/").length === 2) v = v + "/";
                // Convert DD/MM/YYYY → YYYY-MM-DD for storage when complete
                const parts = v.split("/");
                if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                  fw("dob", parts[2] + "-" + parts[1] + "-" + parts[0]);
                } else {
                  fw("dob", v); // store partial as-is while typing
                }
              }}
              style={{ maxWidth: 140 }}
            />
            <div style={{ fontSize:10, color:"var(--muted)", marginTop:3 }}>Format: DD/MM/YYYY</div>
          </div>
        </div>

        {/* Address */}
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase", marginBottom:8 }}>ADDRESS</div>
        <div className="form-group" style={{ marginBottom:10 }}><label>ADDRESS LINE 1 *</label><input value={active.addr1} onChange={ev => fw("addr1", ev.target.value)} /></div>
        <div className="form-group" style={{ marginBottom:10 }}><label>ADDRESS LINE 2</label><input value={active.addr2} onChange={ev => fw("addr2", ev.target.value)} /></div>
        <div className="form-row" style={{ marginBottom:10 }}>
          <div className="form-group"><label>CITY *</label><input value={active.city} onChange={ev => fw("city", ev.target.value)} /></div>
          <div className="form-group"><label>COUNTY</label><input value={active.county} onChange={ev => fw("county", ev.target.value)} /></div>
        </div>
        <div className="form-row" style={{ marginBottom:16 }}>
          <div className="form-group"><label>POSTCODE *</label><input value={active.postcode} onChange={ev => fw("postcode", ev.target.value)} /></div>
          <div className="form-group"><label>COUNTRY</label><input value={active.country} onChange={ev => fw("country", ev.target.value)} /></div>
        </div>

        {/* Emergency contact */}
        <div className="form-row" style={{ marginBottom:16 }}>
          <div className="form-group"><label>EMERGENCY CONTACT NAME *</label><input value={active.emergencyName} onChange={ev => fw("emergencyName", ev.target.value)} /></div>
          <div className="form-group"><label>EMERGENCY CONTACT PHONE *</label><input value={active.emergencyPhone} onChange={ev => fw("emergencyPhone", ev.target.value)} /></div>
        </div>

        {/* Medical */}
        <div className="form-group" style={{ marginBottom:16 }}>
          <label>MEDICAL CONDITIONS</label>
          <textarea rows={2} value={active.medical} onChange={ev => fw("medical", ev.target.value)} placeholder="List any relevant conditions, or leave blank if none" />
        </div>

        {/* Signature */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
            <label style={{ fontWeight:700, fontSize:11, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>✏️ SIGNATURE *</label>
            <button onClick={clearSig} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18, padding:4 }} title="Clear">↺</button>
          </div>
          <canvas ref={canvasRef} width={700} height={150}
            style={{ width:"100%", background:"#0d0d0d", border:"1px solid #333", borderRadius:4, cursor:"crosshair", touchAction:"none", display:"block" }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>Draw your signature above using mouse or touch</div>
        </div>

        {/* Agree */}
        <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:20, padding:14, background:"#111", border:"1px solid #2a2a2a", borderRadius:4 }}>
          <input type="checkbox" id={`wagree-${activeIdx}`} checked={active.agreed} onChange={ev => fw("agreed", ev.target.checked)}
            style={{ width:18, height:18, marginTop:2, accentColor:"var(--accent)", flexShrink:0 }} />
          <label htmlFor={`wagree-${activeIdx}`} style={{ cursor:"pointer", fontSize:13, lineHeight:1.6 }}>
            I have read and agree to the terms and conditions above. I understand that this waiver is legally binding and will be valid until December 31st of this year.
          </label>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-primary" style={{ flex:1, padding:"12px", fontSize:14, letterSpacing:".1em" }} onClick={submit} disabled={submitting}>
            {submitting ? "SAVING…" : editMode ? "SUBMIT CHANGES" : `SIGN WAIVER${waivers.length > 1 ? ` (${waivers.length} PLAYERS)` : ""}`}
          </button>
          <button className="btn btn-ghost" style={{ padding:"12px 18px" }} onClick={onClose} disabled={submitting}>Cancel</button>
        </div>
      </div>
    </div>
  );
}



export { SupabaseAuthModal, WaiverModal };
