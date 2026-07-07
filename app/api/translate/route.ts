/**
 * POST /api/translate
 * Translates English text into a target language via Google Cloud Translation.
 * Body: { text: string, targetLang: string }
 * Response: { translatedText } — original text is returned on failure/unknown
 * target (never throws).
 */
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { translateText } from '@/lib/googleCloud'

// Languages the app translates into; unknown targets pass through unchanged.
type TargetLang = 'en' | 'hi' | 'mr' | 'gu' | 'kn' | 'ta' | 'te' | 'bn'
const SUPPORTED: TargetLang[] = ['en', 'hi', 'mr', 'gu', 'kn', 'ta', 'te', 'bn']

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json(
        { error: 'You must be logged in to access translation services.' },
        { status: 401 }
      )
    }

    const { text, targetLang } = (await request.json()) as {
      text?: string
      targetLang?: string
    }

    // Unrecognised targets default to 'en', which passes the text through as-is.
    const lang: TargetLang = SUPPORTED.includes(targetLang as TargetLang)
      ? (targetLang as TargetLang)
      : 'en'

    const translatedText = await translateText(text ?? '', lang)

    return Response.json({ translatedText })
  } catch {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
