import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const isLoginPage = request.nextUrl.pathname === '/login';

  // Multi-user access: any authenticated user with an active subscription.
  // For the free beta, flip profiles.subscription_active = true per invited user.
  let isAllowed = false;
  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_active')
      .eq('id', session.user.id)
      .single();
    isAllowed = profile?.subscription_active === true;
  }

  // Not logged in → send to login (unless already there)
  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Logged in but no active subscription → send to a page explaining access
  // (kept as /login for now; can point to a dedicated /inactive page later)
  if (session && !isAllowed && !isLoginPage) {
    return NextResponse.redirect(new URL('/login?status=inactive', request.url));
  }

  // Logged in AND allowed but sitting on /login → send home
  if (session && isAllowed && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
