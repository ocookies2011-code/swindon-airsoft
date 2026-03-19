// ─────────────────────────────────────────────────────────────
// AdminPanel.jsx  —  All admin components + late-defined page
//                    components (About, Staff, Contact, Terms,
//                    PlayerWaitlist)
// ─────────────────────────────────────────────────────────────
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
  sendReturnDecisionEmail,
  WaiverModal,
  RankInsignia, DesignationInsignia,
} from "./utils";

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

  const cs = { fontFamily: "'Barlow Condensed',sans-serif" };

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
      <div className="nav-tabs" style={{ marginBottom: 20 }}>
        <button className={`nav-tab ${activeTab === 'codes' ? 'active' : ''}`} onClick={() => setActiveTab('codes')}>Codes</button>
        <button className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          Redemption History {redemptions.length > 0 && <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#000', borderRadius: 20, padding: '0 7px', fontSize: 11, fontWeight: 900 }}>{redemptions.length}</span>}
        </button>
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
              <strong style={{ fontSize: 20, color: 'var(--accent)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900 }}>£{redemptions.reduce((s, r) => s + Number(r.amount_saved), 0).toFixed(2)}</strong>
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
function diffFields(before = {}, after = {}, labels = {}) {
  const changes = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const bVal = before[key] ?? "";
    const aVal = after[key] ?? "";
    // Normalise to strings for comparison, skip identical
    const bStr = bVal === null || bVal === undefined ? "" : String(bVal).trim();
    const aStr = aVal === null || aVal === undefined ? "" : String(aVal).trim();
    if (bStr === aStr) continue;
    const label = labels[key] || key;
    changes.push(`${label}: "${bStr}" → "${aStr}"`);
  }
  return changes.length ? changes.join(" | ") : null;
}

async function logAction({ adminEmail, adminName, action, detail = null }) {
  try {
    await supabase.from("admin_audit_log").insert({
      admin_email: adminEmail,
      admin_name:  adminName || adminEmail,
      action,
      detail,
      created_at:  new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Audit log failed:", e.message);
  }
}

// ── Admin Audit Log viewer ───────────────────────────────────
function AdminAuditLog() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("");
  const [page, setPage]       = useState(0);
  const PAGE_SIZE = 50;
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      if (isMounted.current) setLogs(data || []);
    } catch (e) {
      console.error("Audit log load failed:", e.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const filtered = logs.filter(l => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      (l.action || "").toLowerCase().includes(q) ||
      (l.detail || "").toLowerCase().includes(q) ||
      (l.admin_email || "").toLowerCase().includes(q) ||
      (l.admin_name || "").toLowerCase().includes(q)
    );
  });

  const pages     = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const ACTION_COLOR = (action = "") => {
    if (action.includes("delete") || action.includes("Delete") || action.includes("banned") || action.includes("rejected")) return "var(--red)";
    if (action.includes("refund") || action.includes("Refund")) return "#ff9800";
    if (action.includes("approved") || action.includes("Approved") || action.includes("VIP")) return "var(--accent)";
    if (action.includes("dispatched") || action.includes("Dispatched")) return "#4fc3f7";
    return "var(--muted)";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: ".1em", textTransform: "uppercase" }}>
            🔐 Admin Audit Log
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {logs.length} actions recorded · visible only to superadmin
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(0); }}
            placeholder="Filter by action, detail, admin…"
            style={{ fontSize: 12, width: 240 }}
          />
          <button className="btn btn-sm btn-ghost" onClick={load}>↺ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace", fontSize: 12 }}>Loading…</div>
      ) : paginated.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace", fontSize: 12 }}>No actions logged yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Time</th>
                <th style={{ width: 160 }}>Admin</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((l, i) => (
                <tr key={l.id || i}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {new Date(l.created_at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{l.admin_name || "—"}</div>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>{l.admin_email}</div>
                  </td>
                  <td>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, fontWeight: 700, color: ACTION_COLOR(l.action) }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, maxWidth: 420 }}>
                    {l.detail
                      ? l.detail.split(" | ").map((part, pi) => {
                          const isChange = part.includes(" → ");
                          const isLabel = part.includes(": ");
                          return (
                            <div key={pi} style={{
                              display: "inline-block",
                              background: isChange ? "rgba(200,255,0,.06)" : "rgba(255,255,255,.04)",
                              border: `1px solid ${isChange ? "rgba(200,255,0,.2)" : "rgba(255,255,255,.08)"}`,
                              borderRadius: 3,
                              padding: "1px 6px",
                              margin: "1px 2px 1px 0",
                              fontFamily: "'Share Tech Mono',monospace",
                              color: isChange ? "var(--accent)" : "var(--muted)",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                              lineHeight: 1.5,
                            }}>
                              {isLabel && !isChange
                                ? (<><span style={{ color: "rgba(255,255,255,.3)", fontSize: 10 }}>{part.split(": ")[0]}: </span><span style={{ color: "#c8d8b0" }}>{part.split(": ").slice(1).join(": ")}</span></>)
                                : part}
                            </div>
                          );
                        })
                      : <span style={{ color: "rgba(255,255,255,.2)", fontFamily: "'Share Tech Mono',monospace" }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          {Array.from({ length: pages }).map((_, i) => (
            <button key={i} className={`btn btn-sm ${i === page ? "btn-primary" : "btn-ghost"}`} onClick={() => setPage(i)}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPanel({ data, cu, save, updateUser, updateEvent, showToast, setPage, refresh }) {
  const getInitialSection = () => {
    const parts = window.location.hash.replace("#","").split("/");
    const ADMIN_SECTIONS = ["dashboard","events","waivers","unsigned-waivers","players","shop",
      "leaderboard-admin","revenue","visitor-stats","gallery-admin","qa-admin","staff-admin",
      "contact-admin","messages","cash","purchase-orders","discount-codes","settings","audit-log","cheat-reports"];
    return parts[0] === "admin" && ADMIN_SECTIONS.includes(parts[1]) ? parts[1] : "dashboard";
  };
  const [section, setSectionState] = useState(getInitialSection);
  const setSection = (s) => {
    setSectionState(s);
    window.location.hash = "admin/" + s;
  };

  const isMain = cu.role === "admin";
  const isSuperAdmin = cu.email === SUPERADMIN_EMAIL;

  const hasPerm = (p) => isMain || cu.permissions?.includes(p) || cu.permissions?.includes("all");

  const pendingWaivers = data.users.filter(u => u.waiverPending).length;
  const pendingVip = data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length;  const deleteReqs = data.users.filter(u => u.deleteRequest).length;
  const [pendingOrders, setPendingOrders] = useState(0);
  useEffect(() => {
    const fetchPending = () =>
      api.shopOrders.getAll()
        .then(orders => setPendingOrders(orders.filter(o => o.status === "pending" || o.status === "return_requested").length))
        .catch(() => {});
    fetchPending();
    const interval = setInterval(fetchPending, 120000);
    return () => clearInterval(interval);
  }, []);

  const [pendingReports, setPendingReports] = useState(0);
  useEffect(() => {
    const fetchReports = () => {
      supabase.from("cheat_reports").select("id", { count: "exact", head: true }).eq("status", "pending")
        .then(({ count }) => setPendingReports(count || 0))
        .catch(() => {});
    };
    fetchReports();
    const onVisible = () => { if (document.visibilityState === "visible") fetchReports(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const unsigned = data.users.filter(u => u.role === "player" && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear())).length;
  const upcomingEvents = data.events.filter(e => e.published && new Date(e.date) >= new Date()).length;
  const totalBookings = data.events.flatMap(e => e.bookings).length;
  const checkins = data.events.flatMap(e => e.bookings).filter(b => b.checkedIn).length;

  const NAV = [
    { id: "dashboard",        label: "Dashboard",        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, group: "OPERATIONS" },
    { id: "events",            label: "Events & Bookings", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, badge: totalBookings, badgeColor: "blue", group: "OPERATIONS" },
    { id: "players",           label: "Players",           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>, badge: pendingVip > 0 ? pendingVip : (deleteReqs > 0 ? deleteReqs : null), badgeColor: pendingVip > 0 ? "gold" : "", group: null },
    { id: "cheat-reports",    label: "Cheat Reports",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, badge: pendingReports || null, badgeColor: "red", group: null },
    { id: "shop",              label: "Shop",              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, badge: pendingOrders, badgeColor: "red", group: null },
    { id: "leaderboard-admin", label: "Leaderboard",       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><polyline points="18 20 18 10"/><polyline points="12 20 12 4"/><polyline points="6 20 6 14"/></svg>, group: null },
    { id: "revenue",           label: "Revenue",           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1m0 8v1"/></svg>, group: "ANALYTICS" },
    { id: "visitor-stats",     label: "Visitor Stats",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, group: null },
    { id: "gallery-admin",     label: "Gallery",           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, group: null },
    { id: "qa-admin",          label: "Q&A",               icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, group: null },
    { id: "staff-admin",       label: "Staff",             icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, group: null },
    { id: "contact-admin",     label: "Contact Depts",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, group: null },
    { id: "messages",          label: "Site Messages",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f48fb1" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>, group: null },
    { id: "cash",              label: "Cash Sales",        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>, group: "TOOLS" },
    { id: "purchase-orders",   label: "Purchase Orders",   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, group: null },
    { id: "discount-codes",    label: "Discount Codes",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>, group: null },
    { id: "settings",          label: "Settings",          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, group: "SYSTEM" },
    ...(isSuperAdmin ? [{ id: "audit-log", label: "Audit Log", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef9a9a" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>, group: null }] : []),
  ];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-shell">
      {/* Mobile overlay */}
      <div className={`admin-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sb-logo">
          <div className="sb-logo-text">SWINDON <span>AIRSOFT</span></div>
          <div className="sb-time"><GmtClock /></div>
        </div>
        <div style={{ padding: "8px 8px 0" }}>
          {NAV.map((item, idx) => {
            const showGroup = item.group && (idx === 0 || NAV[idx - 1]?.group !== item.group);
            return (
              <div key={item.id}>
                {showGroup && <div className="sb-label" style={{ marginTop: idx > 0 ? 16 : 8 }}>{item.group}</div>}
                <div className={`sb-item ${section === item.id ? "active" : ""}`} onClick={() => { setSection(item.id); setSidebarOpen(false); }}>
                  <span className="sb-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge > 0 && <span className={`sb-badge ${item.badgeColor || ""}`}>{item.badge}</span>}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 16, padding: "0 0 16px" }}>
            <div className="sb-label">SYSTEM</div>
            <div className="sb-item" onClick={() => setPage("home")}>
              <span className="sb-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef9a9a" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span><span>Exit Admin</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen(v => !v)} style={{ background: sidebarOpen ? "var(--accent)" : "none", border: "1px solid var(--border)", color: sidebarOpen ? "#000" : "var(--text)", padding: "6px 12px", borderRadius: 4, fontSize: 18, lineHeight: 1, cursor: "pointer", transition: "all .15s" }}>☰</button>
            <div style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--muted)" }}>⚙ ADMIN</span>
              <span style={{ color: "var(--border)" }}>·</span>
              <span style={{ color: "var(--text)", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".06em", textTransform: "uppercase" }}>{NAV.find(n => n.id === section)?.label || section}</span>
            </div>
          </div>
          <div className="gap-2" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12, display: "var(--hide-mobile, inline)" }}><GmtClock /></span>
            <button className="btn btn-sm btn-ghost" onClick={() => setPage("home")}>← Site</button>
          </div>
        </div>
        <div className="admin-content">
          {section === "dashboard" && <AdminDash data={data} setSection={setSection} />}
          {section === "events" && <AdminEventsBookings data={data} save={save} updateEvent={updateEvent} updateUser={updateUser} showToast={showToast} cu={cu} />}
          {section === "waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} cu={cu} />}
          {section === "unsigned-waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} filterUnsigned cu={cu} />}
          {section === "players" && <AdminPlayers data={data} save={save} updateUser={updateUser} showToast={showToast} cu={cu} />}
          {section === "cheat-reports" && <AdminCheatReports data={data} showToast={showToast} cu={cu} />}
          {section === "shop" && <AdminShop data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "leaderboard-admin" && <AdminLeaderboard data={data} updateUser={updateUser} showToast={showToast} />}
          {section === "revenue" && <AdminRevenue data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "visitor-stats" && <AdminVisitorStats />}
          {section === "gallery-admin" && <AdminGallery data={data} save={save} showToast={showToast} />}
          {section === "qa-admin" && <AdminQA data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "staff-admin" && <AdminStaff showToast={showToast} cu={cu} />}
          {section === "contact-admin" && <AdminContactDepts showToast={showToast} save={save} cu={cu} />}
          {section === "messages" && <AdminMessages data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "cash" && <AdminCash data={data} cu={cu} showToast={showToast} />}
          {section === "purchase-orders" && <AdminPurchaseOrders data={data} save={save} showToast={showToast} cu={cu} />}
          {section === "discount-codes" && <AdminDiscountCodes data={data} showToast={showToast} cu={cu} />}
          {section === "settings" && <AdminSettings showToast={showToast} cu={cu} />}
          {section === "audit-log" && isSuperAdmin && <AdminAuditLog />}
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────
function AdminDash({ data, setSection }) {
  const allBookings = data.events.flatMap(e => e.bookings);
  const revenue = allBookings.filter(b => !b.squareOrderId?.startsWith("ADMIN-MANUAL-")).reduce((s, b) => s + b.total, 0);
  const checkins = allBookings.filter(b => b.checkedIn).length;
  const players = data.users.filter(u => u.role === "player").length;
  const unsigned = data.users.filter(u => u.role === "player" && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear())).length;
  const activeEvents = data.events.filter(e => e.published && new Date(e.date) >= new Date()).length;
  const pendingWaivers = data.users.filter(u => u.waiverPending).length;

  // Weekly bookings bar chart
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const weekCounts = [0, 0, 0, 0, 0, 0, 0];
  allBookings.forEach(b => {
    const weekday = new Date(b.date).getDay();
    weekCounts[(weekday + 6) % 7]++;
  });
  const maxBar = Math.max(...weekCounts, 1);

  const LOW_STOCK_THRESHOLD = 5;
  const shopProducts = data.shop || [];
  const outOfStock = shopProducts.filter(p => p.stock < 1 && !p.variants?.length);
  const lowStock = shopProducts.filter(p => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD && !p.variants?.length);
  const outOfStockVariants = shopProducts.filter(p => p.variants?.length > 0 && p.variants.every(v => Number(v.stock) < 1));
  const lowStockVariants = shopProducts.filter(p => p.variants?.length > 0 && p.variants.some(v => Number(v.stock) > 0 && Number(v.stock) <= LOW_STOCK_THRESHOLD));

  const alerts = [
    unsigned > 0 && { msg: `${unsigned} player(s) with unsigned waivers.`, section: "unsigned-waivers", color: "red" },
    pendingWaivers > 0 && { msg: `${pendingWaivers} waiver change request(s) pending approval.`, section: "waivers", color: "red" },
    data.users.filter(u => u.deleteRequest).length > 0 && { msg: `${data.users.filter(u => u.deleteRequest).length} account deletion request(s).`, section: "players", color: "red" },
    data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length > 0 && { msg: `${data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length} VIP application(s) awaiting review.`, section: "players", color: "red" },
    outOfStock.length > 0 && { msg: outOfStock.length + " product(s) OUT OF STOCK: " + outOfStock.slice(0,3).map(p=>p.name).join(", ") + (outOfStock.length>3 ? " +" + (outOfStock.length-3) + " more" : "") + ".", section: "shop", color: "red", icon: "⚠" },
    outOfStockVariants.length > 0 && { msg: outOfStockVariants.length + " variant product(s) fully out of stock: " + outOfStockVariants.slice(0,2).map(p=>p.name).join(", ") + (outOfStockVariants.length>2 ? " +" + (outOfStockVariants.length-2) + " more" : "") + ".", section: "shop", color: "red", icon: "⚠" },
    lowStock.length > 0 && { msg: lowStock.length + " product(s) running low (≤" + LOW_STOCK_THRESHOLD + "): " + lowStock.slice(0,3).map(p=>p.name+" ("+p.stock+")").join(", ") + (lowStock.length>3 ? " +" + (lowStock.length-3) + " more" : "") + ".", section: "shop", color: "gold", icon: "⚠️" },
    lowStockVariants.length > 0 && { msg: lowStockVariants.length + " variant product(s) have low stock variants.", section: "shop", color: "gold", icon: "⚠️" },
    new Date().getMonth() === 11 && { msg: `⏰ All player waivers expire 31 Dec ${new Date().getFullYear()} — players will need to re-sign on 1 Jan.`, section: "unsigned-waivers", color: "gold", icon: "⚠" },
  ].filter(Boolean);

  // Quick action state
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  // Find next upcoming event (for quick reminder)
  const nextEvent = data.events
    .filter(e => e.published && new Date(e.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const sendRemindersNow = async () => {
    if (!nextEvent) return;
    setReminderBusy(true);
    setReminderResult(null);
    try {
      const bookedUsers = nextEvent.bookings.map(b => {
        const u = data.users.find(u => u.id === b.userId);
        return u ? { ...u, bookingType: b.type, bookingTotal: b.total } : null;
      }).filter(Boolean);
      if (bookedUsers.length === 0) { setReminderResult({ sent: 0, failed: 0 }); return; }
      const results = await sendEventReminderEmail({ ev: nextEvent, bookedUsers });
      setReminderResult(results);
    } catch (e) {
      setReminderResult({ error: e.message });
    } finally { setReminderBusy(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Dashboard</div><div className="page-sub">Operations overview · All times GMT</div></div>
        <GmtClock />
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 12, textTransform: "uppercase" }}>⚡ Quick Actions</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>, label: "New Event", sub: "Create & publish", action: () => setSection("events"), color: "var(--accent)", textColor: "#000" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>, label: "Players", sub: `${data.users.filter(u=>u.role==="player").length} registered`, action: () => setSection("players"), color: "rgba(79,195,247,.12)", textColor: "#4fc3f7", border: "rgba(79,195,247,.3)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, label: "Shop Orders", sub: "Manage orders", action: () => setSection("shop"), color: "rgba(200,150,0,.1)", textColor: "var(--gold)", border: "rgba(200,150,0,.3)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={unsigned > 0 ? "#f48fb1" : "#81c784"} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, label: "Waivers", sub: unsigned > 0 ? `${unsigned} unsigned` : "All signed", action: () => setSection("unsigned-waivers"), color: unsigned > 0 ? "rgba(220,50,50,.12)" : "rgba(100,180,50,.08)", textColor: unsigned > 0 ? "var(--red)" : "var(--accent)", border: unsigned > 0 ? "rgba(220,50,50,.3)" : "rgba(100,180,50,.2)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: "VIP Queue", sub: data.users.filter(u=>u.vipApplied&&u.vipStatus!=="active").length > 0 ? `${data.users.filter(u=>u.vipApplied&&u.vipStatus!=="active").length} pending` : "No pending", action: () => setSection("players"), color: "rgba(200,150,0,.1)", textColor: "var(--gold)", border: "rgba(200,150,0,.3)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1m0 8v1"/></svg>, label: "Revenue", sub: "View report", action: () => setSection("revenue"), color: "rgba(100,180,50,.08)", textColor: "var(--accent)", border: "rgba(100,180,50,.2)" },
            { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, label: "Settings", sub: "Site config", action: () => setSection("settings"), color: "rgba(150,150,150,.08)", textColor: "var(--muted)", border: "rgba(150,150,150,.2)" },
          ].map(qa => (
            <button key={qa.label} onClick={qa.action}
              style={{ background: qa.color, border: `1px solid ${qa.border || "rgba(200,255,0,.25)"}`, padding: "12px 18px", cursor: "pointer", minWidth: 120, textAlign: "left", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = ".8"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center" }}>{qa.icon}</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 13, letterSpacing: ".1em", color: qa.textColor, textTransform: "uppercase" }}>{qa.label}</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{qa.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── EVENT REMINDER QUICK SEND ── */}
      {nextEvent && (
        <div style={{ background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.15)", padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 13, letterSpacing: ".12em", color: "#c8ff00", textTransform: "uppercase" }}>📅 Next Event: {nextEvent.title}</div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
              {new Date(nextEvent.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {nextEvent.bookings.length} player(s) booked
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {reminderResult && !reminderResult.error && (
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--accent)" }}>
                ✓ {reminderResult.sent} sent{reminderResult.failed > 0 ? `, ${reminderResult.failed} failed` : ""}
              </span>
            )}
            {reminderResult?.error && (
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--red)" }}>✗ {reminderResult.error}</span>
            )}
            <button className="btn btn-sm btn-primary" onClick={sendRemindersNow} disabled={reminderBusy || nextEvent.bookings.length === 0}
              style={{ fontSize: 11, letterSpacing: ".1em" }}>
              {reminderBusy ? "Sending…" : "📧 Send Reminders"}
            </button>
          </div>
        </div>
      )}

      <div className="grid-6 mb-2">
        {[
          { label: "Total Revenue", val: `£${revenue.toFixed(0)}`, sub: "From bookings", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1m0 8v1"/></svg>, color: "" },
          { label: "Bookings", val: allBookings.length, sub: `${data.events.length} events`, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9" y1="14.5" x2="15" y2="14.5"/></svg>, color: "gold" },
          { label: "Registered Players", val: players, sub: "Active accounts", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, color: "blue" },
          { label: "Unsigned Waivers", val: unsigned, sub: unsigned > 0 ? "Action required" : "All clear", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={unsigned > 0 ? "#f48fb1" : "#81c784"} strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, color: unsigned > 0 ? "red" : "", subColor: unsigned > 0 ? "red" : "" },
          { label: "Active Events", val: activeEvents, sub: "Upcoming", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, color: "teal" },
          { label: "Check-Ins", val: checkins, sub: "All events", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>, color: "purple" },
        ].map(({ label, val, sub, icon, color, subColor }) => (
          <div key={label} className={`stat-card ${color}`}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-val">{val}</div>
            <div className="stat-label">{label}</div>
            <div className={`stat-sub ${subColor || ""}`}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 14 }}>WEEKLY BOOKINGS</div>
          <div style={{ fontSize: 11, color: "var(--subtle)", marginBottom: 10 }}>Last 7 days</div>
          <div className="bar-chart">
            {weekCounts.map((c, i) => (
              <div key={i} className="bar" style={{ height: (c / maxBar * 72 + (c > 0 ? 8 : 4)) + "px" }} title={`${days[i]}: ${c}`} />
            ))}
          </div>
          <div className="bar-labels">{days.map((d, i) => <div key={i} className="bar-label">{d}</div>)}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 14 }}>ALERTS</div>
          {alerts.length === 0 ? (
            <div className="alert alert-green">✓ All clear — no actions required</div>
          ) : (
            alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: a.color === "gold" ? "rgba(200,150,0,.08)" : "#2d0d0d", border: `1px solid ${a.color === "gold" ? "rgba(200,150,0,.4)" : "#6b2222"}`, borderRadius: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: a.color === "gold" ? "var(--gold)" : "var(--red)" }}>{a.icon || "●"} {a.msg}</span>
                <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => setSection(a.section)}>View →</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Admin Check-In ────────────────────────────────────────
// ── Admin Bookings & Check-In (merged) ────────────────────
function BookingsTab({ allBookings, data, doCheckin, save, showToast, cu }) {
  const [editBooking, setEditBooking] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [viewBooking, setViewBooking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refundModal, setRefundModal] = useState(null); // { booking }
  const [refundAmt, setRefundAmt] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refunding, setRefunding] = useState(false);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const [search, setSearch] = useState("");

  const filtered = allBookings.filter(b =>
    !search || b.userName.toLowerCase().includes(search.toLowerCase()) ||
    b.eventTitle.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (b) => setEditBooking({
    id: b.id, userId: b.userId, userName: b.userName,
    eventTitle: b.eventTitle, eventObj: b.eventObj,
    type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn,
    _orig: { type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn },
  });

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.bookings.update(editBooking.id, editBooking);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Booking updated!");
      const BLABELS = { type: "Type", qty: "Qty", total: "Total", checkedIn: "Checked in" };
      const bDiff = diffFields(
        editBooking._orig || {},
        { type: editBooking.type, qty: editBooking.qty, total: editBooking.total, checkedIn: editBooking.checkedIn },
        BLABELS
      );
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Booking updated", detail: `${editBooking.userName} @ ${editBooking.eventTitle}${bDiff ? ` | ${bDiff}` : " (no field changes)"}` });
      setEditBooking(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', delConfirm.id);
      if (error) throw new Error(error.message);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Booking deleted!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Booking deleted", detail: `Booking ID: ${delConfirm.id} — ${delConfirm.name || ""}` });
      setDelConfirm(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const doRefundBooking = async () => {
    const { booking } = refundModal;
    const amt = parseFloat(refundAmt);
    if (isNaN(amt) || amt <= 0) { showToast("Enter a valid refund amount", "red"); return; }
    if (amt > booking.total) { showToast("Refund amount exceeds booking total", "red"); return; }
    if (!booking.squareOrderId) { showToast("No Square payment ID on this booking — refund manually in your Square Dashboard.", "red"); return; }
    setRefunding(true);
    try {
      const locationId = await api.settings.get("square_location_id");
      const isFullRefund = Math.abs(amt - booking.total) < 0.01;
      await squareRefund({ squarePaymentId: booking.squareOrderId, amount: isFullRefund ? null : amt, locationId });
      // Record refund on the booking row
      await supabase.from('bookings').update({
        refund_amount: amt,
        refund_note: refundNote || null,
        refunded_at: new Date().toISOString(),
      }).eq('id', booking.id);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast(`✅ Refund of £${amt.toFixed(2)} issued via Square!`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Booking refunded", detail: `Booking ID: ${booking.id} — ${booking.userName} | Refund: £${amt.toFixed(2)}${refundNote ? ` | Note: ${refundNote}` : ""}` });
      setRefundModal(null);
      setRefundAmt(""); setRefundNote("");
    } catch (e) {
      showToast("❌ Refund failed: " + (e.message || String(e)), "red");
    } finally { setRefunding(false); }
  };

  return (
    <div className="card">
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player or event…"
          style={{ maxWidth: 280 }} />
      </div>
      <div className="table-wrap"><table className="data-table">
        <thead>
          <tr><th>Player</th><th>Event</th><th>Date</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No bookings found</td></tr>
          )}
          {filtered.map(b => (
            <tr key={b.id}>
              <td style={{ fontWeight: 600 }}>{b.userName}</td>
              <td>{b.eventTitle}</td>
              <td className="mono" style={{ fontSize: 11 }}>{gmtShort(b.date)}</td>
              <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
              <td>{b.qty}</td>
              <td style={{ fontSize: 11 }}>
                {(() => {
                  const entries = Object.entries(b.extras || {}).filter(([,v]) => v > 0);
                  if (!entries.length) return <span style={{ color: "var(--muted)" }}>—</span>;
                  return entries.map(([key, qty]) => {
                    const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
                    const ex = b.eventObj?.extras?.find(e => e.id === extraId);
                    const lp = (data?.shop || []).find(p => p.id === ex?.productId);
                    const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
                    const label = ex ? (selectedVariant ? `${ex.name} — ${selectedVariant.name}` : ex.name) : key;
                    return (
                      <div key={key} style={{ fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap", color: "var(--accent)" }}>
                        {label} ×{qty}
                      </div>
                    );
                  });
                })()}
              </td>
              <td className="text-green">£{b.total.toFixed(2)}</td>
              <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
              <td>
                <div className="gap-2">
                  {!b.checkedIn && (
                    <button className="btn btn-sm btn-primary" onClick={() => doCheckin(b, b.eventObj)}>✓ In</button>
                  )}
                  <button className="btn btn-sm btn-ghost" onClick={() => setViewBooking(b)}>View</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => openEdit(b)}>Edit</button>
                  {b.squareOrderId && b.total > 0 && (
                    <button className="btn btn-sm" style={{ background:"rgba(255,152,0,.12)", border:"1px solid rgba(255,152,0,.35)", color:"#ff9800", fontSize:10, padding:"3px 7px", cursor:"pointer", borderRadius:2, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".08em", whiteSpace:"nowrap" }}
                      onClick={() => { setRefundModal({ booking: b }); setRefundAmt(b.total.toFixed(2)); setRefundNote(""); }}>
                      £ Refund
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => setDelConfirm(b)}>Del</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {/* Edit modal */}
      {editBooking && (
        <div className="overlay" onClick={() => setEditBooking(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">✏️ Edit Booking</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              {editBooking.userName} — {editBooking.eventTitle}
            </div>
            <div className="form-group">
              <label>Ticket Type</label>
              <select value={editBooking.type} onChange={e => setEditBooking(p => ({ ...p, type: e.target.value }))}>
                <option value="walkOn">Walk-On</option>
                <option value="rental">Rental</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" min={1} value={editBooking.qty}
                  onChange={e => setEditBooking(p => ({ ...p, qty: +e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Total (£)</label>
                <input type="number" step="0.01" min={0} value={editBooking.total}
                  onChange={e => setEditBooking(p => ({ ...p, total: +e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="ci-edit" checked={editBooking.checkedIn}
                onChange={e => setEditBooking(p => ({ ...p, checkedIn: e.target.checked }))} />
              <label htmlFor="ci-edit" style={{ cursor: "pointer", fontSize: 13 }}>Checked In</label>
            </div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" disabled={busy} onClick={saveEdit}>
                {busy ? "Saving…" : "Save Changes"}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditBooking(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {viewBooking && (() => {
        const currentBooking = viewBooking;
        const extras = Object.entries(currentBooking.extras || {}).filter(([,v]) => v > 0);
        const ticketLabel = currentBooking.type === "walkOn" ? "Walk-On" : "Rental Package";
        const ticketPrice = currentBooking.type === "walkOn" ? currentBooking.eventObj?.walkOnPrice : currentBooking.eventObj?.rentalPrice;
        return (
          <div className="overlay" onClick={() => setViewBooking(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()}>
              <div className="modal-title">🎟 Booking Details</div>

              {/* Header info */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,180px),1fr))", gap:"10px 24px", background:"#0d0d0d", border:"1px solid #2a2a2a", padding:16, marginBottom:16, fontSize:13 }}>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>PLAYER</span><div style={{ fontWeight:700, marginTop:3 }}>{currentBooking.userName}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>EVENT</span><div style={{ fontWeight:700, marginTop:3 }}>{currentBooking.eventTitle}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>DATE</span><div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, marginTop:3 }}>{gmtShort(currentBooking.date)}</div></div>
                <div><span style={{ color:"var(--muted)", fontSize:11, letterSpacing:".1em" }}>STATUS</span><div style={{ marginTop:3 }}>{currentBooking.checkedIn ? <span className="tag tag-green">✓ Checked In</span> : <span className="tag tag-blue">Booked</span>}</div></div>
              </div>

              {/* Order breakdown */}
              <div style={{ border:"1px solid #2a2a2a", marginBottom:16 }}>
                <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #2a2a2a" }}>ORDER</div>
                <div style={{ padding:"0 14px" }}>
                  {/* Ticket */}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 }}>
                    <span>{ticketLabel} ×{currentBooking.qty}</span>
                    <span style={{ color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>£{(Number(ticketPrice) * currentBooking.qty).toFixed(2)}</span>
                  </div>
                  {/* Extras */}
                  {extras.length > 0 && extras.map(([key, qty]) => {
                    const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
                    const ex = currentBooking.eventObj?.extras?.find(e => e.id === extraId);
                    const lp = (data?.shop || []).find(p => p.id === ex?.productId);
                    const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
                    const label = ex ? (selectedVariant ? `${ex.name} — ${selectedVariant.name}` : ex.name) : key;
                    const unitPrice = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : 0);
                    return (
                      <div key={key} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #1a1a1a", fontSize:13 }}>
                        <span style={{ color:"var(--muted)" }}>+ {label} ×{qty}</span>
                        <span style={{ color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>£{(unitPrice * qty).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  {/* Total */}
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", fontSize:16, fontFamily:"'Barlow Condensed',sans-serif" }}>
                    <span>TOTAL</span>
                    <span style={{ color:"var(--accent)" }}>£{currentBooking.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="gap-2">
                <button className="btn btn-ghost" onClick={() => setViewBooking(null)}>Close</button>
                <button className="btn btn-ghost" onClick={() => { setViewBooking(null); openEdit(currentBooking); }}>Edit Booking</button>
              </div>
            </div>
          </div>
        );
      })()}

      {delConfirm && (
        <div className="overlay" onClick={() => setDelConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Booking?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 20px" }}>
              Delete <strong style={{ color: "var(--text)" }}>{delConfirm.userName}</strong>'s booking for <strong style={{ color: "var(--text)" }}>{delConfirm.eventTitle}</strong>?
              This cannot be undone.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={busy} onClick={confirmDelete}>
                {busy ? "Deleting…" : "Yes, Delete"}
              </button>
              <button className="btn btn-ghost" onClick={() => setDelConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {refundModal && (
        <div className="overlay" onClick={() => !refunding && setRefundModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">💸 Refund Booking</div>
            <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", padding:"12px 14px", borderRadius:4, marginBottom:16 }}>
              <div style={{ fontWeight:700 }}>{refundModal.booking.userName}</div>
              <div style={{ color:"var(--muted)", marginTop:2, fontSize:13 }}>{refundModal.booking.eventTitle} — {refundModal.booking.type === "walkOn" ? "Walk-On" : "Rental"} ×{refundModal.booking.qty}</div>
              <div style={{ color:"var(--muted)", fontSize:11, marginTop:2 }}>Square ref: {refundModal.booking.squareOrderId}</div>
            </div>
            <div className="form-group">
              <label>Refund Amount (£)</label>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="number" step="0.01" min="0.01" max={refundModal.booking.total}
                  value={refundAmt} onChange={e => setRefundAmt(e.target.value)} autoFocus style={{ maxWidth:120 }} />
                <button className="btn btn-sm btn-ghost" onClick={() => setRefundAmt(refundModal.booking.total.toFixed(2))}>Full £{refundModal.booking.total.toFixed(2)}</button>
              </div>
            </div>
            <div className="form-group">
              <label>Note (optional)</label>
              <input value={refundNote} onChange={e => setRefundNote(e.target.value)} placeholder="e.g. Event cancelled, player request" />
            </div>
            <p style={{ fontSize:12, color:"var(--red)", marginBottom:16 }}>⚠️ This will immediately issue a refund via Square. This cannot be undone.</p>
            <div className="gap-2">
              <button className="btn btn-sm" style={{ background:"var(--red)", color:"#fff", border:"none", opacity: refunding ? .6 : 1 }}
                onClick={doRefundBooking} disabled={refunding}>
                {refunding ? "⏳ Processing…" : `✓ Confirm Refund · £${parseFloat(refundAmt||0).toFixed(2)}`}
              </button>
              <button className="btn btn-ghost" onClick={() => setRefundModal(null)} disabled={refunding}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminEventsBookings({ data, save, updateEvent, updateUser, showToast, cu }) {
  const [waitlistView, setWaitlistView] = useState(null); // { ev, entries }
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState({}); // bookingId -> true while sending

  const openWaitlist = async (ev) => {
    setWaitlistLoading(true);
    try {
      const entries = await waitlistApi.getByEvent(ev.id);
      setWaitlistView({ ev, entries });
    } catch (e) { showToast("Failed to load waitlist: " + e.message, "red"); }
    finally { setWaitlistLoading(false); }
  };

  const emailWaitlist = async (ev, entries) => {
    if (!entries.length) return;
    showToast("Emailing waitlist…", "gold");
    let sent = 0, failed = 0;
    // Group by ticket type — only notify + hold first person per type
    const byType = {};
    for (const w of entries) {
      if (!byType[w.ticket_type]) byType[w.ticket_type] = [];
      byType[w.ticket_type].push(w);
    }
    for (const [ticketType, group] of Object.entries(byType)) {
      const first = group[0];
      if (!first.user_email) { failed++; continue; }
      try {
        // Create a 30-min hold for the first person in each ticket type
        await holdApi.createHold({ eventId: ev.id, ticketType, userId: first.user_id, userName: first.user_name, userEmail: first.user_email });
        await sendWaitlistNotifyEmail({ toEmail: first.user_email, toName: first.user_name, ev, ticketType });
        sent++;
      } catch { failed++; }
    }
    showToast(`📧 Waitlist emailed: ${sent} sent${failed > 0 ? `, ${failed} failed` : ""}. Slots held for 30 mins.`);
  };

  const resendTicket = async (b, ev) => {
    const player = data.users.find(u => u.id === b.userId);
    if (!player?.email) { showToast("No email address found for this player.", "red"); return; }
    setResendBusy(prev => ({ ...prev, [b.id]: true }));
    try {
      await sendTicketEmail({
        cu: player,
        ev,
        bookings: [{ id: b.id, type: b.type, qty: b.qty, total: b.total }],
        extras: b.extras || {},
      });
      showToast(`📧 Ticket resent to ${player.email}`);
    } catch (e) {
      showToast("Failed to resend ticket: " + e.message, "red");
    } finally {
      setResendBusy(prev => ({ ...prev, [b.id]: false }));
    }
  };

  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="events" && ["events","bookings","checkin"].includes(p[2]) ? p[2] : "events";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/events/" + t; };

  // ── Events state ──
  const [modal, setModal] = useState(null);
  const [viewId, setViewId] = useState(null);
  const blank = { title: "", date: "", time: "09:00", endTime: "17:00", location: "", description: "", walkOnSlots: 40, rentalSlots: 20, walkOnPrice: 25, rentalPrice: 35, banner: "", mapEmbed: "", extras: [], published: true, vipOnly: false };
  const [form, setForm] = useState(blank);
  const bannerFileRef = useRef(null); // holds the raw File object so we don't rely on fetch(data:URL)
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));
  const f = setField;

  // ── Check-in state ──
  const [evId, setEvId] = useState(data.events[0]?.id || "");
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);

  const ev = data.events.find(e => e.id === evId);
  const checkedInCount = ev ? ev.bookings.filter(b => b.checkedIn).length : 0;

  const allBookings = data.events.flatMap(ev =>
    ev.bookings.map(b => ({ ...b, eventTitle: ev.title, eventDate: ev.date, eventObj: ev }))
  );

  // ── Check-in logic ──
  const doCheckin = async (booking, evObj) => {
    if (!booking?.id || !booking?.userId) {
      showToast("Invalid booking data", "red"); return;
    }
    // Block check-in before event date
    const today = new Date().toISOString().slice(0, 10);
    if (evObj?.date && today < evObj.date) {
      showToast(`❌ Check-in not open yet — event is on ${fmtDate(evObj.date)}`, "red"); return;
    }
    try {
      const actualCount = await api.bookings.checkIn(booking.id, booking.userId);
      const evList = await api.events.getAll();
      save({ events: evList });
      const checkedInUser = data.users.find(x => x.id === booking.userId);
      if (checkedInUser) updateUser(checkedInUser.id, { gamesAttended: actualCount });
      showToast(`✅ ${booking.userName} checked in! Games: ${actualCount}`);
    } catch (e) {
      showToast("Check-in failed: " + e.message, "red");
    }
  };

  const manualCheckin = () => {
    if (!ev || !manual.trim()) return;
    const foundBooking = ev.bookings.find(x =>
      x.userName.toLowerCase().includes(manual.toLowerCase()) || x.id === manual.trim()
    );
    if (!foundBooking) { showToast("Booking not found", "red"); return; }
    if (foundBooking.checkedIn) { showToast("Already checked in", "gold"); return; }
    doCheckin(foundBooking, ev); setManual("");
  };

  const onQRScan = (code) => {
    setScanning(false);
    for (const evObj of data.events) {
      const scannedBooking = evObj.bookings.find(x => x.id === code);
      if (scannedBooking) {
        if (scannedBooking.checkedIn) { showToast(`${scannedBooking.userName} already checked in`, "gold"); return; }
        doCheckin(scannedBooking, evObj); return;
      }
    }
    showToast("QR code not recognised", "red");
  };

  const downloadList = () => {
    if (!ev) return;
    const rows = ["Name,Type,Qty,Total,Checked In",
      ...ev.bookings.map(b => `${b.userName},${b.type},${b.qty},${b.total.toFixed(2)},${b.checkedIn}`)
    ].join("\n");
    const downloadLink = document.createElement("a");
    downloadLink.href = "data:text/csv," + encodeURIComponent(rows);
    downloadLink.download = ev.title + "-players.csv"; downloadLink.click();
    showToast("Player list downloaded!");
  };

  // ── Events logic ──
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setSavingEvent(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const printPlayerList = (ev) => {
    const bookings = ev.bookings || [];
    const ticketTypes = {};
    const extraCounts = {};
    bookings.forEach(b => {
      ticketTypes[b.type] = (ticketTypes[b.type] || 0) + (b.qty || 1);
      if (b.extras) Object.entries(b.extras).forEach(([k, v]) => {
        if (v) extraCounts[k] = (extraCounts[k] || 0) + (typeof v === 'number' ? v : 1);
      });
    });
    const rows = bookings.map(b => `
      <tr>
        <td>${b.userName || 'Unknown'}</td>
        <td>${b.type}</td>
        <td>${b.qty || 1}</td>
        <td>${b.checkedIn ? '✓' : ''}</td>
        <td style="font-size:11px">${b.extras ? Object.entries(b.extras).filter(([,v])=>v).map(([k,v])=>`${k}${typeof v==='number'?` x${v}`:''}`).join(', ') : '—'}</td>
      </tr>`).join('');
    const ticketSummary = Object.entries(ticketTypes).map(([t,c])=>`<span style="margin-right:16px"><strong>${c}</strong> × ${t}</span>`).join('');
    const extraSummary = Object.entries(extraCounts).length ? Object.entries(extraCounts).map(([k,v])=>`<span style="margin-right:16px"><strong>${v}</strong> × ${k}</span>`).join('') : 'None';
    const win = window.open('','_blank','width=900,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>Player List — ${ev.title}</title><style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:Arial,sans-serif;padding:32px;color:#111;}
      h1{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
      .meta{font-size:13px;color:#555;margin-bottom:20px;}
      .summary{background:#f5f5f5;border:1px solid #ddd;padding:14px 16px;border-radius:4px;margin-bottom:20px;}
      .summary h3{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px;}
      .summary p{font-size:14px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th{background:#111;color:#fff;padding:8px 12px;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;}
      td{padding:8px 12px;border-bottom:1px solid #eee;}
      tr:nth-child(even) td{background:#fafafa;}
      .footer{margin-top:20px;font-size:11px;color:#aaa;text-align:right;}
      @media print{body{padding:16px;}}
    </style></head><body>
      <h1>Player List — ${ev.title}</h1>
      <div class="meta">${new Date(ev.date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${bookings.length} player(s) booked</div>
      <div class="summary">
        <h3>Ticket Types</h3><p>${ticketSummary || 'None'}</p>
        <h3 style="margin-top:10px">Game Day Extras</h3><p>${extraSummary}</p>
      </div>
      <table>
        <thead><tr><th>Player</th><th>Ticket Type</th><th>Qty</th><th>Checked In</th><th>Extras</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Printed ${new Date().toLocaleString('en-GB')} · Swindon Airsoft</div>
      <script>window.onload=()=>window.print();<\/script>
    </body></html>`);
    win.document.close();
  };

  const withTimeout = (promise, ms = 30000) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out after 30s — check your internet connection and Supabase is reachable")), ms))]);

  const saveEvent = async () => {
    if (!form.title || !form.date) { showToast("Title and date required", "red"); return; }
    setSavingEvent(true);
    try {
      const { _descTab, _emailUsers, ...formToSave } = form;
      if (modal === "new") {
        const created = await withTimeout(api.events.create(formToSave));
        // Upload banner using the resized File stored in bannerFileRef
        if (created?.id && bannerFileRef.current) {
          try {
            await api.events.uploadBanner(created.id, bannerFileRef.current);
          } catch (bannerErr) {
            console.warn("Banner upload failed:", bannerErr);
            showToast("Event saved but banner upload failed: " + bannerErr.message, "gold");
          } finally {
            bannerFileRef.current = null;
          }
        }
        // Email all users if checkbox was ticked
        if (form._emailUsers && created) {
          const evToSend = { ...formToSave, id: created.id };
          showToast("Sending announcement emails…", "gold");
          try {
            const results = await sendNewEventEmail({ ev: evToSend, users: data.users });
            showToast(`📧 Emails sent: ${results.sent} delivered${results.failed > 0 ? `, ${results.failed} failed` : ""}`, results.failed > 0 ? "gold" : "");
          } catch (emailErr) {
            showToast("Event saved but emails failed: " + emailErr.message, "gold");
          }
        }
      } else {
        await withTimeout(api.events.update(formToSave.id, formToSave));
        // Upload banner using the resized File stored in bannerFileRef
        if (form.id && bannerFileRef.current) {
          try {
            await api.events.uploadBanner(form.id, bannerFileRef.current);
          } catch (bannerErr) {
            console.warn("Banner upload failed:", bannerErr);
            showToast("Event saved but banner upload failed: " + bannerErr.message, "gold");
          } finally {
            bannerFileRef.current = null;
          }
        }
      }
      const evList = await withTimeout(api.events.getAll());
      save({ events: evList });
      showToast("Event saved!");
      if (!formToSave.id) {
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event created", detail: `Title: ${formToSave.title} | Date: ${formToSave.date || "?"} | Capacity: ${formToSave.capacity || "?"} | Price: £${Number(formToSave.price || 0).toFixed(2)} | Published: ${formToSave.published ? "yes" : "no"}` });
      } else {
        const origEv = data.events?.find(e => e.id === formToSave.id);
        const EVLABELS = { title: "Title", date: "Date", capacity: "Capacity", price: "Price", published: "Published", location: "Location" };
        const evBefore = { title: origEv?.title, date: origEv?.date, capacity: origEv?.capacity, price: origEv?.price, published: origEv?.published, location: origEv?.location };
        const evAfter  = { title: formToSave.title, date: formToSave.date, capacity: formToSave.capacity, price: formToSave.price, published: formToSave.published, location: formToSave.location };
        const evDiff = diffFields(evBefore, evAfter, EVLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event updated", detail: `${formToSave.title}${evDiff ? ` | ${evDiff}` : " (no changes)"}` });
      }
      setModal(null);
    } catch (e) {
      console.error("saveEvent failed:", e);
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
      setSavingEvent(false);
    }
  };

  // ── Add Booking (admin) ──
  const [addBookingModal, setAddBookingModal] = useState(false);
  const [addBookingForm, setAddBookingForm] = useState({ userId: "", type: "walkOn", qty: 1, extras: {} });
  const [addBookingBusy, setAddBookingBusy] = useState(false);
  const abf = (k, v) => setAddBookingForm(p => ({ ...p, [k]: v }));

  const submitAddBooking = async () => {
    const targetEv = data.events.find(e => e.id === evId);
    const player = data.users.find(u => u.id === addBookingForm.userId);
    if (!player) { showToast("Select a player", "red"); return; }
    if (!targetEv) { showToast("Select an event", "red"); return; }
    setAddBookingBusy(true);
    try {
      const ticketPrice = addBookingForm.type === "walkOn" ? targetEv.walkOnPrice : targetEv.rentalPrice;
      const extrasTotal = Object.entries(addBookingForm.extras).filter(([,v]) => v > 0).reduce((s, [key, qty]) => {
        const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
        const ex = targetEv.extras.find(e => e.id === extraId);
        const lp = (data.shop || []).find(p => p.id === ex?.productId);
        const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        const price = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
        return s + price * qty;
      }, 0);
      const newBooking = await api.bookings.create({
        eventId: targetEv.id,
        userId: player.id,
        userName: player.name,
        type: addBookingForm.type,
        qty: addBookingForm.qty,
        extras: Object.fromEntries(Object.entries(addBookingForm.extras).filter(([,v]) => v > 0)),
        total: 0, // Manual bookings don't count toward revenue
        squareOrderId: "ADMIN-MANUAL-" + Date.now(),
      });
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast(`Booking added for ${player.name}!`);
      setAddBookingModal(false);
      setAddBookingForm({ userId: "", type: "walkOn", qty: 1, extras: {} });
      // Send ticket confirmation email using real booking ID
      try {
        const emailBookings = [{ id: newBooking.id, type: addBookingForm.type, qty: addBookingForm.qty, total: 0 }];
        await sendTicketEmail({ cu: player, ev: targetEv, bookings: emailBookings, extras: Object.fromEntries(Object.entries(addBookingForm.extras).filter(([,v]) => v > 0)) });
        showToast("📧 Confirmation email sent to " + player.email);
        // Notify admin — fire-and-forget
        api.settings.get("contact_email").then(adminEmail => {
          if (adminEmail) sendAdminBookingNotification({
            adminEmail,
            cu: player,
            ev: targetEv,
            bookings: emailBookings,
            total: 0,
          }).catch(() => {});
        }).catch(() => {});
      } catch (emailErr) {
        showToast("Email failed: " + (emailErr?.message || String(emailErr)), "red");
      }
    } catch (e) {
      showToast("Failed: " + (e.message || String(e)), "red");
    } finally {
      setAddBookingBusy(false);
    }
  };

  const clone = async (ev) => {
    try {
      // Strip all DB-generated fields; only keep content fields
      const cloneData = {
        title:        ev.title + " (Copy)",
        date:         ev.date,
        time:         ev.time,
        location:     ev.location,
        description:  ev.description,
        walkOnSlots:  ev.walkOnSlots,
        rentalSlots:  ev.rentalSlots,
        walkOnPrice:  ev.walkOnPrice,
        rentalPrice:  ev.rentalPrice,
        published:    false,
        vipOnly:      ev.vipOnly || false,
        mapEmbed:     ev.mapEmbed || "",
        // Only carry URL banners — strip base64
        banner:       (ev.banner && !ev.banner.startsWith("data:")) ? ev.banner : "",
        // Strip old extra IDs so DB assigns new ones
        extras:       (ev.extras || []).map(({ id: _id, ...ex }) => ex),
      };
      await api.events.create(cloneData);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("✓ Event cloned as draft!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event cloned", detail: ev.title });
    } catch (e) {
      console.error("Clone failed:", e);
      showToast("Clone failed: " + (e.message || String(e)), "red");
    }
  };

  const [delEventConfirm, setDelEventConfirm] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const deleteEvent = async () => {
    if (!delEventConfirm) return;
    setDeletingEvent(true);
    try {
      await api.events.delete(delEventConfirm.id);
      const evList = await api.events.getAll();
      save({ events: evList });
      showToast("Event deleted!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Event deleted", detail: delEventConfirm.title || delEventConfirm.id });
      setDelEventConfirm(null);
    } catch (e) {
      showToast("Delete failed: " + e.message, "red");
    } finally {
      setDeletingEvent(false);
    }
  };

  const viewEv = viewId ? data.events.find(e => e.id === viewId) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Events &amp; Bookings</div>
          <div className="page-sub">{data.events.length} events · {allBookings.length} bookings · {allBookings.filter(b => b.checkedIn).length} checked in</div>
        </div>
        <div className="gap-2">
          {tab === "events" && <button className="btn btn-primary" onClick={() => { setForm(blank); bannerFileRef.current = null; setModal("new"); }}>+ New Event</button>}
          {tab === "checkin" && <>
            <button className="btn btn-primary" onClick={() => setScanning(true)}>📷 Scan QR</button>
            <button className="btn btn-ghost" onClick={downloadList}>⬇ Export</button>
          </>}
        </div>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "events" ? "active" : ""}`} onClick={() => setTab("events")}>📅 Events</button>
        <button className={`nav-tab ${tab === "bookings" ? "active" : ""}`} onClick={() => setTab("bookings")}>🎟 All Bookings</button>
        <button className={`nav-tab ${tab === "checkin" ? "active" : ""}`} onClick={() => setTab("checkin")}>✅ Check-In</button>
      </div>

      {/* ── EVENTS TAB ── */}
      {tab === "events" && (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Event</th><th>Date / Time</th><th>Slots</th><th>Booked</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.events.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No events yet</td></tr>}
            {data.events.map(ev => {
              const booked = ev.bookings.reduce((s, b) => s + b.qty, 0);
              return (
                <tr key={ev.id}>
                  <td>
                    <button style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 13 }}
                      onClick={() => setViewId(ev.id)}>{ev.title}</button>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtDate(ev.date)} {ev.time}</td>
                  <td>{ev.walkOnSlots + ev.rentalSlots}</td>
                  <td>{booked}</td>
                  <td>{ev.published ? <span className="tag tag-green">Live</span> : <span className="tag tag-red">Draft</span>}</td>
                  <td>
                    <div className="gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...ev }); setModal(ev.id); }}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => clone(ev)}>Clone</button>
                      {ev.published && new Date(ev.date) >= new Date() && ev.bookings.length > 0 && (
                        <button className="btn btn-sm btn-ghost" style={{ color: "var(--accent)", borderColor: "rgba(200,255,0,.3)" }}
                          onClick={async () => {
                            showToast("Sending reminders…", "gold");
                            try {
                              const bookedUsers = ev.bookings.map(b => {
                                const u = data.users.find(u => u.id === b.userId);
                                return u ? { ...u, bookingType: b.type } : null;
                              }).filter(Boolean);
                              const r = await sendEventReminderEmail({ ev, bookedUsers });
                              showToast(`📧 Reminders: ${r.sent} sent${r.failed > 0 ? `, ${r.failed} failed` : ""}`, r.failed > 0 ? "gold" : "");
                            } catch(e) { showToast("Failed: " + e.message, "red"); }
                          }}>📧 Remind</button>
                      )}
                      <button className="btn btn-sm btn-ghost" style={{ fontSize:10 }}
                        onClick={() => openWaitlist(ev)} disabled={waitlistLoading} title="View waitlist">
                        🔔{ev.waitlistCount > 0 ? ` ${ev.waitlistCount}` : ""}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDelEventConfirm(ev)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}

      {/* ── ALL BOOKINGS TAB ── */}
      {tab === "bookings" && (
        <BookingsTab
          allBookings={allBookings}
          data={data}
          doCheckin={doCheckin}
          save={save}
          showToast={showToast}
          cu={cu}
        />
      )}

      {/* ── CHECK-IN TAB ── */}
      {tab === "checkin" && (
        <div>
          <div className="grid-2 mb-2">
            <div className="form-group" style={{ margin: 0 }}>
              <label>Select Event</label>
              <select value={evId} onChange={e => setEvId(e.target.value)}>
                {data.events.map(e => <option key={e.id} value={e.id}>{e.title} — {fmtDate(e.date)}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5, letterSpacing: ".06em", textTransform: "uppercase" }}>Name / Booking ID</div>
                <input value={manual} onChange={e => setManual(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && manualCheckin()}
                  placeholder="Search player name or paste booking ID" />
              </div>
              <button className="btn btn-primary" onClick={manualCheckin}>Check In</button>
            </div>
          </div>

          {ev && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{ev.title} — {fmtDate(ev.date)}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="text-green" style={{ fontSize: 13, fontWeight: 700 }}>
                    {checkedInCount} / {ev.bookings.length} checked in
                  </span>
                  <div className="progress-bar" style={{ width: 100 }}>
                    <div className="progress-fill" style={{ width: ev.bookings.length ? (checkedInCount / ev.bookings.length * 100) + "%" : "0%" }} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => { setAddBookingForm({ userId: "", type: "walkOn", qty: 1, extras: {} }); setAddBookingModal(true); }}>+ Add Booking</button>
                </div>
              </div>
              <div className="table-wrap"><table className="data-table">
                <thead>
                  <tr><th>Player</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Booked</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {ev.bookings.length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--muted)", textAlign: "center", padding: 30 }}>No bookings for this event</td></tr>
                  )}
                  {ev.bookings.map(b => {
                    const bookedExtras = b.extras && typeof b.extras === "object"
                      ? ev.extras.filter(ex => (b.extras[ex.id] || 0) > 0)
                      : [];

                    const downloadTicket = () => {
                      const extrasHtml = bookedExtras.length > 0
                        ? `<tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee;width:140px">Extras</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${bookedExtras.map(ex => `${ex.name} ×${b.extras[ex.id]}`).join(", ")}</td></tr>`
                        : "";
                      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                        <title>Ticket — ${b.userName}</title>
                        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
                        <style>
                          body{font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto;color:#222}
                          h1{font-size:20px;margin:0 0 4px}
                          .header{border-bottom:3px solid #222;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start}
                          table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px}
                          .ref{font-family:monospace;font-size:11px;color:#888;margin-top:4px}
                          .badge{display:inline-block;background:#000;color:#c8ff00;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:.1em;margin-bottom:20px}
                          .qr{text-align:center;margin:24px 0}
                          .footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
                          @media print{body{padding:16px}}
                        </style></head>
                        <body>
                          <div class="header">
                            <div>
                              <h1>SWINDON AIRSOFT</h1>
                              <div style="font-size:13px;color:#666">Field Pass / Booking Confirmation</div>
                            </div>
                            <div class="badge">CONFIRMED</div>
                          </div>
                          <table>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee;width:140px">Player</td><td style="padding:8px 14px;border-bottom:1px solid #eee;font-weight:700">${b.userName}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Event</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${ev.title}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Date</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${fmtDate(ev.date)} @ ${ev.time} GMT</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Location</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${ev.location || "Swindon Airsoft Field"}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Ticket Type</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${b.type === "walkOn" ? "Walk-On" : "Rental Package"} ×${b.qty}</td></tr>
                            <tr><td style="padding:8px 14px;color:#555;font-weight:600;border-bottom:1px solid #eee">Total Paid</td><td style="padding:8px 14px;border-bottom:1px solid #eee;font-weight:700">£${b.total.toFixed(2)}</td></tr>
                            ${extrasHtml}
                          </table>
                          <div class="qr">
                            <div id="qr"></div>
                            <div class="ref">Booking Ref: ${b.id.toUpperCase()}</div>
                          </div>
                          <div style="font-size:12px;color:#444;background:#f9f9f9;padding:12px;border-left:3px solid #222">
                            Please bring this ticket (printed or on your phone) to the field. Staff will scan the QR code or check your booking reference at the gate.
                          </div>
                          <div class="footer">Generated by Swindon Airsoft Admin · ${new Date().toLocaleString("en-GB")}</div>
                          <script>new QRCode(document.getElementById("qr"),{text:"${b.id}",width:160,height:160,colorDark:"#000000",colorLight:"#ffffff"});<\/script>
                        </body></html>`;
                      const blob = new Blob([html], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `ticket-${b.userName.replace(/\s+/g,"-").toLowerCase()}-${ev.date}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    };

                    return (
                      <tr key={b.id} style={{ background: b.checkedIn ? "#1a0e08" : "transparent" }}>
                        <td style={{ fontWeight: 600 }}>{b.userName}</td>
                        <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                        <td>{b.qty}</td>
                        <td style={{ fontSize: 11 }}>
                          {bookedExtras.length === 0
                            ? <span style={{ color: "var(--muted)" }}>—</span>
                            : bookedExtras.map(ex => (
                                <div key={ex.id} style={{ fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap", color: "var(--accent)" }}>
                                  {ex.name} ×{b.extras[ex.id]}
                                </div>
                              ))
                          }
                        </td>
                        <td className="text-green">£{b.total.toFixed(2)}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{gmtShort(b.date)}</td>
                        <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                        <td>
                          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                            {!b.checkedIn
                              ? <button className="btn btn-sm btn-primary" onClick={() => doCheckin(b, ev)}>✓ Check In</button>
                              : <span className="text-muted" style={{ fontSize: 11 }}>✓ Done</span>
                            }
                            <button onClick={downloadTicket} style={{ background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.25)", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:10, letterSpacing:".1em", padding:"3px 8px", cursor:"pointer", borderRadius:2, whiteSpace:"nowrap" }}>
                              ⬇ Ticket
                            </button>
                            <button
                              onClick={() => resendTicket(b, ev)}
                              disabled={resendBusy[b.id]}
                              style={{ background:"rgba(79,195,247,.08)", border:"1px solid rgba(79,195,247,.25)", color: resendBusy[b.id] ? "#555" : "#4fc3f7", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:10, letterSpacing:".1em", padding:"3px 8px", cursor: resendBusy[b.id] ? "default" : "pointer", borderRadius:2, whiteSpace:"nowrap" }}
                            >
                              {resendBusy[b.id] ? "…" : "📧 Resend"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      )}

      {/* Event view modal */}
      {viewEv && (
        <div className="overlay" onClick={() => setViewId(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:4 }}>
              <div className="modal-title" style={{ margin:0 }}>📅 {viewEv.title}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => printPlayerList(viewEv)}>🖨️ Print Player List</button>
            </div>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>{fmtDate(viewEv.date)} @ {viewEv.time} GMT | {viewEv.location} · {viewEv.bookings.length} booked</p>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Player</th><th>Type</th><th>Qty</th><th>Extras</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {viewEv.bookings.map(b => (
                  <tr key={b.id}>
                    <td>{b.userName}</td>
                    <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                    <td>{b.qty}</td>
                    <td style={{fontSize:11}}>
                      {(() => {
                        const entries = b.extras ? Object.entries(b.extras).filter(([,v])=>v>0) : [];
                        if (!entries.length) return <span style={{color:"var(--muted)"}}>—</span>;
                        return entries.map(([k,v]) => {
                          const [xId, vId] = k.includes(":") ? k.split(":") : [k, null];
                          const exDef = viewEv.extras?.find(e => e.id === xId);
                          const shopP = exDef ? (data.shop||[]).find(p => p.id === exDef.productId) : null;
                          const varDef = vId && shopP ? (shopP.variants||[]).find(vv => vv.id === vId) : null;
                          const label = exDef ? (varDef ? `${exDef.name} — ${varDef.name}` : exDef.name) : k;
                          return <div key={k} style={{color:"var(--accent)",whiteSpace:"nowrap"}}>{label} ×{v}</div>;
                        });
                      })()}
                    </td>
                    <td className="text-green">£{b.total.toFixed(2)}</td>
                    <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                  </tr>
                ))}
                {viewEv.bookings.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No bookings</td></tr>}
              </tbody>
            </table></div>
            <button className="btn btn-ghost mt-2" onClick={() => setViewId(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Event edit/new modal */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === "new" ? "➕ New Event" : "✏️ Edit Event"}</div>
            <div className="form-row">
              <div className="form-group"><label>Title</label><input value={form.title} onChange={e => f("title", e.target.value)} /></div>
              <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => f("date", e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Start Time (GMT)</label><input type="time" value={form.time} onChange={e => f("time", e.target.value)} /></div>
              <div className="form-group"><label>End Time (GMT)</label><input type="time" value={form.endTime||""} onChange={e => f("endTime", e.target.value)} /></div>
              <div className="form-group"><label>Location</label><input value={form.location} onChange={e => f("location", e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <div style={{ border:"1px solid var(--border)", borderRadius:4, overflow:"hidden" }}>
                {/* Toolbar */}
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", padding:"6px 8px", background:"#1a1a1a", borderBottom:"1px solid var(--border)" }}>
                  {[
                    { label:"B", title:"Bold", wrap:["**","**"] },
                    { label:"I", title:"Italic", wrap:["*","*"] },
                    { label:"H2", title:"Heading 2", line:"## " },
                    { label:"H3", title:"Heading 3", line:"### " },
                    { label:"•", title:"Bullet list", line:"- " },
                    { label:"—", title:"Divider", insert:"\n---\n" },
                  ].map(btn => (
                    <button key={btn.label} title={btn.title} type="button"
                      style={{ background:"#2a2a2a", border:"1px solid #333", color:"#ccc", width:30, height:26, fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:2 }}
                      onClick={() => {
                        const ta = document.getElementById("evt-desc-ta");
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        const val = form.description;
                        let newVal, cursor;
                        if (btn.wrap) {
                          newVal = val.slice(0,start) + btn.wrap[0] + val.slice(start,end) + btn.wrap[1] + val.slice(end);
                          cursor = end + btn.wrap[0].length + btn.wrap[1].length;
                        } else if (btn.line) {
                          const lineStart = val.lastIndexOf("\n", start-1)+1;
                          newVal = val.slice(0,lineStart) + btn.line + val.slice(lineStart);
                          cursor = start + btn.line.length;
                        } else {
                          newVal = val.slice(0,start) + btn.insert + val.slice(end);
                          cursor = start + btn.insert.length;
                        }
                        f("description", newVal);
                        setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
                      }}
                    >{btn.label}</button>
                  ))}
                  <span style={{ fontSize:10, color:"#555", marginLeft:4, alignSelf:"center" }}>Markdown supported · **bold** *italic* ## heading - list ---</span>
                </div>
                {/* Editor / Preview toggle */}
                {(() => {
                  const [descTab, setDescTab] = [form._descTab||"edit", v => f("_descTab", v)];
                  return (
                    <>
                      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"#111" }}>
                        {["edit","preview"].map(t => (
                          <button key={t} type="button" onClick={() => setDescTab(t)}
                            style={{ padding:"5px 16px", fontSize:11, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", background:"none", border:"none", borderBottom: descTab===t ? "2px solid var(--accent)" : "2px solid transparent", color: descTab===t ? "var(--accent)" : "#555", cursor:"pointer" }}>
                            {t==="edit"?"✏ EDIT":"👁 PREVIEW"}
                          </button>
                        ))}
                      </div>
                      {descTab !== "preview"
                        ? <textarea id="evt-desc-ta" rows={8} value={form.description} onChange={e => f("description", e.target.value)} style={{ width:"100%", background:"#111", border:"none", padding:"10px", resize:"vertical", color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:"none" }} />
                        : <div style={{ minHeight:160, padding:"10px 14px", background:"#0d0d0d", color:"var(--muted)", fontSize:14, lineHeight:1.8 }} dangerouslySetInnerHTML={{ __html: renderMd(form.description) || "<span style='color:#444'>Nothing to preview yet...</span>" }} />
                      }
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Walk-On Slots</label><input type="number" value={form.walkOnSlots} onChange={e => f("walkOnSlots", +e.target.value)} /></div>
              <div className="form-group"><label>Rental Slots</label><input type="number" value={form.rentalSlots} onChange={e => f("rentalSlots", +e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Walk-On Price (£)</label><input type="number" value={form.walkOnPrice} onChange={e => f("walkOnPrice", +e.target.value)} /></div>
              <div className="form-group"><label>Rental Price (£)</label><input type="number" value={form.rentalPrice} onChange={e => f("rentalPrice", +e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>Banner Image</label>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "inline-block", cursor: "pointer", marginBottom: 8 }}>
                    <div className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📁 Upload Image</div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files[0]; if (!file) return;
                      // Store original file immediately — no async race condition
                      bannerFileRef.current = file;
                      // Generate preview data URL for display only
                      const reader = new FileReader();
                      reader.onload = ev => f("banner", ev.target.result);
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, lineHeight: 1.6 }}>
                    Displayed at <strong style={{ color:"var(--accent)" }}>full width × 220px</strong> — recommended image size <strong style={{ color:"var(--accent)" }}>1200 × 400px</strong> (3:1 ratio). Uploads are auto-resized to max 1200px wide.
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Or paste a URL:</div>
                  <input value={form.banner && form.banner.startsWith("data:") ? "" : (form.banner || "")}
                    onChange={e => { bannerFileRef.current = null; f("banner", e.target.value); }} placeholder="https://..." />
                </div>
                {form.banner && (
                  <div style={{ position: "relative" }}>
                    <img src={form.banner} style={{ width: 100, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} alt="" />
                    <button onClick={() => { bannerFileRef.current = null; f("banner", ""); }} style={{ position: "absolute", top: -6, right: -6, background: "var(--red)", border: "none", color: "#fff", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                )}
              </div>
            </div>
            <div className="form-group"><label>Map Embed HTML (optional)</label><textarea rows={2} value={form.mapEmbed} onChange={e => f("mapEmbed", e.target.value)} placeholder='<iframe src="..." ...></iframe>' /></div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="checkbox" id="epub" checked={form.published} onChange={e => f("published", e.target.checked)} />
                <label htmlFor="epub" style={{ cursor:"pointer", fontSize:13 }}>Published (visible to players)</label>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="checkbox" id="eviponly" checked={form.vipOnly || false} onChange={e => f("vipOnly", e.target.checked)} />
                <label htmlFor="eviponly" style={{ cursor:"pointer", fontSize:13 }}>
                  <span style={{ color:"var(--gold)", fontWeight:700 }}>⭐ VIP Members Only</span>
                  <span style={{ color:"var(--muted)", fontSize:11, marginLeft:6 }}>— visible to all but only VIPs can book</span>
                </label>
              </div>
            </div>

            {/* ── Game Day Extras ── */}
            <div style={{ border:"1px solid #2a2a2a", borderLeft:"3px solid var(--accent)", marginBottom:16 }}>
              <div style={{ background:"#0d0d0d", padding:"8px 14px", fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, borderBottom:"1px solid #2a2a2a" }}>
                GAME DAY EXTRAS — tick shop products to offer on this event
              </div>
              <div style={{ padding:14 }}>
                {data.shop.filter(p => p.gameExtra).length === 0 && (
                  <div style={{ fontSize:12, color:"var(--muted)" }}>No products marked as Game Day Extra yet. Tick "Available as Game Day Extra" on a product in the Shop section.</div>
                )}
                {data.shop.filter(p => p.gameExtra).map(p => {
                  const alreadyAdded = (form.extras || []).some(ex => ex.productId === p.id);
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #1a1a1a" }}>
                      <input type="checkbox" checked={alreadyAdded} onChange={e => {
                        const extras = form.extras || [];
                        if (e.target.checked) {
                          f("extras", [...extras, { id: uid(), name: p.name, price: p.price, noPost: p.noPost, productId: p.id, variantId: null }]);
                        } else {
                          f("extras", extras.filter(ex => ex.productId !== p.id));
                        }
                      }} />
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{p.name}</span>
                        {p.noPost && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:6 }}>Collect Only</span>}
                        <span style={{ fontSize:11, color:"var(--muted)", marginLeft:8 }}>£{p.price} · stock: {p.stock}</span>
                        {p.variants?.length > 0 && <span style={{ fontSize:11, color:"var(--accent)", marginLeft:8 }}>{p.variants.length} variants</span>}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>

            {modal === "new" && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="email-announce"
                  checked={!!form._emailUsers}
                  onChange={e => f("_emailUsers", e.target.checked)}
                  style={{ accentColor: "#c8ff00", width: 16, height: 16 }}
                />
                <label htmlFor="email-announce" style={{ cursor: "pointer", fontSize: 13, color: "#8aaa60" }}>
                  📧 Send announcement email to all players <span style={{ color: "#3a5010", fontSize: 11 }}>({(data.users||[]).filter(u => u.email && u.role !== "admin").length} recipients)</span>
                </label>
              </div>
            )}
            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEvent} disabled={savingEvent}>{savingEvent ? "Saving…" : "Save Event"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {scanning && <QRScanner onScan={onQRScan} onClose={() => setScanning(false)} />}

      {/* ── Waitlist View Modal ── */}
      {waitlistView && (
        <div className="overlay" onClick={() => setWaitlistView(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔔 Waitlist — {waitlistView.ev.title}</div>
            {waitlistView.entries.length === 0 ? (
              <div style={{ textAlign:"center", color:"var(--muted)", padding:"24px 0", fontSize:13 }}>No one on the waitlist for this event.</div>
            ) : (
              <>
                <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>
                  {waitlistView.entries.length} player(s) waiting · First in line gets notified when a slot opens.
                </div>
                <div className="table-wrap"><table className="data-table">
                  <thead><tr><th>#</th><th>Player</th><th>Email</th><th>Type</th><th>Joined</th><th></th></tr></thead>
                  <tbody>
                    {waitlistView.entries.map((w, i) => (
                      <tr key={w.id}>
                        <td style={{ color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{i + 1}</td>
                        <td style={{ fontWeight:600 }}>{w.user_name}</td>
                        <td style={{ fontSize:11 }}>{w.user_email}</td>
                        <td>{w.ticket_type === "walkOn" ? "🎯 Walk-On" : "🪖 Rental"}</td>
                        <td style={{ fontSize:11, fontFamily:"'Share Tech Mono',monospace" }}>{new Date(w.created_at).toLocaleDateString("en-GB")}</td>
                        <td>
                          <button className="btn btn-sm btn-ghost" style={{ color:"var(--red)", fontSize:11 }}
                            onClick={async () => {
                              try {
                                await waitlistApi.removeEntry(w.id);
                                setWaitlistView(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== w.id) }));
                                showToast("Removed from waitlist.");
                              } catch(e) { showToast("Failed: " + e.message, "red"); }
                            }}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <div className="gap-2" style={{ marginTop:16 }}>
                  <button className="btn btn-primary" style={{ fontSize:11 }}
                    onClick={() => emailWaitlist(waitlistView.ev, waitlistView.entries)}>
                    📧 Email All Waitlisted Players
                  </button>
                  <button className="btn btn-ghost" onClick={() => setWaitlistView(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add Booking Modal ── */}
      {addBookingModal && (() => {
        const targetEv = data.events.find(e => e.id === evId);
        const players = [...(data.users || [])].filter(u => u.role !== "admin").sort((a,b) => a.name.localeCompare(b.name));
        const selectedPlayer = players.find(p => p.id === addBookingForm.userId);
        const ticketPrice = addBookingForm.type === "walkOn" ? (targetEv?.walkOnPrice || 0) : (targetEv?.rentalPrice || 0);
        // Calculate extras total for price preview
        const extrasPreviewTotal = Object.entries(addBookingForm.extras).filter(([,v]) => v > 0).reduce((s, [key, qty]) => {
          const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
          const ex = targetEv?.extras?.find(e => e.id === extraId);
          const lp = (data.shop || []).find(p => p.id === ex?.productId);
          const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
          const price = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
          return s + price * qty;
        }, 0);
        const previewTotal = ticketPrice * addBookingForm.qty + extrasPreviewTotal;

        return (
          <div className="overlay" onClick={() => !addBookingBusy && setAddBookingModal(false)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()}>
              <div className="modal-title">➕ Add Booking — {targetEv?.title}</div>

              {/* Player picker */}
              <div className="form-group">
                <label>Player</label>
                <select value={addBookingForm.userId} onChange={e => abf("userId", e.target.value)}
                  style={{ fontSize: 13 }}>
                  <option value="">— Select a registered player —</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.vipStatus === "active" ? " ⭐ VIP" : ""} — {p.email || "no email"}
                    </option>
                  ))}
                </select>
                {selectedPlayer && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace" }}>
                    Waiver: {selectedPlayer.waiverSigned === true && selectedPlayer.waiverYear === new Date().getFullYear()
                      ? <span style={{ color: "var(--accent)" }}>✓ Signed {selectedPlayer.waiverYear}</span>
                      : <span style={{ color: "var(--red)" }}>✗ Not signed</span>}
                    {" · "} UKARA: {selectedPlayer.ukara || "—"}
                  </div>
                )}
              </div>

              {/* Ticket type + qty */}
              <div className="form-row">
                <div className="form-group">
                  <label>Ticket Type</label>
                  <select value={addBookingForm.type} onChange={e => abf("type", e.target.value)}>
                    <option value="walkOn">🎯 Walk-On — £{targetEv?.walkOnPrice}</option>
                    <option value="rental">🪖 Rental Package — £{targetEv?.rentalPrice}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" min={1} max={10} value={addBookingForm.qty}
                    onChange={e => abf("qty", Math.max(1, +e.target.value))} />
                </div>
              </div>

              {/* Game day extras */}
              {targetEv?.extras?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".1em" }}>GAME DAY EXTRAS</label>
                  <div style={{ border: "1px solid #2a2a2a", marginTop: 6 }}>
                    {targetEv.extras.map(ex => {
                      const lp = (data.shop || []).find(p => p.id === ex.productId);
                      const hasVariants = lp?.variants?.length > 0;
                      return (
                        <div key={ex.id} style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a1a" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: hasVariants ? 8 : 0 }}>
                            {ex.name}
                            {lp && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>£{lp.price}</span>}
                          </div>
                          {hasVariants ? lp.variants.map(v => {
                            const key = ex.id + ":" + v.id;
                            const qty = addBookingForm.extras[key] || 0;
                            return (
                              <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>{v.name} — £{Number(v.price).toFixed(2)}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [key]: Math.max(0, qty - 1) })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>−</button>
                                  <span style={{ minWidth: 20, textAlign: "center", fontFamily: "'Barlow Condensed',sans-serif" }}>{qty}</span>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [key]: qty + 1 })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>+</button>
                                </div>
                              </div>
                            );
                          }) : (() => {
                            const qty = addBookingForm.extras[ex.id] || 0;
                            return (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 12, color: "var(--accent)" }}>£{lp ? lp.price : ex.price}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [ex.id]: Math.max(0, qty - 1) })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>−</button>
                                  <span style={{ minWidth: 20, textAlign: "center", fontFamily: "'Barlow Condensed',sans-serif" }}>{qty}</span>
                                  <button onClick={() => abf("extras", { ...addBookingForm.extras, [ex.id]: qty + 1 })}
                                    style={{ background: "#222", border: "1px solid #333", color: "#fff", width: 28, height: 28, cursor: "pointer" }}>+</button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Price preview */}
              <div style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {addBookingForm.type === "walkOn" ? "Walk-On" : "Rental"} ×{addBookingForm.qty}
                  {extrasPreviewTotal > 0 && ` + extras`}
                </span>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, color: "var(--accent)" }}>£{previewTotal.toFixed(2)}</span>
              </div>

              <div className="gap-2">
                <button className="btn btn-primary" onClick={submitAddBooking} disabled={addBookingBusy || !addBookingForm.userId}>
                  {addBookingBusy ? "Adding…" : "✓ Add Booking"}
                </button>
                <button className="btn btn-ghost" onClick={() => setAddBookingModal(false)} disabled={addBookingBusy}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {delEventConfirm && (
        <div className="overlay" onClick={() => !deletingEvent && setDelEventConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Event?</div>
            <p style={{ fontSize:13, color:"var(--muted)", margin:"12px 0 4px" }}>
              Permanently delete <strong style={{ color:"var(--text)" }}>{delEventConfirm.title}</strong>?
            </p>
            <p style={{ fontSize:12, color:"var(--red)", marginBottom:20 }}>
              ⚠️ This will also delete all {delEventConfirm.bookings?.length || 0} booking(s) for this event. This cannot be undone.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingEvent} onClick={deleteEvent}>
                {deletingEvent ? "Deleting…" : "Yes, Delete Event"}
              </button>
              <button className="btn btn-ghost" disabled={deletingEvent} onClick={() => setDelEventConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Admin Cheat Reports ────────────────────────────────────
function AdminCheatReports({ data, showToast, cu }) {
  const [reports, setReports]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [statusFilter, setFilter]     = useState("pending");
  const [adminNotes, setAdminNotes]   = useState("");
  const [linking, setLinking]         = useState(false);
  const [linkSearch, setLinkSearch]   = useState("");
  const [busy, setBusy]               = useState(false);
  const [cardColor, setCardColor]     = useState("green");
  const [cardReason, setCardReason]   = useState("");
  const [issuingCard, setIssuingCard] = useState(false);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("cheat_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (isMounted.current) setReports(rows || []);
    } catch (e) { if (isMounted.current) showToast("Failed to load reports: " + e.message, "red"); }
    finally { if (isMounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const openReport = (r) => {
    setSelected(r);
    setAdminNotes(r.admin_notes || "");
    setLinking(false);
    setLinkSearch("");
    setCardColor("green");
    setCardReason("");
    setIssuingCard(false);
  };

  const updateReport = async (id, patch) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("cheat_reports").update(patch).eq("id", id);
      if (error) throw error;
      setReports(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
      if (selected?.id === id) setSelected(prev => ({ ...prev, ...patch }));
      showToast("Report updated.");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const saveNotes = () => updateReport(selected.id, { admin_notes: adminNotes });

  const setStatus = (status) => updateReport(selected.id, { status });

  const linkPlayer = (player) => {
    updateReport(selected.id, { linked_player_id: player.id });
    setLinking(false);
  };

  const unlinkPlayer = () => updateReport(selected.id, { linked_player_id: null });

  const issueCard = async () => {
    if (!selected?.linked_player_id) { showToast("Link a player first before issuing a card", "red"); return; }
    if (cardColor !== "green" && !cardReason.trim()) { showToast("Please enter a reason for the card", "red"); return; }
    setIssuingCard(true);
    try {
      const { error } = await supabase.from("profiles").update({
        card_status:    cardColor === "green" ? "none" : cardColor,
        card_reason:    cardColor === "green" ? null : cardReason.trim(),
        card_issued_at: cardColor === "green" ? null : new Date().toISOString(),
      }).eq("id", selected.linked_player_id);
      if (error) throw error;
      // Mark report as reviewed automatically
      await updateReport(selected.id, { status: "reviewed", admin_notes: (adminNotes ? adminNotes + "\n\n" : "") + `Card issued: ${cardColor === "green" ? "Cleared (no action)" : cardColor.toUpperCase()} — ${cardReason.trim() || "No reason given"} (${new Date().toLocaleDateString("en-GB")})` });
      setAdminNotes(prev => (prev ? prev + "\n\n" : "") + `Card issued: ${cardColor === "green" ? "Cleared (no action)" : cardColor.toUpperCase()} — ${cardReason.trim() || "No reason given"} (${new Date().toLocaleDateString("en-GB")})`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: `Card issued via cheat report`, detail: `Player: ${data.users.find(u => u.id === selected.linked_player_id)?.name || selected.linked_player_id} | Card: ${cardColor === "green" ? "cleared" : cardColor} | Reason: ${cardReason.trim() || "none"} | Report #${selected.id}` });
      showToast(cardColor === "green" ? "✅ Player cleared — no action taken." : `✅ ${cardColor.charAt(0).toUpperCase() + cardColor.slice(1)} card issued!`);
      setCardReason("");
      setCardColor("green");
    } catch (e) {
      showToast("Failed to issue card: " + e.message, "red");
    } finally {
      setIssuingCard(false);
    }
  };

  const filtered  = reports.filter(r => statusFilter === "all" || r.status === statusFilter);
  const pending   = reports.filter(r => r.status === "pending").length;
  const reviewed  = reports.filter(r => r.status === "reviewed").length;
  const dismissed = reports.filter(r => r.status === "dismissed").length;

  const STATUS_BADGE = { pending: { bg: "rgba(200,160,0,.15)", color: "var(--gold)", border: "rgba(200,160,0,.35)", label: "Pending" }, reviewed: { bg: "rgba(200,255,0,.08)", color: "var(--accent)", border: "rgba(200,255,0,.25)", label: "Reviewed" }, dismissed: { bg: "rgba(120,120,120,.12)", color: "var(--muted)", border: "rgba(120,120,120,.2)", label: "Dismissed" } };

  const matchingPlayers = data.users.filter(u =>
    u.role === "player" && linkSearch.trim() &&
    (u.name?.toLowerCase().includes(linkSearch.toLowerCase()) || u.email?.toLowerCase().includes(linkSearch.toLowerCase()))
  ).slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Cheat Reports</div>
          <div className="page-sub">Confidential — not visible to players</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      {/* Summary bar */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        {[["all","All",reports.length,"var(--muted)"],["pending","Pending",pending,"var(--gold)"],["reviewed","Reviewed",reviewed,"var(--accent)"],["dismissed","Dismissed",dismissed,"var(--muted)"]].map(([val,label,count,color]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ background: statusFilter===val ? "var(--bg4)" : "transparent", border:`1px solid ${statusFilter===val ? "var(--border)" : "transparent"}`, color, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".1em", padding:"6px 14px", cursor:"pointer", borderRadius:4 }}>
            {label} <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11 }}>({count})</span>
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns: selected ? "1fr 1.4fr" : "1fr", gap:16 }}>
        {/* Report list */}
        <div>
          {loading ? <div style={{ textAlign:"center", padding:40, color:"var(--muted)", fontSize:12 }}>Loading…</div>
          : filtered.length === 0 ? <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)", fontSize:13 }}>No {statusFilter !== "all" ? statusFilter : ""} reports.</div>
          : filtered.map(r => {
            const sb = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
            const isActive = selected?.id === r.id;
            return (
              <div key={r.id} onClick={() => openReport(r)} className="card mb-1" style={{ cursor:"pointer", border:`1px solid ${isActive ? "var(--accent)" : "var(--border)"}`, background: isActive ? "rgba(200,255,0,.04)" : undefined, padding:"12px 14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>Report #{r.id}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>
                      Reported by: <strong style={{ color:"var(--text)" }}>{r.reporter_name || "Anonymous"}</strong>
                    </div>
                    {r.reported_name && <div style={{ fontSize:11, color:"var(--muted)" }}>Accused: <strong style={{ color:"#ef5350" }}>{r.reported_name}</strong></div>}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                    <span style={{ background:sb.bg, color:sb.color, border:`1px solid ${sb.border}`, fontSize:10, fontWeight:700, letterSpacing:".1em", padding:"2px 8px", borderRadius:3, fontFamily:"'Barlow Condensed',sans-serif", textTransform:"uppercase" }}>{sb.label}</span>
                    <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
                <div style={{ fontSize:11, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.description}</div>
                {r.linked_player_id && <div style={{ marginTop:6, fontSize:10, color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace" }}>🔗 Linked: {data.users.find(u => u.id === r.linked_player_id)?.name || "Player"}</div>}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ position:"sticky", top:16, alignSelf:"start" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".1em" }}>REPORT #{selected.id}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕ Close</button>
            </div>

            {/* Status controls */}
            <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
              {["pending","reviewed","dismissed"].map(s => (
                <button key={s} className={`btn btn-sm ${selected.status === s ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus(s)} disabled={busy || selected.status === s} style={{ textTransform:"capitalize" }}>{s}</button>
              ))}
            </div>

            <div style={{ display:"grid", gap:10, marginBottom:16 }}>
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Reporter</label>
                <div style={{ fontWeight:600, padding:"6px 0" }}>{selected.reporter_name || "Anonymous"}</div>
              </div>
              {selected.reported_name && (
                <div className="form-group" style={{ margin:0 }}>
                  <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Accused Player Name</label>
                  <div style={{ fontWeight:600, color:"#ef5350", padding:"6px 0" }}>{selected.reported_name}</div>
                </div>
              )}
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Video Evidence</label>
                <a href={selected.video_url} target="_blank" rel="noopener noreferrer" style={{ display:"block", color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace", fontSize:11, wordBreak:"break-all", padding:"6px 0", textDecoration:"underline" }}>{selected.video_url}</a>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>Description</label>
                <div style={{ fontSize:13, lineHeight:1.7, color:"var(--text)", padding:"8px 0", whiteSpace:"pre-wrap" }}>{selected.description}</div>
              </div>
              <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>Submitted: {new Date(selected.created_at).toLocaleString("en-GB")}</div>
            </div>

            {/* Link to player profile */}
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:14, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>Link to Player Profile</div>
              {selected.linked_player_id ? (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:13, color:"var(--accent)", fontWeight:600 }}>🔗 {data.users.find(u => u.id === selected.linked_player_id)?.name || "Player"}</span>
                  <button className="btn btn-sm btn-danger" onClick={unlinkPlayer} disabled={busy}>Unlink</button>
                </div>
              ) : linking ? (
                <div>
                  <input autoFocus value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="Search player name or email…" style={{ width:"100%", marginBottom:8 }} />
                  {matchingPlayers.length > 0 && (
                    <div style={{ border:"1px solid var(--border)", borderRadius:4, overflow:"hidden" }}>
                      {matchingPlayers.map(p => (
                        <div key={p.id} onClick={() => linkPlayer(p)} style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, borderBottom:"1px solid var(--border)" }}
                          onMouseEnter={e => e.currentTarget.style.background="var(--bg4)"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          <strong>{p.name}</strong> <span style={{ color:"var(--muted)", fontSize:11 }}>{p.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }} onClick={() => setLinking(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => setLinking(true)}>🔗 Link to Player</button>
              )}
              {selected.linked_player_id && (
                <div style={{ marginTop:8, fontSize:11, color:"var(--muted)" }}>
                  This report will appear in the player's card warning history when you issue a card.
                </div>
              )}
            </div>

            {/* Issue Card */}
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:14, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", marginBottom:10 }}>Issue Card to Linked Player</div>
              {!selected.linked_player_id ? (
                <div style={{ fontSize:12, color:"var(--muted)", fontStyle:"italic" }}>Link a player above to issue a card.</div>
              ) : (
                <>
                  {/* Current card status */}
                  {(() => {
                    const p = data.users.find(u => u.id === selected.linked_player_id);
                    const cs = p?.cardStatus || "none";
                    const CARD_LABELS = { none:"✅ Clear", yellow:"🟡 Yellow Card", red:"🔴 Red Card", black:"⚫ Black Card" };
                    const CARD_COLORS = { none:"var(--accent)", yellow:"var(--gold)", red:"var(--red)", black:"#bbb" };
                    return (
                      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:10 }}>
                        Current status: <strong style={{ color: CARD_COLORS[cs] }}>{CARD_LABELS[cs] || cs}</strong>
                        {p?.cardReason && <span style={{ color:"var(--muted)" }}> — {p.cardReason}</span>}
                      </div>
                    );
                  })()}

                  {/* Card selector */}
                  <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                    {[
                      { val:"green",  label:"🟢 Clear",        bg:"rgba(100,200,50,.15)",  border:"rgba(100,200,50,.4)",  textColor:"var(--accent)" },
                      { val:"yellow", label:"🟡 Yellow Card",   bg:"rgba(200,160,0,.15)",   border:"rgba(200,160,0,.4)",   textColor:"var(--gold)" },
                      { val:"red",    label:"🔴 Red Card",      bg:"rgba(220,30,30,.12)",   border:"rgba(220,30,30,.4)",   textColor:"var(--red)" },
                      { val:"black",  label:"⚫ Black Card",    bg:"rgba(60,60,60,.25)",    border:"#555",                textColor:"#ccc" },
                    ].map(c => (
                      <button key={c.val} onClick={() => setCardColor(c.val)}
                        style={{ padding:"6px 12px", border:`2px solid ${cardColor === c.val ? c.border : "transparent"}`, background: cardColor === c.val ? c.bg : "transparent", color: cardColor === c.val ? c.textColor : "var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".1em", cursor:"pointer", borderRadius:3, transition:"all .15s" }}>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Reason — not required for green */}
                  {cardColor !== "green" && (
                    <div style={{ marginBottom:10 }}>
                      <label style={{ fontSize:10, letterSpacing:".12em", color:"var(--muted)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Reason <span style={{ color:"var(--red)" }}>*</span></label>
                      <input value={cardReason} onChange={e => setCardReason(e.target.value)} placeholder={`Reason for ${cardColor} card…`} style={{ width:"100%" }} />
                    </div>
                  )}

                  <button
                    className={`btn btn-sm ${cardColor === "green" ? "btn-ghost" : cardColor === "yellow" ? "btn-primary" : "btn-danger"}`}
                    onClick={issueCard}
                    disabled={issuingCard || busy || (cardColor !== "green" && !cardReason.trim())}
                    style={{ fontWeight:700 }}>
                    {issuingCard ? "Issuing…" : cardColor === "green" ? "✅ Clear Player" : `Issue ${cardColor.charAt(0).toUpperCase() + cardColor.slice(1)} Card`}
                  </button>

                  <div style={{ marginTop:8, fontSize:10, color:"var(--muted)", lineHeight:1.6 }}>
                    Issuing a card will update the player's profile immediately. The report will be automatically marked as <strong>Reviewed</strong>.
                  </div>
                </>
              )}
            </div>

            {/* Admin notes */}
            <div style={{ borderTop:"1px solid var(--border)", paddingTop:14 }}>
              <label style={{ fontSize:10, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase", display:"block", marginBottom:6 }}>Admin Notes (confidential)</label>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={4} placeholder="Internal notes about this report…" style={{ width:"100%", resize:"vertical" }} />
              <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={saveNotes} disabled={busy}>{busy ? "Saving…" : "Save Notes"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Players ─────────────────────────────────────────
function AdminPlayers({ data, save, updateUser, showToast, cu }) {
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="players" && ["all","vip","del","waivers"].includes(p[2]) ? p[2] : "all";
  };
  const [edit, setEdit] = useState(null);
  const [viewPlayer, setViewPlayer] = useState(null);
  const [waiverViewPlayer, setWaiverViewPlayer] = useState(null); // inline waiver panel
  const [contactPlayer, setContactPlayer] = useState(null);
  const [contactSubject, setContactSubject] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/players/" + t; };
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [localUsers, setLocalUsers] = useState(null); // null = not yet fetched
  const [playerSearch, setPlayerSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all | player | admin
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEmailSubject, setBulkEmailSubject] = useState("");
  const [bulkEmailBody, setBulkEmailBody] = useState("");
  const [bulkEmailModal, setBulkEmailModal] = useState(false);

  const loadUsers = () =>
    api.profiles.getAll()
      .then(list => {
        const users = list.map(normaliseProfile);
        setLocalUsers(users);
        save({ users });
      })
      .catch(e => showToast("Failed to load players: " + e.message, "red"));

  // Fetch fresh from DB on mount
  useEffect(() => { loadUsers(); }, []);

  // Wrapper that updates DB then refreshes localUsers
  const updateUserAndRefresh = async (id, patch) => {
    await updateUser(id, patch);
    loadUsers().catch(() => {}); // refresh in background — non-blocking
  };

  // Use local (fresh) users if available, fall back to global data.users
  const allUsers = localUsers ?? data.users;
  const players = allUsers.filter(u => u.role !== "admin");
  const vipApps = players.filter(u => u.vipApplied && u.vipStatus !== "active");
  const roleFiltered = roleFilter === "admin" ? allUsers.filter(u => u.role === "admin")
    : roleFilter === "player" ? allUsers.filter(u => u.role !== "admin")
    : allUsers;
  const filteredPlayers = playerSearch.trim()
    ? roleFiltered.filter(u => {
        const q = playerSearch.toLowerCase();
        return u.name?.toLowerCase().includes(q) ||
               u.email?.toLowerCase().includes(q) ||
               u.phone?.toLowerCase().includes(q) ||
               u.ukara?.toLowerCase().includes(q);
      })
    : roleFiltered;

  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setSavingEdit(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const [delAccountConfirm, setDelAccountConfirm] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [vipApproveModal, setVipApproveModal] = useState(null); // user being approved
  const [vipUkara, setVipUkara] = useState("");
  const [vipApproveBusy, setVipApproveBusy] = useState(false);
  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const deletedName = delAccountConfirm.name;
      const deletedEmail = delAccountConfirm.email || "";
      const deletedId = delAccountConfirm.id;
      await api.profiles.delete(deletedId);
      setLocalUsers(prev => prev ? prev.filter(x => x.id !== deletedId) : prev);
      save({ users: data.users.filter(x => x.id !== deletedId) });
      setDelAccountConfirm(null);
      showToast(`✓ Account permanently deleted: ${deletedName}`, "red");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Player account deleted", detail: `${deletedName} (${deletedEmail}) — ID: ${deletedId}` });
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setDeletingAccount(false); }
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      // Determine vip_applied and vip_expires_at based on status change
      let vipApplied = edit.vipApplied ?? false;
      let vipExpiresAt = edit.vipExpiresAt || null;
      if (edit.vipStatus === "none") {
        // Demoting to None — clear applied flag, player must go through the full apply+pay flow again
        vipApplied   = false;
        vipExpiresAt = null;
      } else if (edit.vipStatus === "active" && !edit.vipExpiresAt) {
        // Manually setting active without an expiry — set 1 year from now
        const exp = new Date();
        exp.setFullYear(exp.getFullYear() + 1);
        vipExpiresAt = exp.toISOString();
      } else if (edit.vipStatus === "expired") {
        vipExpiresAt = null;
      }

      const { error } = await supabase.from('profiles').update({
        name:           edit.name,
        email:          edit.email,
        phone:          edit.phone || '',
        games_attended: edit.gamesAttended,
        vip_status:     edit.vipStatus,
        vip_applied:    vipApplied,
        vip_expires_at: vipExpiresAt,
        ukara:          edit.ukara || '',
        credits:        Number(edit.credits) || 0,
        address:        edit.address || '',
        delete_request: edit.deleteRequest || false,
        admin_notes:    edit.adminNotes || '',
        card_status:    edit.cardStatus  || 'none',
        card_reason:    edit.cardReason  || null,
        card_issued_at: (edit.cardStatus && edit.cardStatus !== 'none') ? (edit.cardIssuedAt || new Date().toISOString()) : null,
        can_marshal:    edit.canMarshal  || false,
        custom_rank:    edit.customRank  || null,
        designation:    edit.designation || null,
      }).eq('id', edit.id);
      if (error) throw new Error(error.message);
      // Role change — direct update (allowed via SECURITY DEFINER trigger for admins)
      const origUser = (localUsers || data.users || []).find(u => u.id === edit.id);
      if (edit.role && edit.role !== origUser?.role) {
        const { error: roleErr } = await supabase.from('profiles').update({ role: edit.role }).eq('id', edit.id);
        if (roleErr) throw new Error('Role update failed: ' + roleErr.message);
      }
      // Refresh from DB and update global state
      const allProfiles = await api.profiles.getAll();
      const updated = allProfiles.map(normaliseProfile);
      setLocalUsers(updated);
      save({ users: updated });
      showToast("Player updated!");
      const before = {
        name:          origUser?.name,
        email:         origUser?.email,
        phone:         origUser?.phone,
        role:          origUser?.role,
        gamesAttended: origUser?.gamesAttended,
        vipStatus:     origUser?.vipStatus,
        ukara:         origUser?.ukara,
        credits:       origUser?.credits,
        adminNotes:    origUser?.adminNotes,
        cardStatus:    origUser?.cardStatus,
        cardReason:    origUser?.cardReason,
        canMarshal:    origUser?.canMarshal,
        customRank:    origUser?.customRank,
        designation:   origUser?.designation,
        deleteRequest: origUser?.deleteRequest,
      };
      const after = {
        name:          edit.name,
        email:         edit.email,
        phone:         edit.phone,
        role:          edit.role,
        gamesAttended: edit.gamesAttended,
        vipStatus:     edit.vipStatus,
        ukara:         edit.ukara,
        credits:       edit.credits,
        adminNotes:    edit.adminNotes,
        cardStatus:    edit.cardStatus,
        cardReason:    edit.cardReason,
        canMarshal:    edit.canMarshal,
        customRank:    edit.customRank,
        designation:   edit.designation,
        deleteRequest: edit.deleteRequest,
      };
      const LABELS = {
        name: "Name", email: "Email", phone: "Phone", role: "Role",
        gamesAttended: "Games", vipStatus: "VIP status", ukara: "UKARA",
        credits: "Credits", adminNotes: "Admin notes", cardStatus: "Card status",
        cardReason: "Card reason", canMarshal: "Can marshal",
        customRank: "Custom rank", designation: "Designation",
        deleteRequest: "Delete request",
      };
      const diff = diffFields(before, after, LABELS);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Player updated", detail: `${edit.name}${diff ? ` — ${diff}` : " (no field changes)"}` });
      setEdit(null);
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
      setSavingEdit(false);
    }
  };

  // Recalculate every player's game count from actual checked-in bookings in the DB
  const recalcAll = async () => {
    setRecalcBusy(true);
    try {
      const { data: allBookings, error } = await supabase
        .from('bookings').select('user_id').eq('checked_in', true);
      if (error) throw error;

      // Count per user
      const counts = {};
      allBookings.forEach(b => { counts[b.user_id] = (counts[b.user_id] || 0) + 1; });

      // Update each player
      let updated = 0;
      for (const u of players) {
        const correct = counts[u.id] || 0;
        if (u.gamesAttended !== correct) {
          await updateUser(u.id, { gamesAttended: correct });
          updated++;
        }
      }
      // Refresh user list
      const allProfiles = await api.profiles.getAll();
      save({ users: allProfiles.map(normaliseProfile) });
      showToast(`✅ Recalculated! ${updated} player(s) corrected.`);
    } catch (e) {
      showToast("Failed: " + e.message, "red");
    } finally {
      setRecalcBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Players</div><div className="page-sub">{players.length} registered</div></div>
        <button className="btn btn-ghost btn-sm" onClick={recalcAll} disabled={recalcBusy} title="Recalculate all players' game counts from actual check-ins">
          {recalcBusy ? "Recalculating…" : "🔄 Recalc Game Counts"}
        </button>
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>All Players</button>
      </div>

      {tab === "all" && (
        <div className="card">
          {localUsers === null && <div style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Loading players…</div>}
          {/* Role filter tabs */}
          <div style={{ display:"flex", gap:4, marginBottom:10 }}>
            {[
              { key:"all",    label:"ALL",     count: allUsers.length },
              { key:"player", label:"PLAYERS", count: allUsers.filter(u=>u.role!=="admin").length },
              { key:"admin",  label:"ADMINS",  count: allUsers.filter(u=>u.role==="admin").length },
            ].map(({ key, label, count }) => (
              <button key={key} onClick={() => { setRoleFilter(key); setSelectedPlayerIds(new Set()); }}
                style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em",
                  padding:"5px 14px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                  background: roleFilter===key ? "rgba(200,255,0,.12)" : "transparent",
                  borderColor: roleFilter===key ? "rgba(200,255,0,.5)" : "var(--border)",
                  color: roleFilter===key ? "#c8ff00" : "var(--muted)" }}>
                {label} <span style={{ opacity:.7 }}>({count})</span>
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              placeholder="Search by name, email, phone or UKARA…"
              style={{ flex: 1, fontSize: 13 }}
            />
            {playerSearch && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPlayerSearch("")}>✕ Clear</button>
            )}
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {filteredPlayers.length} / {roleFiltered.length}
            </span>
          </div>
          {selectedPlayerIds.size > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:"rgba(200,255,0,.04)", border:"1px solid rgba(200,255,0,.15)", marginBottom:8, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#c8ff00", letterSpacing:".15em", whiteSpace:"nowrap" }}>{selectedPlayerIds.size} SELECTED</span>
              <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
                style={{ background:"#0c1009", border:"1px solid #2a3a10", color:"#c8e878", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, padding:"4px 8px", outline:"none" }}>
                <option value="">— Choose action —</option>
                <option value="export-csv">📊 Export CSV</option>
                <option value="bulk-email">📧 Send Email</option>
                <option value="yellow-card">🟡 Yellow card</option>
                <option value="clear-card">✅ Clear card</option>
                <option value="add-credit">💰 Add £5 credit</option>
              </select>
              <button className="btn btn-sm btn-primary" disabled={!bulkAction || bulkBusy}
                onClick={async () => {
                  if (!bulkAction) return;
                  const selected = filteredPlayers.filter(u => selectedPlayerIds.has(u.id));
                  if (bulkAction === "bulk-email") { setBulkEmailModal(true); return; }
                  if (bulkAction === "export-csv") {
                    const rows = ["Name,Email,Games,VIP,UKARA,Credits,CardStatus",
                      ...selected.map(u => `"${u.name}","${u.email||""}",${ u.gamesAttended||0},${u.vipStatus==="active"?"YES":"NO"},"${u.ukara||""}",${u.credits||0},"${u.cardStatus||"none"}"`)
                    ].join("\n");
                    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows); a.download = "players-export.csv"; a.click();
                    showToast(`Exported ${selected.length} players`);
                  } else {
                    setBulkBusy(true);
                    try {
                      for (const u of selected) {
                        if (bulkAction === "add-credit") {
                          // Direct DB increment — avoids RLS issues and stale local values
                          const { data: fresh, error: fetchErr } = await supabase
                            .from("profiles").select("credits").eq("id", u.id).single();
                          if (fetchErr) throw fetchErr;
                          const newCredits = (Number(fresh?.credits) || 0) + 5;
                          const { error: updateErr } = await supabase
                            .from("profiles").update({ credits: newCredits }).eq("id", u.id);
                          if (updateErr) throw updateErr;
                          // Update local state
                          save({ users: (data.users||[]).map(x => x.id === u.id ? { ...x, credits: newCredits } : x) });
                        } else {
                          const update = bulkAction === "yellow-card"
                            ? { cardStatus: "yellow" }
                            : { cardStatus: "none" };
                          await updateUserAndRefresh(u.id, update);
                        }
                      }
                      await loadUsers();
                      showToast(`Updated ${selected.length} players`);
                    } catch(e) { showToast("Bulk action failed: " + e.message, "red"); }
                    finally { setBulkBusy(false); }
                  }
                  setSelectedPlayerIds(new Set()); setBulkAction("");
                }}>
                {bulkBusy ? "⏳" : "APPLY"}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setSelectedPlayerIds(new Set()); setBulkAction(""); }}>✕ Clear</button>
            </div>
          )}

          {/* Bulk email modal */}
          {bulkEmailModal && (
            <div className="overlay" onClick={() => setBulkEmailModal(false)}>
              <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:500 }}>
                <div className="modal-title">📧 Send Email to {selectedPlayerIds.size} Players</div>
                <div className="form-group">
                  <label>Subject</label>
                  <input value={bulkEmailSubject} onChange={e => setBulkEmailSubject(e.target.value)} placeholder="e.g. Important update from Swindon Airsoft" />
                </div>
                <div className="form-group">
                  <label>Message</label>
                  <textarea rows={6} value={bulkEmailBody} onChange={e => setBulkEmailBody(e.target.value)} placeholder="Write your message here…" />
                </div>
                <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>
                  Will be sent to: {filteredPlayers.filter(u => selectedPlayerIds.has(u.id)).map(u => u.name).join(", ")}
                </div>
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => setBulkEmailModal(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!bulkEmailSubject.trim() || !bulkEmailBody.trim() || bulkBusy}
                    onClick={async () => {
                      const selected = filteredPlayers.filter(u => selectedPlayerIds.has(u.id)).filter(u => u.email);
                      setBulkBusy(true);
                      let sent = 0, failed = 0;
                      for (const u of selected) {
                        try {
                          await sendEmail({ toEmail: u.email, toName: u.name, subject: bulkEmailSubject, htmlContent: `<div style="font-family:sans-serif;color:#ddd;background:#111;padding:24px;border-radius:8px"><p style="white-space:pre-wrap">${bulkEmailBody}</p><hr style="border-color:#333;margin:20px 0"><p style="font-size:12px;color:#666">— Swindon Airsoft</p></div>` });
                          sent++;
                        } catch { failed++; }
                      }
                      showToast(`📧 Sent: ${sent}${failed > 0 ? `, Failed: ${failed}` : ""}`, failed > 0 ? "gold" : "");
                      setBulkBusy(false); setBulkEmailModal(false); setBulkEmailSubject(""); setBulkEmailBody("");
                      setSelectedPlayerIds(new Set()); setBulkAction("");
                    }}>
                    {bulkBusy ? "⏳ Sending…" : `📧 Send to ${filteredPlayers.filter(u=>selectedPlayerIds.has(u.id)&&u.email).length} players`}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap"><table className="data-table">
            <thead><tr>
              <th style={{ width:28 }}>
                <input type="checkbox"
                  checked={filteredPlayers.length > 0 && filteredPlayers.every(u => selectedPlayerIds.has(u.id))}
                  onChange={e => setSelectedPlayerIds(e.target.checked ? new Set(filteredPlayers.map(u=>u.id)) : new Set())} />
              </th>
              <th>Name</th><th>Email</th><th>Games</th><th>VIP / UKARA</th><th>Waiver</th><th>Credits</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredPlayers.map(u => (
                <tr key={u.id} style={{ background: selectedPlayerIds.has(u.id) ? "rgba(200,255,0,.03)" : "" }}>
                  <td><input type="checkbox" checked={selectedPlayerIds.has(u.id)} onChange={e => setSelectedPlayerIds(prev => { const n = new Set(prev); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} /></td>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{u.email}</td>
                  <td>{u.gamesAttended}</td>
                  <td>
                    {u.vipStatus === "active" ? <span className="tag tag-gold">⭐ VIP</span> : u.vipApplied ? <span className="tag tag-blue">Applied</span> : "—"}
                    {u.vipStatus === "active" && u.vipExpiresAt && (
                      <span style={{ fontSize: 10, color: new Date(u.vipExpiresAt) < new Date() ? "var(--red)" : "var(--muted)", marginLeft: 4, fontFamily: "'Share Tech Mono',monospace" }}>
                        exp {new Date(u.vipExpiresAt).toLocaleDateString("en-GB")}
                      </span>
                    )}
                    {u.ukara && <span className="mono" style={{ fontSize: 10, color: "var(--accent)", marginLeft: 6 }}>{u.ukara}</span>}
                  </td>
                  <td>
                    <button onClick={() => setWaiverViewPlayer(waiverViewPlayer?.id === u.id ? null : u)}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:0 }}
                      title="Click to view waiver details">
                      {u.waiverSigned === true && u.waiverYear === new Date().getFullYear()
                        ? <span className="tag tag-green" style={{ cursor:"pointer" }}>✓</span>
                        : <span className="tag tag-red" style={{ cursor:"pointer" }}>✗</span>}
                      {u.waiverPending && <span style={{ fontSize:9, marginLeft:3, color:"var(--gold)" }}>⚠</span>}
                    </button>
                  </td>
                  <td>{u.credits > 0 ? <span className="text-gold">£{u.credits}</span> : "—"}</td>
                  <td>
                    {(!u.cardStatus || u.cardStatus === "none") && <span className="tag tag-green" style={{fontSize:10}}>✓ Clear</span>}
                    {u.cardStatus === "yellow" && <span className="tag" style={{background:"rgba(200,160,0,.15)",color:"var(--gold)",border:"1px solid rgba(200,160,0,.35)",fontSize:10}}>🟡 Warned</span>}
                    {u.cardStatus === "red"    && <span className="tag" style={{background:"rgba(220,30,30,.15)",color:"var(--red)",border:"1px solid rgba(220,30,30,.35)",fontSize:10}}>🔴 Banned</span>}
                    {u.cardStatus === "black"  && <span className="tag" style={{background:"rgba(60,60,60,.3)",color:"#bbb",border:"1px solid #555",fontSize:10}}>⚫ Susp.</span>}
                  </td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {u.adminNotes && <span title={u.adminNotes} style={{ fontSize:12, cursor:"help" }}>🔒</span>}
                      <button className="btn btn-sm btn-ghost" onClick={() => setViewPlayer(u)}>View</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEdit({ ...u })}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>

          {/* ── Inline Waiver Panel ── */}
          {waiverViewPlayer && (() => {
            const u = waiverViewPlayer;
            const allWaivers = [u.waiverData, ...(u.extraWaivers || [])].filter(Boolean);
            const wFields = (w) => [
              ["Name", w.name], ["DOB", w.dob],
              ["Address", [w.addr1, w.addr2, w.city, w.county, w.postcode].filter(Boolean).join(", ") || "—"],
              ["Emergency", w.emergencyName ? `${w.emergencyName} · ${w.emergencyPhone}` : "—"],
              ["Medical", w.medical || "None"],
              ["Minor", w.isChild ? `Yes — Guardian: ${w.guardian}` : "No"],
              ["Signed", gmtShort(w.date)],
            ];

            const downloadWaiver = () => {
              const rows = (w) => wFields(w).map(([k, v]) => `
                <tr>
                  <td style="padding:8px 12px;font-weight:600;color:#555;width:140px;border-bottom:1px solid #eee;white-space:nowrap">${k}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #eee">${v || "—"}</td>
                </tr>`).join("");

              const sections = allWaivers.map((w, i) => `
                ${allWaivers.length > 1 ? `<h3 style="margin:24px 0 8px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#888">Player ${i+1}${i===0?" (Primary)":""}</h3>` : ""}
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">${rows(w)}</table>
                ${w.sigData ? `<div style="margin:12px 0"><div style="font-size:11px;color:#888;margin-bottom:4px">SIGNATURE</div><img src="${w.sigData}" style="max-width:300px;border:1px solid #ddd;padding:8px" /></div>` : ""}
              `).join('<hr style="border:none;border-top:2px solid #eee;margin:20px 0"/>');

              const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Waiver — ${u.name}</title>
                <style>body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;color:#222}
                h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;font-weight:normal;color:#666;margin-bottom:24px}
                @media print{body{padding:16px}}</style></head>
                <body>
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #222;padding-bottom:16px;margin-bottom:24px">
                    <div>
                      <h1>SWINDON AIRSOFT — WAIVER</h1>
                      <h2>Player: ${u.name} · Downloaded: ${new Date().toLocaleDateString("en-GB")}</h2>
                    </div>
                  </div>
                  ${sections}
                  <div style="margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px">
                    Generated by Swindon Airsoft Admin · ${new Date().toLocaleString("en-GB")}
                  </div>
                </body></html>`;

              const blob = new Blob([html], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `waiver-${u.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0,10)}.html`;
              a.click();
              URL.revokeObjectURL(url);
            };

            return (
              <div style={{ marginTop:12, background:"#0c1009", border:"1px solid #2a3a10", borderRadius:4, padding:"16px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".12em", color:"var(--accent)", textTransform:"uppercase" }}>
                    📋 Waiver — {u.name}
                    {u.waiverPending && <span className="tag tag-gold" style={{ marginLeft:8, fontSize:10 }}>{u.waiverPending._removeExtra ? "🗑 Removal Request" : "⚠ Changes Pending"}</span>}
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <button onClick={downloadWaiver}
                      style={{ background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", padding:"4px 12px", cursor:"pointer", borderRadius:2 }}>
                      ⬇ DOWNLOAD
                    </button>
                    <button onClick={() => setWaiverViewPlayer(null)} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>
                  </div>
                </div>
                {allWaivers.length === 0 && <div style={{ color:"var(--muted)", fontSize:13 }}>No waiver on file.</div>}
                {allWaivers.map((w, i) => (
                  <div key={i} style={{ marginBottom: i < allWaivers.length - 1 ? 16 : 0, paddingBottom: i < allWaivers.length - 1 ? 16 : 0, borderBottom: i < allWaivers.length - 1 ? "1px solid #1a2808" : "none" }}>
                    {allWaivers.length > 1 && <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:10, letterSpacing:".15em", color:"var(--muted)", marginBottom:8, textTransform:"uppercase" }}>Player {i+1}{i===0?" (Primary)":""}</div>}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,280px),1fr))", gap:"4px 24px" }}>
                      {wFields(w).map(([k, v]) => (
                        <div key={k} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:"1px solid #111", fontSize:12 }}>
                          <span style={{ color:"var(--muted)", minWidth:90, flexShrink:0 }}>{k}:</span>
                          <span style={{ wordBreak:"break-word" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {u.waiverPending && (
                  <div style={{ marginTop:14, padding:"12px 14px", background:"#1a1200", border:"1px solid #4a3800", borderRadius:4 }}>
                    {u.waiverPending._removeExtra ? (
                      <>
                        <div style={{ fontSize:12, color:"var(--gold)", marginBottom:8 }}>Requesting removal of: <strong style={{ color:"#fff" }}>{u.waiverPending._playerName}</strong></div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button className="btn btn-sm btn-danger" onClick={async () => {
                            const idx = u.waiverPending._extraIndex;
                            const updated = (u.extraWaivers || []).filter((_, ei) => ei !== idx);
                            await updateUserAndRefresh(u.id, { extraWaivers: updated, waiverPending: null });
                            logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Extra waiver removal approved", detail: `Player: ${u.name}` });
                            showToast("Removal approved!"); setWaiverViewPlayer(null);
                          }}>Approve Removal</button>
                          <button className="btn btn-sm btn-ghost" onClick={async () => {
                            await updateUserAndRefresh(u.id, { waiverPending: null });
                            showToast("Removal rejected."); setWaiverViewPlayer(null);
                          }}>Reject</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize:12, color:"var(--gold)", marginBottom:8 }}>⚠ Player submitted waiver changes for approval</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button className="btn btn-sm btn-primary" onClick={async () => {
                            await updateUserAndRefresh(u.id, { waiverData: u.waiverPending, waiverPending: null, waiverSigned: true, waiverYear: new Date().getFullYear() });
                            logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver changes approved", detail: u.name });
                            showToast("Changes approved!"); setWaiverViewPlayer(null);
                          }}>Approve Changes</button>
                          <button className="btn btn-sm btn-ghost" onClick={async () => {
                            await updateUserAndRefresh(u.id, { waiverPending: null });
                            showToast("Changes rejected."); setWaiverViewPlayer(null);
                          }}>Reject</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Inline VIP Applications ── */}
          {vipApps.length > 0 && (
            <div style={{ marginTop:12, background:"rgba(200,160,0,.05)", border:"1px solid rgba(200,160,0,.2)", borderRadius:4, padding:"16px 18px" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".12em", color:"var(--gold)", textTransform:"uppercase", marginBottom:14 }}>
                ⭐ VIP Applications — {vipApps.length} pending
              </div>
              {vipApps.map(u => (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", padding:"10px 0", borderBottom:"1px solid rgba(200,160,0,.1)" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{u.name}</div>
                    <div style={{ fontSize:11, color:"var(--muted)" }}>{u.email} · {u.gamesAttended} games</div>
                    {u.vipIdImages?.length > 0 && (
                      <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                        {u.vipIdImages.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`ID ${i+1}`} style={{ width:40, height:30, objectFit:"cover", border:"1px solid var(--accent)", borderRadius:2, cursor:"pointer" }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="tag tag-green" style={{ fontSize:10 }}>✓ £40 paid</span>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => {
                      setVipUkara(`UKARA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100).padStart(3,"0")}`);
                      setVipApproveModal(u);
                    }}>✓ Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      await updateUserAndRefresh(u.id, { vipApplied: false });
                      showToast(`VIP application rejected for ${u.name}`, "red");
                      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "VIP application rejected", detail: u.name });
                    }}>✗ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Inline Deletion Requests ── */}
          {allUsers.filter(u => u.deleteRequest).length > 0 && (
            <div style={{ marginTop:12, background:"rgba(220,30,30,.05)", border:"1px solid rgba(220,30,30,.2)", borderRadius:4, padding:"16px 18px" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".12em", color:"var(--red)", textTransform:"uppercase", marginBottom:14 }}>
                🗑 Deletion Requests — {allUsers.filter(u => u.deleteRequest).length}
              </div>
              {allUsers.filter(u => u.deleteRequest).map(u => (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", padding:"10px 0", borderBottom:"1px solid rgba(220,30,30,.1)" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{u.name}</div>
                    <div style={{ fontSize:11, color:"var(--muted)" }}>{u.email}</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="btn btn-sm btn-danger" onClick={() => setDelAccountConfirm(u)}>Delete Account</button>
                    <button className="btn btn-sm btn-ghost" onClick={async () => {
                      await updateUserAndRefresh(u.id, { deleteRequest: false });
                      showToast(`Deletion request cleared for ${u.name}`);
                    }}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">✏️ Edit — {edit.name}</div>
            <div className="form-row">
              <div className="form-group"><label>Name</label><input value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="form-group"><label>Email</label><input value={edit.email} onChange={e => setEdit(p => ({ ...p, email: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label><input value={edit.phone || ""} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className="form-group"><label>Games Attended</label><input type="number" value={edit.gamesAttended} onChange={e => setEdit(p => ({ ...p, gamesAttended: +e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>VIP Status</label>
                <select value={edit.vipStatus} onChange={e => setEdit(p => ({ ...p, vipStatus: e.target.value }))}>
                  <option value="none">None</option><option value="active">Active VIP</option><option value="expired">Expired</option>
                </select>
                {edit.vipStatus === "none" && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Player will need to apply and pay again to rejoin VIP.</div>
                )}
                {edit.vipStatus === "active" && edit.vipExpiresAt && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Expires: <span style={{ color: new Date(edit.vipExpiresAt) < new Date() ? "var(--red)" : "var(--accent)" }}>
                      {new Date(edit.vipExpiresAt).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                )}
              </div>
              <div className="form-group"><label>UKARA ID</label><input value={edit.ukara || ""} onChange={e => setEdit(p => ({ ...p, ukara: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Credits (£)</label><input type="number" value={edit.credits || 0} onChange={e => setEdit(p => ({ ...p, credits: +e.target.value }))} /></div>
              <div className="form-group">
                <label>Role</label>
                <select value={edit.role || "player"} onChange={e => setEdit(p => ({ ...p, role: e.target.value }))}
                  style={{ background: "rgba(200,100,0,.08)", border: "1px solid rgba(200,100,0,.35)", color: "var(--text)", padding: "8px 10px", fontSize: 13, width: "100%" }}>
                  <option value="player">👤 Player</option>
                  <option value="admin">🔑 Admin</option>
                </select>
                <div style={{ fontSize: 10, color: "var(--red)", marginTop: 4 }}>⚠ Admins have full access to all data and controls.</div>
              </div>
            </div>

            {/* ── Disciplinary Card ── */}
            <div style={{ background:"rgba(220,100,0,.06)", border:"1px solid rgba(220,100,0,.25)", padding:"14px 16px", marginBottom:14, borderRadius:3 }}>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:".18em", color:"#e08030", textTransform:"uppercase", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                ⚠️ Disciplinary Card <span style={{ fontWeight:400, color:"var(--muted)", textTransform:"none", letterSpacing:"normal", fontSize:10 }}>— visible reason is shown to player</span>
              </div>
              <div className="form-row" style={{ marginBottom:0 }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Card Status</label>
                  <select value={edit.cardStatus || "none"} onChange={e => setEdit(p => ({ ...p, cardStatus: e.target.value }))}>
                    <option value="none">✅ None — No active card</option>
                    <option value="yellow">🟡 Yellow Card — Formal warning</option>
                    <option value="red">🔴 Red Card — 1 game day ban (blocks booking)</option>
                    <option value="black">⚫ Black Card — Suspended until owner review (blocks booking)</option>
                  </select>
                  {(edit.cardStatus === "red" || edit.cardStatus === "black") && (
                    <div style={{ fontSize:11, color:"var(--red)", marginTop:4 }}>⚠ Player will be blocked from booking events.</div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Reason <span style={{ fontWeight:400, color:"var(--muted)", fontSize:10 }}>(shown to player)</span></label>
                  <input value={edit.cardReason || ""} onChange={e => setEdit(p => ({ ...p, cardReason: e.target.value }))} placeholder="e.g. Unsafe play, hit not called, aggressive behaviour…" />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "var(--muted)", textTransform: "uppercase", fontFamily: "'Barlow Condensed', sans-serif" }}>Delivery Address</div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 2, padding: "12px 14px", marginBottom: 14 }}>
              {(() => {
                const parts = (edit.address || "").split("\n");
                const setAddrPart = (idx, val) => {
                  const addrLines = (edit.address || "").split("\n");
                  while (addrLines.length <= idx) p.push("");
                  p[idx] = val;
                  setEdit(prev => ({ ...prev, address: addrLines.join("\n") }));
                };
                return (
                  <>
                    <div className="form-group" style={{ marginBottom: 8 }}><label>Line 1</label><input value={parts[0] || ""} onChange={e => setAddrPart(0, e.target.value)} placeholder="House number and street" /></div>
                    <div className="form-group" style={{ marginBottom: 8 }}><label>Line 2</label><input value={parts[1] || ""} onChange={e => setAddrPart(1, e.target.value)} placeholder="Flat, apartment, etc." /></div>
                    <div className="form-row" style={{ marginBottom: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Town / City</label><input value={parts[2] || ""} onChange={e => setAddrPart(2, e.target.value)} placeholder="Swindon" /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>County</label><input value={parts[3] || ""} onChange={e => setAddrPart(3, e.target.value)} placeholder="Wiltshire" /></div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>Postcode</label><input value={parts[4] || ""} onChange={e => setAddrPart(4, e.target.value.toUpperCase())} placeholder="SN1 1AA" style={{ maxWidth: 160 }} /></div>
                  </>
                );
              })()}
            </div>
            {/* Admin Notes — internal only, never visible to player */}
            <div style={{ background: "rgba(200,150,0,.06)", border: "1px solid rgba(200,150,0,.25)", padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                🔒 Admin Notes <span style={{ fontWeight: 400, color: "var(--muted)", textTransform: "none", letterSpacing: "normal", fontSize: 10 }}>— internal only, never shown to player</span>
              </div>
              <textarea
                value={edit.adminNotes || ""}
                onChange={e => setEdit(p => ({ ...p, adminNotes: e.target.value }))}
                placeholder="Add private notes about this player (bans, incidents, equipment issues, flags, etc.)"
                rows={3}
                style={{ width: "100%", resize: "vertical", fontFamily: "'Share Tech Mono',monospace", fontSize: 12, background: "rgba(0,0,0,.3)", border: "1px solid rgba(200,150,0,.2)", color: "var(--text)", padding: "8px 10px", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <input type="checkbox" checked={edit.deleteRequest || false} onChange={e => setEdit(p => ({ ...p, deleteRequest: e.target.checked }))} />
              <label style={{ fontSize: 13, color: "var(--red)" }}>Account deletion requested</label>
            </div>
            {/* Rank & Designation — shown on public profile */}
            <div style={{ background: "rgba(200,255,0,.03)", border: "1px solid rgba(200,255,0,.15)", padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: ".12em", fontFamily: "'Barlow Condensed',sans-serif", textTransform: "uppercase", marginBottom: 10 }}>🎖 Public Profile Rank &amp; Designation</div>

              {/* Standard Rank */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>RANK — leave as Auto to use games-played calculation</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {(edit.customRank || "CIVILIAN") && (
                    <div style={{ flexShrink: 0, border: "1px solid #2a3a10", borderRadius: 4, overflow: "hidden" }}>
                      <RankInsignia rank={edit.customRank || "CIVILIAN"} size={44}/>
                    </div>
                  )}
                  <select
                    value={edit.customRank || ""}
                    onChange={e => setEdit(p => ({ ...p, customRank: e.target.value || null }))}
                    style={{ flex: 1, background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text)", padding: "8px 10px", fontSize: 13, borderRadius: 3 }}
                  >
                    <option value="">— Auto (based on games played) —</option>
                    <option value="CIVILIAN">CIVILIAN</option>
                    <option value="PRIVATE">PRIVATE</option>
                    <option value="RECRUIT">RECRUIT</option>
                    <option value="OPERATIVE">OPERATIVE</option>
                    <option value="SENIOR OPERATIVE">SENIOR OPERATIVE</option>
                    <option value="FIELD COMMANDER">FIELD COMMANDER</option>
                  </select>
                </div>
              </div>

              {/* Special Designation */}
              <div>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6 }}>DESIGNATION — optional special role badge displayed alongside rank</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {edit.designation && (
                    <div style={{ flexShrink: 0, border: "1px solid rgba(79,195,247,.3)", borderRadius: 4, overflow: "hidden" }}>
                      <DesignationInsignia desig={edit.designation} size={44}/>
                    </div>
                  )}
                  {!edit.designation && (
                    <div style={{ flexShrink: 0, width: 44, height: 44, border: "1px solid #1a2808", borderRadius: 4, background: "#080a06", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18, opacity: .3 }}>—</span>
                    </div>
                  )}
                  <select
                    value={edit.designation || ""}
                    onChange={e => setEdit(p => ({ ...p, designation: e.target.value || null }))}
                    style={{ flex: 1, background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text)", padding: "8px 10px", fontSize: 13, borderRadius: 3 }}
                  >
                    <option value="">— None —</option>
                    <option value="GHOST">👻 GHOST</option>
                    <option value="SNIPER">🎯 SNIPER</option>
                    <option value="MEDIC">🩹 MEDIC</option>
                    <option value="DEMOLITIONS">💥 DEMOLITIONS</option>
                    <option value="RECON">🔭 RECON</option>
                    <option value="HEAVY GUNNER">🔫 HEAVY GUNNER</option>
                    <option value="SUPPORT">🛡 SUPPORT</option>
                    <option value="SQUAD LEADER">⚔️ SQUAD LEADER</option>
                    <option value="VETERAN">🎖 VETERAN</option>
                    <option value="LEGEND">🏆 LEGEND</option>
                  </select>
                </div>
              </div>

              {(edit.customRank || edit.designation) && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--accent)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {edit.customRank && <span>✓ Rank override: <strong>{edit.customRank}</strong></span>}
                  {edit.designation && <span>✓ Designation: <strong>{edit.designation}</strong></span>}
                </div>
              )}
            </div>
            {/* Marshal permission — admin only, never visible to player */}
            <div style={{ background: "rgba(0,180,100,.06)", border: "1px solid rgba(0,180,100,.25)", padding: "12px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                id="canMarshalChk"
                checked={edit.canMarshal || false}
                onChange={e => setEdit(p => ({ ...p, canMarshal: e.target.checked }))}
                style={{ marginTop: 2, accentColor: "#00c864", flexShrink: 0 }}
              />
              <label htmlFor="canMarshalChk" style={{ cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#00c864" }}>📷 QR Check-In Marshal</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Grants this player access to a QR scanner page so they can check players in on game day. They will <strong style={{ color: "var(--text)" }}>not</strong> have access to any other admin features.
                </div>
              </label>
            </div>
            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setEdit(null)} disabled={savingEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {delAccountConfirm && (
        <div className="overlay" onClick={() => !deletingAccount && setDelAccountConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: "var(--red)" }}>🗑 Permanently Delete Account?</div>

            {/* Player summary */}
            <div style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 3, padding: "12px 14px", margin: "16px 0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,160px),1fr))", gap: "8px 16px" }}>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>NAME</div><div style={{ fontWeight: 700 }}>{delAccountConfirm.name}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>EMAIL</div><div style={{ fontSize: 13 }}>{delAccountConfirm.email || "—"}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>GAMES ATTENDED</div><div style={{ fontSize: 13 }}>{delAccountConfirm.gamesAttended || 0}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>CREDITS</div><div style={{ fontSize: 13, color: delAccountConfirm.credits > 0 ? "var(--gold)" : "inherit" }}>{delAccountConfirm.credits > 0 ? `£${Number(delAccountConfirm.credits).toFixed(2)}` : "None"}</div></div>
              {delAccountConfirm.vipStatus === "active" && (
                <div style={{ gridColumn: "1 / -1" }}><span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700 }}>★ This player has an active VIP membership</span></div>
              )}
              {delAccountConfirm.credits > 0 && (
                <div style={{ gridColumn: "1 / -1" }}><span style={{ fontSize: 11, color: "var(--gold)" }}>⚠ Player has unused credits — these will be lost on deletion.</span></div>
              )}
            </div>

            <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 20, lineHeight: 1.7 }}>
              ⚠️ This will permanently delete their <strong>profile, waiver, auth login</strong> and all associated personal data. Their booking history will be anonymised. <strong>This cannot be undone.</strong>
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingAccount} onClick={confirmDeleteAccount}>
                {deletingAccount ? "⏳ Deleting…" : "🗑 Yes, Delete Account Permanently"}
              </button>
              <button className="btn btn-ghost" disabled={deletingAccount} onClick={() => setDelAccountConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {vipApproveModal && (
        <div className="overlay" onClick={() => !vipApproveBusy && setVipApproveModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">⭐ Approve VIP — {vipApproveModal.name}</div>

            {/* Photo ID review */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:".1em", color:"var(--muted)", textTransform:"uppercase", marginBottom:10 }}>🪪 Government Photo ID</div>
              {vipApproveModal.vipIdImages?.length > 0 ? (
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {vipApproveModal.vipIdImages.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" title="Open full size in new tab"
                      style={{ display:"block", border:"1px solid var(--accent)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                      <img src={url} alt={`ID photo ${i+1}`} style={{ width:160, height:110, objectFit:"cover", display:"block" }} />
                      <div style={{ background:"#0a0f05", padding:"3px 8px", fontSize:9, color:"var(--accent)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em", textAlign:"center" }}>
                        ID PHOTO {i+1} — CLICK TO ENLARGE
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="alert alert-red" style={{ fontSize:12 }}>
                  ⚠️ No ID photos uploaded by this player. Consider requesting ID before approving.
                </div>
              )}
            </div>

            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
              Set the UKARA ID for this player. A unique ID has been pre-generated — edit it if needed.
            </p>
            <div className="form-group">
              <label>UKARA ID</label>
              <input
                value={vipUkara}
                onChange={e => setVipUkara(e.target.value)}
                placeholder="e.g. UKARA-2025-042"
                style={{ fontFamily: "'Share Tech Mono',monospace" }}
                disabled={vipApproveBusy}
              />
            </div>
            <div className="gap-2" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" disabled={vipApproveBusy || !vipUkara.trim()} onClick={async () => {
                setVipApproveBusy(true);
                try {
                  // Step 1: read the current games_attended from DB before touching anything
                  const { data: freshProfile, error: readErr } = await supabase
                    .from('profiles').select('games_attended').eq('id', vipApproveModal.id).single();
                  if (readErr) throw new Error(readErr.message);
                  const preservedCount = freshProfile?.games_attended ?? vipApproveModal.gamesAttended ?? 0;

                  // Step 2: write the VIP fields
                  const vipExpiry = new Date();
                  vipExpiry.setFullYear(vipExpiry.getFullYear() + 1);
                  const { error: vipErr } = await supabase.from('profiles').update({
                    vip_status:     "active",
                    vip_applied:    true,
                    ukara:          vipUkara.trim(),
                    vip_expires_at: vipExpiry.toISOString(),
                  }).eq('id', vipApproveModal.id);
                  if (vipErr) throw new Error(vipErr.message);

                  // Step 3: immediately restore games_attended in case any trigger reset it
                  await supabase.from('profiles')
                    .update({ games_attended: preservedCount })
                    .eq('id', vipApproveModal.id);

                  await loadUsers();
                  showToast(`✅ VIP approved for ${vipApproveModal.name}! UKARA: ${vipUkara.trim()}`);
                  logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "VIP approved", detail: `Player: ${vipApproveModal.name} (${vipApproveModal.email || ""}) | UKARA: ${vipUkara.trim()} | Previous status: ${vipApproveModal.vipStatus || "none"}` });
                  setVipApproveModal(null);
                } catch (e) {
                  showToast("Approval failed: " + e.message, "red");
                } finally {
                  setVipApproveBusy(false);
                }
              }}>
                {vipApproveBusy ? "Approving…" : "✓ Confirm Approval"}
              </button>
              <button className="btn btn-ghost" disabled={vipApproveBusy} onClick={() => setVipApproveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── VIEW PLAYER MODAL ─────────── */}
      {viewPlayer && (() => {
        const u = viewPlayer;
        const cardColors = { yellow:"var(--gold)", red:"var(--red)", black:"#bbb" };
        const cardLabels = { yellow:"🟡 Yellow Card — Formal Warning", red:"🔴 Red Card — Temporary Ban (1 game day)", black:"⚫ Black Card — Suspended" };

        const playerBookings = (data.events || []).flatMap(ev =>
          (ev.bookings || []).filter(b => b.userId === u.id).map(b => ({
            eventTitle: ev.title, date: ev.date, type: b.type, qty: b.qty, total: b.total, checkedIn: b.checkedIn
          }))
        ).sort((a,b) => new Date(b.date) - new Date(a.date));

        const downloadFOI = () => {
          const payload = {
            exportDate:  new Date().toISOString(),
            exportType:  "Freedom of Information / GDPR Data Portability Request",
            notice:      "This file contains all personal data held about this player on the Swindon Airsoft platform.",
            profile: {
              id: u.id, name: u.name, email: u.email, phone: u.phone || "",
              address: u.address || "", joinDate: u.joinDate || "",
              gamesAttended: u.gamesAttended, vipStatus: u.vipStatus,
              ukara: u.ukara || "", credits: u.credits,
              waiverSigned: u.waiverSigned, cardStatus: u.cardStatus || "none",
              cardReason: u.cardReason || "",
            },
            bookings: playerBookings,
          };
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" }));
          a.download = `swindon-airsoft-data-${(u.name||"player").replace(/\s+/g,"-").toLowerCase()}-${Date.now()}.json`;
          a.click();
        };

        return (
          <div className="overlay" onClick={() => setViewPlayer(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth:700, maxHeight:"90vh", overflowY:"auto" }}>
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, gap:12, flexWrap:"wrap" }}>
                <div>
                  <div className="modal-title" style={{ margin:0 }}>👤 {u.name}</div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginTop:3 }}>{u.email}</div>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setContactPlayer(u); setContactSubject(""); setContactMsg(""); setViewPlayer(null); }}>📧 Email Player</button>
                  <button className="btn btn-sm btn-ghost" onClick={downloadFOI} title="Download all data for GDPR/FOI request">⬇ Data Export</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEdit({ ...u }); setViewPlayer(null); }}>✏️ Edit</button>
                </div>
              </div>

              {/* Card status banner */}
              {u.cardStatus && u.cardStatus !== "none" && (
                <div style={{
                  background: `rgba(${u.cardStatus==="yellow"?"200,160,0":u.cardStatus==="red"?"220,30,30":"80,80,80"},.1)`,
                  border: `1px solid rgba(${u.cardStatus==="yellow"?"200,160,0":u.cardStatus==="red"?"220,30,30":"80,80,80"},.35)`,
                  padding:"12px 14px", borderRadius:3, marginBottom:16
                }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:cardColors[u.cardStatus], marginBottom:4 }}>{cardLabels[u.cardStatus]}</div>
                  {u.cardReason && <div style={{ fontSize:12, color:"var(--muted)" }}>Reason: {u.cardReason}</div>}
                  {u.cardIssuedAt && <div style={{ fontSize:11, color:"var(--muted)", marginTop:3, fontFamily:"'Share Tech Mono',monospace" }}>Issued: {new Date(u.cardIssuedAt).toLocaleDateString("en-GB")}</div>}
                </div>
              )}

              {/* Info grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:16 }}>
                {[
                  ["Phone",          u.phone || "—"],
                  ["Games Attended", u.gamesAttended],
                  ["VIP Status",     u.vipStatus === "active" ? "⭐ Active" : u.vipApplied ? "⏳ Pending" : u.vipStatus === "expired" ? "✗ Expired" : "None"],
                  ["UKARA ID",       u.ukara || "—"],
                  ["Credits",        u.credits > 0 ? `£${Number(u.credits).toFixed(2)}` : "£0"],
                  ["Joined",         u.joinDate || "—"],
                  ["Waiver",         u.waiverSigned && u.waiverYear === new Date().getFullYear() ? "✓ Signed" : "✗ Not signed"],
                  ["Account Status", u.cardStatus && u.cardStatus !== "none" ? cardLabels[u.cardStatus] : "✅ Clear"],
                ].map(([label, val]) => (
                  <div key={label} style={{ background:"var(--bg4)", padding:"10px 12px", borderRadius:3 }}>
                    <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{String(val)}</div>
                  </div>
                ))}
              </div>

              {/* Address */}
              {u.address && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>Delivery Address</div>
                  <div style={{ fontSize:12, whiteSpace:"pre-line", background:"var(--bg4)", padding:"10px 12px", borderRadius:3, fontFamily:"'Share Tech Mono',monospace" }}>{u.address}</div>
                </div>
              )}

              {/* VIP ID photos */}
              {u.vipIdImages?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>🪪 Government Photo ID</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    {u.vipIdImages.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        style={{ display:"block", border:"1px solid var(--accent)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                        <img src={url} alt={`ID ${i+1}`} style={{ width:150, height:100, objectFit:"cover", display:"block" }} />
                        <div style={{ fontSize:9, color:"var(--accent)", textAlign:"center", padding:"2px 0", background:"#0a0f05", fontFamily:"'Share Tech Mono',monospace" }}>
                          ID {i+1} — CLICK TO ENLARGE
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Booking history */}
              <div style={{ fontSize:10, color:"var(--muted)", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>Booking History ({playerBookings.length})</div>
              {playerBookings.length === 0
                ? <div style={{ color:"var(--muted)", fontSize:13, marginBottom:12 }}>No bookings on record.</div>
                : (
                  <div className="table-wrap" style={{ marginBottom:16 }}>
                    <table className="data-table">
                      <thead><tr><th>Event</th><th>Date</th><th>Type</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
                      <tbody>
                        {playerBookings.map((b, i) => (
                          <tr key={i}>
                            <td style={{ fontSize:12 }}>{b.eventTitle}</td>
                            <td className="mono" style={{ fontSize:11 }}>{fmtDate(b.date)}</td>
                            <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                            <td>{b.qty}</td>
                            <td className="text-green">£{b.total.toFixed(2)}</td>
                            <td>{b.checkedIn ? <span className="tag tag-green">✓ In</span> : <span className="tag tag-blue">Booked</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
              <div style={{ borderTop:"1px solid var(--border)", paddingTop:12, display:"flex", justifyContent:"flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setViewPlayer(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─────────── CONTACT PLAYER MODAL ─────────── */}
      {contactPlayer && (
        <div className="overlay" onClick={() => !contactSending && setContactPlayer(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📧 Email — {contactPlayer.name}</div>
            <p style={{ fontSize:12, color:"var(--muted)", marginBottom:16 }}>
              Sending to <strong style={{ color:"var(--text)" }}>{contactPlayer.email}</strong>
            </p>
            <div className="form-group">
              <label>Subject</label>
              <input value={contactSubject} onChange={e => setContactSubject(e.target.value)} placeholder="Message subject…" disabled={contactSending} />
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea rows={7} value={contactMsg} onChange={e => setContactMsg(e.target.value)}
                placeholder="Write your message here…" disabled={contactSending}
                style={{ width:"100%", resize:"vertical", fontFamily:"inherit", fontSize:13, background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", padding:"8px 10px", boxSizing:"border-box", borderRadius:3 }} />
            </div>
            <div className="gap-2 mt-1">
              <button className="btn btn-primary" disabled={contactSending || !contactSubject.trim() || !contactMsg.trim()} onClick={async () => {
                setContactSending(true);
                try {
                  const htmlContent = `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#e0e0e0;padding:32px 24px;max-width:600px;margin:0 auto">
                    <div style="font-size:24px;font-weight:900;color:#c8ff00;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">SWINDON AIRSOFT</div>
                    <div style="height:2px;background:#1a2808;margin-bottom:24px"></div>
                    <div style="font-size:14px;margin-bottom:16px">Hi ${contactPlayer.name},</div>
                    <div style="font-size:14px;line-height:1.8;white-space:pre-wrap">${contactMsg.trim()}</div>
                    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1a2808;font-size:11px;color:#555">
                      Swindon Airsoft — This message was sent by our admin team. Please do not reply to this address.
                    </div>
                  </div>`;
                  await sendEmail({ toEmail: contactPlayer.email, toName: contactPlayer.name, subject: contactSubject.trim(), htmlContent });
                  showToast(`✅ Email sent to ${contactPlayer.name}`);
                  setContactPlayer(null);
                } catch(e) {
                  showToast("Failed to send email: " + (e.message || String(e)), "red");
                } finally { setContactSending(false); }
              }}>
                {contactSending ? "⏳ Sending…" : "📧 Send Email"}
              </button>
              <button className="btn btn-ghost" disabled={contactSending} onClick={() => setContactPlayer(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Admin Waivers ─────────────────────────────────────────
function AdminWaivers({ data, updateUser, showToast, embedded, filterUnsigned, cu }) {
  const [view, setView] = useState(null);
  const [localUsers, setLocalUsers] = useState(null);

  useEffect(() => {
    api.profiles.getAll()
      .then(list => setLocalUsers(list.map(normaliseProfile)))
      .catch(() => {});
  }, []);

  const allUsers = localUsers ?? data.users;
  const withWaiver = allUsers.filter(u => u.role !== 'admin' && (u.waiverData || u.waiverPending));
  const displayUsers = filterUnsigned
    ? allUsers.filter(u => u.role === 'player' && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear()))
    : withWaiver;

  const approve = (u) => {
    // Check if this is a removal request
    if (u.waiverPending?._removeExtra) {
      const idx = u.waiverPending._extraIndex;
      const updated = (u.extraWaivers || []).filter((_, ei) => ei !== idx);
      updateUser(u.id, { extraWaivers: updated, waiverPending: null });
      showToast("Waiver removal approved!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Extra waiver removal approved", detail: `Player: ${u.name} — removed: ${u.waiverPending._playerName}` });
    } else {
      updateUser(u.id, { waiverData: u.waiverPending, waiverPending: null, waiverSigned: true, waiverYear: new Date().getFullYear() });
      showToast("Waiver changes approved!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver changes approved", detail: u.name });
    }
    setView(null);
  };
  const reject = (u) => {
    updateUser(u.id, { waiverPending: null }); showToast("Changes rejected"); setView(null);
    logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver changes rejected", detail: u.name });
  };

  const vw = view ? allUsers.find(u => u.id === view) : null;

  const waiverFields = (w) => [
    ["Name", w.name],
    ["DOB", w.dob],
    ["Address", [w.addr1, w.addr2, w.city, w.county, w.postcode, w.country].filter(Boolean).join(", ") || "—"],
    ["Emergency", w.emergencyName ? `${w.emergencyName} · ${w.emergencyPhone}` : "—"],
    ["Medical", w.medical || "None"],
    ["Minor", w.isChild ? `Yes — Guardian: ${w.guardian}` : "No"],
    ["Signed", gmtShort(w.date)],
  ];

  return (
    <div>
      {!embedded && <div className="page-header"><div><div className="page-title">{filterUnsigned ? "Unsigned Waivers" : "Waivers"}</div><div className="page-sub">{filterUnsigned ? `${displayUsers.length} player(s) without a signed waiver` : `Valid for ${new Date().getFullYear()} calendar year`}</div></div></div>}
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Player</th><th>Signed</th><th>Year</th><th>Players</th><th>Pending</th><th></th></tr></thead>
          <tbody>
            {displayUsers.map(u => {
              const totalWaivers = 1 + (u.extraWaivers?.length || 0);
              return (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.waiverSigned ? <span className="tag tag-green">✓</span> : <span className="tag tag-red">✗</span>}</td>
                  <td>{u.waiverYear || "—"}</td>
                  <td>{totalWaivers > 1 ? <span className="tag tag-blue">{totalWaivers} players</span> : <span style={{ color:"var(--muted)", fontSize:12 }}>1</span>}</td>
                  <td>{u.waiverPending ? (u.waiverPending._removeExtra ? <span className="tag tag-red">🗑 Removal</span> : <span className="tag tag-gold">⚠ Pending</span>) : "—"}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => setView(u.id)}>View</button></td>
                </tr>
              );
            })}
            {displayUsers.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>{filterUnsigned ? "All players have signed waivers ✓" : "No waivers on file"}</td></tr>}
          </tbody>
        </table></div>
      </div>

      {vw && (() => {
        const allWaivers = [vw.waiverData, ...(vw.extraWaivers || [])].filter(Boolean);
        return (
          <div className="overlay" onClick={() => setView(null)}>
            <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
              <div className="modal-title">📋 Waivers — {vw.name}</div>

              {/* Player tabs */}
              {allWaivers.length > 1 && (
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:16 }}>
                  {allWaivers.map((w, i) => (
                    <span key={i} style={{ padding:"4px 12px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:11, letterSpacing:".1em", textTransform:"uppercase", background:"var(--accent)", color:"#000", borderRadius:2 }}>
                      {w.name || `Player ${i+1}`}{i === 0 ? " ★" : ""}
                    </span>
                  ))}
                </div>
              )}

              {/* All waivers */}
              {allWaivers.map((w, i) => (
                <div key={i} style={{ marginBottom:20, paddingBottom:20, borderBottom: i < allWaivers.length - 1 ? "1px solid #2a2a2a" : "none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"var(--accent)", textTransform:"uppercase" }}>
                      {allWaivers.length > 1 ? `PLAYER ${i+1}${i === 0 ? " (PRIMARY)" : " (ADDITIONAL)"}` : "WAIVER DETAILS"}
                    </div>
                    {i > 0 && (
                      <button onClick={() => {
                        const updated = (vw.extraWaivers || []).filter((_, ei) => ei !== i - 1);
                        updateUser(vw.id, { extraWaivers: updated });
                        showToast("Waiver removed");
                        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Waiver removed", detail: `Player: ${vw.name}` });
                        setView(null);
                      }} style={{ background:"none", border:"1px solid var(--red)", color:"var(--red)", fontSize:11, padding:"2px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em" }}>
                        🗑 REMOVE
                      </button>
                    )}
                  </div>
                  {waiverFields(w).map(([k, v]) => (
                    <div key={k} style={{ display:"flex", gap:12, padding:"7px 0", borderBottom:"1px solid var(--border)", fontSize:13 }}>
                      <span className="text-muted" style={{ minWidth:140 }}>{k}:</span>
                      <span>{v}</span>
                    </div>
                  ))}
                  {w.sigData && (
                    <div style={{ marginTop:10 }}>
                      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:4, letterSpacing:".08em" }}>SIGNATURE</div>
                      <div style={{ background:"#0d0d0d", border:"1px solid #333", padding:8, display:"inline-block", borderRadius:4 }}>
                        <img src={w.sigData} alt="Signature" style={{ maxWidth:300, height:"auto", display:"block" }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Pending changes */}
              {vw.waiverPending && (
                <div style={{ marginTop:16, padding:16, background:"#1a1200", border:"1px solid #4a3800", borderRadius:4 }}>
                  {vw.waiverPending._removeExtra ? (
                    <>
                      <div className="alert alert-red mb-2">🗑 Player has requested removal of an additional waiver</div>
                      <div style={{ fontSize:13, color:"var(--muted)", marginBottom:12 }}>
                        Request to remove waiver for: <strong style={{ color:"var(--text)" }}>{vw.waiverPending._playerName}</strong><br/>
                        <span style={{ fontSize:11 }}>Requested: {gmtShort(vw.waiverPending._requestedAt)}</span>
                      </div>
                      <div className="gap-2 mt-2">
                        <button className="btn btn-danger" onClick={() => approve(vw)}>Approve Removal</button>
                        <button className="btn btn-ghost" onClick={() => reject(vw)}>Reject</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="alert alert-gold mb-2">⚠️ Player has submitted waiver changes for approval</div>
                      <div style={{ fontSize:11, letterSpacing:".1em", fontWeight:700, color:"var(--muted)", marginBottom:10 }}>PROPOSED CHANGES</div>
                      {waiverFields(vw.waiverPending).map(([k, v]) => {
                        const oldVal = vw.waiverData ? waiverFields(vw.waiverData).find(([ok]) => ok === k)?.[1] : null;
                        const changed = oldVal !== null && v !== oldVal;
                        return (
                          <div key={k} style={{ display:"flex", gap:12, padding: changed ? "7px 8px" : "7px 0", borderBottom:"1px solid var(--border)", fontSize:13, background: changed ? "#2d1e0a" : "transparent", borderRadius: changed ? 4 : 0 }}>
                            <span className="text-muted" style={{ minWidth:140 }}>{k}:</span>
                            <span style={{ color: changed ? "var(--gold)" : "var(--text)" }}>{v}</span>
                            {changed && <span className="tag tag-gold" style={{ fontSize:10, marginLeft:"auto" }}>CHANGED</span>}
                          </div>
                        );
                      })}
                      <div className="gap-2 mt-2">
                        <button className="btn btn-primary" onClick={() => approve(vw)}>Approve Changes</button>
                        <button className="btn btn-danger" onClick={() => reject(vw)}>Reject</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button className="btn btn-ghost mt-2" style={{ width:"100%" }} onClick={() => setView(null)}>Close</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Admin Orders (inline, used as tab inside AdminShop) ──────────
function AdminOrdersInline({ showToast, cu }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [trackingModal, setTrackingModal] = useState(null);
  const STATUS_COLORS = { pending: "blue", processing: "gold", dispatched: "green", completed: "teal", cancelled: "red", return_requested: "gold", return_approved: "blue", return_received: "teal" };
  const isMounted = useRef(true);

  const fetchOrders = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true); setError(null);
    try {
      const result = await api.shopOrders.getAll();
      if (isMounted.current) setOrders(result);
    } catch (e) {
      if (isMounted.current) setError(e.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchOrders();
    // Re-fetch automatically when user returns to this tab after backgrounding
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) fetchOrders(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [fetchOrders]);

  const doDispatch = async (id, tracking, isUpdate = false) => {
    try {
      await api.shopOrders.updateStatus(id, isUpdate ? (orders.find(o=>o.id===id)?.status || "dispatched") : "dispatched", tracking || null);
      setOrders(o => o.map(x => x.id === id ? { ...x, status: isUpdate ? x.status : "dispatched", tracking_number: tracking || null } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status: isUpdate ? d.status : "dispatched", tracking_number: tracking || null }));
      const order = orders.find(o => o.id === id);
      showToast(isUpdate ? "Tracking number updated!" : "Order marked as dispatched!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: isUpdate ? "Order tracking updated" : "Order dispatched", detail: `Order #${id} | Customer: ${order?.customer_name || "?"} | Total: £${Number(order?.total || 0).toFixed(2)} | Tracking: ${tracking || "none"}` });
      const toEmail = order?.customer_email || order?.customerEmail;
      if (toEmail && !isUpdate) {
        sendDispatchEmail({
          toEmail,
          toName:  order.customer_name || order.customerName || "Customer",
          order:   { ...order, customerAddress: order.customer_address || order.customerAddress || "" },
          items:   Array.isArray(order.items) ? order.items : [],
          tracking: tracking || null,
        }).then(() => showToast("📧 Dispatch email sent!")).catch(e => showToast("⚠️ Email failed: " + (e?.message || e?.text || JSON.stringify(e)), "red"));
      }
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    setTrackingModal(null);
  };

  const setStatus = async (id, status) => {
    if (status === "dispatched") { setTrackingModal({ id, tracking: "" }); return; }
    try {
      const oldOrder = orders.find(o => o.id === id);
      await api.shopOrders.updateStatus(id, status);
      setOrders(o => o.map(x => x.id === id ? { ...x, status } : x));
      if (detail?.id === id) setDetail(d => ({ ...d, status }));
      showToast("Status updated!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Order status updated", detail: `Order #${id} | Customer: ${oldOrder?.customer_name || "?"} | ${oldOrder?.status || "?"} → ${status}` });
    } catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const [refundModal, setRefundModal] = useState(null); // { order }
  const [refundAmt, setRefundAmt] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refunding, setRefunding] = useState(false);

  // Returns
  const [returnModal, setReturnModal] = useState(null); // { order }
  const [returnAction, setReturnAction] = useState(""); // "approve" | "reject" | "received"
  const [rejectionReason, setRejectionReason] = useState("");
  const [returnsProcessing, setReturnsProcessing] = useState(false);

  const handleReturnAction = async () => {
    if (!returnModal) return;
    const { order } = returnModal;
    setReturnsProcessing(true);
    try {
      let newStatus = order.status;
      if (returnAction === "approve")   newStatus = "return_approved";
      if (returnAction === "reject")    newStatus = order.status === "return_requested" ? "dispatched" : order.status;
      if (returnAction === "received")  newStatus = "return_received";

      // Save rejection reason to DB if rejecting
      if (returnAction === "reject" && rejectionReason.trim()) {
        await supabase.from("shop_orders").update({ status: newStatus, return_rejection_reason: rejectionReason.trim() }).eq("id", order.id);
      } else {
        await api.shopOrders.updateStatus(order.id, newStatus);
      }

      const updatedOrder = { ...order, status: newStatus, return_rejection_reason: returnAction === "reject" ? rejectionReason.trim() || null : order.return_rejection_reason };
      setOrders(o => o.map(x => x.id === order.id ? updatedOrder : x));
      if (detail?.id === order.id) setDetail(d => ({ ...d, ...updatedOrder }));

      // Send customer email for approve/reject
      const toEmail = order.customer_email || order.customerEmail;
      const toName  = order.customer_name  || order.customerName || "Customer";
      if (toEmail && (returnAction === "approve" || returnAction === "reject")) {
        sendReturnDecisionEmail({
          toEmail, toName, order,
          approved: returnAction === "approve",
          rejectionReason: returnAction === "reject" ? rejectionReason.trim() || null : null,
        }).then(() => showToast("📧 Customer notified by email.")).catch(() => {});
      }

      showToast(returnAction === "approve" ? "✅ Return approved — customer notified." : returnAction === "received" ? "📦 Return marked as received." : "Return request rejected.");
      const _retLabel = returnAction === "approve" ? "Return approved" : returnAction === "received" ? "Return marked received" : "Return rejected";
      const _retParts = [`Order #${order.id}`, `Customer: ${order.customer_name || "?"}`, `Items: ${Array.isArray(order.items) ? order.items.map(i => `${i.name} x${i.qty}`).join(", ") : "?"}`, `Total: £${Number(order.total || 0).toFixed(2)}`];
      if (returnAction === "reject" && rejectionReason.trim()) _retParts.push(`Reason: ${rejectionReason.trim()}`);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: _retLabel, detail: _retParts.join(" | ") });
      setRejectionReason("");
      setReturnModal(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setReturnsProcessing(false); }
  };

  const openRefund = (order) => {
    setRefundModal({ order });
    setRefundAmt(Number(order.total || 0).toFixed(2));
    setRefundNote("");
  };

  const doRefund = async () => {
    if (!refundModal) return;
    const { order } = refundModal;
    const amt = parseFloat(refundAmt);
    if (isNaN(amt) || amt <= 0) { showToast("Enter a valid refund amount", "red"); return; }
    if (amt > Number(order.total)) { showToast("Refund amount exceeds order total", "red"); return; }
    setRefunding(true);
    try {
      if (!order.paypal_order_id && !order.square_order_id) throw new Error("No payment ID on this order — cannot issue automatic refund. Refund manually in your Square Dashboard.");
      const locationId = await api.settings.get("square_location_id");
      const isFullRefund = Math.abs(amt - Number(order.total)) < 0.01;
      await squareRefund({ squarePaymentId: order.square_order_id || order.paypal_order_id, amount: isFullRefund ? null : amt, locationId });
      await api.shopOrders.saveRefund(order.id, amt, refundNote || null);
      setOrders(o => o.map(x => x.id === order.id ? { ...x, status: "refunded", refund_amount: amt, refunded_at: new Date().toISOString() } : x));
      if (detail?.id === order.id) setDetail(d => ({ ...d, status: "refunded", refund_amount: amt, refunded_at: new Date().toISOString() }));
      showToast("✅ Refund of £" + amt.toFixed(2) + " issued via Square!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Order refunded", detail: `Order #${order.id} | Customer: ${order.customer_name || "?"} | Items: ${Array.isArray(order.items) ? order.items.map(i => `${i.name} x${i.qty}`).join(", ") : "?"} | Refund: £${amt.toFixed(2)}${refundNote ? ` | Note: ${refundNote}` : ""}` });
      setRefundModal(null);
    } catch (e) {
      showToast("❌ Refund failed: " + (e.message || String(e)), "red");
    } finally { setRefunding(false); }
  };
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const [statusTab, setStatusTab] = useState("pending");
  const STATUS_TABS = ["pending","processing","dispatched","completed","cancelled","return_requested","return_approved","return_received","all","refunded"];
  const visibleOrders = statusTab === "all" ? orders : orders.filter(o => o.status === statusTab);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <div style={{ fontSize:13, color:"var(--muted)" }}>{orders.length} orders · <span style={{ color:"var(--accent)" }}>£{totalRevenue.toFixed(2)}</span> total</div>
        <button className="btn btn-ghost btn-sm" onClick={fetchOrders} disabled={loading}>🔄 Refresh</button>
      </div>
      <div className="grid-4 mb-2">
        {[
          { label: "Total Orders", val: orders.length, color: "" },
          { label: "Pending", val: orders.filter(o => o.status === "pending").length, color: "blue" },
          { label: "Dispatched", val: orders.filter(o => o.status === "dispatched").length, color: "gold" },
          { label: "Revenue", val: `£${totalRevenue.toFixed(2)}`, color: "teal" },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-val">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="nav-tabs" style={{ marginBottom:12 }}>
        {STATUS_TABS.map(t => {
          const cnt = t === "all" ? orders.length : orders.filter(o => o.status === t).length;
          const tabLabel = t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return (
            <button key={t} className={`nav-tab${statusTab === t ? " active" : ""}`} onClick={() => setStatusTab(t)}>
              {tabLabel}{cnt > 0 && <span style={{ marginLeft:5, background: statusTab===t ? "rgba(0,0,0,.3)" : "var(--border)", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{cnt}</span>}
            </button>
          );
        })}
      </div>
      {loading ? (
        <div className="card" style={{ textAlign:"center", color:"var(--muted)", padding:40 }}>Loading orders…</div>
      ) : error ? (
        <div className="card" style={{ textAlign:"center", padding:40 }}>
          <div style={{ color:"var(--red)", marginBottom:12 }}>Failed: {error}</div>
          <button className="btn btn-ghost" onClick={fetchOrders}>Retry</button>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Order ID</th><th>Date</th><th>Customer</th><th>Items</th><th>Postage</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleOrders.length === 0 && <tr><td colSpan={8} style={{ textAlign:"center", color:"var(--muted)", padding:30 }}>No {statusTab === "all" ? "" : statusTab + " "}orders yet</td></tr>}
              {visibleOrders.map(o => {
                const items = Array.isArray(o.items) ? o.items : [];
                return (
                  <tr key={o.id}>
                    <td className="mono" style={{ fontSize:10, color:"var(--muted)" }}>#{(o.id||"").slice(-8).toUpperCase()}</td>
                    <td className="mono" style={{ fontSize:11 }}>{gmtShort(o.created_at)}</td>
                    <td style={{ fontWeight:600 }}>
                      <button style={{ background:"none", border:"none", color:"var(--blue)", cursor:"pointer", fontWeight:700, fontFamily:"inherit", fontSize:13 }} onClick={() => setDetail(o)}>{o.customer_name}</button>
                    </td>
                    <td style={{ fontSize:12, color:"var(--muted)" }}>{items.map(i => `${i.name} ×${i.qty}`).join(", ")}</td>
                    <td style={{ fontSize:12 }}>{o.postage_name || "—"}</td>
                    <td className="text-green">£{Number(o.total).toFixed(2)}</td>
                    <td>
                      {o.tracking_number
                        ? (() => {
                            const { courier, trackUrl } = detectCourier(o.tracking_number);
                            return (
                              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                                {/* Live status badge — replaces order status when tracking data is available */}
                                <AdminTrackStatusCell
                                  trackingNumber={o.tracking_number}
                                  courier={courier}
                                />
                                <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#c8ff00", letterSpacing:".05em" }}>
                                    📮 {o.tracking_number.trim()}
                                  </span>
                                  {courier && <span style={{ fontSize:9, color:"var(--muted)" }}>({courier})</span>}
                                  {trackUrl && (
                                    <a href={trackUrl} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize:9, color:"#4fc3f7", textDecoration:"none", fontWeight:700, letterSpacing:".05em" }}
                                      onClick={e => e.stopPropagation()}>↗ TRACK</a>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        : <span className={`tag tag-${STATUS_COLORS[o.status] || "blue"}`}>{o.status}</span>
                      }
                    </td>
                    <td>
                      <select value={o.status} onChange={e => setStatus(o.id, e.target.value)}
                        style={{ fontSize:12, padding:"4px 8px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:4 }}>
                        {["pending","processing","dispatched","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, flexWrap:"wrap", gap:10 }}>
              <div className="modal-title" style={{ margin:0 }}>📦 Order Details</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", marginTop:2 }}>#{(detail.id||"").slice(-8).toUpperCase()}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const addr = detail.customer_address || "No address on file";
                const items = (Array.isArray(detail.items) ? detail.items : []).map(i => `${i.name} x${i.qty}`).join(", ");
                const win = window.open("", "_blank", "width=400,height=300");
                win.document.write(`<html><head><title>Postage Label</title><style>body{font-family:Arial,sans-serif;padding:24px;border:3px solid #000;margin:20px;}.to{font-size:22px;font-weight:bold;margin:16px 0 8px;}.addr{font-size:16px;line-height:1.6;white-space:pre-line;}.from{font-size:11px;color:#555;margin-top:20px;border-top:1px solid #ccc;padding-top:10px;}@media print{body{margin:0;border:none;}}</style></head><body><div style="font-size:11px;color:#888;">ORDER #${detail.id?.slice(-8).toUpperCase()} · ${gmtShort(detail.created_at)}</div><div class="to">TO:</div><div style="font-size:20px;font-weight:bold;">${detail.customer_name}</div><div class="addr">${addr}</div><div class="from">FROM: Swindon Airsoft</div><script>window.onload=()=>window.print();<\/script></body></html>`);
                win.document.close();
              }}>🖨️ Print Label</button>
            </div>
            <div className="grid-2 mb-2">
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>CUSTOMER</div><div style={{ fontWeight:700 }}>{detail.customer_name}</div></div>
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>EMAIL</div><div style={{ fontSize:13 }}>{detail.customer_email || "—"}</div></div>
              <div style={{ gridColumn:"1 / -1" }}>
                <div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>SHIPPING ADDRESS</div>
                <div style={{ fontSize:13, whiteSpace:"pre-line", background:"var(--bg4)", padding:"10px 12px", borderRadius:3, border:"1px solid var(--border)" }}>{detail.customer_address || <span style={{ color:"var(--muted)" }}>No address on file</span>}</div>
              </div>
              {detail.valid_defence && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>🪪 VALID DEFENCE</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, fontWeight:700, background:"rgba(200,255,0,.04)", padding:"8px 12px", borderRadius:3, border:"1px solid rgba(200,255,0,.18)", color:"var(--accent)" }}>{detail.valid_defence}</div>
                </div>
              )}
              {detail.tracking_number && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={{ fontSize:11, color:"var(--muted)", marginBottom:6 }}>📮 TRACKING NUMBER</div>
                  <TrackingBlock trackingNumber={detail.tracking_number} adminMode />
                  <button className="btn btn-sm btn-ghost" style={{ marginTop:6 }}
                    onClick={() => setTrackingModal({ id: detail.id, tracking: detail.tracking_number || "", isUpdate: true })}>
                    ✏️ Update tracking number
                  </button>
                </div>
              )}
              {!detail.tracking_number && detail.status === "dispatched" && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => setTrackingModal({ id: detail.id, tracking: "", isUpdate: true })}>
                    📮 Add tracking number
                  </button>
                </div>
              )}
              <div><div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>STATUS</div>
                <select value={detail.status} onChange={e => setStatus(detail.id, e.target.value)}
                  style={{ fontSize:12, padding:"6px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:3, width:"100%" }}>
                  {["pending","processing","dispatched","completed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--muted)", marginBottom:8, letterSpacing:".1em" }}>ITEMS</div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                {(Array.isArray(detail.items) ? detail.items : []).map((i, idx) => (
                  <tr key={idx}><td>{i.name}</td><td>{i.qty}</td><td>£{Number(i.price).toFixed(2)}</td><td className="text-green">£{(Number(i.price)*i.qty).toFixed(2)}</td></tr>
                ))}
                {detail.discount_code && (
                  <tr style={{ color: "var(--accent)" }}>
                    <td colSpan={3} style={{ fontWeight: 700 }}>🏷️ Discount Code ({detail.discount_code})</td>
                    <td style={{ fontWeight: 700 }}>−£{Number(detail.discount_saving || 0).toFixed(2)}</td>
                  </tr>
                )}
                <tr style={{ borderTop:"2px solid var(--border)" }}>
                  <td colSpan={3} style={{ fontWeight:700 }}>Postage ({detail.postage_name})</td>
                  <td>£{Number(detail.postage).toFixed(2)}</td>
                </tr>
                <tr><td colSpan={3} style={{ fontWeight:900, fontSize:15 }}>TOTAL</td><td className="text-green" style={{ fontWeight:900, fontSize:15 }}>£{Number(detail.total).toFixed(2)}</td></tr>
              </tbody>
            </table></div>
              {/* Refund section */}
              {detail.refund_amount && (
                <div style={{ background:"rgba(255,60,60,.05)", border:"1px solid rgba(255,60,60,.2)", borderRadius:3, padding:"10px 14px", marginTop:12 }}>
                  <div style={{ fontSize:11, color:"var(--red)", fontWeight:700, letterSpacing:".08em", marginBottom:4 }}>💸 REFUNDED</div>
                  <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                    <div><span style={{ fontSize:11, color:"var(--muted)" }}>Amount: </span><span style={{ fontWeight:700, color:"var(--red)" }}>£{Number(detail.refund_amount).toFixed(2)}</span></div>
                    {detail.refunded_at && <div><span style={{ fontSize:11, color:"var(--muted)" }}>Date: </span><span style={{ fontSize:12 }}>{gmtShort(detail.refunded_at)}</span></div>}
                    {detail.refund_note && <div><span style={{ fontSize:11, color:"var(--muted)" }}>Note: </span><span style={{ fontSize:12 }}>{detail.refund_note}</span></div>}
                  </div>
                </div>
              )}
                        <div className="gap-2 mt-2">
              {!detail.refund_amount && (detail.paypal_order_id || detail.square_order_id) && (
                <button className="btn btn-sm" style={{ background:"rgba(255,60,60,.12)", border:"1px solid rgba(255,60,60,.35)", color:"var(--red)" }}
                  onClick={() => openRefund(detail)}>💸 Refund Order</button>
              )}
              {detail.status === "return_requested" && (
                <>
                  <button className="btn btn-sm" style={{ background:"rgba(200,255,0,.1)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00" }}
                    onClick={() => { setReturnModal({ order: detail }); setReturnAction("approve"); }}>✅ Approve Return</button>
                  <button className="btn btn-sm" style={{ background:"rgba(255,60,60,.1)", border:"1px solid rgba(255,60,60,.3)", color:"var(--red)" }}
                    onClick={() => { setReturnModal({ order: detail }); setReturnAction("reject"); }}>✗ Reject Return</button>
                </>
              )}
              {detail.status === "return_approved" && (
                <button className="btn btn-sm" style={{ background:"rgba(79,195,247,.1)", border:"1px solid rgba(79,195,247,.3)", color:"#4fc3f7" }}
                  onClick={() => { setReturnModal({ order: detail }); setReturnAction("received"); }}>📦 Mark Return Received</button>
              )}
              {(detail.return_number || detail.return_reason || detail.return_notes) && (
                <div style={{ marginTop:8, padding:"10px 12px", background:"rgba(200,150,0,.06)", border:"1px solid rgba(200,150,0,.2)", fontSize:12 }}>
                  {detail.return_number && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"var(--muted)", letterSpacing:".15em" }}>RETURN REF</span>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, fontWeight:700, color:"#c8ff00" }}>{detail.return_number}</span>
                    </div>
                  )}
                  {detail.return_reason && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", marginBottom: detail.return_notes ? 4 : 0 }}>
                      Reason: <span style={{ color:"var(--text)" }}>{detail.return_reason}</span>
                    </div>
                  )}
                  {detail.return_notes && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)" }}>
                      Notes: <span style={{ color:"var(--text)" }}>{detail.return_notes}</span>
                    </div>
                  )}
                  {detail.return_rejection_reason && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--red)", marginTop:6, paddingTop:6, borderTop:"1px solid rgba(255,60,60,.2)" }}>
                      <span style={{ color:"var(--muted)" }}>Rejection Reason: </span><span style={{ color:"#ffaaaa" }}>{detail.return_rejection_reason}</span>
                    </div>
                  )}
                </div>
              )}
              {detail.return_tracking && (
                <div style={{ fontSize:11, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", padding:"8px 10px", background:"var(--bg4)", border:"1px solid var(--border)", marginTop:4 }}>
                  📮 Customer return tracking: <span style={{ color:"#c8ff00" }}>{detail.return_tracking}</span>
                </div>
              )}
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Return action modal */}
      {returnModal && (
        <div className="overlay" onClick={() => { setReturnModal(null); setRejectionReason(""); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-title">
              {returnAction === "approve" ? "✅ Approve Return Request" : returnAction === "received" ? "📦 Mark Return Received" : "✗ Reject Return Request"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18, lineHeight: 1.6 }}>
              {returnAction === "approve" && "Approving this return will update the order status to 'Return Approved' and notify the customer by email. Customers are responsible for return postage. Items must be unused and in original packaging where possible — deductions may be made for opened or used items."}
              {returnAction === "received" && "Marking as received confirms you have the returned item in hand. You can then process a refund separately if needed."}
              {returnAction === "reject" && "Rejecting will revert the order status and notify the customer by email. Provide a reason below so the customer understands why."}
            </div>
            {(returnModal.order?.return_number || returnModal.order?.return_reason || returnModal.order?.return_notes) && (
              <div style={{ marginBottom: 16, padding: "10px 12px", background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 12, fontFamily: "'Share Tech Mono',monospace" }}>
                {returnModal.order?.return_number && (
                  <div style={{ marginBottom:6 }}>
                    <span style={{ fontSize:9, color:"var(--muted)", letterSpacing:".15em" }}>RETURN REF  </span>
                    <span style={{ fontWeight:700, color:"#c8ff00" }}>{returnModal.order.return_number}</span>
                  </div>
                )}
                {returnModal.order?.return_reason && (
                  <div style={{ marginBottom: returnModal.order?.return_notes ? 4 : 0 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2, letterSpacing: ".1em" }}>CUSTOMER REASON</div>
                    {returnModal.order.return_reason}
                  </div>
                )}
                {returnModal.order?.return_notes && (
                  <div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2, letterSpacing: ".1em", marginTop: 6 }}>CUSTOMER NOTES</div>
                    {returnModal.order.return_notes}
                  </div>
                )}
              </div>
            )}
            {returnAction === "reject" && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--red)" }}>Rejection Reason <span style={{ color: "var(--muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(shown to customer)</span></label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g. Item has been opened and shows signs of use. Per our returns policy, deductions apply to opened items..."
                  rows={3}
                  style={{ fontSize: 12, resize: "vertical", width: "100%", boxSizing: "border-box", borderColor: "rgba(255,60,60,.4)" }}
                />
              </div>
            )}
            <div className="gap-2">
              <button className="btn btn-primary" disabled={returnsProcessing} onClick={handleReturnAction}>
                {returnsProcessing ? "Processing…" : returnAction === "approve" ? "Approve Return" : returnAction === "received" ? "Mark Received" : "Reject Return"}
              </button>
              <button className="btn btn-ghost" onClick={() => { setReturnModal(null); setRejectionReason(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {trackingModal && (
        <div className="overlay" onClick={() => setTrackingModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{trackingModal.isUpdate ? "📮 Update Tracking Number" : "📦 Mark as Dispatched"}</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
              {trackingModal.isUpdate
                ? "Update the tracking number for this order. No email will be sent."
                : "Optionally enter a tracking number — it will be included in the dispatch email to the customer."}
            </p>
            <div className="form-group">
              <label>Tracking Number <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <input
                value={trackingModal.tracking}
                onChange={e => setTrackingModal(m => ({ ...m, tracking: e.target.value }))}
                placeholder="e.g. JD000000000000000000"
                onKeyDown={e => e.key === "Enter" && doDispatch(trackingModal.id, trackingModal.tracking)}
                autoFocus
              />
            </div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={() => doDispatch(trackingModal.id, trackingModal.tracking, trackingModal.isUpdate)}>
                {trackingModal.isUpdate ? "💾 Save Tracking Number" : "✓ Confirm Dispatch & Send Email"}
              </button>
              <button className="btn btn-ghost" onClick={() => setTrackingModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {refundModal && (
        <div className="overlay" onClick={() => !refunding && setRefundModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color:"var(--red)" }}>💸 Refund Order</div>
            <div style={{ background:"var(--bg4)", border:"1px solid var(--border)", borderRadius:3, padding:"10px 14px", marginBottom:16, fontSize:12 }}>
              <div style={{ fontWeight:700 }}>{refundModal.order.customer_name}</div>
              <div style={{ color:"var(--muted)", marginTop:2 }}>Order #{(refundModal.order.id||"").slice(-8).toUpperCase()} · Total: £{Number(refundModal.order.total).toFixed(2)}</div>
              <div style={{ color:"var(--muted)", fontSize:11, marginTop:2 }}>Square ref: {refundModal.order.square_order_id || refundModal.order.paypal_order_id || "—"}</div>
            </div>
            <div className="form-group">
              <label>Refund Amount (£)</label>
              <input type="number" step="0.01" min="0.01" max={refundModal.order.total}
                value={refundAmt} onChange={e => setRefundAmt(e.target.value)} autoFocus />
              <div style={{ fontSize:11, color:"var(--muted)", marginTop:4, display:"flex", gap:8 }}>
                <button style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", fontSize:11, padding:0 }}
                  onClick={() => setRefundAmt(Number(refundModal.order.total).toFixed(2))}>Full refund</button>
              </div>
            </div>
            <div className="form-group">
              <label>Internal Note <span style={{ fontWeight:400, color:"var(--muted)" }}>(optional)</span></label>
              <input value={refundNote} onChange={e => setRefundNote(e.target.value)} placeholder="e.g. Item out of stock, customer request" />
            </div>
            <div className="alert" style={{ background:"rgba(255,60,60,.06)", border:"1px solid rgba(255,60,60,.2)", fontSize:11, color:"var(--red)", marginBottom:14 }}>
              ⚠️ This will immediately issue a refund via Square. This cannot be undone.
            </div>
            <div className="gap-2">
              <button className="btn btn-sm" style={{ background:"var(--red)", color:"#fff", border:"none", opacity: refunding ? .6 : 1 }}
                onClick={doRefund} disabled={refunding}>
                {refunding ? "⏳ Processing…" : `✓ Confirm Refund · £${parseFloat(refundAmt||0).toFixed(2)}`}
              </button>
              <button className="btn btn-ghost" onClick={() => setRefundModal(null)} disabled={refunding}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Shop ────────────────────────────────────────────
function AdminShop({ data, save, showToast, cu }) {
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="shop" && ["products","postage","orders"].includes(p[2]) ? p[2] : "products";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/shop/" + t; };
  const [modal, setModal] = useState(null);
  const uid = () => Math.random().toString(36).slice(2,10);
  const blank = { name: "", description: "", price: 0, salePrice: null, onSale: false, image: "", images: [], stock: 0, noPost: false, gameExtra: false, costPrice: null, category: "", supplierCode: "", variants: [] };

  // Drag-to-reorder state for products
  const [shopOrder, setShopOrder] = useState(data.shop);
  const dragProductIdx = useRef(null);
  // Keep shopOrder in sync when data.shop changes (after save/refresh)
  useEffect(() => { setShopOrder(data.shop); }, [data.shop]);

  // Product search + category filter
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const allCategories = useMemo(() => {
    const cats = [...new Set(shopOrder.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [shopOrder]);
  const filteredShopOrder = useMemo(() => {
    let list = shopOrder;
    if (categoryFilter) list = list.filter(p => p.category === categoryFilter);
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
    }
    return list;
  }, [shopOrder, productSearch, categoryFilter]);

  // Collapsed category state - all expanded by default
  const [collapsedCats, setCollapsedCats] = useState({});
  const toggleCat = (cat) => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  const dragVariantIdx = useRef(null);
  const [form, setForm] = useState(blank);
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));

  // Variant editor state
  const [newVariant, setNewVariant] = useState({ name: "", price: "", stock: "", costPrice: "", supplierCode: "" });

  const addVariant = () => {
    if (!newVariant.name) { showToast("Variant name required", "red"); return; }
    const newVar = { id: uid(), name: newVariant.name, price: Number(newVariant.price) || 0, stock: Number(newVariant.stock) || 0, costPrice: newVariant.costPrice !== "" ? Number(newVariant.costPrice) : null, image: "", supplierCode: newVariant.supplierCode || "" };
    setField("variants", [...(form.variants || []), newVar]);
    setNewVariant({ name: "", price: "", stock: "", costPrice: "", supplierCode: "" });
  };
  const removeVariant = (id) => setField("variants", form.variants.filter(varItem => varItem.id !== id));
  const updateVariant = (id, key, val) => setField("variants", form.variants.map(v => v.id === id ? { ...v, [key]: key === "name" ? val : Number(val) } : v));
  const updateVariantRaw = (id, key, val) => setField("variants", form.variants.map(v => v.id === id ? { ...v, [key]: val } : v));

  const handleVariantImg = (id, e) => {
    const file = e.target.files[0]; if (!file) return;
    const img2 = new Image();
    const reader2 = new FileReader();
    reader2.onload = ev => {
      img2.onload = () => {
        const MAX2 = 900;
        const scale2 = Math.min(1, MAX2 / Math.max(img2.width, img2.height));
        const canvas2 = document.createElement("canvas");
        canvas2.width  = Math.round(img2.width  * scale2);
        canvas2.height = Math.round(img2.height * scale2);
        canvas2.getContext("2d").drawImage(img2, 0, 0, canvas2.width, canvas2.height);
        updateVariantRaw(id, "image", canvas2.toDataURL("image/jpeg", 0.75));
      };
      img2.src = ev.target.result;
    };
    reader2.readAsDataURL(file);
  };

  const hasVariants = (form.variants || []).length > 0;

  // Postage state
  const [postModal, setPostModal] = useState(null);
  const blankPost = { name: "", price: 0 };
  const [postForm, setPostForm] = useState(blankPost);
  const pf = (k, v) => setPostForm(p => ({ ...p, [k]: v }));

  const compressImage = (file) => new Promise(resolve => {
    const img2 = new Image();
    const reader2 = new FileReader();
    reader2.onload = ev => {
      img2.onload = () => {
        const MAX2 = 900;
        const scale2 = Math.min(1, MAX2 / Math.max(img2.width, img2.height));
        const canvas2 = document.createElement("canvas");
        canvas2.width  = Math.round(img2.width  * scale2);
        canvas2.height = Math.round(img2.height * scale2);
        canvas2.getContext("2d").drawImage(img2, 0, 0, canvas2.width, canvas2.height);
        resolve(canvas2.toDataURL("image/jpeg", 0.75));
      };
      img2.src = ev.target.result;
    };
    reader2.readAsDataURL(file);
  });

  const handleImg = (e) => {
    const files = Array.from(e.target.files); if (!files.length) return;
    Promise.all(files.map(compressImage)).then(newImgs => {
      setForm(prev => {
        const merged = [...(prev.images || []), ...newImgs];
        return { ...prev, images: merged, image: merged[0] || prev.image };
      });
    });
    e.target.value = ""; // allow re-selecting same file
  };

  const removeProductImage = (idx) => {
    setForm(prev => {
      const next = prev.images.filter((_, i) => i !== idx);
      return { ...prev, images: next, image: next[0] || "" };
    });
  };

  const moveProductImage = (from, to) => {
    setForm(prev => {
      const next = [...prev.images];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, images: next, image: next[0] || "" };
    });
  };

  const [delProductConfirm, setDelProductConfirm] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const confirmDeleteProduct = async () => {
    setDeletingProduct(true);
    try {
      await api.shop.delete(delProductConfirm.id);
      save({ shop: await api.shop.getAll() });
      showToast("Product deleted");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Product deleted", detail: delProductConfirm.name || delProductConfirm.id });
      setDelProductConfirm(null);
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setDeletingProduct(false); }
  };

  const [savingProduct, setSavingProduct] = useState(false);

  // Reset any stuck saving state when the tab becomes visible again
  // (browser can freeze JS mid-async when tab is hidden, leaving busy=true forever)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setSavingProduct(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const saveItem = async () => {
    if (!form.name) { showToast("Name required", "red"); return; }
    setSavingProduct(true);
    try {
      const origProduct = modal !== "new" ? (data.shop || []).find(p => p.id === form.id) : null;
      if (modal === "new") {
        const created = await api.shop.create(form);
        setForm(prev => ({ ...prev, id: created.id }));
      } else {
        await api.shop.update(form.id, form);
      }
      const freshShop = await api.shop.getAll();
      save({ shop: freshShop });
      showToast("Product saved!");
      if (modal === "new") {
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Product created", detail: `Name: ${form.name} | Price: £${Number(form.price || 0).toFixed(2)} | Stock: ${form.stock ?? "?"}` });
      } else {
        const PLABELS = { name: "Name", price: "Price", stock: "Stock", category: "Category", description: "Description", active: "Active", costPrice: "Cost price" };
        const before = { name: origProduct?.name, price: origProduct?.price, stock: origProduct?.stock, category: origProduct?.category, description: origProduct?.description, active: origProduct?.active, costPrice: origProduct?.costPrice };
        const after  = { name: form.name, price: form.price, stock: form.stock, category: form.category, description: form.description, active: form.active, costPrice: form.costPrice };
        const diff = diffFields(before, after, PLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Product updated", detail: `${form.name}${diff ? ` | ${diff}` : " (no changes)"}` });
      }
      setModal(null);
    } catch (e) {
      console.error("saveItem FAILED at:", e?.message, e);
      showToast("Save failed: " + fmtErr(e), "red");
    } finally {
      setSavingProduct(false);
    }
  };

  const savePostage = async () => {
    if (!postForm.name) { showToast("Name required", "red"); return; }
    try {
      if (postModal === "new") {
        await api.postage.create(postForm);
        save({ postageOptions: await api.postage.getAll() });
        showToast("Postage saved!"); setPostModal(null);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Postage option created", detail: `Name: ${postForm.name} | Price: £${Number(postForm.price || 0).toFixed(2)}` });
      } else {
        const origPost = (data.postageOptions || []).find(p => p.id === postForm.id);
        await api.postage.update(postForm.id, postForm);
        save({ postageOptions: await api.postage.getAll() });
        showToast("Postage saved!"); setPostModal(null);
        const POSTLABELS = { name: "Name", price: "Price", description: "Description" };
        const postDiff = diffFields({ name: origPost?.name, price: origPost?.price, description: origPost?.description }, { name: postForm.name, price: postForm.price, description: postForm.description }, POSTLABELS);
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Postage option updated", detail: `${postForm.name}${postDiff ? ` | ${postDiff}` : " (no changes)"}` });
      }
    } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
  };

  const deletePostage = async (id) => {
    const name = (data.postageOptions || []).find(p => p.id === id)?.name || id;
    try {
      await api.postage.delete(id);
      save({ postageOptions: await api.postage.getAll() });
      showToast("Removed");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Postage option deleted", detail: name });
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Shop</div></div>
        {tab === "products" && <button className="btn btn-primary" onClick={() => { setForm(blank); setNewVariant({ name:"", price:"", stock:"", costPrice:"", supplierCode:"" }); setSavingProduct(false); setModal("new"); }}>+ Add Product</button>}
        {tab === "postage" && <button className="btn btn-primary" onClick={() => { setPostForm(blankPost); setPostModal("new"); }}>+ Add Postage</button>}
      </div>

      <div className="nav-tabs">
        <button className={`nav-tab ${tab === "products" ? "active" : ""}`} onClick={() => setTab("products")}>Products</button>
        <button className={`nav-tab ${tab === "postage" ? "active" : ""}`} onClick={() => setTab("postage")}>Postage Options</button>
        <button className={`nav-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>Orders</button>
      </div>

      {tab === "products" && (
        <div className="card">
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
            <input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="🔍 Search products…"
              style={{ flex:1, minWidth:160, fontSize:13 }}
            />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{ fontSize:13, padding:"7px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:4, minWidth:140 }}
            >
              <option value="">All categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(productSearch || categoryFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setProductSearch(""); setCategoryFilter(""); }}>✕ Clear</button>
            )}
            <span style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>
              {filteredShopOrder.length} / {shopOrder.length}
            </span>
          </div>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>
            ☰ Drag rows to reorder. Variants can be reordered inside the edit modal.
          </p>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th style={{width:28}}></th><th>Product</th><th>Category</th><th>Base Price</th><th>Cost</th><th>Margin</th><th>Variants</th><th>Stock</th><th>Sale</th><th>No Post</th><th>Game Extra</th><th></th></tr></thead>
            <tbody>
              {(() => {
                const renderRow = (item) => {
                  const idx = shopOrder.findIndex(p => p.id === item.id);
                  return (
                    <tr key={item.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed="move"; dragProductIdx.current = idx; }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
                      onDrop={e => {
                        e.preventDefault();
                        const from = dragProductIdx.current;
                        if (from === idx) return;
                        const next = [...shopOrder];
                        const [moved] = next.splice(from, 1);
                        next.splice(idx, 0, moved);
                        setShopOrder(next);
                        dragProductIdx.current = null;
                        api.shop.reorder(next.map(p => p.id))
                          .then(() => save({ shop: next }))
                          .catch(() => showToast("Reorder failed", "red"));
                      }}
                      style={{cursor:"grab"}}
                    >
                      <td style={{color:"var(--muted)",fontSize:16,textAlign:"center",userSelect:"none"}}>☰</td>
                      <td style={{ fontWeight:600 }}>{item.name}</td>
                      <td>{item.category ? <span className="tag tag-blue" style={{fontSize:10}}>{item.category}</span> : <span style={{color:"var(--muted)"}}>—</span>}</td>
                      <td className="text-green">{item.variants?.length > 0 ? <span style={{color:"var(--muted)",fontSize:11}}>see variants</span> : `£${Number(item.price).toFixed(2)}`}</td>
                      <td style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11}}>
                        {item.variants?.length > 0
                          ? item.variants.some(v => v.costPrice)
                            ? item.variants.map(v => (
                                <div key={v.id} style={{whiteSpace:"nowrap"}}>
                                  {v.name}: {v.costPrice ? `£${Number(v.costPrice).toFixed(2)}` : <span style={{color:"var(--muted)"}}>—</span>}
                                </div>
                              ))
                            : <span style={{color:"var(--muted)"}}>—</span>
                          : item.costPrice ? `£${Number(item.costPrice).toFixed(2)}` : <span style={{color:"var(--muted)"}}>—</span>
                        }
                      </td>
                      <td style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11}}>
                        {item.variants?.length > 0
                          ? item.variants.some(v => v.costPrice && v.price > 0)
                            ? item.variants.filter(v => v.costPrice && v.price > 0).map(v => {
                                const m = v.price - v.costPrice;
                                const pct = ((m / v.price) * 100).toFixed(0);
                                return (
                                  <div key={v.id} style={{whiteSpace:"nowrap",color: m >= 0 ? "var(--accent)" : "var(--red)"}}>
                                    {v.name}: £{m.toFixed(2)} ({pct}%)
                                  </div>
                                );
                              })
                            : <span style={{color:"var(--muted)"}}>—</span>
                          : item.costPrice && item.price > 0 ? (() => {
                              const sell = item.onSale && item.salePrice ? item.salePrice : item.price;
                              const m = sell - item.costPrice;
                              const pct = ((m / sell) * 100).toFixed(0);
                              return <span style={{color: m >= 0 ? "var(--accent)" : "var(--red)"}}>£{m.toFixed(2)} ({pct}%)</span>;
                            })()
                          : <span style={{color:"var(--muted)"}}>—</span>
                        }
                      </td>
                      <td>
                        {item.variants?.length > 0
                          ? <span className="tag tag-blue">{item.variants.length} variants</span>
                          : <span style={{color:"var(--muted)"}}>—</span>
                        }
                      </td>
                      <td>
                        {item.variants?.length > 0
                          ? item.variants.map(v => (
                              <div key={v.id} style={{fontSize:11,fontFamily:"'Share Tech Mono',monospace",whiteSpace:"nowrap"}}>
                                {v.name}: <span style={{color:Number(v.stock)>0?"var(--accent)":"var(--red)"}}>{v.stock}</span>
                              </div>
                            ))
                          : item.stock
                        }
                      </td>
                      <td>{item.onSale ? <span className="tag tag-red">£{item.salePrice}</span> : "—"}</td>
                      <td>{item.noPost ? <span className="tag tag-gold">Yes</span> : "—"}</td>
                      <td>{item.gameExtra ? <span className="tag tag-green">✓</span> : "—"}</td>
                      <td>
                        <div className="gap-2">
                          <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...item, variants: item.variants || [] }); setNewVariant({ name:"", price:"", stock:"", costPrice:"", supplierCode:"" }); setSavingProduct(false); setModal(item.id); }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setDelProductConfirm(item)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                };

                if (filteredShopOrder.length === 0) {
                  return <tr><td colSpan={12} style={{textAlign:"center",color:"var(--muted)",padding:30}}>{productSearch || categoryFilter ? "No matching products" : "No products yet"}</td></tr>;
                }

                // When filtering/searching show flat list; otherwise group by category
                if (productSearch.trim() || categoryFilter) {
                  return filteredShopOrder.map(item => renderRow(item));
                }

                const uncategorised = filteredShopOrder.filter(p => !p.category);
                const groups = {};
                filteredShopOrder.filter(p => p.category).forEach(p => {
                  (groups[p.category] = groups[p.category] || []).push(p);
                });
                const sortedCats = Object.keys(groups).sort();

                return (
                  <>
                    {sortedCats.map(cat => {
                      const isCatCollapsed = !!collapsedCats[cat];
                      return (
                        <React.Fragment key={cat}>
                          <tr style={{userSelect:"none", cursor:"pointer"}} onClick={() => toggleCat(cat)}>
                            <td colSpan={12} style={{ background:"rgba(200,255,0,.06)", borderTop:"2px solid rgba(200,255,0,.18)", borderBottom:"1px solid rgba(200,255,0,.1)", padding:"7px 12px" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".2em", textTransform:"uppercase", color:"var(--accent)" }}>
                                  {isCatCollapsed ? "▶" : "▼"} {cat}
                                </span>
                                <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{groups[cat].length} item{groups[cat].length !== 1 ? "s" : ""}</span>
                                <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(200,255,0,.3)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>{isCatCollapsed ? "▸ EXPAND" : "▾ COLLAPSE"}</span>
                              </div>
                            </td>
                          </tr>
                          {!isCatCollapsed && groups[cat].map(item => renderRow(item))}
                        </React.Fragment>
                      );
                    })}
                    {uncategorised.length > 0 && (() => {
                      const isUncatCollapsed = !!collapsedCats["__none"];
                      return (
                        <React.Fragment key="__none">
                          {sortedCats.length > 0 && (
                            <tr style={{userSelect:"none", cursor:"pointer"}} onClick={() => toggleCat("__none")}>
                              <td colSpan={12} style={{ background:"rgba(120,120,120,.05)", borderTop:"2px solid rgba(150,150,150,.14)", borderBottom:"1px solid rgba(150,150,150,.08)", padding:"7px 12px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".2em", textTransform:"uppercase", color:"var(--muted)" }}>
                                    {isUncatCollapsed ? "▶" : "▼"} Uncategorised
                                  </span>
                                  <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{uncategorised.length} item{uncategorised.length !== 1 ? "s" : ""}</span>
                                  <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(150,150,150,.4)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>{isUncatCollapsed ? "▸ EXPAND" : "▾ COLLAPSE"}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {!isUncatCollapsed && uncategorised.map(item => renderRow(item))}
                        </React.Fragment>
                      );
                    })()}
                  </>
                );
              })()}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "postage" && (
        <div className="card">
          <p className="text-muted mb-2" style={{fontSize:13}}>Postage options shown at checkout. Items marked <strong>No Post</strong> are always collection-only.</p>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Option Name</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {(data.postageOptions || []).map(p => (
                <tr key={p.id}>
                  <td style={{fontWeight:600}}>{p.name}</td>
                  <td className="text-green">£{Number(p.price).toFixed(2)}</td>
                  <td><div className="gap-2">
                    <button className="btn btn-sm btn-ghost" onClick={() => { setPostForm({ ...p }); setPostModal(p.id); }}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deletePostage(p.id)}>Del</button>
                  </div></td>
                </tr>
              ))}
              {(data.postageOptions || []).length === 0 && <tr><td colSpan={3} style={{textAlign:"center",color:"var(--muted)",padding:30}}>No postage options configured</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "orders" && <AdminOrdersInline showToast={showToast} cu={cu} />}

      {/* ── PRODUCT MODAL ── */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === "new" ? "Add Product" : "Edit Product"}</div>

            <div className="form-row">
              <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setField("name", e.target.value)} /></div>
              <div className="form-group">
                <label>Category <span style={{fontWeight:400,color:"var(--muted)",fontSize:11}}>(optional — e.g. BBs, Guns, Accessories)</span></label>
                <input
                  list="category-suggestions"
                  value={form.category || ""}
                  onChange={e => setField("category", e.target.value)}
                  placeholder="Type or choose a category…"
                />
                <datalist id="category-suggestions">
                  {allCategories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="form-group">
              <label>Supplier Code <span style={{fontWeight:400,color:"var(--muted)",fontSize:11}}>(optional — used on purchase orders)</span></label>
              <input value={form.supplierCode || ""} onChange={e => setField("supplierCode", e.target.value)} placeholder="e.g. SKU-12345 or supplier part number" style={{fontFamily:"'Share Tech Mono',monospace"}} />
            </div>

            {/* Rich description editor */}
            <div className="form-group">
              <label>Description</label>
              <div style={{ border:"1px solid var(--border)", borderRadius:4, overflow:"hidden" }}>
                {/* Toolbar */}
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", padding:"6px 8px", background:"#1a1a1a", borderBottom:"1px solid var(--border)" }}>
                  {[
                    { label:"B",  title:"Bold",      wrap:["**","**"] },
                    { label:"I",  title:"Italic",     wrap:["*","*"] },
                    { label:"H2", title:"Heading",    line:"## " },
                    { label:"•",  title:"Bullet",     line:"- " },
                    { label:"—",  title:"Divider",    insert:"\n---\n" },
                  ].map(btn => (
                    <button key={btn.label} title={btn.title} type="button"
                      style={{ background:"#2a2a2a", border:"1px solid #333", color:"#ccc", width:30, height:26, fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:2 }}
                      onClick={() => {
                        const ta = document.getElementById("prod-desc-ta");
                        if (!ta) return;
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        const val = form.description || "";
                        let newVal, cursor;
                        if (btn.wrap) {
                          newVal = val.slice(0,start) + btn.wrap[0] + val.slice(start,end) + btn.wrap[1] + val.slice(end);
                          cursor = end + btn.wrap[0].length + btn.wrap[1].length;
                        } else if (btn.line) {
                          const lineStart = val.lastIndexOf("\n", start-1)+1;
                          newVal = val.slice(0,lineStart) + btn.line + val.slice(lineStart);
                          cursor = start + btn.line.length;
                        } else {
                          newVal = val.slice(0,start) + btn.insert + val.slice(end);
                          cursor = start + btn.insert.length;
                        }
                        setField("description", newVal);
                        setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
                      }}
                    >{btn.label}</button>
                  ))}
                  <span style={{ fontSize:10, color:"#555", marginLeft:4, alignSelf:"center" }}>**bold** *italic* ## heading - bullet ---</span>
                </div>
                {/* Edit / Preview tabs */}
                <div style={{ display:"flex", borderBottom:"1px solid var(--border)", background:"#111" }}>
                  {["edit","preview"].map(t => (
                    <button key={t} type="button" onClick={() => setField("_descTab", t)}
                      style={{ padding:"5px 16px", fontSize:11, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", background:"none", border:"none", borderBottom:(form._descTab||"edit")===t?"2px solid var(--accent)":"2px solid transparent", color:(form._descTab||"edit")===t?"var(--accent)":"#555", cursor:"pointer" }}>
                      {t==="edit"?"✏ EDIT":"👁 PREVIEW"}
                    </button>
                  ))}
                </div>
                {(form._descTab||"edit") !== "preview"
                  ? <textarea id="prod-desc-ta" rows={6} value={form.description||""} onChange={e => setField("description", e.target.value)}
                      style={{ width:"100%", background:"#111", border:"none", padding:"10px", resize:"vertical", color:"var(--text)", fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  : <div style={{ minHeight:120, padding:"10px 14px", background:"#0d0d0d", color:"var(--muted)", fontSize:13, lineHeight:1.8 }}
                      dangerouslySetInnerHTML={{ __html: renderMd(form.description) || "<span style='color:#444'>Nothing to preview yet…</span>" }} />
                }
              </div>
            </div>

            {/* Base price + stock — only relevant if no variants */}
            {!hasVariants && (
              <div className="form-row">
                <div className="form-group"><label>Base Price (£)</label><input type="number" step="0.01" value={form.price} onChange={e => setField("price", +e.target.value)} /></div>
                <div className="form-group"><label>Stock</label><input type="number" value={form.stock} onChange={e => setField("stock", +e.target.value)} /></div>
              </div>
            )}
            {hasVariants && (
              <div className="alert alert-blue mb-2" style={{fontSize:12}}>ℹ️ Variants are active — base price and stock are ignored. Each variant has its own price and stock.</div>
            )}

            {/* Sale price — only if no variants */}
            {!hasVariants && (
              <>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                  <input type="checkbox" checked={form.onSale} onChange={e => setField("onSale", e.target.checked)} />
                  <label style={{fontSize:13}}>On Sale</label>
                </div>
                {form.onSale && <div className="form-group"><label>Sale Price (£)</label><input type="number" step="0.01" value={form.salePrice || ""} onChange={e => setField("salePrice", +e.target.value)} /></div>}
              </>
            )}

            {/* Cost price — admin only, never shown to public */}
            <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:3,padding:"10px 14px",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:".12em",color:"var(--muted)",marginBottom:8,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>🔒 Admin Only — Cost &amp; Margin</div>
              <div className="form-row" style={{marginBottom:0}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label>Your Cost Price (£) <span style={{fontWeight:400,color:"var(--muted)"}}>— not shown to customers</span></label>
                  <input type="number" step="0.01" min="0" value={form.costPrice ?? ""} onChange={e => setField("costPrice", e.target.value === "" ? null : +e.target.value)} placeholder="0.00" />
                </div>
                {form.costPrice != null && form.costPrice > 0 && (() => {
                  const sellPrice = form.onSale && form.salePrice ? form.salePrice : form.price;
                  const margin = sellPrice - form.costPrice;
                  const pct = sellPrice > 0 ? ((margin / sellPrice) * 100).toFixed(0) : 0;
                  const colour = margin > 0 ? "var(--accent)" : "var(--red)";
                  return (
                    <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end",paddingBottom:2}}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:colour}}>
                        Margin: <strong>£{margin.toFixed(2)}</strong> ({pct}%)
                      </div>
                      {!hasVariants && form.costPrice > 0 && (
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:"var(--muted)",marginTop:3}}>
                          Break-even sell: £{(form.costPrice * 1.0).toFixed(2)} · 2× cost: £{(form.costPrice * 2).toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
              <input type="checkbox" checked={form.noPost} onChange={e => setField("noPost", e.target.checked)} />
              <label style={{fontSize:13}}>No Post — Collection Only (e.g. Pyro)</label>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              <input type="checkbox" checked={form.gameExtra || false} onChange={e => setField("gameExtra", e.target.checked)} />
              <label style={{fontSize:13}}>Available as Game Day Extra <span style={{color:"var(--muted)",fontSize:11}}>(shows in event extras product picker)</span></label>
            </div>

            {/* ── VARIANTS EDITOR ── */}
            <div style={{border:"1px solid #2a2a2a",borderLeft:"3px solid var(--accent)",marginBottom:14}}>
              <div style={{background:"#0d0d0d",padding:"8px 14px",fontSize:9,letterSpacing:".25em",color:"var(--accent)",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,textTransform:"uppercase",borderBottom:"1px solid #2a2a2a"}}>
                VARIANTS (optional) — e.g. sizes, colours &nbsp;<span style={{fontWeight:400,fontSize:10,color:"var(--muted)",letterSpacing:".05em"}}>☰ drag to reorder</span>
              </div>
              <div style={{padding:14}}>
                {(form.variants || []).length === 0 && (
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:"var(--muted)",marginBottom:10}}>No variants — product uses base price and stock above.</div>
                )}
                {(form.variants || []).map((v, vIdx) => (
                  <div key={v.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed="move"; dragVariantIdx.current = vIdx; }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
                    onDrop={e => {
                      e.preventDefault();
                      const from = dragVariantIdx.current;
                      if (from === vIdx) return;
                      const next = [...form.variants];
                      const [moved] = next.splice(from, 1);
                      next.splice(vIdx, 0, moved);
                      setField("variants", next);
                      dragVariantIdx.current = null;
                    }}
                    style={{marginBottom:10,background:"#0a0a0a",border:"1px solid #1e1e1e",borderRadius:2,padding:"10px 12px",cursor:"grab"}}
                  >
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,120px),1fr))",gap:8,alignItems:"center",marginBottom:4}}>
                      <span style={{color:"var(--muted)",fontSize:14,textAlign:"center",userSelect:"none",cursor:"grab"}}>☰</span>
                      <input value={v.name} onChange={e => updateVariant(v.id, "name", e.target.value)} placeholder="Variant name (e.g. Red, Large)" style={{fontSize:12}} />
                      <input type="number" step="0.01" value={v.price} onChange={e => updateVariant(v.id, "price", e.target.value)} placeholder="Sell £" style={{fontSize:12}} />
                      <input type="number" step="0.01" value={v.costPrice ?? ""} onChange={e => updateVariantRaw(v.id, "costPrice", e.target.value === "" ? null : Number(e.target.value))} placeholder="Cost £" style={{fontSize:12,borderColor:"#2a2a2a"}} title="Your cost price (admin only)" />
                      <input type="number" value={v.stock} onChange={e => updateVariant(v.id, "stock", e.target.value)} placeholder="Stock" style={{fontSize:12}} />
                      <button className="btn btn-sm btn-danger" onClick={() => removeVariant(v.id)} style={{padding:"6px 10px"}}>✕</button>
                    </div>
                    <div style={{paddingLeft:28,marginBottom:4}}>
                      <input value={v.supplierCode || ""} onChange={e => updateVariantRaw(v.id, "supplierCode", e.target.value)}
                        placeholder="Supplier code (optional)" style={{fontSize:11,fontFamily:"'Share Tech Mono',monospace",width:"100%",borderColor:"#1e2e0e",background:"#0a0f06",color:"var(--muted)"}} />
                    </div>
                    {v.costPrice != null && v.costPrice > 0 && v.price > 0 && (() => {
                      const margin = v.price - v.costPrice;
                      const pct = ((margin / v.price) * 100).toFixed(0);
                      return (
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color: margin >= 0 ? "var(--accent)" : "var(--red)",marginBottom:6,paddingLeft:28}}>
                          Margin: £{margin.toFixed(2)} ({pct}%) · 2× cost: £{(v.costPrice * 2).toFixed(2)}
                        </div>
                      );
                    })()}
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {v.image && <img src={v.image} style={{width:52,height:52,objectFit:"cover",border:"1px solid #333",flexShrink:0}} alt="" />}
                      <label style={{cursor:"pointer",flex:1}}>
                        <div className="btn btn-sm btn-ghost" style={{pointerEvents:"none",fontSize:11,padding:"4px 10px"}}>
                          {v.image ? "📷 Change Image" : "📷 Add Image"}
                        </div>
                        <input type="file" accept="image/*" style={{display:"none"}} onChange={e => handleVariantImg(v.id, e)} />
                      </label>
                      {v.image && <button className="btn btn-sm btn-ghost" style={{fontSize:11,padding:"4px 8px",color:"var(--red)"}} onClick={() => updateVariantRaw(v.id, "image", "")}>✕ Remove</button>}
                    </div>
                  </div>
                ))}
                {/* Add new variant row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,120px),1fr))",gap:8,alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid #1e1e1e"}}>
                  <input value={newVariant.name} onChange={e => setNewVariant(p => ({...p, name: e.target.value}))} placeholder="New variant name" style={{fontSize:12}} />
                  <input type="number" step="0.01" value={newVariant.price} onChange={e => setNewVariant(p => ({...p, price: e.target.value}))} placeholder="Sell £" style={{fontSize:12}} />
                  <input type="number" step="0.01" value={newVariant.costPrice} onChange={e => setNewVariant(p => ({...p, costPrice: e.target.value}))} placeholder="Cost £" style={{fontSize:12,borderColor:"#2a2a2a"}} title="Your cost price (admin only)" />
                  <input type="number" value={newVariant.stock} onChange={e => setNewVariant(p => ({...p, stock: e.target.value}))} placeholder="Stock" style={{fontSize:12}} />
                  <button className="btn btn-sm btn-primary" onClick={addVariant} style={{whiteSpace:"nowrap"}}>+ Add</button>
                </div>
                <div style={{marginTop:4}}>
                  <input value={newVariant.supplierCode} onChange={e => setNewVariant(p => ({...p, supplierCode: e.target.value}))}
                    placeholder="Supplier code for new variant (optional)" style={{fontSize:11,fontFamily:"'Share Tech Mono',monospace",width:"100%",borderColor:"#1e2e0e",background:"#0a0f06",color:"var(--muted)"}} />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Product Images <span style={{fontWeight:400,color:"var(--muted)",fontSize:11}}>(first image shown on shop card — drag to reorder)</span></label>
              {(form.images || []).length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                  {(form.images || []).map((img, i) => (
                    <div key={i} style={{ position:"relative", width:90, height:90, border: i===0 ? "2px solid var(--accent)" : "1px solid var(--border)", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                      <img src={img} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" />
                      {i === 0 && <div style={{ position:"absolute", top:2, left:2, background:"var(--accent)", color:"#000", fontSize:7, fontWeight:900, padding:"1px 4px", letterSpacing:".05em" }}>MAIN</div>}
                      <button onClick={() => removeProductImage(i)} title="Remove" style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,.75)", border:"none", color:"#fff", width:18, height:18, cursor:"pointer", fontSize:10, borderRadius:2, lineHeight:1, padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                      <div style={{ position:"absolute", bottom:2, left:0, right:0, display:"flex", justifyContent:"center", gap:3 }}>
                        {i > 0 && <button onClick={() => moveProductImage(i, i-1)} title="Move left" style={{ background:"rgba(0,0,0,.75)", border:"none", color:"#fff", width:16, height:16, cursor:"pointer", fontSize:9, borderRadius:2, padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>◀</button>}
                        {i < (form.images||[]).length-1 && <button onClick={() => moveProductImage(i, i+1)} title="Move right" style={{ background:"rgba(0,0,0,.75)", border:"none", color:"#fff", width:16, height:16, cursor:"pointer", fontSize:9, borderRadius:2, padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>▶</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display:"inline-flex", alignItems:"center", gap:6, cursor:"pointer", background:"var(--bg4)", border:"1px dashed var(--border)", padding:"8px 14px", borderRadius:3, fontSize:12, color:"var(--muted)" }}>
                📷 {(form.images||[]).length === 0 ? "Upload images" : "Add more images"}
                <input type="file" accept="image/*" multiple onChange={handleImg} style={{ display:"none" }} />
              </label>
            </div>

            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveItem} disabled={savingProduct}>{savingProduct ? "Saving…" : "Save Product"}</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Postage modal */}
      {postModal && (
        <div className="overlay" onClick={() => setPostModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{postModal === "new" ? "Add Postage Option" : "Edit Postage"}</div>
            <div className="form-group"><label>Option Name</label><input value={postForm.name} onChange={e => psetField("name", e.target.value)} placeholder="e.g. Standard (3-5 days)" /></div>
            <div className="form-group"><label>Price (£) — set 0 for free/collection</label><input type="number" min={0} step={0.01} value={postForm.price} onChange={e => psetField("price", +e.target.value)} /></div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={savePostage}>Save</button>
              <button className="btn btn-ghost" onClick={() => setPostModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {delProductConfirm && (
        <div className="overlay" onClick={() => !deletingProduct && setDelProductConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Product?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 4px" }}>
              Permanently delete <strong style={{ color: "var(--text)" }}>{delProductConfirm.name}</strong>?
            </p>
            <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 20 }}>
              ⚠️ This cannot be undone. Any event extras linked to this product will also lose their pricing reference.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={deletingProduct} onClick={confirmDeleteProduct}>
                {deletingProduct ? "Deleting…" : "Yes, Delete Product"}
              </button>
              <button className="btn btn-ghost" disabled={deletingProduct} onClick={() => setDelProductConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Leaderboard ─────────────────────────────────────
function AdminLeaderboard({ data, updateUser, showToast }) {
  const board = data.users.filter(u => u.role === "player").sort((a, b) => b.gamesAttended - a.gamesAttended);
  return (
    <div>
      <div className="page-header"><div><div className="page-title">Leaderboard</div></div></div>
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Games</th><th>VIP</th><th>Visible</th></tr></thead>
          <tbody>
            {board.map((boardPlayer, i) => (
              <tr key={boardPlayer.id}>
                <td>{i + 1}</td><td style={{ fontWeight: 600 }}>{boardPlayer.name}</td><td>{boardPlayer.gamesAttended}</td>
                <td>{boardPlayer.vipStatus === "active" ? <span className="tag tag-gold">⭐</span> : "—"}</td>
                <td>{boardPlayer.leaderboardOptOut ? <span className="tag tag-red">Hidden</span> : <span className="tag tag-green">Visible</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ── Admin Visitor Stats ───────────────────────────────────
function AdminVisitorStats() {
  const [visitData, setVisitData]         = useState([]);
  const [allTimeCounts, setAllTimeCounts] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [activeTab, setActiveTab]         = useState("overview");
  const [dateRange, setDateRange]         = useState("7d");

  const rangeToDays = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, "all": 0 };

  // Re-fetch whenever date range changes — filtering happens server-side
  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = rangeToDays[dateRange] ?? 7;
    Promise.all([
      api.visits.getStats(days),
      // Always fetch all-time counts so the headline total is always accurate
      // regardless of the 10k row fetch cap on getStats
      api.visits.getAllTimeCounts(),
    ])
      .then(([rows, counts]) => {
        setVisitData(rows);
        if (counts) setAllTimeCounts(counts);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [dateRange]); // eslint-disable-line

  // Data arrives pre-filtered from the server
  const filtered = visitData;

  // ── Derived stats ──
  // For "ALL" range, use the exact server-side counts (avoids any row-limit distortion)
  const totalVisits    = (dateRange === "all" && allTimeCounts) ? allTimeCounts.totalRows      : filtered.length;
  const uniqueSessions = (dateRange === "all" && allTimeCounts) ? allTimeCounts.uniqueSessions : new Set(filtered.map(row => row.session_id).filter(Boolean)).size;
  const uniqueUsers    = new Set(filtered.map(row => row.user_id).filter(Boolean)).size;
  const loggedInVisits = filtered.filter(row => row.user_id).length;
  const anonVisits     = filtered.length - loggedInVisits; // use filtered.length for anon ratio

  // Page breakdown
  const pageCounts = filtered.reduce((acc, row) => {
    acc[row.page] = (acc[row.page] || 0) + 1; return acc;
  }, {});
  const pageRows = Object.entries(pageCounts).sort((aa, bb) => bb[1] - aa[1]);

  // Visits by day
  const nowDate = new Date();
  const dayMap = {};
  filtered.forEach(row => {
    const dayKey = row.created_at?.slice(0, 10);
    if (dayKey) dayMap[dayKey] = (dayMap[dayKey] || 0) + 1;
  });
  const daysToShow = dateRange === "1d" ? 1 : dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 30;
  const dayBars = [];
  for (let offset = daysToShow - 1; offset >= 0; offset--) {
    const dayDate = new Date(nowDate);
    dayDate.setDate(nowDate.getDate() - offset);
    const dayKey = dayDate.toISOString().slice(0, 10);
    dayBars.push({ date: dayKey, label: dayDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), count: dayMap[dayKey] || 0 });
  }
  const maxDayCount = Math.max(...dayBars.map(db => db.count), 1);

  // Visits by hour
  const hourCounts = Array(24).fill(0);
  filtered.forEach(row => {
    if (row.created_at) hourCounts[new Date(row.created_at).getHours()]++;
  });
  const maxHourCount = Math.max(...hourCounts, 1);

  // Country breakdown
  const countryCounts = filtered.reduce((acc, row) => {
    const ckey = row.country || "Unknown";
    acc[ckey] = (acc[ckey] || 0) + 1; return acc;
  }, {});
  const countryRows = Object.entries(countryCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 10);

  // City breakdown
  const cityCounts = filtered.reduce((acc, row) => {
    const ckey = row.city ? `${row.city}${row.country ? ", " + row.country : ""}` : "Unknown";
    acc[ckey] = (acc[ckey] || 0) + 1; return acc;
  }, {});
  const cityRows = Object.entries(cityCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 12);

  // Logged-in user breakdown
  const userVisitMap = {};
  filtered.filter(row => row.user_id).forEach(row => {
    if (!userVisitMap[row.user_id]) {
      userVisitMap[row.user_id] = { name: row.user_name || row.user_id, count: 0, pages: {}, last: row.created_at };
    }
    userVisitMap[row.user_id].count++;
    userVisitMap[row.user_id].pages[row.page] = (userVisitMap[row.user_id].pages[row.page] || 0) + 1;
    if (row.created_at > userVisitMap[row.user_id].last) userVisitMap[row.user_id].last = row.created_at;
  });
  const userRows = Object.values(userVisitMap).sort((aa, bb) => bb.count - aa.count).slice(0, 20);

  // Recent feed
  const recentRows = [...filtered].slice(0, 50);

  // Referrers
  const refCounts = filtered.reduce((acc, row) => {
    const refKey = row.referrer ? (row.referrer.replace(/^https?:\/\//, "").split("/")[0] || "Direct") : "Direct";
    acc[refKey] = (acc[refKey] || 0) + 1; return acc;
  }, {});
  const refRows = Object.entries(refCounts).sort((aa, bb) => bb[1] - aa[1]).slice(0, 8);

  const PAGE_ICONS = { home:"⌂", events:"📅", shop:"🛒", gallery:"🖼", staff:"👥", leaderboard:"🏆", vip:"⭐", qa:"💬", contact:"✉", profile:"👤" };

  const CORNERS = [["top","left"],["top","right"],["bottom","left"],["bottom","right"]];

  const statCard = (cardLabel, cardValue, cardSub, cardColor = "#c8ff00") => (
    <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents:"none" }} />
      {CORNERS.map(([cv, ch]) => (
        <div key={cv + ch} style={{ position:"absolute", width:10, height:10,
          top:cv==="top"?5:"auto", bottom:cv==="bottom"?5:"auto",
          left:ch==="left"?5:"auto", right:ch==="right"?5:"auto",
          borderTop:cv==="top"?`1px solid ${cardColor}`:0,
          borderBottom:cv==="bottom"?`1px solid ${cardColor}`:0,
          borderLeft:ch==="left"?`1px solid ${cardColor}`:0,
          borderRight:ch==="right"?`1px solid ${cardColor}`:0,
          opacity:.5,
        }} />
      ))}
      <div style={{ position:"relative", zIndex:1 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010", marginBottom:6, textTransform:"uppercase" }}>{cardLabel}</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:cardColor, lineHeight:1 }}>{cardValue}</div>
        {cardSub && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", marginTop:4 }}>{cardSub}</div>}
      </div>
    </div>
  );

  const barRow = (barLabel, barCount, barTotal, barColor = "#c8ff00") => (
    <div key={barLabel} style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, color:"#b0c090", textTransform:"uppercase", letterSpacing:".04em" }}>{barLabel}</span>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#c8ff00" }}>{barCount} <span style={{ color:"#3a5010" }}>({Math.round(barCount / barTotal * 100)}%)</span></span>
      </div>
      <div style={{ height:4, background:"#0a0f06", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${Math.round(barCount / barTotal * 100)}%`, background:barColor, boxShadow:`0 0 6px ${barColor}80`, transition:"width .4s" }} />
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ padding:60, textAlign:"center", fontFamily:"'Share Tech Mono',monospace", color:"#3a5010", letterSpacing:".2em", fontSize:11 }}>
      ◈ LOADING INTEL…
    </div>
  );
  if (error) return (
    <div style={{ padding:40, textAlign:"center" }}>
      <div style={{ color:"var(--red)", fontFamily:"'Share Tech Mono',monospace", fontSize:12 }}>⚠ {error}</div>
      <div style={{ marginTop:8, fontSize:12, color:"#3a5010", fontFamily:"'Share Tech Mono',monospace" }}>
        Make sure the <code>page_visits</code> table exists in Supabase.
      </div>
    </div>
  );

  return (
    <div style={{ padding:"0 0 60px" }}>
      {/* Header */}
      <div style={{ borderBottom:"1px solid #1a2808", padding:"20px 24px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".25em", color:"#3a5010", marginBottom:4 }}>◈ ANALYTICS</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".1em", color:"#e8f0d8" }}>VISITOR INTELLIGENCE</div>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[["1d","24H"],["7d","7D"],["30d","30D"],["90d","90D"],["all","ALL"]].map(([rangeVal, rangeLabel]) => (
            <button key={rangeVal} onClick={() => setDateRange(rangeVal)} style={{
              fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em",
              padding:"6px 12px", cursor:"pointer", border:"1px solid",
              borderColor: dateRange===rangeVal ? "#c8ff00" : "#2a3a10",
              background:  dateRange===rangeVal ? "rgba(200,255,0,.1)" : "transparent",
              color:       dateRange===rangeVal ? "#c8ff00" : "#3a5010",
            }}>{rangeLabel}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom:"1px solid #1a2808", padding:"0 24px", display:"flex", gap:0 }}>
        {[["overview","OVERVIEW"],["pages","PAGES"],["locations","LOCATIONS"],["users","USERS"]].map(([tabId, tabLabel]) => (
          <button key={tabId} onClick={() => setActiveTab(tabId)} style={{
            fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em",
            padding:"12px 16px", cursor:"pointer", background:"none", border:"none",
            borderBottom: activeTab===tabId ? "2px solid #c8ff00" : "2px solid transparent",
            color: activeTab===tabId ? "#c8ff00" : "#3a5010",
            marginBottom:-1,
          }}>{tabLabel}</button>
        ))}
      </div>

      <div style={{ padding:"24px" }}>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12, marginBottom:28 }}>
              {statCard("Unique Visitors", uniqueSessions.toLocaleString(), "distinct sessions", "#c8ff00")}
              {statCard("Total Page Views", totalVisits.toLocaleString(), `across ${dateRange === "all" ? "all time" : dateRange}`, "#4fc3f7")}
              {statCard("Logged-In Visits", loggedInVisits.toLocaleString(), `${uniqueUsers} unique members`, "#c8a000")}
              {statCard("Anonymous Views",  anonVisits.toLocaleString(), `${totalVisits > 0 ? Math.round(anonVisits / filtered.length * 100) : 0}% of page views`, "#6a8050")}
            </div>

            {/* Day chart */}
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px", marginBottom:20 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>VISITS PER DAY</div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
                {dayBars.map(dayBar => (
                  <div key={dayBar.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#3a5010" }}>{dayBar.count || ""}</div>
                    <div style={{ width:"100%", background: dayBar.count ? "#c8ff00" : "#1a2808", height:`${Math.round((dayBar.count / maxDayCount) * 56) + 4}px`, minHeight:4, boxShadow: dayBar.count ? "0 0 4px rgba(200,255,0,.3)" : "none", transition:"height .3s" }} />
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#2a3a10", whiteSpace:"nowrap", transform:"rotate(-45deg)", transformOrigin:"top left", marginTop:4, marginLeft:4 }}>{dayBar.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hour heatmap */}
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px", marginBottom:20 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>VISITS BY HOUR (LOCAL TIME)</div>
              <div style={{ display:"flex", gap:3 }}>
                {hourCounts.map((hourCount, hourIndex) => {
                  const intensity = hourCount / maxHourCount;
                  const heatBg = hourCount === 0 ? "#0a0f06" : `rgba(200,255,0,${0.1 + intensity * 0.9})`;
                  return (
                    <div key={hourIndex} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }} title={`${hourIndex}:00 — ${hourCount} visits`}>
                      <div style={{ width:"100%", height:32, background:heatBg, border:"1px solid #1a2808", transition:"background .3s" }} />
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#2a3a10" }}>{hourIndex % 6 === 0 ? `${hourIndex}h` : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top pages + referrers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))", gap:16 }}>
              <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>TOP PAGES</div>
                {pageRows.slice(0, 6).map(([pg, cnt]) => barRow(`${PAGE_ICONS[pg] || "▸"} ${pg}`, cnt, totalVisits))}
                {pageRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No data</div>}
              </div>
              <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>REFERRERS</div>
                {refRows.map(([refKey, cnt]) => barRow(refKey, cnt, totalVisits, "#4fc3f7"))}
                {refRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No data</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── PAGES ── */}
        {activeTab === "pages" && (
          <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"#0c1009", border:"1px solid #1a2808", minWidth:340 }}>
            <div style={{ borderBottom:"1px solid #1a2808", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8 }}>
              {["PAGE","VISITS","SHARE"].map(colHead => (
                <div key={colHead} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010" }}>{colHead}</div>
              ))}
            </div>
            {pageRows.map(([pg, cnt]) => (
              <div key={pg} style={{ borderBottom:"1px solid #0f1a08", padding:"12px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8, alignItems:"center" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:15, color:"#b0c090", textTransform:"uppercase", letterSpacing:".05em" }}>
                  {PAGE_ICONS[pg] || "▸"} {pg}
                </div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:900, color:"#c8ff00" }}>{cnt}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ flex:1, height:3, background:"#0a0f06" }}>
                    <div style={{ height:"100%", width:`${Math.round(cnt / totalVisits * 100)}%`, background:"#c8ff00" }} />
                  </div>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", minWidth:32 }}>{Math.round(cnt / totalVisits * 100)}%</span>
                </div>
              </div>
            ))}
            {pageRows.length === 0 && <div style={{ padding:40, textAlign:"center", color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>NO DATA IN RANGE</div>}
          </div>
          </div>
        )}

        {/* ── LOCATIONS ── */}
        {activeTab === "locations" && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))", gap:16 }}>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>BY COUNTRY</div>
              {countryRows.map(([countryName, cnt]) => barRow(countryName, cnt, totalVisits))}
              {countryRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No location data yet — geo lookup fires on each new visit.</div>}
            </div>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"18px 20px" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:16 }}>BY CITY</div>
              {cityRows.map(([cityName, cnt]) => barRow(cityName, cnt, totalVisits, "#ce93d8"))}
              {cityRows.length === 0 && <div style={{ color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>No location data yet.</div>}
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {activeTab === "users" && (
          <div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", marginBottom:14 }}>
              {uniqueUsers} UNIQUE LOGGED-IN USERS · {loggedInVisits} VISITS
            </div>
            <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
            <div style={{ background:"#0c1009", border:"1px solid #1a2808", minWidth:480 }}>
              <div style={{ borderBottom:"1px solid #1a2808", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 2fr 2fr", gap:8 }}>
                {["USER","VISITS","TOP PAGE","LAST SEEN"].map(colHead => (
                  <div key={colHead} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".2em", color:"#3a5010" }}>{colHead}</div>
                ))}
              </div>
              {userRows.map((userRow, userIdx) => {
                const topPage = Object.entries(userRow.pages).sort((aa, bb) => bb[1] - aa[1])[0]?.[0] || "—";
                return (
                  <div key={userIdx} style={{ borderBottom:"1px solid #0f1a08", padding:"10px 16px", display:"grid", gridTemplateColumns:"2fr 1fr 2fr 2fr", gap:8, alignItems:"center" }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, fontWeight:700, color:"#b0c090" }}>{userRow.name}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:900, color:"#c8ff00" }}>{userRow.count}</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, color:"#3a5010", textTransform:"uppercase" }}>{PAGE_ICONS[topPage] || "▸"} {topPage}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010" }}>{new Date(userRow.last).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}</div>
                  </div>
                );
              })}
              {userRows.length === 0 && <div style={{ padding:40, textAlign:"center", color:"#2a3a10", fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>NO LOGGED-IN VISITS IN RANGE</div>}
            </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Admin Revenue ─────────────────────────────────────────
function AdminRevenue({ data, save, showToast, cu }) {
  const [cashSales, setCashSales] = useState([]);
  const [shopOrders, setShopOrders] = useState([]);
  const [selected, setSelected] = useState(null); // selected transaction for detail modal
  const [monthDetail, setMonthDetail] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null); // { t: transaction, busy: false }
  const [delBusy, setDelBusy] = useState(false);

  const reloadCash = () => api.cashSales.getAll().then(setCashSales).catch(console.error);

  useEffect(() => {
    reloadCash();
    api.shopOrders.getAll().then(setShopOrders).catch(console.error);
  }, []);

  const deleteTransaction = async (t) => {
    setDelBusy(true);
    try {
      if (t.source === "cash") {
        await api.cashSales.delete(t.id);
        await reloadCash();
      } else if (t.source === "shop") {
        await supabase.from('shop_orders').delete().eq('id', t.id);
        const freshOrders = await api.shopOrders.getAll();
        setShopOrders(freshOrders);
      } else {
        // Online booking — delete from bookings table then refresh events
        await api.bookings.delete(t.id);
        const freshEvents = await api.events.getAll();
        save({ events: freshEvents });
      }
      showToast("Transaction deleted.");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Transaction deleted", detail: `ID: ${t.id} — source: ${t.source}` });
      setDelConfirm(null);
      setSelected(null);
    } catch (e) {
      showToast("Delete failed: " + e.message, "red");
    } finally {
      setDelBusy(false);
    }
  };

  // Full GMT timestamp: "12/04/2026, 14:35:22"
  const gmtFull = (d) => new Date(d).toLocaleString("en-GB", {
    timeZone: "Europe/London", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });

  const bookingRevenue = data.events.flatMap(ev => ev.bookings.map(b => ({
    id: b.id,
    userName: b.userName,
    userId: b.userId,
    source: "booking",
    eventTitle: ev.title,
    eventDate: ev.date,
    eventObj: ev,
    type: b.type,
    ticketType: b.type === "walkOn" ? "Walk-on" : "Rental",
    qty: b.qty,
    extras: b.extras || {},
    eventExtras: ev.extras || [],
    total: Number(b.total),
    date: b.date || b.created_at,
    checkedIn: b.checkedIn,
    squareOrderId: b.squareOrderId || null,
  })));

  const shopRevenue = shopOrders
    .filter(o => o.status !== "cancelled" && o.status !== "refunded")
    .map(o => ({
      id: o.id,
      userName: o.customer_name,
      customerEmail: o.customer_email,
      source: "shop",
      eventTitle: "Shop Order",
      items: Array.isArray(o.items) ? o.items : [],
      total: Number(o.total),
      subtotal: Number(o.subtotal),
      postage: Number(o.postage || 0),
      discountCode: o.discount_code || null,
      discountSaving: o.discount_saving ? Number(o.discount_saving) : null,
      date: o.created_at,
      status: o.status,
    }));

  const cashRevenue = cashSales.map(s => ({
    id: s.id,
    userName: s.customer_name,
    customerEmail: s.customer_email,
    source: "cash",
    eventTitle: "Cash Sale",
    items: Array.isArray(s.items) ? s.items : [],
    total: Number(s.total),
    date: s.created_at,
  }));

  const all = [...bookingRevenue, ...shopRevenue, ...cashRevenue]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalBookings = bookingRevenue.reduce((s, b) => s + b.total, 0);
  const totalShop = shopRevenue.reduce((s, o) => s + o.total, 0);
  const totalCash = cashRevenue.reduce((s, b) => s + b.total, 0);
  const total = totalBookings + totalShop + totalCash;

  const byMonth = {};
  all.forEach(b => {
    const monthKey = new Date(b.date).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" });
    byMonth[monthKey] = (byMonth[monthKey] || 0) + b.total;
  });
  const months = Object.entries(byMonth).sort((a, b) => new Date("01 " + b[0]) - new Date("01 " + a[0]));

  // Build detail lines for a transaction
  const getLines = (t) => {
    if (t.source === "cash") {
      return t.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, line: i.price * i.qty }));
    } else if (t.source === "shop") {
      return t.items.map(i => ({ name: i.name, qty: i.qty, price: Number(i.price), line: Number(i.price) * i.qty }));
    } else {
      // Ticket line — work out ticket unit price from event
      const ev = t.eventObj || data.events.find(e => e.title === t.eventTitle);
      const unitPrice = t.type === "walkOn" ? (ev?.walkOnPrice || 0) : (ev?.rentalPrice || 0);
      const ticketLine = unitPrice * t.qty;
      const lines = [{ name: `${t.ticketType} ticket`, qty: t.qty, price: unitPrice, line: ticketLine }];
      // Extras — keys are "extraId" or "extraId:variantId"
      Object.entries(t.extras || {}).filter(([,v]) => v > 0).forEach(([key, qty]) => {
        const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
        const ex = t.eventExtras?.find(e => e.id === extraId);
        const lp = (data.shop || []).find(p => p.id === ex?.productId);
        const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        const label = ex ? (selectedVariant ? `${ex.name} — ${selectedVariant.name}` : ex.name) : key;
        const unitP = selectedVariant ? Number(selectedVariant.price) : (lp ? Number(lp.price) : (ex ? Number(ex.price) : 0));
        lines.push({ name: label, qty, price: unitP, line: unitP * qty });
      });
      return lines;
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Revenue</div><div className="page-sub">All times GMT</div></div>
      </div>

      {/* Stat cards */}
      <div className="grid-4 mb-2">
        {[
          { label: "Total Revenue", val: `£${total.toFixed(2)}`, color: "" },
          { label: "Event Bookings", val: `£${totalBookings.toFixed(2)}`, color: "blue" },
          { label: "Shop Orders", val: `£${totalShop.toFixed(2)}`, color: "teal" },
          { label: "Cash Sales", val: `£${totalCash.toFixed(2)}`, color: "gold" },
        ].map(({ label, val, color }) => (
          <div key={label} className={`stat-card ${color}`}><div className="stat-val">{val}</div><div className="stat-label">{label}</div></div>
        ))}
      </div>

      {/* Monthly breakdown */}
      <div className="card mb-2">
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Monthly Breakdown</div>
        {months.length === 0 ? <p className="text-muted">No revenue data yet.</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Month</th><th>Revenue</th><th>Transactions</th><th></th></tr></thead>
            <tbody>
              {months.map(([m, rev]) => {
                const mbs = all.filter(b => new Date(b.date).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" }) === m);
                return (
                  <tr key={m}>
                    <td style={{ fontWeight: 600 }}>{m}</td>
                    <td className="text-green">£{rev.toFixed(2)}</td>
                    <td>{mbs.length}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => setMonthDetail({ m, bookings: mbs })}>View →</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {/* All transactions */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 14 }}>All Transactions <span className="text-muted" style={{ fontSize: 12, fontWeight: 400 }}>— click any row for full detail</span></div>
        <div className="table-wrap"><table className="data-table">
          <thead>
            <tr>
              <th>Date &amp; Time (GMT)</th>
              <th>Customer</th>
              <th>Description</th>
              <th>Source</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {all.map(t => (
              <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setSelected(t)}>
                <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{gmtFull(t.date)}</td>
                <td style={{ fontWeight: 600 }}>{t.userName}</td>
                <td>
                  {t.source === "cash"
                    ? `Cash Sale (${t.items?.length || 0} items)`
                    : t.source === "shop"
                    ? `Shop Order (${t.items?.length || 0} item${t.items?.length !== 1 ? "s" : ""})`
                    : (() => {
                        const extrasCount = Object.values(t.extras || {}).filter(v => v > 0).length;
                        return `${t.eventTitle} — ${t.ticketType} ×${t.qty}${extrasCount ? ` + ${extrasCount} extra${extrasCount > 1 ? "s" : ""}` : ""}`;
                      })()
                  }
                </td>
                <td>
                  <span className={`tag ${t.source === "cash" ? "tag-gold" : t.source === "shop" ? "tag-teal" : "tag-blue"}`}>
                    {t.source === "cash" ? "💵 Cash" : t.source === "shop" ? "🛒 Shop" : "🌐 Online"}
                  </span>
                </td>
                <td className="text-green" style={{ fontWeight: 700 }}>£{t.total.toFixed(2)}</td>
                <td onClick={e => e.stopPropagation()} style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setSelected(t)}>Detail →</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDelConfirm(t)} title="Delete transaction">✕</button>
                </td>
              </tr>
            ))}
            {all.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No transactions yet</td></tr>}
          </tbody>
        </table></div>
      </div>

      {/* Transaction detail modal */}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {selected.source === "cash" ? "💵 Cash Sale" : selected.source === "shop" ? "🛒 Shop Order" : "🌐 Online Booking"} — Detail
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,180px),1fr))", gap: 8, marginBottom: 16 }}>
              {[
                ["Customer", selected.userName],
                ["Date & Time (GMT)", gmtFull(selected.date)],
                ["Source", selected.source === "cash" ? "Cash Sale" : selected.source === "shop" ? "Shop Order" : "Online Booking"],
                selected.source === "booking" ? ["Event", selected.eventTitle] : ["Customer Email", selected.customerEmail || "—"],
                selected.source === "booking" ? ["Ticket Type", selected.ticketType] : null,
                selected.source === "booking" ? ["Qty", selected.qty] : null,
                selected.source === "booking" ? ["Checked In", selected.checkedIn ? "✅ Yes" : "❌ No"] : null,
                selected.source === "shop" && selected.discountCode ? ["Discount Code", `${selected.discountCode} (−£${Number(selected.discountSaving || 0).toFixed(2)})`] : null,
                selected.source === "shop" ? ["Order Status", selected.status] : null,
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} style={{ background: "var(--bg3)", borderRadius: 6, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 2 }}>{k.toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13, letterSpacing: ".05em", color: "var(--muted)" }}>ITEMS</div>
            <div className="table-wrap"><table className="data-table" style={{ marginBottom: 16 }}>
              <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
              <tbody>
                {getLines(selected).map((line, i) => (
                  <tr key={i}>
                    <td>{line.name}</td>
                    <td>{line.qty}</td>
                    <td>{line.price != null ? `£${Number(line.price).toFixed(2)}` : "—"}</td>
                    <td className="text-green">{line.line != null ? `£${line.line.toFixed(2)}` : `£${Number(selected.total).toFixed(2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button className="btn btn-danger btn-sm" onClick={() => { setDelConfirm(selected); }}>🗑 Delete Transaction</button>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>TOTAL <span className="text-green">£{selected.total.toFixed(2)}</span></div>
                <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete confirmation modal ─── */}
      {delConfirm && (
        <div className="overlay" onClick={() => !delBusy && setDelConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑 Delete Transaction?</div>
            <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", padding:"12px 14px", borderRadius:4, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>{delConfirm.userName}</div>
              <div style={{ fontSize:12, color:"var(--muted)" }}>
                {delConfirm.source === "cash"
                  ? `Cash Sale — ${delConfirm.items?.length || 0} item(s)`
                  : delConfirm.source === "shop"
                  ? `Shop Order — ${delConfirm.items?.length || 0} item(s)`
                  : `${delConfirm.eventTitle} — ${delConfirm.ticketType} ×${delConfirm.qty}`
                }
              </div>
              <div style={{ fontSize:14, fontWeight:900, color:"var(--accent)", marginTop:6 }}>£{delConfirm.total.toFixed(2)}</div>
            </div>
            <p style={{ fontSize:13, color:"var(--red)", marginBottom:20 }}>
              ⚠️ This will permanently remove this transaction from the system. Revenue totals will update immediately. This cannot be undone.
            </p>
            <div className="gap-2">
              <button className="btn btn-danger" disabled={delBusy} onClick={() => deleteTransaction(delConfirm)}>
                {delBusy ? "Deleting…" : "Yes, Delete"}
              </button>
              <button className="btn btn-ghost" disabled={delBusy} onClick={() => setDelConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Month detail modal */}
      {monthDetail && (
        <div className="overlay" onClick={() => setMonthDetail(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📅 {monthDetail.m} — All Transactions</div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Date &amp; Time (GMT)</th><th>Customer</th><th>Description</th><th>Source</th><th>Total</th></tr></thead>
              <tbody>
                {monthDetail.bookings.map(t => (
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => { setMonthDetail(null); setSelected(t); }}>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{gmtFull(t.date)}</td>
                    <td>{t.userName}</td>
                    <td>
                  {t.source === "cash"
                    ? `Cash Sale (${t.items?.length || 0} items)`
                    : t.source === "shop"
                    ? `Shop Order (${t.items?.length || 0} item${t.items?.length !== 1 ? "s" : ""})`
                    : (() => {
                        const extrasCount = Object.values(t.extras || {}).filter(v => v > 0).length;
                        return `${t.eventTitle} — ${t.ticketType} ×${t.qty}${extrasCount ? ` + ${extrasCount} extra${extrasCount > 1 ? "s" : ""}` : ""}`;
                      })()
                  }
                </td>
                    <td>
                      <span className={`tag ${t.source === "cash" ? "tag-gold" : t.source === "shop" ? "tag-teal" : "tag-blue"}`}>
                        {t.source === "cash" ? "💵 Cash" : t.source === "shop" ? "🛒 Shop" : "🌐 Online"}
                      </span>
                    </td>
                    <td className="text-green">£{t.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Month Total: <span className="text-green">£{monthDetail.bookings.reduce((s, b) => s + b.total, 0).toFixed(2)}</span></div>
              <button className="btn btn-ghost" onClick={() => setMonthDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Gallery ─────────────────────────────────────────
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
function AboutPage({ setPage }) {
  const Divider = () => (
    <div style={{ display:"flex", alignItems:"center", gap:16, margin:"40px 0" }}>
      <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
      <div style={{ color:"#c8ff00", fontSize:14, opacity:.5 }}>✦</div>
      <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
    </div>
  );
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
function AdminStaff({ showToast, cu }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
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

  const blank = { name: "", jobTitle: "", bio: "", photo: "", rankOrder: 3 };
  const [form, setForm] = useState(blank);
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
                  <td style={{ color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".05em" }}>{m.job_title}</td>
                  <td><span style={{ fontSize: 11, color: m.rank_order === 1 ? "var(--gold)" : "var(--muted)", fontFamily: "'Barlow Condensed',sans-serif" }}>{RANK_OPTIONS.find(r => r.value === m.rank_order)?.label || `Rank ${m.rank_order}`}</span></td>
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
function ContactPage({ data, cu, showToast }) {
  const isMobile = useMobile(640);
  const departments = data.contactDepartments || [];

  const blank = { name: cu?.name || "", email: cu?.email || "", department: "", subject: "", message: "" };
  const [form, setForm]     = useState(blank);
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);
  const lastSentRef = useRef(0);
  const ff = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedDept = departments.find(d => d.name === form.department);

  const handleSend = async () => {
    const now = Date.now();
    if (now - lastSentRef.current < 60000) {
      showToast("Please wait a minute before sending another message.", "red"); return;
    }
    if (!form.name.trim())    { showToast("Please enter your name", "red"); return; }
    if (!form.email.trim() || !form.email.includes("@")) { showToast("Please enter a valid email", "red"); return; }
    if (!form.department)     { showToast("Please select a department", "red"); return; }
    if (!form.subject.trim()) { showToast("Please enter a subject", "red"); return; }
    if (!form.message.trim()) { showToast("Please enter a message", "red"); return; }
    if (!selectedDept?.email) { showToast("This department has no email configured yet", "red"); return; }

    setSending(true);
    try {
      await sendEmail({
        toEmail: selectedDept.email,
        toName:  selectedDept.name,
        subject: `[${selectedDept.name}] ${form.subject}`,
        htmlContent: `
          <div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#c8ff00;font-family:'Barlow Condensed',sans-serif;letter-spacing:.08em;text-transform:uppercase">
              New Contact Message — ${selectedDept.name}
            </h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px;width:120px">FROM</td><td style="padding:8px;background:#111;color:#fff">${form.name}</td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">EMAIL</td><td style="padding:8px;background:#111;color:#fff"><a href="mailto:${form.email}" style="color:#c8ff00">${form.email}</a></td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">DEPT</td><td style="padding:8px;background:#111;color:#fff">${selectedDept.name}</td></tr>
              <tr><td style="padding:8px;background:#1a1a1a;color:#888;font-size:12px">SUBJECT</td><td style="padding:8px;background:#111;color:#fff">${form.subject}</td></tr>
            </table>
            <div style="background:#111;border-left:3px solid #c8ff00;padding:16px;white-space:pre-wrap;color:#ccc;line-height:1.6">${form.message}</div>
          </div>
        `,
      });
      lastSentRef.current = Date.now();
      setSent(true);
      showToast("Message sent successfully!");
    } catch (e) {
      showToast("Failed to send: " + (e.message || "Please try again"), "red");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div style={{ background: "#080a06", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ position: "relative", display: "inline-block", marginBottom: 28 }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position: "absolute", width: 20, height: 20, zIndex: 2,
              top: v==="top" ? -8 : "auto", bottom: v==="bottom" ? -8 : "auto",
              left: h==="left" ? -8 : "auto", right: h==="right" ? -8 : "auto",
              borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
              borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
            }} />
          ))}
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 48, color: "#c8ff00", padding: "8px 24px", letterSpacing: ".1em" }}>✓</div>
        </div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, letterSpacing: ".2em", textTransform: "uppercase", color: "#e8f0d8", marginBottom: 12 }}>TRANSMISSION SENT</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 12, color: "#3a5010", letterSpacing: ".1em", marginBottom: 8 }}>MESSAGE ROUTED TO: <span style={{ color: "#c8ff00" }}>{form.department.toUpperCase()}</span></div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#2a3a10", letterSpacing: ".08em", marginBottom: 32 }}>REPLY WILL BE SENT TO: {form.email}</div>
        <button className="btn btn-primary" style={{ letterSpacing: ".15em" }} onClick={() => { setSent(false); setForm(blank); }}>SEND ANOTHER TRANSMISSION</button>
      </div>
    );
  }

  return (
    <div style={{ background: "#080a06", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0c1009 0%,#080a06 100%)", borderBottom: "2px solid #2a3a10", padding: "52px 24px 44px" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)", pointerEvents: "none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position: "absolute", width: 28, height: 28, zIndex: 2,
            top: v==="top" ? 14 : "auto", bottom: v==="bottom" ? 14 : "auto",
            left: h==="left" ? 14 : "auto", right: h==="right" ? 14 : "auto",
            borderTop: v==="top" ? "2px solid #c8ff00" : "none", borderBottom: v==="bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h==="left" ? "2px solid #c8ff00" : "none", borderRight: h==="right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".35em", color: "#3a5010", marginBottom: 14, textTransform: "uppercase" }}>◈ — SWINDON AIRSOFT — COMMAND COMMS — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: "clamp(30px,6vw,56px)", letterSpacing: ".18em", textTransform: "uppercase", color: "#e8f0d8", lineHeight: 1, marginBottom: 6 }}>
            OPEN <span style={{ color: "#c8ff00", textShadow: "0 0 30px rgba(200,255,0,.35)" }}>CHANNEL</span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: ".25em", color: "#3a5010", marginTop: 12 }}>▸ SECURE TRANSMISSION LINE — ALL COMMS MONITORED ◂</div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 24 }}>

          {/* Form */}
          <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "28px 24px" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 22, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,#c8ff00,transparent)", opacity: .3 }} />
              SEND TRANSMISSION
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to left,#c8ff00,transparent)", opacity: .3 }} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>OPERATIVE NAME *</label>
                <input value={form.name} onChange={e => ff("name", e.target.value)} placeholder="Full name" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
              </div>
              <div className="form-group">
                <label>COMMS ADDRESS *</label>
                <input value={form.email} onChange={e => ff("email", e.target.value)} placeholder="you@example.com" type="email" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
              </div>
            </div>

            <div className="form-group">
              <label>TARGET DEPARTMENT *</label>
              <select value={form.department} onChange={e => ff("department", e.target.value)} style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }}>
                <option value="">— SELECT DEPARTMENT —</option>
                {departments.length === 0
                  ? <option disabled>No departments configured yet</option>
                  : departments.map(d => <option key={d.name} value={d.name}>{d.name.toUpperCase()}</option>)
                }
              </select>
              {selectedDept?.description && (
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", marginTop: 6, letterSpacing: ".05em", lineHeight: 1.5 }}>▸ {selectedDept.description}</div>
              )}
            </div>

            <div className="form-group">
              <label>SUBJECT *</label>
              <input value={form.subject} onChange={e => ff("subject", e.target.value)} placeholder="Brief summary of your enquiry" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
            </div>

            <div className="form-group">
              <label>MESSAGE BODY *</label>
              <textarea rows={6} value={form.message} onChange={e => ff("message", e.target.value)} placeholder="Describe your enquiry in detail…" style={{ background: "#080a06", border: "1px solid #1a2808", borderRadius: 0 }} />
            </div>

            <button className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: 14, letterSpacing: ".2em", borderRadius: 0 }} onClick={handleSend} disabled={sending}>
              {sending ? "TRANSMITTING…" : "▸ SEND TRANSMISSION"}
            </button>
          </div>

          {/* Side panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {departments.length > 0 && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ DEPARTMENTS</div>
                {departments.map((d, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: i < departments.length-1 ? "1px solid #1a2808" : "none" }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: ".15em", color: "#c8ff00", textTransform: "uppercase", marginBottom: 4 }}>▸ {d.name}</div>
                    {d.description && <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#3a5010", lineHeight: 1.5 }}>{d.description}</div>}
                  </div>
                ))}
              </div>
            )}

            {(data.contactAddress || data.contactPhone || data.contactEmail) && (
              <div style={{ background: "#0c1009", border: "1px solid #1a2808", padding: "20px 18px" }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 12, letterSpacing: ".3em", color: "#c8ff00", marginBottom: 14, textTransform: "uppercase" }}>◈ BASE COORDINATES</div>
                {data.contactEmail && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>✉</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>COMMS</div>
                      <a href={`mailto:${data.contactEmail}`} style={{ color: "#c8ff00", fontSize: 12, fontFamily: "'Share Tech Mono',monospace", textDecoration: "none" }}>{data.contactEmail}</a>
                    </div>
                  </div>
                )}
                {data.contactPhone && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>☎</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>FIELD LINE</div>
                      <a href={`tel:${data.contactPhone}`} style={{ color: "#b0c090", fontSize: 12, fontFamily: "'Share Tech Mono',monospace", textDecoration: "none" }}>{data.contactPhone}</a>
                    </div>
                  </div>
                )}
                {data.contactAddress && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#2a3a10", letterSpacing: ".1em", flexShrink: 0, marginTop: 1 }}>⊕</div>
                    <div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#2a3a10", letterSpacing: ".15em", marginBottom: 3 }}>GRID REF</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#b0c090", lineHeight: 1.6, whiteSpace: "pre-line" }}>{data.contactAddress}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Contact Departments ──────────────────────────────
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
function EmailTestCard({ showToast, sectionHead }) {
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { ok, msg }

  const runTest = async () => {
    if (!testEmail || !testEmail.includes("@")) { showToast("Enter a valid email address", "red"); return; }
    setTesting(true);
    setLastResult(null);
    try {
      await sendEmail({
        toEmail: testEmail.trim(),
        toName: "Admin Test",
        subject: "✅ Swindon Airsoft — Email Test",
        htmlContent: `
          <div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:32px 16px;font-family:Arial,sans-serif;color:#fff;">
            <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;margin-bottom:20px;text-align:center;">
              <div style="font-size:32px;font-weight:900;letter-spacing:.1em;color:#fff;">SWINDON <span style="color:#e05c00;">AIRSOFT</span></div>
              <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:4px;text-transform:uppercase;">Email Test</div>
            </div>
            <div style="background:#111;border:1px solid #222;border-radius:8px;padding:24px;text-align:center;">
              <div style="font-size:40px;margin-bottom:12px;">✅</div>
              <div style="font-size:22px;font-weight:900;color:#c8ff00;">EmailJS is working!</div>
              <div style="font-size:13px;color:#aaa;margin-top:10px;">
                Sent at ${new Date().toLocaleString("en-GB")}<br/>
                Service: ${EMAILJS_SERVICE_ID} · Template: ${EMAILJS_TEMPLATE_ID}
              </div>
            </div>
          </div>`,
      });
      setLastResult({ ok: true, msg: "Email sent successfully! Check your inbox (and spam)." });
      showToast("📧 Test email sent!");
    } catch (e) {
      const msg = e?.text || e?.message || JSON.stringify(e);
      setLastResult({ ok: false, msg: "Failed: " + msg });
      showToast("Email failed: " + msg, "red");
    } finally { setTesting(false); }
  };

  return (
    <div className="card mb-2">
      {sectionHead("📧 Email Diagnostics")}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.7 }}>
        Send a test email to verify EmailJS is configured correctly.<br/>
        Service: <span className="mono" style={{ color: "var(--accent)" }}>{EMAILJS_SERVICE_ID}</span> ·
        Template: <span className="mono" style={{ color: "var(--accent)" }}>{EMAILJS_TEMPLATE_ID}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          type="email"
          value={testEmail}
          onChange={e => setTestEmail(e.target.value)}
          placeholder="your@email.com"
          onKeyDown={e => e.key === "Enter" && runTest()}
          style={{ flex: 1, fontSize: 13 }}
        />
        <button className="btn btn-primary" onClick={runTest} disabled={testing} style={{ whiteSpace: "nowrap" }}>
          {testing ? "Sending…" : "Send Test Email"}
        </button>
      </div>
      {lastResult && (
        <div className={`alert ${lastResult.ok ? "alert-green" : "alert-red"}`} style={{ fontSize: 12 }}>
          {lastResult.ok ? "✅ " : "❌ "}{lastResult.msg}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, lineHeight: 1.7 }}>
        <strong style={{ color: "var(--text)" }}>If the test fails, check:</strong><br/>
        • EmailJS dashboard → your template has variables: <span className="mono">to_email</span>, <span className="mono">to_name</span>, <span className="mono">subject</span>, <span className="mono">html_content</span><br/>
        • The service is connected and verified in EmailJS<br/>
        • Your EmailJS free tier hasn't hit its monthly limit (200/month)<br/>
        • The template's "To Email" field is set to <span className="mono">{"{{to_email}}"}</span>
      </div>
    </div>
  );
}

// ── Admin Settings ────────────────────────────────────────

// ── Admin Purchase Orders ─────────────────────────────────────
function AdminPurchaseOrders({ data, save, showToast, cu }) {
  const [tab, setTab] = useState("orders"); // "orders" | "suppliers"
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [poModal, setPoModal] = useState(null);     // null | "new" | order obj
  const [supModal, setSupModal] = useState(null);   // null | "new" | supplier obj
  const [detailModal, setDetailModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // New PO form state
  const blankPo = { supplierId: "", notes: "", items: [] };
  const [poForm, setPoForm] = useState(blankPo);
  const [newItem, setNewItem] = useState({ productId: "", variantId: "", productName: "", qtyOrdered: 1, unitCost: "" });

  // Supplier form state
  const blankSup = { name: "", contact: "", email: "", phone: "", notes: "" };
  const [supForm, setSupForm] = useState(blankSup);

  const STATUS_COLORS = { draft: "muted", ordered: "blue", partial: "gold", received: "green", cancelled: "red" };
  const STATUS_LABELS = { draft: "Draft", ordered: "Ordered", partial: "Part Received", received: "Fully Received", cancelled: "Cancelled" };

  const isMountedPO = useRef(true);
  const loadAll = useCallback(async () => {
    if (!isMountedPO.current) return;
    setLoading(true);
    try {
      const [ords, sups] = await Promise.all([api.purchaseOrders.getAll(), api.suppliers.getAll()]);
      if (isMountedPO.current) { setOrders(ords); setSuppliers(sups); }
    } catch (e) { if (isMountedPO.current) showToast("Load failed: " + e.message, "red"); }
    finally { if (isMountedPO.current) setLoading(false); }
  }, []);
  useEffect(() => {
    isMountedPO.current = true;
    loadAll();
    const onVisible = () => { if (document.visibilityState === "visible" && isMountedPO.current) loadAll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMountedPO.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [loadAll]);

  // ── Suppliers CRUD ──
  const saveSup = async () => {
    if (!supForm.name.trim()) { showToast("Supplier name required", "red"); return; }
    setBusy(true);
    try {
      if (supModal === "new") {
        await api.suppliers.create(supForm);
        showToast("Supplier added!");
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Supplier created", detail: supForm.name });
      } else {
        await api.suppliers.update(supModal.id, supForm);
        showToast("Supplier updated!");
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Supplier updated", detail: supForm.name });
      }
      await loadAll();
      setSupModal(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const deleteSup = async (id) => {
    if (!window.confirm("Delete this supplier?")) return;
    const name = suppliers.find(s => s.id === id)?.name || id;
    try {
      await api.suppliers.delete(id); await loadAll(); showToast("Supplier deleted.");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Supplier deleted", detail: name });
    }
    catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  // ── PO items builder ──
  const addPoItem = () => {
    if (!newItem.productName.trim() && !newItem.productId) { showToast("Select a product or enter a name", "red"); return; }
    const product = newItem.productId ? (data.shop || []).find(p => p.id === newItem.productId) : null;
    const variant = product && newItem.variantId ? product.variants?.find(v => v.id === newItem.variantId) : null;
    const hasVariants = product?.variants?.length > 0;
    if (hasVariants && !newItem.variantId) { showToast("Please select a variant", "red"); return; }
    const displayName = product
      ? (variant ? product.name + " — " + variant.name : product.name)
      : newItem.productName;
    const costPrice = variant?.costPrice ?? variant?.price ?? product?.costPrice ?? Number(newItem.unitCost) ?? 0;
    const supplierCode = variant?.supplierCode || product?.supplierCode || "";
    setPoForm(prev => ({ ...prev, items: [...prev.items, {
      id: Math.random().toString(36).slice(2),
      productId: newItem.productId || null,
      variantId: newItem.variantId || null,
      productName: displayName,
      supplierCode,
      qtyOrdered: Number(newItem.qtyOrdered) || 1,
      unitCost: Number(newItem.unitCost) || costPrice || 0,
    }]}));
    setNewItem({ productId: "", variantId: "", productName: "", qtyOrdered: 1, unitCost: "" });
  };

  const removePoItem = (id) => setPoForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));

  const poTotal = poForm.items.reduce((s, i) => s + (Number(i.qtyOrdered) * Number(i.unitCost)), 0);

  // ── Create PO ──
  const savePo = async () => {
    if (!poForm.items.length) { showToast("Add at least one item", "red"); return; }
    const sup = suppliers.find(s => s.id === poForm.supplierId);
    setBusy(true);
    try {
      await api.purchaseOrders.create({
        supplierId: poForm.supplierId || null,
        supplierName: sup ? sup.name : "",
        notes: poForm.notes,
        items: poForm.items,
        total: poTotal,
        status: "draft",
      });
      showToast("Purchase order created!");
      const poItemList = poForm.items.map(i => `${i.productName} x${i.qtyOrdered} @ £${Number(i.unitCost).toFixed(2)}`).join(", ");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Purchase order created", detail: `Supplier: ${sup ? sup.name : "none"} | Total: £${poTotal.toFixed(2)} | Items: ${poItemList}` });
      await loadAll();
      setPoModal(null);
      setPoForm(blankPo);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  // ── Receive items ──
  const [receiveQtys, setReceiveQtys] = useState({});
  const openDetail = (order) => {
    setDetailModal(order);
    const qtys = {};
    order.items.forEach(i => { qtys[i.id] = i.qty_received; });
    setReceiveQtys(qtys);
  };

  const saveReceive = async () => {
    setBusy(true);
    try {
      await Promise.all(
        detailModal.items.map(i =>
          api.purchaseOrders.receiveItem(
            i.id,
            Number(receiveQtys[i.id]) || 0,
            i.product_id || null,
            i.variant_id || null,
            i.qty_received   // previously received — delta is calculated in api
          )
        )
      );
      const allReceived = detailModal.items.every(i => Number(receiveQtys[i.id]) >= i.qty_ordered);
      const anyReceived = detailModal.items.some(i => Number(receiveQtys[i.id]) > 0);
      const newStatus = allReceived ? "received" : anyReceived ? "partial" : detailModal.status;
      if (newStatus !== detailModal.status) await api.purchaseOrders.updateStatus(detailModal.id, newStatus);
      // Refresh shop data so dashboard stock alerts update immediately
      const freshShop = await api.shop.getAll();
      save({ shop: freshShop });
      showToast("✅ Stock received & shop updated!");
      const receivedList = detailModal.items
        .filter(i => Number(receiveQtys[i.id]) > 0)
        .map(i => `${i.product_name || i.productName || "?"} x${receiveQtys[i.id]}`)
        .join(", ");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Stock received", detail: `PO #${detailModal.id} | Supplier: ${detailModal.supplier_name || "?"} | Status: ${detailModal.status} → ${newStatus} | Received: ${receivedList || "nothing"}` });
      await loadAll();
      setDetailModal(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("Delete this purchase order?")) return;
    try {
      await api.purchaseOrders.delete(id); await loadAll(); showToast("Purchase order deleted.");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Purchase order deleted", detail: `PO ID: ${id}` });
    }
    catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  const statusChange = async (id, status) => {
    try {
      await api.purchaseOrders.updateStatus(id, status); await loadAll(); showToast("Status updated!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "PO status updated", detail: `PO ID: ${id} → ${status}` });
    }
    catch (e) { showToast("Failed: " + e.message, "red"); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Purchase Orders</div>
          <div className="page-sub">Manage suppliers and incoming stock orders</div>
        </div>
        <div className="gap-2">
          {tab === "orders" && <button className="btn btn-primary" onClick={() => { setPoForm(blankPo); setPoModal("new"); }}>+ New Purchase Order</button>}
          {tab === "suppliers" && <button className="btn btn-primary" onClick={() => { setSupForm(blankSup); setSupModal("new"); }}>+ Add Supplier</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:16 }}>
        {[["orders","📋 Orders"],["suppliers","🏭 Suppliers"]].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:"8px 18px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13, letterSpacing:".08em", textTransform:"uppercase", background: tab===id ? "var(--accent)" : "var(--card)", color: tab===id ? "#000" : "var(--muted)", border:"1px solid", borderColor: tab===id ? "var(--accent)" : "var(--border)", cursor:"pointer", borderRadius:3 }}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="card" style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>Loading...</div>}

      {/* ── Orders Tab ── */}
      {!loading && tab === "orders" && (
        <div className="card">
          {orders.length === 0
            ? <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>No purchase orders yet. Click <strong>+ New Purchase Order</strong> to get started.</div>
            : <div className="table-wrap"><table className="data-table">
                <thead><tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td className="mono" style={{fontSize:11}}>#{o.id.slice(-6).toUpperCase()}</td>
                      <td className="mono" style={{fontSize:11}}>{gmtShort(o.created_at)}</td>
                      <td>{o.supplier_name || <span style={{color:"var(--muted)"}}>—</span>}</td>
                      <td style={{fontSize:12}}>{o.items.length} line{o.items.length!==1?"s":""}</td>
                      <td className="text-green">£{Number(o.total).toFixed(2)}</td>
                      <td>
                        <select value={o.status} onChange={e => statusChange(o.id, e.target.value)}
                          style={{fontSize:11, padding:"3px 6px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:2}}>
                          {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td><div className="gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => setViewModal(o)}>📄 View</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => openDetail(o)}>📥 Receive</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteOrder(o.id)}>✕</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </div>
      )}

      {/* ── Suppliers Tab ── */}
      {!loading && tab === "suppliers" && (
        <div className="card">
          {suppliers.length === 0
            ? <div style={{ textAlign:"center", padding:40, color:"var(--muted)" }}>No suppliers yet. Click <strong>+ Add Supplier</strong> to get started.</div>
            : <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Notes</th><th>Actions</th></tr></thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s.id}>
                      <td style={{fontWeight:700}}>{s.name}</td>
                      <td>{s.contact || "—"}</td>
                      <td style={{fontSize:12}}>{s.email || "—"}</td>
                      <td style={{fontSize:12}}>{s.phone || "—"}</td>
                      <td style={{fontSize:12, color:"var(--muted)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{s.notes || "—"}</td>
                      <td><div className="gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => { setSupForm({ name:s.name, contact:s.contact||"", email:s.email||"", phone:s.phone||"", notes:s.notes||"" }); setSupModal(s); }}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteSup(s.id)}>Remove</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </div>
      )}

      {/* ── New PO Modal ── */}
      {poModal && (
        <div className="overlay" onClick={() => setPoModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{maxWidth:700}}>
            <div className="modal-title">📋 New Purchase Order</div>

            <div className="grid-2 mb-2">
              <div className="form-group">
                <label>Supplier</label>
                <select value={poForm.supplierId} onChange={e => setPoForm(p => ({...p, supplierId: e.target.value}))}
                  style={{fontSize:13, padding:"6px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:3, width:"100%"}}>
                  <option value="">— Select Supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notes <span style={{fontWeight:400,color:"var(--muted)"}}>(optional)</span></label>
                <input value={poForm.notes} onChange={e => setPoForm(p => ({...p, notes: e.target.value}))} placeholder="e.g. Urgent restock" />
              </div>
            </div>

            <div style={{fontSize:12, fontWeight:700, color:"var(--muted)", letterSpacing:".1em", marginBottom:10}}>ORDER ITEMS</div>

            {/* Add item row */}
            <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:12, padding:"12px", background:"var(--bg4)", borderRadius:3, border:"1px solid var(--border)"}}>
              <div style={{flex:"2 1 160px"}}>
                <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>PRODUCT</div>
                <select value={newItem.productId} onChange={e => {
                  const prod = (data.shop||[]).find(p => p.id === e.target.value);
                  setNewItem(n => ({...n, productId: e.target.value, variantId: "", productName: prod ? prod.name : "", unitCost: prod?.costPrice && !prod?.variants?.length ? String(prod.costPrice) : n.unitCost}));
                }} style={{fontSize:12, padding:"5px 8px", background:"#1a1a1a", border:"1px solid var(--border)", color:"#fff", borderRadius:2, width:"100%"}}>
                  <option value="" style={{background:"#1a1a1a",color:"#fff"}}>— Pick shop product —</option>
                  {(data.shop||[]).map(p => (
                    <option key={p.id} value={p.id} style={{background:"#1a1a1a",color:"#fff"}}>
                      {p.name}{p.supplierCode ? " [" + p.supplierCode + "]" : ""}{p.variants?.length > 0 ? " (" + p.variants.length + " variants)" : (p.stock < 5 ? " (stock: " + p.stock + ")" : "")}
                    </option>
                  ))}
                </select>
                {/* Variant selector — shown when selected product has variants */}
                {newItem.productId && (data.shop||[]).find(p => p.id === newItem.productId)?.variants?.length > 0 && (
                  <select value={newItem.variantId} onChange={e => {
                    const prod = (data.shop||[]).find(p => p.id === newItem.productId);
                    const v = prod?.variants?.find(v => v.id === e.target.value);
                    setNewItem(n => ({...n, variantId: e.target.value, unitCost: v?.costPrice ? String(v.costPrice) : (v?.price ? String(v.price) : n.unitCost)}));
                  }} style={{fontSize:12, padding:"5px 8px", background:"#1a1a1a", border:"1px solid var(--accent)", color:"#fff", borderRadius:2, width:"100%", marginTop:6}}>
                    <option value="" style={{background:"#1a1a1a",color:"#fff"}}>— Select variant —</option>
                    {(data.shop||[]).find(p => p.id === newItem.productId)?.variants?.map(v => (
                      <option key={v.id} value={v.id} style={{background:"#1a1a1a",color:"#fff"}}>
                        {v.name}{v.supplierCode ? " [" + v.supplierCode + "]" : ""}{Number(v.stock) < 5 ? " (stock: " + v.stock + ")" : ""}
                      </option>
                    ))}
                  </select>
                )}
                <div style={{fontSize:10, color:"var(--muted)", marginTop:3}}>or enter free text:</div>
                <input value={newItem.productName} onChange={e => setNewItem(n => ({...n, productName: e.target.value, productId: "", variantId: ""}))}
                  placeholder="Product name" style={{fontSize:12, marginTop:4}} />
              </div>
              <div style={{flex:"0 0 80px"}}>
                <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>QTY</div>
                <input type="number" min="1" value={newItem.qtyOrdered} onChange={e => setNewItem(n => ({...n, qtyOrdered: e.target.value}))} style={{fontSize:12}} />
              </div>
              <div style={{flex:"0 0 100px"}}>
                <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>UNIT COST £</div>
                <input type="number" min="0" step="0.01" value={newItem.unitCost} onChange={e => setNewItem(n => ({...n, unitCost: e.target.value}))} style={{fontSize:12}} />
              </div>
              <div style={{flex:"0 0 auto", display:"flex", alignItems:"flex-end"}}>
                <button className="btn btn-primary btn-sm" onClick={addPoItem}>+ Add</button>
              </div>
            </div>

            {/* Items list */}
            {poForm.items.length > 0 && (
              <div className="table-wrap" style={{marginBottom:14}}><table className="data-table">
                <thead><tr><th>Product</th><th>Supplier Code</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th><th></th></tr></thead>
                <tbody>
                  {poForm.items.map(i => (
                    <tr key={i.id}>
                      <td>{i.productName}</td>
                      <td><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:"var(--accent)"}}>{i.supplierCode || "—"}</span></td>
                      <td>{i.qtyOrdered}</td>
                      <td>£{Number(i.unitCost).toFixed(2)}</td>
                      <td className="text-green">£{(i.qtyOrdered * i.unitCost).toFixed(2)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => removePoItem(i.id)}>✕</button></td>
                    </tr>
                  ))}
                  <tr style={{borderTop:"2px solid var(--border)"}}>
                    <td colSpan={3} style={{fontWeight:900}}>TOTAL</td>
                    <td className="text-green" style={{fontWeight:900}}>£{poTotal.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table></div>
            )}

            <div className="gap-2">
              <button className="btn btn-primary" onClick={savePo} disabled={busy || !poForm.items.length}>{busy ? "Saving…" : "Create Purchase Order"}</button>
              <button className="btn btn-ghost" onClick={() => setPoModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Purchase Order Modal ── */}
      {viewModal && (
        <div className="overlay" onClick={() => setViewModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{maxWidth:720, padding:0, overflow:"hidden"}}>

            {/* Header bar */}
            <div style={{background:"var(--bg4)", borderBottom:"1px solid var(--border)", padding:"16px 24px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div>
                <div style={{fontSize:11, letterSpacing:".12em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", marginBottom:2}}>PURCHASE ORDER</div>
                <div style={{fontSize:20, fontWeight:900, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".05em"}}>PO-{viewModal.id.slice(-6).toUpperCase()}</div>
              </div>
              <div style={{display:"flex", gap:8, alignItems:"center"}}>
                <span style={{padding:"4px 12px", borderRadius:2, fontSize:11, fontWeight:700, letterSpacing:".08em", fontFamily:"'Barlow Condensed',sans-serif", background:
                  viewModal.status==="received" ? "rgba(80,200,80,.15)" :
                  viewModal.status==="partial" ? "rgba(200,160,0,.15)" :
                  viewModal.status==="ordered" ? "rgba(60,120,255,.15)" :
                  viewModal.status==="cancelled" ? "rgba(200,60,60,.15)" : "rgba(120,120,120,.15)",
                  color:
                  viewModal.status==="received" ? "#7ccc60" :
                  viewModal.status==="partial" ? "var(--gold)" :
                  viewModal.status==="ordered" ? "#60a0ff" :
                  viewModal.status==="cancelled" ? "var(--red)" : "var(--muted)"
                }}>{STATUS_LABELS[viewModal.status] || viewModal.status}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => {
                  const win = window.open("", "_blank");
                  const sup = viewModal.supplier_name || "No supplier";
                  const date = new Date(viewModal.created_at).toLocaleDateString("en-GB", {day:"2-digit",month:"long",year:"numeric"});
                  const rows = viewModal.items.map(i =>
                    `<tr><td>${i.product_name}</td><td style="font-family:monospace">${i.supplier_code||"—"}</td><td style="text-align:center">${i.qty_ordered}</td><td style="text-align:center">${i.qty_received}</td><td style="text-align:right">£${Number(i.unit_cost).toFixed(2)}</td><td style="text-align:right">£${(i.qty_ordered*i.unit_cost).toFixed(2)}</td></tr>`
                  ).join("");
                  win.document.write(`<!DOCTYPE html><html><head><title>PO-${viewModal.id.slice(-6).toUpperCase()}</title><style>
                    body{font-family:Arial,sans-serif;margin:40px;color:#111;}
                    h1{margin:0 0 4px;font-size:24px;}  .sub{color:#666;font-size:13px;margin-bottom:24px;}
                    .meta{display:flex;gap:40px;margin-bottom:28px;} .meta div{font-size:13px;} .meta strong{display:block;font-size:11px;color:#888;text-transform:uppercase;margin-bottom:2px;}
                    table{width:100%;border-collapse:collapse;font-size:13px;}
                    th{background:#f4f4f4;padding:8px 10px;text-align:left;border-bottom:2px solid #ddd;font-size:11px;text-transform:uppercase;}
                    td{padding:8px 10px;border-bottom:1px solid #eee;}
                    tfoot td{font-weight:bold;border-top:2px solid #ddd;background:#f9f9f9;}
                    .status{display:inline-block;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:bold;background:#e8f5e9;color:#2e7d32;}
                    @media print{body{margin:20px;}}
                  </style></head><body>
                    <h1>Purchase Order</h1>
                    <div class="sub">PO-${viewModal.id.slice(-6).toUpperCase()} &nbsp;·&nbsp; <span class="status">${STATUS_LABELS[viewModal.status]||viewModal.status}</span></div>
                    <div class="meta">
                      <div><strong>Supplier</strong>${sup}</div>
                      <div><strong>Date Raised</strong>${date}</div>
                      ${viewModal.notes ? `<div><strong>Notes</strong>${viewModal.notes}</div>` : ""}
                    </div>
                    <table><thead><tr><th>Product</th><th>Supplier Code</th><th style="text-align:center">Qty Ordered</th><th style="text-align:center">Qty Received</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Line Total</th></tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr><td colspan="5">TOTAL</td><td style="text-align:right">£${Number(viewModal.total).toFixed(2)}</td></tr></tfoot>
                    </table>
                  </body></html>`);
                  win.document.close();
                  win.print();
                }}>🖨 Print</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setViewModal(null)}>✕ Close</button>
              </div>
            </div>

            {/* Body */}
            <div style={{padding:"24px"}}>

              {/* Meta row */}
              <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:20}}>
                {[
                  { label:"Supplier", val: viewModal.supplier_name || "—" },
                  { label:"Date Raised", val: new Date(viewModal.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}) },
                  { label:"Order Total", val: "£" + Number(viewModal.total).toFixed(2), accent:true },
                ].map(({label,val,accent}) => (
                  <div key={label} style={{background:"var(--bg4)", border:"1px solid var(--border)", borderRadius:3, padding:"10px 14px"}}>
                    <div style={{fontSize:10, letterSpacing:".1em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", marginBottom:4}}>{label.toUpperCase()}</div>
                    <div style={{fontSize:14, fontWeight:700, color: accent ? "var(--accent)" : "var(--text)"}}>{val}</div>
                  </div>
                ))}
              </div>

              {viewModal.notes && (
                <div style={{marginBottom:16, padding:"10px 14px", background:"rgba(255,255,255,.03)", border:"1px solid var(--border)", borderRadius:3, fontSize:13, color:"var(--muted)"}}>
                  <span style={{fontSize:10, letterSpacing:".1em", fontFamily:"'Barlow Condensed',sans-serif", marginRight:8}}>NOTES:</span>{viewModal.notes}
                </div>
              )}

              {/* Items table */}
              <div className="table-wrap"><table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Supplier Code</th>
                    <th style={{textAlign:"center"}}>Qty Ordered</th>
                    <th style={{textAlign:"center"}}>Qty Received</th>
                    <th style={{textAlign:"right"}}>Unit Cost</th>
                    <th style={{textAlign:"right"}}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewModal.items.map(i => {
                    const pct = i.qty_ordered > 0 ? Math.round((i.qty_received / i.qty_ordered) * 100) : 0;
                    return (
                      <tr key={i.id}>
                        <td style={{fontWeight:600}}>{i.product_name}</td>
                        <td><span style={{fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--accent)"}}>{i.supplier_code || "—"}</span></td>
                        <td style={{textAlign:"center"}}>{i.qty_ordered}</td>
                        <td style={{textAlign:"center"}}>
                          <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:8}}>
                            <span style={{color: i.qty_received >= i.qty_ordered ? "var(--accent)" : i.qty_received > 0 ? "var(--gold)" : "var(--muted)"}}>{i.qty_received}</span>
                            {i.qty_ordered > 0 && (
                              <div style={{width:40, height:4, background:"var(--bg4)", borderRadius:2, overflow:"hidden"}}>
                                <div style={{width:pct+"%", height:"100%", background: pct>=100 ? "var(--accent)" : pct>0 ? "var(--gold)" : "var(--muted)", borderRadius:2}} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{textAlign:"right", fontFamily:"'Share Tech Mono',monospace", fontSize:12}}>£{Number(i.unit_cost).toFixed(2)}</td>
                        <td style={{textAlign:"right", fontFamily:"'Share Tech Mono',monospace", fontSize:12, fontWeight:700, color:"var(--accent)"}}>£{(i.qty_ordered * i.unit_cost).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid var(--border)"}}>
                    <td colSpan={5} style={{fontWeight:900, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", fontSize:13}}>ORDER TOTAL</td>
                    <td style={{textAlign:"right", fontWeight:900, fontFamily:"'Share Tech Mono',monospace", color:"var(--accent)", fontSize:14}}>£{Number(viewModal.total).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table></div>

              <div style={{marginTop:16, display:"flex", gap:8, justifyContent:"flex-end"}}>
                <button className="btn btn-ghost" onClick={() => { setViewModal(null); openDetail(viewModal); }}>📥 Receive Stock</button>
                <button className="btn btn-ghost" onClick={() => setViewModal(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Receive Stock Modal ── */}
      {detailModal && (
        <div className="overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{maxWidth:640}}>
            <div className="modal-title">📥 Receive Stock — PO #{detailModal.id.slice(-6).toUpperCase()}</div>
            <div style={{marginBottom:14, fontSize:13, color:"var(--muted)"}}>
              {detailModal.supplier_name && <span>Supplier: <strong style={{color:"var(--text)"}}>{detailModal.supplier_name}</strong> · </span>}
              Created: {gmtShort(detailModal.created_at)}
            </div>
            <div className="table-wrap" style={{marginBottom:16}}><table className="data-table">
              <thead><tr><th>Product</th><th>Supplier Code</th><th>Ordered</th><th>Prev. Rcvd</th><th>Receive Now</th><th>Adding to Stock</th></tr></thead>
              <tbody>
                {detailModal.items.map(i => {
                  const nowVal = Number(receiveQtys[i.id] ?? i.qty_received) || 0;
                  const delta = nowVal - (i.qty_received || 0);
                  return (
                    <tr key={i.id}>
                      <td>{i.product_name}</td>
                      <td><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:"var(--accent)"}}>{i.supplier_code || i.supplierCode || "—"}</span></td>
                      <td>{i.qty_ordered}</td>
                      <td>{i.qty_received}</td>
                      <td><input type="number" min="0" max={i.qty_ordered}
                        value={receiveQtys[i.id] ?? i.qty_received}
                        onChange={e => setReceiveQtys(q => ({...q, [i.id]: e.target.value}))}
                        style={{width:70, fontSize:13}} /></td>
                      <td>
                        {!i.product_id ? (
                          <span style={{fontSize:11,color:"var(--muted)"}}>—</span>
                        ) : delta > 0 ? (
                          <span style={{fontSize:12,color:"var(--accent)",fontWeight:700}}>+{delta}</span>
                        ) : delta < 0 ? (
                          <span style={{fontSize:12,color:"var(--red)",fontWeight:700}}>{delta}</span>
                        ) : (
                          <span style={{fontSize:11,color:"var(--muted)"}}>no change</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            <div className="alert" style={{background:"rgba(80,180,60,.06)", border:"1px solid rgba(80,180,60,.25)", fontSize:12, color:"#7ccc60", marginBottom:14}}>
              ✅ Saving will automatically update shop stock levels. The <strong>Adding to Stock</strong> column shows the net change.
            </div>
            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveReceive} disabled={busy}>{busy ? "Saving…" : "Save Receipt"}</button>
              <button className="btn btn-ghost" onClick={() => setDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier Modal ── */}
      {supModal && (
        <div className="overlay" onClick={() => setSupModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{maxWidth:480}}>
            <div className="modal-title">{supModal === "new" ? "🏭 Add Supplier" : `✏️ Edit — ${supModal.name}`}</div>
            <div className="form-group"><label>Supplier Name *</label><input value={supForm.name} onChange={e => setSupForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Tactical Supplies Ltd" /></div>
            <div className="form-group"><label>Contact Name</label><input value={supForm.contact} onChange={e => setSupForm(p=>({...p,contact:e.target.value}))} placeholder="e.g. John Smith" /></div>
            <div className="grid-2">
              <div className="form-group"><label>Email</label><input type="email" value={supForm.email} onChange={e => setSupForm(p=>({...p,email:e.target.value}))} /></div>
              <div className="form-group"><label>Phone</label><input value={supForm.phone} onChange={e => setSupForm(p=>({...p,phone:e.target.value}))} /></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea rows={2} value={supForm.notes} onChange={e => setSupForm(p=>({...p,notes:e.target.value}))} placeholder="Payment terms, lead times, etc." /></div>
            <div className="gap-2 mt-2">
              <button className="btn btn-primary" onClick={saveSup} disabled={busy}>{busy ? "Saving…" : supModal === "new" ? "Add Supplier" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setSupModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Admin Bookkeeping / HMRC ──────────────────────────────────────────


function AdminSettings({ showToast, cu }) {
  const S = (key, def = "") => {
    const [val, setVal] = useState(def);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      api.settings.get(key).then(v => { if (v) setVal(v); setLoaded(true); }).catch(() => setLoaded(true));
    }, []);
    return [val, setVal, loaded];
  };

  const [squareAppId, setSquareAppId] = S("square_app_id");
  const [trackApiKey, setTrackApiKey] = S("trackingmore_api_key");
  React.useEffect(() => { if (trackApiKey) trackKeyCache.value = trackApiKey; }, [trackApiKey]);
  const [savingTrack, setSavingTrack] = useState(false);
  const [squareLocationId, setSquareLocationId] = S("square_location_id");
  const [squareEnv, setSquareEnv, sqLoaded] = S("square_env", "sandbox");
  const [squareTerminalDeviceId, setSquareTerminalDeviceId] = S("square_terminal_device_id");
  const [savingSQ, setSavingSQ] = useState(false);
  const [showAppId, setShowAppId] = useState(false);

  // Shop closed toggle
  const [shopClosedSetting, setShopClosedSetting] = useState(false);
  const [savingShopClosed, setSavingShopClosed] = useState(false);
  React.useEffect(() => {
    api.settings.get("shop_closed").then(v => setShopClosedSetting(v === "true")).catch(() => {});
  }, []);

  // Xero settings
  const [xeroAccountCode, setXeroAccountCode] = S("xero_account_code");
  const [xeroClientId, setXeroClientId] = S("xero_client_id");
  const [savingXero, setSavingXero] = useState(false);
  const [xeroConnected, setXeroConnected] = useState(false);
  React.useEffect(() => {
    api.settings.get("xero_refresh_token").then(v => setXeroConnected(!!v)).catch(() => {});
  }, []);
  const xeroAuthUrl = xeroClientId
    ? `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${xeroClientId}&redirect_uri=https://bnlndgjbcthxyodgstaa.supabase.co/functions/v1/xero-auth-callback&scope=openid+profile+email+accounting.invoices+accounting.payments+accounting.contacts+offline_access&state=swindon-airsoft`
    : null;

  const saveSquare = async () => {
    setSavingSQ(true);
    try {
      await api.settings.set("square_app_id", squareAppId.trim());
      await api.settings.set("square_location_id", squareLocationId.trim());
      await api.settings.set("square_env", squareEnv);
      await api.settings.set("square_terminal_device_id", squareTerminalDeviceId.trim());
      // Access token is stored in Supabase Edge Function secrets, not the DB
      _squareConfigLoaded = false;
      showToast("✅ Square settings saved! Changes take effect on next checkout.");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Square settings saved", detail: `env: ${squareEnv}` });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingSQ(false); }
  };

  const sectionHead = (label) => (
    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Payment configuration and API keys</div>
        </div>
      </div>

      {/* Shop Closed Toggle */}
      <div className="card mb-2">
        {sectionHead("🛒 Shop Status")}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:13, color:"var(--text)", marginBottom:4 }}>
              {shopClosedSetting
                ? <span style={{ color:"var(--red)", fontWeight:700 }}>⛔ Shop is currently CLOSED</span>
                : <span style={{ color:"var(--accent)", fontWeight:700 }}>✅ Shop is currently OPEN</span>}
            </div>
            <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.6 }}>
              When closed, the shop page shows a redirect to Airsoft Armoury UK with the <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 4px" }}>COLLECTION</code> code for game day pickup.
            </div>
          </div>
          <button
            className={shopClosedSetting ? "btn btn-primary" : "btn btn-ghost"}
            style={{ minWidth:160, borderColor: shopClosedSetting ? "var(--red)" : "var(--accent)", color: shopClosedSetting ? "var(--red)" : "var(--accent)" }}
            disabled={savingShopClosed}
            onClick={async () => {
              setSavingShopClosed(true);
              try {
                const next = !shopClosedSetting;
                await api.settings.set("shop_closed", String(next));
                setShopClosedSetting(next);
                showToast(next ? "🔒 Shop closed — customers will see the Airsoft Armoury UK redirect." : "✅ Shop is now open.");
                logAction({ adminEmail: cu?.email, adminName: cu?.name, action: next ? "Shop closed" : "Shop opened", detail: null });
              } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
              finally { setSavingShopClosed(false); }
            }}>
            {savingShopClosed ? "Saving…" : shopClosedSetting ? "🔓 Reopen Shop" : "🔒 Close Shop"}
          </button>
        </div>
      </div>

      {/* Xero */}
      <div className="card mb-2">
        {sectionHead("📊 Xero Accounting")}
        <div style={{ fontSize:12, color:"var(--muted)", lineHeight:1.8, marginBottom:14 }}>
          When connected, a sales receipt is automatically created in Xero for every confirmed ticket booking. Fires fire-and-forget — never affects the booking flow.
        </div>

        <div className="form-group">
          <label>Client ID</label>
          <input value={xeroClientId} onChange={e => setXeroClientId(e.target.value.trim())} placeholder="e.g. C77D10B2CEA848A6B015006D9ACB6FC8" />
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>
            Xero Developer Portal → My Apps → your app → Configuration → Client ID.
          </div>
        </div>

        <div className="form-group">
          <label>Client Secret</label>
          <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.6, padding:"8px 12px", background:"rgba(255,255,255,.03)", border:"1px solid var(--border)", borderRadius:4 }}>
            🔒 Store as a Supabase secret — not in the database.<br/>
            <code style={{ color:"var(--accent)" }}>supabase secrets set XERO_CLIENT_SECRET=your_secret</code><br/>
            <span style={{ color:"#555" }}>Found in: Xero Developer Portal → My Apps → your app → Configuration → Client secret</span>
          </div>
        </div>

        <div className="form-group">
          <label>Revenue Account Code</label>
          <input value={xeroAccountCode} onChange={e => setXeroAccountCode(e.target.value.trim())} placeholder="e.g. 200" style={{ maxWidth:160 }} />
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>
            Xero → Accounting → Chart of Accounts → find your sales/revenue account → copy the code number.
          </div>
        </div>

        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
          <button className="btn btn-primary btn-sm" disabled={savingXero} onClick={async () => {
            setSavingXero(true);
            try {
              await Promise.all([
                api.settings.set("xero_account_code", xeroAccountCode.trim()),
                api.settings.set("xero_client_id",    xeroClientId.trim()),
              ]);
              showToast("✅ Xero settings saved!");
            } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
            finally { setSavingXero(false); }
          }}>
            {savingXero ? "Saving…" : "Save Xero Settings"}
          </button>

          {xeroAuthUrl ? (
            <a href={xeroAuthUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              🔗 {xeroConnected ? "Re-authorise Xero" : "Connect Xero"}
            </a>
          ) : (
            <span style={{ fontSize:11, color:"var(--muted)" }}>Save Client ID first to enable Connect button</span>
          )}
        </div>

        {xeroConnected ? (
          <div className="alert alert-green" style={{ fontSize:12 }}>
            ✅ Xero is connected. Sales receipts will be created automatically after each booking.
          </div>
        ) : (
          <div className="alert" style={{ fontSize:12, background:"rgba(200,255,0,.04)", border:"1px solid rgba(200,255,0,.15)", color:"var(--muted)" }}>
            Enter Client ID, save, then click "Connect Xero" to authorise.
          </div>
        )}
      </div>

      {/* Square */}
      <div className="card mb-2">
        {sectionHead("💳 Square Payments")}

        <div className="form-group">
          <label>Environment</label>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {["sandbox", "production"].map(m => (
              <button key={m} onClick={() => setSquareEnv(m)}
                style={{
                  padding: "8px 22px", borderRadius: 4, border: "1px solid",
                  fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer",
                  background: squareEnv === m ? (m === "production" ? "var(--accent)" : "#2d7a2d") : "var(--card)",
                  color: squareEnv === m ? "#000" : "var(--muted)",
                  borderColor: squareEnv === m ? (m === "production" ? "var(--accent)" : "#2d7a2d") : "var(--border)",
                }}>
                {m === "production" ? "🟠 Production" : "🟢 Sandbox / Test"}
              </button>
            ))}
          </div>
          {squareEnv === "production"
            ? <div className="alert alert-red mt-2" style={{ fontSize: 12 }}>⚠️ PRODUCTION mode — real payments will be charged to customers.</div>
            : <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>Sandbox mode — test payments only, no real money taken.</div>
          }
        </div>

        <div className="form-group">
          <label>Application ID {squareEnv === "production" ? "(Production)" : "(Sandbox)"}</label>
          <div style={{ position: "relative" }}>
            <input
              type={showAppId ? "text" : "password"}
              value={squareAppId}
              onChange={e => setSquareAppId(e.target.value)}
              placeholder={squareEnv === "production" ? "sq0idp-... (Production Application ID)" : "sandbox-sq0idb-... (Sandbox Application ID)"}
              style={{ paddingRight: 80 }}
            />
            <button onClick={() => setShowAppId(v => !v)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>
              {showAppId ? "Hide" : "Show"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            Found in your <a href="https://developer.squareup.com/apps" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Square Developer Dashboard</a> under your application's Credentials tab.
          </div>
        </div>

        <div className="form-group">
          <label>Location ID</label>
          <input
            value={squareLocationId}
            onChange={e => setSquareLocationId(e.target.value)}
            placeholder="L... (from Square Dashboard → Locations)"
          />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
            Found in Square Dashboard → <strong style={{ color: "var(--text)" }}>Locations</strong>. Each business location has a unique ID.
          </div>
        </div>

        <div className="form-group">
          <label>Terminal Device ID <span style={{ color:"var(--muted)", fontSize:11, fontWeight:400 }}>— for Cash Sales terminal payments</span></label>
          <input
            value={squareTerminalDeviceId}
            onChange={e => setSquareTerminalDeviceId(e.target.value)}
            placeholder="device:... (from Square Dashboard → Devices)"
          />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.7 }}>
            Found in <a href="https://squareup.com/dashboard/devices" target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>Square Dashboard → Devices</a>.
            Click your Terminal → copy the <strong style={{ color:"var(--text)" }}>Device ID</strong> (starts with <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 4px", borderRadius:2 }}>device:</code>).
            Leave blank to hide the terminal option in Cash Sales.
          </div>
        </div>

        <div className="form-group">
          <label>Access Token <span style={{ color: "var(--red)", fontSize: 10 }}>Required for refunds</span></label>
          <div className="alert alert-green" style={{ fontSize: 12, lineHeight: 1.8 }}>
            🔒 <strong>Your Access Token is stored securely.</strong><br/>
            It lives in your Supabase Edge Function secrets — not in the database — so it is never exposed to the browser.<br/>
            <span style={{ color: "var(--muted)" }}>To update it: Supabase Dashboard → Edge Functions → square-payment → Secrets → <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 4px", borderRadius:2 }}>SQUARE_ACCESS_TOKEN</code></span>
          </div>
        </div>

        <button className="btn btn-primary" onClick={saveSquare} disabled={savingSQ || !sqLoaded}>
          {savingSQ ? "Saving..." : "Save Square Settings"}
        </button>

        {squareEnv === "production" && squareAppId && squareLocationId && (
          <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>
            ✅ Production Square is configured. Customers will see the card payment form at checkout.
          </div>
        )}
        {squareEnv === "production" && (!squareAppId || !squareLocationId) && (
          <div className="alert alert-red mt-2" style={{ fontSize: 12 }}>
            ⚠️ Environment is Production but Application ID or Location ID is missing — checkouts will show an error.
          </div>
        )}
      </div>

      {/* How to get Square keys guide */}
      <div className="card mb-2" style={{ background: "#0a140a", border: "1px solid #1a2e1a" }}>
        {sectionHead("📋 Square Setup Guide")}
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 2 }}>
          <div>1. Go to <a href="https://developer.squareup.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>developer.squareup.com</a> and log in with your Square account.</div>
          <div>2. Create an application (or open an existing one) → go to <strong style={{ color: "var(--text)" }}>Credentials</strong>.</div>
          <div>3. Switch to the <strong style={{ color: "var(--text)" }}>Production</strong> tab → copy your <strong style={{ color: "var(--text)" }}>Application ID</strong> and <strong style={{ color: "var(--text)" }}>Access Token</strong>.</div>
          <div>4. Go to your <a href="https://squareup.com/dashboard/locations" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Square Dashboard → Locations</a> → copy your <strong style={{ color: "var(--text)" }}>Location ID</strong>.</div>
          <div>5. Paste all three above, set Environment to <strong style={{ color: "var(--accent)" }}>Production</strong>, and click Save.</div>
          <div>6. Deploy the <strong style={{ color: "var(--text)" }}>square-payment</strong> Supabase Edge Function (see README) to handle server-side payment creation and refunds.</div>
        </div>
      </div>

      {/* TrackingMore */}
      <div className="card mb-2">
        {sectionHead("📦 Parcel Tracking (TrackingMore)")}
        <div className="form-group">
          <label>TrackingMore API Key</label>
          <div style={{ position: "relative" }}>
            <input
              type="password"
              value={trackApiKey}
              onChange={e => { setTrackApiKey(e.target.value); trackKeyCache.value = undefined; }}
              placeholder="Paste your TrackingMore API key here"
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            Get a free key at <a href="https://www.trackingmore.com/api" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>trackingmore.com/api</a> — the free tier gives 500 tracking requests/month and covers Royal Mail, DPD, Evri, Parcelforce, UPS, FedEx and more. Once saved, the STATUS column in Orders will show live courier statuses (In Transit, Delivered, etc.).
          </div>
        </div>
        <button className="btn btn-primary" disabled={savingTrack} onClick={async () => {
          setSavingTrack(true);
          try {
            await api.settings.set("trackingmore_api_key", trackApiKey.trim());
            trackKeyCache.value = undefined;
            showToast("✅ TrackingMore API key saved!");
            logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "TrackingMore API key saved", detail: null });
          } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
          finally { setSavingTrack(false); }
        }}>
          {savingTrack ? "Saving…" : "Save Tracking Key"}
        </button>
        {trackApiKey && (
          <div className="alert alert-green mt-2" style={{ fontSize: 12 }}>
            ✅ API key is set. Live tracking will show courier statuses in the Orders table.
          </div>
        )}
        {!trackApiKey && (
          <div className="alert mt-2" style={{ fontSize: 12, background: "rgba(200,255,0,.04)", border: "1px solid rgba(200,255,0,.15)", color: "var(--muted)" }}>
            No key set — tracking status will not be available. Add a free TrackingMore key above to enable it.
          </div>
        )}
      </div>

      {/* EmailJS test */}
      <EmailTestCard showToast={showToast} sectionHead={sectionHead} />
    </div>
  );
}

// ── Admin Messages ────────────────────────────────────────
const PRESET_ICONS = ["⚡","🎯","⚠️","🔥","📢","✅","❗","🎮","🏆","🛡️","💥","📅"];
const PRESET_COMBOS = [
  { label:"Lime / Black",   color:"#c8ff00", bg:"#080a06" },
  { label:"White / Dark",   color:"#ffffff", bg:"#111418" },
  { label:"Amber / Black",  color:"#ffb300", bg:"#100900" },
  { label:"Red / Dark",     color:"#ff4444", bg:"#120808" },
  { label:"Cyan / Dark",    color:"#4fc3f7", bg:"#060e12" },
  { label:"Green / Black",  color:"#4caf50", bg:"#070d07" },
  { label:"Purple / Dark",  color:"#ce93d8", bg:"#0d080f" },
  { label:"Orange / Black", color:"#ff7043", bg:"#0f0800" },
];
const emptyBanner = () => ({ text:"", color:"#c8ff00", bg:"#080a06", icon:"⚡" });

function AdminMessages({ data, save, showToast, cu }) {
  const [banners, setBanners] = useState(() => Array.isArray(data.homeMsg) && data.homeMsg.length > 0 ? data.homeMsg.map(b => ({ ...emptyBanner(), ...b })) : []);
  const [facebook, setFacebook] = useState(data.socialFacebook || "");
  const [instagram, setInstagram] = useState(data.socialInstagram || "");
  const [whatsapp, setWhatsapp] = useState(data.socialWhatsapp || "");
  const [contactAddress, setContactAddress] = useState(data.contactAddress || "");
  const [contactPhone, setContactPhone] = useState(data.contactPhone || "");
  const [contactEmail, setContactEmail] = useState(data.contactEmail || "swindonairsoftfield@gmail.com");
  const [saving, setSaving] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") { setSaving(false); setSavingSocial(false); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const [savingContact, setSavingContact] = useState(false);

  const saveBanners = async (list) => {
    setSaving(true);
    try {
      const clean = list.filter(b => b.text.trim());
      await api.settings.set("home_message", JSON.stringify(clean));
      setBanners(list);
      save({ homeMsg: clean });
      showToast(clean.length ? `${clean.length} banner${clean.length > 1 ? "s" : ""} saved!` : "Banners cleared");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Home banners updated", detail: clean.length ? `${clean.length} banner(s)` : "cleared" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const updateBanner = (i, field, val) => setBanners(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  const addBanner    = () => setBanners(prev => [...prev, emptyBanner()]);
  const removeBanner = (i) => setBanners(prev => prev.filter((_, idx) => idx !== i));
  const moveBanner   = (i, dir) => setBanners(prev => { const n = [...prev]; const swap = i + dir; if (swap < 0 || swap >= n.length) return n; [n[i], n[swap]] = [n[swap], n[i]]; return n; });

  // legacy saveMsg kept for safety
  const saveMsg = async (val) => {
    setSaving(true);
    try {
      await api.settings.set("home_message", val);
      save({ homeMsg: val ? [{ text: val, color: "#c8ff00", bg: "#080a06", icon: "⚡" }] : [] });
      showToast(val ? "Message saved!" : "Message cleared");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Site message updated", detail: val ? val.slice(0, 80) : "cleared" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSaving(false); }
  };

  const upsertSetting = (key, value) => api.settings.set(key, value);

  const saveSocial = async () => {
    setSavingSocial(true);
    try {
      const prevFacebook = data.socialFacebook || "";
      const prevInstagram = data.socialInstagram || "";
      const prevWhatsapp = data.socialWhatsapp || "";
      await upsertSetting("social_facebook", facebook);
      await upsertSetting("social_instagram", instagram);
      await upsertSetting("social_whatsapp", whatsapp);
      save({ socialFacebook: facebook, socialInstagram: instagram, socialWhatsapp: whatsapp });
      showToast("Social links saved!");
      const socDiff = diffFields(
        { facebook: prevFacebook, instagram: prevInstagram, whatsapp: prevWhatsapp },
        { facebook, instagram, whatsapp },
        { facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp" }
      );
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Social links saved", detail: socDiff || "no changes" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingSocial(false); }
  };

  const saveContact = async () => {
    setSavingContact(true);
    try {
      const prevAddress = data.contactAddress || "";
      const prevPhone = data.contactPhone || "";
      const prevEmail = data.contactEmail || "";
      await upsertSetting("contact_address", contactAddress);
      await upsertSetting("contact_phone", contactPhone);
      await upsertSetting("contact_email", contactEmail);
      save({ contactAddress, contactPhone, contactEmail });
      showToast("Contact details saved!");
      const ctDiff = diffFields(
        { address: prevAddress, phone: prevPhone, email: prevEmail },
        { address: contactAddress, phone: contactPhone, email: contactEmail },
        { address: "Address", phone: "Phone", email: "Email" }
      );
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Contact details saved", detail: ctDiff || "no changes" });
    } catch (e) {
      showToast("Save failed: " + fmtErr(e), "red");
    } finally { setSavingContact(false); }
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Site Messages</div><div className="page-sub">Ticker, social links and contact details</div></div></div>

      <div className="card mb-2">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Site Banners</div>
            <div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>Displayed at the top of the site. Each banner can have its own colour and icon.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={addBanner}>+ Add Banner</button>
        </div>

        {banners.length === 0 && (
          <div style={{ padding:"24px", textAlign:"center", border:"1px dashed #2a3a10", color:"var(--muted)", fontSize:13, marginBottom:12 }}>
            No banners active. Click <strong>+ Add Banner</strong> to create one.
          </div>
        )}

        {banners.map((banner, i) => (
          <div key={i} style={{ border:"1px solid #2a3a10", marginBottom:10, overflow:"hidden" }}>
            {/* Live preview */}
            <div style={{ background: banner.bg || "#080a06", color: banner.color || "#c8ff00", padding:"8px 16px", display:"flex", alignItems:"center", gap:8, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, letterSpacing:".1em", textTransform:"uppercase", minHeight:36 }}>
              {banner.icon && <span>{banner.icon}</span>}
              <span style={{ flex:1 }}>{banner.text || <span style={{ opacity:.4 }}>Preview — type your message below</span>}</span>
              {banner.icon && <span>{banner.icon}</span>}
            </div>
            {/* Editor */}
            <div style={{ padding:"12px 14px", background:"#0a0d08", display:"flex", flexDirection:"column", gap:10 }}>
              {/* Message text */}
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:11 }}>Message Text</label>
                <input value={banner.text} onChange={e => updateBanner(i, "text", e.target.value)} placeholder="e.g. Next event — Saturday 14th June, booking now open!" />
              </div>
              {/* Icon picker */}
              <div>
                <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:5 }}>Icon</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:6 }}>
                  {PRESET_ICONS.map(ic => (
                    <button key={ic} onClick={() => updateBanner(i, "icon", ic)} style={{ width:32, height:32, fontSize:16, border: banner.icon === ic ? "2px solid var(--accent)" : "1px solid #2a3a10", background: banner.icon === ic ? "rgba(200,255,0,.1)" : "transparent", cursor:"pointer", borderRadius:2 }}>
                      {ic}
                    </button>
                  ))}
                  <button onClick={() => updateBanner(i, "icon", "")} style={{ height:32, padding:"0 10px", fontSize:10, letterSpacing:".1em", border: !banner.icon ? "2px solid var(--accent)" : "1px solid #2a3a10", background: !banner.icon ? "rgba(200,255,0,.1)" : "transparent", cursor:"pointer", color:"var(--muted)", borderRadius:2 }}>
                    NONE
                  </button>
                </div>
              </div>
              {/* Colour presets */}
              <div>
                <label style={{ fontSize:11, color:"var(--muted)", display:"block", marginBottom:5 }}>Colour Preset</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
                  {PRESET_COMBOS.map(p => (
                    <button key={p.label} onClick={() => { updateBanner(i, "color", p.color); updateBanner(i, "bg", p.bg); }} style={{ padding:"3px 10px", fontSize:10, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".08em", border: banner.color === p.color && banner.bg === p.bg ? "2px solid var(--accent)" : "1px solid #2a3a10", background: p.bg, color: p.color, cursor:"pointer", borderRadius:2 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Custom colour pickers */}
              <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>Text colour</label>
                  <input type="color" value={banner.color || "#c8ff00"} onChange={e => updateBanner(i, "color", e.target.value)} style={{ width:36, height:28, border:"1px solid #2a3a10", background:"none", cursor:"pointer", padding:2 }} />
                  <span style={{ fontFamily:"monospace", fontSize:11, color:"var(--muted)" }}>{banner.color}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap" }}>Background</label>
                  <input type="color" value={banner.bg || "#080a06"} onChange={e => updateBanner(i, "bg", e.target.value)} style={{ width:36, height:28, border:"1px solid #2a3a10", background:"none", cursor:"pointer", padding:2 }} />
                  <span style={{ fontFamily:"monospace", fontSize:11, color:"var(--muted)" }}>{banner.bg}</span>
                </div>
              </div>
              {/* Row actions */}
              <div style={{ display:"flex", gap:8, alignItems:"center", borderTop:"1px solid #1a2808", paddingTop:8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => moveBanner(i, -1)} disabled={i === 0} title="Move up">↑</button>
                <button className="btn btn-ghost btn-sm" onClick={() => moveBanner(i,  1)} disabled={i === banners.length - 1} title="Move down">↓</button>
                <div style={{ flex:1 }} />
                <button className="btn btn-danger btn-sm" onClick={() => removeBanner(i)}>Remove</button>
              </div>
            </div>
          </div>
        ))}

        <div style={{ display:"flex", gap:8, marginTop:4 }}>
          <button className="btn btn-primary" onClick={() => saveBanners(banners)} disabled={saving}>{saving ? "Saving..." : `Save ${banners.length} Banner${banners.length !== 1 ? "s" : ""}`}</button>
          {banners.length > 0 && <button className="btn btn-danger" onClick={() => { setBanners([]); saveBanners([]); }} disabled={saving}>Clear All</button>}
        </div>

        {Array.isArray(data.homeMsg) && data.homeMsg.length > 0 && (
          <div className="alert alert-green mt-2" style={{ fontSize:11 }}>
            {data.homeMsg.length} banner{data.homeMsg.length > 1 ? "s" : ""} currently live
          </div>
        )}
      </div>

      <div className="card mb-2">
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Contact Details</div>
        <div className="form-group"><label>Address / Location</label><input value={contactAddress} onChange={e => setContactAddress(e.target.value)} placeholder="Swindon, Wiltshire, UK" /></div>
        <div className="form-group"><label>Phone Number</label><input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+44 1234 567890" /></div>
        <div className="form-group"><label>Email Address</label><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="info@swindon-airsoft.com" /></div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>Shown in the footer. Leave blank to hide a field.</div>
        <button className="btn btn-primary" onClick={saveContact} disabled={savingContact}>{savingContact ? "Saving..." : "Save Contact Details"}</button>
      </div>

      <div className="card">
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", textTransform:"uppercase" }}>Social Links</div>
        <div className="form-group"><label>Facebook URL</label><input value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="https://facebook.com/your-page" /></div>
        <div className="form-group"><label>Instagram URL</label><input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/your-account" /></div>
        <div className="form-group"><label>WhatsApp</label><input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="https://wa.me/447911123456" /><div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>Use format: https://wa.me/44XXXXXXXXXX (country code, no + or spaces)</div></div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12 }}>Icons appear in the footer. Leave blank to hide.</div>
        <button className="btn btn-primary" onClick={saveSocial} disabled={savingSocial}>{savingSocial ? "Saving..." : "Save Social Links"}</button>
      </div>
    </div>
  );
}

// ── Admin Cash Sales ──────────────────────────────────────
function AdminCash({ data, cu, showToast }) {
  const [items, setItems] = useState([]);
  const [shopProducts, setShopProducts] = useState(data.shop || []);
  const [shopLoading, setShopLoading] = useState(true);
  const [playerId, setPlayerId] = useState("manual");
  const [manual, setManual] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [diagResult, setDiagResult] = useState(null);

  // ── Payment method: "cash" | "terminal"
  const [payMethod, setPayMethod] = useState("cash");

  // ── Terminal state
  const [terminalDeviceId, setTerminalDeviceId] = useState(""); // from settings
  const [squareEnv, setSquareEnv] = useState("production");
  const [terminalCheckoutId, setTerminalCheckoutId] = useState(null); // active checkout
  const [terminalStatus, setTerminalStatus] = useState(null); // PENDING|IN_PROGRESS|COMPLETED|CANCELLED
  const [terminalPaymentId, setTerminalPaymentId] = useState(null);
  const [terminalPolling, setTerminalPolling] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const pollRef = useRef(null);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    api.shop.getAll()
      .then(list => { setShopProducts(list); setShopLoading(false); })
      .catch(() => { setShopProducts(data.shop || []); setShopLoading(false); });
    // Load terminal device ID + env from settings
    api.settings.get("square_terminal_device_id").then(v => { if (v) setTerminalDeviceId(v); }).catch(() => {});
    api.settings.get("square_env").then(v => { if (v) setSquareEnv(v); }).catch(() => {});
  }, []);

  // Clear polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const add = (item) => setItems(c => {
    const ex = c.find(x => x.id === item.id);
    return ex ? c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...item, qty: 1 }];
  });

  // Diagnostic: test if cash_sales table is reachable at all
  const runDiag = async () => {
    setDiagResult("Testing…");
    try {
      const { data: rows, error } = await supabase.from('cash_sales').select('id').limit(1);
      if (error) setDiagResult("SELECT error: " + (error.message || JSON.stringify(error)));
      else setDiagResult("SELECT ok — " + (rows?.length ?? 0) + " rows visible. Table is accessible.");
    } catch (e) {
      setDiagResult("Exception: " + e.message);
    }
  };

  // ── Invoke the square-terminal Edge Function ──────────
  const terminalInvoke = async (body) => {
    const { data: d, error } = await supabase.functions.invoke("square-terminal", {
      body: { ...body, env: squareEnv },
    });
    if (error) throw new Error(error.message || "Terminal function error");
    if (d?.error) throw new Error(d.error);
    return d;
  };

  // ── Save the completed sale to DB ─────────────────────
  const saveSaleToDB = async (squarePaymentId = null) => {
    const player = playerId !== "manual" ? data.users.find(u => u.id === playerId) : null;
    const payload = {
      customer_name:  player ? player.name : (manual.name || "Walk-in"),
      customer_email: player ? (player.email || "") : (manual.email || ""),
      user_id:        player?.id ?? null,
      items:          items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      total,
      payment_method: squarePaymentId ? "terminal" : "cash",
      square_payment_id: squarePaymentId || null,
    };
    const insertPromise = supabase.from('cash_sales').insert(payload).select();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 6000)
    );
    const { data: result, error } = await Promise.race([insertPromise, timeoutPromise]);
    if (error) {
      const msg = [error.message, error.details, error.hint].filter(Boolean).join(" | ") || JSON.stringify(error);
      throw new Error("DB Error: " + msg);
    }
    // Deduct stock
    for (const item of items) {
      await supabase.rpc('deduct_stock', { product_id: item.id, qty: item.qty });
    }
    const cashPlayer = playerId !== "manual" ? data.users?.find(u => u.id === playerId) : null;
    const cashCustomer = cashPlayer ? cashPlayer.name : (manual.name || "Walk-in");
    const cashItems = items.map(i => `${i.name} x${i.qty} (£${Number(i.price * i.qty).toFixed(2)})`).join(", ");
    const method = squarePaymentId ? "Terminal" : "Cash";
    logAction({ adminEmail: cu?.email, adminName: cu?.name, action: `${method} sale recorded`, detail: `Customer: ${cashCustomer} | Total: £${total.toFixed(2)} | Items: ${cashItems}${squarePaymentId ? ` | Square: ${squarePaymentId}` : ""}` });
  };

  const resetSale = () => {
    setItems([]);
    setManual({ name: "", email: "" });
    setPlayerId("manual");
    setLastError(null);
    setDiagResult(null);
    setTerminalCheckoutId(null);
    setTerminalStatus(null);
    setTerminalPaymentId(null);
    setTerminalPolling(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // ── Cash payment ──────────────────────────────────────
  const completeCashSale = async () => {
    if (items.length === 0) { showToast("Add items first", "red"); return; }
    setLastError(null);
    setBusy(true);
    try {
      await saveSaleToDB(null);
      showToast(`✅ Cash sale £${total.toFixed(2)} saved!`);
      resetSale();
    } catch (e) {
      const isTimed = e.message.includes("TIMEOUT");
      const msg = isTimed
        ? "Insert timed out — RLS is blocking the write. Run master-rls-admin-only.sql in Supabase SQL Editor, then click 'Test Table Access' below to confirm."
        : e.message;
      setLastError(msg);
      showToast(isTimed ? "RLS blocking insert — see error below" : "Error: " + e.message, "red");
    } finally {
      setBusy(false);
    }
  };

  // ── Terminal: send checkout to device ────────────────
  const startTerminalCheckout = async () => {
    if (items.length === 0) { showToast("Add items first", "red"); return; }
    if (!terminalDeviceId) { showToast("No Terminal Device ID configured — add it in Settings → Square", "red"); return; }
    setTerminalBusy(true);
    setLastError(null);
    setTerminalStatus("PENDING");
    setTerminalCheckoutId(null);
    setTerminalPaymentId(null);
    try {
      const locationId = await api.settings.get("square_location_id");
      const amountPence = Math.round(total * 100);
      const player = playerId !== "manual" ? data.users.find(u => u.id === playerId) : null;
      const customerName = player ? player.name : (manual.name || "Walk-in");
      const note = `Swindon Airsoft — ${customerName} — ${items.map(i => `${i.name} x${i.qty}`).join(", ")}`;
      const result = await terminalInvoke({
        action: "create",
        deviceId: terminalDeviceId,
        amount: amountPence,
        currency: "GBP",
        note: note.slice(0, 200),
        locationId,
      });
      setTerminalCheckoutId(result.checkoutId);
      setTerminalStatus(result.status || "PENDING");
      showToast("📟 Payment sent to terminal — waiting for customer…");
      // Start polling every 3 seconds
      setTerminalPolling(true);
      pollRef.current = setInterval(() => pollTerminal(result.checkoutId), 3000);
    } catch (e) {
      setTerminalStatus(null);
      setLastError("Terminal error: " + e.message);
      showToast("Terminal error: " + e.message, "red");
    } finally {
      setTerminalBusy(false);
    }
  };

  // ── Terminal: poll for status ─────────────────────────
  const pollTerminal = async (checkoutId) => {
    try {
      const result = await terminalInvoke({ action: "get", checkoutId });
      setTerminalStatus(result.status);
      if (result.status === "COMPLETED") {
        clearInterval(pollRef.current); pollRef.current = null;
        setTerminalPolling(false);
        setTerminalPaymentId(result.paymentId);
        // Save to DB with the Square payment ID
        try {
          await saveSaleToDB(result.paymentId);
          showToast(`✅ Terminal payment £${total.toFixed(2)} confirmed!`);
          resetSale();
        } catch (dbErr) {
          setLastError("Payment taken but DB save failed: " + dbErr.message);
          showToast("Payment taken but DB save failed — see error below", "red");
        }
      } else if (result.status === "CANCELLED" || result.status === "CANCEL_REQUESTED") {
        clearInterval(pollRef.current); pollRef.current = null;
        setTerminalPolling(false);
        showToast("❌ Terminal payment cancelled.", "red");
      }
    } catch { /* polling errors are non-fatal — keep trying */ }
  };

  // ── Terminal: cancel checkout ─────────────────────────
  const cancelTerminalCheckout = async () => {
    if (!terminalCheckoutId) return;
    try {
      await terminalInvoke({ action: "cancel", checkoutId: terminalCheckoutId });
      clearInterval(pollRef.current); pollRef.current = null;
      setTerminalPolling(false);
      setTerminalStatus("CANCELLED");
      showToast("Terminal payment cancelled.");
    } catch (e) {
      showToast("Cancel failed: " + e.message, "red");
    }
  };

  const terminalActive = terminalPolling || terminalStatus === "PENDING" || terminalStatus === "IN_PROGRESS";

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Cash Sales</div><div className="page-sub">Walk-in or unregistered customer sales</div></div></div>
      {lastError && (
        <div className="alert alert-red mb-2" style={{ wordBreak: "break-all", fontSize: 12 }}>
          <strong>Error:</strong> {lastError}
          <div className="mt-1">
            <button className="btn btn-sm btn-ghost" onClick={runDiag}>🔍 Test Table Access</button>
          </div>
        </div>
      )}
      {diagResult && (
        <div className="alert alert-blue mb-2" style={{ fontSize: 12, wordBreak: "break-all" }}>
          <strong>Diagnostic:</strong> {diagResult}
        </div>
      )}

      {/* ── Active terminal checkout status banner ── */}
      {terminalActive && (
        <div style={{ background:"rgba(79,195,247,.08)", border:"1px solid rgba(79,195,247,.35)", borderRadius:6, padding:"14px 18px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".08em", color:"#4fc3f7", marginBottom:4 }}>
              📟 TERMINAL CHECKOUT — {terminalStatus || "PENDING"}
            </div>
            <div style={{ fontSize:12, color:"var(--muted)" }}>
              {terminalStatus === "PENDING" && "Sending to device…"}
              {terminalStatus === "IN_PROGRESS" && "Waiting for customer to pay on the terminal…"}
              <span style={{ fontFamily:"monospace", fontSize:10, marginLeft:8, color:"#2a3a50" }}>{terminalCheckoutId}</span>
            </div>
          </div>
          <button className="btn btn-sm btn-danger" onClick={cancelTerminalCheckout}>
            ✕ Cancel
          </button>
        </div>
      )}
      {terminalStatus === "CANCELLED" && (
        <div className="alert alert-red mb-2" style={{ fontSize:12 }}>❌ Terminal payment was cancelled. You can retry or switch to cash.</div>
      )}

      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>PRODUCTS</div>
          {shopLoading && <p className="text-muted" style={{ fontSize: 13 }}>Loading products…</p>}
          {!shopLoading && shopProducts.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No products in shop yet. Add products in the Shop section.</p>}
          {!shopLoading && shopProducts.map(item => {
            const effectivePrice = item.onSale && item.salePrice ? item.salePrice : item.price;
            if (item.variants && item.variants.length > 0) {
              return (
                <div key={item.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{item.name}</div>
                  {item.variants.map(v => (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0 3px 12px" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{v.name}</span>
                      <div className="gap-2">
                        <span className="text-green" style={{ fontSize: 12 }}>£{Number(v.price).toFixed(2)}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>({v.stock})</span>
                        <button className="btn btn-sm btn-primary" onClick={() => add({ id: `${item.id}::${v.id}`, name: `${item.name} — ${v.name}`, price: Number(v.price) })}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ fontSize: 13 }}>{item.name}</span>
                  {item.onSale && item.salePrice && <span className="tag tag-red" style={{ fontSize: 9, marginLeft: 6 }}>SALE</span>}
                </div>
                <div className="gap-2">
                  <span className="text-green">£{Number(effectivePrice).toFixed(2)}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>({item.stock})</span>
                  <button className="btn btn-sm btn-primary" onClick={() => add({ id: item.id, name: item.name, price: Number(effectivePrice) })}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="card mb-2">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>CUSTOMER</div>
            <div className="form-group">
              <label>Player</label>
              <select value={playerId} onChange={e => setPlayerId(e.target.value)}>
                <option value="manual">Manual Entry (walk-in)</option>
                {data.users.filter(u => u.role === "player").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {playerId === "manual" && (
              <>
                <div className="form-group"><label>Name</label><input value={manual.name} onChange={e => setManual(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="form-group"><label>Email (optional)</label><input value={manual.email} onChange={e => setManual(p => ({ ...p, email: e.target.value }))} /></div>
              </>
            )}
          </div>
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 12 }}>SALE ITEMS</div>
            {items.length === 0 ? <p className="text-muted" style={{ fontSize: 13 }}>No items added yet</p> : (
              items.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span>{item.name} ×{item.qty}</span>
                  <div className="gap-2">
                    <span className="text-green">£{(item.price * item.qty).toFixed(2)}</span>
                    <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer" }} onClick={() => setItems(c => c.filter(x => x.id !== item.id))}>✕</button>
                  </div>
                </div>
              ))
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 22, marginTop: 12, marginBottom: 16 }}>
              <span>TOTAL</span><span className="text-green">£{total.toFixed(2)}</span>
            </div>

            {/* ── Payment method selector ── */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 8 }}>PAYMENT METHOD</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["cash", "terminal"].map(m => {
                  const isTerminal = m === "terminal";
                  const unavailable = isTerminal && !terminalDeviceId;
                  return (
                    <button key={m}
                      onClick={() => !unavailable && setPayMethod(m)}
                      title={unavailable ? "No Terminal Device ID set — go to Settings → Square" : ""}
                      style={{
                        flex: 1, padding: "10px 8px", borderRadius: 4, cursor: unavailable ? "not-allowed" : "pointer",
                        fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: ".1em",
                        textTransform: "uppercase", border: "1px solid",
                        background: payMethod === m ? (isTerminal ? "rgba(79,195,247,.15)" : "rgba(200,255,0,.12)") : "var(--card)",
                        color: unavailable ? "var(--muted)" : payMethod === m ? (isTerminal ? "#4fc3f7" : "var(--accent)") : "var(--muted)",
                        borderColor: payMethod === m ? (isTerminal ? "rgba(79,195,247,.5)" : "rgba(200,255,0,.4)") : "var(--border)",
                        opacity: unavailable ? 0.45 : 1,
                      }}>
                      {isTerminal ? "📟 Terminal" : "💵 Cash"}
                      {isTerminal && !terminalDeviceId && <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, textTransform: "none", letterSpacing: 0 }}>Not configured</div>}
                    </button>
                  );
                })}
              </div>
              {payMethod === "terminal" && terminalDeviceId && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, fontFamily: "monospace" }}>
                  Device: {terminalDeviceId} · {squareEnv}
                </div>
              )}
            </div>

            {/* ── Action buttons ── */}
            {payMethod === "cash" ? (
              <button className="btn btn-primary" style={{ width: "100%", padding: 10 }} disabled={busy || items.length === 0} onClick={completeCashSale}>
                {busy ? "Saving…" : "✓ Complete Cash Sale"}
              </button>
            ) : (
              terminalActive ? (
                <button className="btn btn-sm btn-danger" style={{ width: "100%", padding: 10 }} onClick={cancelTerminalCheckout}>
                  ✕ Cancel Terminal Payment
                </button>
              ) : (
                <button className="btn" style={{ width: "100%", padding: 10, background: "rgba(79,195,247,.15)", border: "1px solid rgba(79,195,247,.4)", color: "#4fc3f7", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: ".08em" }}
                  disabled={terminalBusy || items.length === 0} onClick={startTerminalCheckout}>
                  {terminalBusy ? "⏳ Sending…" : "📟 Send to Terminal"}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════
// ROOT APP


// ── Player Waitlist ──────────────────────────────────────
function PlayerWaitlist({ cu, showToast }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // id being removed
  const isMounted = useRef(true);

  const load = useCallback(() => {
    if (!isMounted.current) return;
    setLoading(true);
    waitlistApi.getByUser(cu.id)
      .then(data => { if (isMounted.current) setEntries(data); })
      .catch(() => {})
      .finally(() => { if (isMounted.current) setLoading(false); });
  }, [cu.id]);

  useEffect(() => {
    isMounted.current = true;
    load();
    const onVisible = () => { if (document.visibilityState === "visible" && isMounted.current) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { isMounted.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const leave = async (entry) => {
    setBusy(entry.id);
    try {
      await waitlistApi.leave({ eventId: entry.event_id, userId: cu.id, ticketType: entry.ticket_type });
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      showToast("Removed from waitlist.");
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(null); }
  };

  if (loading) return (
    <div style={{ textAlign:"center", padding:60, fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"var(--muted)" }}>Loading waitlist…</div>
  );

  if (entries.length === 0) return (
    <div style={{ textAlign:"center", padding:60 }}>
      <div style={{ fontSize:40, marginBottom:16 }}>🔔</div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".15em", color:"var(--muted)", textTransform:"uppercase" }}>No Waitlist Entries</div>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#2a3a10", marginTop:8 }}>When an event is full, click "Notify Me" to join the waitlist</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:16, fontFamily:"'Share Tech Mono',monospace" }}>
        You will be emailed automatically when a slot opens for any event below.
      </div>
      {entries.map(e => (
        <div key={e.id} className="card mb-1" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".06em", marginBottom:2 }}>
              {e.event_title || "Event"}
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)" }}>
              {e.ticket_type === "walkOn" ? "🎯 Walk-On" : "🪖 Rental"} · Added {new Date(e.created_at).toLocaleDateString("en-GB")}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ color:"var(--red)", borderColor:"rgba(220,50,50,.3)", fontSize:11 }}
            onClick={() => leave(e)} disabled={busy === e.id}>
            {busy === e.id ? "Removing…" : "✕ Leave Waitlist"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Terms & Privacy Page ──────────────────────────────────
function TermsPage({ setPage }) {
  const [activeSection, setActiveSection] = useState("terms");

  const PageHeader = () => (
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
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — LEGAL & COMPLIANCE — ◈</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
          TERMS & <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>PRIVACY</span>
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".2em", color:"#3a5010", marginTop:12 }}>▸ LAST UPDATED: {new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" }).toUpperCase()} ◂</div>
      </div>
    </div>
  );

  const SectionTitle = ({ id, children }) => (
    <div id={id} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:".15em", color:"#c8ff00", textTransform:"uppercase", marginBottom:10, marginTop:36, paddingBottom:8, borderBottom:"1px solid #1a2808", display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ color:"#3a5010" }}>▸</span> {children}
    </div>
  );

  const Para = ({ children }) => (
    <p style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#8aaa60", lineHeight:2, marginBottom:12 }}>{children}</p>
  );

  const BulletList = ({ items }) => (
    <ul style={{ listStyle:"none", padding:0, margin:"0 0 16px" }}>
      {items.map((item, i) => (
        <li key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"5px 0", fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:"#8aaa60", lineHeight:1.8 }}>
          <span style={{ color:"#c8ff00", flexShrink:0, marginTop:2 }}>▸</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  const InfoBox = ({ type, children }) => {
    const colours = { warning: { bg:"rgba(200,150,0,.08)", border:"rgba(200,150,0,.3)", text:"var(--gold)" }, info: { bg:"rgba(79,195,247,.06)", border:"rgba(79,195,247,.3)", text:"#4fc3f7" }, important: { bg:"rgba(200,255,0,.05)", border:"rgba(200,255,0,.3)", text:"#c8ff00" } };
    const c = colours[type] || colours.info;
    return (
      <div style={{ background:c.bg, border:"1px solid " + c.border, padding:"14px 18px", marginBottom:16, borderRadius:2 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:c.text, lineHeight:1.8 }}>{children}</div>
      </div>
    );
  };

  const Divider = () => (
    <div style={{ display:"flex", alignItems:"center", gap:16, margin:"32px 0" }}>
      <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#2a3a10)" }} />
      <div style={{ color:"#c8ff00", fontSize:14, opacity:.4 }}>✦</div>
      <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#2a3a10)" }} />
    </div>
  );

  const tabs = [
    { id:"terms", label:"Terms of Use" },
    { id:"bookings", label:"Bookings & Cancellations" },
    { id:"shop", label:"Shop & Orders" },
    { id:"waiver", label:"Liability Waiver" },
    { id:"privacy", label:"Privacy Policy" },
  ];

  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      <PageHeader />

      {/* Tab navigation */}
      <div style={{ background:"#0a0c08", borderBottom:"1px solid #1a2808", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ maxWidth:900, margin:"0 auto", padding:"0 16px", display:"flex", gap:0, overflowX:"auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveSection(t.id)}
              style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em", textTransform:"uppercase", padding:"14px 18px", background:"none", border:"none", borderBottom: activeSection === t.id ? "2px solid #c8ff00" : "2px solid transparent", color: activeSection === t.id ? "#c8ff00" : "#3a5010", cursor:"pointer", whiteSpace:"nowrap", transition:"color .15s" }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px 80px" }}>

        {/* ══ TERMS OF USE ══ */}
        {activeSection === "terms" && (
          <div>
            <SectionTitle id="terms-1">1. Introduction</SectionTitle>
            <Para>By accessing and using the Swindon Airsoft website and booking platform, you agree to be bound by these Terms and Conditions. These terms apply to all visitors, registered players, and anyone who makes a booking or purchase through this platform.</Para>
            <InfoBox type="important">Swindon Airsoft reserves the right to amend these terms and conditions at any time. Updated terms will be posted on this website and communicated to players as necessary. Continued use of the platform following any changes constitutes acceptance of the revised terms.</InfoBox>

            <SectionTitle id="terms-2">2. Age Requirements</SectionTitle>
            <InfoBox type="warning">Players must be at least 12 years old to participate.</InfoBox>
            <BulletList items={[
              "Players aged 12–13 must have a parent or guardian present and playing with them on the day.",
              "Players aged 14–17 must have written parental or guardian consent before attending.",
              "Players 18 and over may attend and book independently.",
              "Valid ID or consent documentation may be requested on arrival.",
              "Swindon Airsoft reserves the right to refuse entry if age requirements cannot be verified.",
            ]} />

            <SectionTitle id="terms-3">3. Code of Conduct</SectionTitle>
            <Para>All players are expected to behave in a safe, respectful, and sportsmanlike manner at all times. Failure to comply may result in removal from the field without refund.</Para>
            <BulletList items={[
              "Follow all marshal instructions immediately and without question.",
              "Call your hits honestly — this is a self-policing sport.",
              "Aggressive behaviour, abuse, or threatening conduct toward other players or staff will result in immediate removal and a permanent ban.",
              "Alcohol and illegal substances are strictly prohibited on site.",
              "All weapons must remain holstered or slung when not in the active play area.",
              "Eye protection must be worn at all times in the game zone, no exceptions.",
            ]} />

            <SectionTitle id="terms-4">4. FPS Limits & Chronographing</SectionTitle>
            <Para>All guns must meet Swindon Airsoft's FPS (Feet Per Second) limits. Every weapon will be chronographed before the game begins. Weapons exceeding the limits below will not be permitted on the field.</Para>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10, marginBottom:20 }}>
              {[
                { type:"Full Auto Rifle", fps:"350fps", weight:"0.20g", med:"No MED" },
                { type:"DMR", fps:"450fps", weight:"0.20g", med:"30m MED" },
                { type:"Bolt-Action Sniper", fps:"500fps", weight:"0.20g", med:"30m MED" },
              ].map(g => (
                <div key={g.type} style={{ background:"rgba(200,255,0,.04)", border:"1px solid #2a3a10", padding:"14px 16px" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:".1em", color:"#c8ff00", textTransform:"uppercase", marginBottom:8 }}>{g.type}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:2 }}>
                    <div>Limit: <span style={{ color:"#c8e878" }}>{g.fps} ({g.weight})</span></div>
                    <div>MED: <span style={{ color:"#c8e878" }}>{g.med}</span></div>
                  </div>
                </div>
              ))}
            </div>

            <SectionTitle id="terms-5">5. Engagement Distances</SectionTitle>
            <Para>Minimum engagement distances (MED) must be observed at all times. Players operating a DMR or bolt-action sniper rifle must carry a sidearm and switch to it when inside the MED. Marshals will brief these rules before each game.</Para>
            <BulletList items={[
              "Full Auto Rifle (350fps): No minimum engagement distance.",
              "DMR (450fps): 30 metre minimum engagement distance.",
              "Bolt-Action Sniper (500fps): 30 metre minimum engagement distance.",
            ]} />

            <SectionTitle id="terms-6">6. Personal Equipment Rules</SectionTitle>
            <BulletList items={[
              "All RIFs (Realistic Imitation Firearms) must be chronographed before play. Any weapon exceeding site FPS limits will be banned from the field for that session.",
              "Swindon Airsoft accepts no liability for loss or damage to personal equipment brought on site.",
              "All personal equipment is used entirely at the owner's risk.",
            ]} />

            <SectionTitle id="terms-7">7. Rental Equipment</SectionTitle>
            <Para>Rental equipment remains the property of Swindon Airsoft and must be returned in good working order at the end of the session. Players are responsible for rental equipment while it is in their possession.</Para>
            <InfoBox type="warning">Players must not disassemble, modify, or tamper with rented equipment in any way — this includes removing batteries.</InfoBox>
            <Para>Players will be charged for any damage or loss of rental equipment at the following rates:</Para>
            <div style={{ background:"#0a0c08", border:"1px solid #1a2808", overflow:"hidden", marginBottom:16 }}>
              {[
                ["Rifle", "£153 — replacement rifle, or cost of parts required for repair"],
                ["Goggles / Mask", "£23 — full mask replacement · £13 — visor replacement only"],
                ["Chest Rig", "£20 — repair charge for any damage"],
                ["Speedloader", "£5 — replacement"],
                ["Magazine", "£16 per replacement magazine"],
              ].map(([item, cost], i) => (
                <div key={item} style={{ display:"flex", alignItems:"flex-start", gap:16, padding:"10px 16px", background: i % 2 === 0 ? "transparent" : "rgba(200,255,0,.02)", borderBottom:"1px solid #1a2808" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, letterSpacing:".08em", color:"#c8e878", minWidth:120, flexShrink:0, textTransform:"uppercase" }}>{item}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.7 }}>{cost}</div>
                </div>
              ))}
            </div>

            <SectionTitle id="terms-8">8. VIP Membership</SectionTitle>
            <Para>VIP membership is an annual subscription providing discounts and benefits as described on the VIP page. Membership fees are non-refundable once activated. Membership is personal and non-transferable. Swindon Airsoft reserves the right to revoke VIP status for breach of these terms without refund of the membership fee. Annual membership costs £40.</Para>

            <SectionTitle id="terms-card">9. Disciplinary Card System</SectionTitle>
            <Para>Swindon Airsoft operates a three-tier disciplinary card system to maintain a safe and fair playing environment for all participants. Cards may be issued by staff on game days or by admins for conduct off the field.</Para>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12, marginBottom:20 }}>
              {[
                { color:"rgba(200,160,0,.15)", border:"rgba(200,160,0,.4)", titleColor:"var(--gold)", icon:"🟡", title:"Yellow Card — Warning", desc:"A formal warning that the player must improve their conduct. The reason is communicated directly to the player. Continued violations after a Yellow Card may result in a Red Card ban. Yellow Cards do not restrict booking." },
                { color:"rgba(220,30,30,.12)", border:"rgba(220,30,30,.4)", titleColor:"var(--red)", icon:"🔴", title:"Red Card — 1 Game Day Ban", desc:"Issued for serious rule violations or repeated misconduct after a Yellow Card. The player is banned for one game day and cannot book future events until the ban is lifted by an admin. The reason will be provided." },
                { color:"rgba(60,60,60,.25)", border:"#555", titleColor:"#ccc", icon:"⚫", title:"Black Card — Suspension", desc:"Issued for severe or repeated misconduct. The player is suspended indefinitely. Booking is disabled. Reinstatement requires a direct review and approval by the site owner. The reason will be provided." },
              ].map(c => (
                <div key={c.title} style={{ background:c.color, border:`1px solid ${c.border}`, padding:"16px", borderRadius:4 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:c.titleColor, marginBottom:8 }}>{c.icon} {c.title}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>{c.desc}</div>
                </div>
              ))}
            </div>
            <InfoBox type="important">Players who have been issued a Red Card or Black Card will be unable to make event bookings. The reason for any card issued will always be communicated to the player. To appeal a card, please contact us directly.</InfoBox>

            <SectionTitle id="terms-reporting">10. Player Reporting System</SectionTitle>
            <Para>Swindon Airsoft provides a confidential player reporting system that allows registered players to report suspected cheating or deliberate rule-breaking by other players. Reports are submitted through the player profile area and are reviewed exclusively by our admin team.</Para>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12, marginBottom:20 }}>
              {[
                { icon:"🎥", title:"Video Evidence Required", desc:"All reports must include a link to clear video evidence demonstrating deliberate hit-not-calling or cheating behaviour. Reports without adequate video evidence will be dismissed without further action." },
                { icon:"🔒", title:"Strictly Confidential", desc:"The identity of the reporting player is known only to the admin team and will never be shared with the reported player or any other players. Reporters will not receive an update on the outcome of their report." },
                { icon:"⚖️", title:"Fair Review Process", desc:"All reports are reviewed fairly and objectively by our admin team. Video evidence is examined thoroughly before any action is taken. A report does not guarantee disciplinary action." },
                { icon:"🚩", title:"False Reports", desc:"Submitting a false or malicious report is itself a breach of our Code of Conduct. Players found to have submitted dishonest reports may themselves be subject to disciplinary action including card issuance." },
              ].map(c => (
                <div key={c.title} style={{ background:"rgba(239,83,80,.07)", border:"1px solid rgba(239,83,80,.25)", padding:"16px", borderRadius:4 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"#ef9a9a", marginBottom:8 }}>{c.icon} {c.title}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>{c.desc}</div>
                </div>
              ))}
            </div>

            <InfoBox type="warning">The reporting system exists to protect the fairness and integrity of our games. It is not a means of settling personal disputes. Reports relating to off-field disputes, social media conduct, or matters unrelated to gameplay rules will not be investigated through this system — please contact us directly for other concerns.</InfoBox>

            <BulletList items={[
              "You must be a registered player and logged in to submit a report.",
              "Reports can be submitted at any time through the 🚩 Report Player tab in your profile.",
              "Only one report per incident — please do not submit duplicate reports for the same event.",
              "Video evidence must clearly show the specific incident and must be accessible via the link provided.",
              "Outcomes of investigations are confidential and will not be disclosed to the reporting player.",
              "Admins may link a report to a player profile when issuing a card warning for documentary purposes.",
              "Swindon Airsoft reserves the right to dismiss any report that does not meet evidence requirements.",
            ]} />

            <SectionTitle id="terms-9">11. Governing Law</SectionTitle>
            <InfoBox type="info">These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</InfoBox>
          </div>
        )}

        {/* ══ BOOKINGS & CANCELLATIONS ══ */}
        {activeSection === "bookings" && (
          <div>
            <SectionTitle id="booking-1">1. Booking Policy</SectionTitle>
            <Para>All event bookings are made through this platform and are confirmed upon receipt of full payment via Square. Booking confirmation and a Field Pass will be sent to your registered email address. Please bring your Field Pass (printed or on your phone) to the event.</Para>
            <BulletList items={[
              "Bookings are personal and non-transferable.",
              "Arrival at least 15 minutes before the stated event start time is required for check-in and safety briefing.",
              "Players who arrive after the safety briefing has begun may be refused entry — no refund will be issued in this circumstance.",
              "Swindon Airsoft reserves the right to cancel or reschedule events due to weather, low attendance, or circumstances beyond our control.",
              "In the event of a cancellation by Swindon Airsoft, a full refund or credit will be issued.",
            ]} />

            <SectionTitle id="booking-2">2. Cancellation Policy</SectionTitle>
            <InfoBox type="important">Cancellations are managed through your Profile → Bookings tab. You can cancel any upcoming booking that has not yet been checked in.</InfoBox>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))", gap:12, marginBottom:20 }}>
              {[
                { title:"More than 48 hours before event", icon:"✅", color:"#c8ff00", bg:"rgba(200,255,0,.05)", border:"rgba(200,255,0,.2)", items:["Walk-on bookings: full refund to original payment method", "Rental bookings: 90% refund (10% rental processing fee retained)", "Refund issued to original payment method within 3–5 business days"] },
                { title:"Within 48 hours of event", icon:"⏱", color:"var(--gold)", bg:"rgba(200,150,0,.06)", border:"rgba(200,150,0,.25)", items:["Walk-on bookings: full amount issued as Game Day Credits", "Rental bookings: 90% issued as Game Day Credits (10% fee retained)", "Credits are added to your account instantly and can be used on future bookings"] },
              ].map(box => (
                <div key={box.title} style={{ background:box.bg, border:"1px solid " + box.border, padding:16 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:".1em", color:box.color, textTransform:"uppercase", marginBottom:10 }}>{box.icon} {box.title}</div>
                  <ul style={{ listStyle:"none", padding:0, margin:0 }}>
                    {box.items.map((item, i) => (
                      <li key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"3px 0", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>
                        <span style={{ color:box.color, flexShrink:0 }}>▸</span><span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <SectionTitle id="booking-3">3. Rental Booking Fee</SectionTitle>
            <Para>A 10% processing fee is retained on all rental booking cancellations, regardless of the notice given. This covers the cost of reserving and preparing rental equipment. This fee applies to the base rental cost only and does not apply to walk-on ticket cancellations.</Para>

            <SectionTitle id="booking-4">4. Game Day Credits</SectionTitle>
            <Para>Game Day Credits are issued as a goodwill gesture for late cancellations and in certain other circumstances at Swindon Airsoft's discretion. Credits are:</Para>
            <BulletList items={[
              "Valid for use on future Swindon Airsoft event bookings only.",
              "Non-transferable and have no cash value.",
              "Applied automatically at checkout when booking your next event.",
              "Not applicable to VIP membership fees.",
              "Valid for 12 months from the date of issue — please contact us if credits are nearing expiry.",
            ]} />

            <SectionTitle id="booking-5">5. Event Cancellations by Swindon Airsoft</SectionTitle>
            <Para>In the unlikely event that Swindon Airsoft must cancel an event, all players with confirmed bookings will be notified by email as soon as possible. You will be offered either a full refund to your original payment method or the option to transfer your booking to the next available event date.</Para>
            <InfoBox type="warning">Swindon Airsoft cannot be held responsible for travel costs, accommodation, or other expenses incurred by players in connection with an event that is subsequently cancelled or rescheduled.</InfoBox>

            <SectionTitle id="booking-6">6. Event Waitlist</SectionTitle>
            <Para>When an event is fully booked, registered players can join the waitlist through the Events page. The waitlist operates in queue order — each player is offered the slot individually and given 30 minutes to complete their booking. Joining the waitlist does not constitute a booking and does not guarantee a place at the event.</Para>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,220px),1fr))", gap:12, marginBottom:20 }}>
              {[
                { icon:"🔔", title:"How It Works", desc:"When a slot opens — due to a cancellation or added capacity — the first player in the queue is notified by email and their slot is exclusively reserved for 30 minutes. If they don't book within that window, the slot is offered to the next person in line." },
                { icon:"⏱", title:"30-Minute Hold", desc:"Once notified, you have exactly 30 minutes to complete your booking. During this window the slot is locked exclusively for you — no other player can take it. After 30 minutes the slot moves to the next person on the waitlist, or opens to everyone if there is no one else waiting." },
                { icon:"📧", title:"Notification", desc:"Your notification is sent to your registered email address only. You will also see your reserved slot highlighted on the Events page while the hold is active. It is your responsibility to ensure your email is correct and not filtered to spam." },
                { icon:"🚫", title:"Eligibility", desc:"You must have a valid waiver signed for the current year to join or be offered a waitlist place. Players with a Red Card or Black Card suspension cannot join the waitlist." },
              ].map(c => (
                <div key={c.title} style={{ background:"rgba(79,195,247,.05)", border:"1px solid rgba(79,195,247,.18)", padding:"16px", borderRadius:4 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:"#4fc3f7", marginBottom:8 }}>{c.icon} {c.title}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#8aaa60", lineHeight:1.8 }}>{c.desc}</div>
                </div>
              ))}
            </div>

            <BulletList items={[
              "You can join the waitlist for both Walk-On and Rental ticket types independently.",
              "You may only hold one waitlist position per ticket type per event.",
              "You can leave the waitlist at any time via the Waitlist tab in your profile.",
              "When it is your turn, you will receive an email and your slot will appear highlighted on the Events page with a timer showing how long you have left.",
              "If you do not complete your booking within 30 minutes, your hold expires and the slot is offered to the next person on the waitlist.",
              "If there is no waitlist, a slot that opens will be available to book immediately by anyone.",
              "Being on the waitlist for one event does not affect your ability to book other events.",
              "Swindon Airsoft does not guarantee that a waitlisted player will ever receive a slot — this depends entirely on cancellations and capacity.",
              "Swindon Airsoft accepts no liability if a notification is not received due to spam filters or incorrect email details.",
            ]} />

            <InfoBox type="important">When your slot is held, you will see it marked as reserved on the Events page with a 30-minute countdown. Book before the timer runs out — once it expires the slot automatically moves to the next player in the queue.</InfoBox>
          </div>
        )}

        {/* ══ SHOP & ORDERS ══ */}
        {activeSection === "shop" && (
          <div>
            <SectionTitle id="shop-1">1. Shop Terms</SectionTitle>
            <Para>All shop purchases are processed securely via Square. Prices displayed include VAT where applicable. Swindon Airsoft reserves the right to amend prices without notice. All orders are subject to availability.</Para>

            <SectionTitle id="shop-2">2. Delivery & Postage</SectionTitle>
            <BulletList items={[
              "Standard UK postage is available on most items. Postage costs are displayed at checkout.",
              "Some items are marked 'Collection Only' and must be collected at a game day — these cannot be posted.",
              "Estimated delivery times are 3–5 working days from dispatch. Swindon Airsoft is not responsible for delays caused by Royal Mail or third-party couriers.",
              "A tracking number will be emailed once your order has been dispatched.",
              "International orders are not currently available.",
            ]} />

            <SectionTitle id="shop-3">3. Returns & Refunds</SectionTitle>
            <Para>We want you to be happy with your purchase. If you have any issue with an order, please use the return request feature on your order within 14 days of receipt. Do not send any items back until your return has been approved — unapproved returns cannot be processed.</Para>

            <InfoBox type="important">All items submitted for return must be in unused condition and in all original packaging where possible. Deductions will be made from any refund for items that have been opened, used, or are missing original packaging. The deduction amount will reflect the reduction in resale value.</InfoBox>

            <BulletList items={[
              "Faulty or incorrect items will be replaced or refunded in full, including postage costs — please include a description of the fault when submitting your return request.",
              "Change-of-mind returns are accepted within 14 days provided items are in unused condition and in their original packaging. Opened or used items may be subject to a partial refund at our discretion.",
              "BBs, gas canisters, and other consumable items are non-returnable once opened, for hygiene and safety reasons.",
              "Items showing signs of use, wear, or damage that was not present at the time of dispatch will be subject to a deduction from the refund amount.",
              "Refunds are issued to the original payment method within 5–10 business days of the return being received and inspected.",
              "Return postage costs are the responsibility of the customer unless the item is faulty or incorrect.",
              "A return reference number (RMA) is generated when you submit a request — include this on the outside of your parcel.",
            ]} />

            <SectionTitle id="shop-4">4. VIP Discounts in the Shop</SectionTitle>
            <Para>Active VIP members receive a 10% discount on all game day bookings and a 10% discount at Airsoft Armoury UK (airsoftarmoury.uk). The game day discount is applied automatically at checkout when logged in with an active VIP membership. The Airsoft Armoury UK discount is available via a code provided to VIP members.</Para>

            <InfoBox type="info">If you experience any issues with an order, please use the Contact page to get in touch. Include your order reference number for the fastest resolution.</InfoBox>
          </div>
        )}

        {/* ══ LIABILITY WAIVER ══ */}
        {activeSection === "waiver" && (
          <div>
            <InfoBox type="warning">The liability waiver must be completed once per calendar year before your first booking. It is completed digitally through your Profile page after registering an account.</InfoBox>

            <SectionTitle id="waiver-1">1. Waiver Summary</SectionTitle>
            <Para>By completing the liability waiver, you acknowledge and agree to the following key points. The full waiver text is presented during the digital signing process.</Para>

            <BulletList items={[
              "Airsoft is a physical sport and carries inherent risks of injury. You voluntarily assume these risks.",
              "You confirm you have no medical conditions that would make participation dangerous without informing site staff.",
              "You agree to wear all mandatory safety equipment, including full-seal eye protection, at all times in the game zone.",
              "You release Swindon Airsoft, its staff, and marshals from liability for injury or loss sustained during participation, except where caused by gross negligence.",
              "You confirm you are 18 or over, or that a parent/legal guardian has signed on your behalf.",
              "The waiver must be re-signed at the start of each new calendar year.",
            ]} />

            <SectionTitle id="waiver-2">2. Waiver for Minors</SectionTitle>
            <Para>Players must be at least 12 years old to participate. Players under 14 must have a parent or guardian present and playing with them, and a waiver must be completed on their behalf. Players aged 14–17 must have a parent or guardian's written consent before attending, and a waiver must be completed on their behalf. In all cases, the parent or guardian accepts full responsibility for the minor throughout the event.</Para>

            <SectionTitle id="waiver-3">3. Medical Information</SectionTitle>
            <Para>If you have any medical conditions, disabilities, or are taking medication that may affect your ability to participate safely, you must inform a marshal before the event begins. Swindon Airsoft will make reasonable efforts to accommodate participants but reserves the right to refuse participation on safety grounds.</Para>

            <InfoBox type="info">To sign or review your waiver, go to your <button onClick={() => setPage("profile")} style={{ background:"none", border:"none", color:"#c8ff00", cursor:"pointer", padding:0, fontFamily:"'Share Tech Mono',monospace", fontSize:12, textDecoration:"underline" }}>Profile → Waiver tab</button>.</InfoBox>
          </div>
        )}

        {/* ══ PRIVACY POLICY ══ */}
        {activeSection === "privacy" && (
          <div>
            <InfoBox type="info">Swindon Airsoft is committed to protecting your personal data in accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</InfoBox>

            <SectionTitle id="privacy-1">1. What Data We Collect</SectionTitle>
            <Para>We collect the following personal data when you register and use this platform:</Para>
            <BulletList items={[
              "Name, email address, and phone number provided during registration.",
              "Address details provided for shop order delivery.",
              "Date of birth (where provided) for age verification purposes.",
              "Payment references — we do not store full card details; payments are processed securely by Square.",
              "Booking history, event attendance records, and check-in data.",
              "Liability waiver data including signature, date, and confirmation of agreement.",
              "UKARA registration number (if applicable, for VIP members).",
              "Profile photograph (if uploaded by you).",
              "Communication records — contact form messages sent through this platform.",
            ]} />

            <SectionTitle id="privacy-2">2. How We Use Your Data</SectionTitle>
            <BulletList items={[
              "To process and manage your event bookings and shop orders.",
              "To send booking confirmations, dispatch notifications, and event reminders by email.",
              "To maintain your liability waiver record as required for insurance and legal compliance.",
              "To administer VIP membership, game credits, and loyalty benefits.",
              "To verify eligibility to purchase RIFs (UKARA compliance).",
              "To respond to contact form enquiries and support requests.",
              "To improve the platform and our services through anonymised analytics.",
            ]} />

            <SectionTitle id="privacy-3">3. Who We Share Data With</SectionTitle>
            <Para>We do not sell your personal data to third parties. We share data only where necessary:</Para>
            <BulletList items={[
              "Square — payment processing. Square's own privacy policy applies to payment transactions.",
              "Supabase — our secure cloud database provider, hosting data within the EU/UK.",
              "Email service providers — for sending transactional emails (booking confirmations etc.).",
              "Legal authorities — if required by law or to prevent fraud or harm.",
            ]} />

            <SectionTitle id="privacy-4">4. How Long We Keep Your Data</SectionTitle>
            <BulletList items={[
              "Account and profile data is retained for as long as your account is active.",
              "Booking and payment records are retained for 7 years for accounting and legal compliance.",
              "Waiver records are retained for a minimum of 3 years following the last participation date.",
              "Contact form messages are retained for 12 months.",
            ]} />

            <SectionTitle id="privacy-5">5. Your Rights</SectionTitle>
            <Para>Under UK GDPR you have the following rights regarding your personal data:</Para>
            <BulletList items={[
              "Right of access — you can request a copy of the data we hold about you.",
              "Right to rectification — you can correct inaccurate data through your Profile page or by contacting us.",
              "Right to erasure — you can request deletion of your account and data. Note that some records (booking history, waiver records) may need to be retained for legal compliance.",
              "Right to object — you can object to processing based on legitimate interests.",
              "Right to data portability — you can request your data in a portable format.",
            ]} />
            <Para>To exercise any of these rights, or if you have a complaint about how we handle your data, please use the Contact page. You also have the right to lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk.</Para>

            <SectionTitle id="privacy-6">6. Cookies & Analytics</SectionTitle>
            <Para>This platform uses browser session storage for functional purposes only (e.g. keeping you logged in). We do not use advertising cookies or third-party tracking. Basic anonymised analytics may be collected by our hosting provider (Vercel) — please refer to Vercel's privacy policy for details.</Para>

            <SectionTitle id="privacy-7">7. Data Controller Contact</SectionTitle>
            <InfoBox type="important">
              For any data protection queries, contact us via the <button onClick={() => setPage("contact")} style={{ background:"none", border:"none", color:"#c8ff00", cursor:"pointer", padding:0, fontFamily:"'Share Tech Mono',monospace", fontSize:12, textDecoration:"underline" }}>Contact page</button> and mark your message as "Data Protection Enquiry". We will respond within 30 days.
            </InfoBox>

            <Divider />
            <Para style={{ color:"#3a5010", fontSize:11 }}>This privacy policy was last reviewed in {new Date().toLocaleDateString("en-GB", { month:"long", year:"numeric" })}. We will notify registered users of any material changes via email.</Para>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────
export {
  AdminPanel,
  AboutPage,
  StaffPage,
  ContactPage,
  PlayerWaitlist,
  TermsPage,
};
