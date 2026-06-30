import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client for Route Handlers / Server Components.
 *
 * Reads the logged-in user's session from the request cookies (set by the
 * browser client during sign-in), so Row Level Security policies that depend
 * on `auth.uid()` work correctly. Must be awaited because `cookies()` is async.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // In a Route Handler the response cookies are writable, so we forward
          // any refreshed-session cookies Supabase asks us to set.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a context where cookies are read-only — safe to ignore.
          }
        },
      },
    },
  )
}
