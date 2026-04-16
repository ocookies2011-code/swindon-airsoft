import React, { useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { fmtErr, renderMd } from "./utils";
import { logAction } from "./adminShared";

function AdminGallery({ data, save, showToast }) {
  const [urlInput, setUrlInput]     = useState({});
  const [uploading, setUploading]   = useState({});
  const [expanded, setExpanded]     = useState({}); // { albumId: bool }
  const [delConfirm, setDelConfirm] = useState(null); // albumId

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const addAlbum = async () => {
    const name = prompt("Album name:"); if (!name) return;
    try {
      const created = await api.gallery.createAlbum(name);
      const albums = await api.gallery.getAll();
      save({ albums });
      showToast("Album created!");
      // Auto-expand the new album
      setExpanded(p => ({ ...p, [created?.id || name]: true }));
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const deleteAlbum = async (albumId) => {
    try {
      await api.gallery.deleteAlbum(albumId);
      save({ albums: await api.gallery.getAll() });
      showToast("Album deleted.", "red");
      setDelConfirm(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const addImg = async (albumId, url) => {
    try {
      await api.gallery.addImageUrl(albumId, url);
      save({ albums: await api.gallery.getAll() });
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const handleFiles = async (albumId, e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";
    setUploading(prev => ({ ...prev, [albumId]: { done: 0, total: files.length, errors: 0 } }));
    let done = 0, errors = 0;
    for (const file of files) {
      try {
        await api.gallery.uploadImage(albumId, file);
        done++;
      } catch { errors++; }
      setUploading(prev => ({ ...prev, [albumId]: { done, total: files.length, errors } }));
    }
    save({ albums: await api.gallery.getAll() });
    setUploading(prev => { const n = { ...prev }; delete n[albumId]; return n; });
    if (errors === 0) showToast(`✅ ${done} image${done !== 1 ? "s" : ""} uploaded!`);
    else showToast(`Uploaded ${done}, ${errors} failed.`, "red");
  };

  const removeImg = async (albumId, url) => {
    try {
      await api.gallery.removeImage(albumId, url);
      save({ albums: await api.gallery.getAll() });
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Gallery</div></div>
        <button className="btn btn-primary" onClick={addAlbum}>+ New Album</button>
      </div>

      {data.albums.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
          No albums yet. Click <strong>+ New Album</strong> to create one.
        </div>
      )}

      {data.albums.map(album => {
        const upState  = uploading[album.id];
        const isOpen   = !!expanded[album.id];
        const cover    = album.images[0];

        return (
          <div key={album.id} className="card mb-2">
            {/* Album header row — always visible */}
            <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={() => toggleExpand(album.id)}>
              {/* Cover thumbnail */}
              <div style={{ width:52, height:52, flexShrink:0, background:"#0a0c08", border:"1px solid #1a2808", overflow:"hidden", borderRadius:3 }}>
                {cover
                  ? <img src={cover} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", filter:"saturate(.7)" }} />
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#2a3a10" }}>🖼</div>
                }
              </div>
              {/* Title + count */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{album.title}</div>
                <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{album.images.length} photo{album.images.length !== 1 ? "s" : ""}</div>
              </div>
              {/* Controls */}
              <div style={{ display:"flex", gap:6, alignItems:"center" }} onClick={e => e.stopPropagation()}>
                <label className="btn btn-sm btn-primary" style={{ cursor: upState ? "default" : "pointer", opacity: upState ? .7 : 1, whiteSpace:"nowrap" }}>
                  {upState ? `${upState.done}/${upState.total}…` : "📷 Upload"}
                  <input type="file" accept="image/*" multiple style={{ display:"none" }} disabled={!!upState} onChange={e => handleFiles(album.id, e)} />
                </label>
                <button className="btn btn-sm btn-danger" onClick={() => setDelConfirm(album.id)}>🗑 Delete</button>
              </div>
              {/* Chevron */}
              <div style={{ color:"var(--muted)", fontSize:12, flexShrink:0, transition:"transform .2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>▾</div>
            </div>

            {/* Upload progress */}
            {upState && (
              <div style={{ marginTop:10 }}>
                <div style={{ height:4, background:"var(--bg4)", borderRadius:2, overflow:"hidden", marginBottom:4 }}>
                  <div style={{ height:"100%", width:(upState.done/upState.total*100)+"%", background:"var(--accent)", borderRadius:2, transition:"width .2s" }} />
                </div>
                <div style={{ fontSize:11, color:"var(--muted)" }}>{upState.done} of {upState.total} uploaded{upState.errors > 0 ? ` · ${upState.errors} failed` : ""}</div>
              </div>
            )}

            {/* Expanded content */}
            {isOpen && (
              <div style={{ marginTop:14, borderTop:"1px solid var(--border)", paddingTop:14 }}>
                <div className="gap-2 mb-2">
                  <input value={urlInput[album.id] || ""} onChange={e => setUrlInput(p => ({ ...p, [album.id]: e.target.value }))} placeholder="Or paste image URL…" style={{ flex:1 }} />
                  <button className="btn btn-sm btn-ghost" onClick={() => { if (urlInput[album.id]) { addImg(album.id, urlInput[album.id]); setUrlInput(p => ({ ...p, [album.id]:"" })); } }}>Add URL</button>
                </div>
                {album.images.length === 0
                  ? <div style={{ padding:"24px", textAlign:"center", border:"1px dashed #2a3a10", color:"var(--muted)", fontSize:12 }}>No photos yet — upload some above.</div>
                  : <div className="photo-grid">
                      {album.images.map((img, i) => (
                        <div key={i} className="photo-cell">
                          <img src={img} alt="" />
                          <button style={{ position:"absolute", top:4, right:4, background:"var(--red)", border:"none", color:"#fff", borderRadius:"50%", width:22, height:22, cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}
                            onClick={() => removeImg(album.id, img)}>✕</button>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}
          </div>
        );
      })}

      {/* Delete album confirmation overlay */}
      {delConfirm && (() => {
        const album = data.albums.find(a => a.id === delConfirm);
        return (
          <div className="overlay" onClick={() => setDelConfirm(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:12, color:"var(--red)" }}>Delete Album?</div>
              <p style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>
                This will permanently delete <strong style={{ color:"var(--text)" }}>{album?.title}</strong> and all {album?.images.length} image{album?.images.length !== 1 ? "s" : ""} in it. This cannot be undone.
              </p>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setDelConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteAlbum(delConfirm)}>Delete Album</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Admin Q&A ─────────────────────────────────────────────
// ── Simple rich-text helpers ──────────────────────────────
function insertMarkdown(text, setText, before, after = "") {
  // Find the active textarea - if focus was lost use the last known textarea
  const ta = document.activeElement?.tagName === "TEXTAREA" ? document.activeElement : null;
  if (!ta) {
    // No active textarea - just append to end
    setText(text + before + after);
    return;
  }
  const selStart = ta.selectionStart ?? text.length;
  const selEnd = ta.selectionEnd ?? text.length;
  const sel = text.slice(selStart, selEnd);
  const newVal = text.slice(0, selStart) + before + sel + after + text.slice(selEnd);
  const newCursor = selStart + before.length + sel.length + after.length;
  setText(newVal);
  // Restore cursor after React re-render
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(newCursor, newCursor);
  });
}

// Render answer markdown for public QA page
function renderQAAnswer(text) {
  if (!text) return null;
  // Parse basic markdown: **bold**, *italic*, # headings, - lists, ![alt](url) images, bare URLs
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Heading
    if (line.startsWith("### ")) return <h4 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:"#fff", margin:"10px 0 4px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(4)}</h4>;
    if (line.startsWith("## "))  return <h3 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:"var(--accent)", margin:"12px 0 6px", letterSpacing:".04em", textTransform:"uppercase" }}>{line.slice(3)}</h3>;
    if (line.startsWith("# "))   return <h2 key={i} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, color:"var(--accent)", margin:"14px 0 8px" }}>{line.slice(2)}</h2>;
    // Image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) return <img key={i} src={imgMatch[2]} alt={imgMatch[1]} style={{ maxWidth:"100%", margin:"8px 0", borderRadius:2 }} />;
    // List item
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", fontSize:13, color:"var(--muted)" }}><span style={{ color:"var(--accent)", flexShrink:0 }}>▸</span>{renderInline(line.slice(2))}</div>;
    }
    // Blank line
    if (line.trim() === "") return <div key={i} style={{ height:8 }} />;
    // Normal paragraph
    return <p key={i} style={{ fontSize:13, color:"var(--muted)", lineHeight:1.8, margin:"2px 0" }}>{renderInline(line)}</p>;
  });
}

function renderInline(text) {
  // Split by **bold**, *italic*, or backtick code spans
  const INLINE_RE = new RegExp("(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|" + String.fromCharCode(96) + "[^" + String.fromCharCode(96) + "]+" + String.fromCharCode(96) + ")", "g");
  const TICK = String.fromCharCode(96);
  const parts = text.split(INLINE_RE);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color:"#fff", fontWeight:700 }}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("*")  && p.endsWith("*"))  return <em key={i} style={{ color:"var(--accent)", fontStyle:"italic" }}>{p.slice(1,-1)}</em>;
    if (p.startsWith(TICK) && p.endsWith(TICK)) return <code key={i} style={{ background:"#1a1a1a", padding:"1px 5px", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--accent)" }}>{p.slice(1,-1)}</code>;
    return p;
  });
}

function AdminQA({ data, save, showToast, cu }) {
  const blank = { q: "", a: "", image: "" };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [qaList, setQaList] = useState(data.qa || []);
  const fq = v => setForm(p => ({ ...p, q: v }));
  const fa = v => setForm(p => ({ ...p, a: v }));

  const refreshQA = async () => {
    const { data: freshData } = await supabase
      .from('qa_items').select('id, question, answer, sort_order').order('created_at', { ascending: true });
    const sorted = (freshData || []).slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
    const mapped = sorted.map(i => ({ id: i.id, q: i.question, a: i.answer, image: '', sort_order: i.sort_order }));
    setQaList(mapped);
    save({ qa: mapped });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `qa/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("gallery").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("gallery").getPublicUrl(path);
      const url = urlData.publicUrl;
      setForm(p => ({ ...p, a: p.a + (p.a && !p.a.endsWith("\n") ? "\n" : "") + `![image](${url})\n`, image: url }));
      showToast("Image uploaded!");
    } catch (err) { showToast("Upload failed: " + err.message, "red"); }
    finally { setUploading(false); }
  };

  const [qaSaving, setQASaving] = useState(false);
  // Safety reset — if stuck, clicking the button area will unstick it
  useEffect(() => { if (qaSaving) { const qaSaveTimer = setTimeout(() => setQASaving(false), 10000); return () => clearTimeout(qaSaveTimer); } }, [qaSaving]);
  const dragIdx = useRef(null);
  const dragOver = useRef(null);

  const save_ = async () => {
    if (!form.q.trim() || !form.a.trim()) { showToast("Fill in both question and answer", "red"); return; }
    // Snapshot editId at call time — never trust stale state
    const currentEditId = editId || null;
    const wasEditing = !!currentEditId;
    setQASaving(true);
    try {
      let result;
      if (wasEditing) {
        result = await supabase.from('qa_items').update({ question: form.q, answer: form.a }).eq('id', currentEditId);
      } else {
        const { data: maxData } = await supabase.from('qa_items').select('sort_order').order('sort_order', { ascending: false }).limit(1);
        const nextOrder = maxData?.[0]?.sort_order != null ? maxData[0].sort_order + 1 : 0;
        result = await supabase.from('qa_items').insert({ question: form.q, answer: form.a, sort_order: nextOrder });
      }
      if (result.error) throw new Error(result.error.message || result.error.code || JSON.stringify(result.error));
      setEditId(null);
      setForm(blank);
      setPreview(false);
      await refreshQA();
      showToast(wasEditing ? "✓ Q&A updated!" : "✓ Q&A added!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: wasEditing ? "Q&A updated" : "Q&A created", detail: form.q?.slice(0, 80) });
    } catch (e) {
      console.error("QA save failed:", e);
      showToast("Save failed: " + (e?.message || JSON.stringify(e)), "red");
    } finally {
      setQASaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this Q&A?")) return;
    const item = (data?.qa || []).find(q => q.id === id);
    try {
      await api.qa.delete(id);
      await refreshQA();
      showToast("Deleted");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Q&A deleted", detail: item?.question?.slice(0, 80) || id });
    } catch (e) {
      console.error("QA delete failed:", e);
      showToast("Delete failed: " + (e?.message || e?.code || JSON.stringify(e)), "red");
    }
  };

  const startEdit = (item) => { setForm({ q: item.q, a: item.a, image: item.image || "" }); setEditId(item.id); setPreview(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancel = () => { setForm(blank); setEditId(null); setPreview(false); };
  // Reset form when component unmounts (e.g. navigating away mid-edit)
  useEffect(() => () => { setForm(blank); setEditId(null); }, []);

  const toolbar = [
    { label: "B",  title: "Bold",        action: () => insertMarkdown(form.a, fa, "**", "**") },
    { label: "I",  title: "Italic",      action: () => insertMarkdown(form.a, fa, "*", "*") },
    { label: "#",  title: "Heading",     action: () => insertMarkdown(form.a, fa, "## ") },
    { label: "—",  title: "Subheading",  action: () => insertMarkdown(form.a, fa, "### ") },
    { label: "• ", title: "List item",   action: () => insertMarkdown(form.a, fa, "- ") },
    { label: "` `",title: "Code",        action: () => insertMarkdown(form.a, fa, "`", "`") },
  ];

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Q&amp;A Manager</div><div className="page-sub">Supports **bold**, *italic*, ## headings, - lists, and images</div></div></div>

      <div className="card mb-2">
        <div style={{ fontWeight:700, fontSize:15, marginBottom:14, color:"var(--accent)" }}>{editId ? "✏️ Edit Q&A" : "➕ New Q&A"}</div>
        <div className="form-group"><label>Question</label><input value={form.q} onChange={e => fq(e.target.value)} placeholder="e.g. What should I wear?" /></div>

        {/* Toolbar */}
        <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
          {toolbar.map(t => (
            <button key={t.label} type="button" title={t.title}
              onMouseDown={e => { e.preventDefault(); t.action(); }}
              style={{ background:"#1a1a1a", border:"1px solid #333", color:"#fff", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2 }}>
              {t.label}
            </button>
          ))}
          <label title="Upload image" style={{ background:"#1a1a1a", border:"1px solid #333", color:uploading ? "var(--muted)" : "var(--accent)", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2, display:"flex", alignItems:"center", gap:4 }}>
            🖼 {uploading ? "Uploading…" : "Add Image"}
            <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageUpload} disabled={uploading} />
          </label>
          <button type="button" onClick={() => setPreview(p => !p)}
            style={{ background: preview ? "var(--accent)" : "#1a1a1a", border:"1px solid #333", color: preview ? "#000" : "#fff", padding:"4px 10px", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, cursor:"pointer", borderRadius:2, marginLeft:"auto" }}>
            👁 {preview ? "Edit" : "Preview"}
          </button>
        </div>

        {preview ? (
          <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", padding:"12px 16px", minHeight:80, borderRadius:2 }}>
            {renderQAAnswer(form.a)}
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom:0 }}>
            <label>Answer (Markdown supported)</label>
            <textarea rows={6} value={form.a} onChange={e => fa(e.target.value)} placeholder="Write your answer here. Use the toolbar above for formatting." />
          </div>
        )}

        <div className="gap-2 mt-2">
          <button type="button" className="btn btn-primary" onClick={save_} disabled={qaSaving}>{qaSaving ? "Saving…" : editId ? "Save Changes" : "Add Q&A"}</button>
          {editId && <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel</button>}
        </div>
      </div>

      {qaList.length === 0 && <div style={{ textAlign:"center", color:"var(--muted)", padding:32 }}>No Q&A items yet.</div>}
      {qaList.length > 0 && <div style={{ fontSize:11, color:"var(--muted)", marginBottom:8, textAlign:"right" }}>⠿ Drag to reorder</div>}
      {qaList.map((item, idx) => (
        <div key={item.id}
          draggable
          onDragStart={e => { e.dataTransfer.effectAllowed = "move"; dragIdx.current = idx; }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move";
            const el = e.currentTarget;
            const over = dragOver.current;
            if (over !== idx) { dragOver.current = idx; el.style.borderTop = idx < dragIdx.current ? "2px solid var(--accent)" : "none"; el.style.borderBottom = idx > dragIdx.current ? "2px solid var(--accent)" : "none"; }
          }}
          onDragLeave={e => { e.currentTarget.style.borderTop = "none"; e.currentTarget.style.borderBottom = "none"; }}
          onDrop={e => {
            e.currentTarget.style.borderTop = "none"; e.currentTarget.style.borderBottom = "none";
            const from = dragIdx.current; const to = dragOver.current;
            if (from === null || from === to) return;
            const reordered = [...data.qa];
            const [moved] = reordered.splice(from, 1);
            reordered.splice(to, 0, moved);
            // Update sort_order on each item
            const withOrder = reordered.map((q, i) => ({ ...q, sort_order: i }));
            setQaList(withOrder);
            save({ qa: withOrder });
            dragIdx.current = null; dragOver.current = null;
            // Persist new order to Supabase
            withOrder.forEach(q =>
              supabase.from('qa_items').update({ sort_order: q.sort_order }).eq('id', q.id).then(r => {
                if (r.error) console.error('sort_order save failed:', r.error);
              })
            );
          }}
          onDragEnd={e => { e.currentTarget.style.borderTop = "none"; e.currentTarget.style.borderBottom = "none"; dragIdx.current = null; dragOver.current = null; }}
          className="card mb-1" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, cursor:"grab" }}>
          <div style={{ color:"var(--muted)", fontSize:18, paddingTop:2, flexShrink:0, cursor:"grab" }}>⠿</div>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <span style={{ background:"var(--accent)", color:"#000", fontSize:9, fontWeight:800, padding:"2px 6px", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".1em" }}>Q{idx+1}</span>
              <span style={{ fontWeight:700, fontSize:14, color:"#fff" }}>{item.q}</span>
            </div>
            <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.6 }}>{(item.a || "").slice(0, 120)}{(item.a || "").length > 120 ? "…" : ""}</div>
          </div>
          <div className="gap-2" style={{ flexShrink:0 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => startEdit(item)}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => del(item.id)}>Del</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── About Page ────────────────────────────────────────────
// Shared section divider used by AboutPage, TermsPage etc.

export { AdminGallery, insertMarkdown, renderQAAnswer, renderInline };
export default AdminQA;
