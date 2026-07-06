'use client'

import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { SOIL_TYPES, type SoilTypeId } from '@/lib/constants'
import { confidenceStyle } from '@/lib/confidence'
import { EntranceAnimation } from '@/components/EntranceAnimation'
import { EmptyState } from '@/components/EmptyState'
import { ListenButton } from '@/components/ListenButton'
import SatelliteMap from '@/components/SatelliteMap'
import VegetationIndexCard from '@/components/VegetationIndexCard'
import IndiaMap from '@/components/IndiaMap'
import DistrictInfoCard from '@/components/DistrictInfoCard'
import DemoPresetChips from '@/components/DemoPresetChips'
import type { CurrentWeather } from '@/lib/weather'
import { useLanguage } from '@/contexts/LanguageContext'
import { toSpeechLocale } from '@/lib/i18n/speech'
import type { LanguageCode, TranslationKey } from '@/lib/i18n/translations'
import { getCropTranslationKey, formatNumber } from '@/lib/i18n/translations'

// ── Types ───────────────────────────────────────────────────────────────────

interface District {
  id: string
  name: string
  state: string
  latitude: number | null
  longitude: number | null
}

/** Translated copies of the advisory fields; present only for non-English. */
interface TranslatedFields {
  reasoning: string
  fertilization_tip: string
  irrigation_advice: string
}

interface Recommendation {
  crop_name: string
  reasoning: string
  confidence_score: number
  fertilization_tip: string
  irrigation_advice: string
  is_dry_spell: boolean
  /** Present when a non-English language was requested. */
  translated?: TranslatedFields
  /** Present when the AI service fell back to a safe default. */
  error?: string
}

type InitState = 'loading' | 'ready' | 'unauthenticated' | 'error'

// ── Languages ─────────────────────────────────────────────────────────────────
// The active language now comes from the global LanguageContext (see the
// bottom-right selector). `LanguageCode` and the language list live in
// `lib/i18n/translations.ts`; this page only reads the current value.

/**
 * Resolve which advisory copy to show for the active language.
 * Falls back to English whenever a translation is missing.
 */
function displayFields(
  result: Recommendation,
  lang: LanguageCode,
): TranslatedFields {
  if (lang !== 'en' && result.translated) {
    return result.translated
  }
  return {
    reasoning: result.reasoning,
    fertilization_tip: result.fertilization_tip,
    irrigation_advice: result.irrigation_advice,
  }
}

// ── Soil presentation (copy + icons live here; ids/labels come from constants)─

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const SOIL_DETAILS: Record<SoilTypeId, { description: string; icon: ReactNode }> = {
  sandy: {
    description: 'Light, fast-draining soil that warms early in the season.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M3 16c2-2 3-2 4.5 0S11 18 12 16s2.5-2 4.5 0 2 2 4.5 0" />
        <path d="M3 11c2-2 3-2 4.5 0S11 13 12 11s2.5-2 4.5 0 2 2 4.5 0" />
      </svg>
    ),
  },
  loamy: {
    description: 'Balanced, fertile soil — ideal for most field crops.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 20v-7" />
        <path d="M12 13c0-3 2-5 5-5 0 3-2 5-5 5Z" />
        <path d="M12 15c0-2.5-1.8-4.5-4.5-4.5 0 2.7 2 4.5 4.5 4.5Z" />
      </svg>
    ),
  },
  clayey: {
    description: 'Heavy, moisture-retentive soil that holds water well.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M4 8.5 12 5l8 3.5-8 3.5-8-3.5Z" />
        <path d="m4 12 8 3.5L20 12" />
        <path d="m4 15.5 8 3.5 8-3.5" />
      </svg>
    ),
  },
  black_cotton: {
    description: 'Rich black soil with high clay content and good fertility.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M12 8c1.5-1.4 3-1.4 4.5 0M12 8c-1.5-1.4-3-1.4-4.5 0" />
        <path d="M12 13c1.5-1.4 3-1.4 4.5 0M12 13c-1.5-1.4-3-1.4-4.5 0" />
      </svg>
    ),
  },
  red: {
    description: 'Iron-rich porous soil suitable for pulses and oilseeds.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
        <path d="M12 6v12" />
        <path d="M6 12h12" />
      </svg>
    ),
  },
  laterite: {
    description: 'Acidic, leached soil rich in aluminium and iron oxides.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      </svg>
    ),
  },
}

// ── Small inline icons ──────────────────────────────────────────────────────

const CheckIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m20 6-11 11-5-5" />
  </svg>
)

const ChevronIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const WarningIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
)

const DropIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2.5 6.5 9a7 7 0 1 0 11 0L12 2.5Z" />
  </svg>
)

const RefreshIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const ArrowLeftIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

const LeafIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 20A7 7 0 0 1 14 6c3 0 6 3 6 6a7 7 0 0 1-5 6.7" />
    <path d="M11 20a7 7 0 0 1-7-7c0-3 3-6 6-6 1.4 0 2.7.5 3.7 1.3" />
    <path d="M11 20v-8" />
  </svg>
)

// ── Page ────────────────────────────────────────────────────────────────────

export default function RecommendationPage() {
  const supabase = useMemo(() => createClient(), [])
  const resultRef = useRef<HTMLElement>(null)

  const [initState, setInitState] = useState<InitState>('loading')
  const [districts, setDistricts] = useState<District[]>([])
  const [selectedState, setSelectedState] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [soil, setSoil] = useState<SoilTypeId | null>(null)

  const states = useMemo(() => {
    const list = districts.map((d) => d.state).filter(Boolean)
    return [...new Set(list)].sort()
  }, [districts])

  const filteredDistricts = useMemo(() => {
    if (!selectedState) return []
    return districts.filter((d) => d.state === selectedState)
  }, [districts, selectedState])

  const selectedDistrict = useMemo(() => {
    return districts.find((d) => d.id === districtId) || null
  }, [districts, districtId])

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Recommendation | null>(null)
  const [weather, setWeather] = useState<CurrentWeather | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherFetchedAt, setWeatherFetchedAt] = useState<Date | null>(null)
  const [soilMoisture, setSoilMoisture] = useState(50)
  const [vegetationScore, setVegetationScore] = useState<number | null>(null)
  const [vegetationStatus, setVegetationStatus] = useState<string | null>(null)
  const [vegetationAdvice, setVegetationAdvice] = useState<string | null>(null)
  const [vegetationAdviceLoading, setVegetationAdviceLoading] = useState(false)

  // Fetch weather at page level when selected district coordinates change
  useEffect(() => {
    if (!selectedDistrict || selectedDistrict.latitude === null || selectedDistrict.longitude === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset weather when no district is selected
      setWeather(null)
      setWeatherLoading(false)
      setWeatherFetchedAt(null)
      return
    }

    let active = true
    setWeatherLoading(true)

    fetch(`/api/weather?lat=${selectedDistrict.latitude}&lon=${selectedDistrict.longitude}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('weather request failed')
        return res.json() as Promise<{ weather: CurrentWeather | null }>
      })
      .then((data) => {
        if (!active) return
        setWeather(data.weather)
        setWeatherLoading(false)
        setWeatherFetchedAt(new Date())
      })
      .catch(() => {
        if (!active) return
        setWeather(null)
        setWeatherLoading(false)
        setWeatherFetchedAt(null)
      })

    return () => {
      active = false
    }
  }, [selectedDistrict])
  const [formError, setFormError] = useState<string | null>(null)

  // Language is global now: the single selector in the layout drives it, and the
  // provider handles persistence + restore. This page just reads the value.
  const { language, t } = useLanguage()

  // Load the session + district options once on mount.
  useEffect(() => {
    let active = true

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return
      if (!user) {
        setInitState('unauthenticated')
        return
      }

      const [{ data: districtRows, error: districtError }, { data: profile }] = await Promise.all([
        supabase.from('districts').select('id, name, state, latitude, longitude').order('name'),
        supabase.from('users').select('district_id').eq('id', user.id).single(),
      ])

      if (!active) return
      if (districtError || !districtRows || districtRows.length === 0) {
        setInitState('error')
        return
      }

      setDistricts(districtRows)
      const preferred = profile?.district_id
      const defaultDistrict = preferred && districtRows.find((d) => d.id === preferred)
        ? districtRows.find((d) => d.id === preferred)
        : districtRows[0]

      if (defaultDistrict) {
        setSelectedState(defaultDistrict.state)
        setDistrictId(defaultDistrict.id)
      }
      setInitState('ready')
    }

    init()
    return () => {
      active = false
    }
  }, [supabase])

  // Scroll result into view after it appears.
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [result])

  // Shared request used by both the generate button and language switching.
  // `lang` is passed explicitly (not read from state) so an immediate re-fetch
  // after a language change uses the new value without waiting for a re-render.
  async function requestRecommendation(
    targetSoil: SoilTypeId,
    lang: LanguageCode,
    overrideDistrictId?: string,
  ) {
    // `overrideDistrictId` lets callers (e.g. demo presets) pass a freshly
    // selected district without waiting for the `districtId` state to settle,
    // so the request never races the setState that selected it.
    const targetDistrictId = overrideDistrictId ?? districtId
    if (!targetDistrictId || submitting) return

    setSubmitting(true)
    setFormError(null)
    setResult(null)

    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district_id: targetDistrictId,
          soil_type: targetSoil,
          target_lang: lang,
        }),
      })
      const data: Recommendation & { error?: string } = await res.json()

      if (!res.ok) {
        setFormError(data?.error ?? t('errors.generic'))
        return
      }
      setResult(data)
    } catch {
      setFormError(t('errors.network'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleGenerate() {
    if (!soil) return
    requestRecommendation(soil, language)
  }

  // Invoked by the demo preset chips: kicks off the existing workflow with the
  // preset's explicit soil + district so it can't read stale state.
  function handlePresetGenerate(presetSoil: SoilTypeId, presetDistrictId: string) {
    requestRecommendation(presetSoil, language, presetDistrictId)
  }

  // When the global language changes and a result is already on screen,
  // re-request it in the new language. The initial mount (and the provider's
  // post-hydration restore, which fires before any result exists) is skipped.
  const prevLanguageRef = useRef(language)
  useEffect(() => {
    if (prevLanguageRef.current === language) return
    prevLanguageRef.current = language
    if (result && soil && !submitting) {
      // Re-request the recommendation in the newly selected language. This is a
      // deliberate reaction to external (context) state, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional re-fetch on language change
      requestRecommendation(soil, language)
    }
    // Re-run only when `language` changes; requestRecommendation is a stable
    // closure over current component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  function handleReset() {
    setResult(null)
    setFormError(null)
    setSoil(null)
  }

  const canGenerate = initState === 'ready' && !!soil && !!districtId && !submitting

  return (
    <main className="min-h-screen bg-slate-50 font-sans" aria-busy={submitting}>
      {/* Nav breadcrumb */}
      <div className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-12 w-full max-w-2xl items-center gap-2 px-5 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded"
          >
            {ArrowLeftIcon}
            <span>{t('recommendation.back')}</span>
          </Link>
          <span className="text-slate-200" aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="text-primary-green">{LeafIcon}</span>
            {t('recommendation.cropAdvisory')}
          </span>
          {/* Language is chosen from the single global selector (bottom-right). */}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
        {/* Header */}
        <header className="mb-9">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {t('recommendation.findCropTitle')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {t('recommendation.findCropDetail')}
          </p>
        </header>

        {initState === 'loading' && <InitSkeleton />}

        {initState === 'unauthenticated' && (
          <NoticeCard
            title={t('recommendation.pleaseSignIn')}
            body={t('recommendation.signInDetail')}
            action={
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-lg bg-primary-green px-4 text-sm font-medium text-white transition-colors hover:bg-primary-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
              >
                {t('recommendation.goToSignIn')}
              </Link>
            }
          />
        )}

        {initState === 'error' && (
          <NoticeCard
            title={t('recommendation.loadDistrictsFailed')}
            body={t('recommendation.loadDistrictsFailedDetail')}
          />
        )}

        {initState === 'ready' && (
          <>
            {/* Demo preset chips — one-click scenarios for judges. Populate the
                form state below and trigger the existing workflow. */}
            <DemoPresetChips
              districts={districts}
              setState={setSelectedState}
              setDistrict={setDistrictId}
              setSoilType={setSoil}
              setMoisture={setSoilMoisture}
              onGenerate={handlePresetGenerate}
              submitting={submitting}
            />

            {/* State */}
            <section className="mb-6">
              <label htmlFor="state" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('recommendation.form.state')}
              </label>
              <div className="relative">
                <select
                  id="state"
                  value={selectedState}
                  onChange={(e) => {
                    const nextState = e.target.value
                    setSelectedState(nextState)
                    // Auto-select the first district in the new state
                    const firstInState = districts.find((d) => d.state === nextState)
                    if (firstInState) {
                      setDistrictId(firstInState.id)
                    }
                  }}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-primary-green focus:outline-none focus:ring-4 focus:ring-primary-green/10"
                >
                  {states.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {ChevronIcon}
                </span>
              </div>
            </section>

            {/* District */}
            <section className="mb-6">
              <label htmlFor="district" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('recommendation.form.district')}
              </label>
              <div className="relative">
                <select
                  id="district"
                  value={districtId}
                  onChange={(e) => setDistrictId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-primary-green focus:outline-none focus:ring-4 focus:ring-primary-green/10"
                >
                  {filteredDistricts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {ChevronIcon}
                </span>
              </div>
            </section>

            {/* GIS Centerpiece Map and HUD */}
            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <IndiaMap
                districts={districts}
                selectedState={selectedState}
                selectedDistrictId={districtId}
                onStateSelect={(stateName) => {
                  setSelectedState(stateName)
                  const firstInState = districts.find((d) => d.state === stateName)
                  if (firstInState) {
                    setDistrictId(firstInState.id)
                  }
                }}
                onDistrictSelect={(distId) => {
                  setDistrictId(distId)
                }}
              />
              <DistrictInfoCard
                districtName={selectedDistrict?.name ?? ''}
                stateName={selectedDistrict?.state ?? ''}
                soilType={soil}
                weather={weather}
                weatherLoading={weatherLoading}
                vegetationScore={vegetationScore}
                vegetationStatus={vegetationStatus}
                aiAdvisory={vegetationAdvice}
                aiAdvisoryLoading={vegetationAdviceLoading}
                recommendedCrop={result?.crop_name ?? null}
                recommendationConfidence={result?.confidence_score ?? null}
              />
            </div>

            <SatelliteMap
              latitude={selectedDistrict?.latitude ?? null}
              longitude={selectedDistrict?.longitude ?? null}
              districtName={selectedDistrict ? `${selectedDistrict.name}, ${selectedDistrict.state}` : ''}
            />

            {/* Vegetation & Moisture Index — hero feature. Estimates field
                health from live 7-day rainfall + a manual soil-moisture reading;
                independent of the crop-recommendation flow below. */}
            <VegetationIndexCard
              latitude={selectedDistrict?.latitude ?? null}
              longitude={selectedDistrict?.longitude ?? null}
              districtName={selectedDistrict?.name ?? ''}
              stateName={selectedDistrict?.state ?? ''}
              externalWeather={weather}
              externalWeatherLoading={weatherLoading}
              externalFetchedAt={weatherFetchedAt}
              soilMoisture={soilMoisture}
              onSoilMoistureChange={setSoilMoisture}
              onIndexChange={(score, status) => {
                setVegetationScore(score)
                setVegetationStatus(status)
              }}
              onAdviceChange={(advice, loading) => {
                setVegetationAdvice(advice)
                setVegetationAdviceLoading(loading)
              }}
            />

            {/* Soil selection */}
            <section className="mb-7">
              <fieldset>
                <legend className="mb-2.5 text-sm font-medium text-slate-700">{t('recommendation.form.soilType')}</legend>
                <div role="radiogroup" aria-label={t('recommendation.form.soilType')} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SOIL_TYPES.map((option) => {
                    const selected = soil === option.id
                    const detail = SOIL_DETAILS[option.id]
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setSoil(option.id)}
                        className={[
                          'group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 focus-visible:ring-offset-1',
                          selected
                            ? 'border-primary-green bg-primary-green/5 shadow-sm ring-1 ring-primary-green/10'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                            selected
                              ? 'bg-primary-green/10 text-primary-green'
                              : 'bg-slate-100 text-slate-500 group-hover:text-slate-600',
                          ].join(' ')}
                        >
                          <span className="h-5 w-5">{detail.icon}</span>
                        </span>

                        <span className="min-w-0 flex-1 pt-0.5">
                          <span className="block text-sm font-medium text-slate-900">
                            {t(`soil.${option.id}.label` as TranslationKey)}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                            {t(`soil.${option.id}.desc` as TranslationKey)}
                          </span>
                        </span>

                        <span
                          className={[
                            'absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full text-white transition-all duration-200',
                            selected ? 'scale-100 bg-primary-green opacity-100' : 'scale-75 opacity-0',
                          ].join(' ')}
                          aria-hidden="true"
                        >
                          {CheckIcon}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </section>

            {/* Generate */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-green text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-primary-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {submitting ? (
                  <>
                    <LoadingDots />
                    <span>{t('recommendation.form.generating')}</span>
                  </>
                ) : (
                  t('recommendation.form.generateBtn')
                )}
              </button>

              {!soil && (
                <p className="text-center text-xs text-slate-400">
                  {t('recommendation.form.selectSoilPrompt')}
                </p>
              )}
            </div>

            {/* Error */}
            {formError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 text-sm text-rose-700"
              >
                <span className="mt-0.5 shrink-0 text-rose-500">{WarningIcon}</span>
                <p className="leading-relaxed">{formError}</p>
              </div>
            )}

            {/* Loading skeleton */}
            {submitting && <ResultSkeleton />}

            {/* Result */}
            {!submitting && result && (
              <ResultCard
                ref={resultRef}
                result={result}
                language={language}
                onReset={handleReset}
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}

// ── Result card ─────────────────────────────────────────────────────────────

const ResultCard = forwardRef<
  HTMLElement,
  { result: Recommendation; language: LanguageCode; onReset: () => void }
>(
  function ResultCard({ result, language, onReset }, ref) {
    const { t } = useLanguage()
    const confidence = confidenceStyle(result.confidence_score)
    const percent = Math.round(result.confidence_score * 100)

    // Reasoning + both tips follow the active language; everything else
    // (crop name, confidence, dry-spell) always stays English. Falls back to
    // English automatically when a translation is missing.
    const fields = displayFields(result, language)

    return (
      <EntranceAnimation>
        <section
          ref={ref}
          aria-live="polite"
          aria-label="Recommendation result"
          className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="p-5 sm:p-6">
            {/* Crop name + badge */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                  {t('recommendation.result.recommendedCrop')}
                </p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
                  {t(getCropTranslationKey(result.crop_name))}
                </h2>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${confidence.bg} ${confidence.text} ${confidence.ring}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${confidence.dot}`} />
                {formatNumber(percent, language)}%
              </span>
            </div>

            {/* Confidence bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-[0.07em]">{t('recommendation.result.confidence')}</span>
                <span className={`text-[11px] font-semibold ${confidence.text}`}>
                  {confidence.label === 'High confidence' ? t('disease.confidence.high') :
                   confidence.label === 'Moderate confidence' ? t('disease.confidence.moderate') :
                   confidence.label === 'Low confidence' ? t('disease.confidence.low') : confidence.label}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${t('recommendation.result.confidence')}: ${formatNumber(percent, language)}%`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ${confidence.bar}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            {/* Reasoning */}
            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">{t('recommendation.result.whyThisCrop')}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{fields.reasoning}</p>
              <ListenButton
                text={fields.reasoning}
                languageCode={toSpeechLocale(language)}
              />
            </div>

            {/* Weather signal */}
            <div className="mt-5">
              {result.is_dry_spell ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-accent-amber/20 bg-accent-amber/5 p-3.5">
                  <span className="mt-0.5 shrink-0 text-accent-amber">{WarningIcon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t('recommendation.result.drySpell')}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {t('recommendation.result.drySpellDetail')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="mt-0.5 shrink-0 text-primary-green">{DropIcon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{t('recommendation.result.adequateRain')}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {t('recommendation.result.adequateRainDetail')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {result.error && (
              <p className="mt-4 text-xs leading-relaxed text-slate-400">
                {t('recommendation.result.fallbackAdvice')}
              </p>
            )}
          </div>

          {/* Footer action */}
          <div className="border-t border-slate-100 px-5 py-3.5 sm:px-6">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded"
            >
              {RefreshIcon}
              {t('recommendation.result.tryDifferentSoil')}
            </button>
          </div>
        </section>

        {/* Advisory cards — sit directly below the recommendation card and share
            its spacing, radius, and subtle green theme. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AdvisoryCard
            emoji="🌱"
            title={t('recommendation.advisory.fertilizationTip')}
            body={fields.fertilization_tip?.trim() ? fields.fertilization_tip : t('recommendation.advisory.unavailable')}
            languageCode={toSpeechLocale(language)}
          />
          <AdvisoryCard
            emoji="💧"
            title={t('recommendation.advisory.irrigationAdvice')}
            body={fields.irrigation_advice?.trim() ? fields.irrigation_advice : t('recommendation.advisory.unavailable')}
            languageCode={toSpeechLocale(language)}
          />
        </div>
      </EntranceAnimation>
    )
  },
)

// ── Advisory card (fertilization / irrigation) ──────────────────────────────

/**
 * A compact card matching the recommendation card's design system: same border
 * radius, border, shadow, and typography, with a subtle green accent header.
 */
function AdvisoryCard({
  emoji,
  title,
  body,
  languageCode,
}: {
  emoji: string
  title: string
  body: string
  languageCode: string
}) {
  const { t } = useLanguage()
  return (
    <section className="rounded-2xl border border-primary-green/15 bg-primary-green/5 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-green/10 text-base"
          aria-hidden="true"
        >
          {emoji}
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-primary-green">
          {title}
        </h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
      {body !== t('recommendation.advisory.unavailable') && (
        <ListenButton text={body} languageCode={languageCode} />
      )}
    </section>
  )
}

// ── Loading skeleton (mirrors the result card) ──────────────────────────────

function ResultSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="animate-pulse p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5">
            <div className="h-2 w-28 rounded bg-slate-100" />
            <div className="h-7 w-44 rounded-md bg-slate-200" />
          </div>
          <div className="h-6 w-20 rounded-full bg-slate-100" />
        </div>
        {/* Confidence bar skeleton */}
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between">
            <div className="h-2 w-20 rounded bg-slate-100" />
            <div className="h-2 w-24 rounded bg-slate-100" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100" />
        </div>
        {/* Reasoning skeleton */}
        <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
          <div className="h-2 w-24 rounded bg-slate-100" />
          <div className="h-3.5 w-full rounded bg-slate-100" />
          <div className="h-3.5 w-11/12 rounded bg-slate-100" />
          <div className="h-3.5 w-4/5 rounded bg-slate-100" />
        </div>
        {/* Weather signal skeleton */}
        <div className="mt-5 h-16 w-full rounded-xl bg-slate-100" />
      </div>
      <div className="border-t border-slate-100 px-6 py-3.5 sm:px-7">
        <div className="h-3.5 w-36 rounded bg-slate-100" />
      </div>
    </section>
  )
}

// ── Page init skeleton ──────────────────────────────────────────────────────

function InitSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      {/* District skeleton */}
      <div className="space-y-1.5">
        <div className="h-3.5 w-16 rounded bg-slate-200" />
        <div className="h-10 w-full rounded-lg bg-slate-200" />
      </div>
      {/* Soil grid skeleton */}
      <div className="space-y-2.5">
        <div className="h-3.5 w-20 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
      {/* Button skeleton */}
      <div className="h-11 w-full rounded-lg bg-slate-200" />
    </div>
  )
}

// ── Small building blocks ───────────────────────────────────────────────────

function NoticeCard({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <EmptyState
      title={title}
      description={body}
      action={action}
    />
  )
}

function LoadingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}
