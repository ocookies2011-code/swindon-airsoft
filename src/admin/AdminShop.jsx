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
  const blank = { name: "", description: "", price: 0, salePrice: null, onSale: false, image: "", images: [], stock: 0, noPost: false, gameExtra: false, hiddenFromShop: false, category: "", supplierCode: "", variants: [] };

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
  // Category display order — drag to reorder in the category header
  const [catOrder, setCatOrder] = useState([]);
  const dragCatIdx = useRef(null);
  useEffect(() => {
    const allCats = [...new Set(shopOrder.map(p => p.category).filter(Boolean))];
    setCatOrder(prev => {
      const existing = prev.filter(c => allCats.includes(c));
      const newCats  = allCats.filter(c => !prev.includes(c));
      return [...existing, ...newCats.sort()];
    });
  }, [shopOrder]);
  const toggleCat = (cat) => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }));

  // Low stock alert — items (or variants) at or below 5 units
  const lowStockItems = useMemo(() => {
    const out = [];
    shopOrder.forEach(p => {
      if (p.hiddenFromShop) return;
      if (p.variants?.length > 0) {
        p.variants.forEach(v => {
          if (Number(v.stock) <= 5) out.push({ id: p.id, name: p.name, variant: v.name, stock: Number(v.stock) });
        });
      } else {
        if (Number(p.stock) <= 5) out.push({ id: p.id, name: p.name, variant: null, stock: Number(p.stock) });
      }
    });
    return out.sort((a, b) => a.stock - b.stock);
  }, [shopOrder]);

  // Expanded variant detail state — click a product card to toggle
  const [expandedProduct, setExpandedProduct] = useState(null);
  const dragVariantIdx = useRef(null);
  const [form, setForm] = useState(blank);
  const setField = (fieldKey, fieldVal) => setForm(prev => ({ ...prev, [fieldKey]: fieldVal }));

  // Variant editor state
  const [newVariant, setNewVariant] = useState({ name: "", price: "", stock: "", supplierCode: "" });

  const addVariant = () => {
    if (!newVariant.name) { showToast("Variant name required", "red"); return; }
    const newVar = { id: uid(), name: newVariant.name, price: Number(newVariant.price) || 0, stock: Number(newVariant.stock) || 0, supplierCode: newVariant.supplierCode || "", image: "" };
    setField("variants", [...(form.variants || []), newVar]);
    setNewVariant({ name: "", price: "", stock: "", supplierCode: "" });
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
        const PLABELS = { name: "Name", price: "Price", stock: "Stock", category: "Category", description: "Description", active: "Active" };
        const before = { name: origProduct?.name, price: origProduct?.price, stock: origProduct?.stock, category: origProduct?.category, description: origProduct?.description, active: origProduct?.active };
        const after  = { name: form.name, price: form.price, stock: form.stock, category: form.category, description: form.description, active: form.active };
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
          {tab === "products" && <button className="btn btn-primary" onClick={() => { setForm(blank); setNewVariant({ name:"", price:"", stock:"", supplierCode:"" }); setSavingProduct(false); setModal("new"); }}>+ Add Product</button>}
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
        <div>
          {/* ── Stats bar ── */}
          {(() => {
            const totalStock = shopOrder.reduce((s,p) =>
              s + (p.variants?.length > 0
                ? p.variants.reduce((vs,v) => vs + Number(v.stock||0), 0)
                : Number(p.stock||0)), 0);
            const outOfStock = shopOrder.reduce((s,p) => {
              if (p.variants?.length > 0) {
                return s + p.variants.filter(v => Number(v.stock||0) === 0).length;
              }
              return s + (Number(p.stock||0) === 0 ? 1 : 0);
            }, 0);
            return (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:1, marginBottom:16, background:"#1a1a1a", border:"1px solid #1a1a1a", overflow:"hidden" }}>
                {[
                  { label:"Products",    val:shopOrder.length,                                          color:"var(--accent)" },
                  { label:"Total Stock", val:totalStock,                                                color:"var(--accent)" },
                  { label:"Out of Stock",val:outOfStock,                                                color:outOfStock>0?"var(--red)":"var(--muted)" },
                  { label:"Low Stock",   val:lowStockItems.length,                                      color:lowStockItems.length>0?"var(--gold)":"var(--muted)" },
                  { label:"Hidden",      val:shopOrder.filter(p=>p.hiddenFromShop).length,              color:"var(--muted)" },
                  { label:"On Sale",     val:shopOrder.filter(p=>p.onSale).length,                      color:shopOrder.filter(p=>p.onSale).length>0?"#ce93d8":"var(--muted)" },
                ].map(s => (
                  <div key={s.label} style={{ background:"#111", padding:"12px 16px", display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:s.color, lineHeight:1 }}>{s.val}</div>
                    <div style={{ fontSize:9, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".12em" }}>{s.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Low stock banner ── */}
          {lowStockItems.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div className="hazard-stripe gold" />
              <div className="alert-hazard gold" style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <div className="alert-hazard-label">⚠ LOW STOCK — {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} need restocking</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 12px", marginTop:6 }}>
                    {lowStockItems.map((item, i) => (
                      <span key={i} style={{ fontSize:12, fontFamily:"'Share Tech Mono',monospace", color:item.stock===0?"var(--red)":"var(--gold)", cursor:"pointer" }}
                        onClick={() => { setForm({ ...shopOrder.find(p=>p.id===item.id), variants:shopOrder.find(p=>p.id===item.id)?.variants||[] }); setNewVariant({name:"",price:"",stock:"",supplierCode:""}); setSavingProduct(false); setModal(item.id); }}>
                        {item.stock===0?"🔴":"🟡"} {item.name}{item.variant?` (${item.variant})`:""}: <strong>{item.stock}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Search + filter toolbar ── */}
          <div style={{ background:"#111", border:"1px solid #1e1e1e", padding:"12px 14px", marginBottom:16, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ position:"relative", flex:1, minWidth:180 }}>
              <svg style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", opacity:.4 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Search products…"
                style={{ width:"100%", paddingLeft:30, fontSize:13, background:"var(--bg4)", border:"1px solid var(--border)", color:"var(--text)", padding:"7px 10px 7px 30px", boxSizing:"border-box" }} />
            </div>
            <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}
              style={{ fontSize:13, padding:"7px 10px", background:"var(--bg4)", border:"1px solid var(--border)", color:categoryFilter?"var(--accent)":"var(--text)", minWidth:160 }}>
              <option value="">All categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(productSearch || categoryFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setProductSearch(""); setCategoryFilter(""); }}>✕ Clear</button>
            )}
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", flexShrink:0, borderLeft:"1px solid #2a2a2a", paddingLeft:12 }}>
              <span style={{ color:filteredShopOrder.length===shopOrder.length?"var(--muted)":"var(--accent)", fontWeight:700 }}>{filteredShopOrder.length}</span>
              <span style={{ color:"#333" }}> / </span>{shopOrder.length} products
            </div>
            <div style={{ fontSize:11, color:"#444", fontFamily:"'Share Tech Mono',monospace", flexShrink:0, borderLeft:"1px solid #2a2a2a", paddingLeft:12 }}>
              ☰ drag to reorder
            </div>
          </div>

          {(() => {
            const openEdit = (item) => { setForm({ ...item, variants: item.variants || [] }); setNewVariant({ name:"", price:"", stock:"", supplierCode:"" }); setSavingProduct(false); setModal(item.id); };

            // Stock summary for a product
            const stockSummary = (item) => {
              if (item.variants?.length > 0) {
                const total = item.variants.reduce((s, v) => s + Number(v.stock), 0);
                const outOf = item.variants.length;
                const zeroCount = item.variants.filter(v => Number(v.stock) === 0).length;
                const lowCount = item.variants.filter(v => Number(v.stock) > 0 && Number(v.stock) <= 5).length;
                const color = zeroCount > 0 ? "var(--red)" : lowCount > 0 ? "var(--gold)" : "var(--accent)";
                return { total, label: `${total} units across ${outOf} variants`, color, zeroCount, lowCount };
              }
              const s = Number(item.stock);
              const color = s === 0 ? "var(--red)" : s <= 5 ? "var(--gold)" : "var(--accent)";
              return { total: s, label: `${s} in stock`, color, zeroCount: s === 0 ? 1 : 0, lowCount: s > 0 && s <= 5 ? 1 : 0 };
            };

            // Price summary
            const priceSummary = (item) => {
              if (item.variants?.length > 0) {
                const prices = item.variants.map(v => Number(v.price)).filter(p => p > 0);
                if (!prices.length) return null;
                const min = Math.min(...prices), max = Math.max(...prices);
                return min === max ? `£${min.toFixed(2)}` : `£${min.toFixed(2)} – £${max.toFixed(2)}`;
              }
              const sell = item.onSale && item.salePrice ? item.salePrice : item.price;
              return `£${Number(sell).toFixed(2)}`;
            };

            const renderCard = (item) => {
              const idx = shopOrder.findIndex(p => p.id === item.id);
              const stock = stockSummary(item);
              const price = priceSummary(item);
              const img = item.images?.[0] || item.image || null;
              const isLowStock = stock.zeroCount > 0 || stock.lowCount > 0;

              return (
                <div key={item.id}>
                <div
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
                    api.shop.reorder(next.map(p => p.id)).then(() => save({ shop: next })).catch(() => showToast("Reorder failed", "red"));
                  }}
                  onClick={() => item.variants?.length > 0 && setExpandedProduct(expandedProduct === item.id ? null : item.id)}
                  style={{
                    background: "#111", border: `1px solid ${isLowStock ? stock.zeroCount > 0 ? "rgba(239,68,68,.3)" : "rgba(245,158,11,.3)" : expandedProduct === item.id ? "rgba(200,255,0,.25)" : "#1e1e1e"}`,
                    borderLeft: `3px solid ${isLowStock ? stock.color : expandedProduct === item.id ? "var(--accent)" : "rgba(200,255,0,.2)"}`,
                    borderBottom: expandedProduct === item.id ? "none" : undefined,
                    padding: "12px 14px", marginBottom: expandedProduct === item.id ? 0 : 6,
                    display: "flex", alignItems: "center", gap: 12,
                    cursor: item.variants?.length > 0 ? "pointer" : "grab",
                    transition: "border-color .15s",
                  }}
                >
                  {/* Drag handle */}
                  <span style={{ color:"var(--muted)", fontSize:14, userSelect:"none", flexShrink:0 }}>☰</span>

                  {/* Thumbnail */}
                  {img
                    ? <img src={img} alt="" style={{ width:44, height:44, objectFit:"cover", flexShrink:0, border:"1px solid #2a2a2a" }} />
                    : <div style={{ width:44, height:44, flexShrink:0, background:"#1a1a1a", border:"1px dashed #2a2a2a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"#333" }}>📦</div>
                  }

                  {/* Name + flags */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                      <span style={{ fontWeight:700, fontSize:14, color:"#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.name}</span>
                      {item.hiddenFromShop && <span className="tag tag-red" style={{fontSize:9,padding:"1px 6px"}}>🔒 HIDDEN</span>}
                      {item.onSale && <span className="tag tag-orange" style={{fontSize:9,padding:"1px 6px"}}>SALE £{item.salePrice}</span>}
                      {item.noPost && <span className="tag tag-gold" style={{fontSize:9,padding:"1px 6px"}}>NO POST</span>}
                      {item.gameExtra && <span className="tag tag-green" style={{fontSize:9,padding:"1px 6px"}}>GAME+</span>}
                      {item.variants?.length > 0 && <span className="tag tag-blue" style={{fontSize:9,padding:"1px 6px"}}>{item.variants.length} VARIANTS</span>}
                    </div>
                    {item.category && <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>{item.category.toUpperCase()}</div>}
                    {item.supplierCode && <div style={{ fontSize:10, color:"rgba(200,255,0,.4)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".06em", marginTop:2 }}>#{item.supplierCode}</div>}
                  </div>

                  {/* Price */}
                  <div style={{ textAlign:"right", flexShrink:0, minWidth:70 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif" }}>{price || "—"}</div>
                  </div>

                  {/* Stock */}
                  <div style={{ flexShrink:0, minWidth:80, textAlign:"right" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:stock.color, fontFamily:"'Share Tech Mono',monospace" }}>{stock.total}</div>
                    <div style={{ fontSize:9, color:"var(--muted)", marginTop:2, letterSpacing:".05em" }}>
                      {stock.zeroCount > 0 ? `${stock.zeroCount} OUT OF STOCK` : stock.lowCount > 0 ? `${stock.lowCount} LOW` : "IN STOCK"}
                    </div>
                    {/* Stock bar */}
                    <div style={{ width:60, height:3, background:"#1a1a1a", marginTop:4, marginLeft:"auto" }}>
                      <div style={{ height:"100%", width:`${Math.min(100, (stock.total / 50) * 100)}%`, background:stock.color, transition:"width .3s" }} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); openEdit(item); }} style={{fontSize:11}}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); setDelProductConfirm(item); }} style={{fontSize:11}}>Del</button>
                  </div>

                  {/* Expand chevron for variant products */}
                  {item.variants?.length > 0 && (
                    <span style={{ color: expandedProduct === item.id ? "var(--accent)" : "var(--muted)", fontSize: 12, flexShrink: 0, transition: "transform .2s", display: "inline-block", transform: expandedProduct === item.id ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  )}
                </div>

                {/* ── Variant breakdown panel ── */}
                {expandedProduct === item.id && item.variants?.length > 0 && (
                  <div style={{
                    background: "#0d0d0d", border: "1px solid rgba(200,255,0,.25)", borderTop: "none",
                    borderLeft: "3px solid var(--accent)", marginBottom: 6, overflow: "hidden",
                  }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px", gap: 0, borderBottom: "1px solid #1a1a1a", padding: "6px 14px" }}>
                      {["VARIANT", "SELL", "STOCK"].map(h => (
                        <div key={h} style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".15em", color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace" }}>{h}</div>
                      ))}
                    </div>
                    {item.variants.map((v, i) => {
                      const stockNum = Number(v.stock);
                      const stockColor = stockNum === 0 ? "var(--red)" : stockNum <= 5 ? "var(--gold)" : "var(--accent)";
                      return (
                        <div key={v.id} style={{
                          display: "grid", gridTemplateColumns: "1fr 70px 90px", gap: 0,
                          padding: "8px 14px", borderBottom: i < item.variants.length - 1 ? "1px solid #1a1a1a" : "none",
                          background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.015)",
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                            {v.image && <img src={v.image} alt="" style={{ width: 20, height: 20, objectFit: "cover", border: "1px solid #2a2a2a", flexShrink: 0 }} />}
                            {v.name}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--accent)", fontFamily: "'Share Tech Mono',monospace", fontWeight: 700 }}>
                            £{Number(v.price).toFixed(2)}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: stockColor, fontFamily: "'Share Tech Mono',monospace", minWidth: 24 }}>{v.stock}</span>
                            <div style={{ flex: 1, height: 3, background: "#1a1a1a" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, (stockNum / 30) * 100)}%`, background: stockColor }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Totals row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px", gap: 0, padding: "7px 14px", borderTop: "1px solid rgba(200,255,0,.15)", background: "rgba(200,255,0,.03)" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: "var(--accent)", fontFamily: "'Barlow Condensed',sans-serif" }}>TOTAL</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        £{Math.min(...item.variants.map(v => Number(v.price))).toFixed(2)}–£{Math.max(...item.variants.map(v => Number(v.price))).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: stock.color, fontFamily: "'Share Tech Mono',monospace" }}>
                        {item.variants.reduce((s, v) => s + Number(v.stock), 0)} units
                      </div>
                    </div>
                  </div>
                )}
                </div>
              );
            };

            if (filteredShopOrder.length === 0) {
              return <div style={{textAlign:"center",color:"var(--muted)",padding:"30px 0"}}>{productSearch || categoryFilter ? "No matching products" : "No products yet"}</div>;
            }

            // Flat list when searching; grouped by category otherwise
            if (productSearch.trim() || categoryFilter) {
              return filteredShopOrder.map(item => renderCard(item));
            }

            const uncategorised = filteredShopOrder.filter(p => !p.category);
            const groups = {};
            filteredShopOrder.filter(p => p.category).forEach(p => {
              (groups[p.category] = groups[p.category] || []).push(p);
            });
            // Use saved catOrder; filter to only cats that exist in current products
            const sortedCats = catOrder.filter(c => groups[c]);

            return (
              <>
                {sortedCats.map((cat, catIdx) => {
                  const isCatCollapsed = !!collapsedCats[cat];
                  return (
                    <React.Fragment key={cat}>
                      <div
                        draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed="move"; dragCatIdx.current = catIdx; e.stopPropagation(); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={e => {
                          e.preventDefault(); e.stopPropagation();
                          const from = dragCatIdx.current;
                          if (from === catIdx || from === null) return;
                          const next = [...catOrder];
                          const [moved] = next.splice(from, 1);
                          next.splice(catIdx, 0, moved);
                          setCatOrder(next);
                          dragCatIdx.current = null;
                        }}
                        style={{ userSelect:"none", cursor:"grab", background:"rgba(200,255,0,.06)", borderTop:"2px solid rgba(200,255,0,.18)", borderBottom:"1px solid rgba(200,255,0,.1)", padding:"7px 12px", marginBottom: isCatCollapsed ? 6 : 0 }}
                        onClick={() => toggleCat(cat)}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ color:"var(--muted)", fontSize:12, userSelect:"none" }}>☰</span>
                          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".2em", textTransform:"uppercase", color:"var(--accent)" }}>
                            {isCatCollapsed ? "▶" : "▼"} {cat}
                          </span>
                          <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{groups[cat].length} item{groups[cat].length !== 1 ? "s" : ""}</span>
                          <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(200,255,0,.35)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>{isCatCollapsed ? "▸ EXPAND" : "▾ COLLAPSE"}</span>
                        </div>
                      </div>
                      {!isCatCollapsed && <div style={{ marginBottom: 8 }}>{groups[cat].map(item => renderCard(item))}</div>}
                    </React.Fragment>
                  );
                })}
                {uncategorised.length > 0 && (() => {
                  const isUncatCollapsed = !!collapsedCats["__none"];
                  return (
                    <React.Fragment key="__none">
                      {sortedCats.length > 0 && (
                        <div style={{ userSelect:"none", cursor:"pointer", background:"rgba(120,120,120,.05)", borderTop:"2px solid rgba(150,150,150,.14)", borderBottom:"1px solid rgba(150,150,150,.08)", padding:"7px 12px", marginBottom: isUncatCollapsed ? 6 : 0 }} onClick={() => toggleCat("__none")}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:12, letterSpacing:".2em", textTransform:"uppercase", color:"var(--muted)" }}>
                              {isUncatCollapsed ? "▶" : "▼"} Uncategorised
                            </span>
                            <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"'Share Tech Mono',monospace" }}>{uncategorised.length} item{uncategorised.length !== 1 ? "s" : ""}</span>
                            <span style={{ marginLeft:"auto", fontSize:9, color:"rgba(150,150,150,.4)", fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>{isUncatCollapsed ? "▸ EXPAND" : "▾ COLLAPSE"}</span>
                          </div>
                        </div>
                      )}
                      {!isUncatCollapsed && <div style={{ marginBottom: 8 }}>{uncategorised.map(item => renderCard(item))}</div>}
                    </React.Fragment>
                  );
                })()}
              </>
            );
          })()}
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

            {/* Supplier / Product Code */}
            <div className="form-group">
              <label>Supplier / Product Code <span style={{ fontWeight:400, color:"var(--muted)", fontSize:11 }}>(optional — for reordering stock)</span></label>
              <input value={form.supplierCode || ""} onChange={e => setField("supplierCode", e.target.value)}
                placeholder="e.g. NR-0.20-3500 or SKU-12345"
                style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13 }} />
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
                    <div style={{display:"grid",gridTemplateColumns:"auto 1fr 100px 100px auto",gap:8,alignItems:"center",marginBottom:4}}>
                      <span style={{color:"var(--muted)",fontSize:14,textAlign:"center",userSelect:"none",cursor:"grab"}}>☰</span>
                      <input value={v.name} onChange={e => updateVariant(v.id, "name", e.target.value)} placeholder="Variant name (e.g. Red, Large)" style={{fontSize:12}} />
                      <input type="number" step="0.01" value={v.price} onChange={e => updateVariant(v.id, "price", e.target.value)} placeholder="Price £" style={{fontSize:12}} />
                      <input type="number" value={v.stock} onChange={e => updateVariant(v.id, "stock", e.target.value)} placeholder="Stock" style={{fontSize:12}} />
                      <button className="btn btn-sm btn-danger" onClick={() => removeVariant(v.id)} style={{padding:"6px 10px"}}>✕</button>
                    </div>
                    <div style={{marginBottom:6}}>
                      <input value={v.supplierCode || ""} onChange={e => updateVariantRaw(v.id, "supplierCode", e.target.value)}
                        placeholder="Supplier/product code (optional)" style={{fontSize:11,fontFamily:"'Share Tech Mono',monospace",width:"100%",borderColor:"#2a2a2a",background:"#0d0d0d",color:"var(--muted)"}} />
                    </div>
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
                <div style={{display:"grid",gridTemplateColumns:"1fr 100px 100px auto",gap:8,alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid #1e1e1e"}}>
                  <input value={newVariant.name} onChange={e => setNewVariant(p => ({...p, name: e.target.value}))} placeholder="New variant name" style={{fontSize:12}} />
                  <input type="number" step="0.01" value={newVariant.price} onChange={e => setNewVariant(p => ({...p, price: e.target.value}))} placeholder="Price £" style={{fontSize:12}} />
                  <input type="number" value={newVariant.stock} onChange={e => setNewVariant(p => ({...p, stock: e.target.value}))} placeholder="Stock" style={{fontSize:12}} />
                  <button className="btn btn-sm btn-primary" onClick={addVariant} style={{whiteSpace:"nowrap"}}>+ Add</button>
                </div>
                <div style={{marginTop:4}}>
                  <input value={newVariant.supplierCode || ""} onChange={e => setNewVariant(p => ({...p, supplierCode: e.target.value}))}
                    placeholder="Supplier/product code for new variant (optional)" style={{fontSize:11,fontFamily:"'Share Tech Mono',monospace",width:"100%",borderColor:"#1e2e0e",background:"#0a0f06",color:"var(--muted)"}} />
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
