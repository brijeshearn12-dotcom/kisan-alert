/**
 * POST /api/vegetation-advice
 * -----------------------------------------------------------------------------
 * Returns a one-sentence, farmer-friendly explanation of a field's current
 * vegetation & moisture condition. Reuses the shared Gemini client
 * (`getVegetationAdvice`) — the API key never leaves the server.
 *
 * Requires authentication so the Gemini quota can't be abused by anonymous
 * callers. Never throws: `getVegetationAdvice` always resolves to a safe
 * deterministic fallback on failure.
 * -----------------------------------------------------------------------------
 */
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { getVegetationAdvice, type VegetationContext } from '@/lib/gemini'

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/** Coerce an untrusted value to a finite number, or fall back. */
function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('You must be logged in to request advice.', 401)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Request body must be valid JSON.', 400)
    }

    const raw = (body ?? {}) as Record<string, unknown>

    const ctx: VegetationContext = {
      districtName:
        typeof raw.district_name === 'string' && raw.district_name.trim()
          ? raw.district_name.trim()
          : 'your district',
      season: typeof raw.season === 'string' ? raw.season : 'the current season',
      rainfallMm7d: toNumber(raw.rainfall_mm_7d, 0),
      soilMoisture: toNumber(raw.soil_moisture, 50),
      score: toNumber(raw.score, 0),
      status: typeof raw.status === 'string' ? raw.status : 'unknown',
    }

    const result = await getVegetationAdvice(ctx)
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.'
    console.error('Vegetation advice route error:', message)
    return errorResponse('Something went wrong while generating advice.', 500)
  }
}
