'use client'

import React from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { type TranslationKey, formatNumber } from '@/lib/i18n/translations'
import type { CurrentWeather } from '@/lib/weather'
import { type MoistureLevel } from '@/lib/vegetationIndex'

interface EnvironmentalConditionsCardProps {
  weather: CurrentWeather | null
  weatherLoading: boolean
  vegetationStatus: string | null
  moistureLevel: MoistureLevel
  moisturePercent: number
}

const ThermometerIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0Z" />
  </svg>
)

const DropletIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.5 6.5 9a7 7 0 1 0 11 0L12 2.5Z" />
  </svg>
)

const RainIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16" y1="13" x2="16" y2="21" />
    <line x1="8" y1="13" x2="8" y2="21" />
    <line x1="12" y1="15" x2="12" y2="23" />
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
  </svg>
)

const SproutIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 20h10" />
    <path d="M10 20c0-3.5 1-6.5 2-10 1.3 3.5 2.2 6.5 2 10" />
    <path d="M12 4a6 6 0 0 1 6 6c0 1.5-1.5 2.5-3 3-.5-1.5-.5-3-.5-3" />
    <path d="M12 4a6 6 0 0 0-6 6c0 1.5 1.5 2.5 3 3 .5-1.5.5-3 .5-3" />
  </svg>
)

const SoilIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
    <path d="M6 12h12" />
    <path d="M12 6v12" />
  </svg>
)

export default function EnvironmentalConditionsCard({
  weather,
  weatherLoading,
  vegetationStatus,
  moistureLevel,
}: EnvironmentalConditionsCardProps) {
  const { t, language } = useLanguage()

  const getVegetationBadgeClass = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'parched':
      case 'critical':
        return 'bg-rose-50 text-rose-700 ring-rose-600/10'
      case 'stressed':
        return 'bg-amber-50 text-amber-700 ring-amber-600/10'
      case 'saturated':
        return 'bg-blue-50 text-blue-700 ring-blue-700/10'
      case 'healthy':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
      default:
        return 'bg-slate-50 text-slate-600 ring-slate-500/10'
    }
  }

  const getTranslatedVegStatus = (status: string | null) => {
    if (!status) return t('hud.unselected')
    const s = status.toLowerCase()
    if (s === 'parched') return t('veg.status.parched')
    if (s === 'critical') return t('veg.status.critical')
    if (s === 'stressed') return t('veg.status.stressed')
    if (s === 'saturated') return t('veg.status.saturated')
    if (s === 'healthy') return t('veg.status.healthy')
    return status
  }

  const getMoistureBadgeClass = (level: MoistureLevel) => {
    switch (level) {
      case 'low':
        return 'bg-amber-50 text-amber-700 ring-amber-600/10'
      case 'moderate':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
      case 'high':
        return 'bg-blue-50 text-blue-700 ring-blue-700/10'
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 mb-4">
        {t('recommendation.section.environmental')}
      </h3>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        {/* Temperature */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 text-center">
          <div className="flex justify-center text-slate-400 mb-1">{ThermometerIcon}</div>
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
            {t('recommendation.env.temperature')}
          </span>
          <div className="mt-1.5">
            {weatherLoading ? (
              <div className="mx-auto h-5 w-12 animate-pulse rounded bg-slate-200" />
            ) : (
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {weather ? `${formatNumber(Math.round(weather.temperature), language)}°C` : '—'}
              </span>
            )}
          </div>
        </div>

        {/* Humidity */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 text-center">
          <div className="flex justify-center text-slate-400 mb-1">{DropletIcon}</div>
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
            {t('recommendation.env.humidity')}
          </span>
          <div className="mt-1.5">
            {weatherLoading ? (
              <div className="mx-auto h-5 w-12 animate-pulse rounded bg-slate-200" />
            ) : (
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {weather ? `${formatNumber(Math.round(weather.humidity), language)}%` : '—'}
              </span>
            )}
          </div>
        </div>

        {/* Rainfall */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 text-center">
          <div className="flex justify-center text-slate-400 mb-1">{RainIcon}</div>
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
            {t('recommendation.env.rainfall')}
          </span>
          <div className="mt-1.5">
            {weatherLoading ? (
              <div className="mx-auto h-5 w-12 animate-pulse rounded bg-slate-200" />
            ) : (
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {weather ? `${formatNumber(weather.rainfall, language)} mm` : '—'}
              </span>
            )}
          </div>
        </div>

        {/* Vegetation Status */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 text-center">
          <div className="flex justify-center text-slate-400 mb-1">{SproutIcon}</div>
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
            {t('recommendation.env.vegetation')}
          </span>
          <div className="mt-1.5 flex justify-center">
            {weatherLoading ? (
              <div className="h-5 w-16 animate-pulse rounded bg-slate-200" />
            ) : (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${getVegetationBadgeClass(vegetationStatus)}`}>
                {getTranslatedVegStatus(vegetationStatus)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Estimated Soil Moisture Sub-card */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-green/10 text-primary-green">
          {SoilIcon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('recommendation.moisture.title')}
          </h4>
          <div className="mt-1.5 flex items-center gap-2">
            {weatherLoading ? (
              <div className="h-6 w-20 animate-pulse rounded bg-slate-200" />
            ) : (
              <>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${getMoistureBadgeClass(moistureLevel)}`}>
                  {t(`recommendation.moisture.${moistureLevel}` as TranslationKey)}
                </span>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            {t('recommendation.moisture.auto')}
          </p>
        </div>
      </div>
    </div>
  )
}
