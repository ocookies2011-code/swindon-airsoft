import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { token, newPassword, adminUserId } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Admin set password (from admin panel) ──────────────────
    if (adminUserId && newPassword) {
      if (newPassword.length < 8) return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      const { error } = await supabase.auth.admin.updateUserById(adminUserId, { password: newPassword });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Self-service reset via token ───────────────────────────
    if (!token || !newPassword) return new Response(JSON.stringify({ error: "token and newPassword required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    if (newPassword.length < 8) return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const { data: resetRow, error: findErr } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .eq("token", token)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (findErr || !resetRow) return new Response(JSON.stringify({ error: "Invalid or expired reset link. Please request a new one." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const userId = resetRow.user_id;
    if (!userId) return new Response(JSON.stringify({ error: "Invalid reset token." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    await supabase.from("password_reset_tokens").update({ used: true }).eq("token", token);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unexpected error" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
