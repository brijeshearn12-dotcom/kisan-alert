/**
 * Speech-locale mapping — the single source of truth for turning a UI language
 * into a BCP-47 locale the voice services (TTS/STT) accept.
 * -----------------------------------------------------------------------------
 * The backend voice APIs (`/api/tts`, `/api/stt`, `lib/googleCloud.ts`) only
 * support four Indian locales today. The UI dictionary supports eight languages,
 * so anything without a dedicated voice falls back to English rather than being
 * mispronounced by another language's voice.
 *
 * Keep this the ONLY place that maps `LanguageCode -> speech locale`; both the
 * recommendation page and any future voice-enabled page import from here so the
 * mapping never gets duplicated or drifts.
 */

import type { LanguageCode } from '@/lib/i18n/translations'

/** Locales the Google Cloud voice services are configured for. */
export type SpeechLocale = 'en-IN' | 'hi-IN' | 'te-IN' | 'mr-IN'

/** Languages that have a dedicated voice; everything else uses English. */
const SPEECH_LOCALES: Partial<Record<LanguageCode, SpeechLocale>> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  mr: 'mr-IN',
}

/**
 * Resolve a UI language to a voice locale, defaulting to English for languages
 * without dedicated voice support (gu, kn, ta, bn today).
 */
export function toSpeechLocale(language: LanguageCode): SpeechLocale {
  return SPEECH_LOCALES[language] ?? 'en-IN'
}
