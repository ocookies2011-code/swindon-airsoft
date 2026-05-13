import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { folderId } = await req.json();
    if (!folderId) return new Response(JSON.stringify({ error: "folderId required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    // Fetch Drive folder page HTML
    const res = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120" }
    });
    const html = await res.text();

    // Extract file IDs from thumbnail URLs embedded in the page HTML
    const ids: string[] = [];
    const re = /thumbnail\?id=([a-zA-Z0-9_-]{25,})/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }

    // Also check data-id patterns
    const re2 = /"id":"([a-zA-Z0-9_-]{28,33})"/g;
    while ((m = re2.exec(html)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }

    const images = ids.map(id => ({
      id,
      url: `https://drive.google.com/uc?export=view&id=${id}`,
      thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w600`,
    }));

    return new Response(JSON.stringify({ ok: true, count: images.length, images }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
