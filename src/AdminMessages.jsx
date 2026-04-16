import React, { useState, useEffect } from "react";
import { fmtErr } from "./utils";
import { logAction } from "./adminShared";

function AdminMessages({ data, save, showToast, cu }) {
  const [banners, setBanners] = useState(() => Array.isArray(data.homeMsg) && data.homeMsg.length > 0 ? data.homeMsg.map(b => ({ ...emptyBanner(), ...b })) : []);
  const [facebook, setFacebook] = useState(data.socialFacebook || "");
  const [instagram, setInstagram] = useState(data.socialInstagram || "");
  const [whatsapp, setWhatsapp] = useState(data.socialWhatsapp || "");
  const [contactAddress, setContactAddress] = useState(data.contactAddress || "");
  const [contactPhone, setContactPhone] = useState(data.contactPhone || "");
  const [contactEmail, setContactEmail] = useState(data.contactEmail || "swindonairsoftfield@gmail.com");
  const [saving, setSaving] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") { setSaving(false); setSavingSocial(false); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const [savingContact, setSavingContact] = useState(false);

  const saveBanners = async (list) => {
    setSaving(true);
    try {
      const clean = list.filter(b => b.text.trim());
      await api.settings.set("home_message", JSON.stringify(clean));
      setBanners(list);
      save({ homeMsg: clean });
      showToast(clean.length ? `${clean.length} banner${clean.length > 1 ? "s" : ""} saved!` : "Banners cleared");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Home banners updated", detail: clean.length ? `${clean.length} banner(s)` : "cleared" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const updateBanner = (i, field, val) => setBanners(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  const addBanner    = () => setBanners(prev => [...prev, emptyBanner()]);
  const removeBanner = (i) => setBanners(prev => prev.filter((_, idx) => idx !== i));
  const moveBanner   = (i, dir) => setBanners(prev => { const n = [...prev]; const swap = i + dir; if (swap < 0 || swap >= n.length) return n; [n[i], n[swap]] = [n[swap], n[i]]; return n; });

  // legacy saveMsg kept for safety
  const saveMsg = async (val) => {
    setSaving(true);
    try {
      await api.settings.set("home_message", val);
      save({ homeMsg: val ? [{ text: val, color: "#c8ff00", bg: "#080a06", icon: "⚡" }] : [] });
      showToast(val ? "Message saved!" : "Message cleared");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Site message updated", detail: val ? val.slice(0, 80) : "cleared" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const upsertSetting = (key, value) => api.settings.set(key, value);

  const saveSocial = async () => {
    setSavingSocial(true);
    try {
      const prevFacebook = data.socialFacebook || "";
      const prevInstagram = data.socialInstagram || "";
      const prevWhatsapp = data.socialWhatsapp || "";
      await upsertSetting("social_facebook", facebook);
      await upsertSetting("social_instagram", instagram);
      await upsertSetting("social_whatsapp", whatsapp);
      save({ socialFacebook: facebook, socialInstagram: instagram, socialWhatsapp: whatsapp });
      showToast("Social links saved!");
      const socDiff = diffFields(
        { facebook: prevFacebook, instagram: prevInstagram, whatsapp: prevWhatsapp },
        { facebook, instagram, whatsapp },
        { facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp" }
      );
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Social links saved", detail: socDiff || "no changes" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingSocial(false); }
  };

  const saveContact = async () => {
    setSavingContact(true);
    try {
      const prevAddress = data.contactAddress || "";
      const prevPhone = data.contactPhone || "";
      const prevEmail = data.contactEmail || "";
      await upsertSetting("contact_address", contactAddress);
      await upsertSetting("contact_phone", contactPhone);
      await upsertSetting("contact_email", contactEmail);
      save({ contactAddress, contactPhone, contactEmail });
      showToast("Contact details saved!");
      const ctDiff = diffFields(
        { address: prevAddress, phone: prevPhone, email: prevEmail },
        { address: contactAddress, phone: contactPhone, email: contactEmail },
        { address: "Address", phone: "Phone", email: "Email" }
      );
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Contact details saved", detail: ctDiff || "no changes" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingContact(false); }
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Site Messages</div><div className="page-sub">Ticker, social links and contact details</div></div></div>

      <div className="card mb-2">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Site Banners</div>
            <div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>Displayed at the top of the site. Each banner can have its own colour and icon.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={addBanner}>+ Add Banner</button>
        </div>

        {banners.length === 0 && (
          <div style={{ padding:"24px", textAlign:"center", border:"1px dashed #2a3a10", color:"var(--muted)", fontSize:13, marginBottom:12 }}>
            No banners active. Click <strong>+ Add Banner</strong> to create one.
          </div>
        )}

        {banners.map((banner, i) => (
          <div key={i} style={{ border:"1px solid #2a3a10", marginBottom:10, overflow:"hidden" }}>
            {/* Live preview */}
            <div style={{ background: banner.bg || "#080a06", color: banner.color || "#c8ff00", padding:"8px 16px", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, letterSpacing:".1em", textTransform:"uppercase", minHeight:36 }}>
              {banner.icon && <span>{banner.icon}</span>}
              <span style={{ flex:1, textAlign:"center" }}>{banner.text || <span style={{ opacity:.4 }}>Preview — type your message below</span>}</span>
              {banner.icon && <span>{banner.icon}</span>}
            </div>
            {/* Editor */}
            <div style={{ padding:"12px 14px", background:"#0a0d08", display:"flex", flexDirection:"column", gap:10 }}>
              {/* Message text */}
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:11 }}>Message Text</label>
                <input value={banner.text} onChange={e => updateBanner(i, "text", e.target.value)} placeholder="e.g. Next event — Saturday 14th June, booking now open!" />
              </div>
              {/* Icon picker */}
              <div>
                <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:5 }}>Icon</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:6 }}>
                  {PRESET_ICONS.map(ic => (
                    <button key={ic} onClick={() => updateBanner(i, "icon", ic)} style={{ width:32, height:32, fontSize:16, border: banner.icon === ic ? "2px solid var(--accent)" : "1px solid #2a3a10", background: banner.icon === ic ? "rgba(200,255,0,.1)" : "transparent", cursor:"pointer", borderRadius:2 }}>
                      {ic}
                    </button>
                  ))}
                  <button onClick={() => updateBanner(i, "icon", "")} style={{ height:32, padding:"0 10px", fontSize:10, letterSpacing:".1em", border: !banner.icon ? "2px solid var(--accent)" : "1px solid #2a3a10", background: !banner.icon ? "rgba(200,255,0,.1)" : "transparent", cursor:"pointer", color:"var(--muted)", borderRadius:2 }}>
                    NONE
                  </button>
                </div>
              </div>
              {/* Colour presets */}
              <div>
                <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:5 }}>Colour Preset</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
                  {PRESET_COMBOS.map(p => (
                    <button key={p.label} onClick={() => { updateBanner(i, "color", p.color); updateBanner(i, "bg", p.bg); }} style={{ padding:"3px 10px", fontSize:10, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".08em", border: banner.color === p.color && banner.bg === p.bg ? "2px solid var(--accent)" : "1px solid #2a3a10", background: p.bg, color: p.color, cursor:"pointer", borderRadius:2 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Custom colour pickers */}
              <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>Text colour</label>
                  <input type="color" value={banner.color || "#c8ff00"} onChange={e => updateBanner(i, "color", e.target.value)} style={{ width:36, height:28, border:"1px solid #2a3a10", background:"none", cursor:"pointer", padding:2 }} />
                  <span style={{ fontFamily:"monospace", fontSize:11, color:"var(--muted)" }}>{banner.color}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>Background</label>
                  <input type="color" value={banner.bg || "#080a06"} onChange={e => updateBanner(i, "bg", e.target.value)} style={{ width:36, height:28, border:"1px solid #2a3a10", background:"none", cursor:"pointer", padding:2 }} />
                  <span style={{ fontFamily:"monospace", fontSize:11, color:"var(--muted)" }}>{banner.bg}</span>
                </div>
              </div>
              {/* Row actions */}
              <div style={{ display:"flex", gap:8, alignItems:"center", borderTop:"1px solid #1a2808", paddingTop:8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => moveBanner(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <button className="btn btn-ghost btn-sm" onClick={() => moveBanner(i,  1)} disabled={i === banners.length - 1} title="Move down">↓</button>
                <div style={{ flex:1 }} />
                <button className="btn btn-danger btn-sm" onClick={() => removeBanner(i)}>Remove</button>
              </div>
            </div>
          </div>
        ))}

        <div style={{ display:"flex", gap:8, marginTop:4 }}>
          <button className="btn btn-primary" onClick={() => saveBanners(banners)} disabled={saving}>{saving ? "Saving..." : `Save ${banners.length} Banner${banners.length !== 1 ? "s" : ""}`}</button>
          {banners.length > 0 && <button className="btn btn-danger" onClick={() => { setBanners([]); saveBanners([]); }} disabled={saving}>Clear All</button>}
        </div>

        {Array.isArray(data.homeMsg) && data.homeMsg.length > 0 && (
          <div className="alert alert-green mt-2" style={{ fontSize:11 }}>
            {data.homeMsg.length} banner{data.homeMsg.length > 1 ? "s" : ""} currently live
          </div>
        )}
      </div>

      <div className="card mb-2">
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Contact Details</div>
        <div className="form-group"><label>Address / Location</label><input value={contactAddress} onChange={e => setContactAddress(e.target.value)} placeholder="Swindon, Wiltshire, UK" /></div>
        <div className="form-group"><label>Phone Number</label><input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+44 1234 567890" /></div>
        <div className="form-group"><label>Email Address</label><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="info@swindon-airsoft.com" /></div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>Shown in the footer. Leave blank to hide a field.</div>
        <button className="btn btn-primary" onClick={saveContact} disabled={savingContact}>{savingContact ? "Saving..." : "Save Contact Details"}</button>
      </div>

      <div className="card">
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Social Links</div>
        <div className="form-group"><label>Facebook URL</label><input value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="https://facebook.com/your-page" /></div>
        <div className="form-group"><label>Instagram URL</label><input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/your-account" /></div>
        <div className="form-group"><label>WhatsApp</label><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="https://wa.me/447911123456" /><div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>Use format: https://wa.me/44XXXXXXXXXX (country code, no + or spaces)</div></div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>Icons appear in the footer. Leave blank to hide.</div>
        <button className="btn btn-primary" onClick={saveSocial} disabled={savingSocial}>{savingSocial ? "Saving..." : "Save Social Links"}</button>
      </div>
    </div>
  );
}

// ── Admin Cash Sales ──────────────────────────────────────

export default AdminMessages;
