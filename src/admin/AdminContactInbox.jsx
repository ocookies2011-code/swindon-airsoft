// admin/AdminContactInbox.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { sendEmail } from "../utils";

const STATUS_BADGE = {
  open:    { bg: "#1a1200", color: "#ffd54f", border: "#4a3800" },
  replied: { bg: "#0a1a0a", color: "#81c784", border: "#1a4a1a" },
  closed:  { bg: "#111", color: "#607d8b", border: "#263238" },
};

export function AdminContactInbox({ showToast, cu }) {
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending]     = useState(false);
  const [filter, setFilter]       = useState("open");

  const fetchMessages = async () => {
    setLoading(true);
    let q = supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) showToast("Failed to load messages: " + error.message, "red");
    setMessages(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchMessages(); }, [filter]); // eslint-disable-line

  const openMessage = async (msg) => {
    setSelected(msg);
    setReplyText("");
    if (!msg.read_by_admin) {
      await supabase.from("contact_messages").update({ read_by_admin: true }).eq("id", msg.id);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_by_admin: true } : m));
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      // Save reply to DB
      const { error: updateErr } = await supabase
        .from("contact_messages")
        .update({
          reply_body:  replyText.trim(),
          replied_at:  new Date().toISOString(),
          replied_by:  cu?.id || null,
          status:      "replied",
        })
        .eq("id", selected.id);
      if (updateErr) throw updateErr;

      // Email the user via EmailJS
      await sendEmail({
        toEmail:     selected.sender_email,
        toName:      selected.sender_name,
        subject:     `Re: ${selected.subject}`,
        htmlContent: `
          <div style="font-family:'Courier New',monospace;max-width:600px;background:#000;padding:0">
            <div style="background:#0a1a0a;padding:24px 32px;border-bottom:1px solid #2a3a2a">
              <p style="margin:0 0 6px;color:#8aaa8a;font-size:11px;letter-spacing:3px;text-transform:uppercase">Swindon Airsoft</p>
              <h1 style="margin:0;color:#c8ff00;font-size:24px;font-weight:900;letter-spacing:2px;text-transform:uppercase">Reply to Your Message</h1>
            </div>
            <div style="padding:24px 32px">
              <p style="margin:0 0 8px;color:#8aaa8a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Your original message</p>
              <div style="background:#0a1a0a;border-left:3px solid #2a3a2a;padding:14px 18px;color:#8aaa8a;font-size:13px;line-height:1.6;white-space:pre-wrap;margin-bottom:24px">${selected.body}</div>
              <p style="margin:0 0 10px;color:#8aaa8a;font-size:11px;letter-spacing:2px;text-transform:uppercase">Reply from Swindon Airsoft</p>
              <div style="background:#0a1a0a;border:1px solid #2a3a2a;padding:18px;color:#e0e0e0;line-height:1.7;white-space:pre-wrap">${replyText.trim()}</div>
            </div>
            <div style="padding:16px 32px;border-top:1px solid #2a3a2a;text-align:center">
              <p style="margin:0 0 12px;color:#8aaa8a;font-size:12px">Need to follow up?</p>
              <a href="https://swindon-airsoft.com/#contact" style="display:inline-block;background:#c8ff00;color:#000;padding:12px 28px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-size:12px">Contact Us Again</a>
            </div>
            <div style="padding:12px 32px;text-align:center">
              <p style="margin:0;color:#4a6a4a;font-size:10px;letter-spacing:2px;text-transform:uppercase">Swindon Airsoft · swindon-airsoft.com</p>
            </div>
          </div>
        `,
      });

      const updated = { ...selected, reply_body: replyText.trim(), replied_at: new Date().toISOString(), status: "replied" };
      setSelected(updated);
      setMessages(prev => prev.map(m => m.id === selected.id ? updated : m));
      setReplyText("");
      showToast("Reply sent to " + selected.sender_email);
    } catch (err) {
      showToast("Failed to send reply: " + err.message, "red");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (id, status) => {
    await supabase.from("contact_messages").update({ status }).eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    if (selected?.id === id) setSelected(s => ({ ...s, status }));
  };

  const unread = messages.filter(m => !m.read_by_admin).length;

  const mono = "'Share Tech Mono',monospace";
  const head = "'Oswald','Barlow Condensed',sans-serif";

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 140px)", minHeight: 500 }}>

      {/* Left: message list */}
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Filter tabs */}
        <div style={{ display: "flex", border: "1px solid #1a2808", marginBottom: 4 }}>
          {["open","replied","closed","all"].map(f => (
            <button key={f} onClick={() => { setFilter(f); setSelected(null); }}
              style={{ flex: 1, padding: "8px 0", fontFamily: mono, fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", cursor: "pointer", border: "none",
                background: filter === f ? "#c8ff00" : "transparent",
                color: filter === f ? "#000" : "#3a5010",
                fontWeight: filter === f ? 900 : 400 }}>
              {f}{f === "open" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ fontFamily: mono, fontSize: 10, color: "#3a5010", padding: "16px 8px" }}>LOADING…</div>}
          {!loading && messages.length === 0 && <div style={{ fontFamily: mono, fontSize: 10, color: "#3a5010", padding: "16px 8px" }}>NO MESSAGES</div>}
          {messages.map(msg => {
            const st = STATUS_BADGE[msg.status] || STATUS_BADGE.open;
            const isActive = selected?.id === msg.id;
            return (
              <div key={msg.id} onClick={() => openMessage(msg)}
                style={{ padding: "12px 14px", borderBottom: "1px solid #1a2808", cursor: "pointer", background: isActive ? "#0c1a0c" : "transparent",
                  borderLeft: isActive ? "2px solid #c8ff00" : "2px solid transparent" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontFamily: head, fontWeight: 800, fontSize: 12, color: !msg.read_by_admin ? "#c8ff00" : "#b0c090", letterSpacing: ".05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {!msg.read_by_admin && <span style={{ display: "inline-block", width: 6, height: 6, background: "#c8ff00", borderRadius: "50%", marginRight: 6, verticalAlign: "middle" }} />}
                    {msg.sender_name}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 8, letterSpacing: ".1em", border: `1px solid ${st.border}`, background: st.bg, color: st.color, padding: "2px 6px", flexShrink: 0 }}>
                    {msg.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: "#4a6040", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>{msg.subject}</div>
                <div style={{ fontFamily: mono, fontSize: 9, color: "#2a3a20" }}>
                  {new Date(msg.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: message detail */}
      <div style={{ flex: 1, background: "#0c1009", border: "1px solid #1a2808", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#2a3a10", letterSpacing: ".2em" }}>SELECT A MESSAGE</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a2808" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: head, fontWeight: 900, fontSize: 18, color: "#e8f0d8", letterSpacing: ".05em", marginBottom: 4 }}>{selected.subject}</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: "#4a6040" }}>
                    FROM: <span style={{ color: "#b0c090" }}>{selected.sender_name}</span>
                    {" · "}
                    <a href={`mailto:${selected.sender_email}`} style={{ color: "#c8ff00", textDecoration: "none" }}>{selected.sender_email}</a>
                    {" · "}
                    <span style={{ color: "#2a3a10" }}>{new Date(selected.created_at).toLocaleString("en-GB")}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {selected.status !== "closed"
                    ? <button onClick={() => setStatus(selected.id, "closed")}
                        style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", padding: "6px 12px", background: "transparent", border: "1px solid #1a2808", color: "#607d8b", cursor: "pointer" }}>
                        CLOSE
                      </button>
                    : <button onClick={() => setStatus(selected.id, "open")}
                        style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", padding: "6px 12px", background: "transparent", border: "1px solid #2a4a2a", color: "#81c784", cursor: "pointer" }}>
                        REOPEN
                      </button>
                  }
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              <div style={{ whiteSpace: "pre-wrap", color: "#b0c090", fontSize: 13, lineHeight: 1.8, fontFamily: mono }}>
                {selected.body}
              </div>

              {selected.reply_body && (
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #1a2808" }}>
                  <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: "#c8ff00", marginBottom: 12 }}>
                    ▸ YOUR REPLY · {selected.replied_at && new Date(selected.replied_at).toLocaleString("en-GB")}
                  </div>
                  <div style={{ borderLeft: "2px solid #c8ff00", paddingLeft: 14, color: "#6a8a60", fontSize: 12, lineHeight: 1.8, fontFamily: mono, whiteSpace: "pre-wrap" }}>
                    {selected.reply_body}
                  </div>
                </div>
              )}
            </div>

            {/* Reply box */}
            {selected.status !== "closed" && (
              <div style={{ padding: "16px 20px", borderTop: "1px solid #1a2808" }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".15em", color: "#3a5010", marginBottom: 8 }}>
                  ▸ REPLY — WILL BE EMAILED TO {selected.sender_email.toUpperCase()}
                </div>
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply…"
                  style={{ width: "100%", background: "#080a06", border: "1px solid #1a2808", color: "#b0c090", padding: "12px 14px", fontSize: 13, fontFamily: mono, resize: "none", boxSizing: "border-box", outline: "none", lineHeight: 1.7 }}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendReply(); }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: "#2a3a10" }}>Ctrl+Enter to send</span>
                  <button onClick={sendReply} disabled={sending || !replyText.trim()}
                    style={{ fontFamily: head, fontWeight: 900, fontSize: 11, letterSpacing: ".2em", padding: "10px 24px",
                      background: sending || !replyText.trim() ? "#1a2808" : "#c8ff00",
                      color: sending || !replyText.trim() ? "#3a5010" : "#000",
                      border: "none", cursor: sending || !replyText.trim() ? "not-allowed" : "pointer", textTransform: "uppercase" }}>
                    {sending ? "TRANSMITTING…" : `▸ SEND REPLY TO ${selected.sender_name.toUpperCase()}`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
