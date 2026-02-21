import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon || supabaseUrl.includes('your-project')) {
  document.getElementById('root').innerHTML = `
    <div style="font-family:monospace;padding:40px;background:#0d1117;color:#f85149;min-height:100vh;">
      <h2>⚠️ Missing Supabase configuration</h2>
      <p style="color:#8b949e;margin:16px 0;">Your <strong style="color:#c9d1d9">.env</strong> file is missing or has placeholder values.</p>
      <p style="color:#8b949e;">Create a <strong style="color:#c9d1d9">.env</strong> file in your project root with:</p>
      <pre style="background:#161b22;padding:16px;border-radius:6px;margin:16px 0;color:#3fb950;">
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...</pre>
      <p style="color:#8b949e;">Find these values in: <strong style="color:#c9d1d9">Supabase Dashboard → Settings → API</strong></p>
      <p style="color:#8b949e;margin-top:16px;">After saving .env, restart the dev server: <strong style="color:#c9d1d9">npm run dev</strong></p>
    </div>
  `
  throw new Error('Missing Supabase env vars — see message above')
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    storage: window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
})
