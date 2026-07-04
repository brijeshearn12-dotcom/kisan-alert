/**
 * GET /api/upload-signature
 * -----------------------------------------------------------------------------
 * Returns a short-lived Cloudinary upload signature so authenticated farmers can
 * upload directly to Cloudinary from the browser without ever seeing our secret.
 *
 * Flow: authenticate via the Supabase session -> read Cloudinary credentials
 * from the environment -> sign a `{ timestamp }` payload with the API secret ->
 * return the timestamp, signature, public API key and cloud name.
 *
 * The API secret is used only to compute the signature and is never returned.
 * Unauthenticated callers get 401; unexpected failures become a 500.
 * -----------------------------------------------------------------------------
 */
import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

/** Small helper for consistent JSON error responses. */
function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    // ── 1. Authenticate (session cookie only; nothing trusted from client) ─
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('You must be logged in to request an upload signature.', 401)
    }

    // ── 2. Load Cloudinary credentials from the environment ────────────────
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary environment variables are not configured.')
    }

    // ── 3. Generate the signature (secret is used here, never returned) ────
    const timestamp = Math.round(Date.now() / 1000)
    const signature = cloudinary.utils.api_sign_request({ timestamp }, apiSecret)

    // ── 4. Respond ─────────────────────────────────────────────────────────
    return NextResponse.json({
      timestamp,
      signature,
      api_key: apiKey,
      cloud_name: cloudName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    console.error('Upload-signature route error:', message)
    return errorResponse('Something went wrong while generating the upload signature.', 500)
  }
}
