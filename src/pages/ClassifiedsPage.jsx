import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

const MIL  = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };

const CATEGORIES = [
  { id:"all",         label:"All Items",     icon:"🎯" },
  { id:"rifle",       label:"Rifles",        icon:"🔫" },
  { id:"pistol",      label:"Pistols",       icon:"🔫" },
  { id:"gear",        label:"Gear & Plate",  icon:"🦺" },
  { id:"clothing",    label:"Clothing",      icon:"👕" },
  { id:"accessories", label:"Accessories",   icon:"🔧" },
  { id:"ammo",        label:"BBs & Ammo",    icon:"⚙️" },
  { id:"other",       label:"Other",         icon:"📦" },
];

const CONDITIONS = {
  new:       { label:"New",        color:"#c8ff00" },
  like_new:  { label:"Like New",   color:"#4fc3f7" },
  used:      { label:"Used",       color:"#f97316" },
  spares:    { label:"Spares/Repair", color:"#ef4444" },
};

function ImageUploader({ images, onChange }) {
  const [uploading, setUploading] = React.useState(false);
  const MAX = 4;

  const upload = async (file) => {
    if (!file) return;
    if (images.length >= MAX) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `classifieds/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('classifieds').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('classifieds').getPublicUrl(path);
      onChange([...images, data.publicUrl]);
    } catch(e) {
      // Fallback: if bucket doesn't exist, use object URL for preview
      const url = URL.createObjectURL(file);
      onChange([...images, url]);
    } finally { setUploading(false); }
  };

  const remove = (i) => onChange(images.filter((_,idx) => idx !== i));

  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {images.map((img, i) => (
        <div key={i} style={{ position:"relative", width:100, height:80 }}>
          <img src={img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", border:"1px solid var(--border)" }} />
          <button onClick={() => remove(i)}
            style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,.8)", border:"none", color:"#ef4444", cursor:"pointer", fontSize:12, width:18, height:18, lineHeight:"18px", textAlign:"center", padding:0 }}>✕</button>
        </div>
      ))}
      {images.length < MAX && (
        <label style={{ width:100, height:80, border:"1px dashed var(--border)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"var(--muted)", fontSize:11, gap:4 }}>
          {uploading ? "Uploading…" : <>📷<span>Add photo</span></>}
          <input type="file" accept="image/*" style={{ display:"none" }} onChange={e => upload(e.target.files[0])} disabled={uploading} />
        </label>
      )}
    </div>
  );
}

export function ClassifiedsPage({ cu, showToast, setAuthModal }) {
  const [ads, setAds]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [catFilter, setCatFilter] = useState("all");
  const [viewAd, setViewAd]     = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editAd, setEditAd]     = useState(null);
  const [busy, setBusy]         = useState(false);

  const emptyForm = { title:"", description:"", price:"", condition:"used", category:"other", contact_method:"site", contact_details:"", images:[] };
  const [form, setForm] = useState(emptyForm);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("classifieds")
      .select("*, profiles(name, callsign, profile_pic)")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (data) setAds(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = catFilter === "all" ? ads : ads.filter(a => a.category === catFilter);

  const openForm = (ad = null) => {
    if (!cu) { setAuthModal("login"); return; }
    setEditAd(ad?.id || null);
    setForm(ad ? {
      title: ad.title, description: ad.description || "", price: ad.price || "",
      condition: ad.condition, category: ad.category,
      contact_method: ad.contact_method, contact_details: ad.contact_details || "",
      images: ad.images || [],
    } : emptyForm);
    setShowForm(true);
  };

  const saveAd = async () => {
    if (!form.title.trim()) { showToast("Title is required", "red"); return; }
    if (!form.price || isNaN(form.price)) { showToast("Enter a valid price", "red"); return; }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: parseFloat(form.price),
        condition: form.condition,
        category: form.category,
        contact_method: form.contact_method,
        contact_details: form.contact_details.trim(),
        images: form.images,
        updated_at: new Date().toISOString(),
      };
      if (editAd) {
        const { error } = await supabase.from("classifieds").update(payload).eq("id", editAd);
        if (error) throw error;
        showToast("✅ Ad updated");
      } else {
        const { error } = await supabase.from("classifieds").insert({ ...payload, user_id: cu.id, status:"active" });
        if (error) throw error;
        showToast("✅ Ad posted!");
      }
      setShowForm(false);
      load();
    } catch(e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const markSold = async (id) => {
    await supabase.from("classifieds").update({ status:"sold" }).eq("id", id);
    showToast("✅ Marked as sold");
    setViewAd(null);
    load();
  };

  const deleteAd = async (id) => {
    if (!window.confirm("Delete this ad?")) return;
    await supabase.from("classifieds").delete().eq("id", id);
    showToast("Ad deleted");
    setViewAd(null);
    load();
  };

  const Card = ({ ad }) => {
    const cond = CONDITIONS[ad.condition] || CONDITIONS.used;
    const cat  = CATEGORIES.find(c => c.id === ad.category);
    const isOwn = cu?.id === ad.user_id;
    return (
      <div onClick={() => setViewAd(ad)} style={{ background:"#0d1209", border:"1px solid #1e2e12", cursor:"pointer", transition:"border-color .15s" }}
        onMouseEnter={e=>e.currentTarget.style.borderColor="#c8ff00"}
        onMouseLeave={e=>e.currentTarget.style.borderColor="#1e2e12"}>
        {/* Image */}
        <div style={{ height:160, background:"#080b06", overflow:"hidden", position:"relative" }}>
          {ad.images?.[0]
            ? <img src={ad.images[0]} alt={ad.title} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"} />
            : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:40, color:"#1e2e12" }}>{cat?.icon || "📦"}</div>
          }
          <div style={{ position:"absolute", top:8, right:8, background:cond.color, color:"#000", fontWeight:700, fontSize:9, ...MONO, padding:"2px 6px", letterSpacing:".1em" }}>
            {cond.label.toUpperCase()}
          </div>
          {isOwn && <div style={{ position:"absolute", top:8, left:8, background:"rgba(200,255,0,.15)", border:"1px solid rgba(200,255,0,.4)", color:"#c8ff00", fontSize:9, ...MONO, padding:"2px 6px" }}>YOUR AD</div>}
        </div>
        {/* Info */}
        <div style={{ padding:"12px 14px" }}>
          <div style={{ ...MONO, fontSize:8, color:"#3a5010", letterSpacing:".15em", marginBottom:4, textTransform:"uppercase" }}>{cat?.icon} {cat?.label}</div>
          <div style={{ ...MIL, fontWeight:700, fontSize:15, color:"#c8d4b0", marginBottom:6, lineHeight:1.2 }}>{ad.title}</div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
            <div style={{ ...MIL, fontWeight:900, fontSize:22, color:"#c8ff00" }}>£{Number(ad.price).toFixed(2)}</div>
            <div style={{ ...MONO, fontSize:9, color:"#3a5010" }}>{ad.profiles?.name || "Operator"}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:24 }}>
        <div>
          <h1 style={{ ...MIL, fontWeight:900, fontSize:28, color:"var(--accent)", letterSpacing:".08em", margin:"0 0 4px" }}>🛒 CLASSIFIEDS</h1>
          <div style={{ ...MONO, fontSize:10, color:"var(--muted)" }}>Buy & sell airsoft kit with fellow operators</div>
        </div>
        {cu && (
          <button className="btn btn-primary" onClick={() => openForm()}>+ POST AN AD</button>
        )}
        {!cu && (
          <button className="btn btn-ghost" onClick={() => setAuthModal("login")}>Log in to post an ad</button>
        )}
      </div>

      {/* Category filter */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:20 }}>
        {CATEGORIES.map(c => (
          <button key={c.id} className={`btn btn-sm ${catFilter === c.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setCatFilter(c.id)}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ ...MONO, textAlign:"center", padding:60, color:"var(--muted)", fontSize:11 }}>Loading ads…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, background:"#0d1209", border:"1px solid #1e2e12" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
          <div style={{ ...MIL, fontSize:18, color:"var(--muted)" }}>No ads in this category yet</div>
          {cu && <button className="btn btn-primary" style={{ marginTop:16 }} onClick={() => openForm()}>Be the first to post</button>}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:16 }}>
          {filtered.map(ad => <Card key={ad.id} ad={ad} />)}
        </div>
      )}

      {/* View Ad Modal */}
      {viewAd && (
        <div className="overlay" onClick={() => setViewAd(null)}>
          <div className="modal-box" style={{ maxWidth:600 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:8 }}>
              <div>
                <div style={{ ...MONO, fontSize:8, color:"#3a5010", letterSpacing:".15em", marginBottom:4, textTransform:"uppercase" }}>
                  {CATEGORIES.find(c=>c.id===viewAd.category)?.icon} {CATEGORIES.find(c=>c.id===viewAd.category)?.label}
                </div>
                <div style={{ ...MIL, fontWeight:900, fontSize:20, color:"#c8d4b0" }}>{viewAd.title}</div>
              </div>
              <div style={{ ...MIL, fontWeight:900, fontSize:28, color:"#c8ff00" }}>£{Number(viewAd.price).toFixed(2)}</div>
            </div>

            {/* Images */}
            {viewAd.images?.length > 0 && (
              <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                {viewAd.images.map((img, i) => (
                  <img key={i} src={img} alt="" style={{ height:120, width:160, objectFit:"cover", border:"1px solid #2a4018" }} />
                ))}
              </div>
            )}

            {/* Details */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div style={{ background:"#080b06", padding:"10px 12px" }}>
                <div style={{ ...MONO, fontSize:9, color:"#3a5010", marginBottom:3 }}>CONDITION</div>
                <div style={{ fontWeight:700, color: CONDITIONS[viewAd.condition]?.color }}>{CONDITIONS[viewAd.condition]?.label}</div>
              </div>
              <div style={{ background:"#080b06", padding:"10px 12px" }}>
                <div style={{ ...MONO, fontSize:9, color:"#3a5010", marginBottom:3 }}>SELLER</div>
                <div style={{ fontWeight:700 }}>{viewAd.profiles?.name || "Operator"}</div>
              </div>
              <div style={{ background:"#080b06", padding:"10px 12px" }}>
                <div style={{ ...MONO, fontSize:9, color:"#3a5010", marginBottom:3 }}>POSTED</div>
                <div style={{ fontSize:13 }}>{new Date(viewAd.created_at).toLocaleDateString("en-GB", { timeZone:"Europe/London", day:"numeric", month:"short", year:"numeric" })}</div>
              </div>
              <div style={{ background:"#080b06", padding:"10px 12px" }}>
                <div style={{ ...MONO, fontSize:9, color:"#3a5010", marginBottom:3 }}>CONTACT VIA</div>
                <div style={{ fontSize:13, textTransform:"capitalize" }}>{viewAd.contact_method === "site" ? "Site Message" : viewAd.contact_method}</div>
              </div>
            </div>

            {viewAd.description && (
              <div style={{ background:"#080b06", border:"1px solid #1e2e12", padding:"12px 14px", marginBottom:16, fontSize:13, color:"#8aaa60", lineHeight:1.8, whiteSpace:"pre-wrap" }}>
                {viewAd.description}
              </div>
            )}

            {viewAd.contact_details && (
              <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.2)", padding:"10px 14px", marginBottom:16, fontSize:13, color:"#c8d4b0" }}>
                📞 {viewAd.contact_details}
              </div>
            )}

            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {cu?.id === viewAd.user_id && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => { setViewAd(null); openForm(viewAd); }}>✏️ Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => markSold(viewAd.id)}>✅ Mark Sold</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteAd(viewAd.id)}>🗑 Delete</button>
                </>
              )}
              {cu?.role === "admin" && cu?.id !== viewAd.user_id && (
                <button className="btn btn-danger btn-sm" onClick={() => deleteAd(viewAd.id)}>🗑 Remove Ad</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setViewAd(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Post/Edit Form Modal */}
      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" style={{ maxWidth:560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editAd ? "✏️ Edit Ad" : "📢 Post an Ad"}</div>

            <div className="form-group">
              <label>Title *</label>
              <input value={form.title} onChange={e=>setF("title",e.target.value)} placeholder="e.g. Tokyo Marui M4A1 RECOIL SHOCK" autoFocus />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={e=>setF("category",e.target.value)}>
                  {CATEGORIES.filter(c=>c.id!=="all").map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Condition</label>
                <select value={form.condition} onChange={e=>setF("condition",e.target.value)}>
                  {Object.entries(CONDITIONS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Price (£) *</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e=>setF("price",e.target.value)} placeholder="0.00" />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea value={form.description} onChange={e=>setF("description",e.target.value)} placeholder="Describe the item — age, usage, any faults, what's included..." rows={4} style={{ resize:"vertical" }} />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div className="form-group">
                <label>Contact Method</label>
                <select value={form.contact_method} onChange={e=>setF("contact_method",e.target.value)}>
                  <option value="site">Message on site</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone/WhatsApp</option>
                </select>
              </div>
              <div className="form-group">
                <label>Contact Details</label>
                <input value={form.contact_details} onChange={e=>setF("contact_details",e.target.value)} placeholder={form.contact_method === "site" ? "Leave blank" : form.contact_method === "email" ? "your@email.com" : "07xxx xxxxxx"} />
              </div>
            </div>

            <div className="form-group">
              <label>Photos <span style={{ color:"var(--muted)", fontSize:10 }}>(up to 4 images)</span></label>
              <ImageUploader images={form.images||[]} onChange={imgs => setF("images", imgs)} />
            </div>

            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={saveAd} disabled={busy}>{busy ? "Saving…" : editAd ? "Save Changes" : "Post Ad"}</button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
