import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    // Cloudflare T1 = Tor exit node
    if (cfCountry === "T1") {
      return new Response(JSON.stringify({ allowed: false, reason: "tor" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Trust Cloudflare country header if available
    if (cfCountry && cfCountry !== "XX") {
      if (cfCountry !== "GB") {
        return new Response(JSON.stringify({ allowed: false, reason: "geo", country: cfCountry }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      // UK confirmed by Cloudflare - still check for VPN via ipapi
    }

    // Check with ipapi.co for VPN/proxy detection
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

    if (countryCode !== "GB") {
      return new Response(JSON.stringify({ allowed: false, reason: "geo", country: countryCode }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ allowed: true, country: countryCode }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ allowed: true, reason: "error" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
