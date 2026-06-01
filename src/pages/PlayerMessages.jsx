import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

const MIL  = { fontFamily:"'Oswald','Barlow Condensed',sans-serif" };
const MONO = { fontFamily:"'Share Tech Mono',monospace" };

export function PlayerMessages({ cu, showToast }) {
  const [threads, setThreads]     = useState([]); // grouped conversations
  const [active, setActive]       = useState(null); // active thread userId
  const [messages, setMessages]   = useState([]);
  const [body, setBody]           = useState("");
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [profiles, setProfiles]   = useState({});
  const bottomRef = useRef(null);

  const loadThreads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`from_user_id.eq.${cu.id},to_user_id.eq.${cu.id}`)
      .order("created_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    // Group into threads by the other user
    const threadMap = {};
    data.forEach(m => {
      const otherId = m.from_user_id === cu.id ? m.to_user_id : m.from_user_id;
      if (!threadMap[otherId]) threadMap[otherId] = { userId: otherId, lastMsg: m, unread: 0 };
      if (!m.read && m.to_user_id === cu.id) threadMap[otherId].unread++;
    });
    const sorted = Object.values(threadMap).sort((a, b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at));
    setThreads(sorted);

    // Fetch profiles for all thread participants
    const ids = [...new Set(sorted.map(t => t.userId))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name, callsign, profile_pic").in("id", ids);
      if (profs) {
        const map = {};
        profs.forEach(p => { map[p.id] = p; });
        setProfiles(map);
      }
    }
    setLoading(false);
  };

  const loadMessages = async (otherUserId) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(from_user_id.eq.${cu.id},to_user_id.eq.${otherUserId}),and(from_user_id.eq.${otherUserId},to_user_id.eq.${cu.id})`)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    // Mark as read
    await supabase.from("messages").update({ read: true })
      .eq("to_user_id", cu.id).eq("from_user_id", otherUserId).eq("read", false);
    setThreads(prev => prev.map(t => t.userId === otherUserId ? { ...t, unread: 0 } : t));
  };

  useEffect(() => { if (cu?.id) loadThreads(); }, [cu?.id]);

  useEffect(() => {
    if (active) loadMessages(active);
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  const send = async () => {
    if (!body.trim() || !active) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      from_user_id: cu.id,
      to_user_id: active,
      body: body.trim(),
      read: false,
    });
    if (error) { showToast("Failed to send: " + error.message, "red"); }
    else {
      setBody("");
      await loadMessages(active);
      loadThreads();
    }
    setSending(false);
  };

  const activeProfile = active ? profiles[active] : null;
  const unreadTotal = threads.reduce((s, t) => s + (t.unread || 0), 0);

  if (loading) return <div style={{ ...MONO, fontSize:11, color:"var(--muted)", padding:40, textAlign:"center" }}>Loading messages…</div>;

  return (
    <div style={{ display:"flex", height:500, border:"1px solid var(--border)", background:"#080b06" }}>

      {/* Thread list */}
      <div style={{ width:220, borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", flexShrink:0 }}>
        <div style={{ padding:"12px 14px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ ...MIL, fontWeight:700, fontSize:13, color:"var(--accent)", letterSpacing:".08em" }}>
            💬 MESSAGES {unreadTotal > 0 && <span style={{ background:"#ef4444", color:"#fff", fontSize:9, padding:"1px 5px", marginLeft:4, borderRadius:2 }}>{unreadTotal}</span>}
          </div>
        </div>
        {threads.length === 0 ? (
          <div style={{ padding:20, ...MONO, fontSize:10, color:"var(--muted)", textAlign:"center" }}>No messages yet</div>
        ) : (
          <div style={{ overflowY:"auto", flex:1 }}>
            {threads.map(t => {
              const p = profiles[t.userId];
              return (
                <div key={t.userId} onClick={() => setActive(t.userId)}
                  style={{ padding:"10px 14px", borderBottom:"1px solid #0f1a08", cursor:"pointer",
                    background: active === t.userId ? "rgba(200,255,0,.08)" : "transparent",
                    borderLeft: active === t.userId ? "2px solid var(--accent)" : "2px solid transparent" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                    <div style={{ fontWeight:700, fontSize:12, color: active === t.userId ? "#fff" : "var(--text)" }}>{p?.name || "Operator"}</div>
                    {t.unread > 0 && <span style={{ background:"#c8ff00", color:"#000", fontSize:8, fontWeight:900, padding:"1px 5px" }}>{t.unread}</span>}
                  </div>
                  <div style={{ ...MONO, fontSize:9, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {t.lastMsg.body.slice(0, 40)}{t.lastMsg.body.length > 40 ? "…" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Message area */}
      {active ? (
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
          {/* Header */}
          <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
            <div>
              <div style={{ ...MIL, fontWeight:700, fontSize:14 }}>{activeProfile?.name || "Operator"}</div>
              {activeProfile?.callsign && <div style={{ ...MONO, fontSize:9, color:"var(--muted)" }}>{activeProfile.callsign}</div>}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
            {messages.map(m => {
              const isMe = m.from_user_id === cu.id;
              return (
                <div key={m.id} style={{ display:"flex", flexDirection:"column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth:"75%", padding:"8px 12px", fontSize:13, lineHeight:1.5,
                    background: isMe ? "rgba(200,255,0,.12)" : "#0d1209",
                    border: `1px solid ${isMe ? "rgba(200,255,0,.25)" : "#1e2e12"}`,
                    color: isMe ? "#c8d4b0" : "#8aaa60",
                    wordBreak:"break-word"
                  }}>
                    {m.ad_id && <div style={{ ...MONO, fontSize:8, color:"#5a6e42", marginBottom:4, letterSpacing:".1em" }}>RE: CLASSIFIED AD</div>}
                    {m.body}
                  </div>
                  <div style={{ ...MONO, fontSize:8, color:"#2a3a10", marginTop:2 }}>
                    {new Date(m.created_at).toLocaleString("en-GB", { timeZone:"Europe/London", hour:"2-digit", minute:"2-digit", day:"2-digit", month:"short" })}
                    {isMe && <span style={{ marginLeft:4 }}>{m.read ? "✓✓" : "✓"}</span>}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding:"10px 14px", borderTop:"1px solid var(--border)", display:"flex", gap:8 }}>
            <input
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && !sending && send()}
              placeholder="Type a message…"
              style={{ flex:1, padding:"8px 12px", background:"#0d1209", border:"1px solid var(--border)", color:"var(--text)", fontSize:13 }}
            />
            <button className="btn btn-primary btn-sm" onClick={send} disabled={sending || !body.trim()}>
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--muted)", ...MONO, fontSize:11 }}>
          Select a conversation
        </div>
      )}
    </div>
  );
}
