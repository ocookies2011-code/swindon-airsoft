// square-webhook — Supabase Edge Function
// Receives Square webhook events and handles booking creation as fallback

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SQUARE_BASE = "https://connect.squareup.com/v2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const squareHeaders = (token: string) => ({
  "Square-Version": "2024-01-18",
  "Authorization": `Bearer ${token}`,
});

const verifySignature = async (body: string, signature: string, sigKey: string, url: string) => {
  try {
    const encoder = new TextEncoder();
    const key     = await crypto.subtle.importKey("raw", encoder.encode(sigKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed  = await crypto.subtle.sign("HMAC", key, encoder.encode(url + body));
    return btoa(String.fromCharCode(...new Uint8Array(signed))) === signature;
  } catch { return false; }
};

const adjustStock = async (sbUrl: string, serviceKey: string, squareId: string, delta: number) => {
  const h = { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  let res      = await fetch(`${sbUrl}/rest/v1/shop_products?square_variation_id=eq.${squareId}&select=id,name,stock,variants`, { headers: h });
  let products = await res.json() as Record<string, unknown>[];
  if (!products.length) {
    res      = await fetch(`${sbUrl}/rest/v1/shop_products?square_catalog_id=eq.${squareId}&select=id,name,stock,variants`, { headers: h });
    products = await res.json() as Record<string, unknown>[];
  }
  if (!products.length) { console.log(`No product found for Square ID: ${squareId}`); return; }
  const product  = products[0];
  const variants = product.variants as Record<string, unknown>[] | null;
  if (variants?.length) {
    const variant = variants.find(v => v.square_variation_id === squareId);
    if (variant) {
      const newStock    = Math.max(0, Number(variant.stock) + delta);
      const updatedVars = variants.map(v => v.square_variation_id === squareId ? { ...v, stock: newStock } : v);
      await fetch(`${sbUrl}/rest/v1/shop_products?id=eq.${product.id}`, { method: "PATCH", headers: { ...h, "Prefer": "return=minimal" }, body: JSON.stringify({ variants: updatedVars }) });
      return;
    }
  }
  const newStock = Math.max(0, Number(product.stock) + delta);
  await fetch(`${sbUrl}/rest/v1/shop_products?id=eq.${product.id}`, { method: "PATCH", headers: { ...h, "Prefer": "return=minimal" }, body: JSON.stringify({ stock: newStock }) });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sigKey     = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY");
    const token      = Deno.env.get("SQUARE_ACCESS_TOKEN");
    const sbUrl      = Deno.env.get("SB_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !sbUrl || !serviceKey) throw new Error("Missing env vars");
    const bodyText  = await req.text();
    const signature = req.headers.get("x-square-hmacsha256-signature") || "";
    if (sigKey && signature && !await verifySignature(bodyText, signature, sigKey, req.url)) {
      console.warn("Invalid Square webhook signature");
      return new Response("Unauthorized", { status: 401 });
    }
    const event = JSON.parse(bodyText);
    console.log("Webhook received:", event.type, event.event_id);
    const h = { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" };

    // ── REFUND ────────────────────────────────────────────────────
    if (event.type === "refund.updated" || event.type === "refund.created") {
      const refund = event.data?.object?.refund as Record<string, unknown> | null;
      if (refund?.status !== "COMPLETED") return new Response(JSON.stringify({ ok: true, skipped: `refund status: ${refund?.status}` }), { headers: { ...cors, "Content-Type": "application/json" } });
      const paymentId = refund.payment_id as string | null;
      if (!paymentId) return new Response(JSON.stringify({ ok: true, skipped: "no payment id" }), { headers: { ...cors, "Content-Type": "application/json" } });
      const payRes  = await fetch(`${SQUARE_BASE}/payments/${paymentId}`, { headers: squareHeaders(token) });
      const payData = await payRes.json();
      const payment = payData.payment as Record<string, unknown>;
      const orderId = payment?.order_id as string | null;
      let lineItems: Record<string, unknown>[] = [];
      if (orderId) {
        const ordRes  = await fetch(`${SQUARE_BASE}/orders/${orderId}`, { headers: squareHeaders(token) });
        const ordData = await ordRes.json();
        lineItems     = (ordData.order?.line_items || []) as Record<string, unknown>[];
      }
      for (const item of lineItems) {
        const catalogObjectId = item.catalog_object_id as string | null;
        if (catalogObjectId) await adjustStock(sbUrl, serviceKey, catalogObjectId, Number(item.quantity || 1));
      }
      if (orderId) {
        await fetch(`${sbUrl}/rest/v1/shop_orders?square_order_id=eq.${paymentId}`, { method: "PATCH", headers: { ...h, "Prefer": "return=minimal" }, body: JSON.stringify({ status: "refunded" }) });
      }
      return new Response(JSON.stringify({ ok: true, refunded: paymentId }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── PAYMENT ───────────────────────────────────────────────────
    const isPaymentEvent = event.type === "payment.updated" || event.type === "payment.completed";
    if (!isPaymentEvent) return new Response(JSON.stringify({ ok: true, skipped: event.type }), { headers: { ...cors, "Content-Type": "application/json" } });
    const paymentStatus = event.data?.object?.payment?.status as string | null;
    if (paymentStatus && paymentStatus !== "COMPLETED") return new Response(JSON.stringify({ ok: true, skipped: `status: ${paymentStatus}` }), { headers: { ...cors, "Content-Type": "application/json" } });
    const paymentId = event.data?.object?.payment?.id as string | null;
    if (!paymentId) return new Response(JSON.stringify({ ok: true, skipped: "no payment id" }), { headers: { ...cors, "Content-Type": "application/json" } });

    // Fetch full payment
    const payRes  = await fetch(`${SQUARE_BASE}/payments/${paymentId}`, { headers: squareHeaders(token) });
    const payData = await payRes.json();
    const payment = payData.payment as Record<string, unknown>;
    if (!payment) throw new Error("Payment not found: " + paymentId);
    const note        = (payment.note as string || "");
    const totalAmount = Number((payment.total_money as Record<string,unknown>)?.amount || 0) / 100;
    console.log(`Payment note: "${note}" | total: £${totalAmount} | paymentId: ${paymentId}`);

    // ── Is this an event booking payment? ────────────────────────
    // Note format: "EventTitle — NxTicketType" e.g. "Sunday Skirmish 21-06 — 1x Walk-On"
    const bookingNoteMatch = note.match(/^(.+?)\s*[—\-]+\s*(\d+)x\s*(Walk-?On|Rental)/i);
    const isBookingPayment = bookingNoteMatch !== null;

    if (isBookingPayment) {
      console.log("Detected booking payment from note:", note);
      // Check if booking already exists
      const bookingRes  = await fetch(`${sbUrl}/rest/v1/bookings?square_order_id=eq.${paymentId}&select=id,total,user_name`, { headers: h });
      const bookingData = await bookingRes.json() as Record<string,unknown>[];

      if (bookingData.length > 0) {
        const existingBooking = bookingData[0];
        const existingName = existingBooking.user_name as string | null;
        const nameNeedsUpdate = !existingName || existingName === "Unknown Player";

        // Resolve name from Square payment if needed (so we can patch it in)
        let resolvedName: string | null = null;
        let resolvedUserId: string | null = null;
        if (nameNeedsUpdate) {
          const lookupByEmail = async (email: string): Promise<{ id: string; name: string } | null> => {
            try {
              const r = await fetch(`${sbUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id,name`, { headers: h });
              const rows = await r.json() as Record<string, unknown>[];
              return rows.length > 0 ? { id: rows[0].id as string, name: rows[0].name as string } : null;
            } catch { return null; }
          };
          const buyerEmail = payment.buyer_email_address as string | null;
          if (buyerEmail) {
            const profile = await lookupByEmail(buyerEmail);
            if (profile) { resolvedUserId = profile.id; resolvedName = profile.name || buyerEmail; }
            else { resolvedName = buyerEmail; }
          }
          if (!resolvedUserId) {
            const squareCustomerId = payment.customer_id as string | null;
            if (squareCustomerId) {
              try {
                const custRes  = await fetch(`${SQUARE_BASE}/customers/${squareCustomerId}`, { headers: squareHeaders(token) });
                const custData = await custRes.json();
                const customer = custData.customer as Record<string, unknown> | null;
                if (customer?.email_address) {
                  const email = customer.email_address as string;
                  const profile = await lookupByEmail(email);
                  if (profile) { resolvedUserId = profile.id; resolvedName = profile.name || email; }
                  else { resolvedName = [customer.given_name, customer.family_name].filter(Boolean).join(" ") || email || null; }
                } else if (customer?.given_name || customer?.family_name) {
                  resolvedName = [customer.given_name, customer.family_name].filter(Boolean).join(" ");
                }
              } catch(e) { console.warn("Could not fetch Square customer:", e); }
            }
          }
        }

        // Patch total and/or user_name as needed
        const patch: Record<string, unknown> = {};
        if (totalAmount > 0 && Number(existingBooking.total) === 0) patch.total = totalAmount;
        if (nameNeedsUpdate && resolvedName) { patch.user_name = resolvedName; if (resolvedUserId) patch.user_id = resolvedUserId; }
        if (Object.keys(patch).length > 0) {
          await fetch(`${sbUrl}/rest/v1/bookings?square_order_id=eq.${paymentId}`, { method: "PATCH", headers: { ...h, "Prefer": "return=minimal" }, body: JSON.stringify(patch) });
          console.log(`Patched existing booking:`, patch);
        }
        return new Response(JSON.stringify({ ok: true, skipped: "booking already exists", patched: Object.keys(patch), paymentId }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      // ── BOOKING DOESN'T EXIST — create it as fallback ────────────
      console.log("BOOKING MISSING — creating fallback booking from webhook");
      const eventTitle  = bookingNoteMatch[1].trim();
      const qty         = Number(bookingNoteMatch[2]);
      const ticketType  = bookingNoteMatch[3].toLowerCase().replace("-","").replace(" ","") === "walkon" ? "walkOn" : "rental";

      // Find the event by title — match on partial title then pick the closest upcoming date
      const evRes  = await fetch(`${sbUrl}/rest/v1/events?title=ilike.*${encodeURIComponent(eventTitle.substring(0,15))}*&select=id,title,date&order=date.asc`, { headers: h });
      const evData = await evRes.json() as Record<string,unknown>[];
      // Prefer the nearest upcoming event; fall back to the nearest past event if nothing upcoming
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = evData.filter(e => (e.date as string) >= today);
      const eventRow = upcoming.length > 0 ? upcoming[0] : evData[evData.length - 1] || null;
      const eventId = eventRow?.id as string || null;

      // Find the player by matching Square customer
      let userId       = null as string | null;
      let userName     = "Unknown Player";

      // Helper: look up a profile by email
      const lookupByEmail = async (email: string): Promise<{ id: string; name: string } | null> => {
        try {
          const r = await fetch(`${sbUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id,name`, { headers: h });
          const rows = await r.json() as Record<string, unknown>[];
          return rows.length > 0 ? { id: rows[0].id as string, name: rows[0].name as string } : null;
        } catch { return null; }
      };

      // 1. Try buyer_email_address directly on the payment object
      const buyerEmail = payment.buyer_email_address as string | null;
      if (buyerEmail) {
        const profile = await lookupByEmail(buyerEmail);
        if (profile) { userId = profile.id; userName = profile.name || buyerEmail; }
        else { userName = buyerEmail; } // at least store the email as the name
      }

      // 2. Try Square customer record if still no match
      if (!userId) {
        const squareCustomerId = payment.customer_id as string | null;
        if (squareCustomerId) {
          try {
            const custRes  = await fetch(`${SQUARE_BASE}/customers/${squareCustomerId}`, { headers: squareHeaders(token) });
            const custData = await custRes.json();
            const customer = custData.customer as Record<string, unknown> | null;
            if (customer?.email_address) {
              const email = customer.email_address as string;
              const profile = await lookupByEmail(email);
              if (profile) { userId = profile.id; userName = profile.name || email; }
              else { userName = [customer.given_name, customer.family_name].filter(Boolean).join(" ") || email || userName; }
            } else if (customer?.given_name || customer?.family_name) {
              userName = [customer.given_name, customer.family_name].filter(Boolean).join(" ");
            }
          } catch(e) { console.warn("Could not fetch Square customer:", e); }
        }
      }

      if (!eventId) {
        console.error("Could not find event for title:", eventTitle);

        // Last resort: this payment may actually be a UKARA registration fee
        // (note format can coincidentally look booking-like). The frontend
        // creates the ukara_applications row directly on payment success, so
        // check there before falling back to a generic "Unknown Player" entry.
        if (userName === "Unknown Player" || !userId) {
          try {
            const ukaraRes  = await fetch(`${sbUrl}/rest/v1/ukara_applications?square_payment_id=eq.${paymentId}&select=user_id,name,email`, { headers: h });
            const ukaraData = await ukaraRes.json() as Record<string, unknown>[];
            if (ukaraData.length > 0) {
              userId   = ukaraData[0].user_id as string || userId;
              userName = ukaraData[0].name as string || userName;
              console.log(`Resolved name via ukara_applications match: ${userName}`);
            }
          } catch (e) { console.warn("ukara_applications lookup failed:", e); }
        }

        // Still record in shop_orders as a fallback so it appears in revenue
        await fetch(`${sbUrl}/rest/v1/shop_orders`, {
          method: "POST",
          headers: { ...h, "Prefer": "return=representation" },
          body: JSON.stringify({ customer_name: userName, user_id: userId, items: [{ name: `${ticketType === "walkOn" ? "Walk-On" : "Rental"} ticket - ${eventTitle}`, price: totalAmount / qty, qty }], subtotal: totalAmount, postage: 0, total: totalAmount, status: "completed", square_order_id: paymentId }),
        });
        console.log("Fallback: recorded in shop_orders as event booking could not be matched");
        return new Response(JSON.stringify({ ok: true, fallback: "shop_orders", paymentId }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      const insertRes = await fetch(`${sbUrl}/rest/v1/bookings`, {
        method: "POST",
        headers: { ...h, "Prefer": "return=representation" },
        body: JSON.stringify({ event_id: eventId, user_id: userId, user_name: userName, ticket_type: ticketType, qty, extras: {}, total: totalAmount, square_order_id: paymentId, square_payment_id: paymentId }),
      });
      const insertText = await insertRes.text();
      if (!insertRes.ok) {
        console.error(`Fallback booking insert FAILED (${insertRes.status}):`, insertText);
      } else {
        console.log(`Fallback booking created for ${userName} — ${qty}x ${ticketType} at £${totalAmount}`);
      }
      return new Response(JSON.stringify({ ok: true, fallbackBookingCreated: insertRes.ok, paymentId }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── SHOP / TERMINAL PAYMENT ───────────────────────────────────
    const dupRes  = await fetch(`${sbUrl}/rest/v1/shop_orders?square_order_id=eq.${paymentId}&select=id`, { headers: h });
    const dupData = await dupRes.json() as unknown[];
    if (dupData.length > 0) { console.log("Already in shop_orders, skipping:", paymentId); return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), { headers: { ...cors, "Content-Type": "application/json" } }); }

    const bookingCheck = await fetch(`${sbUrl}/rest/v1/bookings?square_order_id=eq.${paymentId}&select=id`, { headers: h });
    const bookingCheckData = await bookingCheck.json() as unknown[];
    if (bookingCheckData.length > 0) { console.log("Booking found for this payment, not a shop order:", paymentId); return new Response(JSON.stringify({ ok: true, skipped: "event booking" }), { headers: { ...cors, "Content-Type": "application/json" } }); }

    const orderId = payment.order_id as string | null;
    let lineItems: Record<string, unknown>[] = [];
    if (orderId) {
      const ordRes  = await fetch(`${SQUARE_BASE}/orders/${orderId}`, { headers: squareHeaders(token) });
      const ordData = await ordRes.json();
      lineItems     = (ordData.order?.line_items || []) as Record<string, unknown>[];
    }
    for (const item of lineItems) {
      const catalogObjectId = item.catalog_object_id as string | null;
      if (catalogObjectId) await adjustStock(sbUrl, serviceKey, catalogObjectId, -Number(item.quantity || 1));
    }

    let userId = null as string | null, customerName = "Terminal Sale", customerEmail = "";
    const squareCustomerId = payment.customer_id as string | null;
    if (squareCustomerId) {
      try {
        const custRes  = await fetch(`${SQUARE_BASE}/customers/${squareCustomerId}`, { headers: squareHeaders(token) });
        const custData = await custRes.json();
        const customer = custData.customer as Record<string, unknown> | null;
        if (customer) {
          customerEmail = customer.email_address as string || "";
          customerName  = [customer.given_name, customer.family_name].filter(Boolean).join(" ") || "Terminal Sale";
          if (customerEmail) {
            const playerRes = await fetch(`${sbUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(customerEmail)}&select=id,name`, { headers: h });
            const players   = await playerRes.json() as Record<string,unknown>[];
            if (players.length > 0) { userId = players[0].id as string; customerName = players[0].name as string || customerName; }
          }
        }
      } catch(e) { console.warn("Could not fetch Square customer:", e); }
    }

    if (lineItems.length > 0 || totalAmount > 0) {
      const items = lineItems.map(li => ({ id: li.catalog_object_id || null, name: (li.variation_name ? `${li.name} — ${li.variation_name}` : li.name) as string, price: Number((li.base_price_money as Record<string,unknown>)?.amount || 0) / 100, qty: Number(li.quantity || 1) }));
      const insertRes = await fetch(`${sbUrl}/rest/v1/shop_orders`, { method: "POST", headers: { ...h, "Prefer": "return=representation" }, body: JSON.stringify({ customer_name: customerName, customer_email: customerEmail, user_id: userId, items: items.length ? items : [{ name: note || "Custom Amount", price: totalAmount, qty: 1 }], subtotal: totalAmount, postage: 0, total: totalAmount, status: "completed", square_order_id: paymentId }) });
      if (!insertRes.ok) { console.error(`shop_orders insert FAILED (${insertRes.status}):`, await insertRes.text()); }
      else { console.log(`shop_orders insert SUCCESS`); }
    }
    return new Response(JSON.stringify({ ok: true, paymentId }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("square-webhook error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
