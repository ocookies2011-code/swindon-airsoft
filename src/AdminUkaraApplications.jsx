// admin/AdminQA.jsx — Q&A / site rules CMS
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { uid } from "../utils";
import { logAction } from "./adminHelpers";

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

export { AdminQA };
