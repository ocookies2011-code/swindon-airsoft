// admin/AdminNews.jsx — manage news posts
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { renderMd } from "../utils";

const BLANK = { title:"", body:"", category:"update", pinned:false, published:true, author_name:"Swindon Airsoft", image:"" };
const CATS  = ["update","event","safety","community"];
const CAT_COLORS = { update:"#4fc3f7", event:"#c8ff00", safety:"#ef5350", community:"#d4a017" };
const CAT_ICONS  = { update:"📡", event:"📅", safety:"⚠️", community:"🤝" };

// ── Toolbar button helper ───────────────────────────────
const TOOLBAR = [
  { label:"B",   title:"Bold",         wrap:["**","**"],    style:{fontWeight:900} },
  { label:"I",   title:"Italic",       wrap:["_","_"],      style:{fontStyle:"italic"} },
  { label:"H2",  title:"Heading 2",    line:"## ",          style:{fontSize:10} },
  { label:"H3",  title:"Heading 3",    line:"### ",         style:{fontSize:10} },
  { label:"•",   title:"Bullet list",  line:"- ",           style:{} },
  { label:"1.",  title:"Numbered list",line:"1. ",          style:{fontSize:10} },
  { label:"❝",   title:"Blockquote",   line:"> ",           style:{} },
  { label:"—",   title:"Divider",      insert:"\n---\n",    style:{} },
  { label:"🔗",  title:"Link",         wrap:["[","](url)"], style:{} },
  { label:"📷",  title:"Image",        insert:"![alt](url)", style:{} },
];

export function AdminNews({ showToast }) {
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [form, setForm]       = useState(BLANK);
  const [busy, setBusy]       = useState(false);
  const [preview, setPreview] = useState(false);
  const [del, setDel]         = useState(null);
  const [uploading, setUploading] = useState(false);
  const bannerRef = useRef(null);
  const taRef     = useRef(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("news_posts").select("*")
      .order("pinned",{ascending:false}).order("created_at",{ascending:false});
    setPosts(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew  = () => { setForm(BLANK); setModal("new"); setPreview(false); };
  const openEdit = (p) => { setForm({ ...p }); setModal(p.id); setPreview(false); };
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Image upload ──────────────────────────────────────
  const uploadBanner = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const path = `news/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("images").getPublicUrl(path);
      sf("image", publicUrl);
      showToast("Banner uploaded ✓");
    } catch(e) { showToast("Upload failed: " + e.message, "red"); }
    finally { setUploading(false); }
  };

  // ── Toolbar action ────────────────────────────────────
  const applyToolbar = (btn) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const val   = form.body || "";
    let newVal, cursor;
    if (btn.wrap) {
      const sel = val.slice(start, end) || "text";
      newVal  = val.slice(0, start) + btn.wrap[0] + sel + btn.wrap[1] + val.slice(end);
      cursor  = start + btn.wrap[0].length + sel.length + btn.wrap[1].length;
    } else if (btn.line) {
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      newVal  = val.slice(0, lineStart) + btn.line + val.slice(lineStart);
      cursor  = start + btn.line.length;
    } else {
      newVal  = val.slice(0, start) + btn.insert + val.slice(end);
      cursor  = start + btn.insert.length;
    }
    sf("body", newVal);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
  };

  const save = async () => {
    if (!form.title.trim()) { showToast("Title required", "red"); return; }
    setBusy(true);
    try {
      const payload = { ...form, updated_at: new Date().toISOString() };
      if (modal === "new") {
        await supabase.from("news_posts").insert(payload);
        showToast("Post created");
      } else {
        await supabase.from("news_posts").update(payload).eq("id", modal);
        showToast("Post saved");
      }
      await load(); setModal(null);
    } catch(e) { showToast(e.message, "red"); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    await supabase.from("news_posts").delete().eq("id", del.id);
    showToast("Deleted"); await load(); setDel(null);
  };

  const fmtDate = d => new Date(d).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">News & Updates</div>
          <div className="page-sub">Manage the public news feed</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Post</button>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:"center", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>LOADING...</div>
      ) : posts.length === 0 ? (
        <div className="card" style={{ textAlign:"center", color:"var(--muted)", padding:40 }}>No posts yet — create your first</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {posts.map(p => (
            <div key={p.id} style={{
              background:"#111", border:"1px solid #1e1e1e",
              borderLeft:`3px solid ${CAT_COLORS[p.category]||"#444"}`,
              display:"flex", alignItems:"center", gap:14, padding:"12px 16px",
              transition:"border-color .15s",
            }}>
              {/* Banner thumbnail */}
              {p.image
                ? <img src={p.image} alt="" style={{ width:52, height:52, objectFit:"cover", flexShrink:0, border:"1px solid #2a2a2a" }} />
                : <div style={{ width:52, height:52, flexShrink:0, background:"#1a1a1a", border:"1px dashed #2a2a2a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>{CAT_ICONS[p.category]||"📰"}</div>
              }

              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:3 }}>
                  {p.pinned && <span style={{ fontSize:11 }}>📌</span>}
                  <span style={{ fontWeight:700, fontSize:14, color:"#fff" }}>{p.title}</span>
                  {!p.published && <span className="tag tag-red" style={{fontSize:9,padding:"1px 6px"}}>DRAFT</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".12em", color:CAT_COLORS[p.category]||"#aaa", border:`1px solid ${CAT_COLORS[p.category]||"#aaa"}44`, padding:"1px 7px" }}>
                    {CAT_ICONS[p.category]} {p.category.toUpperCase()}
                  </span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"var(--muted)" }}>{fmtDate(p.created_at)}</span>
                  {p.author_name && <span style={{ fontSize:10, color:"var(--muted)" }}>by {p.author_name}</span>}
                </div>
              </div>

              {/* Status */}
              <div style={{ flexShrink:0 }}>
                {p.published ? <span className="tag tag-green" style={{fontSize:10}}>LIVE</span> : <span className="tag" style={{fontSize:10,background:"#222",color:"#666"}}>DRAFT</span>}
              </div>

              {/* Actions */}
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => openEdit(p)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => setDel(p)}>Del</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Post editor modal ── */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" style={{ maxWidth:860 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div className="modal-title" style={{ margin:0 }}>{modal==="new" ? "New Post" : "Edit Post"}</div>
              <button className={`btn btn-sm ${preview?"btn-primary":"btn-ghost"}`} onClick={() => setPreview(v=>!v)}>
                {preview ? "✏ Edit" : "👁 Preview"}
              </button>
            </div>

            {preview ? (
              <div style={{ background:"#080b06", border:"1px solid var(--border)", padding:24, minHeight:300, borderRadius:2 }}>
                {form.image && <img src={form.image} alt="" style={{ width:"100%", maxHeight:240, objectFit:"cover", marginBottom:20, display:"block" }} />}
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, fontWeight:900, color:"#fff", textTransform:"uppercase", letterSpacing:".04em", marginBottom:8 }}>{form.title||"(no title)"}</div>
                <div style={{ fontSize:11, color:CAT_COLORS[form.category]||"#aaa", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".15em", marginBottom:16 }}>
                  {CAT_ICONS[form.category]} {form.category.toUpperCase()} · {form.author_name}
                </div>
                <div style={{ fontSize:14, color:"#8aaa60", lineHeight:1.8 }} dangerouslySetInnerHTML={{ __html: renderMd(form.body)||"(no body)" }} />
              </div>
            ) : (
              <>
                {/* Title + Category */}
                <div className="form-row" style={{ marginBottom:14 }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label>Title</label>
                    <input value={form.title} onChange={e=>sf("title",e.target.value)} placeholder="Post title…" />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label>Category</label>
                    <select value={form.category} onChange={e=>sf("category",e.target.value)}>
                      {CATS.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                {/* Body editor with toolbar */}
                <div className="form-group">
                  <label>Body</label>
                  <div style={{ border:"1px solid var(--border)", borderRadius:2, overflow:"hidden" }}>
                    {/* Toolbar */}
                    <div style={{ display:"flex", gap:3, flexWrap:"wrap", padding:"6px 8px", background:"#1a1a1a", borderBottom:"1px solid var(--border)" }}>
                      {TOOLBAR.map(btn => (
                        <button key={btn.label} title={btn.title} type="button"
                          style={{ background:"#2a2a2a", border:"1px solid #333", color:"#ccc", minWidth:28, height:26, fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:2, padding:"0 6px", ...btn.style }}
                          onClick={() => applyToolbar(btn)}>
                          {btn.label}
                        </button>
                      ))}
                      <div style={{ width:1, background:"#333", margin:"0 4px" }} />
                      <span style={{ fontSize:10, color:"#555", alignSelf:"center", fontFamily:"'Share Tech Mono',monospace" }}>**bold** _italic_ ## h2 - list</span>
                    </div>
                    <textarea
                      ref={taRef}
                      value={form.body}
                      onChange={e=>sf("body",e.target.value)}
                      rows={12}
                      placeholder="Write your post…"
                      style={{ width:"100%", background:"#0d0d0d", border:"none", padding:"12px 14px", resize:"vertical", color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:"none", boxSizing:"border-box" }}
                    />
                  </div>
                </div>

                {/* Banner image */}
                <div className="form-group">
                  <label>Banner Image</label>
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start", flexWrap:"wrap" }}>
                    {form.image && (
                      <div style={{ position:"relative", width:120, height:70, flexShrink:0 }}>
                        <img src={form.image} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", border:"1px solid var(--border)" }} />
                        <button onClick={() => sf("image","")} title="Remove" style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,.8)", border:"none", color:"#fff", width:18, height:18, fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                      </div>
                    )}
                    <div style={{ flex:1, minWidth:200 }}>
                      <label style={{ display:"inline-flex", alignItems:"center", gap:8, cursor:"pointer", background:"var(--bg4)", border:"1px dashed var(--border)", padding:"8px 14px", fontSize:12, color:"var(--muted)", marginBottom:6 }}>
                        📷 {uploading ? "Uploading…" : form.image ? "Change image" : "Upload banner"}
                        <input type="file" accept="image/*" style={{ display:"none" }} ref={bannerRef} onChange={e => uploadBanner(e.target.files[0])} disabled={uploading} />
                      </label>
                      <div style={{ fontSize:11, color:"var(--muted)" }}>Or paste a URL:</div>
                      <input value={form.image||""} onChange={e=>sf("image",e.target.value)} placeholder="https://…" style={{ fontSize:12, marginTop:4 }} />
                    </div>
                  </div>
                </div>

                {/* Author + meta */}
                <div className="form-row" style={{ marginBottom:14 }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label>Author Name</label>
                    <input value={form.author_name} onChange={e=>sf("author_name",e.target.value)} />
                  </div>
                </div>
                <div style={{ display:"flex", gap:24, flexWrap:"wrap", marginBottom:4 }}>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--text)" }}>
                    <input type="checkbox" checked={form.published} onChange={e=>sf("published",e.target.checked)} /> Published (visible to public)
                  </label>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--text)" }}>
                    <input type="checkbox" checked={form.pinned} onChange={e=>sf("pinned",e.target.checked)} /> Pinned (shown at top)
                  </label>
                </div>
              </>
            )}

            <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy?"Saving…":"Save Post"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {del && (
        <div className="overlay" onClick={() => setDel(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Delete Post?</div>
            <p style={{ color:"var(--muted)", margin:"12px 0 20px", fontSize:14 }}>"{del.title}" will be permanently deleted.</p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
