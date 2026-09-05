// admin/AdminMaintenance.jsx — Maintenance Mode toggle, design picker, and
// guestbook moderation queue. Public-facing counterpart: pages/MaintenancePage.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { fmtErr } from "../utils";
import { logAction } from "./adminHelpers";

const DESIGNS = [
  {
    id: "warm_thankyou",
    name: "Warm Thank You",
    desc: "Heartfelt, photo-led — big thank-you headline with a gallery montage.",
    swatch: ["#c8ff00", "#0d1400", "#e8ffb0"],
  },
  {
    id: "tactical_farewell",
    name: "Tactical Farewell",
    desc: "Matches the site's tactical look — \"Mission Complete\" briefing with stats.",
    swatch: ["#c8ff00", "#111", "#a0cc00"],
  },
  {
    id: "minimal_elegant",
    name: "Minimal Elegant",
    desc: "Quiet and understated — centered message, muted palette, small photo strip.",
    swatch: ["#5a6e42", "#080b06", "#c8d4b0"],
  },
];

function AdminMaintenance({ showToast, cu }) {
  // ── Maintenance mode + design + copy ─────────────────────
  const [enabled, setEnabled] = useState(false);
  const [design, setDesign] = useState("warm_thankyou");
  const [headline, setHeadline] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDesign, setSavingDesign] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [en, d, h, m] = await Promise.all([
          api.settings.get("maintenance_mode_enabled"),
          api.settings.get("maintenance_design"),
          api.settings.get("maintenance_headline"),
          api.settings.get("maintenance_message"),
        ]);
        setEnabled(en === "true");
        setDesign(d || "warm_thankyou");
        setHeadline(h || "Thank You For Everything");
        setMessage(m || "");
      } catch { /* keep defaults */ }
      setLoaded(true);
    })();
  }, []);

  const toggleMode = async () => {
    setSavingToggle(true);
    try {
      const next = !enabled;
      await api.settings.set("maintenance_mode_enabled", String(next));
      setEnabled(next);
      showToast(next
        ? "🚧 Maintenance mode is ON — visitors now only see Home, News & Gallery."
        : "✅ Maintenance mode is OFF — the full site is live again.");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: next ? "Maintenance mode enabled" : "Maintenance mode disabled", detail: null });
    } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
    finally { setSavingToggle(false); }
  };

  const chooseDesign = async (id) => {
    if (id === design) return;
    setSavingDesign(true);
    try {
      await api.settings.set("maintenance_design", id);
      setDesign(id);
      showToast("🎨 Design updated to " + (DESIGNS.find(d => d.id === id)?.name || id));
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Maintenance design changed", detail: id });
    } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
    finally { setSavingDesign(false); }
  };

  const saveCopy = async () => {
    setSaving(true);
    try {
      await api.settings.set("maintenance_headline", headline.trim());
      await api.settings.set("maintenance_message", message.trim());
      showToast("✅ Message saved!");
      logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Maintenance message saved", detail: null });
    } catch (e) { showToast("Save failed: " + fmtErr(e), "red"); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🚧 Maintenance Mode</div>
          <div className="page-sub">Show a closing-down / thank-you page site-wide, with a moderated guestbook</div>
        </div>
      </div>

      {/* ── ON/OFF ─────────────────────────────────────────── */}
      <div className="card mb-2">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
              {!loaded ? <span style={{ color: "var(--muted)" }}>Loading…</span> : enabled
                ? <span style={{ color: "var(--red)", fontWeight: 700 }}>⛔ Maintenance mode is ON</span>
                : <span style={{ color: "var(--accent)", fontWeight: 700 }}>✅ Site is running normally</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, maxWidth: 520 }}>
              When ON, everyone except logged-in admins is shown the page below instead of the homepage, and can only
              otherwise reach <strong>News</strong>, <strong>Gallery</strong>, <strong>Contact</strong> and <strong>Shop</strong> — every
              other page (Events, Bookings, Leaderboard, etc.) redirects back to it. Admins signed in still see and use the full site normally.
            </div>
          </div>
          <button
            className={enabled ? "btn btn-primary" : "btn btn-ghost"}
            style={{ minWidth: 190, borderColor: enabled ? "var(--red)" : "var(--accent)", color: enabled ? "var(--red)" : "var(--accent)" }}
            disabled={savingToggle || !loaded}
            onClick={toggleMode}
          >
            {savingToggle ? "Saving…" : enabled ? "🔓 Turn Off Maintenance Mode" : "🚧 Turn On Maintenance Mode"}
          </button>
        </div>
      </div>

      {/* ── Design picker ──────────────────────────────────── */}
      <div className="card mb-2">
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
          🎨 Design
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Pick the look of the maintenance page. Changes apply immediately.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {DESIGNS.map(d => {
            const active = d.id === design;
            return (
              <div
                key={d.id}
                onClick={() => !savingDesign && chooseDesign(d.id)}
                style={{
                  cursor: savingDesign ? "default" : "pointer",
                  border: active ? "2px solid var(--accent)" : "1px solid var(--border2)",
                  background: active ? "rgba(200,255,0,.05)" : "var(--bg2)",
                  borderRadius: 8, padding: "16px 16px", position: "relative", opacity: savingDesign ? 0.6 : 1,
                }}
              >
                {active && <div style={{ position: "absolute", top: 10, right: 10, fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>✓ ACTIVE</div>}
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {d.swatch.map((c, i) => <div key={i} style={{ width: 22, height: 22, borderRadius: 4, background: c, border: "1px solid rgba(255,255,255,.15)" }} />)}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 4 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{d.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Headline / message ─────────────────────────────── */}
      <div className="card mb-2">
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
          ✏️ Message
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Headline</label>
          <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} maxLength={120} placeholder="Thank You For Everything" />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Message</label>
          <textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} maxLength={2000}
            placeholder="Tell your visitors what's happening and thank them for their support…" />
        </div>
        <button className="btn btn-primary" onClick={saveCopy} disabled={saving}>{saving ? "Saving…" : "Save Message"}</button>
      </div>

      {/* ── Guestbook moderation ────────────────────────────── */}
      <GuestbookModeration showToast={showToast} cu={cu} />
    </div>
  );
}

// ── Guestbook moderation queue ────────────────────────────────
const STATUS_TABS = [
  { id: "pending",  label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all",      label: "All" },
];

function GuestbookModeration({ showToast, cu }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const isMounted = useRef(true);

  const load = useCallback(async (st) => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const data = await api.guestbook.getAdmin(st);
      if (isMounted.current) setRows(data);
    } catch (e) { showToast("Failed to load guestbook: " + fmtErr(e), "red"); }
    finally { if (isMounted.current) setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    isMounted.current = true;
    load(status);
    const ch = supabase
      .channel("admin_guestbook_" + status)
      .on("postgres_changes", { event: "*", schema: "public", table: "guestbook_messages" }, () => load(status))
      .subscribe();
    return () => { isMounted.current = false; supabase.removeChannel(ch); };
  }, [status, load]);

  const act = async (row, action) => {
    setBusyId(row.id);
    try {
      if (action === "delete") {
        await api.guestbook.delete(row.id);
        showToast("🗑️ Message deleted.");
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: "Guestbook message deleted", detail: row.name, playerId: row.user_id });
      } else {
        await api.guestbook.moderate(row.id, action, cu?.id);
        showToast(action === "approved" ? "✅ Message approved — now live." : "⛔ Message rejected.");
        logAction({ adminEmail: cu?.email, adminName: cu?.name, action: action === "approved" ? "Guestbook message approved" : "Guestbook message rejected", detail: row.name, playerId: row.user_id });
      }
      load(status);
    } catch (e) { showToast("Action failed: " + fmtErr(e), "red"); }
    finally { setBusyId(null); }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".08em", textTransform: "uppercase" }}>
          💬 Guestbook Moderation
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_TABS.map(t => (
            <button key={t.id} onClick={() => setStatus(t.id)}
              className={status === t.id ? "btn btn-primary" : "btn btn-ghost"}
              style={{ fontSize: 12, padding: "6px 12px" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ fontSize: 12, color: "var(--muted)", padding: 20, textAlign: "center" }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: 20, textAlign: "center" }}>
          {status === "pending" ? "No messages waiting for review." : "Nothing here yet."}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                {r.name}
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, textTransform: "uppercase",
                  color: r.status === "approved" ? "var(--accent)" : r.status === "rejected" ? "var(--red)" : "var(--gold)",
                  border: `1px solid ${r.status === "approved" ? "var(--accent)" : r.status === "rejected" ? "var(--red)" : "var(--gold)"}`,
                }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(r.created_at).toLocaleString("en-GB")}</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 10 }}>{r.message}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {r.status !== "approved" && (
                <button className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={busyId === r.id} onClick={() => act(r, "approved")}>✅ Approve</button>
              )}
              {r.status !== "rejected" && (
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", borderColor: "var(--red)" }} disabled={busyId === r.id} onClick={() => act(r, "rejected")}>⛔ Reject</button>
              )}
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }} disabled={busyId === r.id} onClick={() => {
                if (window.confirm("Permanently delete this guestbook message?")) act(r, "delete");
              }}>🗑️ Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { AdminMaintenance };
