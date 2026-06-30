/**
 * cropLookup.ts
 * -----------------------------------------------------------------------------
 * Static crop-recommendation lookup for Kisan Alert (Maharashtra only).
 *
 * Maps every `SoilType × Season` combination to the crops most commonly and
 * profitably grown on that pairing, ordered from most to least common.
 *
 * Data source: curated from Indian agronomic best practices and the crops
 * actually cultivated across Maharashtra's agro-climatic zones. No invented
 * crops — every entry is a real, economically relevant Maharashtra crop.
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
  'sandy-kharif': [
    'Bajra (Pearl Millet)',
    'Groundnut',
    'Green Gram (Moong)',
    'Sesame (Til)',
    'Castor',
    'Cowpea',
  ],
  'sandy-rabi': [
    'Onion',
    'Wheat',
    'Mustard',
    'Watermelon',
    'Muskmelon',
    'Coriander',
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
  'loamy-rabi': [
    'Wheat',
    'Chickpea (Gram)',
    'Onion',
    'Sorghum (Rabi Jowar)',
    'Maize',
    'Safflower',
  ],
  'clayey-kharif': [
    'Rice (Paddy)',
    'Soybean',
    'Cotton',
    'Sugarcane',
    'Tur (Pigeon Pea)',
    'Sorghum (Jowar)',
  ],
  'clayey-rabi': [
    'Wheat',
    'Chickpea (Gram)',
    'Sorghum (Rabi Jowar)',
    'Safflower',
    'Linseed',
  ],
  'black-cotton-kharif': [
    'Cotton',
    'Soybean',
    'Tur (Pigeon Pea)',
    'Sorghum (Jowar)',
    'Sugarcane',
    'Maize',
  ],
  'black-cotton-rabi': [
    'Sorghum (Rabi Jowar)',
    'Chickpea (Gram)',
    'Wheat',
    'Safflower',
    'Sunflower',
    'Linseed',
  ],
} as const

/** Union of every valid lookup key, derived from the data — never hand-maintained. */
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
 * Return the viable crops for a `soilType × season` pairing.
 *
 * Input is normalized (trimmed, lowercased, whitespace/underscores → hyphen),
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
