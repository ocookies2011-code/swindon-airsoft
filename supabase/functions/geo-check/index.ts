import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCANNER_UA = /sqlmap|nikto|nessus|masscan|nmap|burpsuite|zaproxy|acunetix|metasploit|havij|pangolin/i;

function getIp(req: Request): string | null {
  for (const k of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]) {
    const v = req.headers.get(k);
    if (v) return v.split(",")[0].trim();
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    await req.json().catch(() => ({}));
    const ip        = getIp(req) || "unknown";
    const cfCountry = req.headers.get("cf-ipcountry") || "";
    const userAgent = req.headers.get("user-agent") || "";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. Scanner / attack-tool detection ───────────────────
    if (SCANNER_UA.test(userAgent)) {
      await sb.from("security_events").insert({
        event_type: "scanner_detected", ip,
        payload: userAgent, severity: "critical",
      }).catch(() => {});
      return new Response(JSON.stringify({ allowed: false, reason: "banned" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── 2. IP ban check ──────────────────────────────────────
    const { data: ban } = await sb
      .from("ip_bans").select("reason,expires_at").eq("ip", ip).maybeSingle();
    if (ban) {
      if (!ban.expires_at || new Date(ban.expires_at) > new Date()) {
        return new Response(
          JSON.stringify({ allowed: false, reason: "banned", message: ban.reason || "Your access has been restricted." }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }
      // Expired — clean up
      await sb.from("ip_bans").delete().eq("ip", ip);
    }

    // ── 3. Brute-force rate limiting ─────────────────────────
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: failCount } = await sb.from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip).eq("event_type", "failed_login")
      .gte("created_at", fifteenMinsAgo);

    if ((failCount || 0) >= 10) {
      await sb.from("ip_bans").upsert({
        ip,
        reason: `Auto-banned: ${failCount} failed logins in 15 min`,
        banned_by: "system",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "ip" }).catch(() => {});
      await sb.from("security_events").insert({
        event_type: "brute_force", ip, severity: "critical",
        payload: `${failCount} failed logins — auto-banned 24h`,
      }).catch(() => {});
      return new Response(
        JSON.stringify({ allowed: false, reason: "banned", message: "Too many failed attempts. Try again later." }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Tor detection ─────────────────────────────────────
    if (cfCountry === "T1") {
      await sb.from("security_events")
        .insert({ event_type: "tor_detected", ip, severity: "high" }).catch(() => {});
      return new Response(JSON.stringify({ allowed: false, reason: "tor" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── 5. Geo check — Cloudflare header only ────────────────
    // cf-ipcountry is set by Cloudflare at the network edge before the
    // request reaches Supabase. It is the most reliable source available
    // and cannot be spoofed by the visitor.
    //
    // "XX" = Cloudflare couldn't determine country (rare) → allow through
    //        so we never false-positive a legitimate UK visitor.
    // "T1" = Tor (handled above)
    // Anything else non-GB = block.
    if (cfCountry && cfCountry !== "XX" && cfCountry !== "GB") {
      return new Response(
        JSON.stringify({ allowed: false, reason: "geo", country: cfCountry }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // GB confirmed (or unknown country — give benefit of the doubt)
    return new Response(
      JSON.stringify({ allowed: true, country: cfCountry || "unknown", ip }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("geo-check error:", err);
    // Fail open on unexpected errors so UK users are never false-blocked
    // The client-side country check in AppInner is the final safety net
    return new Response(JSON.stringify({ allowed: true, reason: "error-fallback" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
