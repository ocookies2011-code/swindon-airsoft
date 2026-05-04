// utils/ui.jsx — SkeletonCard, Toast, GmtClock, Countdown
import React, { useEffect, useState } from "react";
import { gmtNow } from "./helpers";

function SkeletonCard({ height = 280, style = {} }) {
  return (
    <div style={{ background:"#0c1009", border:"1px solid #1a2808", overflow:"hidden", position:"relative", height, ...style }}>
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(90deg,transparent 0%,rgba(200,255,0,.03) 50%,transparent 100%)", backgroundSize:"200% 100%", animation:"skeletonShimmer 1.6s ease-in-out infinite" }} />
      <div style={{ padding:14 }}>
        <div style={{ background:"#1a2808", height:140, marginBottom:12, borderRadius:2 }} />
        <div style={{ background:"#1a2808", height:12, width:"70%", marginBottom:8, borderRadius:2 }} />
        <div style={{ background:"#1a2808", height:10, width:"45%", marginBottom:8, borderRadius:2 }} />
        <div style={{ background:"#1a2808", height:10, width:"55%", borderRadius:2 }} />
      </div>
    </div>
  );
}
function Toast({ msg, type }) {
  return msg ? <div className={`toast toast-${type || "green"}`}>{msg}</div> : null;
}

function useMobile(bp = 640) {
  const [mobile, setMobile] = useState(() => window.innerWidth <= bp);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= bp);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return mobile;
}

function useToast() {
  const show = (msg, type = "green") => {
    setToast({ msg, type });
    const duration = type === "red" ? 5000 : msg.length > 60 ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
  };
  return [toast, show];
}

// ── Live GMT Clock ────────────────────────────────────────
function GmtClock({ style }) {
  const [time, setTime] = useState(gmtNow());
  useEffect(() => {
    const clockInterval = setInterval(() => setTime(gmtNow()), 1000);
    return () => clearInterval(clockInterval);
  }, []);
  return <span className="mono" style={{ fontSize: 11, color: "var(--muted)", ...style }}>{time} GMT</span>;
}

// ── Countdown ─────────────────────────────────────────────
function Countdown({ target }) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const tick = () => setDiff(Math.max(0, new Date(target) - new Date()));
    tick();
    const tickInterval = setInterval(tick, 1000);
    return () => clearInterval(tickInterval);
  }, [target]);
  const diffDays = Math.floor(diff / 86400000);
  const diffHours = Math.floor((diff % 86400000) / 3600000);
  const diffMins = Math.floor((diff % 3600000) / 60000);
  const diffSecs = Math.floor((diff % 60000) / 1000);
  return (
    <div className="countdown-wrap">
      {[["DAYS", diffDays], ["HRS", diffHours], ["MIN", diffMins], ["SEC", diffSecs]].map(([l, n]) => (
        <div className="countdown-unit" key={l}>
          <div className="countdown-num">{String(n).padStart(2, "0")}</div>
          <div className="countdown-lbl">{l}</div>
        </div>
      ))}
    </div>
  );
}


export { SkeletonCard, Toast, GmtClock, Countdown };
