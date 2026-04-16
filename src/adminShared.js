// adminShared.js — Shared constants and utilities used across all admin components
import { supabase } from "./supabaseClient";

export const SUPERADMIN_EMAIL = "c-pullen@outlook.com";

// Build a human-readable "field: before → after" diff string
export function diffFields(before = {}, after = {}, labels = {}) {
  const changes = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const bVal = before[key] ?? "";
    const aVal = after[key] ?? "";
    const bStr = bVal === null || bVal === undefined ? "" : String(bVal).trim();
    const aStr = aVal === null || aVal === undefined ? "" : String(aVal).trim();
    if (bStr === aStr) continue;
    const label = labels[key] || key;
    changes.push(`${label}: "${bStr}" → "${aStr}"`);
  }
  return changes.length ? changes.join(" | ") : null;
}

export async function logAction({ adminEmail, adminName, action, detail = null }) {
  try {
    await supabase.from("admin_audit_log").insert({
      admin_email: adminEmail,
      admin_name:  adminName || adminEmail,
      action,
      detail,
      created_at:  new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Audit log failed:", e.message);
  }
}
