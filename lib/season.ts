/**
 * season.ts
 * -----------------------------------------------------------------------------
 * The project's single source of truth for deriving the current agronomic
 * season from a calendar month. Used by the recommendation engine (server) and
 * the vegetation index (client) so the two never drift.
 * -----------------------------------------------------------------------------
 */

/** The three agronomic seasons the app reasons about. */
export type Season = 'kharif' | 'rabi' | 'summer'

/** Derive the current agronomic season from the month (1 = Jan ... 12 = Dec). */
export function getSeasonForMonth(month: number): Season {
  if (month >= 6 && month <= 9) return 'kharif' // June–September
  if (month >= 10 || month <= 3) return 'rabi' // October–March
  return 'summer' // April–May
}

/** Human-friendly label for a season, for UI display. */
export function seasonLabel(season: Season): string {
  switch (season) {
    case 'kharif':
      return 'Kharif (Monsoon)'
    case 'rabi':
      return 'Rabi (Winter)'
    case 'summer':
      return 'Summer'
  }
}
