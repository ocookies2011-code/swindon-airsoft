// pages/SelfCheckInPage.jsx — player self check-in via QR code
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const MIL = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const ACCENT = "#c8ff00";

export function SelfCheckInPage({ cu, setAuthModal }) {
  const [status, setStatus]   = useState("loading");
  const [event, setEvent]     = useState(null);
  const [booking, setBooking] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [errMsg, setErrMsg]   = useState("");

  useEffect(() => { load(); }, [cu?.id]);

  const todayStr = () => {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth()+1).padStart(2,"0") + "-" + String(n.getDate()).padStart(2,"0");
  };

  const load = async () => {
    setStatus("loading");
    try {
      // Find next upcoming event
      const { data: events } = await supabase
        .from("events")
        .select("id, title, date, time, location")
        .gte("date", todayStr())
        .order("date", { ascending: true })
        .limit(1);

      if (!events?.length) { setStatus("no-event"); return; }
      const ev = events[0];
      setEvent(ev);

      // Check if event is today
      if (ev.date.slice(0, 10) !== todayStr()) {
        setStatus("not-today");
        return;
      }

      // Not logged in
      if (!cu?.id) { setStatus("need-login"); return; }

      // Find booking
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, ticket_type, qty, total, checked_in")
        .eq("event_id", ev.id)
        .eq("user_id", cu.id)
        .limit(1);

      if (!bookings?.length) { setStatus("no-booking"); return; }
      const b = bookings[0];
      setBooking(b);
      setStatus(b.checked_in ? "already" : "confirm");
    } catch (e) {
      setErrMsg(e.message);
      setStatus("error");
    }
  };

  const doCheckIn = async () => {
    if (!cu?.id || !booking?.id) return;
    // Final date guard
    if (event?.date?.slice(0,10) !== todayStr()) {
      setStatus("not-today");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ checked_in: true })
        .eq("id", booking.id)
        .eq("user_id", cu.id);
      if (error) throw error;
      setStatus("success");
    } catch (e) {
      setErrMsg(e.message);
      setStatus("error");
    } finally { setBusy(false); }
  };

  const Wrap = ({ children }) => (
    <div style={{ minHeight:"100vh", background:"#080b06", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420, textAlign:"center" }}>
        <div style={{ ...MIL, fontSize:11, color:ACCENT, letterSpacing:".25em", textTransform:"uppercase", marginBottom:16, opacity:.7 }}>
          ◈ SWINDON AIRSOFT ◈
        </div>
        {children}
      </div>
    </div>
  );

  if (status === "loading") return (
    <Wrap>
      <div style={{ ...MIL, fontSize:24, color:"#fff", letterSpacing:".08em" }}>LOADING…</div>
    </Wrap>
  );

  if (status === "no-event") return (
    <Wrap>
      <div style={{ fontSize:48, marginBottom:16 }}>📅</div>
      <div style={{ ...MIL, fontSize:28, fontWeight:700, color:"#fff", marginBottom:8 }}>NO UPCOMING EVENT</div>
      <div style={{ fontSize:14, color:"#5a6e42", lineHeight:1.6 }}>There are no upcoming game days scheduled right now.</div>
    </Wrap>
  );

  // ── NOT GAME DAY ──────────────────────────────────────────────
  if (status === "not-today") return (
    <Wrap>
      <div style={{ fontSize:56, marginBottom:16 }}>🔒</div>
      <div style={{ ...MIL, fontWeight:900, fontSize:32, color:"#ef4444", letterSpacing:".06em", marginBottom:8 }}>
        CHECK-IN CLOSED
      </div>
      <div style={{ background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.2)", padding:"20px 24px", marginBottom:20, borderRadius:2 }}>
        <div style={{ fontSize:14, color:"#c8d4b0", lineHeight:1.8 }}>
          Check-in is only available <strong style={{ color:"#fff" }}>on the day of the event.</strong>
        </div>
        {event && (
          <div style={{ marginTop:12, fontSize:13, color:"#5a6e42", lineHeight:1.7 }}>
            <strong style={{ color:ACCENT }}>Next event:</strong> {event.title}<br/>
            <strong style={{ color:ACCENT }}>Date:</strong> {new Date(event.date + "T12:00:00").toLocaleDateString("en-GB", { timeZone:"Europe/London", weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </div>
        )}
      </div>
      <div style={{ fontSize:12, color:"#3a5010", letterSpacing:".06em" }}>Come back on game day to check in.</div>
    </Wrap>
  );

  if (status === "need-login") return (
    <Wrap>
      <div style={{ fontSize:48, marginBottom:16 }}>👤</div>
      <div style={{ ...MIL, fontSize:26, fontWeight:700, color:"#fff", marginBottom:8 }}>LOG IN TO CHECK IN</div>
      <div style={{ fontSize:13, color:"#5a6e42", marginBottom:20, lineHeight:1.6 }}>
        <strong style={{ color:"#fff" }}>{event?.title}</strong>
      </div>
      <button className="btn btn-primary" style={{ width:"100%", fontSize:16, padding:"14px 0" }}
        onClick={() => setAuthModal("login")}>
        LOG IN
      </button>
    </Wrap>
  );

  if (status === "no-booking") return (
    <Wrap>
      <div style={{ fontSize:48, marginBottom:16 }}>🎟</div>
      <div style={{ ...MIL, fontSize:26, fontWeight:700, color:"#fff", marginBottom:8 }}>NO BOOKING FOUND</div>
      <div style={{ background:"rgba(200,255,0,.06)", border:"1px solid rgba(200,255,0,.2)", padding:"16px 20px", marginBottom:20, fontSize:13, color:"#8aaa60", lineHeight:1.8 }}>
        You don't have a booking for <strong style={{ color:"#fff" }}>{event?.title}</strong>.<br/>
        Please see a marshal for assistance.
      </div>
    </Wrap>
  );

  if (status === "already") return (
    <Wrap>
      <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
      <div style={{ ...MIL, fontSize:32, fontWeight:700, color:ACCENT, marginBottom:8 }}>ALREADY CHECKED IN</div>
      <div style={{ fontSize:14, color:"#5a6e42" }}>You're already checked in for <strong style={{ color:"#fff" }}>{event?.title}</strong>. Have a great game!</div>
    </Wrap>
  );

  if (status === "confirm") return (
    <Wrap>
      <div style={{ fontSize:48, marginBottom:16 }}>🎯</div>
      <div style={{ ...MIL, fontSize:28, fontWeight:700, color:"#fff", marginBottom:4 }}>READY TO CHECK IN?</div>
      <div style={{ ...MIL, fontSize:18, color:ACCENT, marginBottom:20 }}>{cu?.name || cu?.callsign}</div>
      <div style={{ background:"#0d1209", border:"1px solid #1e2e12", padding:"16px 20px", marginBottom:24, fontSize:13, color:"#8aaa60", lineHeight:1.8, textAlign:"left" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ color:"#3a5010" }}>EVENT</span>
          <strong style={{ color:"#fff" }}>{event?.title}</strong>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ color:"#3a5010" }}>DATE</span>
          <strong style={{ color:"#fff" }}>{event?.date}</strong>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:"#3a5010" }}>TICKET</span>
          <strong style={{ color:"#fff" }}>{booking?.ticket_type === "walkOn" ? "Walk-On" : "Rental"} ×{booking?.qty}</strong>
        </div>
      </div>
      <button className="btn btn-primary" style={{ width:"100%", fontSize:18, padding:"16px 0", marginBottom:12 }}
        disabled={busy} onClick={doCheckIn}>
        {busy ? "CHECKING IN…" : "✅ CONFIRM CHECK-IN"}
      </button>
      <div style={{ fontSize:11, color:"#3a5010", letterSpacing:".06em" }}>
        By checking in you confirm you agree to the site safety rules.
      </div>
    </Wrap>
  );

  if (status === "success") return (
    <Wrap>
      <div style={{ fontSize:80, marginBottom:16, lineHeight:1 }}>✅</div>
      <div style={{ ...MIL, fontSize:36, fontWeight:700, color:ACCENT, marginBottom:8 }}>CHECKED IN!</div>
      <div style={{ ...MIL, fontSize:20, color:"#fff", marginBottom:4 }}>{cu?.name || cu?.callsign}</div>
      <div style={{ fontSize:14, color:"#5a6e42", marginBottom:24 }}>{event?.title}</div>
      <div style={{ background:"rgba(200,255,0,.06)", border:"2px solid rgba(200,255,0,.3)", padding:"20px" }}>
        <div style={{ ...MIL, fontSize:40, color:ACCENT, letterSpacing:".1em" }}>HAVE A GREAT GAME! 🎯</div>
      </div>
    </Wrap>
  );

  return (
    <Wrap>
      <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
      <div style={{ ...MIL, fontSize:26, color:"#ef4444", marginBottom:8 }}>SOMETHING WENT WRONG</div>
      <div style={{ fontSize:13, color:"#5a6e42", marginBottom:20 }}>{errMsg || "Please see a marshal."}</div>
      <button className="btn btn-ghost" onClick={load}>Try Again</button>
    </Wrap>
  );
}
