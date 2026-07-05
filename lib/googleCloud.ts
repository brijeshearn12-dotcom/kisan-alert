/**
 * googleCloud.ts
 * -----------------------------------------------------------------------------
 * Thin, reusable server-only helpers around three Google Cloud REST APIs:
 * Translation (v2), Text-to-Speech (v1) and Speech-to-Text (v1).
 *
 * Every exported function is TOTAL — it NEVER throws. On any failure (missing
 * key, non-2xx response, malformed JSON, network error) it returns a safe
 * fallback so callers can rely on always getting a usable value.
 *
 * The API key is read from `process.env.GOOGLE_CLOUD_API_KEY` and is used only
 * here on the server. It is never sent to the client and never logged.
 * -----------------------------------------------------------------------------
 */

/** Languages the app can translate into. English is the source/pass-through. */
type TargetLang = 'en' | 'hi' | 'mr' | 'gu' | 'kn' | 'ta' | 'te' | 'bn'

/** BCP-47 voice locales supported by Text-to-Speech in this app. */
type LanguageCode = 'hi-IN' | 'te-IN' | 'mr-IN' | 'en-IN'

/** Read the secret key once per call. Returns undefined when unset. */
function getApiKey(): string | undefined {
  return process.env.GOOGLE_CLOUD_API_KEY
}

/**
 * Translate `text` into `targetLang` using Google Cloud Translation v2.
 *
 * Source language is fixed to English. Returns the original text unchanged when
 * the target is English, when the key is missing, or on ANY failure.
 */
export async function translateText(
  text: string,
  targetLang: TargetLang,
): Promise<string> {
  // No-op for English — the app's source language — so we skip the round-trip.
  if (targetLang === 'en') return text

  const key = getApiKey()
  if (!key) return text

  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          target: targetLang,
          source: 'en',
          format: 'text',
        }),
      },
    )

    if (!response.ok) return text

    // Parse defensively — a 2xx with an unexpected body must not blow up.
    const data = (await response.json()) as {
      data?: { translations?: Array<{ translatedText?: string }> }
    }

    return data?.data?.translations?.[0]?.translatedText ?? text
  } catch {
    // Network / abort / JSON error — fall back to the untranslated text.
    return text
  }
}

/**
 * Synthesize `text` into speech using Google Cloud Text-to-Speech v1.
 *
 * Returns a Base64-encoded MP3 string, or "" when the key is missing or on ANY
 * failure.
 */
export async function synthesizeSpeech(
  text: string,
  languageCode: LanguageCode,
): Promise<string> {
  const key = getApiKey()
  if (!key) return ''

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, ssmlGender: 'FEMALE' },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      },
    )

    if (!response.ok) return ''

    // `audioContent` is the Base64 MP3 payload returned by the API.
    const data = (await response.json()) as { audioContent?: string }

    return data?.audioContent ?? ''
  } catch {
    return ''
  }
}

/**
 * Transcribe Base64-encoded WEBM/Opus audio using Google Cloud Speech-to-Text
 * v1 (synchronous recognize).
 *
 * Primary language defaults to English (Indian accent) with Hindi, Telugu, and
 * Marathi as automatic alternatives. Returns the best transcript, or "" when
 * the key is missing or on ANY failure.
 */
export async function transcribeSpeech(
  audioBase64: string,
  languageCode?: string,
): Promise<string> {
  const key = getApiKey()
  if (!key) return ''

  try {
    // Recorder output from the browser MediaRecorder is 48kHz WEBM_OPUS.
    const config = {
      encoding: 'WEBM_OPUS' as const,
      sampleRateHertz: 48000,
      languageCode: languageCode || 'en-IN',
      alternativeLanguageCodes: ['hi-IN', 'te-IN', 'mr-IN'],
    }

    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          audio: { content: audioBase64 },
        }),
      },
    )

    if (!response.ok) return ''

    const data = (await response.json()) as {
      results?: Array<{ alternatives?: Array<{ transcript?: string }> }>
    }

    return data?.results?.[0]?.alternatives?.[0]?.transcript ?? ''
  } catch {
    return ''
  }
}
