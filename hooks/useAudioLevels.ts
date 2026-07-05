import { useEffect, useRef, useState } from 'react'

/**
 * useAudioLevels
 * -----------------------------------------------------------------------------
 * Analyses a live MediaStream via the Web Audio API and returns an array of 12
 * bar heights (0–100) that react to real microphone volume at ~60 fps.
 *
 * The hook owns the AudioContext and AnalyserNode lifecycle. When the stream
 * is removed or the component unmounts, all audio nodes are disconnected and
 * the context is closed — guaranteeing the browser mic indicator disappears.
 *
 * Values are lightly smoothed (exponential moving average) to prevent jitter
 * while still feeling responsive to speech.
 * -----------------------------------------------------------------------------
 */

const BAR_COUNT = 12
const SMOOTHING = 0.35 // 0 = no smoothing, 1 = frozen

/** Flat zero array used as the idle/default return value. */
const ZERO_BARS: number[] = Array.from({ length: BAR_COUNT }, () => 0)

export function useAudioLevels(stream: MediaStream | null): number[] {
  const [bars, setBars] = useState<number[]>(ZERO_BARS)

  // Refs survive re-renders and let us clean up deterministically.
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const prevRef = useRef<number[]>(ZERO_BARS)

  useEffect(() => {
    // ── No stream → reset everything ────────────────────────────────────────
    if (!stream || stream.getTracks().every((t) => t.readyState === 'ended')) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0

      if (sourceRef.current) {
        sourceRef.current.disconnect()
        sourceRef.current = null
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect()
        analyserRef.current = null
      }
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close().catch(() => {/* already closed */})
        ctxRef.current = null
      }

      prevRef.current = ZERO_BARS
      setBars(ZERO_BARS)
      return
    }

    // ── Set up Web Audio pipeline ───────────────────────────────────────────
    const ctx = new AudioContext()
    ctxRef.current = ctx

    const source = ctx.createMediaStreamSource(stream)
    sourceRef.current = source

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 64 // smallest power-of-2 → 32 frequency bins; plenty for 12 bars
    analyser.smoothingTimeConstant = 0.6
    analyserRef.current = analyser

    source.connect(analyser)
    // Do NOT connect analyser to ctx.destination — we don't want playback.

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    function tick() {
      if (!analyserRef.current) return

      analyserRef.current.getByteFrequencyData(dataArray)

      // Map the first BAR_COUNT bins to a 0–100 range and apply smoothing.
      const next: number[] = []
      const prev = prevRef.current
      for (let i = 0; i < BAR_COUNT; i++) {
        const raw = (dataArray[i] ?? 0) / 255 * 100
        const smoothed = prev[i] * SMOOTHING + raw * (1 - SMOOTHING)
        next.push(Math.round(smoothed * 10) / 10)
      }
      prevRef.current = next
      setBars(next)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    // ── Cleanup on stream change or unmount ──────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0

      source.disconnect()
      sourceRef.current = null

      analyser.disconnect()
      analyserRef.current = null

      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {/* already closed */})
      }
      ctxRef.current = null

      prevRef.current = ZERO_BARS
      setBars(ZERO_BARS)
    }
  }, [stream])

  return bars
}
