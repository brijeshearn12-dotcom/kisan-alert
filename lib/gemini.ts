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
export interface RankedCrop {
  cropName: string
  suitabilityScore: number // Whole number 0-100 representing suitability %
  profitPotential: 'High' | 'Medium' | 'Low'
  riskLevel: 'Low' | 'Medium' | 'High'
  primaryReasons: string[]
  summary: string
  fertilization_tip: string
  irrigation_advice: string
}

export interface CropRecommendation {
  bestCrop: RankedCrop
  alternatives: RankedCrop[]
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
  const bestCropName = viableCrops[0] ?? 'No crop available'
  const alt1Name = viableCrops[1] ?? (viableCrops[0] ?? 'No crop available')
  const alt2Name = viableCrops[2] ?? (viableCrops[0] ?? 'No crop available')

  return {
    bestCrop: {
      cropName: bestCropName,
      suitabilityScore: 80,
      profitPotential: 'Medium',
      riskLevel: 'Medium',
      primaryReasons: ['AI recommendation unavailable. Safest seasonal fallback choice.'],
      summary: FALLBACK_REASONING,
      fertilization_tip:
        'Apply a small, balanced dose of Urea or DAP as per your local practice once the AI service is back.',
      irrigation_advice:
        'Water your field based on soil moisture and the current weather until detailed advice is available.',
    },
    alternatives: [
      {
        cropName: alt1Name,
        suitabilityScore: 70,
        profitPotential: 'Medium',
        riskLevel: 'Medium',
        primaryReasons: ['Alternative seasonal fallback crop.'],
        summary: 'Safe secondary fallback choice.',
        fertilization_tip: 'Apply standard fertilizer.',
        irrigation_advice: 'Water standardly.',
      },
      {
        cropName: alt2Name,
        suitabilityScore: 60,
        profitPotential: 'Medium',
        riskLevel: 'Medium',
        primaryReasons: ['Alternative seasonal fallback crop.'],
        summary: 'Safe tertiary fallback choice.',
        fertilization_tip: 'Apply standard fertilizer.',
        irrigation_advice: 'Water standardly.',
      },
    ],
    error: errorMessage,
  }
}

/**
 * Construct the user prompt to return 3 distinct ranked crops.
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
    'Recommend the top 3 best crops for a smallholder farmer in order of suitability (rank #1, #2, #3) based on the data below.',
    '',
    `District: ${districtName}, State: ${stateName}, Country: India`,
    `Soil type: ${soilType}`,
    `Season: ${season}`,
    `Average temperature (next 7 days): ${weatherSummary.averageTemperature} °C`,
    `Expected rainfall (next 7 days): ${weatherSummary.expectedRainfall} mm`,
    `Dry spell expected: ${weatherSummary.isDrySpell ? 'yes' : 'no'}`,
    '',
    'You MUST choose exactly 3 different crops from this list of viable crops. Do not suggest crops outside this list:',
    viableCrops.map((crop) => `- ${crop}`).join('\n'),
    '',
    'Evaluate suitability using current inputs (weather, soil type, estimated soil moisture, vegetation, season, district).',
    `You MUST respond and write all text fields (primaryReasons, summary, fertilization_tip, irrigation_advice) entirely in the ${targetLangName} language.`,
    'Respond with ONLY valid JSON (no markdown, no code fences, no commentary) in exactly this schema structure:',
    '{',
    '  "bestCrop": {',
    '    "cropName": "<name of the rank #1 crop>",',
    '    "suitabilityScore": <whole number 0-100 representing suitability %>,',
    '    "profitPotential": "<High, Medium, or Low based on suitability, growing conditions, and agronomic practicality>",',
    '    "riskLevel": "<Low, Medium, or High based on current environmental conditions>",',
    '    "primaryReasons": ["<reason 1 in target language>", "<reason 2 in target language>", "<reason 3 in target language>"],',
    '    "summary": "<one sentence in target language, max 2 sentences, describing suitability>",',
    '    "fertilization_tip": "<one simple, low-cost fertilizer advice sentence in target language>",',
    '    "irrigation_advice": "<one irrigation instruction sentence in target language based on crop stage and weather>"',
    '  },',
    '  "alternatives": [',
    '    {',
    '      "cropName": "<name of the rank #2 crop>",',
    '      "suitabilityScore": <whole number 0-100 representing suitability %>,',
    '      "profitPotential": "<High, Medium, or Low>",',
    '      "riskLevel": "<Low, Medium, or High>",',
    '      "primaryReasons": ["<reason 1 in target language>"],',
    '      "summary": "<one sentence in target language, max 2 sentences>",',
    '      "fertilization_tip": "<one simple fertilizer advice sentence in target language>",',
    '      "irrigation_advice": "<one irrigation advice sentence in target language>"',
    '    },',
    '    {',
    '      "cropName": "<name of the rank #3 crop>",',
    '      "suitabilityScore": <whole number 0-100 representing suitability %>,',
    '      "profitPotential": "<High, Medium, or Low>",',
    '      "riskLevel": "<Low, Medium, or High>",',
    '      "primaryReasons": ["<reason 1 in target language>"],',
    '      "summary": "<one sentence in target language, max 2 sentences>",',
    '      "fertilization_tip": "<one simple fertilizer advice sentence in target language>",',
    '      "irrigation_advice": "<one irrigation advice sentence in target language>"',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- profitPotential MUST be exactly "High", "Medium", or "Low".',
    '- riskLevel MUST be exactly "Low", "Medium", or "High".',
    '- primaryReasons should be 1-3 extremely concise bullet points (max 10 words per bullet).',
    '- summary should be a concise description of suitability, max 2 sentences.',
    '- fertilization_tip should be exactly ONE sentence, recommending a low-cost, common fertilizer in India (like Urea/DAP).',
    '- irrigation_advice should be exactly ONE sentence, recommending practical watering based on crop/weather.',
    `- All text values except cropName must be written in the ${targetLangName} language.`
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

function normalizeRankedCrop(
  raw: unknown,
  viableCrops: string[],
  defaultName: string,
): RankedCrop {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const cropName = typeof record.cropName === 'string' && record.cropName.trim() !== ''
    ? record.cropName.trim()
    : defaultName

  // Enforce constraint
  const matchedCrop = viableCrops.find(
    (c) => c.toLowerCase() === cropName.toLowerCase()
  ) || defaultName

  const suitabilityScore = typeof record.suitabilityScore === 'number' && Number.isFinite(record.suitabilityScore)
    ? Math.min(100, Math.max(0, Math.round(record.suitabilityScore)))
    : 75

  let profitPotential: 'High' | 'Medium' | 'Low' = 'Medium'
  if (typeof record.profitPotential === 'string' && ['High', 'Medium', 'Low'].includes(record.profitPotential)) {
    profitPotential = record.profitPotential as 'High' | 'Medium' | 'Low'
  }

  let riskLevel: 'Low' | 'Medium' | 'High' = 'Medium'
  if (typeof record.riskLevel === 'string' && ['Low', 'Medium', 'High'].includes(record.riskLevel)) {
    riskLevel = record.riskLevel as 'Low' | 'Medium' | 'High'
  }

  const primaryReasons: string[] = Array.isArray(record.primaryReasons)
    ? record.primaryReasons.filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    : ['Suitable for current environmental conditions.']

  const summary = typeof record.summary === 'string' && record.summary.trim() !== ''
    ? record.summary.trim()
    : 'Recommended based on local soil and weather.'

  const fertilization_tip = typeof record.fertilization_tip === 'string' && record.fertilization_tip.trim() !== ''
    ? record.fertilization_tip.trim()
    : 'Apply common fertilizer according to local practice.'

  const irrigation_advice = typeof record.irrigation_advice === 'string' && record.irrigation_advice.trim() !== ''
    ? record.irrigation_advice.trim()
    : 'Water field according to crop and weather.'

  return {
    cropName: matchedCrop,
    suitabilityScore,
    profitPotential,
    riskLevel,
    primaryReasons,
    summary,
    fertilization_tip,
    irrigation_advice,
  }
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
  const rawBest = record.bestCrop
  const rawAlts = record.alternatives

  if (!rawBest) return null

  const bestCrop = normalizeRankedCrop(rawBest, viableCrops, viableCrops[0] ?? 'No crop available')

  // Find remaining viable crops for fallback padding
  const remainingViable = viableCrops.filter(
    (c) => c.toLowerCase() !== bestCrop.cropName.toLowerCase()
  )

  const alternatives: RankedCrop[] = []
  if (Array.isArray(rawAlts)) {
    for (let i = 0; i < rawAlts.length; i++) {
      const defaultName = remainingViable[i] ?? viableCrops[0] ?? 'No crop available'
      alternatives.push(normalizeRankedCrop(rawAlts[i], viableCrops, defaultName))
    }
  }

  // Ensure we have exactly 2 alternatives
  while (alternatives.length < 2) {
    const defaultName = remainingViable[alternatives.length] ?? viableCrops[0] ?? 'No crop available'
    alternatives.push(normalizeRankedCrop(null, viableCrops, defaultName))
  }

  return {
    bestCrop,
    alternatives: alternatives.slice(0, 2),
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
    fallback.bestCrop.irrigation_advice += suffix
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
    fallback.bestCrop.irrigation_advice += suffix
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
      fallback.bestCrop.irrigation_advice += suffix
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
      fallback.bestCrop.irrigation_advice += suffix
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
    normalized.bestCrop.irrigation_advice += suffix
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
    fallback.bestCrop.irrigation_advice += suffix
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
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  spread_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  immediate_action?: string | null
  organic_treatment?: string | null
  chemical_treatment?: string | null
  prevention?: string | null
  monitoring?: string | null
  error?: string
}

/** Every failure path returns exactly this object (per the API contract). */
const DIAGNOSIS_FALLBACK: DiseaseDiagnosis = {
  diagnosis: null,
  confidence_score: 0,
  treatment_advice: null,
  severity: null,
  spread_risk: null,
  immediate_action: null,
  organic_treatment: null,
  chemical_treatment: null,
  prevention: null,
  monitoring: null,
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
    `You MUST respond and write all text fields (diagnosis, treatment_advice, immediate_action, organic_treatment, chemical_treatment, prevention, monitoring) entirely in the ${targetLangName} language.`,
    'Respond with ONLY valid JSON (no markdown, no code fences, no commentary) in exactly this shape:',
    `{"diagnosis": "<disease name or condition in ${targetLangName}>", "confidence_score": <number between 0 and 1>, "treatment_advice": "<overall summary sentence in ${targetLangName}>", "severity": "<LOW, MEDIUM, or HIGH>", "spread_risk": "<LOW, MEDIUM, or HIGH>", "immediate_action": "<one short sentence of urgent action in ${targetLangName} under 10 words>", "organic_treatment": "<concise organic remedy in ${targetLangName} under 15 words>", "chemical_treatment": "<concise chemical fungicide/remedy in ${targetLangName} under 15 words>", "prevention": "<one concise preventative farming tip in ${targetLangName} under 15 words>", "monitoring": "<one concise inspection instruction in ${targetLangName} under 15 words>" }`,
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
  const rawSeverity = record.severity
  const rawSpreadRisk = record.spread_risk || record.spreadRisk
  const rawImmediateAction = record.immediate_action || record.immediateAction
  const rawOrganic = record.organic_treatment || record.organicTreatment
  const rawChemical = record.chemical_treatment || record.chemicalTreatment
  const rawPrevention = record.prevention
  const rawMonitoring = record.monitoring

  if (typeof rawDiagnosis !== 'string' || rawDiagnosis.trim() === '') return null
  if (typeof rawTreatment !== 'string' || rawTreatment.trim() === '') return null

  // Coerce + clamp the score into [0, 1]; default to a conservative 0.5.
  const numericScore =
    typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : 0.5
  const confidence_score = Math.min(1, Math.max(0, numericScore))

  // Validate severity
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | null = null
  if (typeof rawSeverity === 'string') {
    const sevUpper = rawSeverity.toUpperCase().trim()
    if (sevUpper === 'LOW' || sevUpper === 'MEDIUM' || sevUpper === 'HIGH') {
      severity = sevUpper
    }
  }

  // Validate spread risk
  let spread_risk: 'LOW' | 'MEDIUM' | 'HIGH' | null = null
  if (typeof rawSpreadRisk === 'string') {
    const riskUpper = rawSpreadRisk.toUpperCase().trim()
    if (riskUpper === 'LOW' || riskUpper === 'MEDIUM' || riskUpper === 'HIGH') {
      spread_risk = riskUpper
    }
  }

  // Validate immediate action
  let immediate_action: string | null = null
  if (typeof rawImmediateAction === 'string' && rawImmediateAction.trim() !== '') {
    immediate_action = rawImmediateAction.trim()
  }

  // Validate structured fields
  let organic_treatment: string | null = null
  if (typeof rawOrganic === 'string' && rawOrganic.trim() !== '') {
    organic_treatment = rawOrganic.trim()
  }

  let chemical_treatment: string | null = null
  if (typeof rawChemical === 'string' && rawChemical.trim() !== '') {
    chemical_treatment = rawChemical.trim()
  }

  let prevention: string | null = null
  if (typeof rawPrevention === 'string' && rawPrevention.trim() !== '') {
    prevention = rawPrevention.trim()
  }

  let monitoring: string | null = null
  if (typeof rawMonitoring === 'string' && rawMonitoring.trim() !== '') {
    monitoring = rawMonitoring.trim()
  }

  return {
    diagnosis: rawDiagnosis.trim(),
    confidence_score,
    treatment_advice: rawTreatment.trim(),
    severity,
    spread_risk,
    immediate_action,
    organic_treatment,
    chemical_treatment,
    prevention,
    monitoring,
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
function buildTextDiagnosisPrompt(description: string, targetLangName: string = 'English', cropType?: string): string {
  const cropLine =
    cropType && cropType.trim() !== ''
      ? `The crop under diagnosis is: ${cropType.trim()}.`
      : 'The crop type is not specified; infer it from the description if possible.'

  return [
    cropLine,
    '',
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
    `You MUST respond and write all text fields (diagnosis, treatment_advice, immediate_action, organic_treatment, chemical_treatment, prevention, monitoring) entirely in the ${targetLangName} language.`,
    'Respond with ONLY valid JSON (no markdown, no code fences, no commentary) in exactly this shape:',
    `{"diagnosis": "<disease name or condition in ${targetLangName}>", "confidence_score": <number between 0 and 1>, "treatment_advice": "<overall summary sentence in ${targetLangName}>", "severity": "<LOW, MEDIUM, or HIGH>", "spread_risk": "<LOW, MEDIUM, or HIGH>", "immediate_action": "<one short sentence of urgent action in ${targetLangName} under 10 words>", "organic_treatment": "<concise organic remedy in ${targetLangName} under 15 words>", "chemical_treatment": "<concise chemical fungicide/remedy in ${targetLangName} under 15 words>", "prevention": "<one concise preventative farming tip in ${targetLangName} under 15 words>", "monitoring": "<one concise inspection instruction in ${targetLangName} under 15 words>" }`,
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
  cropType?: string,
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

    const prompt = buildTextDiagnosisPrompt(description, targetLangName, cropType)

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
