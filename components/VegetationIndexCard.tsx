'use client'

/**
 * VegetationIndexCard
 * -----------------------------------------------------------------------------
 * Hero feature: an estimated Vegetation & Moisture Index for the selected
 * district. It combines LIVE 7-day rainfall (Open-Meteo, via /api/weather) with
 * a manually-entered soil-moisture reading and the season to compute a 0–100
 * index, then explains it with an animated field illustration, a transparent
 * breakdown, and a one-sentence Gemini advisory.
 *
 * All scoring math lives in the pure, unit-tested `lib/vegetationIndex.ts`.
 * This component only renders those results and manages UI state (the slider,
 * fetches, and animations). It is explicitly NOT satellite imagery.
 * -----------------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CurrentWeather } from '@/lib/weather'
import { getSeasonForMonth } from '@/lib/season'
import {
  computeConfidence,
  computeIndex,
  computeTomorrowOutlook,
  type Confidence,
  type VegetationStatus,
} from '@/lib/vegetationIndex'
import { ListenButton } from '@/components/ListenButton'
import SoilMoistureSlider from '@/components/SoilMoistureSlider'
import { useLanguage } from '@/contexts/LanguageContext'
import { toSpeechLocale } from '@/lib/i18n/speech'
import { type TranslationKey, getLanguageMeta } from '@/lib/i18n/translations'

interface VegetationIndexCardProps {
  latitude: number | null
  longitude: number | null
  districtName: string
  stateName: string
  /** If provided, we bypass the internal fetch and reuse the parent's weather data. */
  externalWeather?: CurrentWeather | null
  externalWeatherLoading?: boolean
  externalFetchedAt?: Date | null
  /** Shared soil moisture (0-100), lifted so the parent HUD can display it. */
  soilMoisture: number
  onSoilMoistureChange: (value: number) => void
  /** Bubble updates back to the parent so the HUD card can display them in sync. */
  onIndexChange?: (score: number, status: VegetationStatus) => void
  onAdviceChange?: (advice: string, loading: boolean) => void
}

type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error'

interface BadgeStyle {
  emoji: string
  label: string
  className: string
}

/** Map a status (+ score, to split "critical" out of "parched") to a badge. */
function badgeFor(status: VegetationStatus, score: number): BadgeStyle {
  switch (status) {
    case 'parched':
      return score < 15
        ? { emoji: '🔴', label: 'Critical', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' }
        : { emoji: '🟠', label: 'Parched', className: 'bg-orange-50 text-orange-700 ring-orange-600/20' }
    case 'stressed':
      return { emoji: '🟡', label: 'Stressed', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' }
    case 'healthy':
      return { emoji: '🟢', label: 'Healthy', className: 'bg-primary-green/5 text-primary-green ring-primary-green/20' }
    case 'saturated':
      return { emoji: '🔵', label: 'Saturated', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' }
  }
}

/** Ground fill colour the SVG animates toward for each status. */
function groundColor(status: VegetationStatus): string {
  switch (status) {
    case 'parched':
      return '#B07B4F' // dry brown
    case 'stressed':
      return '#C9A227' // yellowed
    case 'healthy':
      return '#3F9142' // green
    case 'saturated':
      return '#2E7D5B' // deep, wet green
  }
}

const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
  high: { label: 'High', className: 'bg-primary-green/5 text-primary-green ring-primary-green/20' },
  medium: { label: 'Medium', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  low: { label: 'Low', className: 'bg-slate-100 text-slate-500 ring-slate-300/40' },
}

const CheckIcon = (
  <svg
    viewBox="0 0 24 24"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const ChevronIcon = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

// ── Custom Hooks ─────────────────────────────────────────────────────────────

/** Animate numbers counting up to prevent jarring layout jumps during sliding. */
function useCountUp(target: number, reducedMotion: boolean): number {
  const [count, setCount] = useState(target)

  useEffect(() => {
    if (reducedMotion) return

    let active = true
    const start = count
    const end = target
    const duration = 240 // ms
    const startTime = performance.now()

    function animate(now: number) {
      if (!active) return
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      
      setCount(Math.round(start + (end - start) * ease))

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reducedMotion])

  if (reducedMotion) return target
  return count
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VegetationIndexCard({
  latitude,
  longitude,
  districtName,
  stateName,
  externalWeather,
  externalWeatherLoading,
  externalFetchedAt,
  soilMoisture,
  onSoilMoistureChange,
  onIndexChange,
  onAdviceChange,
}: VegetationIndexCardProps) {
  const { t, language } = useLanguage()

  // 1. Local state (fallback when weather isn't provided by parent HUD)
  const [internalWeather, setInternalWeather] = useState<CurrentWeather | null>(null)
  const [internalWeatherStatus, setInternalWeatherStatus] = useState<WeatherStatus>('idle')
  const [internalFetchedAt, setInternalFetchedAt] = useState<Date | null>(null)

  // 2. Local UI states
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [advice, setAdvice] = useState('')
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return false
  })

  // 3. Keep a cache of Gemini replies bucketed by rainfall & moisture to prevent
  // redundant LLM queries as the farmer drags the slider.
  const adviceCache = useRef<Map<string, string>>(new Map())

  // Check user OS/browser animations preference on mount.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])

  // Season is always Kharif/Rabi/Summer based on calendar month (agronomic rules)
  const season = useMemo(() => {
    const month = new Date().getMonth() + 1
    return getSeasonForMonth(month)
  }, [])

  const isExternal = externalWeather !== undefined
  const weather = isExternal ? externalWeather : internalWeather
  const weatherStatus = isExternal
    ? (externalWeatherLoading ? 'loading' as WeatherStatus : (externalWeather ? 'ready' as WeatherStatus : 'error' as WeatherStatus))
    : internalWeatherStatus
  const fetchedAt = isExternal ? externalFetchedAt : internalFetchedAt

  // ── Fetch live weather when the district's coordinates change ──────────────
  useEffect(() => {
    if (isExternal) return
    if (latitude === null || longitude === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when no district is selected
      setInternalWeather(null)
      setInternalWeatherStatus('idle')
      return
    }

    let active = true
    setInternalWeatherStatus('loading')

    fetch(`/api/weather?lat=${latitude}&lon=${longitude}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('weather request failed')
        return res.json() as Promise<{ weather: CurrentWeather | null }>
      })
      .then((data) => {
        if (!active) return
        setInternalWeather(data.weather)
        setInternalWeatherStatus(data.weather ? 'ready' : 'error')
        setInternalFetchedAt(new Date())
      })
      .catch(() => {
        if (!active) return
        setInternalWeather(null)
        setInternalWeatherStatus('error')
      })

    return () => {
      active = false
    }
  }, [latitude, longitude, isExternal])

  const hasRainfall = weatherStatus === 'ready' && weather !== null

  // Total rainfall across the 7-day forecast window (Step 6).
  const rainfallMm7d = useMemo(() => {
    if (!weather) return 0
    return Math.round(
      weather.forecast.reduce((sum, day) => sum + day.precipitation, 0) * 10,
    ) / 10
  }, [weather])

  const index = useMemo(
    () => computeIndex(soilMoisture, rainfallMm7d, season),
    [soilMoisture, rainfallMm7d, season],
  )

  useEffect(() => {
    if (onIndexChange) {
      onIndexChange(index.score, index.status)
    }
  }, [index.score, index.status, onIndexChange])

  useEffect(() => {
    if (onAdviceChange) {
      onAdviceChange(advice, adviceLoading)
    }
  }, [advice, adviceLoading, onAdviceChange])

  const confidence = useMemo(
    () => computeConfidence({ hasRainfall, hasSeason: true, hasSoil: true }),
    [hasRainfall],
  )

  const tomorrow = useMemo(() => {
    if (!weather || weather.forecast.length < 2) return null
    return computeTomorrowOutlook(
      soilMoisture,
      rainfallMm7d,
      season,
      weather.forecast[1].precipitation,
    )
  }, [weather, soilMoisture, rainfallMm7d, season])

  const displayScore = useCountUp(index.score, reducedMotion)

  // ── Debounced + cached Gemini advisory (Step 12 & 13) ──────────────────────
  useEffect(() => {
    if (!hasRainfall) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear advice until live rainfall is available
      setAdvice('')
      return
    }

    // Bucket the volatile inputs so tiny slider nudges reuse the same advice.
    const rainBucket = Math.round(rainfallMm7d / 5) * 5
    const scoreBucket = Math.round(index.score / 5) * 5
    const key = `${districtName}|${stateName}|${season}|${rainBucket}|${index.status}|${scoreBucket}|${language}`

    const cached = adviceCache.current.get(key)
    if (cached) {
      setAdvice(cached)
      setAdviceLoading(false)
      return
    }

    setAdviceLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/vegetation-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            district_name: districtName,
            state_name: stateName,
            season,
            rainfall_mm_7d: rainfallMm7d,
            soil_moisture: soilMoisture,
            score: index.score,
            status: index.status,
            target_lang: language,
          }),
        })
        const data = (await res.json()) as { advice?: string }
        const text = data.advice ?? ''
        if (text) adviceCache.current.set(key, text)
        setAdvice(text)
      } catch {
        setAdvice('')
      } finally {
        setAdviceLoading(false)
      }
    }, 400)

    // Each keystroke on the slider resets the 400ms timer (debounce); the
    // bucketed cache key then prevents redundant Gemini calls for nearby values.
    return () => clearTimeout(timer)
  }, [hasRainfall, districtName, stateName, season, rainfallMm7d, index.score, index.status, soilMoisture, language])

  const badge = badgeFor(index.status, index.score)

  if (latitude === null || longitude === null) {
    return (
      <section className="mb-6 flex h-[160px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center text-slate-500">
        <p className="text-sm font-medium">{t('veg.selectDistrictPrompt')}</p>
      </section>
    )
  }

  const translatedBadgeLabel = 
    badge.label === 'Critical' ? t('veg.status.critical') :
    badge.label === 'Parched' ? t('veg.status.parched') :
    badge.label === 'Stressed' ? t('veg.status.stressed') :
    badge.label === 'Healthy' ? t('veg.status.healthy') :
    badge.label === 'Saturated' ? t('veg.status.saturated') : badge.label

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <span aria-hidden="true">🌿</span>
            {t('veg.indexTitle')}
          </h2>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {districtName} · {t(`season.${season}` as TranslationKey)}
          </p>
        </div>
        <ConfidencePill confidence={confidence} />
      </div>

      <div className="p-5 sm:p-6">
        {/* Live rainfall row */}
        <div className="mb-4">
          {weatherStatus === 'loading' && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-primary-green" aria-hidden="true" />
              {t('veg.fetchingRainfall')}
            </div>
          )}
          {weatherStatus === 'error' && (
            <p className="text-xs font-medium text-amber-600">
              {t('veg.rainfallUnavailable')}
            </p>
          )}
          {hasRainfall && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">🌧</span>
                <span className="font-semibold text-slate-700">{rainfallMm7d} mm</span> {t('veg.rainLabel')}
              </span>
              {weather && (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">🌡</span>
                    <span className="font-semibold text-slate-700">{weather.temperature}°C</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">💦</span>
                    <span className="font-semibold text-slate-700">{weather.humidity}%</span> {t('veg.humidityLabel')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Soil moisture slider (reused component) */}
        <SoilMoistureSlider value={soilMoisture} onChange={onSoilMoistureChange} />

        {/* Animated field illustration */}
        <div className="mt-5">
          <FieldVisualization status={index.status} score={index.score} reducedMotion={reducedMotion} />
        </div>

        {/* Score + status badge */}
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
              {t('veg.estimatedIndex')}
            </p>
            <p className="mt-1 flex items-baseline gap-1 tabular-nums">
              <span className="text-4xl font-semibold tracking-tight text-slate-900">
                {weatherStatus === 'loading' ? '—' : displayScore}
              </span>
              <span className="text-sm font-medium text-slate-400">/ 100</span>
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${badge.className}`}
          >
            <span aria-hidden="true">{badge.emoji}</span>
            {translatedBadgeLabel}
          </span>
        </div>

        {/* Score track */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={index.score} aria-valuemin={0} aria-valuemax={100} aria-label={`${t('veg.estimatedIndex')}: ${index.score} / 100`}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${index.score}%`, backgroundColor: groundColor(index.status) }}
          />
        </div>

        {/* Explainability panel (collapsible) */}
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={() => setBreakdownOpen((v) => !v)}
            aria-expanded={breakdownOpen}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
              {t('veg.howCalculated')}
            </span>
            <span
              className={`text-slate-400 transition-transform duration-200 ${breakdownOpen ? 'rotate-180' : ''}`}
            >
              {ChevronIcon}
            </span>
          </button>
          {breakdownOpen && (
            <dl className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm">
              <BreakdownRow
                label={t('veg.soilMoistureContribution')}
                detail={`${soilMoisture}%`}
                points={index.breakdown.soilContribution}
              />
              <BreakdownRow
                label={t('veg.rainfallContribution')}
                detail={hasRainfall ? `${rainfallMm7d} mm` : 'unavailable'}
                points={index.breakdown.rainfallContribution}
              />
              <BreakdownRow
                label={t('veg.seasonContribution')}
                detail={t(`season.${season}` as TranslationKey)}
                points={index.breakdown.seasonContribution}
              />
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold text-slate-800">
                <dt>{t('veg.totalLabel')}</dt>
                <dd className="tabular-nums">{index.score} pts</dd>
              </div>
            </dl>
          )}
        </div>

        {/* Gemini advisory + Listen */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
            {t('veg.aiAdvisory')}
          </p>
          {adviceLoading && !advice ? (
            <div className="mt-2 space-y-2" aria-hidden="true">
              <p className="text-sm font-medium text-slate-400">{t('veg.generatingAdvisory')}</p>
              <div className="h-3.5 w-11/12 animate-pulse rounded bg-slate-100" />
              <div className="h-3.5 w-3/5 animate-pulse rounded bg-slate-100" />
            </div>
          ) : advice ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{advice}</p>
              <ListenButton text={advice} languageCode={toSpeechLocale(language)} />
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {t('veg.advisoryUnavailable')}
            </p>
          )}
        </div>

        {/* Tomorrow outlook */}
        {tomorrow && <TomorrowOutlookRow score={tomorrow.score} trend={tomorrow.trend} explanation={tomorrow.explanation} />}

        {/* Live inputs panel */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InputsPanel title={t('veg.liveWeather')}>
            <InputRow label={t('hud.rain')} ok={hasRainfall} />
            <InputRow label={t('hud.temp')} ok={hasRainfall} />
            <InputRow label={t('hud.humidity')} ok={hasRainfall} />
          </InputsPanel>
          <InputsPanel title={t('veg.manualInput')}>
            <InputRow label={t('veg.soilMoistureContribution')} ok />
            {fetchedAt && (
              <p className="mt-1 text-[11px] text-slate-400">
                {t('veg.updatedAt', { time: fetchedAt.toLocaleTimeString(getLanguageMeta(language).locale, { hour: '2-digit', minute: '2-digit' }) })}
              </p>
            )}
          </InputsPanel>
        </div>

        {/* Transparency / disclaimer */}
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {t('veg.indexTitle')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {t('veg.derivedDetail')}
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const { t } = useLanguage()
  const style = CONFIDENCE_STYLE[confidence]
  const translatedLabel = 
    confidence === 'high' ? t('disease.confidence.high').replace(' confidence', '').replace(' विश्वास', '').replace(' ಮಟ್ಟ', '').replace(' நம்பிக்கை', '').replace(' నమ్మకం', '').replace(' বিশ্বাস', '') :
    confidence === 'medium' ? t('disease.confidence.moderate').replace(' confidence', '').replace(' विश्वास', '').replace(' ಮಟ್ಟ', '').replace(' நம்பிக்கை', '').replace(' నమ్మకం', '').replace(' বিশ্বাস', '') :
    confidence === 'low' ? t('disease.confidence.low').replace(' confidence', '').replace(' विश्वास', '').replace(' ಮಟ್ಟ', '').replace(' நம்பிக்கை', '').replace(' నమ్మకం', '').replace(' বিশ্বাস', '') : style.label

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${style.className}`}
      title={t('veg.confidenceTooltip')}
    >
      <span className="text-[10px] uppercase tracking-wide opacity-70">{t('veg.confidenceLabel')}</span>
      {translatedLabel}
    </span>
  )
}

function BreakdownRow({
  label,
  detail,
  points,
}: {
  label: string
  detail: string
  points: number
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-slate-600">
        {label}
        <span className="ml-1.5 text-xs text-slate-400">{detail}</span>
      </div>
      <div className="shrink-0 tabular-nums font-medium text-slate-700">{points} pts</div>
    </div>
  )
}

function InputsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function InputRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full ${
          ok ? 'bg-primary-green/10 text-primary-green' : 'bg-slate-100 text-slate-300'
        }`}
        aria-hidden="true"
      >
        {ok ? CheckIcon : <span className="h-1 w-1 rounded-full bg-current" />}
      </span>
      <span>{label}</span>
    </div>
  )
}

function TomorrowOutlookRow({
  score,
  trend,
  explanation,
}: {
  score: number
  trend: 'improving' | 'declining' | 'stable'
  explanation: string
}) {
  const { t } = useLanguage()
  const arrow = trend === 'improving' ? '▲' : trend === 'declining' ? '▼' : '▪'
  const trendClass =
    trend === 'improving'
      ? 'text-primary-green'
      : trend === 'declining'
        ? 'text-rose-600'
        : 'text-slate-400'
  const trendLabel =
    trend === 'improving' ? t('veg.trend.improving') : trend === 'declining' ? t('veg.trend.declining') : t('veg.trend.stable')

  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="shrink-0 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('veg.tomorrow')}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-800">{score}</p>
      </div>
      <div className="min-w-0 border-l border-slate-200 pl-3">
        <p className={`flex items-center gap-1 text-xs font-semibold ${trendClass}`}>
          <span aria-hidden="true">{arrow}</span> {trendLabel}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{explanation}</p>
      </div>
    </div>
  )
}

// ── Animated field illustration (CSS transitions only, no libraries) ──────────

function FieldVisualization({
  status,
  score,
  reducedMotion,
}: {
  status: VegetationStatus
  score: number
  reducedMotion: boolean
}) {
  const { t } = useLanguage()
  const ground = groundColor(status)
  // Grass grows taller with the score; kept within a pleasant range.
  const grassScale = Math.max(0.12, Math.min(1, score / 100))
  const isWet = status === 'saturated'
  const isDry = status === 'parched'
  const transition = reducedMotion ? 'none' : 'all 600ms cubic-bezier(0.16, 1, 0.3, 1)'

  // Five grass blades at fixed x positions, each scaled from the ground line.
  const blades = [40, 95, 160, 225, 280]

  const getTranslatedStatus = (s: VegetationStatus) => {
    if (s === 'parched') return t('veg.status.parched')
    if (s === 'stressed') return t('veg.status.stressed')
    if (s === 'saturated') return t('veg.status.saturated')
    if (s === 'healthy') return t('veg.status.healthy')
    return s
  }

  return (
    <svg
      viewBox="0 0 320 150"
      className="h-auto w-full"
      role="img"
      aria-label={t('veg.sr.illustration', { status: getTranslatedStatus(status), score: score })}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Sky */}
      <defs>
        <linearGradient id="veg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EAF4FB" />
          <stop offset="100%" stopColor="#F7FBFF" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="150" fill="url(#veg-sky)" />

      {/* Sun — brightest in dry conditions, dimmed when wet */}
      <circle
        cx="270"
        cy="34"
        r="18"
        fill="#F2A93B"
        style={{ transition, opacity: isWet ? 0.25 : isDry ? 1 : 0.7 }}
      />

      {/* Cloud — appears as it gets wetter */}
      <g style={{ transition, opacity: isDry ? 0 : isWet ? 1 : 0.6 }}>
        <ellipse cx="70" cy="34" rx="26" ry="14" fill="#FFFFFF" />
        <ellipse cx="94" cy="38" rx="20" ry="12" fill="#F1F5F9" />
        <ellipse cx="48" cy="40" rx="16" ry="10" fill="#F1F5F9" />
      </g>

      {/* Rain droplets — only when saturated */}
      <g style={{ transition, opacity: isWet ? 1 : 0 }} fill="#5FA8D3">
        <path d="M62 54 q3 4 0 7 a3.2 3.2 0 1 1 0 -7Z" />
        <path d="M80 58 q3 4 0 7 a3.2 3.2 0 1 1 0 -7Z" />
        <path d="M98 54 q3 4 0 7 a3.2 3.2 0 1 1 0 -7Z" />
      </g>

      {/* Ground */}
      <rect
        x="0"
        y="112"
        width="320"
        height="38"
        style={{ transition, fill: ground }}
      />
      {/* Soil line highlight */}
      <rect x="0" y="112" width="320" height="3" fill="#00000018" />

      {/* Grass blades — height scales with the score */}
      {blades.map((x, i) => (
        <g key={x} style={{ transition, transform: `translateY(112px) scaleY(${grassScale})`, transformOrigin: `${x}px 112px` }}>
          <path
            d={`M${x} 0 q -6 -22 ${i % 2 === 0 ? -3 : 3} -40`}
            fill="none"
            stroke={isDry ? '#9C7A3C' : status === 'stressed' ? '#B9A13A' : '#2F7D3A'}
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{ transition }}
          />
          <path
            d={`M${x} 0 q 8 -20 4 -34`}
            fill="none"
            stroke={isDry ? '#B08E4E' : status === 'stressed' ? '#C9B44A' : '#3F9142'}
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{ transition }}
          />
        </g>
      ))}
    </svg>
  )
}
