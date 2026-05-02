// Shared admin tab button style — imported by all admin components
// Kept in its own file to avoid dynamic-import conflicts with utils.jsx
export function tabBtn(active) {
  return {
    display:"inline-flex", alignItems:"center", gap:7,
    padding:"8px 16px", cursor:"pointer",
    fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700,
    fontSize:12, letterSpacing:".1em", textTransform:"uppercase",
    transition:"all .15s",
    background: active ? "var(--accent)" : "rgba(255,255,255,.07)",
    color:  active ? "#000" : "var(--muted)",
    border: active ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,.1)",
    clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",
  };
}
