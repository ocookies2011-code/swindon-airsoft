// pages/ShopPage.jsx — ShopClosedPage, ShopPage, ProductReviews, ProductPage
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import {
  renderMd, stockLabel, fmtErr, fmtDate, uid,
  SquareCheckoutButton, loadSquareConfig,
  useMobile,
  sendOrderEmail, sendAdminOrderNotification,
} from "../utils";

function ShopClosedPage({ setPage }) {
  const categories = [
    { icon: "🔫", label: "Airsoft Guns", desc: "AEGs, GBBs, snipers and pistols from top brands" },
    { icon: "🎯", label: "BBs & Ammo", desc: "0.20g to 0.45g biodegradable and standard BBs" },
    { icon: "🦺", label: "Tactical Gear", desc: "Vests, plate carriers, helmets and load-bearing equipment" },
    { icon: "👓", label: "Eye Protection", desc: "ANSI-rated goggles and full-face masks" },
    { icon: "🔋", label: "Batteries & Chargers", desc: "LiPo, NiMH batteries and smart chargers" },
    { icon: "🔧", label: "Parts & Upgrades", desc: "Hop-up rubbers, barrels, gearbox parts and more" },
    { icon: "👕", label: "Clothing & Apparel", desc: "Camo uniforms, boots, gloves and base layers" },
    { icon: "🎒", label: "Bags & Cases", desc: "Gun bags, hard cases and tactical backpacks" },
  ];

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#0d1400 0%,#111 60%,#0a1000 100%)",
        border: "1px solid #2a3a10",
        borderRadius: 8,
        padding: "32px 28px",
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)", pointerEvents:"none" }} />
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
          <div key={v+h} style={{ position:"absolute", width:16, height:16,
            top:v==="top"?8:"auto", bottom:v==="bottom"?8:"auto",
            left:h==="left"?8:"auto", right:h==="right"?8:"auto",
            borderTop:v==="top"?"2px solid #c8ff00":"none", borderBottom:v==="bottom"?"2px solid #c8ff00":"none",
            borderLeft:h==="left"?"2px solid #c8ff00":"none", borderRight:h==="right"?"2px solid #c8ff00":"none",
          }} />
        ))}
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:9, letterSpacing:".25em", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, marginBottom:10 }}>⬡ SWINDON AIRSOFT · ONLINE SHOP</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:"#e8ffb0", letterSpacing:".04em", marginBottom:8 }}>SHOP TEMPORARILY CLOSED</div>
          <div style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, maxWidth:600 }}>
            Our on-site shop is currently closed. You can order everything you need from our full retail store — with the option to collect your order at one of our game days.
          </div>
        </div>
      </div>

      {/* Retail store card */}
      <div style={{
        background: "linear-gradient(135deg,rgba(200,255,0,.06) 0%,rgba(0,0,0,0) 60%),#0b1007",
        border: "2px solid #c8ff00",
        borderRadius: 8,
        padding: "28px 28px",
        marginBottom: 24,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position:"absolute", top:0, right:0, width:120, height:120, background:"radial-gradient(circle,rgba(200,255,0,.08) 0%,transparent 70%)", pointerEvents:"none" }} />
        <div style={{ display:"flex", alignItems:"flex-start", gap:20, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", color:"#c8ff00", marginBottom:8, textTransform:"uppercase" }}>🛒 Our Retail Store</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#fff", marginBottom:8 }}>Airsoft Armoury UK</div>
            <div style={{ fontSize:13, color:"#a0cc60", lineHeight:1.7, marginBottom:16 }}>
              The UK's premier airsoft retailer — thousands of products in stock with fast dispatch. Use code <strong style={{ color:"#c8ff00", background:"rgba(200,255,0,.1)", padding:"1px 8px", borderRadius:3, fontFamily:"'Share Tech Mono',monospace", letterSpacing:".1em" }}>COLLECTION</strong> at checkout to collect your order at one of our Swindon Airsoft game days instead of paying for postage.
            </div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <a href="https://airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
                style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#c8ff00", color:"#0a0f06", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".12em", padding:"11px 22px", borderRadius:3, textDecoration:"none", textTransform:"uppercase" }}>
                🌐 VISIT STORE
              </a>
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(200,255,0,.08)", border:"1px solid rgba(200,255,0,.3)", color:"#c8ff00", fontFamily:"'Share Tech Mono',monospace", fontSize:13, letterSpacing:".15em", padding:"11px 18px", borderRadius:3 }}>
                CODE: COLLECTION
              </div>
            </div>
          </div>
          {/* Collection info box */}
          <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid #2a3a10", borderRadius:6, padding:"16px 18px", minWidth:0, flexShrink:0, width:"100%" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".2em", color:"#c8ff00", marginBottom:10, textTransform:"uppercase" }}>📦 Game Day Collection</div>
            {[
              ["1", "Order from airsoftarmoury.uk"],
              ["2", 'Enter code COLLECTION at checkout'],
              ["3", "Select your game day date"],
              ["4", "Collect at the field — no postage!"],
            ].map(([n, t]) => (
              <div key={n} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ background:"rgba(200,255,0,.15)", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{n}</div>
                <div style={{ fontSize:12, color:"#a0cc60", lineHeight:1.5 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What they sell */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:13, letterSpacing:".2em", color:"var(--muted)", textTransform:"uppercase", marginBottom:14 }}>◈ WHAT'S AVAILABLE AT AIRSOFT ARMOURY UK</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
          {categories.map(({ icon, label, desc }) => (
            <div key={label} style={{ background:"#0b1007", border:"1px solid #2a3a10", borderRadius:6, padding:"14px 16px" }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:"#c8e878", letterSpacing:".06em", marginBottom:4 }}>{label}</div>
              <div style={{ fontSize:11, color:"var(--muted)", lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign:"center", padding:"24px 0 8px" }}>
        <a href="https://airsoftarmoury.uk" target="_blank" rel="noopener noreferrer"
          style={{ display:"inline-flex", alignItems:"center", gap:10, background:"rgba(200,255,0,.08)", border:"1px solid #c8ff00", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, letterSpacing:".15em", padding:"14px 32px", borderRadius:3, textDecoration:"none", textTransform:"uppercase" }}>
          🛒 SHOP AT AIRSOFTARMOURY.UK →
        </a>
        <div style={{ fontSize:11, color:"var(--muted)", marginTop:10, fontFamily:"'Share Tech Mono',monospace" }}>
          Use code <strong style={{ color:"#c8ff00" }}>COLLECTION</strong> for game day pickup · Free on qualifying orders
        </div>
      </div>
    </div>
  );
}

// ── Shop ──────────────────────────────────────────────────
function ShopPage({ data, cu, showToast, save, onProductClick, cart, setCart, cartOpen, setCartOpen, recentlyViewed = [], setPage }) {
  const [placing, setPlacing] = useState(false);
  const shopSafetyRef = useRef(null);
  const [shopSquareError, setShopSquareError] = useState(null);
  const [validDefence, setValidDefence] = useState("");
  const [shopDiscountInput, setShopDiscountInput] = useState('');
  const [shopAppliedDiscount, setShopAppliedDiscount] = useState(null);
  const [shopDiscountError, setShopDiscountError] = useState('');
  const [shopDiscountChecking, setShopDiscountChecking] = useState(false);

  const postageOptions = data.postageOptions || [];
  const [postageId, setPostageId] = useState(() => postageOptions[0]?.id || "");
  useEffect(() => {
    if (!postageId && postageOptions.length > 0) setPostageId(postageOptions[0].id);
  }, [postageOptions.length]);

  // Clean up shop safety timeout on unmount
  useEffect(() => () => { if (shopSafetyRef.current) clearTimeout(shopSafetyRef.current); }, []);

  // Pre-fill valid defence from player's UKARA ID when cart opens
  useEffect(() => {
    if (cartOpen && cu?.ukara && !validDefence) setValidDefence(cu.ukara);
  }, [cartOpen]);

  const postage = postageOptions.find(p => p.id === postageId) || postageOptions[0] || { name: "Collection", price: 0 };
  const hasNoPost = cart.some(i => i.noPost);

  const cartKey = (item, variant) => variant ? `${item.id}::${variant.id}` : item.id;

  const addToCart = (item, variant, qty = 1) => {
    const key = cartKey(item, variant);
    const price = variant ? Number(variant.price) : (item.onSale && item.salePrice ? item.salePrice : item.price);
    const label = variant ? `${item.name} — ${variant.name}` : item.name;
    const availStock = variant ? Number(variant.stock) : item.stock;
    setCart(c => {
      const ex = c.find(x => x.key === key);
      const currentQty = ex ? ex.qty : 0;
      if (currentQty + qty > availStock) { showToast("Not enough stock", "red"); return c; }
      if (ex) return c.map(x => x.key === key ? { ...x, qty: x.qty + qty } : x);
      return [...c, { key, id: item.id, variantId: variant?.id || null, name: label, price, qty, noPost: item.noPost, stock: availStock }];
    });
    showToast(`${label} × ${qty} added to cart`);
  };

  const removeFromCart = (key) => {
    setCart(c => {
      const next = c.filter(x => x.key !== key);
      if (next.length === 0) { setShopAppliedDiscount(null); setShopDiscountInput(''); setShopDiscountError(''); }
      return next;
    });
  };
  const updateCartQty = (key, qty) => {
    if (qty < 1) { removeFromCart(key); return; }
    setCart(c => c.map(x => x.key === key ? { ...x, qty: Math.min(qty, x.stock) } : x));
  };

  const subTotal = Math.round(cart.reduce((s, i) => s + i.price * i.qty * (cu?.vipStatus === "active" ? 0.9 : 1), 0) * 100) / 100;
  const postageTotal = hasNoPost ? 0 : Math.round((postage?.price || 0) * 100) / 100;

  let shopDiscountSaving = 0;
  if (shopAppliedDiscount && cart.length > 0) {
    if (shopAppliedDiscount.type === 'percent') {
      shopDiscountSaving = Math.round(subTotal * (Number(shopAppliedDiscount.value) / 100) * 100) / 100;
    } else {
      shopDiscountSaving = Math.min(Math.round(Number(shopAppliedDiscount.value) * 100) / 100, subTotal);
    }
  }
  const grandTotal = Math.round((Math.max(0, subTotal - shopDiscountSaving) + postageTotal) * 100) / 100;

  const applyShopDiscount = async (cu) => {
    if (!shopDiscountInput.trim()) return;
    setShopDiscountChecking(true);
    setShopDiscountError('');
    setShopAppliedDiscount(null);
    try {
      const isVoucher = shopDiscountInput.trim().toUpperCase().startsWith('GV-');
      const result = isVoucher
        ? await api.giftVouchers.validate(shopDiscountInput.trim())
        : await api.discountCodes.validate(shopDiscountInput, cu?.id, 'shop');
      setShopAppliedDiscount(result);
    } catch (e) {
      setShopDiscountError(e.message);
    } finally {
      setShopDiscountChecking(false);
    }
  };

  const placeOrderAfterPayment = async (squarePayment) => {
    if (!cu || cart.length === 0) return;
    setPlacing(true); setShopSquareError(null);
    const safety = shopSafetyRef.current = setTimeout(() => setPlacing(false), 30000);
    try {
      await api.shopOrders.create({
        customerName: cu.name, customerEmail: cu.email || "",
        customerAddress: cu.address || "", userId: cu.id,
        items: cart.map(i => ({ id: i.id, variantId: i.variantId, name: i.name, price: i.price, qty: i.qty })),
        subtotal: subTotal, postage: postageTotal,
        postageName: hasNoPost ? "Collection Only" : (postage?.name || ""),
        total: grandTotal, squareOrderId: squarePayment.id,
        validDefence: validDefence.trim() || null,
        discountCode: shopAppliedDiscount ? shopAppliedDiscount.code : null,
        discountSaving: shopDiscountSaving > 0 ? shopDiscountSaving : null,
      });
      showToast("✅ Order confirmed! Thank you.");
      const cartSnapshot = [...cart];
      try {
        sendOrderEmail({
          cu,
          order: { id: squarePayment.id, postage: postageTotal, total: grandTotal, customerAddress: cu.address || "" },
          items: cartSnapshot.map(i => ({ name: i.name, variant: i.variantName || "", price: i.price, qty: i.qty })),
          postageName: hasNoPost ? "Collection Only" : (postage?.name || ""),
        }).catch(() => {});
        // Admin notification — fire-and-forget
        sendAdminOrderNotification({
          adminEmail: data.contactEmail,
          cu,
          order: { postage: postageTotal, total: grandTotal, customerAddress: cu.address || "", postageName: hasNoPost ? "Collection Only" : (postage?.name || ""), customerName: cu.name, customerEmail: cu.email },
          items: cartSnapshot.map(i => ({ name: i.name, variant: i.variantName || "", price: i.price, qty: i.qty })),
        }).catch(() => {});
      } catch (emailErr) { console.warn("Order email failed:", emailErr); }
      // Record discount / gift voucher redemption
      if (shopAppliedDiscount) {
        try {
          if (shopAppliedDiscount.code?.toUpperCase().startsWith('GV-')) {
            await api.giftVouchers.redeem(shopAppliedDiscount.code, shopDiscountSaving, cu.id, cu.name, 'shop');
          } else {
            await api.discountCodes.redeem(shopAppliedDiscount.code, cu.id, cu.name, 'shop', shopDiscountSaving);
          }
        } catch { /* non-fatal */ }
      }
      setCart([]); setCartOpen(false); setShopAppliedDiscount(null); setShopDiscountInput('');
      Promise.all([
        ...cartSnapshot.map(ci => {
          const rpc = ci.variantId
            ? supabase.rpc("deduct_variant_stock", { product_id: ci.id, variant_id: ci.variantId, qty: ci.qty })
            : supabase.rpc("deduct_stock", { product_id: ci.id, qty: ci.qty });
          return rpc.then(({ error }) => {
            if (error) console.error("Stock deduct failed for shop item", ci.name, error.message);
          }).catch(err => console.error("Stock deduct RPC error", ci.name, err?.message));
        }),
        api.shop.getAll().then(freshShop => save({ shop: freshShop })).catch(() => {}),
      ]);
    } catch (e) {
      const errMsg = "Order failed — please contact us. Error: " + (e.message || String(e));
      setShopSquareError(errMsg);
      supabase.from('failed_payments').insert({
        customer_name:     cu?.name || "Unknown",
        customer_email:    cu?.email || "",
        user_id:           cu?.id || null,
        items:             cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        total:             grandTotal || 0,
        payment_method:    "square_shop",
        error_message:     errMsg,
        square_payment_id: squarePayment?.id || null,
        recorded_by:       null,
      }).then(({ error }) => { if (error) console.warn("Failed to log payment error:", error.message); });
    } finally {
      clearTimeout(safety);
      setPlacing(false);
    }
  };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Review summaries: Map<product_id, { avg: number, count: number }>
  const [reviewSummary, setReviewSummary] = useState(new Map());
  useEffect(() => {
    supabase
      .from("product_reviews")
      .select("product_id, rating")
      .then(({ data: rows }) => {
        if (!rows) return;
        const map = new Map();
        rows.forEach(r => {
          const s = map.get(r.product_id) || { total: 0, count: 0 };
          s.total += r.rating; s.count += 1;
          map.set(r.product_id, s);
        });
        const summary = new Map();
        map.forEach((s, id) => summary.set(id, { avg: s.total / s.count, count: s.count }));
        setReviewSummary(summary);
      });
  }, []);

  const [shopCatFilter, setShopCatFilter] = useState("");
  const [shopSearch, setShopSearch] = useState("");
  const [shopSort, setShopSort] = useState("default");
  const [shopPage, setShopPage] = useState(1);
  const SHOP_PAGE_SIZE = 12;
  const allShopCategories = useMemo(() => {
    const visibleProducts = (data.shop || []).filter(p => !p.hiddenFromShop);
    const cats = [...new Set(visibleProducts.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [data.shop]);
  const filteredShop = useMemo(() => {
    let list = data.shop || [];
    list = list.filter(p => !p.hiddenFromShop);
    if (shopCatFilter) list = list.filter(p => p.category === shopCatFilter);
    if (shopSearch.trim()) {
      const q = shopSearch.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
    }
    if (shopSort === "price-asc") list = [...list].sort((a,b) => {
      const pa = a.variants?.length ? Math.min(...a.variants.map(v=>Number(v.price))) : (a.onSale && a.salePrice ? a.salePrice : a.price);
      const pb = b.variants?.length ? Math.min(...b.variants.map(v=>Number(v.price))) : (b.onSale && b.salePrice ? b.salePrice : b.price);
      return pa - pb;
    });
    else if (shopSort === "price-desc") list = [...list].sort((a,b) => {
      const pa = a.variants?.length ? Math.min(...a.variants.map(v=>Number(v.price))) : (a.onSale && a.salePrice ? a.salePrice : a.price);
      const pb = b.variants?.length ? Math.min(...b.variants.map(v=>Number(v.price))) : (b.onSale && b.salePrice ? b.salePrice : b.price);
      return pb - pa;
    });
    else if (shopSort === "name-asc") list = [...list].sort((a,b) => a.name.localeCompare(b.name));
    else if (shopSort === "name-desc") list = [...list].sort((a,b) => b.name.localeCompare(a.name));
    return list;
  }, [data.shop, shopCatFilter, shopSearch, shopSort]);
  useEffect(() => { setShopPage(1); }, [shopCatFilter, shopSearch, shopSort]);
  const paginatedShop = useMemo(() => filteredShop.slice(0, shopPage * SHOP_PAGE_SIZE), [filteredShop, shopPage]);
  const hasMoreShop = filteredShop.length > shopPage * SHOP_PAGE_SIZE;

  return (
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      {/* Header */}
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
        <div style={{ maxWidth:1100, margin:"0 auto", position:"relative", zIndex:1, display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
          <div style={{ textAlign:"center", flex:1 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".35em", color:"#3a5010", marginBottom:14, textTransform:"uppercase" }}>◈ — SWINDON AIRSOFT — QUARTERMASTER — ◈</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:"clamp(30px,6vw,56px)", letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8", lineHeight:1, marginBottom:6 }}>
              FIELD <span style={{ color:"#c8ff00", textShadow:"0 0 30px rgba(200,255,0,.35)" }}>ARMOURY</span>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, letterSpacing:".25em", color:"#3a5010", marginTop:12 }}>▸ PROCURE YOUR GEAR — REPORT TO QUARTERMASTER ◂</div>
          </div>
          {/* Cart button */}
          <div style={{ flexShrink:0, marginTop:4 }}>
            <button style={{ background:"rgba(200,255,0,.06)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", padding:"10px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background="rgba(200,255,0,.12)"; e.currentTarget.style.borderColor="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.background="rgba(200,255,0,.06)"; e.currentTarget.style.borderColor="#2a3a10"; }}
              onClick={() => setCartOpen(true)}>
              ◈ LOADOUT
              {cartCount > 0 && <span style={{ background:"#c8ff00", color:"#000", padding:"1px 8px", fontSize:11, fontWeight:900 }}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 16px 80px" }}>
        {cu?.vipStatus === "active" && (
          <div style={{ background:"rgba(200,160,0,.06)", border:"1px solid rgba(200,160,0,.2)", padding:"10px 16px", marginBottom:24, display:"flex", alignItems:"center", gap:10, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".15em", color:"#c8a000" }}>
            ★ VIP OPERATIVE — 10% DISCOUNT APPLIED ON ALL ITEMS
          </div>
        )}

        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && !shopSearch && !shopCatFilter && (
          <div style={{ marginBottom:32 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>◈ —</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:15, letterSpacing:".18em", textTransform:"uppercase", color:"#e8f0d8" }}>
                RECENTLY <span style={{ color:"#c8ff00" }}>VIEWED</span>
              </div>
              <div style={{ flex:1, height:1, background:"linear-gradient(to right,#1a2808,transparent)" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
              {recentlyViewed.map(prod => {
                const hasV = prod.variants?.length > 0;
                const rvPrice = hasV
                  ? Math.min(...prod.variants.map(v => Number(v.price)))
                  : (prod.onSale && prod.salePrice ? prod.salePrice : prod.price);
                const rvImg = prod.images?.[0] || prod.image || null;
                return (
                  <div key={prod.id} onClick={() => onProductClick(prod)}
                    style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", transition:"border-color .15s, transform .15s", position:"relative" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}>
                    {/* recently viewed accent strip */}
                    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(to right,#4fc3f7,transparent)", zIndex:2 }} />
                    {rvImg
                      ? <img src={rvImg} alt={prod.name} onError={e=>{e.target.style.display="none";}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", background:"#080a06", display:"block" }} />
                      : <div style={{ aspectRatio:"4/3", background:"#080a06", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, color:"#1a2808" }}>🎯</div>
                    }
                    <div style={{ padding:"8px 10px" }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".05em", textTransform:"uppercase", color:"#9ab870", lineHeight:1.2, marginBottom:3,
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{prod.name}</div>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, color:"#c8ff00" }}>£{Number(rvPrice).toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.shop.length === 0 && !shopSearch && !shopCatFilter && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12, marginBottom:40 }}>
            {Array.from({length:8}).map((_,i) => <SkeletonCard key={i} height={260} />)}
          </div>
        )}

        {/* Gift voucher banner */}
        {setPage && (
          <div onClick={() => setPage("gift-vouchers")} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, background:"linear-gradient(90deg,#0c1009 0%,#111a06 100%)", border:"1px solid #2a4010", borderLeft:"3px solid #c8a000", padding:"14px 20px", marginBottom:16, cursor:"pointer", transition:"border-color .15s" }}
            onMouseEnter={e => e.currentTarget.style.borderLeftColor="#e8c000"}
            onMouseLeave={e => e.currentTarget.style.borderLeftColor="#c8a000"}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <span style={{ fontSize:24, flexShrink:0 }}>🎟️</span>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, letterSpacing:".1em", textTransform:"uppercase", color:"#c8a000" }}>Gift Vouchers</div>
                <div style={{ fontSize:12, color:"#5a7a30", marginTop:1 }}>The perfect gift — redeemable on events &amp; shop orders</div>
              </div>
            </div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:12, letterSpacing:".1em", color:"#c8a000", whiteSpace:"nowrap", flexShrink:0 }}>BUY ONE →</div>
          </div>
        )}

        {/* Search + Sort row */}
        <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"stretch" }}>
          <div style={{ flex:1, position:"relative" }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#3a5010", fontSize:14, pointerEvents:"none" }}>🔍</span>
            <input value={shopSearch} onChange={e => setShopSearch(e.target.value)} placeholder="SEARCH ARMOURY…"
              style={{ width:"100%", background:"#111a0a", border:"1px solid #2a4010", color:"#e8f8b0", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:16, letterSpacing:".12em", padding:"12px 40px 12px 40px", outline:"none", boxSizing:"border-box", textTransform:"uppercase", caretColor:"#c8ff00" }} />
            {shopSearch && <button onClick={() => setShopSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#5a7a30", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
          </div>
          <select value={shopSort} onChange={e => setShopSort(e.target.value)}
            style={{ background:"#111a0a", border:"1px solid #2a4010", color:"#c8e878", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13, letterSpacing:".12em", padding:"12px 14px", outline:"none", cursor:"pointer", flexShrink:0, textTransform:"uppercase" }}>
            <option value="default">SORT: DEFAULT</option>
            <option value="price-asc">PRICE: LOW → HIGH</option>
            <option value="price-desc">PRICE: HIGH → LOW</option>
            <option value="name-asc">NAME: A → Z</option>
            <option value="name-desc">NAME: Z → A</option>
          </select>
        </div>

        {/* Category filter tabs */}
        {allShopCategories.length > 0 && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom: (shopSearch || shopCatFilter) ? 10 : 24, alignItems:"center" }}>
            <button
              onClick={() => setShopCatFilter("")}
              style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", textTransform:"uppercase",
                padding:"6px 16px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                background: shopCatFilter === "" ? "#c8ff00" : "transparent",
                borderColor: shopCatFilter === "" ? "#c8ff00" : "#2a3a10",
                color: shopCatFilter === "" ? "#000" : "#5a7a30" }}
            >ALL</button>
            {allShopCategories.map(cat => (
              <button key={cat}
                onClick={() => setShopCatFilter(shopCatFilter === cat ? "" : cat)}
                style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", textTransform:"uppercase",
                  padding:"6px 16px", border:"1px solid", cursor:"pointer", transition:"all .15s",
                  background: shopCatFilter === cat ? "#c8ff00" : "transparent",
                  borderColor: shopCatFilter === cat ? "#c8ff00" : "#2a3a10",
                  color: shopCatFilter === cat ? "#000" : "#5a7a30" }}
              >{cat}</button>
            ))}
          </div>
        )}

        {/* Results count */}
        {(shopSearch || shopCatFilter) && filteredShop.length > 0 && (
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".18em", marginBottom:16 }}>
            ▸ {filteredShop.length} ITEM{filteredShop.length !== 1 ? "S" : ""} FOUND
            {shopSearch && <span> — "{shopSearch.toUpperCase()}"</span>}
          </div>
        )}

        {filteredShop.length === 0 && (shopSearch || shopCatFilter) && (
          <div style={{ maxWidth:1100, margin:"0 auto", padding:"60px 16px", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:16, opacity:.2 }}>🎯</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".2em", color:"#2a3a10", textTransform:"uppercase" }}>NO ITEMS FOUND</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#1a2808", letterSpacing:".15em", marginTop:8 }}>TRY A DIFFERENT SEARCH OR CLEAR FILTERS</div>
            <button onClick={() => { setShopSearch(""); setShopCatFilter(""); }} style={{ marginTop:16, background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", padding:"6px 18px", cursor:"pointer" }}>CLEAR FILTERS</button>
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
          {paginatedShop.map((item, idx) => {
            const hasV = item.variants?.length > 0;
            const displayPrice = hasV
              ? Math.min(...item.variants.map(v => Number(v.price)))
              : (item.onSale && item.salePrice ? item.salePrice : item.price);
            const inStock = item.stock > 0;
            const sl = stockLabel(hasV ? item.variants.reduce((s,v)=>s+Number(v.stock),0) : item.stock);
            return (
              <div key={item.id}
                style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", position:"relative", transition:"border-color .15s, transform .15s", display:"flex", flexDirection:"column" }}
                onClick={() => onProductClick(item)}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-3px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}
              >
                {/* Scanlines */}
                <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)", pointerEvents:"none", zIndex:5 }} />
                {/* Corner brackets */}
                {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                  <div key={v+h} style={{ position:"absolute", width:12, height:12, zIndex:6,
                    top:v==="top"?5:"auto", bottom:v==="bottom"?5:"auto",
                    left:h==="left"?5:"auto", right:h==="right"?5:"auto",
                    borderTop:v==="top"?"1px solid rgba(200,255,0,.4)":"none",
                    borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.4)":"none",
                    borderLeft:h==="left"?"1px solid rgba(200,255,0,.4)":"none",
                    borderRight:h==="right"?"1px solid rgba(200,255,0,.4)":"none",
                  }} />
                ))}

                {/* Top ID strip */}
                <div style={{ background:"rgba(0,0,0,.7)", borderBottom:"1px solid #1a2808", padding:"5px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"relative", zIndex:6 }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".18em", color:"rgba(200,255,0,.5)" }}>QM · ITEM-{String(idx+1).padStart(3,"0")}</span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:sl.color, letterSpacing:".12em" }}>{sl.text}</span>
                </div>

                {/* Image */}
                <div style={{ height:170, background:"#080a06", overflow:"hidden", position:"relative" }}>
                  {(() => { const cardImg = (item.images && item.images.length > 0) ? item.images[0] : item.image; return cardImg
                    ? <img src={cardImg} alt="" onError={e=>{e.target.style.display='none';}} style={{ width:"100%", height:"100%", objectFit:"cover", filter:"contrast(1.05) saturate(0.8)", transition:"transform .3s" }}
                        onMouseOver={e => e.currentTarget.style.transform="scale(1.05)"}
                        onMouseOut={e => e.currentTarget.style.transform=""} />
                    : <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                        <div style={{ fontSize:40, opacity:.08 }}>🎯</div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".15em", color:"#1e2c0a" }}>NO IMAGERY</div>
                      </div>;
                  })()}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:40, background:"linear-gradient(to top,rgba(12,16,9,1),transparent)", zIndex:2 }} />
                  {(item.images && item.images.length > 1) && (
                    <div style={{ position:"absolute", bottom:6, right:8, zIndex:3, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"rgba(200,255,0,.7)", letterSpacing:".1em" }}>📷 {item.images.length}</div>
                  )}
                  {!inStock && !hasV && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, letterSpacing:".2em", color:"#ef4444", border:"2px solid #ef4444", padding:"4px 14px", transform:"rotate(-3deg)" }}>OUT OF STOCK</span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding:"12px 12px 0", position:"relative", zIndex:6, flex:1 }}>
                  <div className="gap-2 mb-1" style={{ flexWrap:"wrap" }}>
                    {item.noPost && <span className="tag tag-gold" style={{ fontSize:9 }}>COLLECT ONLY</span>}
                    {hasV && <span className="tag tag-blue" style={{ fontSize:9 }}>{item.variants.length} VARIANTS</span>}
                    {item.onSale && !hasV && <span className="tag tag-red" style={{ fontSize:9 }}>SALE</span>}
                  </div>
                  {item.category && (
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".2em", color:"#4a6a20", textTransform:"uppercase", marginBottom:4 }}>◈ {item.category}</div>
                  )}
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, letterSpacing:".06em", textTransform:"uppercase", color:"#dce8c8", lineHeight:1.1, marginBottom:6 }}>{item.name}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", lineHeight:1.6, marginBottom:10 }}>
                    {(item.description||"").replace(/[*#_~`]/g,"").slice(0,70)}{(item.description||"").length>70?"…":""}
                  </div>
                </div>

                {/* Footer */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.3)", position:"relative", zIndex:6 }}>
                  <div>
                    {hasV && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", marginBottom:2, letterSpacing:".1em" }}>FROM</div>}
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color:"#c8ff00", lineHeight:1 }}>
                      £{cu?.vipStatus === "active" ? (displayPrice * 0.9).toFixed(2) : Number(displayPrice).toFixed(2)}
                      {cu?.vipStatus === "active" && <span style={{ fontSize:9, color:"#c8a000", marginLeft:5, fontFamily:"'Share Tech Mono',monospace" }}>VIP</span>}
                    </div>
                    {(() => {
                      const rev = reviewSummary.get(item.id);
                      if (rev) return (
                        <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:4 }}>
                          {[1,2,3,4,5].map(n => (
                            <span key={n} style={{ fontSize:10, color: n <= Math.round(rev.avg) ? "#c8a000" : "#2a3a10", lineHeight:1 }}>★</span>
                          ))}
                          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#3a5010", letterSpacing:".06em" }}>({rev.count})</span>
                        </div>
                      );
                      return null;
                    })()}
                    {(() => {
                      const soldCount = (data.shopOrders || []).reduce((total, order) => {
                        return total + (order.items || []).filter(i => i.id === item.id || i.productId === item.id).reduce((s, i) => s + (i.qty || 1), 0);
                      }, 0);
                      return soldCount > 0 ? (
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#3a5010", letterSpacing:".08em", marginTop:2 }}>{soldCount} SOLD</div>
                      ) : null;
                    })()}
                  </div>
                  <button className="btn btn-primary" style={{ padding:"7px 16px", fontSize:10, letterSpacing:".15em", borderRadius:0 }} disabled={!inStock && !hasV}>
                    {!inStock && !hasV ? "OUT OF STOCK" : "▸ ACQUIRE"}
                  </button>
                </div>

                {/* Barcode strip */}
                <div style={{ borderTop:"1px solid #1a2808", padding:"3px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,.5)", position:"relative", zIndex:6 }}>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:"#1a2808", letterSpacing:".06em" }}>
                    {item.id ? item.id.slice(0,10).toUpperCase() : "----------"}
                  </div>
                  <div style={{ display:"flex", gap:"1px", alignItems:"center" }}>
                    {Array.from({length:16},(_,i) => (
                      <div key={i} style={{ background:"#1a2808", width:i%3===0?2:1, height:2+Math.abs(Math.sin(i*2.1)*5), borderRadius:1 }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {hasMoreShop && (
          <div style={{ textAlign:"center", marginTop:32 }}>
            <button onClick={() => setShopPage(p => p + 1)}
              style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".22em", padding:"10px 32px", cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#c8ff00"; e.currentTarget.style.color="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#5a7a30"; }}>
              ▸ LOAD MORE — {filteredShop.length - shopPage * SHOP_PAGE_SIZE} MORE ITEMS
            </button>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3a10", letterSpacing:".15em", marginTop:8 }}>
              SHOWING {Math.min(shopPage * SHOP_PAGE_SIZE, filteredShop.length)} OF {filteredShop.length}
            </div>
          </div>
        )}
      </div>

      {/* CART MODAL */}
      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", borderRadius:0 }}>
            {/* Modal header */}
            <div style={{ borderBottom:"1px solid #2a3a10", paddingBottom:16, marginBottom:16 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".25em", color:"var(--muted)", marginBottom:4 }}>◈ — QUARTERMASTER</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:24, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>LOADOUT REVIEW</div>
            </div>

            {cart.length === 0
              ? <div style={{ textAlign:"center", padding:"32px 0", fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--muted)", letterSpacing:".15em" }}>LOADOUT IS EMPTY</div>
              : (
              <>
                {cart.map(item => (
                  <div key={item.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #1a2808" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, letterSpacing:".06em", fontSize:14, textTransform:"uppercase", color:"#b0c090" }}>{item.name}</div>
                      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", marginTop:2 }}>£{item.price.toFixed(2)} EACH</div>
                    </div>
                    <div className="gap-2" style={{ alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", border:"1px solid #2a3a10", background:"#080a06" }}>
                        <button onClick={() => updateCartQty(item.key, item.qty - 1)} style={{ background:"none", border:"none", color:"#c8ff00", padding:"4px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>−</button>
                        <span style={{ padding:"0 8px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, color:"#c8ff00" }}>{item.qty}</span>
                        <button onClick={() => updateCartQty(item.key, item.qty + 1)} style={{ background:"none", border:"none", color:"#c8ff00", padding:"4px 10px", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>+</button>
                      </div>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, fontWeight:900, color:"#c8ff00", minWidth:60, textAlign:"right" }}>£{(item.price * item.qty).toFixed(2)}</span>
                      <button style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }} onClick={() => removeFromCart(item.key)}>✕</button>
                    </div>
                  </div>
                ))}

                {!hasNoPost && postageOptions.length > 0 && (
                  <div className="form-group mt-2">
                    <label style={{ color:"#3a5010", fontSize:9, letterSpacing:".2em" }}>POSTAGE METHOD</label>
                    <select value={postageId} onChange={e => setPostageId(e.target.value)} style={{ background:"#080a06", border:"1px solid #2a3a10", borderRadius:0, color:"#b0c090", fontFamily:"'Barlow Condensed',sans-serif" }}>
                      {postageOptions.map(p => <option key={p.id} value={p.id}>{p.name} — £{Number(p.price).toFixed(2)}</option>)}
                    </select>
                  </div>
                )}
                {hasNoPost && <div className="alert alert-gold mt-1" style={{ borderRadius:0 }}>⚠ COLLECTION-ONLY ITEMS — NO POSTING</div>}

                {/* ── Checkout section divider ── */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:18, marginBottom:14 }}>
                  <div style={{ flex:1, height:1, background:"#2a3a10" }} />
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:".22em", color:"#3a5010", textTransform:"uppercase", flexShrink:0 }}>◈ CHECKOUT</div>
                  <div style={{ flex:1, height:1, background:"#2a3a10" }} />
                </div>

                {cu?.vipStatus === "active" && <div style={{ background:"rgba(200,160,0,.06)", border:"1px solid rgba(200,160,0,.2)", padding:"8px 12px", marginBottom:8, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".12em", color:"#c8a000" }}>★ VIP 10% DISCOUNT APPLIED</div>}

                {/* ── Discount Code ── */}
                {cu && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 9, letterSpacing: '.2em', color: '#3a5010', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>🏷️ Discount / Voucher Code</div>
                    {!shopAppliedDiscount ? (
                      <div style={{ display: 'flex', gap: 0 }}>
                        <input
                          value={shopDiscountInput}
                          onChange={e => { setShopDiscountInput(e.target.value.toUpperCase()); setShopDiscountError(''); }}
                          onKeyDown={e => e.key === 'Enter' && applyShopDiscount(cu)}
                          placeholder="ENTER CODE"
                          style={{ flex: 1, background: '#0c1009', border: '1px solid #2a3a10', borderRight: 'none', color: '#c8e878', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '.1em', padding: '8px 10px', outline: 'none', textTransform: 'uppercase', borderRadius: 0 }}
                          onFocus={e => e.target.style.borderColor = '#4a6820'}
                          onBlur={e => e.target.style.borderColor = '#2a3a10'}
                        />
                        <button onClick={() => applyShopDiscount(cu)} disabled={shopDiscountChecking || !shopDiscountInput.trim()}
                          style={{ background: shopDiscountInput.trim() ? 'rgba(200,255,0,.15)' : 'rgba(200,255,0,.04)', border: '1px solid #2a3a10', color: shopDiscountInput.trim() ? '#c8ff00' : '#3a5010', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '.1em', padding: '8px 12px', cursor: shopDiscountInput.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all .15s' }}>
                          {shopDiscountChecking ? '⏳' : 'APPLY'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(200,255,0,.08)', border: '1px solid rgba(200,255,0,.3)', borderLeft: '3px solid #c8ff00' }}>
                        <div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: '#c8ff00', letterSpacing: '.08em' }}>
                            ✓ {shopAppliedDiscount.code}
                          </div>
                          <div style={{ fontSize: 10, color: '#5a7a30', marginTop: 1 }}>
                            {shopAppliedDiscount.type === 'percent' ? `${shopAppliedDiscount.value}% off` : `£${Number(shopAppliedDiscount.value).toFixed(2)} off`} applied
                          </div>
                        </div>
                        <button onClick={() => { setShopAppliedDiscount(null); setShopDiscountInput(''); setShopDiscountError(''); }}
                          style={{ background: 'none', border: '1px solid #2a3a10', color: '#5a7a30', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '4px 8px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>REMOVE</button>
                      </div>
                    )}
                    {shopDiscountError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>⚠ {shopDiscountError}</div>}
                  </div>
                )}

                {/* ── Valid Defence ── */}
                <div style={{ marginTop:14, background:"#080a06", border:"1px solid #1a2808", padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".22em", color:"#3a5010", textTransform:"uppercase" }}>🪪 VALID DEFENCE</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", letterSpacing:".1em" }}>— OPTIONAL</div>
                  </div>
                  <input
                    value={validDefence}
                    onChange={e => setValidDefence(e.target.value)}
                    placeholder="e.g. UKARA-2025-042 or site membership no."
                    style={{ width:"100%", boxSizing:"border-box", background:"#0c1009", border:"1px solid #2a3a10", borderRadius:0, color:"#b0c090", fontFamily:"'Share Tech Mono',monospace", fontSize:11, padding:"8px 10px", outline:"none" }}
                    onFocus={e => e.target.style.borderColor="#c8ff00"}
                    onBlur={e  => e.target.style.borderColor="#2a3a10"}
                  />
                  <div style={{ marginTop:6, fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3a10", lineHeight:1.7 }}>
                    Enter your UKARA ID, site membership number, or other valid defence for purchasing RIFs. Leave blank if not purchasing RIF items.
                  </div>
                </div>

                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #2a3a10' }}>
                  {shopDiscountSaving > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, marginBottom: 4, color: '#5a7a30' }}>
                        <span>Subtotal</span>
                        <span>£{subTotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, marginBottom: 6, color: '#c8ff00', background: 'rgba(200,255,0,.05)', padding: '3px 6px', borderRadius: 2 }}>
                        <span>🏷️ Code: {shopAppliedDiscount?.code}</span>
                        <span style={{ fontWeight: 700 }}>−£{shopDiscountSaving.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, color: '#e8f0d8' }}>
                    <span>TOTAL</span>
                    <span style={{ color: '#c8ff00' }}>£{grandTotal.toFixed(2)}</span>
                  </div>
                  {!hasNoPost && postageTotal > 0 && (
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: '#3a5010', textAlign: 'right', marginTop: 2 }}>
                      incl. {postage.name} £{postageTotal.toFixed(2)}
                    </div>
                  )}
                </div>

                {!cu && <div className="alert alert-red mt-2" style={{ borderRadius:0 }}>LOG IN TO COMPLETE REQUISITION</div>}
                {cu?.role === "admin" && <div className="alert alert-red mt-2" style={{ borderRadius:0 }}>⚠ ADMIN ACCOUNTS CANNOT PLACE ORDERS</div>}
                {shopSquareError && <div className="alert alert-red mt-1" style={{ borderRadius:0 }}>⚠ {shopSquareError}</div>}
                {placing && <div className="alert alert-blue mt-1" style={{ borderRadius:0 }}>⏳ PROCESSING REQUISITION…</div>}
                {cu && cu.role !== "admin" && grandTotal > 0 && (
                  <SquareCheckoutButton
                    amount={grandTotal}
                    description={`Swindon Airsoft Armoury — ${cart.length} item${cart.length > 1 ? "s" : ""}`}
                    onSuccess={placeOrderAfterPayment}
                    disabled={placing}
                  />
                )}
              </>
            )}
            <button style={{ width:"100%", marginTop:12, background:"transparent", border:"1px solid #2a3a10", color:"#3a5010", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".2em", padding:"10px", cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#c8ff00"; e.currentTarget.style.color="#c8ff00"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.color="#3a5010"; }}
              onClick={() => setCartOpen(false)}>✕ CLOSE LOADOUT</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Reviews ────────────────────────────────────────
function ProductReviews({ item, cu }) {
  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [myReview, setMyReview]     = useState(null);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [editing, setEditing]       = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftBody, setDraftBody]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", item.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReviews(data || []);
      if (cu) {
        const mine = (data || []).find(r => r.user_id === cu.id);
        setMyReview(mine || null);
        if (mine) { setDraftRating(mine.rating); setDraftBody(mine.body); }

        // Check if this user has a confirmed (dispatched/completed) order containing this product
        const { data: orders } = await supabase
          .from("shop_orders")
          .select("items, status")
          .eq("user_id", cu.id)
          .in("status", ["dispatched", "completed", "processing"]);
        const purchased = (orders || []).some(order =>
          (order.items || []).some(i => i.id === item.id || i.productId === item.id)
        );
        setHasPurchased(purchased);
      }
    } catch {}
    finally { setLoading(false); }
  }, [item.id, cu]);

  useEffect(() => { load(); }, [load]);

  const avg = reviews.length ? (reviews.reduce((s,r) => s + r.rating, 0) / reviews.length) : 0;

  const Stars = ({ rating, size = 14, interactive = false, onSet }) => (
    <div style={{ display:"flex", gap:2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n}
          style={{ fontSize:size, color: n <= rating ? "#c8a000" : "#2a3a10", cursor: interactive ? "pointer" : "default", lineHeight:1 }}
          onClick={() => interactive && onSet && onSet(n)}
        >★</span>
      ))}
    </div>
  );

  const saveReview = async () => {
    if (!cu) return;
    if (!draftBody.trim()) { setError("Please write something before submitting."); return; }
    setSaving(true); setError("");
    try {
      if (myReview) {
        const { error } = await supabase.from("product_reviews")
          .update({ rating: draftRating, body: draftBody.trim() })
          .eq("id", myReview.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_reviews").insert({
          product_id: item.id,
          user_id:    cu.id,
          user_name:  cu.name || "Operative",
          rating:     draftRating,
          body:       draftBody.trim(),
        });
        if (error) throw error;
      }
      setEditing(false);
      await load();
    } catch (e) { setError(e.message || "Save failed."); }
    finally { setSaving(false); }
  };

  const deleteReview = async () => {
    if (!myReview) return;
    setDeleting(true);
    try {
      await supabase.from("product_reviews").delete().eq("id", myReview.id);
      setMyReview(null); setDraftBody(""); setDraftRating(5);
      await load();
    } catch {}
    finally { setDeleting(false); }
  };

  const SectionHead = () => (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>◈ —</div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>
        FIELD <span style={{ color:"#c8ff00" }}>REPORTS</span>
      </div>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>— ◈</div>
      {reviews.length > 0 && (
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <Stars rating={Math.round(avg)} />
          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, color:"#c8a000" }}>{avg.toFixed(1)}</span>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".1em" }}>({reviews.length})</span>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 60px" }}>
      <div style={{ borderTop:"1px solid #1a2808", paddingTop:32 }}>
        <SectionHead />

        {/* Write / edit review */}
        {cu && !myReview && !editing && hasPurchased && (
          <button
            onClick={() => setEditing(true)}
            style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", padding:"8px 18px", cursor:"pointer", marginBottom:24, transition:"border-color .15s, color .15s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#c8ff00";e.currentTarget.style.color="#c8ff00";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3a10";e.currentTarget.style.color="#5a7a30";}}
          >◈ SUBMIT FIELD REPORT</button>
        )}
        {cu && !myReview && !editing && !hasPurchased && (
          <div style={{ background:"#0c1009", border:"1px solid #1a2808", borderLeft:"3px solid #2a3a10", padding:"10px 16px", marginBottom:20, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", letterSpacing:".1em" }}>
            ◈ PURCHASE REQUIRED — Only players who have ordered this item can submit a field report.
          </div>
        )}
        {cu && myReview && !editing && (
          <div style={{ background:"#0c1009", border:"1px solid #2a3a10", borderLeft:"3px solid #c8a000", padding:"12px 16px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#5a7a30", letterSpacing:".1em" }}>YOU ALREADY SUBMITTED A REPORT</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setEditing(true)} style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".12em", padding:"5px 12px", cursor:"pointer" }}>EDIT</button>
              <button onClick={deleteReview} disabled={deleting} style={{ background:"transparent", border:"1px solid #3a1a1a", color:"#6b3333", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".12em", padding:"5px 12px", cursor:"pointer" }}>{deleting ? "…" : "DELETE"}</button>
            </div>
          </div>
        )}
        {(editing) && (
          <div style={{ background:"#0c1009", border:"1px solid #2a3a10", padding:"18px", marginBottom:24 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".22em", color:"#c8ff00", marginBottom:14 }}>⬡ {myReview ? "EDIT" : "SUBMIT"} FIELD REPORT</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".15em", marginBottom:6 }}>RATING</div>
              <Stars rating={draftRating} size={22} interactive onSet={setDraftRating} />
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".15em", marginBottom:6 }}>REPORT</div>
              <textarea
                value={draftBody}
                onChange={e => setDraftBody(e.target.value)}
                maxLength={600}
                rows={4}
                placeholder="Share your experience with this item..."
                style={{ width:"100%", background:"#080a06", border:"1px solid #2a3a10", color:"#8aaa50", fontFamily:"'Share Tech Mono',monospace", fontSize:11, padding:"10px 12px", resize:"vertical", outline:"none", letterSpacing:".05em", lineHeight:1.6 }}
              />
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", letterSpacing:".1em", marginTop:3, textAlign:"right" }}>{draftBody.length}/600</div>
            </div>
            {error && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#ef4444", letterSpacing:".1em", marginBottom:10 }}>⚠ {error}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveReview} disabled={saving}
                style={{ background:"#c8ff00", color:"#000", border:"none", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", padding:"8px 20px", cursor:"pointer" }}>
                {saving ? "SAVING…" : "SUBMIT REPORT"}
              </button>
              <button onClick={() => { setEditing(false); setError(""); if (myReview) { setDraftRating(myReview.rating); setDraftBody(myReview.body); } }}
                style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em", padding:"8px 14px", cursor:"pointer" }}>
                CANCEL
              </button>
            </div>
          </div>
        )}

        {loading && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3a10", letterSpacing:".2em", padding:"20px 0" }}>RETRIEVING FIELD REPORTS…</div>}

        {!loading && reviews.length === 0 && (
          <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"32px 24px", textAlign:"center" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".2em", color:"#2a3a10", textTransform:"uppercase", marginBottom:6 }}>NO FIELD REPORTS YET</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#1a2808", letterSpacing:".12em" }}>Be the first to submit a report on this item.</div>
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {reviews.map(r => (
            <div key={r.id} style={{ background:"#0c1009", border:`1px solid ${r.user_id === cu?.id ? "#2a3a10" : "#1a2808"}`, padding:"14px 16px", position:"relative" }}>
              {r.user_id === cu?.id && <div style={{ position:"absolute", top:10, right:12, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#c8a000", letterSpacing:".12em" }}>YOUR REPORT</div>}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                <Stars rating={r.rating} size={13} />
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".1em", color:"#8aaa50", textTransform:"uppercase" }}>{r.user_name}</span>
                <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", background:"rgba(200,255,0,.06)", border:"1px solid #1a2808", padding:"1px 6px", letterSpacing:".1em" }}>✓ VERIFIED PURCHASE</span>
                <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", letterSpacing:".1em", marginLeft:"auto" }}>
                  {new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
                </span>
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#5a7a30", lineHeight:1.7, letterSpacing:".04em" }}>{r.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Product Page ──────────────────────────────────────────
function ProductPage({ item, cu, onBack, onAddToCart, cartCount, onCartOpen, shopItems = [] }) {
  const isMobile = useMobile(700);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [imgLightbox, setImgLightbox] = useState(null); // url string when open

  const hasVariants = item.variants?.length > 0;
  const effectivePrice = selectedVariant
    ? Number(selectedVariant.price)
    : hasVariants ? null
    : (item.onSale && item.salePrice ? item.salePrice : item.price);
  const vipPrice = effectivePrice !== null && cu?.vipStatus === "active"
    ? (effectivePrice * 0.9).toFixed(2) : null;
  const displayPrice = vipPrice || (effectivePrice !== null ? Number(effectivePrice).toFixed(2) : null);
  const stockAvail = selectedVariant ? Number(selectedVariant.stock) : hasVariants ? 0 : item.stock;
  const canAdd = (!hasVariants || selectedVariant) && stockAvail > 0;

  const [prodRevSummary, setProdRevSummary] = useState(null);
  useEffect(() => {
    supabase.from("product_reviews").select("rating").eq("product_id", item.id)
      .then(({ data: rows }) => {
        if (!rows || rows.length === 0) return;
        const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
        setProdRevSummary({ avg, count: rows.length });
      });
  }, [item.id]);

  const handleAdd = () => {
    if (!canAdd) return;
    onAddToCart(item, hasVariants ? selectedVariant : null, qty);
    setQty(1);
  };

  return (
    <>
    <div style={{ background:"#080a06", minHeight:"100vh" }}>
      {/* Breadcrumb bar */}
      <div style={{ background:"#0c1009", borderBottom:"1px solid #1a2808", padding:"12px 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", gap:8, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3a10" }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#c8ff00", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, letterSpacing:".15em", fontSize:11, padding:0 }}>
            ← ARMOURY
          </button>
          <span style={{ color:"#1a2808" }}>▸</span>
          <span style={{ color:"#3a5010", textTransform:"uppercase", letterSpacing:".12em" }}>{item.name}</span>
          <div style={{ marginLeft:"auto" }}>
            <button style={{ background:"rgba(200,255,0,.06)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".18em", padding:"6px 14px", cursor:"pointer" }}
              onClick={onCartOpen}>
              ◈ LOADOUT {cartCount > 0 && <span style={{ background:"#c8ff00", color:"#000", padding:"1px 6px", fontSize:10, marginLeft:4, fontWeight:900 }}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 16px 80px" }}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 32, marginBottom:40 }}>

        {/* LEFT — Image */}
        <div>
          <div style={{ background:"#0d0d0d", border:"1px solid #2a2a2a", borderTop:"3px solid var(--accent)", position:"relative", overflow:"hidden" }}>
            {/* Corner brackets */}
            <div style={{ position:"absolute", top:10, left:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", top:10, right:10, width:18, height:18, borderTop:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, left:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderLeft:"2px solid var(--accent)", zIndex:2 }} />
            <div style={{ position:"absolute", bottom:10, right:10, width:18, height:18, borderBottom:"2px solid var(--accent)", borderRight:"2px solid var(--accent)", zIndex:2 }} />
            {(() => {
              const variantImg = selectedVariant?.image;
              const allImgs = variantImg ? [variantImg, ...(item.images||[]).filter(x => x !== variantImg)] : (item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []));
              const displayImg = allImgs[activeImgIdx] || allImgs[0] || null;
              return (
                <>
                  {displayImg
                    ? (
                      <div style={{ position:"relative", cursor:"zoom-in" }} onClick={() => setImgLightbox(displayImg)}>
                        <img src={displayImg} alt={item.name} onError={e=>{e.target.style.display='none';}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", display:"block", background:"#0a0a0a", transition:"opacity .2s" }} />
                        <div style={{ position:"absolute", bottom:8, right:8, background:"rgba(0,0,0,.7)", border:"1px solid rgba(200,255,0,.3)", color:"rgba(200,255,0,.8)", fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".15em", padding:"3px 8px", pointerEvents:"none" }}>⊕ ENLARGE</div>
                      </div>
                    )
                    : <div style={{ aspectRatio:"4/3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:80, color:"#333" }}>🎯</div>
                  }
                  {allImgs.length > 1 && (
                    <div style={{ display:"flex", gap:4, padding:"8px 8px 4px", background:"#080a06", flexWrap:"wrap" }}>
                      {allImgs.map((img, i) => (
                        <div key={i} onClick={() => setActiveImgIdx(i)}
                          style={{ width:52, height:52, border: i === activeImgIdx ? "2px solid var(--accent)" : "1px solid #1a2808", cursor:"pointer", overflow:"hidden", flexShrink:0, opacity: i === activeImgIdx ? 1 : 0.55, transition:"all .15s" }}>
                          <img src={img} alt="" onError={e=>{e.target.style.display='none';}} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {!item.stock && (
              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, letterSpacing:".2em", color:"var(--red)", border:"3px solid var(--red)", padding:"8px 24px", transform:"rotate(-5deg)" }}>OUT OF STOCK</span>
              </div>
            )}
          </div>

          {/* Spec strip */}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:1, marginTop:2 }}>
            {[
              { label:"POSTAGE", val: item.noPost ? "Collect Only" : "Standard" },
              { label:"AVAILABILITY", val: hasVariants && !selectedVariant ? "— SELECT —" : stockLabel(stockAvail).text, color: hasVariants && !selectedVariant ? "var(--muted)" : stockLabel(stockAvail).color },
              { label:"STATUS", val: hasVariants && !selectedVariant ? "— SELECT —" : stockAvail > 0 ? "IN STOCK" : "OUT OF STOCK", color: hasVariants && !selectedVariant ? "var(--muted)" : stockAvail > 0 ? "var(--accent)" : "var(--red)" },
            ].map(s => (
              <div key={s.label} style={{ background:"#0d0d0d", border:"1px solid #1a1a1a", padding:"8px 12px" }}>
                <div style={{ fontSize:8, letterSpacing:".2em", color:"var(--muted)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, textTransform:"uppercase", marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:12, fontFamily:"'Share Tech Mono',monospace", color: s.color || "var(--text)" }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Details */}
        <div>
          {/* Tags */}
          <div className="gap-2 mb-2">
            {item.noPost && <span className="tag tag-gold">⚠️ Collect Only</span>}
            {item.onSale && !hasVariants && <span className="tag tag-red">ON SALE</span>}
            {hasVariants && <span className="tag tag-blue">{item.variants.length} variants</span>}
            
          </div>

          {/* Name */}
          <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, color:"#fff", letterSpacing:".04em", textTransform:"uppercase", lineHeight:1, marginBottom:8 }}>{item.name}</h1>

          {/* Rating summary */}
          {prodRevSummary && (
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ fontSize:14, color: n <= Math.round(prodRevSummary.avg) ? "#c8a000" : "#2a3a10", lineHeight:1 }}>★</span>
              ))}
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:14, color:"#c8a000" }}>{prodRevSummary.avg.toFixed(1)}</span>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".08em" }}>({prodRevSummary.count} {prodRevSummary.count === 1 ? "report" : "reports"})</span>
            </div>
          )}

          {/* Description */}
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:13, color:"var(--muted)", lineHeight:1.8, marginBottom:20, borderLeft:"3px solid var(--accent)", paddingLeft:12 }}
            dangerouslySetInnerHTML={{ __html: renderMd(item.description) || "No description available." }}
          />

          {/* Variant selector */}
          {hasVariants && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:9, letterSpacing:".25em", color:"var(--accent)", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, textTransform:"uppercase", marginBottom:10 }}>
                SELECT VARIANT
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {item.variants.map(v => {
                  const outV = Number(v.stock) < 1;
                  const sel = selectedVariant?.id === v.id;
                  return (
                    <button key={v.id}
                      onClick={() => { if (!outV) { setSelectedVariant(v); setQty(1); } }}
                      style={{
                        padding:"10px 18px", fontFamily:"'Barlow Condensed',sans-serif",
                        fontSize:13, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase",
                        background: sel ? "var(--accent)" : outV ? "#0a0a0a" : "#1a1a1a",
                        border: `2px solid ${sel ? "var(--accent)" : outV ? "#222" : "#333"}`,
                        color: sel ? "#fff" : outV ? "#333" : "var(--text)",
                        cursor: outV ? "not-allowed" : "pointer",
                        position:"relative",
                      }}>
                      <div>{v.name}</div>
                      <div style={{ fontSize:11, color: sel ? "rgba(255,255,255,.8)" : outV ? "#2a2a2a" : "var(--muted)", marginTop:2 }}>
                        {outV ? stockLabel(0).text : `£${Number(v.price).toFixed(2)}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price */}
          <div style={{ marginBottom:20 }}>
            {displayPrice ? (
              <div style={{ display:"flex", alignItems:"baseline", gap:12 }}>
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:48, color:"var(--accent)", lineHeight:1 }}>£{displayPrice}</span>
                {vipPrice && <span className="tag tag-gold">VIP PRICE</span>}
                {!hasVariants && item.onSale && item.salePrice && (
                  <span style={{ textDecoration:"line-through", color:"var(--muted)", fontSize:18 }}>£{item.price}</span>
                )}
                {cu?.vipStatus === "active" && !vipPrice && (
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"var(--gold)" }}>10% VIP applied</span>
                )}
              </div>
            ) : (
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:14, color:"var(--muted)" }}>
                {hasVariants && !selectedVariant ? "↑ Select a variant to see price" : "—"}
              </div>
            )}
          </div>

          {/* Qty + Add to Cart */}
          {canAdd ? (
            <div style={{ display:"flex", gap:12, alignItems:"stretch", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", border:"1px solid #333", background:"#0d0d0d" }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ background:"none", border:"none", color:"var(--text)", padding:"12px 18px", fontSize:20, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>−</button>
                <span style={{ padding:"0 16px", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, color:"#fff", minWidth:50, textAlign:"center" }}>{qty}</span>
                <button onClick={() => setQty(q => Math.min(stockAvail, q + 1))} style={{ background:"none", border:"none", color:"var(--text)", padding:"12px 18px", fontSize:20, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>+</button>
              </div>
              <button className="btn btn-primary" style={{ flex:1, padding:"12px 24px", fontSize:14, letterSpacing:".15em" }} onClick={handleAdd}>
                ADD TO CART × {qty}
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ width:"100%", padding:"14px", marginBottom:12, cursor:"default", opacity:.5 }} disabled>
              {hasVariants && !selectedVariant ? "SELECT A VARIANT FIRST" : "OUT OF STOCK"}
            </button>
          )}

          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#3a5010", display:"flex", gap:16, letterSpacing:".06em" }}>
            <span>{item.noPost ? "⚠ COLLECTION AT GAME DAY ONLY" : "✓ STANDARD POSTAGE AVAILABLE"}</span>
            
          </div>
        </div>
      </div>
      </div>
    </div>
    {/* Image lightbox */}
    {imgLightbox && (
      <div onClick={() => setImgLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.96)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", cursor:"zoom-out" }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position:"absolute", width:32, height:32, zIndex:501,
              top:v==="top"?12:"auto", bottom:v==="bottom"?12:"auto",
              left:h==="left"?12:"auto", right:h==="right"?12:"auto",
              borderTop:v==="top"?"2px solid rgba(200,255,0,.4)":"none",
              borderBottom:v==="bottom"?"2px solid rgba(200,255,0,.4)":"none",
              borderLeft:h==="left"?"2px solid rgba(200,255,0,.4)":"none",
              borderRight:h==="right"?"2px solid rgba(200,255,0,.4)":"none",
            }} />
          ))}
          <img src={imgLightbox} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth:"90vw", maxHeight:"88vh", objectFit:"contain", boxShadow:"0 0 80px rgba(0,0,0,.9), 0 0 0 1px #1a2808", cursor:"default" }} />
          <button onClick={() => setImgLightbox(null)}
            style={{ position:"absolute", top:16, right:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:14, width:36, height:36, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, letterSpacing:".1em", zIndex:502 }}>✕</button>
          {/* Navigate between images */}
          {(() => {
            const variantImg = selectedVariant?.image;
            const allImgs = variantImg ? [variantImg, ...(item.images||[]).filter(x => x !== variantImg)] : (item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []));
            const curIdx = allImgs.indexOf(imgLightbox);
            if (allImgs.length < 2) return null;
            return (
              <>
                <button onClick={e => { e.stopPropagation(); const i = (curIdx - 1 + allImgs.length) % allImgs.length; setImgLightbox(allImgs[i]); setActiveImgIdx(i); }}
                  style={{ position:"absolute", left:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:24, width:48, height:48, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>‹</button>
                <button onClick={e => { e.stopPropagation(); const i = (curIdx + 1) % allImgs.length; setImgLightbox(allImgs[i]); setActiveImgIdx(i); }}
                  style={{ position:"absolute", right:16, background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontSize:24, width:48, height:48, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900 }}>›</button>
                <div style={{ position:"absolute", bottom:16, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"rgba(200,255,0,.4)", letterSpacing:".2em" }}>
                  {String(curIdx+1).padStart(2,"0")} / {String(allImgs.length).padStart(2,"0")}
                </div>
              </>
            );
          })()}
      </div>
    )}

    {/* Reviews */}
    <ProductReviews item={item} cu={cu} />

    {/* Related Products */}
    {(() => {
      const related = shopItems
        .filter(p => p.id !== item.id && p.published !== false && p.category && p.category === item.category)
        .slice(0, 3);
      if (related.length === 0) return null;
      return (
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 60px" }}>
          <div style={{ borderTop:"1px solid #1a2808", paddingTop:32, marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>◈ —</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>RELATED <span style={{ color:"#c8ff00" }}>EQUIPMENT</span></div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>— ◈</div>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#2a3a10", letterSpacing:".15em", marginTop:4 }}>
              MORE FROM: {(item.category || "").toUpperCase()}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
            {related.map(rel => {
              const hasV = rel.variants?.length > 0;
              const relPrice = hasV
                ? Math.min(...rel.variants.map(v => Number(v.price)))
                : (rel.onSale && rel.salePrice ? rel.salePrice : rel.price);
              const relImg = rel.images?.[0] || rel.image || null;
              const relStock = hasV ? rel.variants.reduce((s,v)=>s+Number(v.stock),0) : rel.stock;
              const sl = stockLabel(relStock);
              return (
                <div key={rel.id} onClick={() => { onBack(); setTimeout(() => onProductClick && onProductClick(rel), 50); }}
                  style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", cursor:"pointer", transition:"border-color .15s, transform .15s", position:"relative" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="#2a3a10"; e.currentTarget.style.transform="translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="#1a2808"; e.currentTarget.style.transform=""; }}>
                  {/* Corner brackets */}
                  {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
                    <div key={v+h} style={{ position:"absolute", width:10, height:10, zIndex:3,
                      top:v==="top"?4:"auto", bottom:v==="bottom"?4:"auto",
                      left:h==="left"?4:"auto", right:h==="right"?4:"auto",
                      borderTop:v==="top"?"1px solid rgba(200,255,0,.3)":"none",
                      borderBottom:v==="bottom"?"1px solid rgba(200,255,0,.3)":"none",
                      borderLeft:h==="left"?"1px solid rgba(200,255,0,.3)":"none",
                      borderRight:h==="right"?"1px solid rgba(200,255,0,.3)":"none" }} />
                  ))}
                  {relImg
                    ? <img src={relImg} alt={rel.name} onError={e=>{e.target.style.display="none";}} style={{ width:"100%", aspectRatio:"4/3", objectFit:"contain", background:"#080a06", display:"block" }} />
                    : <div style={{ aspectRatio:"4/3", background:"#080a06", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, color:"#1a2808" }}>🎯</div>
                  }
                  <div style={{ padding:"10px 12px 12px" }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, letterSpacing:".06em", textTransform:"uppercase", color:"#c8e878", marginBottom:4, lineHeight:1.2 }}>{rel.name}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color:"#c8ff00" }}>£{Number(relPrice).toFixed(2)}</div>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:sl.color, letterSpacing:".1em" }}>{sl.text}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}
    </>
  );
}

// ── Marshal Check-In Page ─────────────────────────────────

export { ShopClosedPage, ShopPage, ProductReviews, ProductPage };
