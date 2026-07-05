'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import VoiceWaveform from '@/components/VoiceWaveform'

// ── Types ────────────────────────────────────────────────────────────────────

interface VoiceInputProps {
  onTranscript: (text: string) => void
}

type VoiceState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'done'
  | 'mic-denied'
  | 'stt-error'

// ── Icons ────────────────────────────────────────────────────────────────────

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const MicIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
)

const StopIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RECORDING_SECONDS = 15

// ── Component ────────────────────────────────────────────────────────────────

export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [countdown, setCountdown] = useState(MAX_RECORDING_SECONDS)
  const [transcript, setTranscript] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [stream, setStream] = useState<MediaStream | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  /** Stop recording, release mic, clear timers. */
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setStream(null)
  }, [])

  /** Convert a Blob to base64 string (data URL stripped to raw base64). */
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        // Strip prefix: "data:audio/webm;codecs=opus;base64,"
        const base64 = dataUrl.split(',')[1] ?? ''
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /** Send base64 audio to /api/stt and return the transcript. */
  async function transcribeAudio(audioBase64: string): Promise<string> {
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64 }),
    })

    if (!res.ok) {
      throw new Error(`STT request failed with status ${res.status}`)
    }

    const data = (await res.json()) as { transcript?: string }
    return data.transcript ?? ''
  }

  /** Begin recording: request mic, set up MediaRecorder with countdown. */
  async function startRecording() {
    setErrorDetail('')
    setTranscript('')
    chunksRef.current = []

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setState('mic-denied')
      return
    }

    streamRef.current = stream
    setStream(stream)

    // Prefer webm/opus; fall back to whatever the browser supports
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 128_000,
    })
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      setState('transcribing')

      const blob = new Blob(chunksRef.current, { type: mimeType })

      // Reject recordings that are too short / nearly silent
      if (blob.size < 5000) {
        setErrorDetail('Recording too short. Please try again.')
        setState('stt-error')
        return
      }

      try {
        const base64 = await blobToBase64(blob)
        const result = await transcribeAudio(base64)

        if (!result.trim()) {
          setErrorDetail('No speech detected. Please try again or type your description.')
          setState('stt-error')
          return
        }

        setTranscript(result)
        setState('done')
        onTranscript(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transcription failed.'
        setErrorDetail(msg)
        setState('stt-error')
      }
    }

    recorder.start()
    setState('recording')
    setCountdown(MAX_RECORDING_SECONDS)

    // Countdown timer — auto-stop at 0
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopRecording()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  /** Handle manual edits to the transcript textarea. */
  function handleTextChange(text: string) {
    setTranscript(text)
    onTranscript(text)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Idle: show the main record button ─── */}
      {state === 'idle' && (
        <button
          type="button"
          onClick={startRecording}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-primary-green/30 bg-primary-green/5 px-5 py-4 text-sm font-semibold text-primary-green transition-all hover:border-primary-green/50 hover:bg-primary-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 min-h-[44px]"
        >
          {MicIcon}
          🎙 Describe Your Problem
        </button>
      )}

      {/* ── Recording: countdown + stop button ─── */}
      {state === 'recording' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
            </span>
            <span className="text-sm font-semibold text-rose-700">
              Recording… {countdown}s
            </span>
          </div>

          <VoiceWaveform stream={stream} isRecording={state === 'recording'} />

          <div className="h-1.5 w-full rounded-full bg-rose-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-rose-400 transition-all duration-1000"
              style={{ width: `${(countdown / MAX_RECORDING_SECONDS) * 100}%` }}
            />
          </div>

          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 min-h-[44px] min-w-[120px]"
          >
            {StopIcon}
            Stop Recording
          </button>
        </div>
      )}

      {/* ── Transcribing: spinner ─── */}
      {state === 'transcribing' && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-green border-t-transparent" />
          <span className="text-sm font-medium text-slate-600">Transcribing your voice…</span>
        </div>
      )}

      {/* ── Done: editable textarea with transcript ─── */}
      {state === 'done' && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Your description (you can edit before submitting)
          </label>
          <textarea
            value={transcript}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 leading-relaxed shadow-sm transition-colors focus:border-primary-green/50 focus:outline-none focus:ring-2 focus:ring-primary-green/20 resize-y"
            placeholder="Edit your description here…"
          />
          <button
            type="button"
            onClick={() => {
              setState('idle')
              setTranscript('')
              onTranscript('')
            }}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            ↻ Re-record
          </button>
        </div>
      )}

      {/* ── Mic denied: permanent fallback textarea ─── */}
      {state === 'mic-denied' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-2xl border border-accent-amber/20 bg-accent-amber/5 p-3.5">
            <span className="mt-0.5 shrink-0 text-accent-amber text-sm">⚠️</span>
            <p className="text-sm text-slate-600">
              Microphone access denied. Please type your description instead.
            </p>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Describe your crop problem
          </label>
          <textarea
            value={transcript}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 leading-relaxed shadow-sm transition-colors focus:border-primary-green/50 focus:outline-none focus:ring-2 focus:ring-primary-green/20 resize-y"
            placeholder="E.g. My rice leaves are turning yellow with brown spots…"
          />
        </div>
      )}

      {/* ── STT error: retry option ─── */}
      {state === 'stt-error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5">
            <span className="mt-0.5 shrink-0 text-rose-500 text-sm">❌</span>
            <div>
              <p className="text-sm font-medium text-rose-700">Transcription failed</p>
              {errorDetail && (
                <p className="mt-0.5 text-xs text-rose-600">{errorDetail}</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setState('idle')
                startRecording()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-green px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 min-h-[44px]"
            >
              {MicIcon}
              Try Again
            </button>
            <button
              type="button"
              onClick={() => setState('mic-denied')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 min-h-[44px]"
            >
              Type Instead
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
