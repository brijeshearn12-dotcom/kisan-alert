'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase'
import PhotoUpload from '@/components/PhotoUpload'
import { EntranceAnimation } from '@/components/EntranceAnimation'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListenButton } from '@/components/ListenButton'
import { VoiceInput } from '@/components/VoiceInput'
import { useLanguage } from '@/contexts/LanguageContext'
import { toSpeechLocale } from '@/lib/i18n/speech'
import { type TranslationKey } from '@/lib/i18n/translations'

// ── Types ───────────────────────────────────────────────────────────────────

interface DiseaseCheckResponse {
  diagnosis: string | null
  confidence_score: number
  treatment_advice: string | null
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  spread_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  immediate_action?: string | null
  organic_treatment?: string | null
  chemical_treatment?: string | null
  prevention?: string | null
  monitoring?: string | null
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

const OrganicIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
    <path d="M12 2a15 15 0 0 0-3 9c0 4.4 3.6 8 8 8a8 8 0 0 0 8-8c0-3.3-3.6-9-13-9Z" />
    <path d="M12 2A15 15 0 0 1 15 11c0 4.4-3.6 8-8 8A8 8 0 0 1 1 11c0-3.3 3.6-9 11-9Z" />
  </svg>
)

const ChemicalIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
    <path d="M4.5 3h15" />
    <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
    <path d="M6 14h12" />
  </svg>
)

const PreventionIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const MonitoringIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
    <circle cx="12" cy="12" r="10" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

// ── Confidence styling ───────────────────────────────────────────────────────

function confidenceStyle(score: number, t: (key: TranslationKey) => string): {
  label: string
  text: string
  bg: string
  ring: string
  dot: string
} {
  if (score >= 0.8) {
    return {
      label: t('disease.confidence.high'),
      text: 'text-primary-green font-medium',
      bg: 'bg-primary-green/5',
      ring: 'ring-primary-green/20',
      dot: 'bg-primary-green',
    }
  }
  if (score >= 0.6) {
    return {
      label: t('disease.confidence.moderate'),
      text: 'text-accent-amber font-medium',
      bg: 'bg-accent-amber/5',
      ring: 'ring-accent-amber/20',
      dot: 'bg-accent-amber',
    }
  }
  return {
    label: t('disease.confidence.low'),
    text: 'text-rose-700 font-medium',
    bg: 'bg-rose-50',
    ring: 'ring-rose-600/10',
    dot: 'bg-rose-500',
  }
}

// ── Crop Selector Options ───────────────────────────────────────────────────

const CROPS = [
  { value: 'Cotton', key: 'crop.cotton' },
  { value: 'Rice', key: 'crop.rice' },
  { value: 'Wheat', key: 'crop.wheat' },
  { value: 'Maize', key: 'crop.maize' },
  { value: 'Tomato', key: 'crop.tomato' },
  { value: 'Potato', key: 'crop.potato' },
  { value: 'Onion', key: 'crop.onion' },
  { value: 'Chilli', key: 'crop.chilli' },
  { value: 'Sugarcane', key: 'crop.sugarcane' },
  { value: 'Soybean', key: 'crop.soybean' },
  { value: 'Groundnut', key: 'crop.groundnut' },
  { value: 'Banana', key: 'crop.banana' },
  { value: 'Grapes', key: 'crop.grapes' },
  { value: 'Mango', key: 'crop.mango' },
  { value: 'Pomegranate', key: 'crop.pomegranate' },
  { value: 'Millets', key: 'crop.millets' },
] as const

// ── Component ────────────────────────────────────────────────────────────────

export default function DiseaseCheckPage() {
  const supabase = useMemo(() => createClient(), [])
  const statusId = useId()
  const { t, language } = useLanguage()

  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [diagnosisResult, setDiagnosisResult] = useState<DiseaseCheckResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [voiceDescription, setVoiceDescription] = useState<string>('')
  const [selectedCrop, setSelectedCrop] = useState<string>('')

  // Status message rotation during the analysis phase
  const [analysisStatusKey, setAnalysisStatusKey] = useState<TranslationKey>('disease.status.uploading')

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

    const messages: TranslationKey[] = [
      'disease.status.sending',
      'disease.status.identifying',
      'disease.status.referencing',
      'disease.status.calculating',
    ]

    let index = 0
    const interval = setInterval(() => {
      if (index < messages.length) {
        setAnalysisStatusKey(messages[index])
        index++
      }
    }, 2200)

    return () => clearInterval(interval)
  }, [screenState])

  async function handleCheck(uploadedUrl: string) {
    setImageUrl(uploadedUrl)
    setScreenState('analyzing')
    setAnalysisStatusKey('disease.status.sending')
    setErrorMsg(null)

    try {
      const response = await fetch('/api/disease-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: uploadedUrl, target_lang: language, crop_type: selectedCrop || undefined }),
      })

      const data = (await response.json()) as DiseaseCheckResponse

      if (!response.ok) {
        throw new Error(data.error ?? t('disease.failed'))
      }

      setDiagnosisResult(data)

      // Decide screen redirect based on backend escalation or confidence score
      if (data.escalated || (data.confidence_score !== undefined && data.confidence_score < 0.6)) {
        setScreenState('escalated')
      } else {
        setScreenState('success')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.network')
      setErrorMsg(message)
      setScreenState('error')
    }
  }

  function handleReset() {
    setImageUrl(null)
    setDiagnosisResult(null)
    setErrorMsg(null)
    setVoiceDescription('')
    setScreenState('ready')
  }

  async function handleVoiceDiagnosis() {
    if (!voiceDescription.trim()) return

    setScreenState('analyzing')
    setAnalysisStatusKey('disease.status.analyzingDesc')
    setErrorMsg(null)

    try {
      const response = await fetch('/api/disease-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_description: voiceDescription, target_lang: language, crop_type: selectedCrop || undefined }),
      })

      const data = (await response.json()) as DiseaseCheckResponse

      if (!response.ok) {
        throw new Error(data.error ?? t('disease.failed'))
      }

      setDiagnosisResult(data)

      if (data.escalated || (data.confidence_score !== undefined && data.confidence_score < 0.6)) {
        setScreenState('escalated')
      } else {
        setScreenState('success')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.network')
      setErrorMsg(message)
      setScreenState('error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 font-sans" aria-busy={screenState === 'analyzing'}>
      {/* Navigation Header */}
      <nav className="border-b border-slate-100 bg-white shadow-sm" aria-label="Global breadcrumb">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-5 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded px-1.5 py-1"
          >
            {ArrowLeftIcon}
            <span>{t('disease.back')}</span>
          </Link>
          <span className="text-slate-200" aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="text-primary-green">{LeafIcon}</span>
            {t('disease.diagnosisHeader')}
          </span>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
        {/* Header Block */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t('disease.aiDiagnosisTitle')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {t('disease.aiDiagnosisDetail')}
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
            >
              <EmptyState
                title={t('disease.authRequired')}
                description={t('disease.authRequiredDetail')}
                action={
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-green px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
                  >
                    {t('login.signIn')}
                  </Link>
                }
              />
            </EntranceAnimation>
          )}

          {/* 3. Drop/Upload Area */}
          {screenState === 'ready' && (
            <EntranceAnimation
              key="ready"
              exit={{ opacity: 0 }}
            >
              {/* Crop Selector Card */}
              <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label htmlFor="crop-select" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  {t('disease.selectCrop')}
                </label>
                <div className="relative">
                  <select
                    id="crop-select"
                    value={selectedCrop}
                    onChange={(e) => setSelectedCrop(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:border-primary-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-green/20 transition-all cursor-pointer"
                  >
                    <option value="">-- {t('disease.selectCrop')} --</option>
                    {CROPS.map((crop) => (
                      <option key={crop.value} value={crop.value}>
                        {t(crop.key as TranslationKey)}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>

              <PhotoUpload
                label={t('disease.uploadStep1')}
                onUpload={handleCheck}
                onError={(msg) => {
                  setErrorMsg(msg)
                  setScreenState('error')
                }}
              />

              {/* OR divider */}
              {!imageUrl && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-slate-50 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {t('disease.describeOr')}
                      </span>
                    </div>
                  </div>

                  <VoiceInput onTranscript={(text) => setVoiceDescription(text)} />

                  {voiceDescription.trim() !== '' && (
                    <button
                      type="button"
                      onClick={handleVoiceDiagnosis}
                      className="mt-4 flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-primary-green px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4z" />
                        <path d="M22 2 11 13" />
                      </svg>
                      {t('disease.diagnoseBtn')}
                    </button>
                  )}
                </>
              )}
            </EntranceAnimation>
          )}

          {/* 4. Analyzing State */}
          {screenState === 'analyzing' && (imageUrl || voiceDescription) && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] w-full bg-slate-900">
                {imageUrl ? (
                  <>
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
                  </>
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-slate-800 to-slate-900" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 p-6 text-center">
                  <div className="rounded-full bg-primary-green/10 p-4 ring-1 ring-primary-green/20 backdrop-blur-md">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-green/80 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-green"></span>
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-white tracking-wide">
                    {t('disease.analyzingSnapshot')}
                  </h3>
                  <p className="mt-1 text-xs text-primary-green/80 font-mono tracking-wide animate-pulse">
                    {t(analysisStatusKey)}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* 5. Diagnosis Result (Success / Escalated) — from image OR voice */}
          {(screenState === 'success' || screenState === 'escalated') && diagnosisResult && (imageUrl || voiceDescription) && (
            <EntranceAnimation
              key="result"
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {imageUrl && (
                  <div className="relative aspect-[16/9] w-full bg-slate-100 border-b border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Diagnosed plant leaf"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-primary-green px-3 py-1 text-xs font-semibold text-white shadow-sm">
                      {CheckIcon}
                      {t('disease.analysisCompleted')}
                    </div>
                  </div>
                )}

                {!imageUrl && voiceDescription && (
                  <div className="border-b border-slate-100 bg-primary-green/5 p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-green/10 text-primary-green">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" x2="12" y1="19" y2="22" />
                        </svg>
                      </span>
                      <span className="text-xs font-semibold text-primary-green uppercase tracking-wider">{t('disease.voiceDiagnosis')}</span>
                    </div>
                    <p className="mt-2 text-xs italic text-slate-500 line-clamp-2">&ldquo;{voiceDescription}&rdquo;</p>
                  </div>
                )}

                <div className="p-5 sm:p-6">
                  {/* Low Confidence / Escalation Warning Banner */}
                  {(screenState === 'escalated' || diagnosisResult.escalated) && (
                    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                      <span className="mt-0.5 shrink-0 text-amber-500">{ShieldAlertIcon}</span>
                      <div className="flex-1">
                        <h4 className="font-bold text-amber-900 leading-snug">
                          {t('disease.lowConfidenceWarning')}
                        </h4>
                        {diagnosisResult.case_id && (
                          <p className="mt-1.5 text-xs font-semibold text-amber-700">
                            {t('disease.referenceId', { id: diagnosisResult.case_id })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Title and Badges */}
                  <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {screenState === 'escalated' || diagnosisResult.escalated ? t('disease.suspectedDisease') : t('disease.label')}
                      </span>
                      <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                        {diagnosisResult.diagnosis}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      {diagnosisResult.confidence_score !== undefined && (
                        (() => {
                          const style = confidenceStyle(diagnosisResult.confidence_score, t)
                          return (
                            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${style.text} ${style.bg} ring-1 ring-inset ${style.ring}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                              <span>{t('disease.confidencePercent', { percent: (diagnosisResult.confidence_score * 100).toFixed(0) })}</span>
                            </div>
                          )
                        })()
                      )}

                      {/* Severity badge */}
                      {diagnosisResult.severity && (
                        (() => {
                          const sev = diagnosisResult.severity.toUpperCase()
                          const classes = 
                            sev === 'HIGH' 
                              ? 'bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/20 dark:text-rose-400'
                              : sev === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/20 dark:text-amber-400'
                                : 'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/20 dark:text-emerald-400'
                          return (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${classes}`}>
                              {t(`disease.severity.${sev.toLowerCase()}` as TranslationKey)}
                            </span>
                          )
                        })()
                      )}
                    </div>
                  </div>

                  {/* Spread Risk Section */}
                  {diagnosisResult.spread_risk && (
                    <div className="mt-5 border-b border-slate-100 pb-5">
                      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                        {(() => {
                          const risk = diagnosisResult.spread_risk.toUpperCase()
                          const emoji = risk === 'HIGH' ? '🔴' : risk === 'MEDIUM' ? '🟡' : '🟢'
                          return (
                            <>
                              <span aria-hidden="true" className="text-sm">{emoji}</span>
                              <span>{t(`disease.spreadRisk.${risk.toLowerCase()}` as TranslationKey)}</span>
                            </>
                          )
                        })()}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {t(`disease.spreadRisk.${diagnosisResult.spread_risk.toLowerCase()}.desc` as TranslationKey)}
                      </p>
                    </div>
                  )}

                  {/* Immediate Action Card */}
                  {diagnosisResult.immediate_action && (
                    <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/60 p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-rose-800">
                        <span aria-hidden="true" className="text-sm">🚨</span>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600">
                          {t('disease.immediateAction')}
                        </h4>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-rose-950 leading-relaxed">
                        {diagnosisResult.immediate_action}
                      </p>
                    </div>
                  )}

                  {/* Structured Treatment Advisory Report */}
                  <div className="mt-8 border-t border-slate-100 pt-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                      {t('disease.recommendedTreatment')}
                    </h3>
                    
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {/* Organic Treatment Card */}
                      {diagnosisResult.organic_treatment && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/10 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            {OrganicIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.organic')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.organic_treatment}
                          </p>
                        </div>
                      )}

                      {/* Chemical Treatment Card */}
                      {diagnosisResult.chemical_treatment && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/10 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            {ChemicalIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.chemical')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.chemical_treatment}
                          </p>
                        </div>
                      )}

                      {/* Prevention Card */}
                      {diagnosisResult.prevention && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/10 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            {PreventionIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.prevention')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.prevention}
                          </p>
                        </div>
                      )}

                      {/* Monitoring Card */}
                      {diagnosisResult.monitoring && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50/10 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            {MonitoringIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.monitoring')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.monitoring}
                          </p>
                        </div>
                      )}
                    </div>

                    {diagnosisResult.treatment_advice && (
                      <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-relaxed text-slate-400 italic flex-1">
                          {diagnosisResult.treatment_advice}
                        </p>
                        <div className="shrink-0">
                          <ListenButton
                            text={(() => {
                              const parts = [
                                diagnosisResult.treatment_advice
                              ]
                              if (diagnosisResult.organic_treatment) {
                                parts.push(`${t('disease.treatment.organic')}: ${diagnosisResult.organic_treatment}`)
                              }
                              if (diagnosisResult.chemical_treatment) {
                                parts.push(`${t('disease.treatment.chemical')}: ${diagnosisResult.chemical_treatment}`)
                              }
                              if (diagnosisResult.prevention) {
                                parts.push(`${t('disease.treatment.prevention')}: ${diagnosisResult.prevention}`)
                              }
                              if (diagnosisResult.monitoring) {
                                parts.push(`${t('disease.treatment.monitoring')}: ${diagnosisResult.monitoring}`)
                              }
                              return parts.join('. ')
                            })()}
                            languageCode={toSpeechLocale(language)}
                          />
                        </div>
                      </div>
                    )}
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
                {t('disease.scanAnother')}
              </button>
            </EntranceAnimation>
          ) /* End of result card */}

          {/* 7. Error state card */}
          {screenState === 'error' && errorMsg && (
            <EntranceAnimation
              key="error"
              exit={{ opacity: 0 }}
            >
              <ErrorState
                title={t('disease.failed')}
                description={errorMsg}
                onRetry={handleReset}
                secondaryAction={
                  <Link
                    href="/dashboard"
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40"
                  >
                    {t('disease.returnDashboard')}
                  </Link>
                }
              />
            </EntranceAnimation>
          )}
        </AnimatePresence>
      </div>

      {/* Screen reader live updates */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {screenState === 'loading' && t('disease.sr.checkingAuth')}
        {screenState === 'analyzing' && t(analysisStatusKey)}
        {screenState === 'success' && t('disease.sr.complete', { diagnosis: diagnosisResult?.diagnosis || '' })}
        {screenState === 'escalated' && t('disease.sr.escalated')}
        {screenState === 'error' && t('disease.sr.failed', { error: errorMsg || '' })}
      </p>
    </main>
  )
}
