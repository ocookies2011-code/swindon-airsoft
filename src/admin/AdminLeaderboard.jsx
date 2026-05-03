// admin/AdminLeaderboard.jsx
import React, { useState } from "react";
import { fmtDate } from "../utils";

function AdminLeaderboard({ data, updateUser, showToast }) {
  const [selected, setSelected] = useState(null);

  const board = data.users
    .filter(u => u.role === "player")
    .sort((a, b) => b.gamesAttended - a.gamesAttended);

  const openPlayer = (player) => {
    // Gather all bookings for this player across all events
    const attended = [];
    const booked   = [];
    (data.events || []).forEach(ev => {
      (ev.bookings || []).filter(b => b.userId === player.id).forEach(b => {
        const entry = {
          eventTitle: ev.title,
          date:       ev.date,
          type:       b.type,
          qty:        b.qty,
          total:      b.total,
          checkedIn:  b.checkedIn,
        };
        if (b.checkedIn) attended.push(entry);
        else             booked.push(entry);
      });
    });
    attended.sort((a, b) => new Date(b.date) - new Date(a.date));
    booked.sort((a, b) => new Date(b.date) - new Date(a.date));
    setSelected({ player, attended, booked });
  };

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Leaderboard</div></div></div>
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Games</th><th>VIP</th><th>Visible</th></tr></thead>
          <tbody>
            {board.map((boardPlayer, i) => (
              <tr key={boardPlayer.id}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>
                  <button
                    onClick={() => openPlayer(boardPlayer)}
                    style={{
                      background: "none", border: "none", padding: 0, margin: 0,
                      color: "var(--accent)", fontWeight: 600, fontSize: "inherit",
                      fontFamily: "inherit", cursor: "pointer",
                      textDecoration: "underline", textDecorationColor: "rgba(176,192,144,.4)",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {boardPlayer.name}
                  </button>
                </td>
                <td>{boardPlayer.gamesAttended}</td>
                <td>{boardPlayer.vipStatus === "active" ? <span className="tag tag-gold">⭐</span> : "—"}</td>
                <td>{boardPlayer.leaderboardOptOut ? <span className="tag tag-red">Hidden</span> : <span className="tag tag-green">Visible</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* ── Player event history modal ── */}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: "90vh", overflowY: "auto" }}>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div className="modal-title" style={{ margin: 0 }}>🎮 {selected.player.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {selected.player.gamesAttended} game{selected.player.gamesAttended !== 1 ? "s" : ""} attended
                {selected.player.vipStatus === "active" && <span style={{ marginLeft: 8, color: "var(--gold)" }}>⭐ VIP</span>}
              </div>
            </div>

            {/* Attended events */}
            <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 8 }}>
              Events Attended ({selected.attended.length})
            </div>
            {selected.attended.length === 0
              ? <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>No check-ins recorded.</div>
              : (
                <div className="table-wrap" style={{ marginBottom: 20 }}>
                  <table className="data-table">
                    <thead><tr><th>Event</th><th>Date</th><th>Ticket</th><th>Qty</th><th>Total</th></tr></thead>
                    <tbody>
                      {selected.attended.map((b, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{b.eventTitle}</td>
                          <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</td>
                          <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                          <td>{b.qty}</td>
                          <td className="text-green">£{Number(b.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }

            {/* Booked but not attended */}
            {selected.booked.length > 0 && (
              <>
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0 16px" }} />
                <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 8 }}>
                  Booked — Not Yet Attended ({selected.booked.length})
                </div>
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table className="data-table">
                    <thead><tr><th>Event</th><th>Date</th><th>Ticket</th><th>Qty</th><th>Total</th></tr></thead>
                    <tbody>
                      {selected.booked.map((b, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{b.eventTitle}</td>
                          <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(b.date)}</td>
                          <td>{b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
                          <td>{b.qty}</td>
                          <td className="text-green">£{Number(b.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { AdminLeaderboard };
