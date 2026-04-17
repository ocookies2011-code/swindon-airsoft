// utils/helpers.js — renderMd, stockLabel, fmtErr, date helpers, uid

function renderMd(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^## (.+)$/gm, "<div style='font-family:\'Barlow Condensed\',sans-serif;font-size:17px;font-weight:900;color:#c8ff00;letter-spacing:.08em;text-transform:uppercase;display:block;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #2a3a10'>$1</div>")
    .replace(/^### (.+)$/gm, "<div style='font-family:\'Barlow Condensed\',sans-serif;font-size:14px;font-weight:800;color:#a0cc60;letter-spacing:.06em;text-transform:uppercase;display:block;margin:12px 0 4px'>$1</div>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#e8ffb0;font-weight:800'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em style='color:#aaa'>$1</em>")
    .replace(/^- (.+)$/gm, "<div style='display:flex;gap:8px;margin:4px 0;padding-left:4px'><span style='color:#c8ff00;flex-shrink:0;margin-top:1px'>▸</span><span>$1</span></div>")
    .replace(/^\d+\. (.+)$/gm, "<div style='margin:4px 0;padding-left:4px'>$1</div>")
    .replace(/^---$/gm, "<div style='border:none;border-top:1px solid #2a3a10;margin:14px 0;opacity:.6'></div>")
    .replace(/\n/g, "<br>");
}
function stockLabel(qty) {
  const n = Number(qty);
  if (n < 1)  return { text: "OUT OF STOCK", color: "var(--red)" };
  if (n < 10) return { text: "LOW STOCK",    color: "var(--gold)" };
  if (n < 20) return { text: "MED STOCK",    color: "#4fc3f7" };
  return        { text: "IN STOCK",      color: "var(--accent)" };
}




// ── Network error helper ─────────────────────────────────────
// Converts raw error messages into friendly UI text.
// NETWORK_TIMEOUT means the Supabase fetch was killed after 10s —
// most commonly happens when the browser resumes from sleep with
// stale TCP connections. Tell the user to try again.
function fmtErr(e) {
  if (!e) return "Unknown error";
  const msg = e.message || String(e);
  if (msg === "NETWORK_TIMEOUT" || msg.includes("NETWORK_TIMEOUT"))
    return "Request timed out — your connection may have dropped. Please try again.";
  if (msg.includes("JWT") || msg.includes("expired") || msg.includes("token"))
    return "Your session expired. Please refresh the page and log in again.";
  return msg;
}


// ── GMT helpers ─────────────────────────────────────────────
const gmtNow = () => new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false });
const gmtDate = (d) => new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false });
const gmtShort = (d) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" });
const fmtDate = (d) => { if (!d) return ""; const [y,m,day] = String(d).slice(0,10).split("-"); return `${day}/${m}/${y}`; };
const uid = () => crypto.randomUUID();


export { renderMd, stockLabel, fmtErr, gmtNow, gmtDate, gmtShort, fmtDate, uid };
