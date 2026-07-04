/**
 * POST /api/stt
 * Transcribes Base64 WEBM/Opus audio via Google Cloud Speech-to-Text.
 * Body: { audioBase64: string, languageCode?: string }
 * Response: { transcript } — best transcript, or "" on failure (never throws).
 */
import { transcribeSpeech } from '@/lib/googleCloud'

export async function POST(request: Request) {
  const { audioBase64, languageCode } = (await request.json()) as {
    audioBase64?: string
    languageCode?: string
  }

  const transcript = await transcribeSpeech(audioBase64 ?? '', languageCode)

  return Response.json({ transcript })
}
