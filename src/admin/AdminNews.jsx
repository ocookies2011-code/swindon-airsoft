// admin/AdminNews.jsx — manage news posts
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { renderMd } from "../utils";

const BLANK = { title:"", body:"", category:"update", pinned:false, published:true, author_name:"Swindon Airsoft", image:"" };
const CATS = ["update","event","safety","community"];

export function AdminNews({ showToast }) {
  const [posts, setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null); // null | "new" | post.id
  const [form, setForm]     = useState(BLANK);
  const [busy, setBusy]     = useState(false);
  const [preview, setPreview] = useState(false);
  const [del, setDel]       = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("news_posts").select("*")
      .order("pinned",{ascending:false}).order("created_at",{ascending:false});
    setPosts(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(BLANK); setModal("new"); setPreview(false); };
  const openEdit = (p) => { setForm({ ...p }); setModal(p.id); setPreview(false); };
  const sf = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const save = async () => {
    if (!form.title.trim()) { showToast("Title required","red"); return; }
    setBusy(true);
    try {
      if (modal === "new") {
        await supabase.from("news_posts").insert({ ...form, updated_at:new Date().toISOString() });
        showToast("Post created","green");
      } else {
        await supabase.from("news_posts").update({ ...form, updated_at:new Date().toISOString() }).eq("id", modal);
        showToast("Post saved","green");
      }
      await load();
      setModal(null);
    } catch(e) { showToast(e.message,"red"); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    await supabase.from("news_posts").delete().eq("id", del.id);
    showToast("Deleted"); await load(); setDel(null);
  };

  const fmtDate = d => new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  const catColors = { update:"#4fc3f7", event:"#c8ff00", safety:"#ef5350", community:"#d4a017" };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">News & Updates</div><div className="page-sub">Manage the public news feed</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ New Post</button>
      </div>

      {loading ? <div style={{ padding:40, textAlign:"center", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>LOADING...</div> : (
        <div className="card" style={{ padding:0 }}>
          {posts.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>NO POSTS YET — CREATE YOUR FIRST</div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Title</th><th style={{width:90}}>Category</th><th style={{width:70}}>Status</th>
                <th style={{width:70}}>Pinned</th><th style={{width:110}}>Date</th><th style={{width:110}}></th>
              </tr></thead>
              <tbody>
                {posts.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight:600 }}>{p.title}</td>
                    <td><span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".1em", color:catColors[p.category]||"#aaa", border:`1px solid ${catColors[p.category]||"#aaa"}44`, padding:"2px 8px" }}>{p.category.toUpperCase()}</span></td>
                    <td>{p.published ? <span className="tag tag-green">Live</span> : <span className="tag">Draft</span>}</td>
                    <td style={{ textAlign:"center" }}>{p.pinned ? "📌" : "—"}</td>
                    <td style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>{fmtDate(p.created_at)}</td>
                    <td>
                      <div style={{ display:"flex", gap:6, flexWrap:"nowrap" }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(p)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDel(p)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div className="modal-title">{modal==="new"?"New Post":"Edit Post"}</div>
              <div style={{ display:"flex", gap:8 }}>
                <button className={`btn btn-sm ${preview?"btn-primary":"btn-ghost"}`} onClick={() => setPreview(v=>!v)}>
                  {preview?"✏ Edit":"👁 Preview"}
                </button>
              </div>
            </div>
            {preview ? (
              <div style={{ background:"#080b06", border:"1px solid var(--border)", padding:20, minHeight:200 }}>
                <div style={{ fontFamily:"'Oswald',sans-serif", fontSize:22, fontWeight:700, color:"#fff", textTransform:"uppercase", marginBottom:12 }}>{form.title||"(no title)"}</div>
                <div style={{ fontSize:14, color:"#8aaa60", lineHeight:1.75 }} dangerouslySetInnerHTML={{ __html: renderMd(form.body)||"(no body)" }}/>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group"><label>Title</label><input value={form.title} onChange={e=>sf("title",e.target.value)} placeholder="Post title…"/></div>
                  <div className="form-group"><label>Category</label>
                    <select value={form.category} onChange={e=>sf("category",e.target.value)}>
                      {CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group"><label>Body (Markdown supported)</label>
                  <textarea value={form.body} onChange={e=>sf("body",e.target.value)} rows={10} placeholder="Write your post content here… **bold**, _italic_, ## headings"/>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Banner Image URL (optional)</label><input value={form.image||""} onChange={e=>sf("image",e.target.value)} placeholder="https://…"/></div>
                  <div className="form-group"><label>Author Name</label><input value={form.author_name} onChange={e=>sf("author_name",e.target.value)}/></div>
                </div>
                <div style={{ display:"flex", gap:24, marginTop:8, flexWrap:"wrap" }}>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--text)" }}>
                    <input type="checkbox" checked={form.published} onChange={e=>sf("published",e.target.checked)}/> Published (visible to public)
                  </label>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--text)" }}>
                    <input type="checkbox" checked={form.pinned} onChange={e=>sf("pinned",e.target.checked)}/> Pinned (shown at top)
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
