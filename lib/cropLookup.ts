/**
 * cropLookup.ts
 * -----------------------------------------------------------------------------
 * Static crop-recommendation lookup for Kisan Alert (Maharashtra only).
 *
 * Maps every `SoilType x Season` combination to the crops most commonly and
 * profitably grown on that pairing, ordered from most to least common.
 *
 * Data source: curated from Indian agronomic best practices and the crops
 * actually cultivated across Maharashtra's agro-climatic zones. No invented
 * crops -- every entry is a real, economically relevant Maharashtra crop.
 * -----------------------------------------------------------------------------
 */

/**
 * The canonical lookup.
 *
 * Keys follow the `${soil}-${season}` convention using hyphenated, lowercase
 * tokens (e.g. `black-cotton-rabi`). `as const` makes both the keys and the
 * crop arrays deeply `readonly`, so the table cannot be mutated at runtime and
 * its literal shape is preserved for type inference.
 */
export const cropLookup = {
  // ── Kharif season (June–September) ─────────────────────────────────────────
  'sandy-kharif': [
    'Bajra (Pearl Millet)',
    'Groundnut',
    'Green Gram (Moong)',
    'Sesame (Til)',
    'Castor',
    'Cowpea',
  ],
  'loamy-kharif': [
    'Soybean',
    'Cotton',
    'Maize',
    'Rice (Paddy)',
    'Tur (Pigeon Pea)',
    'Sugarcane',
    'Green Gram (Moong)',
  ],
  'clayey-kharif': [
    'Rice (Paddy)',
    'Soybean',
    'Cotton',
    'Sugarcane',
    'Tur (Pigeon Pea)',
    'Sorghum (Jowar)',
  ],
  'black-cotton-kharif': [
    'Cotton',
    'Soybean',
    'Tur (Pigeon Pea)',
    'Sorghum (Jowar)',
    'Sugarcane',
    'Maize',
  ],

  // ── Rabi season (October–March) ─────────────────────────────────────────────
  'sandy-rabi': [
    'Onion',
    'Wheat',
    'Mustard',
    'Watermelon',
    'Muskmelon',
    'Coriander',
  ],
  'loamy-rabi': [
    'Wheat',
    'Chickpea (Gram)',
    'Onion',
    'Sorghum (Rabi Jowar)',
    'Maize',
    'Safflower',
  ],
  'clayey-rabi': [
    'Wheat',
    'Chickpea (Gram)',
    'Sorghum (Rabi Jowar)',
    'Safflower',
    'Linseed',
  ],
  'black-cotton-rabi': [
    'Sorghum (Rabi Jowar)',
    'Chickpea (Gram)',
    'Wheat',
    'Safflower',
    'Sunflower',
    'Linseed',
  ],

  // ── Summer season (April–May): short-duration, heat-tolerant crops ──────────
  'sandy-summer': [
    'Watermelon',
    'Muskmelon',
    'Cucumber',
    'Cowpea',
    'Groundnut',
    'Sesame (Til)',
  ],
  'loamy-summer': [
    'Moong (Green Gram)',
    'Maize',
    'Sunflower',
    'Cucumber',
    'Bitter Gourd',
    'Bottle Gourd',
  ],
  'clayey-summer': [
    'Moong (Green Gram)',
    'Urad (Black Gram)',
    'Okra (Bhindi)',
    'Bitter Gourd',
    'Cucumber',
    'Sorghum (Jowar)',
  ],
  'black-cotton-summer': [
    'Moong (Green Gram)',
    'Urad (Black Gram)',
    'Sunflower',
    'Sesame (Til)',
    'Okra (Bhindi)',
    'Watermelon',
  ],

  // ── Red soil zones (Pan-India) ──────────────────────────────────────────────
  'red-kharif': [
    'Ragi (Finger Millet)',
    'Groundnut',
    'Red Gram (Tur)',
    'Rice (Paddy)',
    'Castor',
    'Cotton',
  ],
  'red-rabi': [
    'Horse Gram',
    'Chickpea (Gram)',
    'Sorghum (Jowar)',
    'Mustard',
    'Sesame',
  ],
  'red-summer': [
    'Green Gram (Moong)',
    'Cowpea',
    'Sesame (Til)',
    'Watermelon',
  ],

  // ── Laterite soil zones (Pan-India) ─────────────────────────────────────────
  'laterite-kharif': [
    'Rice (Paddy)',
    'Ragi (Finger Millet)',
    'Tapioca',
    'Cashew Nut',
    'Groundnut',
  ],
  'laterite-rabi': [
    'Horse Gram',
    'Black Gram (Urad)',
    'Sesame',
    'Linseed',
  ],
  'laterite-summer': [
    'Sweet Potato',
    'Cowpea',
    'Cucumber',
  ],
} as const

/** Union of every valid lookup key, derived from the data -- never hand-maintained. */
export type CropLookupKey = keyof typeof cropLookup

/** Shared empty result so the "miss" path allocates nothing on each call. */
const NO_CROPS: readonly string[] = []

/**
 * Normalize a single user-supplied token (soil type or season).
 *
 * - trims surrounding whitespace
 * - lowercases (capitalization-insensitive)
 * - collapses any run of spaces/underscores into a single hyphen
 *
 * This lets callers pass "Black Cotton", "black_cotton", or " BLACK  COTTON "
 * and still resolve to the canonical `black-cotton` token.
 */
const normalizeToken = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s_]+/g, '-')

/** Type guard: narrows an arbitrary string to a known lookup key. */
const isCropLookupKey = (key: string): key is CropLookupKey =>
  Object.prototype.hasOwnProperty.call(cropLookup, key)

/**
 * Return the viable crops for a `soilType x season` pairing.
 *
 * Input is normalized (trimmed, lowercased, whitespace/underscores to hyphen),
 * so it tolerates the soil ids used elsewhere in the app (e.g. `black_cotton`)
 * as well as human-friendly labels (e.g. "Black Cotton").
 *
 * @returns the ordered crop list, or an empty array if the pairing is unknown.
 */
export function getViableCrops(
  soilType: string,
  season: string,
): readonly string[] {
  const key = `${normalizeToken(soilType)}-${normalizeToken(season)}`
  return isCropLookupKey(key) ? cropLookup[key] : NO_CROPS
}
