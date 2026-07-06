/**
 * gemini.ts
 * -----------------------------------------------------------------------------
 * Thin, reusable helper around the Gemini API for crop recommendations.
 *
 * The public function `getCropRecommendation` is total: it NEVER throws. On any
 * failure (missing/invalid key, quota, timeout, malformed JSON, network, SDK
 * error) it returns a safe fallback object whose `crop_name` is the first
 * viable crop, `confidence_score` is 0, and `error` describes what went wrong.
 * -----------------------------------------------------------------------------
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getLanguageMeta, type LanguageCode } from '@/lib/i18n/translations'
import { translateText, type TargetLang } from '@/lib/googleCloud'

/** Shape returned to callers. `error` is only present on the fallback path. */
export interface CropRecommendation {
  crop_name: string
  reasoning: string
  confidence_score: number
  /** One practical, low-cost fertilizer action for the coming week. */
  fertilization_tip: string
  /** One irrigation instruction based on crop stage and current weather. */
  irrigation_advice: string
  error?: string
}

/** Weather context the model uses to reason about the recommendation. */
export interface WeatherSummary {
  averageTemperature: number
  expectedRainfall: number
  isDrySpell: boolean
}

const MODEL_NAME = 'gemini-3.1-flash-lite'

/** How long we wait for Gemini before giving up and using the fallback. */
const REQUEST_TIMEOUT_MS = 35_000

const SYSTEM_INSTRUCTION =
  'You are an agricultural advisor for Indian smallholder farmers.'

const FALLBACK_REASONING =
  'AI recommendation unavailable. Returning a safe fallback recommendation.'

/**
 * Build the safe fallback object used whenever the AI path fails for any reason.
 * Picks the first viable crop, or a neutral placeholder if the list is empty.
 */
function buildFallback(
  viableCrops: string[],
  errorMessage: string,
): CropRecommendation {
  return {
    crop_name: viableCrops[0] ?? 'No crop available',
    reasoning: FALLBACK_REASONING,
    confidence_score: 0,
    fertilization_tip:
      'Apply a small, balanced dose of Urea or DAP as per your local practice once the AI service is back.',
    irrigation_advice:
      'Water your field based on soil moisture and the current weather until detailed advice is available.',
    error: errorMessage,
  }
}

/**
 * Construct the user prompt. The list of viable crops is the hard constraint —
 * the model must choose exactly one of these and nothing else.
 */
function buildPrompt(
  soilType: string,
  districtName: string,
  stateName: string,
  season: string,
  viableCrops: string[],
  weatherSummary: WeatherSummary,
  targetLangName: string,
): string {
  return [
    'Recommend the single best crop for a smallholder farmer based on the data below.',
    '',
    `District: ${districtName}, State: ${stateName}, Country: India`,
    `Soil type: ${soilType}`,
    `Season: ${season}`,
    `Average temperature (next 7 days): ${weatherSummary.averageTemperature} °C`,
    `Expected rainfall (next 7 days): ${weatherSummary.expectedRainfall} mm`,
    `Dry spell expected: ${weatherSummary.isDrySpell ? 'yes' : 'no'}`,
    '',
    'You MUST choose exactly one crop from this list of viable crops and never invent or suggest anything outside it:',
    viableCrops.map((crop) => `- ${crop}`).join('\n'),
    '',
    'Consider the soil type, district, season, and weather summary. Be conservative when uncertain.',
    `You MUST respond and write all fields (reasoning, fertilization_tip, irrigation_advice) entirely in the ${targetLangName} language.`,
    'Respond with ONLY valid JSON (no markdown, no code fences, no commentary) in exactly this shape:',
    `{"crop_name": "<one crop from the list>", "reasoning": "<2-3 simple sentences in ${targetLangName}>", "confidence_score": <number between 0 and 1>, "fertilization_tip": "<one sentence in ${targetLangName}>", "irrigation_advice": "<one sentence in ${targetLangName}>"}`,
    '',
    'fertilization_tip:',
    '- Exactly ONE sentence.',
    '- Practical and low-cost.',
    '- Recommend the simplest fertilizer action for the coming week.',
    '- Prefer fertilizers commonly available in India such as Urea or DAP when appropriate.',
    `- Written in the ${targetLangName} language.`,
    '- Use plain language suitable for farmers.',
    '',
    'irrigation_advice:',
    '- Exactly ONE sentence.',
    '- Recommend irrigation based on crop stage and current weather conditions.',
    '- Keep the advice practical and easy to follow.',
    `- Written in the ${targetLangName} language.`,
    '- Use simple farmer-friendly language.',
  ].join('\n')
}

/** Strip accidental ```json fences so JSON.parse succeeds on slightly-off output. */
function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

/**
 * Validate and normalize the model's parsed output.
 * Returns a clean recommendation, or null if the payload is unusable.
 */
function normalizeModelOutput(
  parsed: unknown,
  viableCrops: string[],
): CropRecommendation | null {
  if (typeof parsed !== 'object' || parsed === null) return null

  const record = parsed as Record<string, unknown>
  const rawName = record.crop_name
  const rawReasoning = record.reasoning
  const rawScore = record.confidence_score
  const rawFertilization = record.fertilization_tip
  const rawIrrigation = record.irrigation_advice

  if (typeof rawName !== 'string' || rawName.trim() === '') return null

  // Enforce the hard constraint: the crop must be one of the viable crops.
  // Match case-insensitively so minor formatting differences still resolve.
  const matchedCrop = viableCrops.find(
    (crop) => crop.toLowerCase() === rawName.trim().toLowerCase(),
  )
  if (!matchedCrop) return null

  const reasoning =
    typeof rawReasoning === 'string' && rawReasoning.trim() !== ''
      ? rawReasoning.trim()
      : 'Recommended based on the soil, season, and recent weather.'

  // Coerce + clamp the score into [0, 1]; default to a conservative 0.5.
  const numericScore =
    typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : 0.5
  const confidence_score = Math.min(1, Math.max(0, numericScore))

  // The two advisory fields are required in our contract but must never cause a
  // valid crop pick to be discarded — fall back to safe generic guidance.
  const fertilization_tip =
    typeof rawFertilization === 'string' && rawFertilization.trim() !== ''
      ? rawFertilization.trim()
      : 'Apply a light, balanced dose of Urea or DAP this week as per local practice.'

  const irrigation_advice =
    typeof rawIrrigation === 'string' && rawIrrigation.trim() !== ''
      ? rawIrrigation.trim()
      : 'Irrigate lightly based on soil moisture and this week’s weather.'

  return {
    crop_name: matchedCrop,
    reasoning,
    confidence_score,
    fertilization_tip,
    irrigation_advice,
  }
}

/**
 * Get a crop recommendation from Gemini, constrained to `viableCrops`.
 *
 * Always resolves to a valid {@link CropRecommendation}. On success `error` is
 * absent; on any failure `error` is populated and `confidence_score` is 0.
 */
export async function getCropRecommendation(
  soilType: string,
  districtName: string,
  stateName: string,
  season: string,
  viableCrops: string[],
  weatherSummary: WeatherSummary,
  soilMoisture: number = 50,
  targetLang: string = 'en',
): Promise<CropRecommendation> {
  const langMeta = getLanguageMeta(targetLang as LanguageCode)
  const targetLangName = langMeta ? langMeta.englishLabel : 'English'

  if (viableCrops.length === 0) {
    const fallback = buildFallback(viableCrops, 'No viable crops were supplied.')
    let suffix = ""
    if (soilMoisture < 30) {
      suffix = " High irrigation required due to dry soil conditions. Soil moisture: " + soilMoisture + "%";
    } else if (soilMoisture <= 60) {
      suffix = " Moderate irrigation recommended. Soil moisture: " + soilMoisture + "%";
    } else {
      suffix = " Low irrigation needed. Soil moisture sufficient: " + soilMoisture + "%";
    }
    if (targetLang !== 'en') {
      suffix = await translateText(suffix, targetLang as TargetLang)
    }
    fallback.irrigation_advice += suffix
    return fallback
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    const fallback = buildFallback(viableCrops, 'GEMINI_API_KEY is not configured.')
    let suffix = ""
    if (soilMoisture < 30) {
      suffix = " High irrigation required due to dry soil conditions. Soil moisture: " + soilMoisture + "%";
    } else if (soilMoisture <= 60) {
      suffix = " Moderate irrigation recommended. Soil moisture: " + soilMoisture + "%";
    } else {
      suffix = " Low irrigation needed. Soil moisture sufficient: " + soilMoisture + "%";
    }
    if (targetLang !== 'en') {
      suffix = await translateText(suffix, targetLang as TargetLang)
    }
    fallback.irrigation_advice += suffix
    return fallback
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    })

    const prompt = buildPrompt(
      soilType,
      districtName,
      stateName,
      season,
      viableCrops,
      weatherSummary,
      targetLangName,
    )

    // Guard against a hung request with our own timeout.
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Gemini request timed out.')),
          REQUEST_TIMEOUT_MS,
        ),
      ),
    ])

    const text = result.response.text()

    let parsed: unknown
    try {
      parsed = JSON.parse(stripCodeFences(text))
    } catch {
      const fallback = buildFallback(
        viableCrops,
        'Gemini returned a response that was not valid JSON.',
      )
      let suffix = ""
      if (soilMoisture < 30) {
        suffix = " High irrigation required due to dry soil conditions. Soil moisture: " + soilMoisture + "%";
      } else if (soilMoisture <= 60) {
        suffix = " Moderate irrigation recommended. Soil moisture: " + soilMoisture + "%";
      } else {
        suffix = " Low irrigation needed. Soil moisture sufficient: " + soilMoisture + "%";
      }
      if (targetLang !== 'en') {
        suffix = await translateText(suffix, targetLang as TargetLang)
      }
      fallback.irrigation_advice += suffix
      return fallback
    }

    const normalized = normalizeModelOutput(parsed, viableCrops)
    if (!normalized) {
      const fallback = buildFallback(
        viableCrops,
        'Gemini returned a malformed or out-of-list recommendation.',
      )
      let suffix = ""
      if (soilMoisture < 30) {
        suffix = " High irrigation required due to dry soil conditions. Soil moisture: " + soilMoisture + "%";
      } else if (soilMoisture <= 60) {
        suffix = " Moderate irrigation recommended. Soil moisture: " + soilMoisture + "%";
      } else {
        suffix = " Low irrigation needed. Soil moisture sufficient: " + soilMoisture + "%";
      }
      if (targetLang !== 'en') {
        suffix = await translateText(suffix, targetLang as TargetLang)
      }
      fallback.irrigation_advice += suffix
      return fallback
    }

    let suffix = ""
    if (soilMoisture < 30) {
      suffix = " High irrigation required due to dry soil conditions. Soil moisture: " + soilMoisture + "%";
    } else if (soilMoisture <= 60) {
      suffix = " Moderate irrigation recommended. Soil moisture: " + soilMoisture + "%";
    } else {
      suffix = " Low irrigation needed. Soil moisture sufficient: " + soilMoisture + "%";
    }
    if (targetLang !== 'en') {
      suffix = await translateText(suffix, targetLang as TargetLang)
    }
    normalized.irrigation_advice += suffix
    return normalized
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Gemini error.'
    const fallback = buildFallback(viableCrops, message)
    let suffix = ""
    if (soilMoisture < 30) {
      suffix = " High irrigation required due to dry soil conditions. Soil moisture: " + soilMoisture + "%";
    } else if (soilMoisture <= 60) {
      suffix = " Moderate irrigation recommended. Soil moisture: " + soilMoisture + "%";
    } else {
      suffix = " Low irrigation needed. Soil moisture sufficient: " + soilMoisture + "%";
    }
    if (targetLang !== 'en') {
      suffix = await translateText(suffix, targetLang as TargetLang)
    }
    fallback.irrigation_advice += suffix
    return fallback
  }
}

// ── Vegetation & moisture advisory ───────────────────────────────────────────

/** Context the model uses to describe today's vegetation condition. */
export interface VegetationContext {
  districtName: string
  stateName: string
  season: string
  rainfallMm7d: number
  soilMoisture: number
  score: number
  status: string
}

/** Shape returned to callers. `error` is only present on the fallback path. */
export interface VegetationAdvice {
  advice: string
  error?: string
}

const VEGETATION_SYSTEM_INSTRUCTION =
  'You are an agricultural advisor for Indian smallholder farmers. ' +
  'You explain field conditions in very simple, everyday language a farmer can act on.'

/**
 * Deterministic one-sentence advisory used whenever the AI path is unavailable.
 * Picks the single biggest contributing factor so the message stays actionable.
 */
function buildVegetationFallback(ctx: VegetationContext): string {
  const statusText =
    ctx.status === 'parched'
      ? 'very dry'
      : ctx.status === 'stressed'
        ? 'a little dry'
        : ctx.status === 'saturated'
          ? 'very wet'
          : 'healthy'

  const driver =
    ctx.rainfallMm7d < 10
      ? 'low recent rainfall'
      : ctx.soilMoisture < 30
        ? 'dry soil'
        : ctx.soilMoisture > 80 || ctx.rainfallMm7d > 80
          ? 'high soil moisture and rainfall'
          : 'good soil moisture and rainfall'

  return `Your field looks ${statusText} today, mainly because of ${driver}.`
}

/** Build the vegetation advisory prompt (plain-text answer, not JSON). */
function buildVegetationPrompt(ctx: VegetationContext, targetLangName: string): string {
  return [
    "Describe today's vegetation and soil-moisture condition for this field.",
    '',
    `District: ${ctx.districtName}, State: ${ctx.stateName}, Country: India`,
    `Season: ${ctx.season}`,
    `Soil moisture: ${ctx.soilMoisture}%`,
    `Expected rainfall (next 7 days): ${ctx.rainfallMm7d} mm`,
    `Computed vegetation index: ${ctx.score}/100 (${ctx.status})`,
    '',
    'Rules for your answer:',
    `- Explain the condition in ONE simple sentence for a farmer written entirely in the ${targetLangName} language.`,
    '- Mention the single biggest contributing factor.',
    '- Avoid technical language and jargon.',
    '- Keep it under 25 words.',
    `- Reply entirely in the ${targetLangName} language.`,
    '- Reply with the sentence only — no preamble, labels, or quotation marks.',
  ].join('\n')
}

/**
 * Produce a one-sentence, farmer-friendly explanation of today's vegetation
 * condition using Gemini. Reuses the shared client, model, and timeout.
 *
 * Always resolves — never throws. On any failure it returns a deterministic
 * fallback sentence with `error` populated.
 */
export async function getVegetationAdvice(
  ctx: VegetationContext,
  targetLang: string = 'en',
): Promise<VegetationAdvice> {
  const langMeta = getLanguageMeta(targetLang as LanguageCode)
  const targetLangName = langMeta ? langMeta.englishLabel : 'English'
  const fallback = buildVegetationFallback(ctx)

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    let finalFallback = fallback
    if (targetLang !== 'en') {
      finalFallback = await translateText(fallback, targetLang as TargetLang)
    }
    return { advice: finalFallback, error: 'GEMINI_API_KEY is not configured.' }
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: VEGETATION_SYSTEM_INSTRUCTION,
      generationConfig: { temperature: 0.4 },
    })

    const result = await Promise.race([
      model.generateContent(buildVegetationPrompt(ctx, targetLangName)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Gemini request timed out.')),
          REQUEST_TIMEOUT_MS,
        ),
      ),
    ])

    const text = result.response.text().trim().replace(/^["']|["']$/g, '')
    if (!text) {
      let finalFallback = fallback
      if (targetLang !== 'en') {
        finalFallback = await translateText(fallback, targetLang as TargetLang)
      }
      return { advice: finalFallback, error: 'Gemini returned an empty response.' }
    }

    return { advice: text }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Gemini error.'
    let finalFallback = fallback
    if (targetLang !== 'en') {
      finalFallback = await translateText(fallback, targetLang as TargetLang)
    }
    return { advice: finalFallback, error: message }
  }
}

// ── Disease diagnosis ────────────────────────────────────────────────────────

/** Shape returned to callers. `error` is only present on the fallback path. */
export interface DiseaseDiagnosis {
  diagnosis: string | null
  confidence_score: number
  treatment_advice: string | null
  error?: string
}

/** Every failure path returns exactly this object (per the API contract). */
const DIAGNOSIS_FALLBACK: DiseaseDiagnosis = {
  diagnosis: null,
  confidence_score: 0,
  treatment_advice: null,
  error: 'ai_unavailable',
}

const DISEASE_SYSTEM_INSTRUCTION =
  'You are an experienced plant pathologist specializing in common diseases affecting Indian crops. ' +
  'You assist smallholder farmers. ' +
  'Carefully inspect the supplied image before answering. ' +
  'If the image quality is poor, blurry, dark, partially visible, or multiple conditions are possible, lower your confidence accordingly. ' +
  'Never pretend to be certain when you are not.'

/** Inline image payload Gemini Vision accepts as a content part. */
interface InlineImage {
  data: string
  mimeType: string
}

/**
 * Download an image and return it as base64 inline data for Gemini Vision.
 * Returns null on any download/validation problem (bad URL, non-image, HTTP
 * error, timeout) so the caller can fall back without throwing.
 */
async function fetchImageAsInlineData(imageUrl: string): Promise<InlineImage | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(imageUrl, { signal: controller.signal })
    if (!response.ok) {
      console.error(`Image download failed. HTTP Status: ${response.status} for URL: ${imageUrl}`)
      return null
    }

    const mimeType = response.headers.get('content-type')?.split(';')[0].trim()
    if (!mimeType || !mimeType.startsWith('image/')) {
      console.error(`Invalid or missing MIME type: ${mimeType} for URL: ${imageUrl}`)
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) {
      console.error(`Downloaded image buffer is empty for URL: ${imageUrl}`)
      return null
    }

    return { data: buffer.toString('base64'), mimeType }
  } catch (err) {
    console.error(`Error downloading image from URL: ${imageUrl}:`, err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Build the diagnosis prompt, embedding the crop hint and the strict rules. */
function buildDiagnosisPrompt(cropType?: string, targetLangName: string = 'English'): string {
  const cropLine =
    cropType && cropType.trim() !== ''
      ? `The crop in the image is: ${cropType.trim()}.`
      : 'The crop type is not specified; infer it from the image if possible.'

  return [
    cropLine,
    '',
    'Self-report a confidence score between 0 and 1.',
    'Score CONSERVATIVELY.',
    'Reduce your confidence if:',
    '- the image is blurry',
    '- lighting is poor',
    '- symptoms are incomplete',
    '- multiple diseases are plausible',
    '- you cannot confidently distinguish between conditions.',
    '',
    `You MUST respond and write all text fields (diagnosis, treatment_advice) entirely in the ${targetLangName} language.`,
    'Respond with ONLY valid JSON (no markdown, no code fences, no commentary) in exactly this shape:',
    `{"diagnosis": "<disease name or condition in ${targetLangName}>", "confidence_score": <number between 0 and 1>, "treatment_advice": "<2-3 simple sentences in ${targetLangName} using practical, locally available remedies>"}`,
  ].join('\n')
}

/**
 * Validate and normalize the model's parsed output.
 * Returns a clean diagnosis, or null if the payload is unusable.
 */
function normalizeDiagnosisOutput(parsed: unknown): DiseaseDiagnosis | null {
  if (typeof parsed !== 'object' || parsed === null) return null

  const record = parsed as Record<string, unknown>
  const rawDiagnosis = record.diagnosis
  const rawTreatment = record.treatment_advice
  const rawScore = record.confidence_score

  if (typeof rawDiagnosis !== 'string' || rawDiagnosis.trim() === '') return null
  if (typeof rawTreatment !== 'string' || rawTreatment.trim() === '') return null

  // Coerce + clamp the score into [0, 1]; default to a conservative 0.5.
  const numericScore =
    typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : 0.5
  const confidence_score = Math.min(1, Math.max(0, numericScore))

  return {
    diagnosis: rawDiagnosis.trim(),
    confidence_score,
    treatment_advice: rawTreatment.trim(),
  }
}

/**
 * Diagnose a plant disease from an image URL using Gemini Vision.
 *
 * Always resolves — never throws. On any failure (invalid URL, download error,
 * missing key, Gemini error, malformed JSON, timeout) it returns
 * {@link DIAGNOSIS_FALLBACK} with `error: "ai_unavailable"`.
 */
export async function getDiseaseDiagnosis(
  imageUrl: string,
  cropType?: string,
  targetLang: string = 'en',
): Promise<DiseaseDiagnosis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return DIAGNOSIS_FALLBACK
  console.log(`apiKey loaded: length=${apiKey.length}, startsWith=${apiKey.slice(0, 10)}`)

  const langMeta = getLanguageMeta(targetLang as LanguageCode)
  const targetLangName = langMeta ? langMeta.englishLabel : 'English'

  try {
    const image = await fetchImageAsInlineData(imageUrl)
    if (!image) return DIAGNOSIS_FALLBACK

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: DISEASE_SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    })

    let text = ''
    let lastErr: unknown
    let delayMs = 1500
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await Promise.race([
          model.generateContent([
            buildDiagnosisPrompt(cropType, targetLangName),
            { inlineData: { data: image.data, mimeType: image.mimeType } },
          ]),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Gemini request timed out.')),
              REQUEST_TIMEOUT_MS,
            ),
          ),
        ])
        text = result.response.text()
        break
      } catch (err) {
        lastErr = err
        if (attempt < 3) {
          console.warn(`Gemini API call failed on attempt ${attempt}. Retrying in ${delayMs}ms... Error:`, err)
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          delayMs *= 2
        }
      }
    }

    if (!text) {
      console.error('All Gemini API call attempts failed. Returning fallback. Last error:', lastErr)
      return DIAGNOSIS_FALLBACK
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(stripCodeFences(text))
    } catch (parseErr) {
      console.error('JSON Parse error of Gemini response:', parseErr, 'Raw Text:', text)
      return DIAGNOSIS_FALLBACK
    }

    const normalized = normalizeDiagnosisOutput(parsed)
    if (!normalized) {
      console.error('Normalization failed for parsed output:', parsed)
      return DIAGNOSIS_FALLBACK
    }
    return normalized
  } catch (err) {
    console.error('Gemini SDK error in getDiseaseDiagnosis:', err)
    return DIAGNOSIS_FALLBACK
  }
}

// ── Text-based disease diagnosis ─────────────────────────────────────────────

const TEXT_DIAGNOSIS_SYSTEM_INSTRUCTION =
  'You are a senior plant pathologist. ' +
  'You assist smallholder farmers in India. ' +
  'A farmer will describe their crop issue in plain language. ' +
  'The input is derived from speech-to-text and may contain minor transcription errors ' +
  '(e.g., "Mike" instead of "My", "mite" instead of "my", misspelled crop names). ' +
  'Ignore spelling mistakes and focus on the agricultural meaning. ' +
  'Based on the description alone, provide your best diagnosis. ' +
  'Be conservative with your confidence score — text descriptions ' +
  'are inherently less reliable than images.'

/**
 * Build the prompt for a text-only diagnosis from a farmer's description.
 */
function buildTextDiagnosisPrompt(description: string, targetLangName: string = 'English'): string {
  return [
    'A farmer described their crop issue (transcribed from speech — minor errors possible):',
    '',
    `"${description}"`,
    '',
    'Focus on the agricultural meaning. Ignore minor spelling or transcription errors.',
    '',
    'Score CONSERVATIVELY. Lower your confidence if:',
    '- the description is vague',
    '- multiple diseases are plausible',
    '- key details (crop type, duration, spread) are missing.',
    '',
    `You MUST respond and write all text fields (diagnosis, treatment_advice) entirely in the ${targetLangName} language.`,
    'Respond with ONLY valid JSON (no markdown, no code fences, no commentary) in exactly this shape:',
    `{"diagnosis": "<disease name or condition in ${targetLangName}>", "confidence_score": <number between 0 and 1>, "treatment_advice": "<2-3 sentences in ${targetLangName}, use locally available remedies like neem, urea, fungicide etc.>" }`,
  ].join('\n')
}

/**
 * Diagnose a plant disease from a farmer's text description using Gemini.
 *
 * Always resolves — never throws. On any failure it returns
 * {@link DIAGNOSIS_FALLBACK} with `error: "ai_unavailable"`.
 */
export async function getDiseaseDiagnosisFromText(
  description: string,
  targetLang: string = 'en',
): Promise<DiseaseDiagnosis> {
  if (!description.trim()) {
    return {
      diagnosis: 'Unable to determine',
      confidence_score: 0,
      treatment_advice: 'Please consult local agricultural officer.',
    }
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return DIAGNOSIS_FALLBACK

  const langMeta = getLanguageMeta(targetLang as LanguageCode)
  const targetLangName = langMeta ? langMeta.englishLabel : 'English'

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: TEXT_DIAGNOSIS_SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    })

    const prompt = buildTextDiagnosisPrompt(description, targetLangName)

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Gemini request timed out.')),
          REQUEST_TIMEOUT_MS,
        ),
      ),
    ])

    const text = result.response.text()

    let parsed: unknown
    try {
      parsed = JSON.parse(stripCodeFences(text))
    } catch (parseErr) {
      console.error('JSON parse error in text diagnosis:', parseErr, 'Raw:', text)
      return DIAGNOSIS_FALLBACK
    }

    const normalized = normalizeDiagnosisOutput(parsed)
    if (!normalized) {
      console.error('Normalization failed for text diagnosis output:', parsed)
      return DIAGNOSIS_FALLBACK
    }

    return normalized
  } catch (err) {
    console.error('Gemini SDK error in getDiseaseDiagnosisFromText:', err)
    return DIAGNOSIS_FALLBACK
  }
}
