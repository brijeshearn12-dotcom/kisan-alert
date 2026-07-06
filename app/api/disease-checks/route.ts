/**
 * POST /api/disease-checks
 * -----------------------------------------------------------------------------
 * Runs the plant-disease diagnosis pipeline for the logged-in farmer.
 *
 * Flow: authenticate -> validate the Cloudinary image URL -> ask Gemini Vision
 * (`getDiseaseDiagnosis`) -> persist a `disease_checks` row -> if confidence is
 * below the threshold, escalate by opening a `cases` row for expert review ->
 * respond with the diagnosis and escalation status.
 *
 * The endpoint always responds with JSON. A Gemini fallback (AI unavailable) is
 * returned normally — it is not turned into a 500. Only unexpected failures do.
 * -----------------------------------------------------------------------------
 */
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { getDiseaseDiagnosis, getDiseaseDiagnosisFromText } from '@/lib/gemini'
import { normalizeTranscript } from '@/utils/normalizeTranscript'
import { translateText } from '@/lib/googleCloud'

type TargetLang = 'en' | 'hi' | 'te' | 'mr' | 'gu' | 'kn' | 'ta' | 'bn'
const TRANSLATABLE_LANGS = new Set<TargetLang>(['en', 'hi', 'te', 'mr', 'gu', 'kn', 'ta', 'bn'])
function parseTargetLang(raw: unknown): TargetLang {
  return typeof raw === 'string' && TRANSLATABLE_LANGS.has(raw as TargetLang)
    ? (raw as TargetLang)
    : 'en'
}

/** A case is opened for expert review when confidence falls below this value. */
const LOW_CONFIDENCE_THRESHOLD = 0.6

/** Small helper for consistent JSON error responses. */
function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Validate that `raw` is an HTTPS image URL hosted on *our* Cloudinary account.
 * Restricting the host prevents the endpoint from fetching arbitrary URLs.
 */
function validateCloudinaryUrl(
  raw: string,
  cloudName: string | undefined,
): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'image_url is not a valid URL.'
  }

  if (url.protocol !== 'https:') return 'image_url must use HTTPS.'
  if (url.hostname !== 'res.cloudinary.com') {
    return 'image_url must be hosted on Cloudinary.'
  }

  // Cloudinary delivery URLs are /<cloud_name>/<resource_type>/... — pin the
  // first path segment to our cloud so other accounts are rejected.
  const firstSegment = url.pathname.split('/').filter(Boolean)[0]
  if (cloudName && firstSegment !== cloudName) {
    return 'image_url does not belong to this Cloudinary account.'
  }

  return null
}

export async function POST(request: Request) {
  try {
    // ── 1. Authenticate (session cookie only; nothing trusted from client) ─
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('You must be logged in to run a disease check.', 401)
    }

    // ── 2. Parse + validate body ──────────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Request body must be valid JSON.', 400)
    }

    const { image_url, crop_type, voice_description, target_lang } = (body ?? {}) as {
      image_url?: unknown
      crop_type?: unknown
      voice_description?: unknown
      target_lang?: unknown
    }

    const targetLang = parseTargetLang(target_lang)

    // ── 2b. Voice/text description path (no image required) ─────────────
    if (
      (typeof image_url !== 'string' || image_url.trim() === '') &&
      typeof voice_description === 'string' &&
      voice_description.trim() !== ''
    ) {
      const cleanedText = normalizeTranscript(voice_description.trim())
      const textResult = await getDiseaseDiagnosisFromText(cleanedText, targetLang)

      // Gemini fallback → return cleanly, no DB write, no escalation
      if (textResult.error || textResult.diagnosis === null) {
        return NextResponse.json({
          diagnosis: textResult.diagnosis,
          confidence_score: textResult.confidence_score,
          treatment_advice: textResult.treatment_advice,
          escalated: false,
          case_id: null,
          disease_check_id: null,
          ...(textResult.error ? { error: textResult.error } : {}),
        })
      }

      let diagnosisToSave = textResult.diagnosis
      let treatmentToSave = textResult.treatment_advice

      if (targetLang !== 'en' && textResult.diagnosis && textResult.treatment_advice) {
        const [transDiagnosis, transTreatment] = await Promise.all([
          translateText(textResult.diagnosis, targetLang),
          translateText(textResult.treatment_advice, targetLang),
        ])
        diagnosisToSave = transDiagnosis
        treatmentToSave = transTreatment
      }

      // Persist the text-based diagnosis (image_url is null for voice path)
      const { data: check, error: checkError } = await supabase
        .from('disease_checks')
        .insert({
          user_id: user.id,
          image_url: null,
          diagnosis: diagnosisToSave,
          confidence_score: textResult.confidence_score,
          treatment_advice: treatmentToSave,
        })
        .select('id')
        .single<{ id: string }>()

      if (checkError || !check) {
        console.error('disease_checks insert error (voice path):', checkError)
        return errorResponse('Could not save the disease check.', 500)
      }

      // Escalate low-confidence results
      let caseId: string | null = null
      if (textResult.confidence_score < LOW_CONFIDENCE_THRESHOLD) {
        const generatedCaseId = randomUUID()
        const { error: caseError } = await supabase
          .from('cases')
          .insert({
            id: generatedCaseId,
            disease_check_id: check.id,
            status: 'pending',
          })

        if (caseError) {
          console.error('cases insert error (voice path):', caseError)
          return errorResponse('Could not escalate the diagnosis for expert review.', 500)
        }
        caseId = generatedCaseId
      }

      return NextResponse.json({
        diagnosis: diagnosisToSave,
        confidence_score: textResult.confidence_score,
        treatment_advice: treatmentToSave,
        escalated: caseId !== null,
        case_id: caseId,
        disease_check_id: check.id,
      })
    }

    // ── 2c. Image path — validate image_url ─────────────────────────────
    if (typeof image_url !== 'string' || image_url.trim() === '') {
      return errorResponse('`image_url` or `voice_description` is required.', 400)
    }

    const cloudName =
      process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const urlError = validateCloudinaryUrl(image_url.trim(), cloudName)
    if (urlError) {
      return errorResponse(urlError, 400)
    }

    const imageUrl = image_url.trim()
    const cropType =
      typeof crop_type === 'string' && crop_type.trim() !== ''
        ? crop_type.trim()
        : undefined

    // ── 3. Diagnose (never throws; may return the AI-unavailable fallback) ─
    const result = await getDiseaseDiagnosis(imageUrl, cropType, targetLang)

    // Gemini fallback → return it cleanly, no DB write, no escalation, no 500.
    if (result.error || result.diagnosis === null) {
      return NextResponse.json({
        diagnosis: result.diagnosis,
        confidence_score: result.confidence_score,
        treatment_advice: result.treatment_advice,
        escalated: false,
        case_id: null,
        disease_check_id: null,
        ...(result.error ? { error: result.error } : {}),
      })
    }

    let diagnosisToSave = result.diagnosis
    let treatmentToSave = result.treatment_advice

    if (targetLang !== 'en' && result.diagnosis && result.treatment_advice) {
      const [transDiagnosis, transTreatment] = await Promise.all([
        translateText(result.diagnosis, targetLang),
        translateText(result.treatment_advice, targetLang),
      ])
      diagnosisToSave = transDiagnosis
      treatmentToSave = transTreatment
    }

    // ── 4. Persist the successful diagnosis ───────────────────────────────
    // Note: `disease_checks` has no crop_type column, so it is not stored here.
    const { data: check, error: checkError } = await supabase
      .from('disease_checks')
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        diagnosis: diagnosisToSave,
        confidence_score: result.confidence_score,
        treatment_advice: treatmentToSave,
      })
      .select('id')
      .single<{ id: string }>()

    if (checkError || !check) {
      console.error('disease_checks insert error:', checkError)
      return errorResponse('Could not save the disease check.', 500)
    }

    // ── 5. Escalate low-confidence results for expert review ──────────────
    let caseId: string | null = null
    if (result.confidence_score < LOW_CONFIDENCE_THRESHOLD) {
      const generatedCaseId = randomUUID()
      const { error: caseError } = await supabase
        .from('cases')
        .insert({
          id: generatedCaseId,
          disease_check_id: check.id,
          status: 'pending',
        })

      if (caseError) {
        console.error('cases insert error:', caseError)
        return errorResponse('Could not escalate the diagnosis for expert review.', 500)
      }
      caseId = generatedCaseId
    }

    // ── 6. Respond ────────────────────────────────────────────────────────
    return NextResponse.json({
      diagnosis: diagnosisToSave,
      confidence_score: result.confidence_score,
      treatment_advice: treatmentToSave,
      escalated: caseId !== null,
      case_id: caseId,
      disease_check_id: check.id,
    })
  } catch (routeErr) {
    console.error('Unhandled route error in POST /api/disease-checks:', routeErr)
    return errorResponse('Something went wrong while running the disease check.', 500)
  }
}
