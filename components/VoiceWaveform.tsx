'use client'

/**
 * VoiceWaveform
 * -----------------------------------------------------------------------------
 * A purely presentational component that renders 12 animated bars driven by
 * live microphone levels via the useAudioLevels hook.
 *
 * The waveform renders ONLY when `isRecording` is true AND a valid stream is
 * provided. When recording stops the bars smoothly collapse to zero and the
 * component unmounts, ensuring no stale visuals remain on screen.
 *
 * All Web Audio lifecycle (AudioContext, AnalyserNode, cleanup) is owned by
 * the hook — this component contains zero audio logic.
 * -----------------------------------------------------------------------------
 */

import { useAudioLevels } from '@/hooks/useAudioLevels'

interface VoiceWaveformProps {
  stream: MediaStream | null
  isRecording: boolean
}

const BAR_COUNT = 12

export default function VoiceWaveform({ stream, isRecording }: VoiceWaveformProps) {
  const bars = useAudioLevels(isRecording ? stream : null)

  if (!isRecording) return null

  return (
    <div
      role="img"
      aria-label="Live audio waveform — bars react to your microphone volume"
      aria-live="polite"
      className="flex h-[60px] items-end justify-center gap-[5px] rounded-xl bg-rose-100/60 px-4 py-2"
    >
      {bars.slice(0, BAR_COUNT).map((height, i) => {
        // Minimum 6% so bars are always visible (never fully invisible)
        const clamped = Math.max(6, height)
        return (
          <div
            key={i}
            className="w-[6px] rounded-full bg-rose-500"
            style={{
              height: `${clamped}%`,
              transition: 'height 80ms ease-out',
              willChange: 'height',
            }}
          />
        )
      })}
    </div>
  )
}
