'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase'
import PhotoUpload from '@/components/PhotoUpload'
import { EntranceAnimation } from '@/components/EntranceAnimation'

// ── Types ───────────────────────────────────────────────────────────────────

interface DiseaseCheckResponse {
  diagnosis: string | null
  confidence_score: number
  treatment_advice: string | null
  escalated: boolean
  case_id: string | null
  disease_check_id: string | null
  error?: string
}

type ScreenState = 'loading' | 'ready' | 'unauthenticated' | 'analyzing' | 'success' | 'escalated' | 'error'

// ── Icons (consistent with the project's convention) ────────────────────────

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const ArrowLeftIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

const LeafIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="M11 20A7 7 0 0 1 14 6c3 0 6 3 6 6a7 7 0 0 1-5 6.7" />
    <path d="M11 20a7 7 0 0 1-7-7c0-3 3-6 6-6 1.4 0 2.7.5 3.7 1.3" />
    <path d="M11 20v-8" />
  </svg>
)

const CheckIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" {...stroke} strokeWidth={2.5} className="text-primary-green">
    <path d="m20 6-11 11-5-5" />
  </svg>
)

const ShieldAlertIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" {...stroke}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
)

const RefreshIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" {...stroke}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

// ── Confidence styling ───────────────────────────────────────────────────────

function confidenceStyle(score: number): {
  label: string
  text: string
  bg: string
  ring: string
  dot: string
} {
  if (score >= 0.8) {
    return {
      label: 'High confidence',
      text: 'text-primary-green font-medium',
      bg: 'bg-primary-green/5',
      ring: 'ring-primary-green/20',
      dot: 'bg-primary-green',
    }
  }
  if (score >= 0.6) {
    return {
      label: 'Moderate confidence',
      text: 'text-accent-amber font-medium',
      bg: 'bg-accent-amber/5',
      ring: 'ring-accent-amber/20',
      dot: 'bg-accent-amber',
    }
  }
  return {
    label: 'Low confidence',
    text: 'text-rose-700 font-medium',
    bg: 'bg-rose-50',
    ring: 'ring-rose-600/10',
    dot: 'bg-rose-500',
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DiseaseCheckPage() {
  const supabase = useMemo(() => createClient(), [])
  const statusId = useId()

  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [diagnosisResult, setDiagnosisResult] = useState<DiseaseCheckResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Status message rotation during the analysis phase
  const [analysisStatus, setAnalysisStatus] = useState('Uploading image...')

  // Verification & Auth check on mount
  useEffect(() => {
    let active = true

    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        setScreenState('unauthenticated')
      } else {
        setScreenState('ready')
      }
    }

    checkAuth()
    return () => {
      active = false
    }
  }, [supabase])

  // Cycle messages during active analysis
  useEffect(() => {
    if (screenState !== 'analyzing') return

    const messages = [
      'Sending crop snapshot to AI pipeline...',
      'AI is identifying plant symptoms...',
      'Cross-referencing disease patterns...',
      'Calculating diagnosis confidence...',
    ]

    let index = 0
    const interval = setInterval(() => {
      if (index < messages.length) {
        setAnalysisStatus(messages[index])
        index++
      }
    }, 2200)

    return () => clearInterval(interval)
  }, [screenState])

  async function handleCheck(uploadedUrl: string) {
    setImageUrl(uploadedUrl)
    setScreenState('analyzing')
    setAnalysisStatus('Sending crop snapshot to AI pipeline...')
    setErrorMsg(null)

    try {
      const response = await fetch('/api/disease-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: uploadedUrl }),
      })

      const data = (await response.json()) as DiseaseCheckResponse

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to analyze crop image.')
      }

      setDiagnosisResult(data)

      // Decide screen redirect based on backend escalation or confidence score
      if (data.escalated || (data.confidence_score !== undefined && data.confidence_score < 0.6)) {
        setScreenState('escalated')
      } else {
        setScreenState('success')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'A network error occurred. Please try again.'
      setErrorMsg(message)
      setScreenState('error')
    }
  }

  function handleReset() {
    setImageUrl(null)
    setDiagnosisResult(null)
    setErrorMsg(null)
    setScreenState('ready')
  }

  return (
    <main className="min-h-screen bg-slate-50 font-sans" aria-busy={screenState === 'analyzing'}>
      {/* Navigation Header */}
      <nav className="border-b border-slate-100 bg-white shadow-sm" aria-label="Global breadcrumb">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-5 sm:px-6">
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded px-1.5 py-1"
          >
            {ArrowLeftIcon}
            <span>Back</span>
          </Link>
          <span className="text-slate-200" aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="text-primary-green">{LeafIcon}</span>
            Disease Diagnosis
          </span>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
        {/* Header Block */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            AI Disease Diagnosis
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Upload a high-quality photo of your affected plant leaf to receive an instant diagnosis, treatment details, and expert review.
          </p>
        </header>

        <AnimatePresence mode="wait">
          {/* 1. Loading Auth State */}
          {screenState === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 animate-pulse"
              aria-hidden="true"
            >
              <div className="h-60 w-full rounded-2xl bg-slate-200" />
              <div className="h-10 w-full rounded-xl bg-slate-200" />
            </motion.div>
          )}

          {/* 2. Unauthenticated state */}
          {screenState === 'unauthenticated' && (
            <EntranceAnimation
              key="unauthenticated"
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-base font-semibold text-slate-900">Sign in required</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                You must be logged in to access the disease diagnosis tool and submit crop scans for review.
              </p>
              <div className="mt-5">
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-green px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
                >
                  Sign in
                </Link>
              </div>
            </EntranceAnimation>
          )}

          {/* 3. Drop/Upload Area */}
          {screenState === 'ready' && (
            <EntranceAnimation
              key="ready"
              exit={{ opacity: 0 }}
            >
              <PhotoUpload
                label="Step 1: Upload leaf photograph"
                onUpload={handleCheck}
                onError={(msg) => {
                  setErrorMsg(msg)
                  setScreenState('error')
                }}
              />
            </EntranceAnimation>
          )}

          {/* 4. Analyzing State */}
          {screenState === 'analyzing' && imageUrl && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] w-full bg-slate-900">
                {/* Image under scanner */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Analyzing leaf upload"
                  className="h-full w-full object-cover opacity-60 filter blur-[1px]"
                />

                {/* Laser scan animation overlay */}
                <motion.div
                  className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                  initial={{ top: '0%' }}
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />

                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 p-6 text-center">
                  <div className="rounded-full bg-primary-green/10 p-4 ring-1 ring-primary-green/20 backdrop-blur-md">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-green/80 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-green"></span>
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-white tracking-wide">
                    ANALYZING SNAPSHOT
                  </h3>
                  <p className="mt-1 text-xs text-primary-green/80 font-mono tracking-wide animate-pulse">
                    {analysisStatus}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* 5. Diagnosis Result (Success) */}
          {screenState === 'success' && diagnosisResult && imageUrl && (
            <EntranceAnimation
              key="success"
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative aspect-[16/9] w-full bg-slate-100 border-b border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Diagnosed plant leaf"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-primary-green px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    {CheckIcon}
                    Analysis Completed
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  {/* Title and Badge */}
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnosis</span>
                      <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                        {diagnosisResult.diagnosis}
                      </h2>
                    </div>

                    {diagnosisResult.confidence_score !== undefined && (
                      (() => {
                        const style = confidenceStyle(diagnosisResult.confidence_score)
                        return (
                          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${style.text} ${style.bg} ring-1 ring-inset ${style.ring} self-start sm:self-center`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                            <span>{(diagnosisResult.confidence_score * 100).toFixed(0)}% Confidence</span>
                          </div>
                        )
                      })()
                    )}
                  </div>

                  {/* Recommendation Details */}
                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <h3 className="text-sm font-semibold text-slate-800">Recommended Treatment</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                      {diagnosisResult.treatment_advice}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reset button */}
              <button
                type="button"
                onClick={handleReset}
                className="flex w-full h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
              >
                {RefreshIcon}
                Scan another leaf
              </button>
            </EntranceAnimation>
          )}

          {/* 6. Escalated to Expert State */}
          {screenState === 'escalated' && diagnosisResult && imageUrl && (
            <EntranceAnimation
              key="escalated"
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative aspect-[16/9] w-full bg-slate-100 border-b border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Escalated plant leaf"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-accent-amber px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    {ShieldAlertIcon}
                    Case Submitted
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Resolution Flow</span>
                    <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                      Forwarded to Agricultural Expert
                    </h2>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-slate-600">
                    The AI confidence score for this scan was low ({(diagnosisResult.confidence_score * 100).toFixed(0)}%). To ensure you receive accurate guidance, we have escalated this case to our expert verification panel.
                  </p>

                  <div className="mt-6 border-t border-slate-100 pt-6 space-y-4">
                    <div className="flex gap-3">
                      <div className="text-slate-400 shrink-0 mt-0.5">{CheckIcon}</div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Case Created</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Reference ID: {diagnosisResult.case_id || 'Pending assignment'}</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="text-slate-400 shrink-0 mt-0.5">{CheckIcon}</div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Review SLA</h4>
                        <p className="text-xs text-slate-500 mt-0.5">An agricultural extension officer will review and update your dashboard within 24 hours.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reset button */}
              <button
                type="button"
                onClick={handleReset}
                className="flex w-full h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
              >
                {RefreshIcon}
                Scan another leaf
              </button>
            </EntranceAnimation>
          )}

          {/* 7. Error state card */}
          {screenState === 'error' && errorMsg && (
            <EntranceAnimation
              key="error"
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-rose-100 bg-rose-50/50 p-6 shadow-sm"
            >
              <h3 className="text-base font-bold text-rose-850">Diagnosis Failed</h3>
              <p className="mt-2 text-sm leading-relaxed text-rose-700">
                {errorMsg}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
                >
                  Try Again
                </button>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40"
                >
                  Return to Dashboard
                </Link>
              </div>
            </EntranceAnimation>
          )}
        </AnimatePresence>
      </div>

      {/* Screen reader live updates */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {screenState === 'loading' && 'Checking authentication status'}
        {screenState === 'analyzing' && analysisStatus}
        {screenState === 'success' && `Analysis complete. Diagnosed as ${diagnosisResult?.diagnosis}`}
        {screenState === 'escalated' && 'Diagnosis complete. Case escalated for expert review.'}
        {screenState === 'error' && `Analysis failed: ${errorMsg}`}
      </p>
    </main>
  )
}
