// admin/AdminGallery.jsx — gallery photo management
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { uid } from "../utils";
import { logAction } from "./adminHelpers";

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

export { AdminGallery };
