import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { paymentId, env = "production" } = await req.json();
    if (!paymentId) return new Response(JSON.stringify({ error: "paymentId required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    const accessToken = Deno.env.get("SQUARE_ACCESS_TOKEN");
    if (!accessToken) return new Response(JSON.stringify({ error: "not configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    const baseUrl = env === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
    const res = await fetch(`${baseUrl}/v2/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${accessToken}`, "Square-Version": "2024-01-18" },
    });
    const data = await res.json();
    if (!res.ok || data.errors) return new Response(JSON.stringify({ error: data.errors?.[0]?.detail || "Square API error" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    const p = data.payment;
    const card = p.card_details?.card;
    return new Response(JSON.stringify({
      paymentId:     p.id,
      receiptNumber: p.receipt_number ?? null,
      receiptUrl:    p.receipt_url    ?? null,
      status:        p.status         ?? null,
      cardBrand:     card?.card_brand ?? null,
      last4:         card?.last_4     ?? null,
      entryMethod:   p.card_details?.entry_method ?? null,
      amount:        p.amount_money   ?? null,
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
