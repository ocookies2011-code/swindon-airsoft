import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Patterns that indicate hacking attempts
const SQL_PATTERNS = /(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bunion\b|\bexec\b|\bcast\b|\bconvert\b|--|\/\*|\*\/|xp_|0x[0-9a-f]+)/i;
const XSS_PATTERNS = /(<script|javascript:|on\w+\s*=|<iframe|<img\s+src|alert\s*\(|document\.cookie|eval\s*\()/i;
const PATH_TRAVERSAL = /(\.\.\/|\.\.\\|%2e%2e|%252e)/i;
const SCANNER_UA = /sqlmap|nikto|nessus|masscan|nmap|burpsuite|zaproxy|acunetix|metasploit|havij|pangolin/i;

function getIp(req: Request): string | null {
  const h = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'];
  for (const k of h) { const v = req.headers.get(k); if (v) return v.split(',')[0].trim(); }
  return null;
}

function isPriv(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const ip = getIp(req) || "unknown";
    const cfCountry = req.headers.get("cf-ipcountry") || "";
    const userAgent = req.headers.get("user-agent") || "";

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Scanner/tool detection ────────────────────────────────
    if (SCANNER_UA.test(userAgent)) {
      await sb.from("security_events").insert({
        event_type: "scanner_detected", ip, user_agent: userAgent,
        payload: userAgent, severity: "critical"
      }).catch(() => {});
      return new Response(JSON.stringify({ allowed: false, reason: "banned" }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Check IP bans ─────────────────────────────────────────
    const { data: ban } = await sb.from("ip_bans").select("ip,reason,expires_at").eq("ip", ip).maybeSingle();
    if (ban) {
      if (!ban.expires_at || new Date(ban.expires_at) > new Date()) {
        return new Response(JSON.stringify({ allowed: false, reason: "banned", message: ban.reason || "Your access has been restricted." }), {
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      } else {
        await sb.from("ip_bans").delete().eq("ip", ip);
      }
    }

    // ── Failed login rate limiting ────────────────────────────
    // Count recent failed logins from this IP (last 15 mins)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: failCount } = await sb.from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("event_type", "failed_login")
      .gte("created_at", fifteenMinsAgo);

    if ((failCount || 0) >= 10) {
      // Auto-ban after 10 failed logins in 15 mins
      await sb.from("ip_bans").upsert({
        ip, reason: `Auto-banned: ${failCount} failed login attempts in 15 minutes`,
        banned_by: "system", expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }, { onConflict: "ip" }).catch(() => {});
      await sb.from("security_events").insert({
        event_type: "brute_force", ip, severity: "critical",
        payload: `${failCount} failed logins in 15 minutes — auto-banned for 24h`
      }).catch(() => {});
      return new Response(JSON.stringify({ allowed: false, reason: "banned", message: "Too many failed attempts. Try again later." }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Tor via Cloudflare ────────────────────────────────────
    if (cfCountry === "T1") {
      await sb.from("security_events").insert({ event_type: "tor_detected", ip, severity: "high" }).catch(() => {});
      return new Response(JSON.stringify({ allowed: false, reason: "tor" }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Geo block ─────────────────────────────────────────────
    if (cfCountry && cfCountry !== "XX" && cfCountry !== "GB") {
      return new Response(JSON.stringify({ allowed: false, reason: "geo", country: cfCountry }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── VPN/proxy check ───────────────────────────────────────
    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`).catch(() => null);
    if (geoRes?.ok) {
      const geo = await geoRes.json();
      const countryCode = geo.country_code || cfCountry;
      const isVPN = !!(geo.threat?.is_vpn || geo.threat?.is_proxy || geo.threat?.is_datacenter || geo.threat?.is_tor);
      if (isVPN) {
        return new Response(JSON.stringify({ allowed: false, reason: "vpn", country: countryCode }), {
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      if (countryCode && countryCode !== "GB") {
        return new Response(JSON.stringify({ allowed: false, reason: "geo", country: countryCode }), {
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ allowed: true, country: countryCode, ip }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ allowed: true, ip }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ allowed: true, reason: "error" }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
