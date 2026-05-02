// admin/AdminDiscountCodes.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtErr, fmtDate, tabBtn } from "../utils";
import { diffFields, logAction } from "./adminHelpers";

function AdminDiscountCodes({ data, showToast, cu }) {
  const EMPTY = { code: '', type: 'percent', value: '', maxUses: '', maxUsesPerUser: '', expiresAt: '', assignedUserIds: [], scope: 'all', active: true };
  const [codes, setCodes] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const isMounted = useRef(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('codes');

  // Reset busy state if tab was backgrounded while async was in flight
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") { setSaving(false); setDeleting(null); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const allUsers = data?.users || [];

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    try {
      setLoading(true);
      const [d, r] = await Promise.all([
        api.discountCodes.getAll(),
        api.discountCodes.getRedemptions(),
      ]);
      if (!isMounted.current) return;
      // Auto-deactivate any codes that have expired but are still marked active
      const now = new Date();
      const toDeactivate = d.filter(c => c.active && c.expires_at && new Date(c.expires_at) < now);
      if (toDeactivate.length > 0) {
        await Promise.all(toDeactivate.map(c =>
          api.discountCodes.update(c.id, {
            code: c.code, type: c.type, value: c.value,
            maxUses: c.max_uses, maxUsesPerUser: c.max_uses_per_user,
            expiresAt: c.expires_at, assignedUserIds: c.assigned_user_ids,
            scope: c.scope, active: false,
          }).catch(() => {})
        ));
        if (!isMounted.current) return;
        const refreshed = await api.discountCodes.getAll();
        if (isMounted.current) setCodes(refreshed);
      } else {
        if (isMounted.current) setCodes(d);
      }
      if (isMounted.current) setRedemptions(r);
    } catch (e) { if (isMounted.current) showToast(fmtErr(e), 'error'); }
    finally { if (isMounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const resetForm = () => { setForm(EMPTY); setEditId(null); setUserSearch(''); setShowForm(false); };

  const startEdit = (c) => {
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      maxUses: c.max_uses != null ? String(c.max_uses) : '',
      maxUsesPerUser: c.max_uses_per_user != null ? String(c.max_uses_per_user) : '',
      expiresAt: c.expires_at ? c.expires_at.slice(0, 10) : '',
      assignedUserIds: c.assigned_user_ids || [],
      scope: c.scope || 'all',
      active: c.active,
    });
    setEditId(c.id);
    setUserSearch('');
    setShowForm(true);
    setActiveTab('codes');
  };

  const handleSave = async () => {
    if (!form.code.trim()) return showToast('Code is required.', 'error');
    if (!form.value || isNaN(Number(form.value))) return showToast('Value is required.', 'error');
    if (form.type === 'percent' && (Number(form.value) <= 0 || Number(form.value) > 100))
      return showToast('Percent must be 1–100.', 'error');
    setSaving(true);
    try {
      if (editId) {
        const orig = codes.find(c => c.id === editId);
        await api.discountCodes.update(editId, form);
        showToast('Discount code updated.', 'success');
        const DLABELS = { code: "Code", type: "Type", value: "Value", maxUses: "Max uses", maxUsesPerUser: "Max per user", expiresAt: "Expires", scope: "Scope", active: "Active" };
        const dBefore = { code: orig?.code, type: orig?.type, value: String(orig?.value ?? ""), maxUses: String(orig?.max_uses ?? ""), maxUsesPerUser: String(orig?.max_uses_per_user ?? ""), expiresAt: orig?.expires_at?.slice(0,10) ?? "", scope: orig?.scope, active: String(orig?.active) };
        const dAfter  = { code: form.code, type: form.type, value: form.value, maxUses: form.maxUses, maxUsesPerUser: form.maxUsesPerUser, expiresAt: form.expiresAt, scope: form.scope, active: String(form.active) };
        const dDiff = diffFields(dBefore, dAfter, DLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Discount code updated", detail: `${form.code}${dDiff ? ` | ${dDiff}` : " (no changes)"}` });
      } else {
        await api.discountCodes.create(form);
        showToast('Discount code created.', 'success');
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Discount code created", detail: `Code: ${form.code} | Type: ${form.type} | Value: ${form.value} | Scope: ${form.scope} | Active: ${form.active}` });
      }
      resetForm();
      load();
    } catch (e) { showToast(fmtErr(e), 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this discount code and all its redemption history?')) return;
    const code = codes.find(c => c.id === id)?.code || id;
    setDeleting(id);
    try {
      await api.discountCodes.delete(id);
      showToast('Deleted.', 'success');
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Discount code deleted", detail: code });
      load();
    } catch (e) { showToast(fmtErr(e), 'error'); }
    finally { setDeleting(null); }
  };

  const toggleUser = (uid) => {
    setForm(f => ({
      ...f,
      assignedUserIds: f.assignedUserIds.includes(uid)
        ? f.assignedUserIds.filter(x => x !== uid)
        : [...f.assignedUserIds, uid],
    }));
  };

  const filteredUsers = allUsers.filter(u =>
    !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const assignedUsers = allUsers.filter(u => form.assignedUserIds.includes(u.id));

  const isExpired = (c) => c.expires_at && new Date(c.expires_at) < new Date();
  const isExhausted = (c) => c.max_uses != null && c.uses >= c.max_uses;

  const statusBadge = (c) => {
    if (!c.active && isExhausted(c)) return { label: 'Used up', color: 'var(--red)' };
    if (!c.active) return { label: 'Inactive', color: 'var(--muted)' };
    if (isExpired(c)) return { label: 'Expired', color: 'var(--red)' };
    if (isExhausted(c)) return { label: 'Used up', color: 'var(--red)' };
    return { label: 'Active', color: 'var(--accent)' };
  };

  const scopeLabel = (s) => ({ all: 'All', shop: 'Shop only', events: 'Events only' }[s] || s);

  const cs = { fontFamily: "'Oswald','Barlow Condensed',sans-serif" };

  // Group redemptions by code id for the history tab
  const redemptionsByCode = redemptions.reduce((acc, r) => {
    acc[r.code_id] = acc[r.code_id] || [];
    acc[r.code_id].push(r);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...cs, fontSize: 26, fontWeight: 900, letterSpacing: '.06em', margin: 0 }}>🏷️ DISCOUNT CODES</h2>
        <button className="btn btn-accent" onClick={() => { resetForm(); setShowForm(true); setActiveTab('codes'); }}>+ New Code</button>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
        {[
          { id:"codes",   label:"Codes" },
          { id:"history", label:"Redemption History", count: redemptions.length },
        ].map(t => (
          <button key={t.id} style={tabBtn(activeTab===t.id)} onClick={() => setActiveTab(t.id)}>
            {t.label}
            {t.count > 0 && <span style={{ background: activeTab===t.id ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.1)", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:800 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Form ── */}
      {showForm && activeTab === 'codes' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h3 style={{ ...cs, fontSize: 18, fontWeight: 800, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {editId ? '✏️ Edit Code' : '➕ New Code'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Code *
              <input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. SUMMER20" style={{ textTransform: 'uppercase' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Type *
              <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount (£)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Value * {form.type === 'percent' ? '(%)' : '(£)'}
              <input className="input" type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder={form.type === 'percent' ? '10' : '5.00'} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Scope
              <select className="input" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}>
                <option value="all">All (shop + events)</option>
                <option value="shop">Shop only</option>
                <option value="events">Events only</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Use Limit
              <input className="input" type="number" min="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                placeholder="Unlimited" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Per-User Limit
              <input className="input" type="number" min="1" value={form.maxUsesPerUser} onChange={e => setForm(f => ({ ...f, maxUsesPerUser: e.target.value }))}
                placeholder="Unlimited" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Expires (optional)
              <input className="input" type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', justifyContent: 'center' }}>
              Status
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, textTransform: 'none' }}>{form.active ? 'Active' : 'Inactive'}</span>
              </div>
            </label>
          </div>

          {/* User assignment */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
              Restrict to Specific Users <span style={{ fontWeight: 400, textTransform: 'none' }}>(leave empty = anyone can use)</span>
            </div>
            {assignedUsers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {assignedUsers.map(u => (
                  <span key={u.id} style={{ background: 'var(--accent)', color: '#000', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {u.name}
                    <span style={{ cursor: 'pointer', fontWeight: 900 }} onClick={() => toggleUser(u.id)}>×</span>
                  </span>
                ))}
              </div>
            )}
            <input className="input" placeholder="Search players to assign..." value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              style={{ marginBottom: 8, maxWidth: 320 }} />
            {userSearch && (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
                {filteredUsers.slice(0, 20).map(u => (
                  <div key={u.id} onClick={() => toggleUser(u.id)}
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      background: form.assignedUserIds.includes(u.id) ? 'rgba(200,255,0,.1)' : 'transparent',
                      borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 16 }}>{form.assignedUserIds.includes(u.id) ? '✅' : '⬜'}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 && <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>No players found.</div>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-accent" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Code'}</button>
            <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Codes Table ── */}
      {activeTab === 'codes' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : codes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No discount codes yet. Create one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Code','Type','Value','Scope','Uses','Total Limit','Per-User','Expires','Assigned To','Status',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', ...cs, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map(c => {
                  const badge = statusBadge(c);
                  const assigned = allUsers.filter(u => (c.assigned_user_ids || []).includes(u.id));
                  const codeRedemptions = redemptionsByCode[c.id] || [];
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', opacity: (!c.active || isExpired(c) || isExhausted(c)) ? 0.55 : 1, transition: 'opacity .15s' }}>
                      <td style={{ padding: '10px', fontWeight: 800, ...cs, fontSize: 16, letterSpacing: '.05em', color: 'var(--accent)' }}>{c.code}</td>
                      <td style={{ padding: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>{c.type}</td>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{c.type === 'percent' ? `${c.value}%` : `£${Number(c.value).toFixed(2)}`}</td>
                      <td style={{ padding: '10px', fontSize: 11, color: 'var(--muted)' }}>{scopeLabel(c.scope)}</td>
                      <td style={{ padding: '10px', minWidth: 80 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700 }}>{c.uses}</span>
                          {c.max_uses != null && (
                            <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden', minWidth: 36 }}>
                              <div style={{ height: '100%', width: `${Math.min(100, Math.round(c.uses / c.max_uses * 100))}%`, background: c.uses >= c.max_uses ? 'var(--red)' : c.uses / c.max_uses > 0.75 ? 'var(--gold)' : 'var(--accent)', borderRadius: 2, transition: 'width .3s' }} />
                            </div>
                          )}
                        </div>
                        {codeRedemptions.length > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>({codeRedemptions.length} logged)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--muted)' }}>{c.max_uses != null ? c.max_uses : '∞'}</td>
                      <td style={{ padding: '10px', color: 'var(--muted)' }}>{c.max_uses_per_user != null ? c.max_uses_per_user : '∞'}</td>
                      <td style={{ padding: '10px', color: 'var(--muted)', fontSize: 12 }}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-GB') : '—'}</td>
                      <td style={{ padding: '10px', maxWidth: 180 }}>
                        {assigned.length === 0
                          ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>Anyone</span>
                          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {assigned.map(u => (
                                <span key={u.id} style={{ background: 'rgba(200,255,0,.15)', color: 'var(--accent)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{u.name}</span>
                              ))}
                            </div>
                        }
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ background: badge.color + '22', color: badge.color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>{badge.label}</span>
                      </td>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => startEdit(c)} style={{ marginRight: 6 }}>Edit</button>
                        <button className="btn btn-sm" onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                          style={{ background: 'var(--red)', color: '#fff', border: 'none', opacity: deleting === c.id ? .5 : 1 }}>
                          {deleting === c.id ? '…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Redemption History Tab ── */}
      {activeTab === 'history' && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : redemptions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No redemptions recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Date','Code','Player','Scope','Saved'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', ...cs, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {redemptions.map(r => {
                  const matchedCode = codes.find(c => c.id === r.code_id);
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontSize: 12, color: 'var(--muted)' }}>{new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ padding: '10px', fontWeight: 800, ...cs, fontSize: 15, color: 'var(--accent)' }}>{matchedCode?.code || r.code_id?.slice(0,8)}</td>
                      <td style={{ padding: '10px', fontWeight: 600 }}>{r.user_name || <span style={{ color: 'var(--muted)' }}>Guest</span>}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 8px', borderRadius: 20,
                          background: r.scope === 'shop' ? 'rgba(0,180,160,.15)' : r.scope === 'events' ? 'rgba(0,100,255,.15)' : 'rgba(200,255,0,.1)',
                          color:      r.scope === 'shop' ? '#00c8b0'             : r.scope === 'events' ? '#60a0ff'             : 'var(--accent)',
                        }}>{r.scope}</span>
                      </td>
                      <td style={{ padding: '10px', fontWeight: 700, color: 'var(--accent)' }}>£{Number(r.amount_saved).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total saved by players</span>
              <strong style={{ fontSize: 20, color: 'var(--accent)', fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900 }}>£{redemptions.reduce((s, r) => s + Number(r.amount_saved), 0).toFixed(2)}</strong>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Audit log ────────────────────────────────────────────────
const SUPERADMIN_EMAIL = "c-pullen@outlook.com";

// Build a human-readable "field: before → after" diff string

export { AdminDiscountCodes };
