// middleware.js — Vercel Routing Middleware, framework-agnostic (not Next.js-specific).
// Scoped ONLY to /concept via the matcher below — every other route on the
// live site is untouched and passes through this file entirely.
//
// This is a server-side HTTP Basic Auth gate (the browser's native
// username/password prompt), not a client-side check — so it can't be
// bypassed by disabling JS or viewing source, unlike a password form baked
// into the page itself.

const REALM = 'Swindon Airsoft — Concept Preview'
// Basic base64("preview:FieldConcept2026!") — see Chris's chat for the
// plaintext credential. Change this value (re-encode as base64("user:pass"))
// to rotate the password.
const EXPECTED = 'Basic cHJldmlldzpGaWVsZENvbmNlcHQyMDI2IQ=='

export const config = {
  matcher: ['/concept', '/concept/:path*'],
}

export default function middleware(request) {
  const auth = request.headers.get('authorization')
  if (auth === EXPECTED) return

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}"` },
  })
}
