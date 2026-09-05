// pages/MaintenancePage.jsx — shown instead of the normal homepage when
// maintenance_mode_enabled is true (see AdminMaintenance.jsx for the toggle
// and design picker). Three themes: warm_thankyou | tactical_farewell | minimal_elegant.
import React, { useState, useEffect, useCallback } from "react";
import * as api from "../api";

// ── Shared: photo strip pulled from the existing gallery ──────
function usePhotoStrip(data, count = 9) {
  const [photos] = useState(() => {
    const all = (data?.albums || []).flatMap(a => a.images || []);
    if (!all.length) return [];
    // Light shuffle so the strip isn't always the same first few uploads
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  });
  return photos;
}

// ── Shared: guestbook form + list ──────────────────────────────
function useApprovedGuestbook() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    api.guestbook.getApproved().then(rows => setEntries(rows || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { entries, loading };
}

function GuestbookForm({ cu, showToast, accent = "var(--accent)" }) {
  const [name, setName] = useState(cu?.name || "");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real users never fill this in
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (website) return; // bot caught by honeypot — fail silently
    if (!name.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      await api.guestbook.create({ name: name.trim().slice(0, 80), message: message.trim().slice(0, 1000), userId: cu?.id });
      setSent(true);
      setMessage("");
      showToast && showToast("💬 Message received — thank you!");
    } catch (err) {
      showToast && showToast("Couldn't send that — please try again.", "red");
    } finally { setSubmitting(false); }
  };

  if (sent) {
    return (
      <div style={{ textAlign: "center", padding: "24px 16px", color: accent, fontWeight: 700, fontSize: 13, border: "1px dashed var(--border2)" }}>
        ✅ Thank you — your message will appear here once it's been reviewed.
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="text" tabIndex={-1} autoComplete="off" name="url"
        value={website} onChange={e => setWebsite(e.target.value)}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        aria-hidden="true"
      />
      <input
        type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80}
        placeholder="Your name" required
        style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "10px 12px", fontSize: 13 }}
      />
      <textarea
        value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} rows={4}
        placeholder="Leave a message of support for the team…" required
        style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", padding: "10px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
      />
      <button type="submit" disabled={submitting} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
        {submitting ? "Sending…" : "Sign the Guestbook"}
      </button>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>
        Messages are reviewed by the team before they appear publicly — so nothing goes live unchecked.
      </div>
    </form>
  );
}

function GuestbookList({ entries, loading }) {
  if (loading) return <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>Loading messages…</div>;
  if (!entries.length) return <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>Be the first to leave a message.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
      {entries.map(e => (
        <div key={e.id} style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13 }}>{e.name}</span>
            <span style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleDateString("en-GB")}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{e.message}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// THEME 1 — Warm Thank You (default): heartfelt, photo-led
// ═══════════════════════════════════════════════════════════════
function WarmThankYouTheme({ data, headline, message, cu, showToast, setPage }) {
  const photos = usePhotoStrip(data, 9);
  const { entries, loading } = useApprovedGuestbook();
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "44px 20px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>💚</div>
        <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, color: "var(--accent)", letterSpacing: ".02em", marginBottom: 14, lineHeight: 1.2 }}>
          {headline}
        </div>
        <div style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.8, maxWidth: 640, margin: "0 auto" }}>
          {message}
        </div>
      </div>

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 6, marginBottom: 40 }}>
          {photos.map((src, i) => (
            <img key={i} src={src} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4, border: "1px solid var(--border2)" }} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 44, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setPage("news")}>📰 Latest News</button>
        <button className="btn btn-ghost" onClick={() => setPage("gallery")}>🖼 Full Gallery</button>
      </div>

      <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "28px 24px" }}>
        <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 18, color: "var(--text)", marginBottom: 4, textAlign: "center" }}>Guestbook</div>
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginBottom: 20 }}>Leave a message for the team and the community.</div>
        <div style={{ maxWidth: 480, margin: "0 auto 28px" }}><GuestbookForm cu={cu} showToast={showToast} /></div>
        <GuestbookList entries={entries} loading={loading} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// THEME 2 — Tactical Farewell: matches the site's tactical/military aesthetic
// ═══════════════════════════════════════════════════════════════
function TacticalFarewellTheme({ data, headline, message, cu, showToast, setPage }) {
  const photos = usePhotoStrip(data, 6);
  const { entries, loading } = useApprovedGuestbook();
  const stats = [
    { label: "GAME DAYS RUN", value: data?.events?.length || 0 },
    { label: "PHOTOS ARCHIVED", value: (data?.albums || []).reduce((s, a) => s + (a.images?.length || 0), 0) },
    { label: "ALBUMS", value: (data?.albums || []).length },
  ];
  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "36px 20px 60px" }}>
      {/* Briefing header */}
      <div style={{
        background: "linear-gradient(135deg,#0d1400 0%,#111 60%,#0a1000 100%)",
        border: "1px solid #2a3a10", borderRadius: 8, padding: "32px 28px", marginBottom: 24, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 3px)", pointerEvents: "none" }} />
        {[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([v, h]) => (
          <div key={v + h} style={{
            position: "absolute", width: 16, height: 16,
            top: v === "top" ? 8 : "auto", bottom: v === "bottom" ? 8 : "auto",
            left: h === "left" ? 8 : "auto", right: h === "right" ? 8 : "auto",
            borderTop: v === "top" ? "2px solid #c8ff00" : "none", borderBottom: v === "bottom" ? "2px solid #c8ff00" : "none",
            borderLeft: h === "left" ? "2px solid #c8ff00" : "none", borderRight: h === "right" ? "2px solid #c8ff00" : "none",
          }} />
        ))}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 9, letterSpacing: ".25em", color: "#c8ff00", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, marginBottom: 10 }}>⬡ SWINDON AIRSOFT · FIELD REPORT</div>
          <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 30, color: "#e8ffb0", letterSpacing: ".04em", marginBottom: 8 }}>MISSION COMPLETE</div>
          <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7, maxWidth: 640, marginBottom: 4 }}>{headline}</div>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.8, maxWidth: 640 }}>{message}</div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border2)", padding: "16px 14px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 26, color: "var(--accent)", fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".12em", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, marginBottom: 24 }}>
          {photos.map((src, i) => (
            <img key={i} src={src} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", filter: "grayscale(.15) contrast(1.05)", border: "1px solid var(--border2)" }} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 32, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setPage("news")}>📰 SITREP / NEWS</button>
        <button className="btn btn-ghost" onClick={() => setPage("gallery")}>🖼 ARCHIVE / GALLERY</button>
      </div>

      {/* Field log / guestbook */}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", padding: "26px 22px" }}>
        <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "var(--accent)", letterSpacing: ".1em", marginBottom: 4, textAlign: "center" }}>⬡ FIELD LOG — LEAVE YOUR MARK</div>
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 18 }}>Log a message for the squad before we ship out.</div>
        <div style={{ maxWidth: 480, margin: "0 auto 24px" }}><GuestbookForm cu={cu} showToast={showToast} /></div>
        <GuestbookList entries={entries} loading={loading} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// THEME 3 — Minimal Elegant: quiet, understated sign-off
// ═══════════════════════════════════════════════════════════════
function MinimalElegantTheme({ data, headline, message, cu, showToast, setPage }) {
  const photos = usePhotoStrip(data, 5);
  const { entries, loading } = useApprovedGuestbook();
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "64px 20px 60px", textAlign: "center" }}>
      <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 26, color: "var(--text)", letterSpacing: ".08em", marginBottom: 20, textTransform: "uppercase" }}>
        {headline}
      </div>
      <div style={{ width: 40, height: 1, background: "var(--border2)", margin: "0 auto 24px" }} />
      <div style={{ fontSize: 15, color: "var(--muted)", lineHeight: 2, marginBottom: 36 }}>
        {message}
      </div>

      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 36, flexWrap: "wrap" }}>
          {photos.map((src, i) => (
            <img key={i} src={src} alt="" style={{ width: 110, height: 110, objectFit: "cover", filter: "grayscale(1)", opacity: 0.85, borderRadius: 2 }} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 48, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }}>
        <button onClick={() => setPage("news")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", textDecoration: "underline" }}>News</button>
        <button onClick={() => setPage("gallery")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", textDecoration: "underline" }}>Gallery</button>
      </div>

      <div style={{ width: 40, height: 1, background: "var(--border2)", margin: "0 auto 32px" }} />

      <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 20 }}>A few words, if you'd like to leave one.</div>
      <div style={{ maxWidth: 420, margin: "0 auto 28px", textAlign: "left" }}><GuestbookForm cu={cu} showToast={showToast} /></div>
      <div style={{ textAlign: "left" }}><GuestbookList entries={entries} loading={loading} /></div>
    </div>
  );
}

// ── Entry point — picks the theme selected in Admin > Maintenance Mode ──
function MaintenancePage({ data, cu, showToast, setPage }) {
  const design = data?.maintenanceDesign || "warm_thankyou";
  const headline = data?.maintenanceHeadline || "Thank You For Everything";
  const message = data?.maintenanceMessage || "";
  const props = { data, headline, message, cu, showToast, setPage };

  if (design === "tactical_farewell") return <TacticalFarewellTheme {...props} />;
  if (design === "minimal_elegant") return <MinimalElegantTheme {...props} />;
  return <WarmThankYouTheme {...props} />;
}

export { MaintenancePage };
