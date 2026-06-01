import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const MIL  = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };

const CONDITIONS = {
  new:      "New",
  like_new: "Like New",
  used:     "Used",
  spares:   "Spares/Repair",
};

const CATEGORIES = {
  rifle:"Rifle", pistol:"Pistol", gear:"Gear", clothing:"Clothing",
  accessories:"Accessories", ammo:"Ammo", other:"Other"
};

export function AdminClassifieds({ showToast }) {
  const [ads, setAds]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all"); // all | active | sold | withdrawn
  const [viewAd, setViewAd]   = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("classifieds")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      const userIds = [...new Set(data.map(a => a.user_id).filter(Boolean))];
      let profileMap = {};
      if (userIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, name, email, callsign").in("id", userIds);
        if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
      }
      setAds(data.map(a => ({ ...a, profiles: profileMap[a.user_id] || null })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => {
    const { error } = await supabase.from("classifieds").update({ status }).eq("id", id);
    if (error) showToast("Failed: " + error.message, "red");
    else { showToast(`✅ Ad marked as ${status}`); load(); setViewAd(null); }
  };

  const deleteAd = async (id) => {
    if (!window.confirm("Permanently delete this ad?")) return;
    await supabase.from("classifieds").delete().eq("id", id);
    showToast("Ad deleted");
    load();
    setViewAd(null);
  };

  const filtered = filter === "all" ? ads : ads.filter(a => a.status === filter);

  const counts = ads.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});

  return (
    <div style={{ padding:"24px 0" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ ...MIL, fontWeight:900, fontSize:24, color:"var(--accent)", letterSpacing:".08em", margin:0 }}>🛒 CLASSIFIEDS ADMIN</h2>
          <div style={{ ...MONO, fontSize:10, color:"var(--muted)", marginTop:4 }}>Manage member buy/sell ads</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
      </div>

      {/* Summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:10, marginBottom:20 }}>
        {[["all","All",null],["active","Active","#c8ff00"],["sold","Sold","#4fc3f7"],["withdrawn","Withdrawn","#f97316"]].map(([s,l,c]) => (
          <div key={s} onClick={() => setFilter(s)}
            style={{ background: filter===s ? "rgba(200,255,0,.08)" : "#0d1209", border:`1px solid ${filter===s ? "var(--accent)" : "var(--border)"}`, padding:"12px 14px", cursor:"pointer" }}>
            <div style={{ ...MONO, fontSize:9, color:"var(--muted)", marginBottom:4 }}>{l}</div>
            <div style={{ ...MIL, fontSize:24, fontWeight:900, color: c || "var(--text)" }}>{s==="all" ? ads.length : counts[s]||0}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ ...MONO, fontSize:11, color:"var(--muted)", padding:40, textAlign:"center" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"var(--muted)", ...MONO, fontSize:11 }}>No ads found</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)" }}>
                {["SELLER","TITLE","CATEGORY","CONDITION","PRICE","STATUS","POSTED",""].map(h => (
                  <th key={h} style={{ ...MONO, fontSize:9, color:"var(--muted)", letterSpacing:".12em", padding:"8px 10px", textAlign:"left", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ad => (
                <tr key={ad.id} style={{ borderBottom:"1px solid #0f1a08" }}>
                  <td style={{ padding:"10px 10px" }}>
                    <div style={{ fontWeight:700, fontSize:12 }}>{ad.profiles?.name || "—"}</div>
                    <div style={{ ...MONO, fontSize:9, color:"var(--muted)" }}>{ad.profiles?.email}</div>
                  </td>
                  <td style={{ padding:"10px 10px", maxWidth:200 }}>
                    <div style={{ fontWeight:600, color:"var(--accent)", cursor:"pointer" }} onClick={() => setViewAd(ad)}>{ad.title}</div>
                    {ad.description && <div style={{ fontSize:10, color:"var(--muted)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:180 }}>{ad.description}</div>}
                  </td>
                  <td style={{ padding:"10px 10px", ...MONO, fontSize:10, color:"var(--muted)", textTransform:"uppercase" }}>{CATEGORIES[ad.category]||ad.category}</td>
                  <td style={{ padding:"10px 10px", fontSize:11 }}>{CONDITIONS[ad.condition]||ad.condition}</td>
                  <td style={{ padding:"10px 10px", ...MIL, fontWeight:700, color:"var(--accent)" }}>£{Number(ad.price).toFixed(2)}</td>
                  <td style={{ padding:"10px 10px" }}>
                    <span style={{ ...MONO, fontSize:9, padding:"2px 8px", letterSpacing:".1em",
                      background: ad.status==="active" ? "rgba(200,255,0,.1)" : ad.status==="sold" ? "rgba(79,195,247,.1)" : "rgba(249,115,22,.1)",
                      color: ad.status==="active" ? "#c8ff00" : ad.status==="sold" ? "#4fc3f7" : "#f97316",
                      border: `1px solid ${ad.status==="active" ? "rgba(200,255,0,.3)" : ad.status==="sold" ? "rgba(79,195,247,.3)" : "rgba(249,115,22,.3)"}` }}>
                      {ad.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding:"10px 10px", ...MONO, fontSize:9, color:"var(--muted)", whiteSpace:"nowrap" }}>
                    {new Date(ad.created_at).toLocaleDateString("en-GB",{timeZone:"Europe/London",day:"2-digit",month:"short",year:"2-digit"})}
                  </td>
                  <td style={{ padding:"10px 10px" }}>
                    <div style={{ display:"flex", gap:4 }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize:10, padding:"3px 8px" }} onClick={() => setViewAd(ad)}>View</button>
                      {ad.status === "active" && <button className="btn btn-ghost btn-sm" style={{ fontSize:10, padding:"3px 8px" }} onClick={() => setStatus(ad.id, "withdrawn")}>Hide</button>}
                      {ad.status === "withdrawn" && <button className="btn btn-ghost btn-sm" style={{ fontSize:10, padding:"3px 8px" }} onClick={() => setStatus(ad.id, "active")}>Restore</button>}
                      <button className="btn btn-danger btn-sm" style={{ fontSize:10, padding:"3px 8px" }} onClick={() => deleteAd(ad.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Modal */}
      {viewAd && (
        <div className="overlay" onClick={() => setViewAd(null)}>
          <div className="modal-box" style={{ maxWidth:560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">🛒 Ad Detail</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
              {[
                ["Seller", viewAd.profiles?.name || "—"],
                ["Email", viewAd.profiles?.email || "—"],
                ["Title", viewAd.title],
                ["Price", `£${Number(viewAd.price).toFixed(2)}`],
                ["Category", CATEGORIES[viewAd.category]||viewAd.category],
                ["Condition", CONDITIONS[viewAd.condition]||viewAd.condition],
                ["Status", viewAd.status],
                ["Posted", new Date(viewAd.created_at).toLocaleString("en-GB",{timeZone:"Europe/London"})],
                ["Contact", viewAd.contact_method],
                ["Contact Details", viewAd.contact_details || "—"],
              ].map(([k,v]) => (
                <div key={k} style={{ background:"#0d1209", padding:"8px 10px" }}>
                  <div style={{ ...MONO, fontSize:9, color:"var(--muted)", marginBottom:2 }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{v}</div>
                </div>
              ))}
            </div>
            {viewAd.description && (
              <div style={{ background:"#080b06", border:"1px solid #1e2e12", padding:"10px 12px", marginBottom:12, fontSize:12, color:"#8aaa60", lineHeight:1.7, whiteSpace:"pre-wrap" }}>
                {viewAd.description}
              </div>
            )}
            {viewAd.images?.length > 0 && (
              <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                {viewAd.images.map((img,i) => <img key={i} src={img} alt="" style={{ height:100, width:140, objectFit:"cover", border:"1px solid #2a4018" }} />)}
              </div>
            )}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {viewAd.status === "active" && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(viewAd.id,"withdrawn")}>🚫 Hide Ad</button>}
              {viewAd.status === "withdrawn" && <button className="btn btn-primary btn-sm" onClick={() => setStatus(viewAd.id,"active")}>✅ Restore Ad</button>}
              {viewAd.status !== "sold" && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(viewAd.id,"sold")}>✅ Mark Sold</button>}
              <button className="btn btn-danger btn-sm" onClick={() => deleteAd(viewAd.id)}>🗑 Delete</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewAd(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
