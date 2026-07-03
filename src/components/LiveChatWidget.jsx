// components/LiveChatWidget.jsx
// Site-wide floating live chat bubble. Every message — guest or member,
// in-hours or out-of-hours — is saved to chat_conversations/chat_messages,
// which the admin sees in Contact Inbox → Live Chat.
import React, { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { sendEmail } from "../utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const GUEST_KEY = "sa_live_chat_guest";
const POLL_MS = 4000;

const DEFAULT_HOURS = {
  mon: { enabled: true, open: "09:00", close: "21:00" },
  tue: { enabled: true, open: "09:00", close: "21:00" },
  wed: { enabled: true, open: "09:00", close: "21:00" },
  thu: { enabled: true, open: "09:00", close: "21:00" },
  fri: { enabled: true, open: "09:00", close: "21:00" },
  sat: { enabled: true, open: "09:00", close: "21:00" },
  sun: { enabled: true, open: "09:00", close: "21:00" },
};

// Exported so AdminSettings can reuse the exact same logic for its live preview.
export function computeChatOnline(hours) {
  if (!hours) return false;
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const wd = parts.find(p => p.type === "weekday")?.value?.slice(0, 3).toLowerCase();
  const hh = parts.find(p => p.type === "hour")?.value;
  const mm = parts.find(p => p.type === "minute")?.value;
  const key = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" }[wd] || wd;
  const day = hours[key];
  if (!day || !day.enabled) return false;
  const nowMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  const [oh, om] = (day.open || "00:00").split(":").map(Number);
  const [ch, cm] = (day.close || "00:00").split(":").map(Number);
  const openMin = oh * 60 + om, closeMin = ch * 60 + cm;
  if (closeMin <= openMin) return false; // misconfigured — treat as closed
  return nowMin >= openMin && nowMin < closeMin;
}

export function LiveChatWidget({ cu }) {
  const [chatEnabled, setChatEnabled] = useState(false);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [offlineMsg, setOfflineMsg] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState(null);       // { id, access_token?, status }
  const [messages, setMessages] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  // Pre-chat form (guests only)
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gMsg, setGMsg] = useState("");

  const pollRef = useRef(null);
  const scrollRef = useRef(null);
  const channelRef = useRef(null);

  // ── Load settings once ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [enabledRaw, hoursRaw, offlineRaw] = await Promise.all([
          api.settings.get("live_chat_enabled"),
          api.settings.get("live_chat_hours"),
          api.settings.get("live_chat_offline_message"),
        ]);
        setChatEnabled(enabledRaw !== "false"); // default ON if unset
        if (hoursRaw) { try { setHours(JSON.parse(hoursRaw)); } catch { /* keep defaults */ } }
        setOfflineMsg(offlineRaw || "We're offline right now, but leave a message and we'll get back to you as soon as we're back!");
      } catch { /* keep defaults, still show widget */ }
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    setIsOnline(computeChatOnline(hours));
    const t = setInterval(() => setIsOnline(computeChatOnline(hours)), 60000);
    return () => clearInterval(t);
  }, [hours]);

  // ── Restore existing conversation on load (logged-in or guest) ─
  useEffect(() => {
    if (!settingsLoaded) return;
    if (cu?.id) {
      (async () => {
        const { data } = await supabase
          .from("chat_conversations")
          .select("id, status, unread_by_visitor")
          .eq("user_id", cu.id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setConv({ id: data.id, status: data.status });
          setHasUnread(!!data.unread_by_visitor);
        }
      })();
    } else {
      const saved = localStorage.getItem(GUEST_KEY);
      if (saved) {
        try {
          const g = JSON.parse(saved);
          if (g?.conversationId && g?.accessToken) {
            setConv({ id: g.conversationId, access_token: g.accessToken, status: g.status || "open" });
            setGName(g.name || ""); setGEmail(g.email || "");
            supabase.rpc("guest_chat_has_unread", { p_conversation_id: g.conversationId, p_access_token: g.accessToken })
              .then(({ data: unread }) => setHasUnread(!!unread)).catch(() => {});
          }
        } catch { /* ignore malformed local data */ }
      }
    }
  }, [settingsLoaded, cu?.id]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  // ── Load thread when panel opens ────────────────────────────
  const loadThreadMember = useCallback(async (conversationId) => {
    const { data: msgs } = await supabase
      .from("chat_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    setMessages(msgs || []);
    await supabase.from("chat_conversations").update({ unread_by_visitor: false }).eq("id", conversationId);
    setHasUnread(false);
    scrollToBottom();
  }, [scrollToBottom]);

  const loadThreadGuest = useCallback(async (conversationId, accessToken) => {
    const { data: result } = await supabase.rpc("get_guest_chat", { p_conversation_id: conversationId, p_access_token: accessToken });
    if (result) {
      setMessages(result.messages || []);
      setConv(c => ({ ...c, status: result.conversation?.status || "open" }));
      setHasUnread(false);
    }
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    if (!open || !conv?.id) return;
    setLoadingThread(true);
    const run = cu?.id ? loadThreadMember(conv.id) : loadThreadGuest(conv.id, conv.access_token);
    Promise.resolve(run).finally(() => setLoadingThread(false));
  }, [open, conv?.id]); // eslint-disable-line

  // ── Realtime (members) / polling (guests) while panel open ──
  useEffect(() => {
    if (!open || !conv?.id) return;

    if (cu?.id) {
      const ch = supabase
        .channel(`chat_${conv.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conv.id}` },
          payload => { setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]); scrollToBottom(); })
        .subscribe();
      channelRef.current = ch;
      return () => { supabase.removeChannel(ch); channelRef.current = null; };
    } else {
      pollRef.current = setInterval(() => loadThreadGuest(conv.id, conv.access_token), POLL_MS);
      return () => { clearInterval(pollRef.current); pollRef.current = null; };
    }
  }, [open, conv?.id, cu?.id]); // eslint-disable-line

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── Actions ──────────────────────────────────────────────────
  const notifyAdminNewChat = (name, firstBody, online) => {
    sendEmail({
      toEmail: "swindonairsoftfield@gmail.com",
      toName: "Swindon Airsoft Admin",
      subject: `New live chat from ${name}${online ? "" : " (out of hours)"}`,
      htmlContent: `
        <div style="font-family:'Courier New',monospace;max-width:520px;background:#000;padding:0">
          <div style="background:#0a1a0a;padding:24px 32px;border-bottom:1px solid #2a3a2a">
            <p style="margin:0 0 6px;color:#8aaa8a;font-size:11px;letter-spacing:3px;text-transform:uppercase">Swindon Airsoft · Live Chat</p>
            <h1 style="margin:0;color:#c8ff00;font-size:24px;font-weight:900;letter-spacing:2px;text-transform:uppercase">${online ? "New Chat" : "Message (Offline)"}</h1>
          </div>
          <div style="padding:24px 32px">
            <p style="margin:0 0 6px;color:#e0e0e0;font-size:14px"><strong>${name}</strong> started a live chat${online ? "" : " while you were offline"}.</p>
            <div style="background:#0a1a0a;border-left:3px solid #2a3a2a;padding:14px 18px;color:#8aaa8a;font-size:13px;line-height:1.6;white-space:pre-wrap;margin-top:12px">${firstBody}</div>
          </div>
          <div style="padding:0 32px 24px;text-align:center">
            <a href="https://swindon-airsoft.com/admin#admin/contact-inbox" style="display:inline-block;background:#c8ff00;color:#000;padding:12px 28px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-size:12px">Reply in Inbox →</a>
          </div>
          <div style="padding:12px 32px;border-top:1px solid #1a2a1a;text-align:center">
            <p style="margin:0;color:#4a6a4a;font-size:10px;letter-spacing:2px;text-transform:uppercase">Swindon Airsoft · Auto-Generated Notification</p>
          </div>
        </div>
      `,
    }).catch(() => {});
  };

  const startGuestChat = async () => {
    if (!gName.trim() || !gEmail.trim() || !gEmail.includes("@") || !gMsg.trim()) return;
    setSending(true);
    try {
      const { data: result, error } = await supabase.rpc("start_guest_chat", {
        p_name: gName.trim(), p_email: gEmail.trim(), p_message: gMsg.trim(), p_within_hours: isOnline,
      });
      if (error) throw error;
      const row = Array.isArray(result) ? result[0] : result;
      const saved = { conversationId: row.conversation_id, accessToken: row.access_token, name: gName.trim(), email: gEmail.trim(), status: "open" };
      localStorage.setItem(GUEST_KEY, JSON.stringify(saved));
      setConv({ id: row.conversation_id, access_token: row.access_token, status: "open" });
      setMessages([{ id: "local-first", sender_type: "visitor", sender_name: gName.trim(), body: gMsg.trim(), created_at: new Date().toISOString() }]);
      notifyAdminNewChat(gName.trim(), gMsg.trim(), isOnline);
      setGMsg("");
    } catch (e) {
      console.error("start_guest_chat failed", e);
    } finally { setSending(false); }
  };

  const startMemberChat = async (firstBody) => {
    if (!firstBody.trim()) return;
    setSending(true);
    try {
      const { data: newConv, error: cErr } = await supabase
        .from("chat_conversations")
        .insert({ user_id: cu.id, visitor_name: cu.name || cu.email, visitor_email: cu.email, within_hours: isOnline })
        .select().single();
      if (cErr) throw cErr;
      const { error: mErr } = await supabase
        .from("chat_messages").insert({ conversation_id: newConv.id, sender_type: "visitor", sender_name: cu.name || cu.email, body: firstBody.trim() });
      if (mErr) throw mErr;
      setConv({ id: newConv.id, status: "open" });
      setMessages([{ id: "local-first", sender_type: "visitor", sender_name: cu.name || cu.email, body: firstBody.trim(), created_at: new Date().toISOString() }]);
      notifyAdminNewChat(cu.name || cu.email, firstBody.trim(), isOnline);
      setBody("");
    } catch (e) {
      console.error("start member chat failed", e);
    } finally { setSending(false); }
  };

  const sendMessage = async () => {
    if (!body.trim() || !conv?.id) return;
    const text = body.trim();
    setSending(true);
    setBody("");
    try {
      if (cu?.id) {
        const { error } = await supabase.from("chat_messages")
          .insert({ conversation_id: conv.id, sender_type: "visitor", sender_name: cu.name || cu.email, body: text });
        if (error) throw error;
        setMessages(prev => [...prev, { id: `local-${Date.now()}`, sender_type: "visitor", sender_name: cu.name || cu.email, body: text, created_at: new Date().toISOString() }]);
      } else {
        const { error } = await supabase.rpc("send_guest_chat_message", { p_conversation_id: conv.id, p_access_token: conv.access_token, p_body: text });
        if (error) throw error;
        setMessages(prev => [...prev, { id: `local-${Date.now()}`, sender_type: "visitor", sender_name: gName, body: text, created_at: new Date().toISOString() }]);
      }
      scrollToBottom();
    } catch (e) {
      console.error("send message failed", e);
      setBody(text);
    } finally { setSending(false); }
  };

  const startNewConversation = () => {
    setConv(null);
    setMessages([]);
    if (!cu?.id) localStorage.removeItem(GUEST_KEY);
  };

  if (!settingsLoaded || !chatEnabled) return null;

  const mono = "'Share Tech Mono',monospace";
  const head = "'Oswald','Barlow Condensed',sans-serif";
  const isClosedConv = conv?.status === "closed";

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Live chat"
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 9998,
          width: 58, height: 58, borderRadius: "50%", cursor: "pointer",
          background: "#c8ff00", border: "2px solid #000", color: "#000",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, boxShadow: "0 4px 18px rgba(0,0,0,.5)",
        }}>
        {open ? "✕" : "💬"}
        {!open && hasUnread && (
          <span style={{ position: "absolute", top: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: "#ff3b30", border: "2px solid #080a06" }} />
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 88, right: 20, zIndex: 9998,
          width: 340, maxWidth: "calc(100vw - 32px)", height: 460, maxHeight: "calc(100vh - 140px)",
          background: "#0c1009", border: "1px solid #2a3a10", boxShadow: "0 10px 40px rgba(0,0,0,.6)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a2808", background: "#0a0d07" }}>
            <div style={{ fontFamily: head, fontWeight: 900, fontSize: 14, letterSpacing: ".1em", color: "#e8f0d8", textTransform: "uppercase" }}>
              Swindon Airsoft Chat
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: isOnline ? "#4caf50" : "#607d8b" }} />
              <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".1em", color: isOnline ? "#81c784" : "#607d8b" }}>
                {isOnline ? "ONLINE NOW" : "OFFLINE — LEAVE A MESSAGE"}
              </span>
            </div>
          </div>

          {/* Body */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px" }}>
            {!isOnline && !conv && (
              <div style={{ fontFamily: mono, fontSize: 11, color: "#8aaa60", lineHeight: 1.7, marginBottom: 14, background: "#0a1a0a", border: "1px solid #1a2e1a", padding: "10px 12px" }}>
                {offlineMsg}
              </div>
            )}

            {loadingThread && <div style={{ fontFamily: mono, fontSize: 10, color: "#3a5010" }}>Loading…</div>}

            {!loadingThread && conv && messages.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.sender_type === "admin" ? "flex-start" : "flex-end", marginBottom: 10 }}>
                <div style={{
                  maxWidth: "80%", padding: "8px 12px", fontSize: 12, lineHeight: 1.6, fontFamily: mono, whiteSpace: "pre-wrap",
                  background: m.sender_type === "admin" ? "#161c0e" : "#c8ff00",
                  color: m.sender_type === "admin" ? "#b0c090" : "#000",
                  border: m.sender_type === "admin" ? "1px solid #2a3a10" : "none",
                }}>
                  {m.body}
                </div>
              </div>
            ))}

            {!conv && !cu?.id && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={gName} onChange={e => setGName(e.target.value)} placeholder="Your name"
                  style={{ background: "#080a06", border: "1px solid #1a2808", color: "#b0c090", padding: "9px 10px", fontSize: 12, fontFamily: mono, outline: "none" }} />
                <input value={gEmail} onChange={e => setGEmail(e.target.value)} placeholder="Your email" type="email"
                  style={{ background: "#080a06", border: "1px solid #1a2808", color: "#b0c090", padding: "9px 10px", fontSize: 12, fontFamily: mono, outline: "none" }} />
                <textarea rows={3} value={gMsg} onChange={e => setGMsg(e.target.value)} placeholder="How can we help?"
                  style={{ background: "#080a06", border: "1px solid #1a2808", color: "#b0c090", padding: "9px 10px", fontSize: 12, fontFamily: mono, outline: "none", resize: "none" }} />
                <button onClick={startGuestChat} disabled={sending || !gName.trim() || !gEmail.trim() || !gMsg.trim()}
                  style={{ fontFamily: head, fontWeight: 900, fontSize: 11, letterSpacing: ".15em", padding: "10px", textTransform: "uppercase",
                    background: sending ? "#1a2808" : "#c8ff00", color: sending ? "#3a5010" : "#000", border: "none", cursor: "pointer" }}>
                  {sending ? "SENDING…" : "▸ START CHAT"}
                </button>
              </div>
            )}

            {!conv && cu?.id && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: "#6a8a60", marginBottom: 2 }}>Hi {cu.name?.split(" ")[0] || "there"} — how can we help?</div>
                <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Type your message…"
                  style={{ background: "#080a06", border: "1px solid #1a2808", color: "#b0c090", padding: "9px 10px", fontSize: 12, fontFamily: mono, outline: "none", resize: "none" }} />
                <button onClick={() => startMemberChat(body)} disabled={sending || !body.trim()}
                  style={{ fontFamily: head, fontWeight: 900, fontSize: 11, letterSpacing: ".15em", padding: "10px", textTransform: "uppercase",
                    background: sending ? "#1a2808" : "#c8ff00", color: sending ? "#3a5010" : "#000", border: "none", cursor: "pointer" }}>
                  {sending ? "SENDING…" : "▸ START CHAT"}
                </button>
              </div>
            )}
          </div>

          {/* Footer input (existing conversation) */}
          {conv && !isClosedConv && (
            <div style={{ padding: "10px 12px", borderTop: "1px solid #1a2808", display: "flex", gap: 8 }}>
              <input
                value={body} onChange={e => setBody(e.target.value)} placeholder="Type a message…"
                onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
                style={{ flex: 1, background: "#080a06", border: "1px solid #1a2808", color: "#b0c090", padding: "9px 10px", fontSize: 12, fontFamily: mono, outline: "none" }} />
              <button onClick={sendMessage} disabled={sending || !body.trim()}
                style={{ fontFamily: head, fontWeight: 900, fontSize: 11, padding: "0 14px",
                  background: sending || !body.trim() ? "#1a2808" : "#c8ff00", color: sending || !body.trim() ? "#3a5010" : "#000", border: "none", cursor: "pointer" }}>
                ➤
              </button>
            </div>
          )}

          {conv && isClosedConv && (
            <div style={{ padding: "12px", borderTop: "1px solid #1a2808", textAlign: "center" }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: "#607d8b", marginBottom: 8 }}>This conversation was closed.</div>
              <button onClick={startNewConversation}
                style={{ fontFamily: head, fontWeight: 800, fontSize: 11, letterSpacing: ".1em", padding: "8px 16px", background: "transparent", border: "1px solid #2a3a10", color: "#c8ff00", cursor: "pointer" }}>
                START NEW CONVERSATION
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
