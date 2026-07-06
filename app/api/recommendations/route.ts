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
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { getViableCrops } from '@/lib/cropLookup'
import { getCropRecommendation } from '@/lib/gemini'
import { translateText } from '@/lib/googleCloud'
import { fetchWeatherSummary } from '@/lib/weather'
import { SOIL_TYPES } from '@/lib/constants'
import { getSeasonForMonth } from '@/lib/season'
import { sendFirebaseNotification } from '@/lib/firebase'

/** Valid soil ids, derived from the shared constant so the two never drift. */
const VALID_SOIL_IDS = new Set<string>(SOIL_TYPES.map((soil) => soil.id))

/** Languages the recommendation fields can be translated into. */
type TargetLang = 'en' | 'hi' | 'te' | 'mr' | 'gu' | 'kn' | 'ta' | 'bn'
const TRANSLATABLE_LANGS = new Set<TargetLang>(['en', 'hi', 'te', 'mr', 'gu', 'kn', 'ta', 'bn'])

/** Narrow an untrusted body value to a supported language, defaulting to 'en'. */
function parseTargetLang(raw: unknown): TargetLang {
  return typeof raw === 'string' && TRANSLATABLE_LANGS.has(raw as TargetLang)
    ? (raw as TargetLang)
    : 'en'
}

interface DistrictRow {
  name: string
  state: string
  latitude: number | null
  longitude: number | null
}

/** Small helper for consistent JSON error responses. */
function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  return handleRecommendationGeneration(request, false)
}

export async function handleRecommendationGeneration(request: Request, isTestRoute = false) {
  console.log("USING UPDATED ROUTE")
  try {
    const isDev = process.env.NODE_ENV === 'development'

    if (isTestRoute && !isDev) {
      console.log({ location: "route.ts line 56", isTestRoute, isDev })
      return errorResponse('Method Not Allowed', 405)
    }

    // ── 1. Parse + validate body ──────────────────────────────────────────
    let body: unknown = {}
    if (!isTestRoute) {
      try {
        body = await request.json()
      } catch {
        if (!isDev) {
          console.log({ location: "route.ts line 68", isDev })
          return errorResponse('Request body must be valid JSON.', 400)
        }
      }
    }

    if (isDev) {
      console.log('Incoming request:', {
        url: request.url,
        method: request.method,
        body,
      })
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    }

    const { district_id, soil_type, target_lang, soil_moisture_pct } = (body ?? {}) as {
      district_id?: unknown
      soil_type?: unknown
      target_lang?: unknown
      soil_moisture_pct?: unknown
    }

    const soilMoisture = typeof soil_moisture_pct === 'number' ? soil_moisture_pct : 50

    // Optional multilingual support; anything unrecognised falls back to English.
    const targetLang = parseTargetLang(target_lang)

    let finalDistrictId = typeof district_id === 'string' ? district_id.trim() : ''
    let finalSoilType = typeof soil_type === 'string' ? soil_type.trim() : ''

    const supabase = await createServerSupabaseClient()

    if (isDev) {
      if (isTestRoute || !finalSoilType || !VALID_SOIL_IDS.has(finalSoilType)) {
        finalSoilType = SOIL_TYPES[0]?.id ?? ''
      }
      if (isTestRoute || !finalDistrictId) {
        // Fetch first district
        console.log("PRE-QUERY: Querying first district...")
        const result = await supabase
          .from("districts")
          .select("*")
          .limit(1)

        console.log("First district query result:", result)

        const firstDistrict = result.data
        const firstDistrictErr = result.error

        console.log({
          location: "route.ts line 115 (first district query result)",
          firstDistrict,
          firstDistrictErr
        })

        if (firstDistrictErr) {
          console.log({ location: "route.ts line 121 (firstDistrictErr exists)", firstDistrictErr })
          return NextResponse.json({
            success: false,
            location: "first district query",
            error: firstDistrictErr.message,
            code: firstDistrictErr.code,
            details: firstDistrictErr.details,
            hint: firstDistrictErr.hint
          }, { status: 500 })
        }

        if (!firstDistrict || firstDistrict.length === 0) {
          console.log({ location: "route.ts line 133 (firstDistrict empty)", firstDistrict })
          return errorResponse('Database contains no districts.', 400)
        }
        finalDistrictId = firstDistrict[0].id
      }
    }

    if (isDev) {
      console.log('Selected district:', finalDistrictId)
      console.log('Selected soil type:', finalSoilType)
    }

    if (!finalDistrictId) {
      console.log({ location: "route.ts line 146", finalDistrictId })
      return errorResponse('Missing required field: district_id', 400)
    }
    if (!finalSoilType) {
      console.log({ location: "route.ts line 150", finalSoilType })
      return errorResponse('Missing required field: soil_type', 400)
    }
    if (!VALID_SOIL_IDS.has(finalSoilType)) {
      console.log({ location: "route.ts line 154", finalSoilType })
      return errorResponse('Invalid soil_type.', 400)
    }

    // ── 2. Authenticate (user id comes from the session, never the body) ──
    let userId = ''
    let currentUser: unknown = null
    if (isTestRoute && isDev) {
      userId = '00000000-0000-0000-0000-000000000000'
      currentUser = { id: userId, email: 'dev@kisan-alert.local', role: 'dev' }
    } else {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (!isDev && (authError || !user)) {
        console.log({ location: "route.ts line 170 (auth required in prod)", authError, user })
        return errorResponse('You must be logged in to request a recommendation.', 401)
      }

      userId = user?.id ?? (isDev ? '00000000-0000-0000-0000-000000000000' : '')
      currentUser = user
    }

    if (isDev) {
      console.log('Current user:', JSON.stringify(currentUser))
    }

    if (!userId) {
      console.log({ location: "route.ts line 183", userId })
      return errorResponse('You must be logged in to request a recommendation.', 401)
    }

    // ── 3. District lookup ────────────────────────────────────────────────
    const { data: district, error: districtError } = await supabase
      .from('districts')
      .select('name, state, latitude, longitude')
      .eq('id', finalDistrictId)
      .single<DistrictRow>()

    if (isDev) {
      console.log('District query result:', JSON.stringify(district))
      console.log('District query error:', JSON.stringify(districtError))
    }

    if (districtError) {
      if (districtError.code === 'PGRST116') {
        const { count, error: countErr } = await supabase
          .from('districts')
          .select('*', { count: 'exact', head: true })

        if (countErr) {
          console.log({ location: "route.ts line 208", countErr })
          return errorResponse(`Supabase query failed: ${countErr.message}`, 500)
        }
        if (count === 0) {
          console.log({ location: "route.ts line 212", count })
          return errorResponse('Database contains no districts.', 400)
        }
        console.log({ location: "route.ts line 215", districtError })
        return errorResponse('District not found.', 404)
      }
      console.log({ location: "route.ts line 218", districtError })
      return errorResponse(`Supabase query failed: ${districtError.message}`, 500)
    }

    if (!district) {
      console.log({ location: "route.ts line 223", district })
      return errorResponse('District not found.', 404)
    }
    if (district.latitude === null || district.longitude === null) {
      console.log({ location: "route.ts line 227", district })
      return errorResponse('District is missing location coordinates.', 422)
    }

    // ── 4. Season + viable crops ──────────────────────────────────────────
    const month = new Date().getMonth() + 1
    const season = getSeasonForMonth(month)
    const viableCrops = [...getViableCrops(finalSoilType, season)]

    if (viableCrops.length === 0) {
      console.log({ location: "route.ts line 237", finalSoilType, season, viableCrops })
      return errorResponse(
        `No viable crops are available for ${finalSoilType} soil during the ${season} season.`,
        422,
      )
    }

    // ── 5. Weather ────────────────────────────────────────────────────────
    const weatherSummary = await fetchWeatherSummary(
      district.latitude,
      district.longitude,
    )

    if (isDev) {
      console.log('Weather summary:', JSON.stringify(weatherSummary))
      console.log('Gemini input:', JSON.stringify({
        soilType: finalSoilType,
        districtName: district.name,
        stateName: district.state,
        season,
        viableCrops,
        weatherSummary,
      }))
    }

    // ── 8. Translate advisory fields (optional; English is the base) ──────
    // Only reasoning / fertilization_tip / irrigation_advice are translated.
    // crop_name, confidence_score, and is_dry_spell always stay in English.
    // translateText() never throws — it returns the original text on failure —
    // so a translation problem simply yields English values, never a crash.
    const recommendation = await getCropRecommendation(
      finalSoilType,
      district.name,
      district.state,
      season,
      viableCrops,
      weatherSummary,
      soilMoisture,
      targetLang,
    )

    if (isDev) {
      console.log('Gemini output:', JSON.stringify(recommendation))
    }

    const isLegacy = !recommendation.bestCrop

    let translated:
      | { reasoning: string; fertilization_tip: string; irrigation_advice: string }
      | undefined

    let cleanSummary = ''
    let cleanFert = ''
    let cleanIrr = ''
    let bestCropName = ''
    let suitabilityScore = 75

    if (isLegacy) {
      const legacyText = recommendation.legacyReasoning || 'AI recommendation unavailable. Safest seasonal fallback choice.'
      cleanSummary = legacyText
      cleanFert = 'Apply a small, balanced dose of Urea or DAP as per your local practice.'
      cleanIrr = 'Water your field based on soil moisture and the current weather.'
      bestCropName = viableCrops[0] ?? 'No crop available'

      if (targetLang !== 'en') {
        const [reasoning, fertilization_tip, irrigation_advice] = await Promise.all([
          translateText(cleanSummary, targetLang),
          translateText(cleanFert, targetLang),
          translateText(cleanIrr, targetLang),
        ])
        translated = { reasoning, fertilization_tip, irrigation_advice }
      }
    } else if (recommendation.bestCrop) {
      if (targetLang !== 'en') {
        const [reasoning, fertilization_tip, irrigation_advice] = await Promise.all([
          translateText(recommendation.bestCrop.summary, targetLang),
          translateText(recommendation.bestCrop.fertilization_tip, targetLang),
          translateText(recommendation.bestCrop.irrigation_advice, targetLang),
        ])
        translated = { reasoning, fertilization_tip, irrigation_advice }
      }
      cleanSummary = translated?.reasoning || recommendation.bestCrop.summary
      cleanFert = translated?.fertilization_tip || recommendation.bestCrop.fertilization_tip
      cleanIrr = translated?.irrigation_advice || recommendation.bestCrop.irrigation_advice
      bestCropName = recommendation.bestCrop.cropName
      suitabilityScore = recommendation.bestCrop.suitabilityScore
    }

    const reasoningToSave = isLegacy ? cleanSummary : JSON.stringify({
      bestCrop: {
        ...recommendation.bestCrop,
        summary: cleanSummary,
        fertilization_tip: cleanFert,
        irrigation_advice: cleanIrr,
      },
      alternatives: recommendation.alternatives,
      originalSummary: cleanSummary,
    })

    // ── 7. Persist (best-effort; a write failure must not lose the result) ─
    const { error: insertError } = await supabase.from('recommendations').insert({
      user_id: userId,
      crop_name: bestCropName,
      reasoning: reasoningToSave,
      confidence_score: suitabilityScore / 100,
    })

    if (isDev) {
      console.log('Insert result:', JSON.stringify({ error: insertError }))
    }

    if (insertError) {
      console.error('Failed to save recommendation:', insertError.message)
    }

    // ── 7b. Remember the selected district so the dashboard shows weather ──
    // Use targeted update so we only modify district_id and preserve other profile data.
    const { error: districtSaveError } = await supabase
      .from('users')
      .update({ district_id: finalDistrictId })
      .eq('id', userId)

    if (isDev) {
      console.log('User update result:', JSON.stringify({ error: districtSaveError }))
    }

    if (districtSaveError) {
      console.error('Failed to save user district:', districtSaveError.message)
    }


    // Trigger Firebase notifications. Notification copy is user-facing, so it
    // must match the selected language — translate the English templates before
    // storing them. translateText() never throws (returns the original on
    // failure), so a translation outage degrades to English rather than erroring.
    let recMessage = `🌾 Your crop recommendation is ready: ${bestCropName}`
    let drySpellMessage = '⚠️ Dry spell detected. Irrigation recommended for your crop.'
    if (targetLang !== 'en') {
      const [translatedRec, translatedDry] = await Promise.all([
        translateText(recMessage, targetLang),
        translateText(drySpellMessage, targetLang),
      ])
      recMessage = translatedRec
      drySpellMessage = translatedDry
    }

    const notificationPromises = []

    // Event 2: New Recommendation Generated
    notificationPromises.push(
      sendFirebaseNotification(userId, {
        message: recMessage,
        timestamp: Date.now(),
        read: false,
      })
    )

    // Event 1: Dry Spell Detected
    if (weatherSummary.isDrySpell) {
      notificationPromises.push(
        sendFirebaseNotification(userId, {
          message: drySpellMessage,
          timestamp: Date.now(),
          read: false,
        })
      )
    }

    await Promise.all(notificationPromises)

    // ── 9. Respond ────────────────────────────────────────────────────────
    console.log({ location: "route.ts success respond block", recommendation })
    return NextResponse.json({
      crop_name: bestCropName,
      reasoning: cleanSummary,
      confidence_score: suitabilityScore / 100,
      fertilization_tip: cleanFert,
      irrigation_advice: cleanIrr,
      is_dry_spell: weatherSummary.isDrySpell,
      ...(!isLegacy && recommendation.bestCrop ? {
        bestCrop: {
          ...recommendation.bestCrop,
          summary: cleanSummary,
          fertilization_tip: cleanFert,
          irrigation_advice: cleanIrr,
        },
        alternatives: recommendation.alternatives,
      } : {}),
      // Present only when a non-English language was requested.
      ...(translated ? { translated } : {}),
      ...(recommendation.error ? { error: recommendation.error } : {}),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.'
    console.error('Recommendation route error:', message)
    console.log({ location: "route.ts line 324 catch block", error })
    return errorResponse('Something went wrong while generating the recommendation.', 500)
  }
}
