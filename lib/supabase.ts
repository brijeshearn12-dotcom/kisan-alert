import { createBrowserClient } from '@supabase/ssr'

// Call this anywhere on the client side — returns the same instance every time.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}