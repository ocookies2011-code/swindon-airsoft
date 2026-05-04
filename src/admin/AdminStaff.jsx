// admin/AdminStaff.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtErr, uid } from "../utils";
import { diffFields, logAction } from "./adminHelpers";

const blank = { name: "", jobTitle: "", bio: "", photo: "", rankOrder: 3 };
function AdminStaff({ showToast, cu }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState(blank);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const RANK_OPTIONS = [
    { value: 1, label: "1 — Owner" },
    { value: 2, label: "2 — Senior Marshal" },
    { value: 3, label: "3 — Marshal" },
  ];

  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadStaff = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    api.staff.getAll()
      .then(data => { setStaffList(data); })
      .catch(e => { setLoadError(e.message || "Failed to load staff"); showToast("Failed to load staff: " + e.message, "red"); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    loadStaff();
    const onVisible = () => { if (document.visibilityState === "visible") loadStaff(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadStaff]);

  const openNew = () => { setForm(blank); setModal("new"); };
  const openEdit = (m) => { setForm({ name: m.name, jobTitle: m.job_title, bio: m.bio || "", photo: m.photo || "", rankOrder: m.rank_order, _orig: { name: m.name, jobTitle: m.job_title, bio: m.bio || "", rankOrder: m.rank_order } }); setModal(m); };

  const handlePhotoFile = async (e, existingId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (existingId) {
      setUploading(true);
      try { const url = await api.staff.uploadPhoto(existingId, file); ff("photo", url); showToast("Photo uploaded!"); }
      catch (err) { showToast("Upload failed: " + err.message, "red"); }
      finally { setUploading(false); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => ff("photo", reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name.trim()) { showToast("Name is required", "red"); return; }
    if (!form.jobTitle.trim()) { showToast("Job title is required", "red"); return; }
    setBusy(true);
    try {
      if (modal === "new") {
        const photoData = form.photo?.startsWith("data:") ? form.photo : "";
        const created = await api.staff.create({ ...form, photo: "" });
        if (photoData && created?.id) {
          const res = await fetch(photoData);
          const blob = await res.blob();
          const file = new File([blob], "photo.jpg", { type: blob.type });
          await api.staff.uploadPhoto(created.id, file);
        }
      } else {
        await api.staff.update(modal.id, form);
      }
      showToast(modal === "new" ? "Staff member added!" : "Staff member updated!");
      if (modal === "new") {
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member added", detail: `Name: ${form.name} | Role: ${form.jobTitle} | Rank order: ${form.rankOrder ?? "?"}` });
      } else {
        const SLABELS = { name: "Name", jobTitle: "Job title", bio: "Bio", rankOrder: "Rank order" };
        const sDiff = diffFields(form._orig || {}, { name: form.name, jobTitle: form.jobTitle, bio: form.bio, rankOrder: form.rankOrder }, SLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member updated", detail: `${form.name}${sDiff ? ` | ${sDiff}` : " (no changes)"}` });
      }
      setModal(null);
      loadStaff(true); // silent refresh — no loading flash
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.staff.delete(deleteConfirm.id);
      showToast("Staff member removed", "red");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Staff member removed", detail: deleteConfirm.name || deleteConfirm.id });
      setDeleteConfirm(null); loadStaff(true);
    }
    catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Staff</div><div className="page-sub">Manage chain of command — changes appear live on the Staff page</div></div>
        <div className="gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff(true)}>🔄 Refresh</button>
          <button className="btn btn-primary" onClick={openNew}>+ Add Staff Member</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading...</div>}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 13 }}>⚠️ {loadError}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => loadStaff()}>🔄 Try Again</button>
        </div>
      )}
      {!loading && !loadError && staffList.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No staff added yet. Click <strong>+ Add Staff Member</strong> to get started.</div>
      )}
      {!loading && !loadError && staffList.length > 0 && (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Photo</th><th>Name</th><th>Job Title</th><th>Rank</th><th>Bio</th><th>Actions</th></tr></thead>
            <tbody>
              {staffList.map(m => (
                <tr key={m.id}>
                  <td>{m.photo ? <img src={m.photo} alt={m.name} onError={e=>{e.target.style.display='none';e.target.nextSibling&&(e.target.nextSibling.style.display='flex');}} style={{ width: 40, height: 40, borderRadius: 2, objectFit: "cover" }} /> : <div style={{ width: 40, height: 40, background: "var(--bg3)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--muted)" }}>👤</div>}</td>
                  <td style={{ fontWeight: 700 }}>{m.name}</td>
                  <td style={{ color: "var(--accent)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".05em" }}>{m.job_title}</td>
                  <td><span style={{ fontSize: 11, color: m.rank_order === 1 ? "var(--gold)" : "var(--muted)", fontFamily: "'Oswald','Barlow Condensed',sans-serif" }}>{RANK_OPTIONS.find(r => r.value === m.rank_order)?.label || `Rank ${m.rank_order}`}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.bio || "—"}</td>
                  <td><div className="gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(m)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(m)}>Remove</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {modal !== null && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-title">{modal === "new" ? "➕ Add Staff Member" : `✏️ Edit — ${modal.name}`}</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ width: 90, height: 90, borderRadius: 4, overflow: "hidden", background: "#111", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.photo ? <img src={form.photo} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 36, opacity: .3 }}>👤</span>}
                </div>
                <label style={{ display: "block", marginTop: 8, cursor: "pointer" }}>
                  <div className="btn btn-sm btn-ghost" style={{ textAlign: "center", pointerEvents: "none" }}>{uploading ? "Uploading…" : "📷 Photo"}</div>
                  <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={e => handlePhotoFile(e, modal !== "new" ? modal.id : null)} />
                </label>
              </div>
              <div style={{ flex: 1 }}>
                <div className="form-group"><label>Full Name *</label><input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="e.g. John Smith" /></div>
                <div className="form-group"><label>Job Title *</label><input value={form.jobTitle} onChange={e => ff("jobTitle", e.target.value)} placeholder="e.g. Head Marshal" /></div>
              </div>
            </div>
            <div className="form-group">
              <label>Rank / Position</label>
              <select value={form.rankOrder} onChange={e => ff("rankOrder", Number(e.target.value))}>
                {RANK_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Lower number = higher up the chain of command.</div>
            </div>
            <div className="form-group">
              <label>Bio <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <textarea rows={3} value={form.bio} onChange={e => ff("bio", e.target.value)} placeholder="Short description shown on the staff card…" />
            </div>
            <div className="gap-2" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy || uploading}>{busy ? "Saving…" : modal === "new" ? "Add Member" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚠️ Remove Staff Member</div>
            <p style={{ color: "var(--muted)", marginBottom: 20 }}>Are you sure you want to remove <strong style={{ color: "var(--text)" }}>{deleteConfirm.name}</strong> from the staff page?</p>
            <div className="gap-2">
              <button className="btn btn-danger" onClick={confirmDelete} disabled={busy}>{busy ? "Removing…" : "Yes, Remove"}</button>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contact Page (public) ─────────────────────────────────

export { AdminStaff };
