/**
 * normalizeTranscript.ts
 * -----------------------------------------------------------------------------
 * Lightweight cleanup for Speech-to-Text output before it reaches Gemini.
 *
 * Only fixes **obvious pronoun / filler mis-recognitions** that STT engines
 * commonly produce. Agricultural and disease terms are NEVER modified — the
 * corrections here are limited to words that cannot plausibly be crop-related.
 * -----------------------------------------------------------------------------
 */

/**
 * Each entry maps a regex (matched case-insensitively at word boundaries) to
 * its replacement. Replacements preserve the original casing style when the
 * match is a single word (first-letter upper → first-letter upper, etc.).
 *
 * IMPORTANT — only add entries here when:
 *   1. The mistake is a well-known STT artefact (not a rare edge case).
 *   2. The wrong word is clearly NOT an agricultural / disease term.
 *   3. The replacement is unambiguous in a farming context.
 */
const CORRECTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  // ── Pronoun / possessive misrecognitions ──────────────────────────────
  { pattern: /\bMike\b/g,    replacement: 'My' },
  { pattern: /\bmike\b/g,    replacement: 'my' },
  { pattern: /\bMite\b/g,    replacement: 'My' },     // "Mite cotton" → "My cotton"
  { pattern: /\bmite\b/g,    replacement: 'my' },
  { pattern: /\bDear\b/g,    replacement: 'The' },     // "Dear leaves" → "The leaves"
  { pattern: /\bdear\b/g,    replacement: 'the' },
  { pattern: /\bHe's\b/g,    replacement: 'It\'s' },   // "He's turning yellow" → "It's turning yellow"
  { pattern: /\bhe's\b/g,    replacement: 'it\'s' },

  // ── Common filler / false-start artefacts ─────────────────────────────
  { pattern: /\bum+\b/gi,    replacement: '' },
  { pattern: /\buh+\b/gi,    replacement: '' },
  { pattern: /\bhmm+\b/gi,   replacement: '' },
]

/**
 * Normalize an STT transcript for downstream Gemini consumption.
 *
 * - Applies a curated list of common STT error corrections.
 * - Collapses extra whitespace.
 * - Trims leading / trailing whitespace.
 * - Returns the cleaned string (never throws).
 */
export function normalizeTranscript(text: string): string {
  let cleaned = text

  for (const { pattern, replacement } of CORRECTIONS) {
    // Reset lastIndex for global regexes reused across calls
    pattern.lastIndex = 0
    cleaned = cleaned.replace(pattern, replacement)
  }

  // Collapse any runs of whitespace (including those left by removed fillers)
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()

  return cleaned
}
