// admin/adminHelpers.js — shared admin utilities (diffFields, logAction)
import { supabase } from "../supabaseClient";

function diffFields(before = {}, after = {}, labels = {}) {
  return Object.keys(labels)
    .filter(k => String(before[k] ?? "") !== String(after[k] ?? ""))
    .map(k => `${labels[k]}: "${before[k] ?? ""}" → "${after[k] ?? ""}"`)
    .join(" | ");
}

async function logAction({ adminEmail, adminName, action, detail, playerId, playerName, oldValue, newValue }) {
  try {
    await supabase.from("admin_audit_log").insert({
      admin_email: adminEmail || "",
      admin_name:  adminName  || "",
      action,
      detail:      detail     || "",
      details:     detail     || "",
      player_id:   playerId   || null,
      player_name: playerName || null,
      old_value:   oldValue   ? String(oldValue) : null,
      new_value:   newValue   ? String(newValue) : null,
    });
  } catch(e) {
    console.warn("audit log failed:", e.message);
  }
}

export { diffFields, logAction };
