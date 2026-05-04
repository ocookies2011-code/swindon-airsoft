// admin/AdminScanWaiver.jsx — Upload a paper waiver photo, extract data via Claude Vision,
// review/correct, then save as additional waiver on any player profile.
import React, { useState, useRef, useCallback } from "react";
import * as api from "../api";
import { normaliseProfile } from "../api";

const NATIONS = [
  ["GB","United Kingdom"],["US","United States"],["AU","Australia"],["CA","Canada"],
  ["NZ","New Zealand"],["IE","Ireland"],["ZA","South Africa"],["DE","Germany"],
  ["FR","France"],["ES","Spain"],["IT","Italy"],["NL","Netherlands"],
  ["BE","Belgium"],["SE","Sweden"],["NO","Norway"],["DK","Denmark"],
  ["FI","Finland"],["PL","Poland"],["PT","Portugal"],["GR","Greece"],
  ["CH","Switzerland"],["AT","Austria"],["CZ","Czech Republic"],["JP","Japan"],
];

const blank = () => ({
  name:"", dob:"", addr1:"", addr2:"", city:"", county:"",
  postcode:"", country:"United Kingdom",
  emergencyName:"", emergencyPhone:"",
  medical:"", isChild:false, guardian:"",
  sigData:"", agreed:true,
  date: new Date().toISOString(),
});

export function AdminScanWaiver({ data, updateUser, showToast }) {
  const [step, setStep] = useState("upload"); // upload | scanning | review | save | done
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [form, setForm] = useState(blank());
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const players = (data.users || [])
    .filter(u => u.role === "player")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const filteredPlayers = playerSearch.trim().length > 0
    ? players.filter(u => (u.name || "").toLowerCase().includes(playerSearch.toLowerCase()) ||
                          (u.email || "").toLowerCase().includes(playerSearch.toLowerCase()))
    : players;

  const fw = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const loadFile = (file) => {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Please upload an image file (JPG, PNG, etc.)", "red");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const scanWaiver = async () => {
    if (!imageBase64) return;
    setStep("scanning");
    setScanError(null);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: imageBase64,
                }
              },
              {
                type: "text",
                text: `This is a scanned airsoft waiver form. Extract all the fields you can read and return ONLY a JSON object with these exact keys (use empty string if unreadable):
{
  "name": "full name of the participant",
  "dob": "date of birth in YYYY-MM-DD format if possible, otherwise as written",
  "addr1": "address line 1",
  "addr2": "address line 2",
  "city": "city/town",
  "county": "county",
  "postcode": "postcode",
  "country": "country (default United Kingdom)",
  "emergencyName": "emergency contact name",
  "emergencyPhone": "emergency contact phone",
  "medical": "any medical conditions or allergies listed (empty string if none or 'None')",
  "isChild": false,
  "guardian": "guardian name if minor"
}
Return ONLY the JSON, no explanation.`
              }
            ]
          }]
        })
      });

      if (!res.ok) throw new Error("API request failed: " + res.status);
      const json = await res.json();
      const text = json.content?.[0]?.text || "";

      // Parse the JSON from Claude's response
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      setForm({
        ...blank(),
        ...parsed,
        agreed: true,
        date: new Date().toISOString(),
      });
      setStep("review");
    } catch (e) {
      console.error("Scan error:", e);
      setScanError(e.message || "Failed to extract data from image");
      setStep("upload");
    }
  };

  const saveWaiver = async () => {
    if (!selectedPlayer) { showToast("Please select a player", "red"); return; }
    if (!form.name) { showToast("Name is required", "red"); return; }

    setSaving(true);
    try {
      const profile = await api.profiles.getById(selectedPlayer.id);
      const current = normaliseProfile(profile);
      const existingExtras = current.extraWaivers || [];

      const newWaiver = {
        ...form,
        signed: true,
        scannedByAdmin: true,
        date: new Date().toISOString(),
      };

      // If player has no primary waiver, this becomes the primary
      if (!current.waiverData) {
        await updateUser(selectedPlayer.id, {
          waiverSigned: true,
          waiverYear: new Date().getFullYear(),
          waiverData: newWaiver,
          waiverPending: null,
        });
      } else {
        // Add as additional waiver
        await updateUser(selectedPlayer.id, {
          extraWaivers: [...existingExtras, newWaiver],
        });
      }

      showToast(`Waiver saved for ${selectedPlayer.name} ✓`);
      setStep("done");
    } catch (e) {
      showToast("Failed to save waiver: " + e.message, "red");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setImageBase64(null);
    setImagePreview(null);
    setScanError(null);
    setForm(blank());
    setPlayerSearch("");
    setSelectedPlayer(null);
  };

  const inp = {
    style: {
      width: "100%", background: "#0f0f0f", border: "1px solid #2a2a2a",
      color: "var(--text)", padding: "8px 12px", fontSize: 13,
      fontFamily: "inherit", boxSizing: "border-box",
    }
  };

  const label = (text) => (
    <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 4, marginTop: 12 }}>
      {text}
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📷 Scan Paper Waiver</div>
          <div className="page-sub">Upload a photo of a signed paper waiver — AI will extract the data</div>
        </div>
        {step !== "upload" && (
          <button className="btn btn-ghost btn-sm" onClick={reset}>↩ Start Over</button>
        )}
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
        {[["upload","📷 Upload"],["scanning","🔍 Scanning"],["review","✏️ Review"],["save","👤 Assign"],["done","✓ Saved"]].map(([s, label], i) => {
          const steps = ["upload","scanning","review","save","done"];
          const idx = steps.indexOf(step);
          const thisIdx = steps.indexOf(s);
          const active = s === step;
          const done = thisIdx < idx;
          return (
            <div key={s} style={{
              flex: 1, padding: "8px 4px", textAlign: "center",
              fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
              fontFamily: "'Oswald','Barlow Condensed',sans-serif",
              background: active ? "rgba(200,255,0,.1)" : done ? "rgba(200,255,0,.04)" : "#0c0c0c",
              color: active ? "var(--accent)" : done ? "rgba(200,255,0,.5)" : "var(--muted)",
              borderBottom: active ? "2px solid var(--accent)" : done ? "2px solid rgba(200,255,0,.3)" : "2px solid #1a1a1a",
            }}>
              {label}
            </div>
          );
        })}
      </div>

      {/* STEP: Upload */}
      {step === "upload" && (
        <div className="card">
          {scanError && (
            <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", padding: "10px 14px", borderRadius: 3, marginBottom: 16, color: "#ef4444", fontSize: 13 }}>
              ⚠ {scanError}
            </div>
          )}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--accent)" : "#2a2a2a"}`,
              background: dragOver ? "rgba(200,255,0,.04)" : "transparent",
              padding: "48px 24px", textAlign: "center", cursor: "pointer",
              borderRadius: 3, transition: "all .15s",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: ".1em", color: "var(--text)", marginBottom: 6 }}>
              DROP IMAGE HERE OR CLICK TO UPLOAD
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              JPG, PNG, HEIC — photo of the completed paper waiver
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => loadFile(e.target.files[0])} />
          </div>

          {imagePreview && (
            <div style={{ marginTop: 20 }}>
              <img src={imagePreview} alt="Waiver preview" style={{ maxWidth: "100%", maxHeight: 400, objectFit: "contain", border: "1px solid #2a2a2a", display: "block", margin: "0 auto" }} />
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={scanWaiver} style={{ fontSize: 14, padding: "10px 32px" }}>
                  🔍 Scan & Extract Data
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP: Scanning */}
      {step === "scanning" && (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: ".1em", marginBottom: 8 }}>
            READING WAIVER...
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Claude is extracting the handwritten data. This takes a few seconds.
          </div>
          {imagePreview && (
            <img src={imagePreview} alt="Scanning" style={{ maxHeight: 200, maxWidth: "100%", marginTop: 24, opacity: 0.5, objectFit: "contain", border: "1px solid #2a2a2a" }} />
          )}
        </div>
      )}

      {/* STEP: Review */}
      {step === "review" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Left: extracted form */}
            <div className="card">
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: ".12em", color: "var(--accent)", marginBottom: 16 }}>
                ✏️ REVIEW EXTRACTED DATA — CORRECT ANY ERRORS
              </div>

              {label("Full Name *")}
              <input {...inp} value={form.name} onChange={e => fw("name", e.target.value)} />

              {label("Date of Birth")}
              <input {...inp} value={form.dob} onChange={e => fw("dob", e.target.value)} placeholder="YYYY-MM-DD" />

              {label("Address Line 1")}
              <input {...inp} value={form.addr1} onChange={e => fw("addr1", e.target.value)} />

              {label("Address Line 2")}
              <input {...inp} value={form.addr2} onChange={e => fw("addr2", e.target.value)} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>{label("City")}<input {...inp} value={form.city} onChange={e => fw("city", e.target.value)} /></div>
                <div>{label("County")}<input {...inp} value={form.county} onChange={e => fw("county", e.target.value)} /></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>{label("Postcode")}<input {...inp} value={form.postcode} onChange={e => fw("postcode", e.target.value)} /></div>
                <div>
                  {label("Country")}
                  <select {...inp} value={form.country} onChange={e => fw("country", e.target.value)}>
                    {NATIONS.map(([c, n]) => <option key={c} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {label("Emergency Contact Name")}
              <input {...inp} value={form.emergencyName} onChange={e => fw("emergencyName", e.target.value)} />

              {label("Emergency Contact Phone")}
              <input {...inp} value={form.emergencyPhone} onChange={e => fw("emergencyPhone", e.target.value)} />

              {label("Medical Conditions / Allergies")}
              <input {...inp} value={form.medical} onChange={e => fw("medical", e.target.value)} placeholder="None" />

              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" id="ischild" checked={form.isChild} onChange={e => fw("isChild", e.target.checked)} />
                <label htmlFor="ischild" style={{ fontSize: 12, color: "var(--muted)" }}>Minor (under 18)</label>
              </div>

              {form.isChild && (
                <>
                  {label("Parent / Guardian Name")}
                  <input {...inp} value={form.guardian} onChange={e => fw("guardian", e.target.value)} />
                </>
              )}

              <div style={{ marginTop: 20 }}>
                <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setStep("save")}>
                  Looks Good → Assign to Player
                </button>
              </div>
            </div>

            {/* Right: image preview */}
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: ".12em", color: "var(--muted)" }}>
                ORIGINAL IMAGE
              </div>
              <img src={imagePreview} alt="Original waiver" style={{ width: "100%", objectFit: "contain", border: "1px solid #2a2a2a", flex: 1 }} />
            </div>
          </div>
        </div>
      )}

      {/* STEP: Assign to player */}
      {step === "save" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="card">
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: ".12em", color: "var(--accent)", marginBottom: 4 }}>
              👤 SELECT PLAYER
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
              This waiver will be added as an additional player waiver on the selected profile.
            </div>

            <input
              {...inp}
              placeholder="Search by name or email..."
              value={playerSearch}
              onChange={e => { setPlayerSearch(e.target.value); setSelectedPlayer(null); }}
              style={{ ...inp.style, marginBottom: 8 }}
            />

            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #1a1a1a" }}>
              {filteredPlayers.slice(0, 50).map(u => (
                <div
                  key={u.id}
                  onClick={() => setSelectedPlayer(u)}
                  style={{
                    padding: "10px 14px", cursor: "pointer",
                    background: selectedPlayer?.id === u.id ? "rgba(200,255,0,.08)" : "transparent",
                    borderBottom: "1px solid #111",
                    borderLeft: selectedPlayer?.id === u.id ? "3px solid var(--accent)" : "3px solid transparent",
                    transition: "background .1s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: selectedPlayer?.id === u.id ? "var(--accent)" : "var(--text)" }}>
                    {u.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{u.email}</div>
                  {u.waiverData && (
                    <div style={{ fontSize: 10, color: "rgba(200,255,0,.5)", marginTop: 2 }}>
                      Has waiver{u.extraWaivers?.length ? ` + ${u.extraWaivers.length} additional` : ""}
                    </div>
                  )}
                </div>
              ))}
              {filteredPlayers.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No players found</div>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 12 }}>
              WAIVER SUMMARY
            </div>
            {[
              ["Name", form.name || "—"],
              ["DOB", form.dob || "—"],
              ["Address", [form.addr1, form.city, form.postcode].filter(Boolean).join(", ") || "—"],
              ["Emergency", form.emergencyName ? `${form.emergencyName} · ${form.emergencyPhone}` : "—"],
              ["Medical", form.medical || "None"],
              ["Minor", form.isChild ? `Yes (Guardian: ${form.guardian})` : "No"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid #1a1a1a", fontSize: 12 }}>
                <span style={{ color: "var(--muted)", minWidth: 100 }}>{k}:</span>
                <span style={{ color: "var(--text)" }}>{v}</span>
              </div>
            ))}

            {selectedPlayer && (
              <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(200,255,0,.06)", border: "1px solid rgba(200,255,0,.2)", borderRadius: 3 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>SAVING TO</div>
                <div style={{ fontWeight: 700, color: "var(--accent)" }}>{selectedPlayer.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{selectedPlayer.email}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setStep("review")}>← Back</button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={!selectedPlayer || saving}
                onClick={saveWaiver}
              >
                {saving ? "Saving…" : `Save Waiver → ${selectedPlayer?.name || "Select a Player"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP: Done */}
      {step === "done" && (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <div style={{ fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: ".1em", marginBottom: 8 }}>
            WAIVER SAVED
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 32 }}>
            {selectedPlayer?.name}'s waiver has been added to their profile.
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={reset}>Scan Another Waiver</button>
          </div>
        </div>
      )}
    </div>
  );
}
