/**
 * POST /api/stt
 * Transcribes Base64 WEBM/Opus audio via Google Cloud Speech-to-Text.
 * Body: { audioBase64: string, languageCode?: string }
 * Response: { transcript } — best transcript, or "" on failure (never throws).
 */
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { transcribeSpeech } from '@/lib/googleCloud'

/** Allowed BCP-47 codes the STT backend supports. Anything else is ignored. */
const ALLOWED_LANGUAGE_CODES = new Set(['en-IN', 'hi-IN', 'te-IN', 'mr-IN'])

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json(
        { error: 'You must be logged in to access speech-to-text services.' },
        { status: 401 }
      )
    }

    const { audioBase64, languageCode } = (await request.json()) as {
      audioBase64?: string
      languageCode?: string
    }

    // Only forward a languageCode we explicitly support; otherwise default to
    // English (en-IN). This prevents callers from accidentally biasing the
    // recognizer towards an unsupported or wrong language.
    const safeLanguageCode =
      typeof languageCode === 'string' && ALLOWED_LANGUAGE_CODES.has(languageCode)
        ? languageCode
        : undefined // let transcribeSpeech() apply its own 'en-IN' default

    const transcript = await transcribeSpeech(audioBase64 ?? '', safeLanguageCode)

    return Response.json({ transcript })
  } catch {
    // Malformed body, unexpected error — return empty transcript, never crash.
    return Response.json({ transcript: '' })
  }
}
