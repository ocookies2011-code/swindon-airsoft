// admin/AdminGallery.jsx — gallery photo management
import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { uid } from "../utils";
import { logAction } from "./adminHelpers";

function AdminGallery({ data, save, showToast }) {
  const [urlInput, setUrlInput]       = useState({});
  const [uploading, setUploading]     = useState({});
  const [expanded, setExpanded]       = useState({});
  const [delConfirm, setDelConfirm]   = useState(null);
  const [newAlbumModal, setNewAlbumModal] = useState(false);
  const [newAlbumName, setNewAlbumName]   = useState("");
  const [lightbox, setLightbox]       = useState(null); // { url, albumId, index }
  const [view, setView]               = useState("grid"); // "grid" | "list"
  const [busyNewAlbum, setBusyNewAlbum] = useState(false);

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const addAlbum = async () => {
    if (!newAlbumName.trim()) return;
    setBusyNewAlbum(true);
    try {
      const created = await api.gallery.createAlbum(newAlbumName.trim());
      const albums  = await api.gallery.getAll();
      save({ albums });
      showToast("Album created!");
      setExpanded(p => ({ ...p, [created?.id || newAlbumName]: true }));
      setNewAlbumModal(false);
      setNewAlbumName("");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusyNewAlbum(false); }
  };

  const deleteAlbum = async (albumId) => {
    try {
      await api.gallery.deleteAlbum(albumId);
      save({ albums: await api.gallery.getAll() });
      showToast("Album deleted.");
      setDelConfirm(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const addImg = async (albumId, url) => {
    if (!url.trim()) return;
    try {
      await api.gallery.addImageUrl(albumId, url.trim());
      save({ albums: await api.gallery.getAll() });
      setUrlInput(p => ({ ...p, [albumId]: "" }));
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const handleFiles = async (albumId, e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";
    setUploading(prev => ({ ...prev, [albumId]: { done: 0, total: files.length, errors: 0 } }));
    let done = 0, errors = 0;
    for (const file of files) {
      try { await api.gallery.uploadImage(albumId, file); done++; }
      catch { errors++; }
      setUploading(prev => ({ ...prev, [albumId]: { done, total: files.length, errors } }));
    }
    save({ albums: await api.gallery.getAll() });
    setUploading(prev => { const n = { ...prev }; delete n[albumId]; return n; });
    if (errors === 0) showToast(`✅ ${done} image${done !== 1 ? "s" : ""} uploaded!`);
    else showToast(`Uploaded ${done}, ${errors} failed.`, "red");
    setExpanded(p => ({ ...p, [albumId]: true }));
  };

  const removeImg = async (albumId, url) => {
    try {
      await api.gallery.removeImage(albumId, url);
      save({ albums: await api.gallery.getAll() });
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  // Lightbox keyboard nav
  useEffect(() => {
    if (!lightbox) return;
    const album = data.albums.find(a => a.id === lightbox.albumId);
    const handler = (e) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight" && album) setLightbox(l => ({ ...l, index: Math.min(l.index + 1, album.images.length - 1), url: album.images[Math.min(l.index + 1, album.images.length - 1)] }));
      if (e.key === "ArrowLeft" && album) setLightbox(l => ({ ...l, index: Math.max(l.index - 1, 0), url: album.images[Math.max(l.index - 1, 0)] }));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox, data.albums]);

  const totalPhotos = data.albums.reduce((s, a) => s + a.images.length, 0);

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Gallery</div>
          <div className="page-sub">{data.albums.length} album{data.albums.length !== 1 ? "s" : ""} · {totalPhotos} photo{totalPhotos !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {/* View toggle */}
          <div style={{ display:"flex", gap:4 }}>
            {[{v:"grid",icon:"⊞"},{v:"list",icon:"☰"}].map(({v,icon}) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding:"6px 10px", fontSize:14, cursor:"pointer",
                background: view===v ? "rgba(200,255,0,.15)" : "rgba(255,255,255,.05)",
                border: view===v ? "1px solid rgba(200,255,0,.4)" : "1px solid rgba(255,255,255,.1)",
                color: view===v ? "var(--accent)" : "var(--muted)",
              }}>{icon}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setNewAlbumModal(true)}>+ New Album</button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {data.albums.length === 0 && (
        <div style={{ border:"1px dashed rgba(200,255,0,.2)", padding:60, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📷</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".1em", color:"var(--muted)", textTransform:"uppercase", marginBottom:8 }}>No Albums Yet</div>
          <div style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>Create your first album to start uploading photos</div>
          <button className="btn btn-primary" onClick={() => setNewAlbumModal(true)}>+ Create First Album</button>
        </div>
      )}

      {/* ── Album grid view ── */}
      {view === "grid" && data.albums.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
          {data.albums.map(album => {
            const upState = uploading[album.id];
            const cover   = album.images[0];
            const cover2  = album.images[1];
            const cover3  = album.images[2];
            return (
              <div key={album.id} style={{ background:"#111", border:"1px solid #1e1e1e", overflow:"hidden", transition:"border-color .15s", position:"relative" }}
                onMouseEnter={e => e.currentTarget.style.borderColor="rgba(200,255,0,.3)"}
                onMouseLeave={e => e.currentTarget.style.borderColor="#1e1e1e"}>

                {/* Album title — above the mosaic */}
                <div style={{ padding:"10px 14px 8px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #1a1a1a" }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:"#fff" }}>{album.title}</div>
                    <div style={{ fontSize:10, color:"var(--muted)", marginTop:2, fontFamily:"'Share Tech Mono',monospace" }}>{album.images.length} PHOTO{album.images.length !== 1 ? "S" : ""}</div>
                  </div>
                  <button onClick={() => setDelConfirm(album.id)}
                    style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", color:"var(--red)", fontSize:12, width:26, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
                </div>

                {/* Cover mosaic */}
                <div style={{ height:160, display:"grid", gridTemplateColumns: cover2 ? "2fr 1fr" : "1fr", gridTemplateRows: cover3 ? "1fr 1fr" : "1fr", gap:2, background:"#0a0a0a", cursor:"pointer" }}
                  onClick={() => toggleExpand(album.id)}>
                  {cover
                    ? <img src={cover} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", gridRow: cover2 ? "1 / 3" : "1", filter:"saturate(.8)" }} />
                    : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, color:"#2a2a2a", gridRow: "1 / 3" }}>📷</div>
                  }
                  {cover2 && <img src={cover2} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", filter:"saturate(.8)" }} />}
                  {cover3 && <img src={cover3} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", filter:"saturate(.8)" }} />}
                  {/* Photo count overlay */}
                  {album.images.length > 3 && (
                    <div style={{ position:"absolute", bottom:8, right:8, background:"rgba(0,0,0,.75)", color:"#fff", fontSize:11, fontFamily:"'Share Tech Mono',monospace", padding:"2px 8px", letterSpacing:".08em" }}>
                      +{album.images.length - 3} more
                    </div>
                  )}
                </div>

                {/* Album actions */}
                <div style={{ padding:"10px 14px" }}>

                  {/* Upload progress */}
                  {upState && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ height:3, background:"#1a1a1a", marginBottom:4 }}>
                        <div style={{ height:"100%", width:(upState.done/upState.total*100)+"%", background:"var(--accent)", transition:"width .2s" }} />
                      </div>
                      <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>UPLOADING {upState.done}/{upState.total}</div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display:"flex", gap:6 }}>
                    <label style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"7px 0", cursor: upState ? "default" : "pointer", opacity: upState ? .5 : 1,
                      background:"var(--accent)", color:"#000", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".1em", textTransform:"uppercase",
                      clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)" }}>
                      📷 Upload Photos
                      <input type="file" accept="image/*" multiple style={{ display:"none" }} disabled={!!upState} onChange={e => handleFiles(album.id, e)} />
                    </label>
                    <button onClick={() => toggleExpand(album.id)} style={{
                      padding:"7px 12px", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.1)",
                      color:"var(--muted)", cursor:"pointer", fontSize:12, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".1em",
                      clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)" }}>
                      {expanded[album.id] ? "▲ HIDE" : "▼ VIEW"}
                    </button>
                  </div>
                </div>

                {/* Expanded photo grid */}
                {expanded[album.id] && (
                  <div style={{ borderTop:"1px solid #1a1a1a", padding:"12px 14px" }}>
                    {/* URL input */}
                    <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                      <input value={urlInput[album.id] || ""} onChange={e => setUrlInput(p => ({...p,[album.id]:e.target.value}))}
                        placeholder="Paste image URL to add…" style={{ flex:1, fontSize:12 }} />
                      <button className="btn btn-sm btn-ghost" onClick={() => addImg(album.id, urlInput[album.id] || "")}>Add</button>
                    </div>
                    {album.images.length === 0
                      ? <div style={{ padding:20, textAlign:"center", border:"1px dashed #2a2a2a", color:"var(--muted)", fontSize:12 }}>No photos yet</div>
                      : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))", gap:4 }}>
                          {album.images.map((img, i) => (
                            <div key={i} style={{ position:"relative", paddingTop:"100%", background:"#0a0a0a", overflow:"hidden" }}>
                              <img src={img} alt="" onClick={() => setLightbox({ url:img, albumId:album.id, index:i })}
                                style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", cursor:"zoom-in", transition:"opacity .15s" }}
                                onMouseEnter={e => e.currentTarget.style.opacity=".7"}
                                onMouseLeave={e => e.currentTarget.style.opacity="1"}
                              />
                              <button onClick={() => removeImg(album.id, img)}
                                style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,.85)", border:"none", color:"#fff", width:18, height:18, fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Album list view ── */}
      {view === "list" && data.albums.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {data.albums.map(album => {
            const upState = uploading[album.id];
            const cover   = album.images[0];
            return (
              <div key={album.id} style={{ background:"#111", border:"1px solid #1e1e1e", borderLeft:"3px solid rgba(200,255,0,.25)", overflow:"hidden" }}>
                {/* List row header */}
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", cursor:"pointer" }} onClick={() => toggleExpand(album.id)}>
                  {/* Cover */}
                  <div style={{ width:60, height:60, flexShrink:0, background:"#0a0a0a", overflow:"hidden", border:"1px solid #2a2a2a" }}>
                    {cover
                      ? <img src={cover} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", filter:"saturate(.7)" }} />
                      : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"#333" }}>📷</div>
                    }
                  </div>
                  {/* Info */}
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:15, color:"#fff" }}>{album.title}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", marginTop:3 }}>
                      {album.images.length} PHOTO{album.images.length !== 1 ? "S" : ""}
                      {album.images.length > 0 && <span style={{ color:"rgba(200,255,0,.4)", marginLeft:10 }}>▸ {Math.ceil(album.images.length / 4)} row{Math.ceil(album.images.length / 4) !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  {/* Strip preview */}
                  <div style={{ display:"flex", gap:2, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                    {album.images.slice(0, 4).map((img, i) => (
                      <img key={i} src={img} alt="" style={{ width:36, height:36, objectFit:"cover", border:"1px solid #1a1a1a", cursor:"zoom-in" }}
                        onClick={() => setLightbox({ url:img, albumId:album.id, index:i })} />
                    ))}
                    {album.images.length > 4 && <div style={{ width:36, height:36, background:"#1a1a1a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>+{album.images.length-4}</div>}
                  </div>
                  {/* Controls */}
                  <div style={{ display:"flex", gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                    <label style={{ cursor: upState ? "default" : "pointer", opacity: upState ? .5 : 1,
                      display:"inline-flex", alignItems:"center", gap:5, padding:"6px 12px",
                      background:"var(--accent)", color:"#000", fontFamily:"'Barlow Condensed',sans-serif",
                      fontWeight:800, fontSize:11, letterSpacing:".1em",
                      clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)" }}>
                      {upState ? `${upState.done}/${upState.total}…` : "📷 Upload"}
                      <input type="file" accept="image/*" multiple style={{ display:"none" }} disabled={!!upState} onChange={e => handleFiles(album.id, e)} />
                    </label>
                    <button onClick={() => setDelConfirm(album.id)} className="btn btn-sm btn-danger">Del</button>
                  </div>
                  <span style={{ color:"var(--muted)", fontSize:12, transition:"transform .2s", display:"inline-block", transform: expanded[album.id] ? "rotate(180deg)" : "none" }}>▾</span>
                </div>

                {/* Upload progress bar */}
                {upState && (
                  <div style={{ padding:"0 16px 10px" }}>
                    <div style={{ height:3, background:"#1a1a1a" }}>
                      <div style={{ height:"100%", width:(upState.done/upState.total*100)+"%", background:"var(--accent)", transition:"width .2s" }} />
                    </div>
                  </div>
                )}

                {/* Expanded photos */}
                {expanded[album.id] && (
                  <div style={{ borderTop:"1px solid #1a1a1a", padding:"12px 16px" }}>
                    <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                      <input value={urlInput[album.id] || ""} onChange={e => setUrlInput(p => ({...p,[album.id]:e.target.value}))}
                        placeholder="Paste image URL…" style={{ flex:1, fontSize:12 }} />
                      <button className="btn btn-sm btn-ghost" onClick={() => addImg(album.id, urlInput[album.id] || "")}>Add</button>
                    </div>
                    {album.images.length === 0
                      ? <div style={{ padding:20, textAlign:"center", border:"1px dashed #2a2a2a", color:"var(--muted)", fontSize:12 }}>No photos yet</div>
                      : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))", gap:4 }}>
                          {album.images.map((img, i) => (
                            <div key={i} style={{ position:"relative", paddingTop:"100%", background:"#0a0a0a" }}>
                              <img src={img} alt="" onClick={() => setLightbox({ url:img, albumId:album.id, index:i })}
                                style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", cursor:"zoom-in", transition:"opacity .15s" }}
                                onMouseEnter={e => e.currentTarget.style.opacity=".7"}
                                onMouseLeave={e => e.currentTarget.style.opacity="1"}
                              />
                              <button onClick={() => removeImg(album.id, img)}
                                style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,.85)", border:"none", color:"#fff", width:18, height:18, fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── New Album Modal ── */}
      {newAlbumModal && (
        <div className="overlay" onClick={() => setNewAlbumModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Album</div>
            <div className="form-group">
              <label>Album Name</label>
              <input autoFocus value={newAlbumName} onChange={e => setNewAlbumName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addAlbum()}
                placeholder="e.g. Sunday Skirmish 15-06-2026" />
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => { setNewAlbumModal(false); setNewAlbumName(""); }}>Cancel</button>
              <button className="btn btn-primary" onClick={addAlbum} disabled={busyNewAlbum || !newAlbumName.trim()}>
                {busyNewAlbum ? "Creating…" : "Create Album"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Album Confirm ── */}
      {delConfirm && (() => {
        const album = data.albums.find(a => a.id === delConfirm);
        return (
          <div className="overlay" onClick={() => setDelConfirm(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div style={{ marginBottom:6 }}>
                <div className="hazard-stripe red" />
              </div>
              <div className="modal-title" style={{ color:"var(--red)" }}>Delete Album?</div>
              <p style={{ fontSize:13, color:"var(--muted)", margin:"12px 0 20px" }}>
                This will permanently delete <strong style={{ color:"var(--text)" }}>{album?.title}</strong> and all {album?.images.length} photo{album?.images.length !== 1 ? "s" : ""} in it. This cannot be undone.
              </p>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setDelConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteAlbum(delConfirm)}>Delete Album</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Lightbox ── */}
      {lightbox && (() => {
        const album = data.albums.find(a => a.id === lightbox.albumId);
        const canPrev = lightbox.index > 0;
        const canNext = album && lightbox.index < album.images.length - 1;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.95)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}
            onClick={() => setLightbox(null)}>
            {/* Close */}
            <button onClick={() => setLightbox(null)} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", color:"#fff", fontSize:28, cursor:"pointer", opacity:.7, lineHeight:1 }}>✕</button>
            {/* Counter */}
            {album && <div style={{ position:"absolute", top:20, left:"50%", transform:"translateX(-50%)", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"rgba(255,255,255,.5)", letterSpacing:".15em" }}>{lightbox.index+1} / {album.images.length}</div>}
            {/* Prev */}
            {canPrev && <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index:l.index-1, url:album.images[l.index-1] })); }}
              style={{ position:"absolute", left:20, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.2)", color:"#fff", fontSize:24, width:44, height:44, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>}
            {/* Image */}
            <img src={lightbox.url} alt="" onClick={e => e.stopPropagation()}
              style={{ maxWidth:"90vw", maxHeight:"85vh", objectFit:"contain", border:"1px solid rgba(255,255,255,.1)", boxShadow:"0 0 80px rgba(0,0,0,.8)" }} />
            {/* Next */}
            {canNext && <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index:l.index+1, url:album.images[l.index+1] })); }}
              style={{ position:"absolute", right:20, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.2)", color:"#fff", fontSize:24, width:44, height:44, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>}
            {/* ESC hint */}
            <div style={{ position:"absolute", bottom:20, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"rgba(255,255,255,.3)", letterSpacing:".15em" }}>ESC TO CLOSE · ← → TO NAVIGATE</div>
          </div>
        );
      })()}
    </div>
  );
}

export { AdminGallery };
