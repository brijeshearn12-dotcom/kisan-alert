/**
 * POST /api/recommendations
 * -----------------------------------------------------------------------------
 * Generates an AI crop recommendation for the logged-in farmer.
 *
 * Flow: validate input -> look up district (name + coords) -> fetch Open-Meteo
 * 7-day forecast -> derive season from the month -> get viable crops -> ask
 * Gemini (constrained to those crops) -> persist to `recommendations` -> return.
 *
 * The endpoint always responds with valid JSON and never lets an exception
 * escape: unexpected failures become a 500 with a clear `error` message.
 * -----------------------------------------------------------------------------
 */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { getViableCrops } from '@/lib/cropLookup'
import { getCropRecommendation, type WeatherSummary } from '@/lib/gemini'
import { SOIL_TYPES } from '@/lib/constants'

/** Valid soil ids, derived from the shared constant so the two never drift. */
const VALID_SOIL_IDS = new Set<string>(SOIL_TYPES.map((soil) => soil.id))

/** Total weekly rainfall (mm) at or below which we flag a dry spell (MVP rule). */
const DRY_SPELL_RAINFALL_THRESHOLD_MM = 10

type Season = 'kharif' | 'rabi' | 'summer'

/** Derive the current agronomic season from the month (1 = Jan ... 12 = Dec). */
function getSeasonForMonth(month: number): Season {
  if (month >= 6 && month <= 9) return 'kharif' // June–September
  if (month >= 10 || month <= 3) return 'rabi' // October–March
  return 'summer' // April–May
}

interface DistrictRow {
  name: string
  latitude: number | null
  longitude: number | null
}

interface OpenMeteoResponse {
  daily?: {
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
  }
}

/** Round to one decimal place for clean, human-friendly numbers. */
function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Fetch the Open-Meteo 7-day forecast and reduce it to a weather summary.
 * No API key required. Cached for 30 minutes via Next's fetch caching.
 */
async function fetchWeatherSummary(
  latitude: number,
  longitude: number,
): Promise<WeatherSummary> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&forecast_days=7&timezone=auto`

  const response = await fetch(url, { next: { revalidate: 1800 } })
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`)
  }

  const data = (await response.json()) as OpenMeteoResponse
  const maxTemps = data.daily?.temperature_2m_max ?? []
  const minTemps = data.daily?.temperature_2m_min ?? []
  const rainfall = data.daily?.precipitation_sum ?? []

  if (maxTemps.length === 0 || minTemps.length === 0) {
    throw new Error('Open-Meteo returned no temperature data')
  }

  // Average daily mean temperature across the forecast window.
  const dailyMeans = maxTemps.map(
    (max, index) => (max + (minTemps[index] ?? max)) / 2,
  )
  const averageTemperature =
    dailyMeans.reduce((sum, value) => sum + value, 0) / dailyMeans.length

  const expectedRainfall = rainfall.reduce((sum, value) => sum + value, 0)

  return {
    averageTemperature: roundOne(averageTemperature),
    expectedRainfall: roundOne(expectedRainfall),
    isDrySpell: expectedRainfall <= DRY_SPELL_RAINFALL_THRESHOLD_MM,
  }
}

/** Small helper for consistent JSON error responses. */
function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  try {
    // ── 1. Parse + validate body ──────────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Request body must be valid JSON.', 400)
    }

    const { district_id, soil_type } = (body ?? {}) as {
      district_id?: unknown
      soil_type?: unknown
    }

    if (typeof district_id !== 'string' || district_id.trim() === '') {
      return errorResponse('`district_id` is required and must be a non-empty string.', 400)
    }
    if (typeof soil_type !== 'string' || soil_type.trim() === '') {
      return errorResponse('`soil_type` is required and must be a non-empty string.', 400)
    }

    const soilType = soil_type.trim()
    if (!VALID_SOIL_IDS.has(soilType)) {
      return errorResponse(
        `Invalid soil type "${soilType}". Expected one of: ${[...VALID_SOIL_IDS].join(', ')}.`,
        400,
      )
    }

    // ── 2. Authenticate (user id comes from the session, never the body) ──
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('You must be logged in to request a recommendation.', 401)
    }

    // ── 3. District lookup ────────────────────────────────────────────────
    const { data: district, error: districtError } = await supabase
      .from('districts')
      .select('name, latitude, longitude')
      .eq('id', district_id.trim())
      .single<DistrictRow>()

    if (districtError || !district) {
      return errorResponse('District not found.', 404)
    }
    if (district.latitude === null || district.longitude === null) {
      return errorResponse('District is missing location coordinates.', 422)
    }

    // ── 4. Season + viable crops ──────────────────────────────────────────
    const month = new Date().getMonth() + 1
    const season = getSeasonForMonth(month)
    const viableCrops = [...getViableCrops(soilType, season)]

    if (viableCrops.length === 0) {
      return errorResponse(
        `No viable crops are available for ${soilType} soil during the ${season} season.`,
        422,
      )
    }

    // ── 5. Weather ────────────────────────────────────────────────────────
    const weatherSummary = await fetchWeatherSummary(
      district.latitude,
      district.longitude,
    )

    // ── 6. Gemini recommendation (never throws) ───────────────────────────
    const recommendation = await getCropRecommendation(
      soilType,
      district.name,
      season,
      viableCrops,
      weatherSummary,
    )

    // ── 7. Persist (best-effort; a write failure must not lose the result) ─
    const { error: insertError } = await supabase.from('recommendations').insert({
      user_id: user.id,
      crop_name: recommendation.crop_name,
      reasoning: recommendation.reasoning,
      confidence_score: recommendation.confidence_score,
    })

    if (insertError) {
      console.error('Failed to save recommendation:', insertError.message)
    }

    // ── 8. Respond ────────────────────────────────────────────────────────
    return NextResponse.json({
      crop_name: recommendation.crop_name,
      reasoning: recommendation.reasoning,
      confidence_score: recommendation.confidence_score,
      is_dry_spell: weatherSummary.isDrySpell,
      ...(recommendation.error ? { error: recommendation.error } : {}),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.'
    console.error('Recommendation route error:', message)
    return errorResponse('Something went wrong while generating the recommendation.', 500)
  }
}
