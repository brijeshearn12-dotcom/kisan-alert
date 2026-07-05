/**
 * vegetationIndex.ts
 * -----------------------------------------------------------------------------
 * Pure business logic for the Vegetation & Moisture Index — a computed advisory
 * that estimates how healthy a field's vegetation is likely to be, from live
 * 7-day rainfall, a manually-entered soil moisture reading, and the season.
 *
 * IMPORTANT: this file is intentionally free of React, JSX, hooks, and network
 * calls. Every export is a deterministic pure function so the scoring can be
 * unit-tested in isolation and reused on both the client and the server.
 *
 * This is NOT satellite imagery — it is a transparent, rules-based estimate.
 * -----------------------------------------------------------------------------
 */
import type { Season } from '@/lib/season'

/** Coarse condition buckets the score maps onto. */
export type VegetationStatus = 'parched' | 'stressed' | 'healthy' | 'saturated'

/** How trustworthy the estimate is, based on which inputs were available. */
export type Confidence = 'high' | 'medium' | 'low'

/** Direction of the expected day-over-day change. */
export type Trend = 'improving' | 'declining' | 'stable'

/** Per-input point contributions that sum to the final score. */
export interface IndexBreakdown {
  soilContribution: number
  rainfallContribution: number
  seasonContribution: number
}

/** The computed index returned by {@link computeIndex}. */
export interface VegetationIndex {
  /** Whole-number score in the range 0–100. */
  score: number
  status: VegetationStatus
  breakdown: IndexBreakdown
}

/** Tomorrow's projected outlook returned by {@link computeTomorrowOutlook}. */
export interface TomorrowOutlook {
  score: number
  status: VegetationStatus
  trend: Trend
  explanation: string
}

// ── Model constants ──────────────────────────────────────────────────────────
// The three inputs contribute a fixed maximum number of points. They sum to 100
// so the score reads naturally as a 0–100 index.

const SOIL_WEIGHT = 50
const RAINFALL_WEIGHT = 35

/** Weekly rainfall (mm) at or above which the rainfall input is "full". */
const RAINFALL_FULL_MM = 60

/** Fixed points awarded for the growing potential of each season. */
const SEASON_POINTS: Record<Season, number> = {
  kharif: 15, // monsoon — peak growing conditions
  rabi: 11, // winter cropping
  summer: 7, // hot, low natural moisture
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp a value into the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Map a 0–100 score onto a coarse condition bucket. */
export function statusForScore(score: number): VegetationStatus {
  if (score < 30) return 'parched'
  if (score < 55) return 'stressed'
  if (score < 85) return 'healthy'
  return 'saturated'
}

// ── Core scoring ─────────────────────────────────────────────────────────────

/**
 * Compute the Vegetation & Moisture Index.
 *
 * Deterministic and side-effect-free: the same inputs always produce the same
 * output. The score is the sum of three transparent contributions, each capped
 * at its weight, so the breakdown always explains exactly how the score arose.
 *
 * @param soilMoisture Manually-entered soil moisture, 0–100 (%).
 * @param rainfallMm7d Total expected/observed rainfall over 7 days, in mm.
 * @param season       Current agronomic season.
 */
export function computeIndex(
  soilMoisture: number,
  rainfallMm7d: number,
  season: Season,
): VegetationIndex {
  const soil = clamp(soilMoisture, 0, 100)
  const rainfall = Math.max(0, rainfallMm7d)

  const soilContribution = Math.round((soil / 100) * SOIL_WEIGHT)
  const rainfallContribution = Math.round(
    (clamp(rainfall, 0, RAINFALL_FULL_MM) / RAINFALL_FULL_MM) * RAINFALL_WEIGHT,
  )
  const seasonContribution = SEASON_POINTS[season]

  const score = clamp(
    soilContribution + rainfallContribution + seasonContribution,
    0,
    100,
  )

  return {
    score,
    status: statusForScore(score),
    breakdown: {
      soilContribution,
      rainfallContribution,
      seasonContribution,
    },
  }
}

// ── Confidence ───────────────────────────────────────────────────────────────

/**
 * Derive how confident the estimate is from which inputs were available.
 *
 * - high   — rainfall, season, and soil moisture are all present.
 * - medium — rainfall and soil moisture, but the season is unknown.
 * - low    — only soil moisture (no live rainfall).
 */
export function computeConfidence(inputs: {
  hasRainfall: boolean
  hasSeason: boolean
  hasSoil: boolean
}): Confidence {
  const { hasRainfall, hasSeason, hasSoil } = inputs
  if (hasRainfall && hasSeason && hasSoil) return 'high'
  if (hasRainfall && hasSoil) return 'medium'
  return 'low'
}

// ── Tomorrow outlook ─────────────────────────────────────────────────────────

/** Rain lifts soil moisture; a dry day slowly draws it down. */
function projectSoilMoisture(soilMoisture: number, tomorrowRainMm: number): number {
  const delta =
    tomorrowRainMm >= 1
      ? Math.min(tomorrowRainMm * 1.2, 18) // meaningful rain recharges the soil
      : -4 // a dry day evaporates a little moisture
  return clamp(soilMoisture + delta, 0, 100)
}

/**
 * Project tomorrow's index from tonight/tomorrow's expected rainfall.
 *
 * Holds the 7-day rainfall window and season fixed and only nudges soil
 * moisture, so the outlook isolates the single most actionable signal a farmer
 * has for the next day: whether rain is coming.
 */
export function computeTomorrowOutlook(
  soilMoisture: number,
  rainfallMm7d: number,
  season: Season,
  tomorrowRainMm: number,
): TomorrowOutlook {
  const today = computeIndex(soilMoisture, rainfallMm7d, season)
  const projectedSoil = projectSoilMoisture(soilMoisture, tomorrowRainMm)
  const tomorrow = computeIndex(projectedSoil, rainfallMm7d, season)

  const diff = tomorrow.score - today.score
  const trend: Trend = diff >= 3 ? 'improving' : diff <= -3 ? 'declining' : 'stable'

  let explanation: string
  if (trend === 'improving') {
    explanation =
      'Rain expected tomorrow should raise soil moisture and improve conditions.'
  } else if (trend === 'declining') {
    explanation =
      'Dry weather tomorrow may lower soil moisture and stress the crop.'
  } else {
    explanation = 'Conditions are expected to stay steady tomorrow.'
  }

  return {
    score: tomorrow.score,
    status: tomorrow.status,
    trend,
    explanation,
  }
}
