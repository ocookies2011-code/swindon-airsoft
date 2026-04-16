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

export default function AdminGiftVouchers({ showToast, cu }) {
  const cs = { fontFamily: "'Barlow Condensed',sans-serif" };

  const EMPTY_FORM = { recipientEmail: '', recipientName: '', purchaserName: '', amount: '', message: '', note: '' };

  const [vouchers, setVouchers]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState('vouchers');
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [disabling, setDisabling]     = useState(null);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    try {
      setLoading(true);
      const data = await api.giftVouchers.listAll();
      if (isMounted.current) setVouchers(data);
    } catch (e) {
      if (isMounted.current) showToast(fmtErr(e), 'error');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => { isMounted.current = false; };
  }, [load]);

  const handleDisable = async (v) => {
    if (!window.confirm(`Disable voucher ${v.code}? This cannot be undone.`)) return;
    setDisabling(v.id);
    try {
      await api.giftVouchers.disable(v.id);
      showToast('Voucher disabled.', 'success');
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: 'Gift voucher disabled', detail: `${v.code} | Recipient: ${v.recipient_email}` });
      load();
    } catch (e) { showToast(fmtErr(e), 'error'); }
    finally { setDisabling(null); }
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `GV-${seg()}-${seg()}-${seg()}`;
  };

  const handleCreate = async () => {
    if (!form.recipientEmail.trim()) return showToast('Recipient email is required.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recipientEmail.trim())) return showToast('Please enter a valid email address.', 'error');
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) < 1) return showToast('Amount must be at least £1.', 'error');
    setSaving(true);
    try {
      const amt = Math.round(Number(form.amount) * 100) / 100;
      const code = generateCode();
      const { error } = await supabase.from('gift_vouchers').insert({
        code,
        amount:          amt,
        balance:         amt,
        purchaser_id:    null,
        purchaser_name:  form.purchaserName.trim() || 'Admin',
        purchaser_email: cu?.email || '',
        recipient_email: form.recipientEmail.trim().toLowerCase(),
        recipient_name:  form.recipientName.trim() || null,
        message:         form.message.trim() || null,
        square_payment_id: null,
      });
      if (error) throw new Error(error.message);

      // Send email to recipient
      try {
        await sendEmail({
          toEmail:     form.recipientEmail.trim(),
          toName:      form.recipientName.trim() || form.recipientEmail.trim(),
          subject:     `🎟️ Your Swindon Airsoft Gift Voucher — £${amt.toFixed(2)}`,
          htmlContent: `
            <div style="font-family:sans-serif;max-width:600px;background:#111;color:#ddd;padding:32px;border-radius:8px;border:1px solid #2a2a2a">
              <div style="text-align:center;margin-bottom:28px">
                <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;letter-spacing:.18em;color:#e8f0d8;text-transform:uppercase">SWINDON <span style="color:#c8ff00">AIRSOFT</span></div>
                <div style="font-size:11px;letter-spacing:.2em;color:#3a5010;margin-top:4px;text-transform:uppercase">Gift Voucher</div>
              </div>
              ${form.message.trim() ? `<div style="background:#1a1a1a;border-left:3px solid #c8ff00;padding:14px 16px;margin-bottom:20px;font-style:italic;color:#bbb;font-size:14px">"${form.message.trim()}"</div>` : ''}
              <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:24px;text-align:center;margin-bottom:20px">
                <div style="font-size:11px;letter-spacing:.15em;color:#555;text-transform:uppercase;margin-bottom:8px">Voucher Value</div>
                <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:60px;color:#c8ff00;line-height:1">£${amt.toFixed(2)}</div>
                <div style="font-size:11px;color:#555;margin-top:8px">Valid on events &amp; shop orders · Unused balance carries forward</div>
              </div>
              <div style="background:#0d0d0d;border:1px solid #2a3a10;border-radius:6px;padding:20px;text-align:center;margin-bottom:24px">
                <div style="font-size:11px;letter-spacing:.15em;color:#3a5010;text-transform:uppercase;margin-bottom:10px">Your Voucher Code</div>
                <div style="font-family:'Share Tech Mono',monospace;font-size:22px;color:#c8ff00;letter-spacing:.18em">${code}</div>
              </div>
              <div style="font-size:13px;color:#888;line-height:1.7"><strong style="color:#aaa">How to use:</strong> Enter this code in the discount / voucher field at checkout when booking an event or placing a shop order. Any unused balance carries forward automatically.</div>
            </div>
          `,
        });
      } catch (emailErr) { console.warn('Gift voucher email failed:', emailErr); }

      showToast(`Voucher ${code} created and emailed.`, 'success');
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: 'Gift voucher created (admin)', detail: `${code} | £${amt} | Recipient: ${form.recipientEmail.trim()}` });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (e) { showToast(fmtErr(e), 'error'); }
    finally { setSaving(false); }
  };

  const statusOf = (v) => {
    if (v.is_disabled) return { label: 'Disabled', color: '#ef5350' };
    if (Number(v.balance) <= 0) return { label: 'Fully used', color: 'var(--muted)' };
    if (Number(v.balance) < Number(v.amount)) return { label: 'Partial', color: '#ffb74d' };
    return { label: 'Active', color: 'var(--accent)' };
  };

  const filtered = vouchers.filter(v => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      v.code?.toLowerCase().includes(q) ||
      v.recipient_email?.toLowerCase().includes(q) ||
      v.recipient_name?.toLowerCase().includes(q) ||
      v.purchaser_name?.toLowerCase().includes(q) ||
      v.purchaser_email?.toLowerCase().includes(q);
    const st = statusOf(v).label.toLowerCase();
    const matchesFilter = filterStatus === 'all' || st === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const totalIssued   = vouchers.reduce((s, v) => s + Number(v.amount), 0);
  const totalRedeemed = vouchers.reduce((s, v) => s + (Number(v.amount) - Number(v.balance)), 0);
  const totalOutstanding = vouchers.filter(v => !v.is_disabled).reduce((s, v) => s + Number(v.balance), 0);

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <h2 style={{ ...cs, fontSize:26, fontWeight:900, letterSpacing:'.06em', margin:0 }}>🎟️ GIFT VOUCHERS</h2>
        <button className="btn btn-accent" onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}>+ Issue Voucher</button>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Total Issued',      value:`£${totalIssued.toFixed(2)}`,      sub:`${vouchers.length} voucher${vouchers.length !== 1 ? 's' : ''}`, color:'#c8ff00' },
          { label:'Total Redeemed',    value:`£${totalRedeemed.toFixed(2)}`,    sub:'across all vouchers',                                           color:'#4fc3f7' },
          { label:'Outstanding Balance', value:`£${totalOutstanding.toFixed(2)}`, sub:'yet to be spent',                                             color:'#ffb74d' },
        ].map(s => (
          <div key={s.label} style={{ background:'#111', border:'1px solid #2a2a2a', padding:'16px 20px' }}>
            <div style={{ fontSize:11, letterSpacing:'.12em', color:'var(--muted)', textTransform:'uppercase', marginBottom:6, ...cs }}>{s.label}</div>
            <div style={{ fontWeight:900, fontSize:28, color:s.color, lineHeight:1, ...cs }}>{s.value}</div>
            <div style={{ fontSize:11, color:'#444', marginTop:4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background:'#111', border:'1px solid #2a3a10', borderLeft:'3px solid var(--accent)', padding:'20px 24px', marginBottom:24 }}>
          <div style={{ ...cs, fontWeight:800, fontSize:16, letterSpacing:'.08em', color:'var(--accent)', marginBottom:16, textTransform:'uppercase' }}>Issue New Voucher</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Recipient email *</label>
              <input className="input" type="email" placeholder="player@email.com"
                value={form.recipientEmail} onChange={e => setForm(f => ({ ...f, recipientEmail: e.target.value }))} style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Recipient name (optional)</label>
              <input className="input" type="text" placeholder="Their name"
                value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))} style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Amount (£) *</label>
              <input className="input" type="number" min="1" max="500" step="1" placeholder="e.g. 25"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Issued by / reason (optional)</label>
              <input className="input" type="text" placeholder="e.g. Competition prize"
                value={form.purchaserName} onChange={e => setForm(f => ({ ...f, purchaserName: e.target.value }))} style={{ width:'100%' }} />
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Personal message to include in email (optional)</label>
            <textarea className="input" rows={2} placeholder="e.g. Congratulations on winning the monthly challenge!"
              value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              style={{ width:'100%', resize:'vertical', fontFamily:'inherit', fontSize:13 }} />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-accent" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create & Email'}</button>
            <button className="btn btn-ghost" onClick={() => { setForm(EMPTY_FORM); setShowForm(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input className="input" placeholder="Search code, email, name…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:200, background:'#111a0a', border:'1px solid #2a4010', color:'#e8f8b0', fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, letterSpacing:'.08em', padding:'9px 14px' }} />
        {['all','active','partial','fully used','disabled'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ ...cs, padding:'8px 14px', fontSize:12, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', cursor:'pointer', transition:'all .15s',
              background: filterStatus === s ? 'rgba(200,255,0,.15)' : 'transparent',
              border: filterStatus === s ? '1px solid var(--accent)' : '1px solid #2a2a2a',
              color: filterStatus === s ? 'var(--accent)' : 'var(--muted)' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color:'var(--muted)', padding:40, textAlign:'center' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color:'var(--muted)', padding:40, textAlign:'center', fontSize:14 }}>No vouchers found.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(v => {
            const st = statusOf(v);
            const pct = Number(v.amount) > 0 ? (Number(v.balance) / Number(v.amount)) * 100 : 0;
            const createdDate = v.created_at ? new Date(v.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
            return (
              <div key={v.id} style={{ background:'#111', border:'1px solid #222', padding:'16px 20px', opacity: v.is_disabled ? 0.5 : 1 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                  {/* Left: code + status */}
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:15, color:'#c8ff00', letterSpacing:'.12em' }}>{v.code}</span>
                      <span style={{ ...cs, fontSize:11, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:st.color, background:`${st.color}18`, padding:'2px 8px', borderRadius:3 }}>{st.label}</span>
                      <span style={{ fontSize:11, color:'#444' }}>{createdDate}</span>
                    </div>
                    {/* Balance bar */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{ flex:1, maxWidth:200, height:5, background:'#2a2a2a', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background: pct > 50 ? 'var(--accent)' : pct > 0 ? '#ffb74d' : '#444', borderRadius:3, transition:'width .3s' }} />
                      </div>
                      <span style={{ ...cs, fontSize:13, fontWeight:900, color:'var(--accent)' }}>£{Number(v.balance).toFixed(2)}</span>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>of £{Number(v.amount).toFixed(2)}</span>
                    </div>
                    {/* Recipient + purchaser */}
                    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                      <div style={{ fontSize:12, color:'#aaa' }}>
                        <span style={{ color:'var(--muted)', marginRight:6 }}>Sent to:</span>
                        {v.recipient_name && <strong style={{ color:'#ddd', marginRight:6 }}>{v.recipient_name}</strong>}
                        <span>{v.recipient_email}</span>
                      </div>
                      <div style={{ fontSize:12, color:'#aaa' }}>
                        <span style={{ color:'var(--muted)', marginRight:6 }}>Paid by:</span>
                        {v.purchaser_name && <strong style={{ color:'#ddd', marginRight:6 }}>{v.purchaser_name}</strong>}
                        {v.purchaser_email && <span>{v.purchaser_email}</span>}
                        {!v.purchaser_name && !v.purchaser_email && <span style={{ color:'#444' }}>—</span>}
                      </div>
                      {v.message && (
                        <div style={{ fontSize:11, color:'#666', fontStyle:'italic', marginTop:2 }}>"{v.message}"</div>
                      )}
                      {v.square_payment_id && (
                        <div style={{ fontSize:11, color:'#444', marginTop:2 }}>Square: {v.square_payment_id}</div>
                      )}
                    </div>
                  </div>
                  {/* Right: actions */}
                  <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                    {!v.is_disabled && (
                      <button className="btn btn-sm btn-ghost" style={{ color:'var(--red)', borderColor:'var(--red)', fontSize:11 }}
                        disabled={disabling === v.id}
                        onClick={() => handleDisable(v)}>
                        {disabling === v.id ? '…' : 'Disable'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Admin Audit Log viewer ───────────────────────────────────
