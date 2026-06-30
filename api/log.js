// Vercel serverless function — proxies visitor logging to Supabase
// First-party domain proxy bypasses ad blockers that block *.supabase.co

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    console.error('Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(200).json({ ok: false, error: 'misconfigured' });
  }

  // Get client IP from Vercel headers and pass it through to the edge function
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    null;

  // Merge clientIp into the body so the edge function can geo-resolve it
  const payload = { ...(req.body || {}), _proxyIp: clientIp };

  try {
    const response = await fetch(`${sbUrl}/functions/v1/visit-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        // Forward original client IP so geo-lookup works correctly
        'x-forwarded-for': clientIp || '',
        'x-real-ip': clientIp || '',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, raw: text }; }
    return res.status(200).json(data);
  } catch (e) {
    console.error('api/log proxy error:', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
