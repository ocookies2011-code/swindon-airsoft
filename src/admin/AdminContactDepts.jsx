// admin/AdminContactDepts.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { logAction } from "./adminHelpers";
import { fmtErr } from "../utils";

function AdminContactDepts({ showToast, save, cu }) {
  const [depts, setDepts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]  = useState(false);
  const [modal, setModal]    = useState(null); // null | "new" | index
  const [form, setForm]      = useState({ name:"", email:"", description:"" });
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api.settings.get("contact_departments")
      .then(raw => { try { setDepts(JSON.parse(raw || "[]")); } catch { setDepts([]); } })
      .catch(() => setDepts([]))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (updated) => {
    setSaving(true);
    try {
      await api.settings.set("contact_departments", JSON.stringify(updated));
      setDepts(updated);
      // Refresh global data so ContactPage sees new depts immediately
      save({ contactDepartments: updated });
      showToast("Departments saved!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Contact departments saved", detail: `${updated.length} department(s)` });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const openNew  = () => { setForm({ name:"", email:"", description:"" }); setModal("new"); };
  const openEdit = (i) => { setForm({ ...depts[i] }); setModal(i); };

  const saveDept = async () => {
    if (!form.name.trim())  { showToast("Name is required", "red"); return; }
    if (!form.email.trim() || !form.email.includes("@")) { showToast("Valid email required", "red"); return; }
    const updated = modal === "new"
      ? [...depts, { name: form.name.trim(), email: form.email.trim(), description: form.description.trim() }]
      : depts.map((d, i) => i === modal ? { name: form.name.trim(), email: form.email.trim(), description: form.description.trim() } : d);
    await persist(updated);
    setModal(null);
  };

  const deleteDept = async (i) => {
    await persist(depts.filter((_, idx) => idx !== i));
  };

  const moveUp   = (i) => { if (i === 0) return; const deptsArr = [...depts]; [deptsArr[i-1], deptsArr[i]] = [deptsArr[i], deptsArr[i-1]]; persist(deptsArr); };
  const moveDown = (i) => { if (i === depts.length-1) return; const deptsArr = [...depts]; [deptsArr[i], deptsArr[i+1]] = [deptsArr[i+1], deptsArr[i]]; persist(deptsArr); };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contact Departments</div>
          <div className="page-sub">Manage the dropdown options and destination emails on the Contact Us page</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Department</button>
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>Loading…</div>}

      {!loading && depts.length === 0 && (
        <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>
          No departments yet. Click <strong>+ Add Department</strong> to get started.
        </div>
      )}

      {!loading && depts.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Order</th><th>Department</th><th>Email Address</th><th>Description</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {depts.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                        <button className="btn btn-sm btn-ghost" style={{ padding:"2px 6px", fontSize:10 }} onClick={() => moveUp(i)} disabled={i === 0 || saving}>▲</button>
                        <button className="btn btn-sm btn-ghost" style={{ padding:"2px 6px", fontSize:10 }} onClick={() => moveDown(i)} disabled={i === depts.length-1 || saving}>▼</button>
                      </div>
                    </td>
                    <td style={{ fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".06em", color:"var(--accent)", textTransform:"uppercase" }}>{d.name}</td>
                    <td style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>{d.email}</td>
                    <td style={{ fontSize:12, color:"var(--muted)", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.description || "—"}</td>
                    <td>
                      <div className="gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(i)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteDept(i)} disabled={saving}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:12 }}>Emails are never shown publicly — they only receive the contact form submissions.</div>
        </div>
      )}

      {modal !== null && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:480 }}>
            <div className="modal-title">{modal === "new" ? "➕ Add Department" : `✏️ Edit — ${depts[modal]?.name}`}</div>

            <div className="form-group">
              <label>Department Name *</label>
              <input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="e.g. Bookings, General, Marshals" />
            </div>
            <div className="form-group">
              <label>Email Address * <span style={{ color:"var(--muted)", fontWeight:400 }}>(not shown publicly)</span></label>
              <input value={form.email} onChange={e => ff("email", e.target.value)} placeholder="department@example.com" type="email" />
            </div>
            <div className="form-group">
              <label>Description <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional — shown to users in dropdown)</span></label>
              <textarea rows={2} value={form.description} onChange={e => ff("description", e.target.value)} placeholder="e.g. For questions about booking events and game days" />
            </div>

            <div className="gap-2" style={{ marginTop:18 }}>
              <button className="btn btn-primary" onClick={saveDept} disabled={saving}>{saving ? "Saving…" : modal === "new" ? "Add Department" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Test Card ────────────────────────────────────────

export { AdminContactDepts };
