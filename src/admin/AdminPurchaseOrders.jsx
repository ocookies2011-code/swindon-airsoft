// admin/AdminPurchaseOrders.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtDate, gmtShort, uid } from "../utils";
import { logAction } from "./adminHelpers";

function AdminPurchaseOrders({ data, save, showToast, cu }) {
  const [tab, setTab] = useState("orders"); // "orders" | "suppliers"
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [poModal, setPoModal] = useState(null);     // null | "new" | order obj
  const [supModal, setSupModal] = useState(null);   // null | "new" | supplier obj
  const [detailModal, setDetailModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ supplierId: "", notes: "", items: [] });
  const [editNewItem, setEditNewItem] = useState({ productId: "", variantId: "", productName: "", qtyOrdered: 1, unitCost: "" });
  const [busy, setBusy] = useState(false);
  const [poForm, setPoForm] = useState(blankPo);
  const [newItem, setNewItem] = useState({ productId: "", variantId: "", productName: "", qtyOrdered: 1, unitCost: "" });
  const [supForm, setSupForm] = useState(blankSup);
  const [receiveQtys, setReceiveQtys] = useState({});
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setBusy(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // New PO form state
  const blankPo = { supplierId: "", notes: "", items: [] };

  // Supplier form state
  const blankSup = { name: "", contact: "", email: "", phone: "", notes: "" };

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

  // ── Edit PO ──
  const openEdit = (order) => {
    setEditForm({
      supplierId: order.supplier_id || "",
      notes: order.notes || "",
      items: order.items.map(i => ({
        id: i.id,
        productId:    i.product_id    ?? i.productId    ?? null,
        productName:  i.product_name  ?? i.productName  ?? "",
        supplierCode: i.supplier_code ?? i.supplierCode ?? "",
        qtyOrdered:   i.qty_ordered   ?? i.qtyOrdered   ?? 1,
        unitCost:     i.unit_cost     ?? i.unitCost     ?? 0,
      })),
    });
    setEditNewItem({ productId: "", variantId: "", productName: "", qtyOrdered: 1, unitCost: "" });
    setEditModal(order);
  };

  const editPoTotal = editForm.items.reduce((s, i) => s + (Number(i.qtyOrdered) * Number(i.unitCost)), 0);

  const addEditPoItem = () => {
    if (!editNewItem.productName.trim() && !editNewItem.productId) { showToast("Select a product or enter a name", "red"); return; }
    const product = editNewItem.productId ? (data.shop || []).find(p => p.id === editNewItem.productId) : null;
    const variant = product && editNewItem.variantId ? product.variants?.find(v => v.id === editNewItem.variantId) : null;
    const hasVariants = product?.variants?.length > 0;
    if (hasVariants && !editNewItem.variantId) { showToast("Please select a variant", "red"); return; }
    const displayName = product ? (variant ? product.name + " — " + variant.name : product.name) : editNewItem.productName;
    const costPrice = variant?.costPrice ?? variant?.price ?? product?.costPrice ?? Number(editNewItem.unitCost) ?? 0;
    const supplierCode = variant?.supplierCode || product?.supplierCode || "";
    setEditForm(prev => ({ ...prev, items: [...prev.items, {
      id: Math.random().toString(36).slice(2),
      productId: editNewItem.productId || null,
      variantId: editNewItem.variantId || null,
      productName: displayName,
      supplierCode,
      qtyOrdered: Number(editNewItem.qtyOrdered) || 1,
      unitCost: Number(editNewItem.unitCost) || costPrice || 0,
    }]}));
    setEditNewItem({ productId: "", variantId: "", productName: "", qtyOrdered: 1, unitCost: "" });
  };

  const removeEditPoItem = (id) => setEditForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));

  const updateEditPoItem = (id, field, value) => {
    setEditForm(prev => ({ ...prev, items: prev.items.map(i => i.id === id ? { ...i, [field]: value } : i) }));
  };

  const saveEdit = async () => {
    if (!editForm.items.length) { showToast("Add at least one item", "red"); return; }
    const sup = suppliers.find(s => s.id === editForm.supplierId);
    setBusy(true);
    try {
      // Merge edits back into the original items array, preserving qty_received and id
      const updatedItems = editForm.items.map(i => {
        const orig = editModal.items.find(o => o.id === i.id);
        return {
          id:            i.id,
          productId:     i.productId || null,
          productName:   i.productName,
          supplierCode:  i.supplierCode || "",
          qtyOrdered:    Number(i.qtyOrdered) || 1,
          unitCost:      Number(i.unitCost) || 0,
          // Preserve whatever was already received
          qtyReceived:   orig?.qtyReceived ?? orig?.qty_received ?? 0,
        };
      });

      const { error: poErr } = await supabase
        .from("purchase_orders")
        .update({
          supplier_id:   editForm.supplierId || null,
          supplier_name: sup ? sup.name : (editModal.supplier_name || ""),
          notes:         editForm.notes,
          total:         editPoTotal,
          items:         updatedItems,
        })
        .eq("id", editModal.id);
      if (poErr) throw poErr;

      showToast("Purchase order updated!");
      const poItemList = editForm.items.map(i => `${i.productName} x${i.qtyOrdered} @ £${Number(i.unitCost).toFixed(2)}`).join(", ");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Purchase order edited", detail: `PO #${editModal.id.slice(-6).toUpperCase()} | Total: £${editPoTotal.toFixed(2)} | Items: ${poItemList}` });
      await loadAll();
      setEditModal(null);
    } catch (e) { showToast("Failed: " + e.message, "red"); }
    finally { setBusy(false); }
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
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(o)}>✏️ Edit</button>
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

      {/* ── Edit PO Modal ── */}
      {editModal && (
        <div className="overlay" onClick={() => setEditModal(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{maxWidth:700}}>
            <div className="modal-title">✏️ Edit Purchase Order — PO-{editModal.id.slice(-6).toUpperCase()}</div>

            <div className="grid-2 mb-2">
              <div className="form-group">
                <label>Supplier</label>
                <select value={editForm.supplierId} onChange={e => setEditForm(p => ({...p, supplierId: e.target.value}))}
                  style={{fontSize:13, padding:"6px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:3, width:"100%"}}>
                  <option value="">— No Supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notes <span style={{fontWeight:400,color:"var(--muted)"}}>(optional)</span></label>
                <input value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} placeholder="e.g. Urgent restock" />
              </div>
            </div>

            <div style={{fontSize:12, fontWeight:700, color:"var(--muted)", letterSpacing:".1em", marginBottom:10}}>ORDER ITEMS</div>

            {editForm.items.length > 0 && (
              <div className="table-wrap" style={{marginBottom:14}}><table className="data-table">
                <thead><tr><th>Product</th><th>Supplier Code</th><th>Qty</th><th>Unit Cost £</th><th>Line Total</th><th></th></tr></thead>
                <tbody>
                  {editForm.items.map(i => (
                    <tr key={i.id}>
                      <td><input value={i.productName} onChange={e => updateEditPoItem(i.id, "productName", e.target.value)} style={{fontSize:12, minWidth:140}} /></td>
                      <td><input value={i.supplierCode} onChange={e => updateEditPoItem(i.id, "supplierCode", e.target.value)} style={{fontSize:11, width:90, fontFamily:"'Share Tech Mono',monospace"}} placeholder="—" /></td>
                      <td><input type="number" min="1" value={i.qtyOrdered} onChange={e => updateEditPoItem(i.id, "qtyOrdered", e.target.value)} style={{fontSize:12, width:70}} /></td>
                      <td><input type="number" min="0" step="0.01" value={i.unitCost} onChange={e => updateEditPoItem(i.id, "unitCost", e.target.value)} style={{fontSize:12, width:90}} /></td>
                      <td className="text-green" style={{fontFamily:"'Share Tech Mono',monospace", fontSize:12, fontWeight:700}}>£{(Number(i.qtyOrdered) * Number(i.unitCost)).toFixed(2)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => removeEditPoItem(i.id)}>✕</button></td>
                    </tr>
                  ))}
                  <tr style={{borderTop:"2px solid var(--border)"}}>
                    <td colSpan={3} style={{fontWeight:900, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:".08em", fontSize:13}}>TOTAL</td>
                    <td colSpan={2} className="text-green" style={{fontWeight:900, fontFamily:"'Share Tech Mono',monospace", fontSize:13}}>£{editPoTotal.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table></div>
            )}

            <div style={{fontSize:11, fontWeight:700, color:"var(--muted)", letterSpacing:".1em", marginBottom:8}}>ADD ITEM</div>
            <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14, padding:"12px", background:"var(--bg4)", borderRadius:3, border:"1px solid var(--border)"}}>
              <div style={{flex:"2 1 160px"}}>
                <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>PRODUCT</div>
                <select value={editNewItem.productId} onChange={e => {
                  const prod = (data.shop||[]).find(p => p.id === e.target.value);
                  setEditNewItem(n => ({...n, productId: e.target.value, variantId: "", productName: prod ? prod.name : "", unitCost: prod?.costPrice && !prod?.variants?.length ? String(prod.costPrice) : n.unitCost}));
                }} style={{fontSize:12, padding:"5px 8px", background:"#1a1a1a", border:"1px solid var(--border)", color:"#fff", borderRadius:2, width:"100%"}}>
                  <option value="">— Pick shop product —</option>
                  {(data.shop||[]).map(p => <option key={p.id} value={p.id}>{p.name}{p.variants?.length > 0 ? ` (${p.variants.length} variants)` : ""}</option>)}
                </select>
                {editNewItem.productId && (data.shop||[]).find(p => p.id === editNewItem.productId)?.variants?.length > 0 && (
                  <select value={editNewItem.variantId} onChange={e => {
                    const prod = (data.shop||[]).find(p => p.id === editNewItem.productId);
                    const v = prod?.variants?.find(v => v.id === e.target.value);
                    setEditNewItem(n => ({...n, variantId: e.target.value, unitCost: v?.costPrice ? String(v.costPrice) : (v?.price ? String(v.price) : n.unitCost)}));
                  }} style={{fontSize:12, padding:"5px 8px", background:"#1a1a1a", border:"1px solid var(--accent)", color:"#fff", borderRadius:2, width:"100%", marginTop:6}}>
                    <option value="">— Select variant —</option>
                    {(data.shop||[]).find(p => p.id === editNewItem.productId)?.variants?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
                <div style={{fontSize:10, color:"var(--muted)", marginTop:3}}>or free text:</div>
                <input value={editNewItem.productName} onChange={e => setEditNewItem(n => ({...n, productName: e.target.value, productId: "", variantId: ""}))} placeholder="Product name" style={{fontSize:12, marginTop:4}} />
              </div>
              <div style={{flex:"0 0 80px"}}>
                <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>QTY</div>
                <input type="number" min="1" value={editNewItem.qtyOrdered} onChange={e => setEditNewItem(n => ({...n, qtyOrdered: e.target.value}))} style={{fontSize:12}} />
              </div>
              <div style={{flex:"0 0 100px"}}>
                <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>UNIT COST £</div>
                <input type="number" min="0" step="0.01" value={editNewItem.unitCost} onChange={e => setEditNewItem(n => ({...n, unitCost: e.target.value}))} style={{fontSize:12}} />
              </div>
              <div style={{flex:"0 0 auto", display:"flex", alignItems:"flex-end"}}>
                <button className="btn btn-primary btn-sm" onClick={addEditPoItem}>+ Add</button>
              </div>
            </div>

            <div className="gap-2">
              <button className="btn btn-primary" onClick={saveEdit} disabled={busy || !editForm.items.length}>{busy ? "Saving…" : "Save Changes"}</button>
              <button className="btn btn-ghost" onClick={() => setEditModal(null)}>Cancel</button>
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



export { AdminPurchaseOrders };
