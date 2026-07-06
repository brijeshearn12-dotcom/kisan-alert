'use client'

/**
 * DistrictInfoCard.tsx
 * -----------------------------------------------------------------------------
 * GIS Dashboard Intelligence HUD.
 *
 * Displays:
 * - State & District Names with geographic badges.
 * - Weather conditions (Temperature, Humidity, Rain today).
 * - Soil Type and Vegetation Moisture Index.
 * - Dynamic LLM crop recommendation and agricultural advice.
 * - Hardware-accelerated skeleton loaders for async state updates.
 * -----------------------------------------------------------------------------
 */

import React from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { type TranslationKey, getCropTranslationKey, formatNumber } from '@/lib/i18n/translations'

interface Weather {
  temperature: number
  humidity: number
  rainfall: number
}

interface DistrictInfoCardProps {
  districtName: string
  stateName: string
  soilType: string | null
  weather: Weather | null
  weatherLoading: boolean
  vegetationScore: number | null
  vegetationStatus: string | null
  aiAdvisory: string | null
  aiAdvisoryLoading: boolean
  recommendedCrop: string | null
  recommendationConfidence: number | null
}

const PinIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

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

export default function DistrictInfoCard({
  districtName,
  stateName,
  soilType,
  weather,
  weatherLoading,
  vegetationScore,
  vegetationStatus,
  aiAdvisory,
  aiAdvisoryLoading,
  recommendedCrop,
  recommendationConfidence,
}: DistrictInfoCardProps) {
  const { t, language } = useLanguage()
  
  // Resolve vegetation badge style based on index status
  const getVegetationBadgeClass = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'parched':
        return 'bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/20 dark:text-rose-400'
      case 'stressed':
        return 'bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/20 dark:text-amber-400'
      case 'saturated':
        return 'bg-blue-50 text-blue-700 ring-blue-700/10 dark:bg-blue-950/20 dark:text-blue-400'
      case 'healthy':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/20 dark:text-emerald-400'
      default:
        return 'bg-slate-50 text-slate-600 ring-slate-500/10 dark:bg-slate-800/40 dark:text-slate-400'
    }
  }

  // Translate database soil ids to display labels
  const getSoilLabel = (id: string | null) => {
    if (!id) return t('hud.unselected')
    return t(`soil.${id}.label` as TranslationKey)
  }

  const getTranslatedVegStatus = (status: string | null) => {
    if (!status) return ''
    const s = status.toLowerCase()
    if (s === 'parched') return t('veg.status.parched')
    if (s === 'critical') return t('veg.status.critical')
    if (s === 'stressed') return t('veg.status.stressed')
    if (s === 'saturated') return t('veg.status.saturated')
    if (s === 'healthy') return t('veg.status.healthy')
    return status
  }

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      
      {/* Header Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="text-emerald-500 dark:text-emerald-400">{PinIcon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider">
            {t('hud.title')}
          </span>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {districtName || t('hud.selectDistrict')}
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {stateName || t('hud.india')}
          </p>
        </div>
      </div>

      {/* Grid containing Weather, Soil and Vegetation Index */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {/* Temp Card */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-center dark:border-slate-800 dark:bg-slate-950/50">
          <span className="text-slate-400 dark:text-slate-500">{ThermometerIcon}</span>
          <span className="mt-1 text-[11px] font-medium text-slate-400 uppercase tracking-wide">{t('hud.temp')}</span>
          {weatherLoading ? (
            <div className="mt-1.5 h-4 w-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          ) : (
            <span className="mt-1 text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
              {weather ? `${formatNumber(Math.round(weather.temperature), language)}°C` : '—'}
            </span>
          )}
        </div>

        {/* Humidity Card */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-center dark:border-slate-800 dark:bg-slate-950/50">
          <span className="text-slate-400 dark:text-slate-500">{DropletIcon}</span>
          <span className="mt-1 text-[11px] font-medium text-slate-400 uppercase tracking-wide">{t('hud.humidity')}</span>
          {weatherLoading ? (
            <div className="mt-1.5 h-4 w-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          ) : (
            <span className="mt-1 text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
              {weather ? `${formatNumber(Math.round(weather.humidity), language)}%` : '—'}
            </span>
          )}
        </div>

        {/* Rain Card */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-center dark:border-slate-800 dark:bg-slate-950/50">
          <span className="text-slate-400 dark:text-slate-500">{RainIcon}</span>
          <span className="mt-1 text-[11px] font-medium text-slate-400 uppercase tracking-wide">{t('hud.rain')}</span>
          {weatherLoading ? (
            <div className="mt-1.5 h-4 w-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          ) : (
            <span className="mt-1 text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
              {weather ? `${formatNumber(weather.rainfall, language)} mm` : '—'}
            </span>
          )}
        </div>
      </div>

      {/* Soil Type and Vegetation Score */}
      <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex justify-between items-center text-xs">
          <span className="font-medium text-slate-400 uppercase tracking-wide">{t('hud.soilType')}</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {getSoilLabel(soilType)}
          </span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="font-medium text-slate-400 uppercase tracking-wide">{t('hud.vegScore')}</span>
          {vegetationScore !== null ? (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${getVegetationBadgeClass(vegetationStatus)}`}>
                {getTranslatedVegStatus(vegetationStatus)}
              </span>
              <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                {formatNumber(vegetationScore, language)}/{formatNumber(100, language)}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">—</span>
          )}
        </div>
      </div>

      {/* Crop Recommendation & Advisory Panel */}
      <div className="mt-5 rounded-xl bg-slate-50/50 border border-slate-100 p-4 dark:bg-slate-950/30 dark:border-slate-800/80">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              {t('hud.recommendedCrop')}
            </span>
            <h4 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {recommendedCrop ? t(getCropTranslationKey(recommendedCrop)) : t('hud.generatePrompt')}
            </h4>
          </div>
          {recommendationConfidence !== null && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-950/30 dark:text-emerald-400">
              {t('hud.confPercent', { percent: Math.round(recommendationConfidence * 100) })}
            </span>
          )}
        </div>

        <div className="mt-3 border-t border-slate-200/50 pt-2.5 dark:border-slate-800/50">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {t('hud.advisorySignal')}
          </span>
          {aiAdvisoryLoading ? (
            <div className="mt-2 space-y-1.5 animate-pulse">
              <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {aiAdvisory || t('hud.advisoryPrompt')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
