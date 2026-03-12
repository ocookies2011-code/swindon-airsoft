#!/bin/bash
# Run this once from your project root to set all Edge Function secrets.
# These values NEVER go in your code — they live only in Supabase's secure vault.
#
# Prerequisites:
#   npm install -g supabase
#   supabase login
#   supabase link --project-ref bnlndgjbcthxyodgstaa

supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG5kZ2piY3RoeHlvZGdzdGFhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU5NTMyNiwiZXhwIjoyMDg3MTcxMzI2fQ.H81UwruMRGGvmP1rjFbn52TDDnUTV8XGWDB86s_e2wQ \
  SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG5kZ2piY3RoeHlvZGdzdGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTUzMjYsImV4cCI6MjA4NzE3MTMyNn0.i6o6BzhFpS8hZ8zI1LiAOwuSaf_YRjnt3IvUygyV1rA \
  SQUARE_ACCESS_TOKEN=EAAAl7rAG63-OJI6JtaxUgYpgCvqhgnuN5qRSjr09_HDo3TMUmWkFV_VI5yNEwuf \
  SQUARE_APP_ID=sq0idp-7fhz6dzkthPKq3F-tqg_RA \
  SQUARE_LOCATION_ID=LR4J9YXNMCDDH

echo "✅ Secrets set. Now run: supabase functions deploy delete-user"
