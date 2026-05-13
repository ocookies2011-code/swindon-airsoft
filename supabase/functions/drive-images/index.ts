import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { folderId } = await req.json();
    if (!folderId) return new Response(JSON.stringify({ error: "folderId required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "GOOGLE_API_KEY not set" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType+contains+'image/'&fields=files(id,name)&orderBy=name&pageSize=100&key=${apiKey}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: json.error?.message || "Drive API error" }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    const images = (json.files || []).map((f: {id:string,name:string}) => ({
      id: f.id, name: f.name,
      url: `https://drive.google.com/uc?export=view&id=${f.id}`,
      thumb: `https://drive.google.com/thumbnail?id=${f.id}&sz=w800-h600`,
    }));
    return new Response(JSON.stringify({ ok: true, count: images.length, images }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("drive-images error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
