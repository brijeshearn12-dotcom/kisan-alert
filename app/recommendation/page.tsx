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

function langToLanguageCode(
  lang: 'en' | 'hi' | 'te' | 'mr'
): 'en-IN' | 'hi-IN' | 'te-IN' | 'mr-IN' {
  switch (lang) {
    case 'en':
      return 'en-IN'
    case 'hi':
      return 'hi-IN'
    case 'te':
      return 'te-IN'
    case 'mr':
      return 'mr-IN'
    default:
      return 'en-IN'
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface District {
  id: string
  name: string
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

type LanguageCode = 'en' | 'hi' | 'te' | 'mr'

const LANGUAGE_STORAGE_KEY = 'preferredLanguage'

interface LanguageOption {
  code: LanguageCode
  label: string
  flag: string
}

/** Selector options. Flags are emoji so no image assets are required. */
const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'te', label: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', label: 'मराठी', flag: '🇮🇳' },
]

/** Narrow an arbitrary string (e.g. from localStorage) to a supported code. */
function isLanguageCode(value: string | null): value is LanguageCode {
  return value === 'en' || value === 'hi' || value === 'te' || value === 'mr'
}

/**
 * Resolve which advisory copy to show for the active language.
 * Falls back to English whenever a translation is missing (Task 7).
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
  const [districtId, setDistrictId] = useState('')
  const [soil, setSoil] = useState<SoilTypeId | null>(null)

  const selectedDistrict = useMemo(() => {
    return districts.find((d) => d.id === districtId) || null
  }, [districts, districtId])

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Recommendation | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [language, setLanguage] = useState<LanguageCode>('en')

  // Restore the saved language preference once on mount (Task 4). This must run
  // in an effect — not a lazy useState initializer — because localStorage does
  // not exist during SSR, so initializing from it would cause a hydration
  // mismatch. Server + first client render use 'en', then we sync to the saved
  // value. The set-state-in-effect rule is intentionally suppressed here.
  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguageCode(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing persisted client-only preference post-hydration
      setLanguage(saved)
    }
  }, [])

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
        supabase.from('districts').select('id, name, latitude, longitude').order('name'),
        supabase.from('users').select('district_id').eq('id', user.id).single(),
      ])

      if (!active) return
      if (districtError || !districtRows || districtRows.length === 0) {
        setInitState('error')
        return
      }

      setDistricts(districtRows)
      const preferred = profile?.district_id
      setDistrictId(
        preferred && districtRows.some((d) => d.id === preferred) ? preferred : districtRows[0].id,
      )
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
  async function requestRecommendation(targetSoil: SoilTypeId, lang: LanguageCode) {
    if (!districtId || submitting) return

    setSubmitting(true)
    setFormError(null)
    setResult(null)

    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district_id: districtId,
          soil_type: targetSoil,
          target_lang: lang,
        }),
      })
      const data: Recommendation & { error?: string } = await res.json()

      if (!res.ok) {
        setFormError(data?.error ?? 'We could not generate a recommendation. Please try again.')
        return
      }
      setResult(data)
    } catch {
      setFormError('Network error. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleGenerate() {
    if (!soil) return
    requestRecommendation(soil, language)
  }

  // Change language: update state, persist to localStorage (Task 4), and — if a
  // result is already on screen — re-request it in the newly selected language.
  function handleLanguageChange(next: LanguageCode) {
    if (next === language) return
    setLanguage(next)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    if (result && soil && !submitting) {
      requestRecommendation(soil, next)
    }
  }

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
            href="/login"
            className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded"
          >
            {ArrowLeftIcon}
            <span>Back</span>
          </Link>
          <span className="text-slate-200" aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="text-primary-green">{LeafIcon}</span>
            Crop Advisory
          </span>

          {/* Language selector — compact, sits above the recommendation card. */}
          <div className="ml-auto">
            <LanguageSelector value={language} onChange={handleLanguageChange} disabled={submitting} />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
        {/* Header */}
        <header className="mb-9">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Find the right crop for your field
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Select your soil type and district. We&apos;ll use live weather data and AI to
            recommend the best crop for this season.
          </p>
        </header>

        {initState === 'loading' && <InitSkeleton />}

        {initState === 'unauthenticated' && (
          <NoticeCard
            title="Please sign in"
            body="You need to be signed in to generate a crop recommendation."
            action={
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-lg bg-primary-green px-4 text-sm font-medium text-white transition-colors hover:bg-primary-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
              >
                Go to sign in
              </Link>
            }
          />
        )}

        {initState === 'error' && (
          <NoticeCard
            title="Something went wrong"
            body="We couldn't load your districts. Please refresh the page and try again."
          />
        )}

        {initState === 'ready' && (
          <>
            {/* District */}
            <section className="mb-6">
              <label htmlFor="district" className="mb-1.5 block text-sm font-medium text-slate-700">
                District
              </label>
              <div className="relative">
                <select
                  id="district"
                  value={districtId}
                  onChange={(e) => setDistrictId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-primary-green focus:outline-none focus:ring-4 focus:ring-primary-green/10"
                >
                  {districts.map((d) => (
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

            <SatelliteMap
              latitude={selectedDistrict?.latitude ?? null}
              longitude={selectedDistrict?.longitude ?? null}
              districtName={selectedDistrict?.name ?? ''}
            />

            {/* Soil selection */}
            <section className="mb-7">
              <fieldset>
                <legend className="mb-2.5 text-sm font-medium text-slate-700">Soil type</legend>
                <div role="radiogroup" aria-label="Soil type" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                            {detail.description}
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
                    <span>Analysing your field…</span>
                  </>
                ) : (
                  'Generate recommendation'
                )}
              </button>

              {!soil && (
                <p className="text-center text-xs text-slate-400">
                  Select a soil type above to continue
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
                  Recommended crop
                </p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
                  {result.crop_name}
                </h2>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${confidence.bg} ${confidence.text} ${confidence.ring}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${confidence.dot}`} />
                {percent}%
              </span>
            </div>

            {/* Confidence bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-[0.07em]">Confidence</span>
                <span className={`text-[11px] font-semibold ${confidence.text}`}>{confidence.label}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Confidence: ${percent}%`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ${confidence.bar}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            {/* Reasoning */}
            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">Why this crop</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{fields.reasoning}</p>
              <ListenButton
                text={fields.reasoning}
                languageCode={langToLanguageCode(language)}
              />
            </div>

            {/* Weather signal */}
            <div className="mt-5">
              {result.is_dry_spell ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-accent-amber/20 bg-accent-amber/5 p-3.5">
                  <span className="mt-0.5 shrink-0 text-accent-amber">{WarningIcon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Dry spell expected</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      Low rainfall forecast this week. Plan irrigation accordingly.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="mt-0.5 shrink-0 text-primary-green">{DropIcon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Adequate rainfall expected</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      No dry spell forecast for the coming week.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {result.error && (
              <p className="mt-4 text-xs leading-relaxed text-slate-400">
                Showing a safe fallback recommendation while the AI service is unavailable.
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
              Try a different soil type
            </button>
          </div>
        </section>

        {/* Advisory cards — sit directly below the recommendation card and share
            its spacing, radius, and subtle green theme. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AdvisoryCard
            emoji="🌱"
            title="Fertilization Tip"
            body={fields.fertilization_tip?.trim() ? fields.fertilization_tip : 'No recommendation available.'}
            languageCode={langToLanguageCode(language)}
          />
          <AdvisoryCard
            emoji="💧"
            title="Irrigation Advice"
            body={fields.irrigation_advice?.trim() ? fields.irrigation_advice : 'No recommendation available.'}
            languageCode={langToLanguageCode(language)}
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
      {body !== 'No recommendation available.' && (
        <ListenButton text={body} languageCode={languageCode} />
      )}
    </section>
  )
}

// ── Language selector ───────────────────────────────────────────────────────

/**
 * Compact, rounded language dropdown with a small circular flag badge and soft
 * shadow. A native <select> keeps it fully accessible and mobile-friendly while
 * matching the page's slate/green palette and spacing.
 */
function LanguageSelector({
  value,
  onChange,
  disabled,
}: {
  value: LanguageCode
  onChange: (next: LanguageCode) => void
  disabled?: boolean
}) {
  const active = LANGUAGES.find((l) => l.code === value) ?? LANGUAGES[0]

  return (
    <label
      className={[
        'group relative flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-1 pr-6 shadow-sm transition-colors',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-300',
      ].join(' ')}
    >
      {/* Circular flag badge */}
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-50 text-sm leading-none ring-1 ring-inset ring-slate-100"
        aria-hidden="true"
      >
        {active.flag}
      </span>
      <span className="text-xs font-medium text-slate-600">{active.label}</span>

      {/* The real control fills the label so the whole chip is clickable. */}
      <select
        aria-label="Recommendation language"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as LanguageCode)}
        className="absolute inset-0 h-full w-full cursor-[inherit] appearance-none rounded-full bg-transparent text-transparent opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="text-slate-900">
            {l.flag} {l.label}
          </option>
        ))}
      </select>

      {/* Chevron */}
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
        {ChevronIcon}
      </span>
    </label>
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
