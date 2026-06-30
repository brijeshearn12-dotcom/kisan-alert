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

/** Shape returned to callers. `error` is only present on the fallback path. */
export interface CropRecommendation {
  crop_name: string
  reasoning: string
  confidence_score: number
  error?: string
}

/** Weather context the model uses to reason about the recommendation. */
export interface WeatherSummary {
  averageTemperature: number
  expectedRainfall: number
  isDrySpell: boolean
}

const MODEL_NAME = 'gemini-2.0-flash'

/** How long we wait for Gemini before giving up and using the fallback. */
const REQUEST_TIMEOUT_MS = 15_000

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
  season: string,
  viableCrops: string[],
  weatherSummary: WeatherSummary,
): string {
  return [
    'Recommend the single best crop for a smallholder farmer based on the data below.',
    '',
    `District: ${districtName}, Maharashtra, India`,
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
    'Respond with ONLY valid JSON (no markdown, no code fences, no commentary) in exactly this shape:',
    '{"crop_name": "<one crop from the list>", "reasoning": "<2-3 simple sentences>", "confidence_score": <number between 0 and 1>}',
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

  return { crop_name: matchedCrop, reasoning, confidence_score }
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
  season: string,
  viableCrops: string[],
  weatherSummary: WeatherSummary,
): Promise<CropRecommendation> {
  if (viableCrops.length === 0) {
    return buildFallback(viableCrops, 'No viable crops were supplied.')
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return buildFallback(viableCrops, 'GEMINI_API_KEY is not configured.')
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
      season,
      viableCrops,
      weatherSummary,
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
      return buildFallback(
        viableCrops,
        'Gemini returned a response that was not valid JSON.',
      )
    }

    const normalized = normalizeModelOutput(parsed, viableCrops)
    if (!normalized) {
      return buildFallback(
        viableCrops,
        'Gemini returned a malformed or out-of-list recommendation.',
      )
    }

    return normalized
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Gemini error.'
    return buildFallback(viableCrops, message)
  }
}
