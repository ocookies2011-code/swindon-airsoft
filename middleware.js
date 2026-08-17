// middleware.js — Vercel Routing Middleware, framework-agnostic (not Next.js-specific).
// Scoped ONLY to /concept via the matcher below — every other route on the
// live site is untouched and passes through this file entirely.
//
// NOTE: an earlier version of this used HTTP Basic Auth (401 + WWW-
// Authenticate), which is meant to make the browser show its native
// username/password prompt. That header wasn't reliably triggering the
// prompt through Vercel's edge layer, so this is a real HTML password form
// instead — it can't fail to render since it's just an ordinary page, and
// a short-lived cookie remembers that you got in.

import { next } from '@vercel/functions'

const PASSWORD = 'FieldConcept2026!'
const COOKIE_NAME = 'concept_gate'
const COOKIE_VALUE = 'granted-v1'

export const config = {
  matcher: ['/concept', '/concept/:path*'],
}

function page({ error } = {}) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" /><title>Preview access — Swindon Airsoft</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#23261D;font-family:-apple-system,system-ui,sans-serif;}
  form{background:#EAE4D2;padding:36px 32px;width:300px;border:1px solid #3C4A30;}
  h1{font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 22px;color:#3C4A30;font-weight:600;}
  input{width:100%;padding:11px 12px;margin-bottom:14px;background:#fff;border:1px solid #7C8A5C;font-size:14px;font-family:inherit;}
  button{width:100%;padding:11px;background:#A8461E;color:#EAE4D2;border:none;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:12px;cursor:pointer;}
  button:hover{background:#7E3416}
  .err{color:#A8461E;font-size:12px;margin:-8px 0 14px;}
</style></head>
<body>
  <form method="POST">
    <h1>◈ Concept Preview — Password Required</h1>
    ${error ? '<div class="err">Wrong password — try again.</div>' : ''}
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" />
    <button type="submit">Enter</button>
  </form>
</body></html>`
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders },
  })
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const cookieHeader = request.headers.get('cookie') || ''
  const authed = cookieHeader.split(';').some(c => c.trim() === `${COOKIE_NAME}=${COOKIE_VALUE}`)

  if (request.method === 'POST') {
    let submitted = ''
    try {
      const form = await request.formData()
      submitted = form.get('password') || ''
    } catch {}

    if (submitted === PASSWORD) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/concept',
          'Set-Cookie': `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/concept; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        },
      })
    }
    return html(page({ error: true }), 401)
  }

  if (!authed) {
    return html(page({}), 401)
  }

  return next()
}
