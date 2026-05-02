// utils/SiteSearch.jsx — global site search
// Searches Q&A, Terms sections, News posts, Events, and Shop products
import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Static Terms index ──────────────────────────────────────
// Each entry: { id, title, keywords, section, anchor }
const TERMS_INDEX = [
  { id:"t1",  title:"Age Requirements", section:"Site Rules", anchor:"terms-2",
    keywords:"age minimum 16 18 under age junior parent guardian youth" },
  { id:"t2",  title:"FPS Limits & Chronographing", section:"Site Rules", anchor:"terms-4",
    keywords:"fps feet per second muzzle velocity chrono chronograph limit gun power joule energy 350 450 500 rifle dmr sniper bolt action" },
  { id:"t3",  title:"Engagement Distances", section:"Site Rules", anchor:"terms-5",
    keywords:"med minimum engagement distance 30m safe zone range sniper dmr" },
  { id:"t4",  title:"Code of Conduct", section:"Site Rules", anchor:"terms-3",
    keywords:"conduct rules cheating hit calling fair play behaviour respect aggressive argument" },
  { id:"t5",  title:"Personal Equipment Rules", section:"Site Rules", anchor:"terms-6",
    keywords:"equipment gear eye protection goggles lower face mask safety rif aeg gbb pistol" },
  { id:"t6",  title:"Rental Equipment", section:"Site Rules", anchor:"terms-7",
    keywords:"rental hire gun kit equipment borrow damage deposit" },
  { id:"t7",  title:"VIP Membership", section:"Site Rules", anchor:"terms-8",
    keywords:"vip membership discount 10% benefit priority booking badge" },
  { id:"t8",  title:"Disciplinary Card System", section:"Site Rules", anchor:"terms-card",
    keywords:"card yellow red ban warning discipline kick cheating rules breach" },
  { id:"t9",  title:"Player Reporting System", section:"Site Rules", anchor:"terms-reporting",
    keywords:"report reporting cheat conduct complaint incident" },
  { id:"t10", title:"Booking Policy", section:"Booking Terms", anchor:"booking-1",
    keywords:"booking policy how to book pre-pay payment reserve slot" },
  { id:"t11", title:"Cancellation Policy", section:"Booking Terms", anchor:"booking-2",
    keywords:"cancel cancellation refund policy no-show withdraw booking" },
  { id:"t12", title:"Rental Booking Fee", section:"Booking Terms", anchor:"booking-3",
    keywords:"rental booking fee deposit non-refundable hire" },
  { id:"t13", title:"Game Day Credits", section:"Booking Terms", anchor:"booking-4",
    keywords:"credit store credit game day credit rescheduled event" },
  { id:"t14", title:"Event Cancellations by Swindon Airsoft", section:"Booking Terms", anchor:"booking-5",
    keywords:"cancelled event weather site closure refund credit" },
  { id:"t15", title:"Event Waitlist", section:"Booking Terms", anchor:"booking-6",
    keywords:"waitlist waiting list full sold out slot hold" },
  { id:"t16", title:"Shop Terms", section:"Shop Terms", anchor:"shop-1",
    keywords:"shop terms conditions purchase price stock availability" },
  { id:"t17", title:"Delivery & Postage", section:"Shop Terms", anchor:"shop-2",
    keywords:"delivery postage shipping tracked standard collection rif delivery time" },
  { id:"t18", title:"Returns & Refunds", section:"Shop Terms", anchor:"shop-3",
    keywords:"return refund exchange defective damaged unwanted item shop" },
  { id:"t19", title:"Waiver Summary", section:"Waiver", anchor:"waiver-1",
    keywords:"waiver liability risk injury sign annual" },
  { id:"t20", title:"Privacy — What Data We Collect", section:"Privacy Policy", anchor:"privacy-1",
    keywords:"data privacy gdpr collect email name personal information" },
  { id:"t21", title:"Privacy — Your Rights", section:"Privacy Policy", anchor:"privacy-5",
    keywords:"gdpr rights delete data access erasure request" },
];

export function SiteSearch({ data, setPage }) {
  const [query, setQuery]         = useState("");
  const [open, setOpen]           = useState(false);
  const [results, setResults]     = useState([]);
  const [selected, setSelected]   = useState(0);
  const inputRef  = useRef(null);
  const boxRef    = useRef(null);
  const debounce  = useRef(null);

  // ── Build results when query changes ─────────────────────
  const search = useCallback((q) => {
    const raw = q.trim().toLowerCase();
    if (raw.length < 2) { setResults([]); return; }
    const words = raw.split(/\s+/);
    const score = (text) => words.filter(w => text.toLowerCase().includes(w)).length;

    const hits = [];

    // Q&A
    (data?.qa || []).forEach(item => {
      const combined = `${item.q} ${item.a}`.toLowerCase();
      const s = score(combined);
      if (s > 0) hits.push({ type:"qa", score:s, title:item.q, excerpt: item.a?.slice(0, 100), icon:"❓", page:"qa", qId: item.id });
    });

    // Terms
    TERMS_INDEX.forEach(t => {
      const combined = `${t.title} ${t.keywords} ${t.section}`.toLowerCase();
      const s = score(combined);
      if (s > 0) hits.push({ type:"terms", score:s, title:t.title, excerpt:`${t.section}`, icon:"📄", page:"terms", anchor:t.anchor });
    });

    // News
    (data?.news || []).filter(p => p.published).forEach(p => {
      const combined = `${p.title} ${p.body} ${p.category}`.toLowerCase();
      const s = score(combined);
      if (s > 0) hits.push({ type:"news", score:s, title:p.title, excerpt:`${p.category} · ${p.author_name || ""}`, icon:"📡", page:"news" });
    });

    // Events (upcoming)
    const now = new Date();
    (data?.events || [])
      .filter(e => new Date(e.date + "T23:59:00") > now)
      .forEach(e => {
        const combined = `${e.title} ${e.description || ""}`.toLowerCase();
        const s = score(combined);
        if (s > 0) hits.push({ type:"events", score:s, title:e.title, excerpt:`Event · ${new Date(e.date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`, icon:"📅", page:"events" });
      });

    // Shop
    (data?.shop || []).filter(p => !p.hiddenFromShop).forEach(p => {
      const combined = `${p.name} ${p.description || ""} ${p.category || ""}`.toLowerCase();
      const s = score(combined);
      if (s > 0) hits.push({ type:"shop", score:s, title:p.name, excerpt:`Shop · ${p.category || ""}`, icon:"🛒", page:"shop" });
    });

    hits.sort((a, b) => b.score - a.score);
    setResults(hits.slice(0, 8));
    setSelected(0);
  }, [data]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounce.current);
    if (query.trim().length >= 2) {
      debounce.current = setTimeout(() => search(query), 180);
    } else {
      setResults([]);
    }
    return () => clearTimeout(debounce.current);
  }, [query, search]);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard shortcut: / to open
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "/" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const go = (result) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setPage(result.page);
    // Scroll to anchor after page change
    if (result.anchor) {
      setTimeout(() => {
        const el = document.getElementById(result.anchor);
        if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
      }, 400);
    }
    if (result.page === "qa" && result.qId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-qa-id="${result.qId}"]`);
        if (el) { el.scrollIntoView({ behavior:"smooth", block:"start" }); el.click?.(); }
      }, 400);
    }
  };

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s+1, results.length-1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s-1, 0)); }
    if (e.key === "Enter" && results[selected]) go(results[selected]);
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
  };

  const TYPE_COLORS = { qa:"#c8ff00", terms:"#4fc3f7", news:"#ffb74d", events:"#81c784", shop:"#ce93d8" };
  const TYPE_LABELS = { qa:"Q&A", terms:"Rules/Terms", news:"News", events:"Events", shop:"Shop" };

  return (
    <div ref={boxRef} style={{ position:"relative", flex:1, maxWidth:320 }}>
      {/* Search input */}
      <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", padding:"5px 10px", cursor:"text" }}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder='Search site…'
          style={{ background:"none", border:"none", outline:"none", color:"var(--text)", fontSize:12, fontFamily:"'Share Tech Mono',monospace", width:"100%", minWidth:0 }}
        />
        {!query && <span style={{ fontSize:9, color:"rgba(255,255,255,.2)", fontFamily:"'Share Tech Mono',monospace", flexShrink:0, border:"1px solid rgba(255,255,255,.1)", padding:"1px 5px" }}>/</span>}
        {query && (
          <button onClick={e => { e.stopPropagation(); setQuery(""); setResults([]); }} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:14, lineHeight:1, padding:0 }}>✕</button>
        )}
      </div>

      {/* Results dropdown */}
      {open && (query.trim().length >= 2) && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", left:0, right:0,
          background:"#111", border:"1px solid #2a2a2a", zIndex:500,
          boxShadow:"0 16px 48px rgba(0,0,0,.8)",
          maxHeight:360, overflowY:"auto",
          clipPath:"polygon(0 0,100% 0,100% 100%,0 100%)"
        }}>
          {results.length === 0 ? (
            <div style={{ padding:"16px 14px", textAlign:"center", color:"var(--muted)", fontSize:12, fontFamily:"'Share Tech Mono',monospace" }}>
              No results for "{query}"
            </div>
          ) : (
            <>
              <div style={{ padding:"6px 12px 4px", fontSize:9, letterSpacing:".15em", color:"rgba(255,255,255,.3)", fontFamily:"'Share Tech Mono',monospace", borderBottom:"1px solid #1a1a1a" }}>
                {results.length} RESULT{results.length !== 1 ? "S" : ""} — ↑↓ NAVIGATE · ENTER SELECT · ESC CLOSE
              </div>
              {results.map((r, i) => (
                <div key={i}
                  onClick={() => go(r)}
                  onMouseEnter={() => setSelected(i)}
                  style={{
                    display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:"pointer",
                    background: selected === i ? "rgba(200,255,0,.07)" : "transparent",
                    borderBottom:"1px solid #1a1a1a",
                    borderLeft: selected === i ? "2px solid var(--accent)" : "2px solid transparent",
                    transition:"background .1s",
                  }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{r.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {highlightMatch(r.title, query)}
                    </div>
                    {r.excerpt && (
                      <div style={{ fontSize:11, color:"var(--muted)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginTop:1 }}>
                        {r.excerpt}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize:9, fontWeight:800, letterSpacing:".1em", color:TYPE_COLORS[r.type]||"#888", border:`1px solid ${TYPE_COLORS[r.type]||"#333"}44`, padding:"1px 6px", flexShrink:0, fontFamily:"'Share Tech Mono',monospace" }}>
                    {TYPE_LABELS[r.type]}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Highlight matching words in result title
function highlightMatch(text, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    words.some(w => part.toLowerCase() === w)
      ? <mark key={i} style={{ background:"rgba(200,255,0,.25)", color:"var(--accent)", borderRadius:2, padding:"0 1px" }}>{part}</mark>
      : part
  );
}
