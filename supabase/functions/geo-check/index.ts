import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    const cfCountry = req.headers.get("cf-ipcountry") || "";

    // Use service role to check IP bans table
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if IP is banned
    const { data: ban } = await supabase
      .from("ip_bans")
      .select("ip, reason, expires_at")
      .eq("ip", ip)
      .maybeSingle();

    if (ban) {
      if (!ban.expires_at || new Date(ban.expires_at) > new Date()) {
        return new Response(JSON.stringify({ allowed: false, reason: "banned", message: ban.reason || "Your access has been restricted." }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      } else {
        // Ban expired — remove it
        await supabase.from("ip_bans").delete().eq("ip", ip);
      }
    }

    // Tor via Cloudflare
    if (cfCountry === "T1") {
      return new Response(JSON.stringify({ allowed: false, reason: "tor" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Non-UK via Cloudflare
    if (cfCountry && cfCountry !== "XX" && cfCountry !== "GB") {
      return new Response(JSON.stringify({ allowed: false, reason: "geo", country: cfCountry }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // VPN/proxy check via ipapi.co
    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!geoRes.ok) {
      return new Response(JSON.stringify({ allowed: true, reason: "check_failed" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const geo = await geoRes.json();
    const countryCode = geo.country_code || cfCountry;
    const isVPN = !!(geo.threat?.is_vpn || geo.threat?.is_proxy || geo.threat?.is_datacenter || geo.threat?.is_tor);

    if (isVPN) {
      return new Response(JSON.stringify({ allowed: false, reason: "vpn", country: countryCode }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (countryCode && countryCode !== "GB") {
      return new Response(JSON.stringify({ allowed: false, reason: "geo", country: countryCode }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ allowed: true, country: countryCode, ip }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ allowed: true, reason: "error" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
