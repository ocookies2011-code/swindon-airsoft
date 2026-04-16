import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import * as api from "./api";
import { squareRefund, waitlistApi, holdApi, normaliseProfile } from "./api";
import {
  renderMd, stockLabel, fmtErr,
  gmtShort, fmtDate, uid,
  EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY,
  detectCourier, trackKeyCache,
  AdminTrackStatusCell, TrackingBlock,
  useMobile, GmtClock, QRScanner,
  sendEmail, sendTicketEmail, sendEventReminderEmail,
  sendAdminBookingNotification,
  sendWaitlistNotifyEmail, sendDispatchEmail, sendNewEventEmail,
  sendReturnDecisionEmail, sendUkaraDecisionEmail, sendAdminUkaraNotification,
  WaiverModal,
  RankInsignia, DesignationInsignia, resetSquareConfig,
} from "./utils";
import { SUPERADMIN_EMAIL } from "./adminShared";

export function AdminGallery({ data, save, showToast }) {
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

export default function AdminQA({ data, save, showToast, cu }) {
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
function Divider() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16, margin:"40px 0" }}>
      <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
      <div style={{ color:"#c8ff00", fontSize:14, opacity:.5 }}>✦</div>
      <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
    </div>
  );
}

function AboutPage({ setPage }) {

  const InfoRow = ({ icon, children }) => (
    <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:14 }}>
      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{icon}</span>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#8aaa60", lineHeight:1.8 }}>{children}</div>
    </div>
  );
  const TimelineItem = ({ time, title, desc }) => (
    <div style={{ display:"flex", gap:0, marginBottom:0 }}>
      <div style={{ flexShrink:0, width:120, paddingTop:3, paddingBottom:24 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8ff00", letterSpacing:".08em", lineHeight:1.4 }}>{time}</div>
      </div>
      <div style={{ flex:1, borderLeft:"1px solid #2a3a10", paddingLeft:20, paddingBottom:24, position:"relative" }}>
        <div style={{ position:"absolute", left:-5, top:5, width:8, height:8, background:"#c8ff00", borderRadius:"50%", boxShadow:"0 0 8px rgba(200,255,0,.5)" }} />
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".1em", color:"#e8f0d8", textTransform:"uppercase", marginBottom:5 }}>{title}</div>
        {desc && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#5a7a40", lineHeight:1.8 }}>{desc}</div>}
      </div>
    </div>
  );
  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>

      {/* ── HEADER ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>
            ◈ — SWINDON AIRSOFT — OPERATIONAL BRIEF — ◈
          </div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            ABOUT <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>US</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, letterSpacing:".2em", color:"#5a7a30", marginTop:10 }}>
            RUN BY AIRSOFTERS, FOR AIRSOFTERS
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"48px 20px 100px" }}>

        {/* ── WELCOME CARD ── */}
        <div style={{ background:"linear-gradient(135deg,#0c1009,#0a0f07)", border:"1px solid #2a3a10", borderLeft:"4px solid #c8ff00", padding:"26px 30px", marginBottom:44, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", right:20, top:8, fontSize:80, opacity:.04, color:"#c8ff00", pointerEvents:"none", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, lineHeight:1 }}>SA</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, letterSpacing:".1em", color:"#c8ff00", textTransform:"uppercase", marginBottom:12 }}>
            Welcome to Swindon Airsoft
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#7a9a50", lineHeight:1.9 }}>
            Located just off <span style={{ color:"#c8ff00" }}>Junction 16 of the M4</span>, we bring you Swindon Airsoft — run by Airsofters for Airsofters. Whether you are a seasoned player or completely new to the sport, we have got you covered.
          </div>
        </div>

        {/* ── SECTION LABEL helper ── */}
        {/* ── NEED TO KNOW ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 01</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            NEED TO <span style={{ color:"#c8ff00" }}>KNOW</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px", marginBottom:44 }}>
          <InfoRow icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="#c8ff00" strokeWidth="1.4"/><circle cx="10" cy="10" r="4" stroke="#c8ff00" strokeWidth="1.4"/><circle cx="10" cy="10" r="1.5" fill="#c8ff00"/></svg>}>
            New to Airsoft? We have a limited number of <span style={{ color:"#c8ff00" }}>rental kits available to pre-book</span>. Full details on the rental kit can be found in our Shop.
          </InfoRow>
          <InfoRow icon="👶">
            Due to insurance requirements, the minimum age on site is <span style={{ color:"#c8ff00" }}>12 years with a parent or guardian playing</span>, or <span style={{ color:"#c8ff00" }}>14 years with a parent or guardian on-site</span>.
          </InfoRow>
          <InfoRow icon="🥾">
            As this is a woodland site, <span style={{ color:"#c8ff00" }}>boots are a MUST</span> at all times — no trainers or open footwear.
          </InfoRow>
          <InfoRow icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="4" y="2" width="12" height="16" rx="1" stroke="#c8ff00" strokeWidth="1.4"/><path d="M7 7h6M7 11h6M7 15h4" stroke="#c8ff00" strokeWidth="1.4" strokeLinecap="round"/></svg>}>
            Please ensure the <span style={{ color:"#c8ff00" }}>digital waiver is signed</span> before attending. You can do this from your Profile page.
          </InfoRow>
        </div>
        <Divider />

        {/* ── DAY SCHEDULE ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 02</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:24 }}>
            A DAY AT <span style={{ color:"#c8ff00" }}>SWINDON AIRSOFT</span>
          </div>
        </div>
        <TimelineItem time="08:00" title="Gates Open" desc="Arrive and be greeted with a free tea or coffee. Get yourself set up in the safe zone." />
        <TimelineItem time="08:45" title="Chrono" desc="All weapons are chronographed. Make sure your kit is prepped and ready to go." />
        <TimelineItem time="09:30" title="Morning Brief" desc="Led by one of our staff — we outline the site rules and make sure everyone knows what to expect on the day." />
        <TimelineItem time="10:00" title="First Game On" desc="Make sure you are kitted up and ready. First game kicks off — get stuck in!" />
        <TimelineItem time="12:30 – 13:00" title="Lunch Break" desc="We stop for lunch and set up the second half of the day. We have an onsite shop with drinks available. We recommend bringing your own lunch — there is also a local Co-op just down the road. Times can sometimes change." />
        <TimelineItem time="Afternoon" title="Second Half" desc="Back into it for the afternoon games until end of day." />

        <Divider />

        {/* ── LOCATION ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 03</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            HOW TO <span style={{ color:"#c8ff00" }}>FIND US</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px", marginBottom:44 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".08em", color:"#e8f0d8", marginBottom:16 }}>SWINDON AIRSOFT</div>
          <InfoRow icon="📍">
            <span>Manor Hl, Swindon, <span style={{ color:"#c8ff00", fontWeight:700 }}>SN5 4EG</span></span>
          </InfoRow>
          <InfoRow icon="🔤">
            What3Words: <span style={{ color:"#c8ff00" }}>///massaged.flasks.blunders</span>
          </InfoRow>
          <InfoRow icon="🛣️">
            Located just off Junction 16 of the M4 — easy to reach from all directions. A marshal will greet you on arrival.
          </InfoRow>
          <InfoRow icon="🚗">
            <span><span style={{ color:"#c8ff00" }}>Parking is limited</span> — car sharing is strongly encouraged where possible. A marshal will direct you where to park on arrival.</span>
          </InfoRow>
        </div>

        <Divider />

        {/* ── PRE-ORDERS ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:6 }}>▸ SECTION 04</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".12em", textTransform:"uppercase", color:"#e8f0d8", marginBottom:20 }}>
            PRE-<span style={{ color:"#c8ff00" }}>ORDERS</span>
          </div>
        </div>
        <div style={{ background:"#0a0f07", border:"1px solid #2a3a10", padding:"24px 26px" }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#7a9a50", lineHeight:1.9, marginBottom:20 }}>
            Want to order from{" "}
            <a href="https://www.airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
              style={{ color:"#c8ff00", textDecoration:"none", borderBottom:"1px solid rgba(200,255,0,.35)", paddingBottom:1 }}>
              Airsoft Armoury UK (www.airsoftarmoury.uk)
            </a>
            ? Place your order online and use code{" "}
            <span style={{ color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em" }}>COLLECTION</span>
            {" "}at checkout — we will bring your products to game day.
          </div>
          <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.3)", padding:"14px 18px", display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ color:"#c8ff00", fontSize:22, flexShrink:0 }}>⚠</span>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".15em", color:"#c8ff00", textTransform:"uppercase" }}>
                Order Deadline
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#7a9a50", marginTop:4, lineHeight:1.6 }}>
                You MUST place your order by the Friday prior to game day — no exceptions.
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div style={{ textAlign:"center", marginTop:56 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".3em", color:"#3a5010", marginBottom:18 }}>▸ READY TO DEPLOY? ◂</div>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="btn btn-primary" style={{ padding:"13px 36px", fontSize:13, letterSpacing:".15em" }} onClick={() => setPage("events")}>
              BOOK A GAME DAY →
            </button>
            <button className="btn btn-ghost" style={{ padding:"13px 28px", fontSize:13, letterSpacing:".15em" }} onClick={() => setPage("contact")}>
              CONTACT US →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Staff Page (public) ──────────────────────────────────
function StaffPage({ staff = [] }) {
  const RANK_LABELS = {
    1: "OWNER",
    2: "SENIOR MARSHAL",
    3: "MARSHAL",
  };
  const RANK_PIPS = { 1: 5, 2: 4, 3: 3 };
  const getRankLabel = r => RANK_LABELS[r] || "MARSHAL";

  const tiers = staff.reduce((acc, member) => {
    // rank_order 4 is a legacy value — treat as Marshal (3)
    const rank = member.rank_order === 4 ? 3 : member.rank_order;
    const existingTier = acc.find(tier => tier.rank === rank);
    if (existingTier) existingTier.members.push(member);
    else acc.push({ rank, members: [member] });
    return acc;
  }, []).sort((tierA, tierB) => tierA.rank - tierB.rank);

  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>

      {/* ── HEADER ── */}
      <div style={{ position:"relative", overflow:"hidden", background:"linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom:"2px solid #2a3a10", padding:"52px 24px 44px" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents:"none" }} />
        {/* Corner brackets */}
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:28, height:28, zIndex:2,
            top:v==="top"?14:"auto", bottom:v==="bottom"?14:"auto",
            left:h==="left"?14:"auto", right:h==="right"?14:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center", position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>
            ◈ — SWINDON AIRSOFT — PERSONNEL DOSSIER — ◈
          </div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
            CHAIN OF <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>COMMAND</span>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>
            ▸ FIELD OPERATIONS — AUTHORISED PERSONNEL ONLY ◂
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:22, justifyContent:"center" }}>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
            <div style={{ color:"#c8ff00", fontSize:18, opacity:.6 }}>✦</div>
            <div style={{ flex:1, maxWidth:160, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 80px" }}>

        {/* Empty */}
        {staff.length === 0 && (
          <div style={{ textAlign:"center", padding:80, fontFamily:"'Share Tech Mono',monospace", color:"#2a3a10", fontSize:11, letterSpacing:".2em" }}>
            NO PERSONNEL ON FILE
          </div>
        )}

        {/* Tiers */}
        {tiers.map((tier, tierIdx) => (
          <div key={tier.rank}>
            {/* Connector from above */}
            {tierIdx > 0 && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", margin:"0 0 0" }}>
                <div style={{ width:1, height:28, background:"linear-gradient(to bottom,#2a3a10,transparent)" }} />
                <div style={{ color:"#2a3a10", fontSize:10 }}>▼</div>
              </div>
            )}

            {/* Rank label */}
            <div style={{ display:"flex", alignItems:"center", margin: tierIdx===0 ? "36px 0 28px" : "4px 0 28px" }}>
              <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#1e2c0a)" }} />
              <div style={{
                fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11,
                letterSpacing:".3em", textTransform:"uppercase",
                padding:"5px 22px", margin:"0 12px",
                color: tier.rank===1 ? "#c8a000" : tier.rank===2 ? "#c8ff00" : "#3a5010",
                border:`1px solid ${tier.rank===1 ? "rgba(200,160,0,.4)" : tier.rank===2 ? "rgba(200,255,0,.2)" : "#1a2808"}`,
                background: tier.rank===1 ? "rgba(200,160,0,.06)" : "rgba(200,255,0,.02)",
                whiteSpace:"nowrap", position:"relative",
              }}>
                {Array.from({length: RANK_PIPS[tier.rank] || 1}).map((_,i) => (
                  <span key={i} style={{ marginRight:3, opacity:.7 }}>★</span>
                ))}
                {getRankLabel(tier.rank)}
              </div>
              <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#1e2c0a)" }} />
            </div>

            {/* Cards */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:20, justifyContent:"center", paddingBottom:8 }}>
              {tier.members.map(member => (
                <StaffCard key={member.id} member={member} rank={tier.rank} pips={RANK_PIPS[tier.rank] || 1} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffCard({ member, rank, pips }) {
  const isOwner   = rank === 1;
  const isCommand = rank === 2;  // Senior Marshal
  const gold   = "#c8a000";
  const green  = "#c8ff00";
  const accent = isOwner ? gold : isCommand ? green : "#4a6820";
  const border = isOwner ? "rgba(200,160,0,.35)" : isCommand ? "rgba(200,255,0,.18)" : "#1a2808";
  const bg     = isOwner
    ? "linear-gradient(180deg,#171200 0%,#0c0b06 100%)"
    : "linear-gradient(180deg,#0c1009 0%,#080a06 100%)";

  return (
    <div style={{
      width:210, overflow:"hidden", position:"relative",
      background:bg, border:`1px solid ${border}`,
      boxShadow: isOwner ? `0 0 40px rgba(200,160,0,.12), inset 0 1px 0 rgba(200,160,0,.06)` : `inset 0 1px 0 rgba(200,255,0,.02)`,
      transition:"transform .2s, box-shadow .2s",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-5px)";
        e.currentTarget.style.boxShadow = isOwner
          ? "0 16px 48px rgba(200,160,0,.22), inset 0 1px 0 rgba(200,160,0,.1)"
          : "0 10px 36px rgba(200,255,0,.07), inset 0 1px 0 rgba(200,255,0,.04)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = isOwner
          ? "0 0 40px rgba(200,160,0,.12), inset 0 1px 0 rgba(200,160,0,.06)"
          : "inset 0 1px 0 rgba(200,255,0,.02)";
      }}
    >
      {/* Scanlines */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.07) 3px,rgba(0,0,0,.07) 4px)", pointerEvents:"none", zIndex:5 }} />

      {/* ID strip */}
      <div style={{ background:"rgba(0,0,0,.7)", borderBottom:`1px solid ${border}`, padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:6, position:"relative" }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:accent, opacity:.6 }}>SA · FIELD PASS</div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:accent, opacity:.4 }}>
          {Array.from({length:pips}).map((_,i)=><span key={i}>★</span>)}
        </div>
      </div>

      {/* Photo */}
      <div style={{ width:"100%", height:195, background:"#060805", overflow:"hidden", position:"relative" }}>
        {member.photo
          ? <img src={member.photo} alt={member.name} onError={e=>{e.target.style.display='none';}} style={{ width:"100%", height:"100%", objectFit:"contain", objectPosition:"center", filter:"contrast(1.05) saturate(0.85)" }} />
          : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0a0c08", gap:8 }}>
              <div style={{ fontSize:52, opacity:.08 }}>👤</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#1e2c0a" }}>NO PHOTO ON FILE</div>
            </div>
        }
        {/* Gradient overlay */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:70, background:"linear-gradient(to top,rgba(8,10,6,.98),transparent)", zIndex:2 }} />
        {/* Corner brackets on photo */}
        {[["top","left"],["top","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:14, height:14, zIndex:3, top:7,
            left:h==="left"?7:"auto", right:h==="right"?7:"auto",
            borderTop:`1px solid ${accent}`, opacity:.5,
            borderLeft:h==="left"?`1px solid ${accent}`:"none",
            borderRight:h==="right"?`1px solid ${accent}`:"none",
          }} />
        ))}
        {/* Rank badge for owner */}
        {isOwner && (
          <div style={{ position:"absolute", top:8, right:8, background:gold, color:"#000", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:8, letterSpacing:".15em", padding:"2px 8px", zIndex:4 }}>
            ★ C/O
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding:"12px 12px 10px", position:"relative", zIndex:6 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:17, letterSpacing:".1em", color: isOwner ? gold : "#dce8c8", textTransform:"uppercase", lineHeight:1.15, marginBottom:5 }}>
          {member.name}
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".16em", color:accent, opacity:.85, marginBottom:8 }}>
          ▸ {member.job_title}
        </div>
        {/* Rank bar */}
        <div style={{ display:"flex", gap:2, marginBottom: member.bio ? 10 : 4 }}>
          {Array.from({length:5}).map((_,i) => (
            <div key={i} style={{ flex:1, height:2, background: i < pips ? accent : "#141a0e", borderRadius:1 }} />
          ))}
        </div>
        {member.bio && (
          <div style={{ fontSize:11, color:"#7a9a58", lineHeight:1.65, borderTop:"1px solid #141a0e", paddingTop:8, fontFamily:"'Share Tech Mono',monospace" }}>
            {member.bio}
          </div>
        )}
      </div>

      {/* Barcode footer */}
      <div style={{ borderTop:`1px solid ${border}`, padding:"4px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", zIndex:6, position:"relative" }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".08em" }}>
          {member.id ? member.id.slice(0,8).toUpperCase() : "--------"}
        </div>
        <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
          {Array.from({length:18},(_,i) => (
            <div key={i} style={{ background:border, width:i%3===0?2:1, height:3+Math.abs(Math.sin(i*1.9)*6), borderRadius:1, opacity:.7 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin Staff ────────────────────────────────────────────
