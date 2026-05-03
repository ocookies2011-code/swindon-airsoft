// admin/AdminLeaderboard.jsx
import { PlayerLink } from '../utils/PlayerLink';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";

function AdminLeaderboard({ data, updateUser, showToast }) {
  const board = data.users.filter(u => u.role === "player").sort((a, b) => b.gamesAttended - a.gamesAttended);
  return (
    <div>
      <div className="page-header"><div><div className="page-title">Leaderboard</div></div></div>
      <div className="card">
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Games</th><th>VIP</th><th>Visible</th></tr></thead>
          <tbody>
            {board.map((boardPlayer, i) => (
              <tr key={boardPlayer.id}>
                <td>{i + 1}</td><td style={{ fontWeight: 600 }}><PlayerLink id={boardPlayer.id} name={boardPlayer.name} goToPlayer={goToPlayer} /></td><td>{boardPlayer.gamesAttended}</td>
                <td>{boardPlayer.vipStatus === "active" ? <span className="tag tag-gold">⭐</span> : "—"}</td>
                <td>{boardPlayer.leaderboardOptOut ? <span className="tag tag-red">Hidden</span> : <span className="tag tag-green">Visible</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ── Admin Failed Payments ─────────────────────────────────

export { AdminLeaderboard };
