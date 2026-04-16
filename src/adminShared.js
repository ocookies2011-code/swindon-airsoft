import { supabase } from "./supabaseClient";

export const SUPERADMIN_EMAIL = "c-pullen@outlook.com";

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
