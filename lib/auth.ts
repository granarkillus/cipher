import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getServiceClient } from '@/lib/supabase';

// Resolves the logged-in user from request cookies and confirms they have
// access (profiles.subscription_active), mirroring middleware.ts. Returns the
// user id, or null if the caller is not signed in or not allowed.
//
// middleware.ts does not run on /api routes, so every API route must call
// this before touching the service client.
export async function getAllowedUserId(request: NextRequest): Promise<string | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll() { /* read-only in API route */ },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await getServiceClient()
      .from('profiles')
      .select('subscription_active')
      .eq('id', user.id)
      .single();
    return profile?.subscription_active === true ? user.id : null;
  } catch {
    return null;
  }
}
