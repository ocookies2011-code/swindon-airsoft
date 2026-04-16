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

export default function AdminRevenue({ data, save, showToast, cu }) {
  const [cashSales, setCashSales] = useState([]);
  const [shopOrders, setShopOrders] = useState([]);
  const [selected, setSelected] = useState(null); // selected transaction for detail modal
  const [monthDetail, setMonthDetail] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null); // { t: transaction, busy: false }
  const [delBusy, setDelBusy] = useState(false);
  const [notes, setNotes] = useState(''); // admin notes for selected transaction
  const [notesSaving, setNotesSaving] = useState(false);
  const [descEdit, setDescEdit] = useState(false);      // editing description/items on terminal
  const [descItems, setDescItems] = useState([]);        // editable items array for terminal
  const [descSaving, setDescSaving] = useState(false);
  const [nameEdit, setNameEdit] = useState(false);       // editing customer name
  const [nameValue, setNameValue] = useState('');        // editable name
  const [nameSaving, setNameSaving] = useState(false);

  // Transaction filter state
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [txDateFrom, setTxDateFrom] = useState(firstOfMonth);
  const [txDateTo,   setTxDateTo]   = useState(today);
  const [txSource,   setTxSource]   = useState('all'); // all | booking | shop | terminal | cash
  const [txSearch,   setTxSearch]   = useState('');
  const [txPage,     setTxPage]     = useState(1);
  const TX_PER_PAGE = 50;

  const reloadCash = () => api.cashSales.getAll().then(setCashSales).catch(console.error);

  const openTransaction = (t) => {
    setSelected(t);
    setNotes(t.adminNotes || '');
    setDescEdit(false);
    setNameEdit(false);
    setNameValue(t.userName || '');
    setDescItems(t.items?.length ? t.items.map(i => ({ name: i.name || '', qty: i.qty || 1, price: i.price || 0 })) : [{ name: '', qty: 1, price: 0 }]);
  };

  const saveName = async () => {
    if (!selected || !nameValue.trim()) return;
    setNameSaving(true);
    try {
      const table = selected.source === 'cash' ? 'cash_sales'
                  : selected.source === 'booking' ? 'bookings'
                  : 'shop_orders';
      const field = selected.source === 'booking' ? 'user_name' : 'customer_name';
      const { error } = await supabase.from(table).update({ [field]: nameValue.trim() }).eq('id', selected.id);
      if (error) throw new Error(error.message);
      const trimmed = nameValue.trim();
      setSelected(s => ({ ...s, userName: trimmed }));
      if (selected.source === 'cash') {
        setCashSales(cs => cs.map(s => s.id === selected.id ? { ...s, customer_name: trimmed } : s));
      } else if (selected.source === 'terminal' || selected.source === 'shop') {
        setShopOrders(os => os.map(o => o.id === selected.id ? { ...o, customer_name: trimmed } : o));
      }
      setNameEdit(false);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: 'Transaction customer name updated', detail: `ID: ${selected.id} | Name: ${trimmed}` });
      showToast('Name updated.', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    } finally {
      setNameSaving(false);
    }
  };

  const saveDescription = async () => {
    if (!selected) return;
    const validItems = descItems.filter(i => i.name.trim());
    if (validItems.length === 0) return;
    setDescSaving(true);
    try {
      const table = selected.source === 'terminal' || selected.source === 'shop' ? 'shop_orders' : 'cash_sales';
      const normalised = validItems.map(i => ({ name: i.name.trim(), qty: Number(i.qty) || 1, price: Number(i.price) || 0 }));
      const { error } = await supabase.from(table).update({ items: normalised }).eq('id', selected.id);
      if (error) throw new Error(error.message);
      const updatedT = { ...selected, items: normalised };
      setSelected(updatedT);
      if (selected.source === 'terminal' || selected.source === 'shop') {
        setShopOrders(os => os.map(o => o.id === selected.id ? { ...o, items: normalised } : o));
      } else {
        setCashSales(cs => cs.map(s => s.id === selected.id ? { ...s, items: normalised } : s));
      }
      setDescEdit(false);
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: 'Transaction items updated', detail: `ID: ${selected.id} | Items: ${normalised.map(i => i.name + ' ×' + i.qty).join(', ')}` });
      showToast('Items updated.', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    } finally {
      setDescSaving(false);
    }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setNotesSaving(true);
    try {
      const table = selected.source === 'cash' ? 'cash_sales'
                  : selected.source === 'booking' ? 'bookings'
                  : 'shop_orders';
      const { error } = await supabase.from(table).update({ admin_notes: notes }).eq('id', selected.id);
      if (error) throw new Error(error.message);
      // Update local state so notes persist without re-fetch
      setSelected(s => ({ ...s, adminNotes: notes }));
      if (selected.source === 'cash') {
        setCashSales(cs => cs.map(s => s.id === selected.id ? { ...s, admin_notes: notes } : s));
      } else if (selected.source === 'shop' || selected.source === 'terminal') {
        setShopOrders(os => os.map(o => o.id === selected.id ? { ...o, admin_notes: notes } : o));
      }
      showToast('Notes saved.', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    } finally {
      setNotesSaving(false);
    }
  };

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
      } else if (t.source === "shop" || t.source === "terminal") {
        const { error } = await supabase.from('shop_orders').delete().eq('id', t.id);
        if (error) throw new Error(error.message);
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
    adminNotes: b.adminNotes || '',
  })));

  const shopRevenue = shopOrders
    .filter(o => o.status !== "cancelled" && o.status !== "refunded")
    .map(o => ({
      id: o.id,
      userName: o.customer_name,
      customerEmail: o.customer_email,
      source: o.postage_name === null && Number(o.postage) === 0 && o.square_order_id ? "terminal" : "shop",
      eventTitle: o.postage_name === null && Number(o.postage) === 0 && o.square_order_id ? "Terminal Sale" : "Shop Order",
      items: Array.isArray(o.items) ? o.items : [],
      total: Number(o.total),
      subtotal: Number(o.subtotal),
      postage: Number(o.postage || 0),
      discountCode: o.discount_code || null,
      discountSaving: o.discount_saving ? Number(o.discount_saving) : null,
      date: o.created_at,
      status: o.status,
      adminNotes: o.admin_notes || '',
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
    adminNotes: s.admin_notes || '',
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

  // Format items array into a short readable string for table rows
  // Resolve full product name from shop catalogue using stored id
  // id format is either "productId" or "productId::variantId"
  const resolveItemName = (i) => {
    if (!i?.id) return i?.name || '—';
    // If variant is stored directly on the item, use it
    if (i.variant) return `${i.name} — ${i.variant}`;
    const [productId, variantId] = String(i.id).includes('::') ? String(i.id).split('::') : [i.id, null];
    const product = (data.shop || []).find(p => p.id === productId);
    if (!product) return i.name || '—';
    if (variantId) {
      const variant = (product.variants || []).find(v => v.id === variantId);
      return variant ? `${product.name} — ${variant.name}` : (i.name || product.name);
    }
    return product.name || i.name;
  };

  const fmtItems = (items) => {
    if (!items?.length) return 'No items recorded';
    const parts = items.map(i => {
      const name = resolveItemName(i);
      return `${name}${i.qty > 1 ? ` ×${i.qty}` : ''}`;
    });
    if (parts.length <= 2) return parts.join(', ');
    return parts.slice(0, 2).join(', ') + ` +${parts.length - 2} more`;
  };

  // Build detail lines for a transaction
  const getLines = (t) => {
    if (t.source === "cash") {
      return t.items.map(i => ({ name: resolveItemName(i), qty: i.qty, price: i.price, line: i.price * i.qty }));
    } else if (t.source === "shop" || t.source === "terminal") {
      return t.items.map(i => ({ name: resolveItemName(i), qty: i.qty, price: Number(i.price), line: Number(i.price) * i.qty }));
    } else {
      // Ticket line — work out ticket unit price from event
      const ev = t.eventObj || data.events.find(e => e.title === t.eventTitle);
      const unitPrice = t.type === "walkOn" ? (ev?.walkOnPrice || 0) : (ev?.rentalPrice || 0);
      const ticketLine = unitPrice * t.qty;
      const lines = [{ name: `${t.ticketType} ticket`, qty: t.qty, price: unitPrice, line: ticketLine }];
      // Extras — keys are "extraId" or "extraId:variantId"
      Object.entries(t.extras || {}).filter(([,v]) => v > 0).forEach(([key, qty]) => {
        const [extraId, variantId] = key.includes(":") ? key.split(":") : [key, null];
        // Primary: match by current event_extras ID
        let ex = t.eventExtras?.find(e => e.id === extraId);
        // Fallback 1: try extraId as a productId in shop (handles stale IDs)
        let lp = ex ? (data.shop || []).find(p => p.id === ex.productId) : (data.shop || []).find(p => p.id === extraId);
        // Fallback 2: try matching via variantId
        if (!lp && variantId) lp = (data.shop || []).find(p => (p.variants || []).some(vv => vv.id === variantId));
        const selectedVariant = variantId ? lp?.variants?.find(vv => vv.id === variantId) : null;
        // Fallback 3: match event extra by productId
        if (!ex && lp) ex = t.eventExtras?.find(e => e.productId === lp.id);
        let label;
        if (ex) { label = selectedVariant ? `${ex.name} — ${selectedVariant.name}` : ex.name; }
        else if (lp) { label = selectedVariant ? `${lp.name} — ${selectedVariant.name}` : lp.name; }
        else { label = extraId; }
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
          { label: "Shop Orders", val: `£${shopRevenue.filter(o=>o.source==="shop").reduce((s,o)=>s+o.total,0).toFixed(2)}`, color: "teal" },
          { label: "Terminal Sales", val: `£${shopRevenue.filter(o=>o.source==="terminal").reduce((s,o)=>s+o.total,0).toFixed(2)}`, color: "green" },
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

      {/* All transactions — filtered */}
      {(() => {
        const fromMs = txDateFrom ? new Date(txDateFrom).getTime() : 0;
        const toMs   = txDateTo   ? new Date(txDateTo + 'T23:59:59').getTime() : Infinity;
        const q = txSearch.trim().toLowerCase();
        const filtered = all.filter(t => {
          const tMs = new Date(t.date).getTime();
          if (tMs < fromMs || tMs > toMs) return false;
          if (txSource !== 'all' && t.source !== txSource) return false;
          if (q && !(
            t.userName?.toLowerCase().includes(q) ||
            t.eventTitle?.toLowerCase().includes(q) ||
            t.customerEmail?.toLowerCase().includes(q) ||
            t.id?.toLowerCase().includes(q)
          )) return false;
          return true;
        });
        const totalPages = Math.max(1, Math.ceil(filtered.length / TX_PER_PAGE));
        const safePage   = Math.min(txPage, totalPages);
        const pageRows   = filtered.slice((safePage - 1) * TX_PER_PAGE, safePage * TX_PER_PAGE);
        const filteredTotal = filtered.reduce((s, t) => s + t.total, 0);
        return (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Transactions</div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <label style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>From</label>
                <input type="date" value={txDateFrom} onChange={e => { setTxDateFrom(e.target.value); setTxPage(1); }}
                  style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", padding: "6px 10px", fontSize: 12, borderRadius: 3, outline: "none" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <label style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>To</label>
                <input type="date" value={txDateTo} onChange={e => { setTxDateTo(e.target.value); setTxPage(1); }}
                  style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", padding: "6px 10px", fontSize: 12, borderRadius: 3, outline: "none" }} />
              </div>
              <select value={txSource} onChange={e => { setTxSource(e.target.value); setTxPage(1); }}
                style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", padding: "6px 10px", fontSize: 12, borderRadius: 3, outline: "none", cursor: "pointer" }}>
                <option value="all">All sources</option>
                <option value="booking">🌐 Online Bookings</option>
                <option value="shop">🛒 Shop Orders</option>
                <option value="terminal">🖥 Terminal</option>
                <option value="cash">💵 Cash Sales</option>
              </select>
              <input value={txSearch} onChange={e => { setTxSearch(e.target.value); setTxPage(1); }}
                placeholder="Search name, event, email…"
                style={{ flex: 1, minWidth: 160, background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", padding: "6px 10px", fontSize: 12, borderRadius: 3, outline: "none" }} />
              <button className="btn btn-sm btn-ghost" onClick={() => { setTxDateFrom(firstOfMonth); setTxDateTo(today); setTxSource('all'); setTxSearch(''); setTxPage(1); }}>Reset</button>
            </div>

            {/* Quick date presets */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                { label: "Today",      from: today, to: today },
                { label: "This week",  from: new Date(Date.now() - 6*86400000).toISOString().slice(0,10), to: today },
                { label: "This month", from: firstOfMonth, to: today },
                { label: "Last month", from: (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10); })(),
                                        to:   (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0,10); })() },
                { label: "This year",  from: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10), to: today },
                { label: "All time",   from: '', to: '' },
              ].map(p => (
                <button key={p.label} className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, padding: "3px 10px", background: txDateFrom === p.from && txDateTo === p.to ? "var(--accent)" : undefined, color: txDateFrom === p.from && txDateTo === p.to ? "#000" : undefined }}
                  onClick={() => { setTxDateFrom(p.from); setTxDateTo(p.to); setTxPage(1); }}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Summary for current filter */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>£{filteredTotal.toFixed(2)} total</span>
              {totalPages > 1 && <span style={{ fontSize: 12, color: "var(--muted)" }}>Page {safePage} of {totalPages}</span>}
            </div>

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
                {pageRows.map(t => (
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => openTransaction(t)}>
                    <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{gmtFull(t.date)}</td>
                    <td style={{ fontWeight: 600 }}>{t.userName}</td>
                    <td style={{ maxWidth: 260 }}>
                      {t.source === "cash" || t.source === "terminal" || t.source === "shop"
                        ? <span title={t.items?.map(i => `${resolveItemName(i)} ×${i.qty}`).join(', ')}>{fmtItems(t.items)}</span>
                        : (() => {
                            const extrasCount = Object.values(t.extras || {}).filter(v => v > 0).length;
                            return `${t.eventTitle} — ${t.ticketType} ×${t.qty}${extrasCount ? ` + ${extrasCount} extra${extrasCount > 1 ? "s" : ""}` : ""}`;
                          })()
                      }
                    </td>
                    <td>
                      <span className={`tag ${t.source === "cash" ? "tag-gold" : t.source === "shop" || t.source === "terminal" ? "tag-teal" : "tag-blue"}`}>
                        {t.source === "cash" ? "💵 Cash" : t.source === "shop" ? "🛒 Shop" : t.source === "terminal" ? "🖥 Terminal" : "🌐 Online"}
                      </span>
                    </td>
                    <td className="text-green" style={{ fontWeight: 700 }}>£{t.total.toFixed(2)}</td>
                    <td onClick={e => e.stopPropagation()} style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {t.adminNotes && <span title={t.adminNotes} style={{ fontSize:10, background:"rgba(200,255,0,.15)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", padding:"1px 6px", borderRadius:2, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, letterSpacing:".05em", whiteSpace:"nowrap" }}>📝 NOTE</span>}
                        <button className="btn btn-sm btn-ghost" onClick={() => openTransaction(t)}>Detail →</button>
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => setDelConfirm(t)} title="Delete transaction">✕</button>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>
                    {all.length === 0 ? "No transactions yet" : "No transactions match the current filters"}
                  </td></tr>
                )}
              </tbody>
            </table></div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                <button className="btn btn-sm btn-ghost" disabled={safePage === 1} onClick={() => setTxPage(1)}>«</button>
                <button className="btn btn-sm btn-ghost" disabled={safePage === 1} onClick={() => setTxPage(p => Math.max(1, p - 1))}>‹ Prev</button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                  const p = start + i;
                  return p <= totalPages ? (
                    <button key={p} className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-ghost"}`} onClick={() => setTxPage(p)}>{p}</button>
                  ) : null;
                })}
                <button className="btn btn-sm btn-ghost" disabled={safePage === totalPages} onClick={() => setTxPage(p => Math.min(totalPages, p + 1))}>Next ›</button>
                <button className="btn btn-sm btn-ghost" disabled={safePage === totalPages} onClick={() => setTxPage(totalPages)}>»</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Transaction detail modal */}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {selected.source === "cash" ? "💵 Cash Sale" : selected.source === "shop" ? "🛒 Shop Order" : selected.source === "terminal" ? "🖥 Terminal Sale" : "🌐 Online Booking"} — Detail
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,180px),1fr))", gap: 8, marginBottom: 16 }}>
              {/* Customer chip — editable for terminal/cash/shop */}
              <div style={{ background: "var(--bg3)", borderRadius: 6, padding: "8px 12px" }}>
                <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 4 }}>CUSTOMER</div>
                {nameEdit ? (
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <input className="input" value={nameValue} onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setNameEdit(false); }}
                      style={{ flex:1, fontSize:13, padding:"4px 8px" }} autoFocus />
                    <button className="btn btn-sm btn-primary" onClick={saveName} disabled={nameSaving || !nameValue.trim()} style={{ padding:"4px 10px", fontSize:11 }}>{nameSaving ? "…" : "✓"}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setNameEdit(false)} style={{ padding:"4px 10px", fontSize:11 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.userName || "—"}</span>
                    {selected.source !== "booking" && (
                      <button onClick={() => setNameEdit(true)} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:11, padding:0, lineHeight:1 }} title="Edit name">✏</button>
                    )}
                  </div>
                )}
              </div>
              {[
                ["Date & Time (GMT)", gmtFull(selected.date)],
                ["Source", selected.source === "cash" ? "Cash Sale" : selected.source === "shop" ? "Shop Order" : selected.source === "terminal" ? "Terminal Sale" : "Online Booking"],
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

            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: ".05em", color: "var(--muted)" }}>ITEMS</div>
              {(selected.source === "terminal" || selected.source === "cash" || selected.source === "shop") && !descEdit && (
                <button className="btn btn-sm btn-ghost" onClick={() => setDescEdit(true)} style={{ fontSize: 11 }}>✏ Edit Items</button>
              )}
            </div>

            {descEdit ? (
              <div style={{ marginBottom: 16 }}>
                {descItems.map((item, i) => (
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 80px 100px 32px", gap:6, marginBottom:6 }}>
                    <input className="input" placeholder="Item name" value={item.name}
                      onChange={e => setDescItems(di => di.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      style={{ fontSize: 13 }} />
                    <input className="input" type="number" placeholder="Qty" min="1" value={item.qty}
                      onChange={e => setDescItems(di => di.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                      style={{ fontSize: 13 }} />
                    <input className="input" type="number" placeholder="Price £" min="0" step="0.01" value={item.price}
                      onChange={e => setDescItems(di => di.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                      style={{ fontSize: 13 }} />
                    <button onClick={() => setDescItems(di => di.filter((_, j) => j !== i))}
                      style={{ background:"none", border:"1px solid var(--border)", color:"var(--red)", cursor:"pointer", borderRadius:3, fontSize:14, lineHeight:1 }}>✕</button>
                  </div>
                ))}
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDescItems(di => [...di, { name:'', qty:1, price:0 }])}>+ Add Item</button>
                  <button className="btn btn-sm btn-primary" onClick={saveDescription} disabled={descSaving}>{descSaving ? "Saving…" : "Save Items"}</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDescEdit(false)}>Cancel</button>
                </div>
              </div>
            ) : (
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
                  {getLines(selected).length === 0 && (
                    <tr><td colSpan={4} style={{ color:"var(--muted)", textAlign:"center", padding:16, fontSize:12 }}>
                      No item details recorded — click Edit Items to add them.
                    </td></tr>
                  )}
                </tbody>
              </table></div>
            )}

            {/* Admin notes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: ".05em", color: "var(--muted)" }}>ADMIN NOTES</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add internal notes about this transaction (not visible to the customer)…"
                rows={3}
                style={{ width: "100%", background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", padding: "10px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
              <button className="btn btn-sm btn-primary" onClick={saveNotes} disabled={notesSaving} style={{ marginTop: 8 }}>
                {notesSaving ? "Saving…" : "Save Notes"}
              </button>
            </div>

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
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => { setMonthDetail(null); openTransaction(t); }}>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{gmtFull(t.date)}</td>
                    <td>{t.userName}</td>
                    <td style={{ maxWidth: 240 }}>
                      {t.source === "cash" || t.source === "terminal" || t.source === "shop"
                        ? <span title={t.items?.map(i => `${resolveItemName(i)} ×${i.qty}`).join(', ')}>{fmtItems(t.items)}</span>
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
