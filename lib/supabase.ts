import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Browser client — uses anon key, handles auth sessions
// Use in 'use client' components only
export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Service client — uses service role key, bypasses RLS
// Use in API routes only, never client-side
export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
