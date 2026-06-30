// Vercel serverless function — proxies visitor logging to Supabase
// Sits at /api/log on the same domain as the site, bypassing ad blocker rules
// that block direct calls to *.supabase.co/functions/*
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  try {
    const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await fetch(`${sbUrl}/functions/v1/visit-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
}
