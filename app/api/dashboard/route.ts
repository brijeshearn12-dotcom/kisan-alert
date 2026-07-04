/**
 * GET /api/dashboard
 * -----------------------------------------------------------------------------
 * Single request that powers the farmer dashboard. Combines three things into
 * one payload so the client never has to fan out:
 *
 *   1. Current weather + short forecast for the user's district (Open-Meteo).
 *   2. `is_dry_spell` — true when no meaningful rain is forecast for the next
 *      `DRY_SPELL_DAYS` (or more) consecutive days.
 *   3. The authenticated user's most recent crop recommendation (or null).
 *
 * The route requires authentication (401 otherwise) and relies on Supabase RLS
 * so a user can only ever read their own recommendation. It always responds
 * with valid JSON and never lets an exception escape or leak a stack trace.
 * -----------------------------------------------------------------------------
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { fetchCurrentWeather, type CurrentWeather } from '@/lib/weather'

export const dynamic = 'force-dynamic'

/** Consecutive rain-free days that constitute a dry spell. */
const DRY_SPELL_DAYS = 5

/** Daily precipitation (mm) below which a day counts as "no meaningful rain". */
const MEANINGFUL_RAIN_MM = 1

/** A district's coordinates, as embedded from the user's row. */
interface DistrictCoords {
  latitude: number | null
  longitude: number | null
}

/**
 * PostgREST returns an embedded to-one relationship as an object, but its
 * generated typing (and some relationship-detection paths) can surface it as a
 * single-element array. Accept both shapes.
 */
interface ProfileRow {
  districts: DistrictCoords | DistrictCoords[] | null
}

interface RecommendationRow {
  crop_name: string | null
  reasoning: string | null
  confidence_score: number | null
  created_at: string
}

/** Small helper for consistent JSON error responses. */
function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Normalise the embedded district relationship to a pair of real coordinates,
 * or null. Handles the object OR single-element-array shape PostgREST may
 * return, and — crucially — requires numeric values so we never send
 * `undefined`/`null` to Open-Meteo (which 400s and blanks the weather card).
 */
export function resolveDistrictCoords(
  districts: ProfileRow['districts'] | undefined,
): { latitude: number; longitude: number } | null {
  const row = Array.isArray(districts) ? districts[0] : districts
  if (!row) return null
  const { latitude, longitude } = row
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  return { latitude, longitude }
}

/**
 * True when the forecast contains a run of `DRY_SPELL_DAYS` or more consecutive
 * days without meaningful rain. Scans the forecast once, tracking the longest
 * dry streak seen.
 */
export function isDrySpell(weather: CurrentWeather | null): boolean {
  if (!weather) return false

  let consecutiveDryDays = 0
  for (const day of weather.forecast) {
    if (day.precipitation < MEANINGFUL_RAIN_MM) {
      consecutiveDryDays += 1
      if (consecutiveDryDays >= DRY_SPELL_DAYS) return true
    } else {
      consecutiveDryDays = 0
    }
  }

  return false
}

export async function GET() {
  try {
    // ── 1. Authenticate (RLS + queries key off the session user) ──────────
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('You must be logged in to view the dashboard.', 401)
    }

    // ── 2. Resolve the user's district coordinates (one joined query) ─────
    const { data: profile } = await supabase
      .from('users')
      .select('districts(latitude, longitude)')
      .eq('id', user.id)
      .single<ProfileRow>()

    const coords = resolveDistrictCoords(profile?.districts)

    // ── 3. Fetch weather + latest recommendation concurrently ─────────────
    const [weather, latestRecommendation] = await Promise.all([
      coords
        ? fetchCurrentWeather(coords.latitude, coords.longitude).catch(
            () => null, // Weather is best-effort: a provider outage must not 500.
          )
        : Promise.resolve(null),
      fetchLatestRecommendation(supabase, user.id),
    ])

    // ── 4. Respond (single combined payload) ──────────────────────────────
    return NextResponse.json({
      weather,
      is_dry_spell: isDrySpell(weather),
      latest_recommendation: latestRecommendation,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.'
    // Log server-side; never surface the stack trace to the client.
    console.error('Dashboard route error:', message)
    return errorResponse('Something went wrong while loading the dashboard.', 500)
  }
}

/**
 * Fetch the user's most recent recommendation, or null when they have none.
 * `maybeSingle` returns null (not an error) for an empty result, so a brand-new
 * user never triggers an error path.
 */
async function fetchLatestRecommendation(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<RecommendationRow | null> {
  const { data } = await supabase
    .from('recommendations')
    .select('crop_name, reasoning, confidence_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<RecommendationRow>()

  return data ?? null
}
