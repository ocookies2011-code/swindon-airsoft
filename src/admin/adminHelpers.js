// admin/adminHelpers.js — shared admin utilities (diffFields, logAction)
import { supabase } from "../supabaseClient";

function diffFields(before = {}, after = {}, labels = {}) {
  return Object.keys(labels)
    .filter(k => String(before[k] ?? "") !== String(after[k] ?? ""))
    .map(k => `${labels[k]}: "${before[k] ?? ""}" → "${after[k] ?? ""}"`)
    .join(" | ");
}

async function logAction({ adminEmail, adminName, action, detail }) {
  try {
    await supabase.from("audit_log").insert({
      admin_email: adminEmail || "",
      admin_name:  adminName  || "",
      action,
      detail:      detail     || "",
    });
  } catch {}
}

export { diffFields, logAction };
