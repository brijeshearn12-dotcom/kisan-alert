/**
 * confidence.ts
 * -----------------------------------------------------------------------------
 * Shared presentation for a 0–1 confidence score. Maps a score to a small set
 * of Tailwind class tokens (badge, text, ring, progress bar) so every surface
 * that shows a recommendation confidence looks identical.
 * -----------------------------------------------------------------------------
 */

export interface ConfidenceStyle {
  label: string
  dot: string
  text: string
  bg: string
  ring: string
  bar: string
}

/** Green (high) → amber (moderate) → rose (low), matching the app accent scale. */
export function confidenceStyle(score: number): ConfidenceStyle {
  if (score >= 0.8) {
    return {
      label: 'High confidence',
      dot: 'bg-primary-green',
      text: 'text-primary-green',
      bg: 'bg-primary-green/5',
      ring: 'ring-primary-green/20',
      bar: 'bg-primary-green',
    }
  }
  if (score >= 0.6) {
    return {
      label: 'Moderate confidence',
      dot: 'bg-accent-amber',
      text: 'text-accent-amber',
      bg: 'bg-accent-amber/5',
      ring: 'ring-accent-amber/20',
      bar: 'bg-accent-amber',
    }
  }
  return {
    label: 'Low confidence',
    dot: 'bg-rose-500',
    text: 'text-rose-700',
    bg: 'bg-rose-50',
    ring: 'ring-rose-600/20',
    bar: 'bg-rose-500',
  }
}
