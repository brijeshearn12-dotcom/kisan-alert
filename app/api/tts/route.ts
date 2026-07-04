/**
 * POST /api/tts
 * Converts text to speech via Google Cloud Text-to-Speech.
 * Body: { text: string, languageCode: string }
 * Response: { audioContent } — Base64 MP3, or "" on failure (never throws).
 */
import { synthesizeSpeech } from '@/lib/googleCloud'

// Voice locales this app supports; anything else falls back to Hindi.
type LanguageCode = 'hi-IN' | 'te-IN' | 'mr-IN' | 'en-IN'
const SUPPORTED: LanguageCode[] = ['hi-IN', 'te-IN', 'mr-IN', 'en-IN']

export async function POST(request: Request) {
  const { text, languageCode } = (await request.json()) as {
    text?: string
    languageCode?: string
  }

  const code: LanguageCode = SUPPORTED.includes(languageCode as LanguageCode)
    ? (languageCode as LanguageCode)
    : 'hi-IN'

  const audioContent = await synthesizeSpeech(text ?? '', code)

  return Response.json({ audioContent })
}
