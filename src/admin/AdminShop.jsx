// admin/AdminShop.jsx — shop product management
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtErr, renderMd, stockLabel, uid, useMobile } from "../utils";
import { diffFields, logAction } from "./adminHelpers";
import { AdminOrdersInline } from "./AdminOrders";

function AdminShop({ data, save, showToast, cu }) {
  const getInitTab = () => {
    const p = window.location.hash.replace("#","").split("/");
    return p[0]==="admin" && p[1]==="shop" && ["products","postage","orders"].includes(p[2]) ? p[2] : "products";
  };
  const [tab, setTabState] = useState(getInitTab);
  const setTab = (t) => { setTabState(t); window.location.hash = "admin/shop/" + t; };

  // Live pending order count for the Orders tab badge
  const [orderCount, setOrderCount] = useState(0);
  useEffect(() => {
    const fetch = () =>
      supabase.from("shop_orders").select("id", { count: "exact", head: true })
        .not("status", "in", "(completed,cancelled)")
        .then(({ count }) => setOrderCount(count || 0))
        .catch(() => {});
    fetch();
    const interval = setInterval(fetch, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") fetch(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  const [modal, setModal] = useState(null);
  const uid = () => Math.random().toString(36).slice(2,10);
  const blank = { name: "", description: "", price: 0, salePrice: null, onSale: false, image: "", images: [], stock: 0, noPost: false, gameExtra: false, hiddenFromShop: false, costPrice: null, category: "", supplierCode: "", variants: [] };

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

  // Collapsed category state - all collapsed by default
  const [collapsedCats, setCollapsedCats] = useState(() => {
    // Pre-collapse all categories including uncategorised on first render
    const initial = { "__none": true };
    return initial;
  });
  // When categories load, ensure all are collapsed
  const allCatKeys = useMemo(() => {
    const cats = [...new Set(shopOrder.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [shopOrder]);
  // Keep new categories collapsed as they appear
  React.useEffect(() => {
    setCollapsedCats(prev => {
      const next = { ...prev };
      allCatKeys.forEach(c => { if (!(c in next)) next[c] = true; });
      if (!("__none" in next)) next["__none"] = true;
      return next;
    });
  }, [allCatKeys]);
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
      syncToSquare("delete", delProductConfirm);
      save({ shop: await api.shop.getAll() });
      showToast("Product deleted");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Product deleted", detail: delProductConfirm.name || delProductConfirm.id });
      setDelProductConfirm(null);
    } catch (e) { showToast("Delete failed: " + e.message, "red"); }
    finally { setDeletingProduct(false); }
  };

  const [savingProduct, setSavingProduct] = useState(false);
  const [squareSyncStatus, setSquareSyncStatus] = useState(null); // null|"syncing"|"ok"|"error"
  const [bulkSyncing, setBulkSyncing] = useState(false);

  // ── Sync single product to Square (background, non-blocking) ──
  const syncToSquare = async (action, product) => {
    setSquareSyncStatus("syncing");
    try {
      const { data: result, error } = await supabase.functions.invoke("square-catalog-sync", {
        body: { action, product },
      });
      if (error || !result?.ok) throw new Error(error?.message || result?.error || "Sync failed");
      setSquareSyncStatus("ok");
      setTimeout(() => setSquareSyncStatus(null), 4000);
    } catch (e) {
      console.warn("Square sync failed:", e.message);
      setSquareSyncStatus("error");
      setTimeout(() => setSquareSyncStatus(null), 8000);
    }
  };

  // ── Cleanup Square duplicates then bulk re-sync all products ──
  const runCleanupAndSync = async () => {
    if (!window.confirm("This will DELETE all items from your Square Terminal and re-sync from your website. Continue?")) return;
    setBulkSyncing(true);
    setSquareSyncStatus("syncing");
    try {
      const { data: cleanResult, error: cleanErr } = await supabase.functions.invoke("square-catalog-sync", {
        body: { action: "cleanup" },
      });
      if (cleanErr || !cleanResult?.ok) throw new Error(cleanErr?.message || cleanResult?.error || "Cleanup failed");
      await supabase.from("shop_products").update({ square_catalog_id: null, square_variation_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");
      const freshShop = await api.shop.getAll();
      const { data: syncResult, error: syncErr } = await supabase.functions.invoke("square-catalog-sync", {
        body: { action: "bulk-sync", products: freshShop },
      });
      if (syncErr || !syncResult?.ok) throw new Error(syncErr?.message || syncResult?.error || "Bulk sync failed");
      const failed = syncResult.results?.filter((r) => !r.ok) || [];
      if (failed.length > 0) {
        setSquareSyncStatus("error");
        showToast(`Sync done — ${failed.length} product(s) failed. Check Edge Function logs.`, "red");
      } else {
        setSquareSyncStatus("ok");
        showToast(`✅ All ${freshShop.length} products synced to Square Terminal!`);
        save({ shop: await api.shop.getAll() });
      }
      setTimeout(() => setSquareSyncStatus(null), 5000);
    } catch (e) {
      setSquareSyncStatus("error");
      showToast("Sync failed: " + e.message, "red");
      setTimeout(() => setSquareSyncStatus(null), 8000);
    } finally {
      setBulkSyncing(false);
    }
  };

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
      // Use form data for Square sync — it has full variant images in memory
      // freshShop may have images truncated by Supabase response size limits
      const dbProduct = modal === "new"
        ? freshShop.find(p => p.name === form.name)
        : freshShop.find(p => p.id === form.id);
      const syncProduct = {
        ...form,
        id: dbProduct?.id || form.id,
        // Prefer DB square IDs (most up to date) over form state
        square_catalog_id:   dbProduct?.square_catalog_id   || form.square_catalog_id   || null,
        square_variation_id: dbProduct?.square_variation_id || form.square_variation_id || null,
        // Merge square_variation_id onto variants from DB if available
        variants: (form.variants || []).map(v => {
          const dbVariant = dbProduct?.variants?.find(dv => dv.id === v.id);
          return { ...v, square_variation_id: dbVariant?.square_variation_id || v.square_variation_id || null };
        }),
      };
      syncToSquare("upsert", syncProduct);
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
        <div>
          <div className="page-title">Shop</div>
          {squareSyncStatus === "syncing" && <div style={{ fontSize:11, color:"#4fc3f7", marginTop:3 }}>⏳ Syncing to Square…</div>}
          {squareSyncStatus === "ok"      && <div style={{ fontSize:11, color:"#81c784", marginTop:3 }}>✓ Synced to Square Terminal</div>}
          {squareSyncStatus === "error"   && <div style={{ fontSize:11, color:"var(--red)", marginTop:3 }}>⚠ Square sync failed — check Edge Function logs</div>}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {tab === "products" && (
            <button className="btn btn-sm btn-ghost" onClick={runCleanupAndSync} disabled={bulkSyncing}
              title="Delete all Square items and re-sync cleanly from your website"
              style={{ fontSize:11, color:"#4fc3f7", borderColor:"rgba(79,195,247,.3)" }}>
              {bulkSyncing ? "⏳ Syncing…" : "🔄 Sync All to Square"}
            </button>
          )}
          {tab === "products" && <button className="btn btn-primary" onClick={() => { setForm(blank); setNewVariant({ name:"", price:"", stock:"", costPrice:"", supplierCode:"" }); setSavingProduct(false); setModal("new"); }}>+ Add Product</button>}
          {tab === "postage" && <button className="btn btn-primary" onClick={() => { setPostForm(blankPost); setPostModal("new"); }}>+ Add Postage</button>}
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:24, flexWrap:"wrap" }}>
        {[
          { id:"products", label:"Products" },
          { id:"postage", label:"Postage Options" },
          { id:"orders", label:"Orders", count: orderCount },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"8px 16px", borderRadius:6, cursor:"pointer",
            fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700,
            fontSize:12, letterSpacing:".1em", textTransform:"uppercase",
            transition:"all .15s",
            background: tab === t.id ? "var(--accent)" : "rgba(255,255,255,.07)",
            color: tab === t.id ? "#000" : "var(--muted)",
            border: tab === t.id ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,.1)",
          }}
          onMouseEnter={e => { if (tab !== t.id) { e.currentTarget.style.background="rgba(255,255,255,.12)"; e.currentTarget.style.color="#fff"; } }}
          onMouseLeave={e => { if (tab !== t.id) { e.currentTarget.style.background="rgba(255,255,255,.07)"; e.currentTarget.style.color="var(--muted)"; } }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                background: tab === t.id ? "rgba(0,0,0,.3)" : "#ef5350",
                color: tab === t.id ? "#000" : "#fff",
                borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:800, lineHeight:"16px",
              }}>{t.count}</span>
            )}
          </button>
        ))}
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
          <div style={{overflowX:"auto", width:"100%", WebkitOverflowScrolling:"touch"}}>
          <table className="data-table" style={{minWidth:900, tableLayout:"auto"}}>
            <thead><tr>
              <th style={{width:28}}></th>
              <th style={{minWidth:120}}>Product</th>
              <th style={{width:80}}>Price</th>
              <th style={{width:80}}>Cost</th>
              <th style={{width:100}}>Margin</th>
              <th style={{width:80}}>Variants</th>
              <th style={{width:80}}>Stock</th>
              <th style={{width:60}}>Sale</th>
              <th style={{width:70}}>No Post</th>
              <th style={{width:60}}>Game+</th>
              <th style={{width:60}}>Hidden</th>
              <th style={{width:110, whiteSpace:"nowrap"}}></th>
            </tr></thead>
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
                      <td className="text-green">{item.variants?.length > 0 ? <span style={{color:"var(--muted)",fontSize:11}}>see variants</span> : `£${Number(item.price).toFixed(2)}`}</td>
                      <td style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,verticalAlign:"top"}}>
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
                      <td style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,verticalAlign:"top"}}>
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
                      <td style={{verticalAlign:"top"}}>
                        {item.variants?.length > 0
                          ? <span className="tag tag-blue">{item.variants.length} variants</span>
                          : <span style={{color:"var(--muted)"}}>—</span>
                        }
                      </td>
                      <td style={{verticalAlign:"top"}}>
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
                      <td>{item.hiddenFromShop ? <span className="tag tag-red" title="Hidden from public shop">🔒</span> : "—"}</td>
                      <td style={{whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",gap:6,flexWrap:"nowrap"}}>
                          <button className="btn btn-sm btn-ghost" onClick={() => { setForm({ ...item, variants: item.variants || [] }); setNewVariant({ name:"", price:"", stock:"", costPrice:"", supplierCode:"" }); setSavingProduct(false); setModal(item.id); }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setDelProductConfirm(item)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                };

                if (filteredShopOrder.length === 0) {
                  return <tr><td colSpan={11} style={{textAlign:"center",color:"var(--muted)",padding:30}}>{productSearch || categoryFilter ? "No matching products" : "No products yet"}</td></tr>;
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
                            <td colSpan={11} style={{ background:"rgba(200,255,0,.06)", borderTop:"2px solid rgba(200,255,0,.18)", borderBottom:"1px solid rgba(200,255,0,.1)", padding:"7px 12px" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".2em", textTransform:"uppercase", color:"var(--accent)" }}>
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
                              <td colSpan={11} style={{ background:"rgba(120,120,120,.05)", borderTop:"2px solid rgba(150,150,150,.14)", borderBottom:"1px solid rgba(150,150,150,.08)", padding:"7px 12px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  <span style={{ fontFamily:"'Oswald','Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".2em", textTransform:"uppercase", color:"var(--muted)" }}>
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
              <div style={{fontSize:10,fontWeight:700,letterSpacing:".12em",color:"var(--muted)",marginBottom:8,fontFamily:"'Oswald','Barlow Condensed',sans-serif",textTransform:"uppercase"}}>🔒 Admin Only — Cost &amp; Margin</div>
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
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
              <input type="checkbox" checked={form.gameExtra || false} onChange={e => setField("gameExtra", e.target.checked)} />
              <label style={{fontSize:13}}>Available as Game Day Extra <span style={{color:"var(--muted)",fontSize:11}}>(shows in event extras product picker)</span></label>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              <input type="checkbox" checked={form.hiddenFromShop || false} onChange={e => setField("hiddenFromShop", e.target.checked)} />
              <label style={{fontSize:13}}>🔒 Hidden from Public Shop <span style={{color:"var(--muted)",fontSize:11}}>(only visible in Cash Sales &amp; Game Day Extras)</span></label>
            </div>

            {/* ── VARIANTS EDITOR ── */}
            <div style={{border:"1px solid #2a2a2a",borderLeft:"3px solid var(--accent)",marginBottom:14}}>
              <div style={{background:"#0d0d0d",padding:"8px 14px",fontSize:9,letterSpacing:".25em",color:"var(--accent)",fontFamily:"'Oswald','Barlow Condensed',sans-serif",fontWeight:700,textTransform:"uppercase",borderBottom:"1px solid #2a2a2a"}}>
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

export { AdminShop };
