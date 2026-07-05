/**
 * GET /api/weather?lat=<n>&lon=<n>
 * -----------------------------------------------------------------------------
 * Thin authenticated proxy over the project's single Open-Meteo client
 * (`lib/weather.ts`). It lets client components read live weather for an
 * arbitrary district's coordinates without duplicating the Open-Meteo request,
 * parsing, or caching that already live in `fetchCurrentWeather`.
 *
 * Requires authentication (matches the rest of the app) so our server is never
 * an open weather proxy. Always responds with valid JSON.
 * -----------------------------------------------------------------------------
 */
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { fetchCurrentWeather } from '@/lib/weather'

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('You must be logged in to read weather data.', 401)
    }

    const { searchParams } = new URL(request.url)
    const latitude = Number(searchParams.get('lat'))
    const longitude = Number(searchParams.get('lon'))

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return errorResponse('Query params "lat" and "lon" must be numbers.', 400)
    }

    const weather = await fetchCurrentWeather(latitude, longitude)
    return NextResponse.json({ weather })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.'
    console.error('Weather route error:', message)
    return errorResponse('Something went wrong while fetching weather.', 500)
  }
}
