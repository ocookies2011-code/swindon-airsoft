import { createClient } from '@supabase/supabase-js'

// Same Supabase project as the live site — this is a design concept that
// reads real public data (published events) through the anon key, same as
// the production frontend already does. No write access is exercised here.
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || 'https://bnlndgjbcthxyodgstaa.supabase.co'
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG5kZ2piY3RoeHlvZGdzdGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTUzMjYsImV4cCI6MjA4NzE3MTMyNn0.i6o6BzhFpS8hZ8zI1LiAOwuSaf_YRjnt3IvUygyV1rA'

export const supabase = createClient(supabaseUrl, supabaseAnon)
