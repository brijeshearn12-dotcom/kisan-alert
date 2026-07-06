'use client'

/**
 * IndiaMap.tsx
 * -----------------------------------------------------------------------------
 * Hackathon Centerpiece: A high-tech, responsive SVG-based Interactive India Map.
 *
 * Capabilities:
 * - Highlights the selected state with glowing animations.
 * - Project coordinates dynamically onto the 612x696 SVG viewBox.
 * - Displays glowing, pulsing markers for districts.
 * - Supports keyboard navigation, screen readers, and high-contrast accessibility.
 * - Fully integrated with dark mode and hover states.
 * -----------------------------------------------------------------------------
 */

import React, { useMemo } from 'react'
import India from '@svg-maps/india'
import { projectCoordinates } from '@/lib/indiaProjection'
import { useLanguage } from '@/contexts/LanguageContext'

export interface District {
  id: string
  name: string
  state: string
  latitude: number | null
  longitude: number | null
}

interface IndiaMapProps {
  districts: District[]
  selectedState: string
  selectedDistrictId: string
  onStateSelect: (stateName: string) => void
  onDistrictSelect: (districtId: string) => void
}

// Map database state names to @svg-maps/india SVG region IDs
const STATE_TO_REGION_ID: Record<string, string> = {
  'Andhra Pradesh': 'ap',
  'Arunachal Pradesh': 'ar',
  'Assam': 'as',
  'Bihar': 'br',
  'Chhattisgarh': 'ct',
  'Goa': 'ga',
  'Gujarat': 'gj',
  'Haryana': 'hr',
  'Himachal Pradesh': 'hp',
  'Jharkhand': 'jh',
  'Karnataka': 'ka',
  'Kerala': 'kl',
  'Madhya Pradesh': 'mp',
  'Maharashtra': 'mh',
  'Manipur': 'mn',
  'Meghalaya': 'ml',
  'Mizoram': 'mz',
  'Nagaland': 'nl',
  'Odisha': 'or',
  'Punjab': 'pb',
  'Rajasthan': 'rj',
  'Sikkim': 'sk',
  'Tamil Nadu': 'tn',
  'Telangana': 'tg',
  'Tripura': 'tr',
  'Uttar Pradesh': 'up',
  'Uttarakhand': 'ut',
  'West Bengal': 'wb',
}

// Inverted mapping for lookup when clicking on the SVG regions
const REGION_ID_TO_STATE: Record<string, string> = Object.entries(STATE_TO_REGION_ID).reduce(
  (acc, [state, id]) => ({ ...acc, [id]: state }),
  {} as Record<string, string>
)

export default function IndiaMap({
  districts,
  selectedState,
  selectedDistrictId,
  onStateSelect,
  onDistrictSelect,
}: IndiaMapProps) {
  const { t } = useLanguage()

  // Memoize state list from districts to avoid re-calculating on every render
  const seededStates = useMemo(() => {
    return new Set(districts.map((d) => d.state))
  }, [districts])

  // Filter districts that are in the selected state to draw markers
  const activeDistricts = useMemo(() => {
    return districts.filter(
      (d) => d.state === selectedState && d.latitude !== null && d.longitude !== null
    )
  }, [districts, selectedState])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('map.title')}
          </h3>
          <p className="text-[10px] text-slate-400">
            {t('map.instructions')}
          </p>
        </div>
        {selectedState && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/25 dark:bg-emerald-950/30 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            {selectedState}
          </span>
        )}
      </div>

      <div className="relative mx-auto flex max-h-[500px] w-full items-center justify-center p-2">
        <svg
          viewBox={India.viewBox}
          className="h-full max-h-[460px] w-auto select-none transition-transform duration-300 ease-out"
          aria-label={t('map.ariaLabel')}
          role="img"
        >
          {/* Definitions for map glow filters */}
          <defs>
            <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render States Paths */}
          <g id="states-group">
            {India.locations.map((loc) => {
              const regionStateName = REGION_ID_TO_STATE[loc.id] || loc.name
              const isSelected = selectedState.toLowerCase() === regionStateName.toLowerCase()
              const isSeeded = seededStates.has(regionStateName)

              return (
                <path
                  key={loc.id}
                  d={loc.path}
                  id={loc.id}
                  name={loc.name}
                  role="button"
                  tabIndex={0}
                  aria-label={t('map.stateAria', { state: regionStateName })}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (isSeeded) {
                      onStateSelect(regionStateName)
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && isSeeded) {
                      e.preventDefault()
                      onStateSelect(regionStateName)
                    }
                  }}
                  className={[
                    'transition-all duration-300 ease-in-out outline-none border',
                    isSeeded ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
                    isSelected
                      ? 'fill-emerald-500/20 stroke-emerald-600 stroke-[2px] filter drop-shadow-[0_0_6px_rgba(16,185,129,0.35)] dark:stroke-emerald-400'
                      : isSeeded
                      ? 'fill-slate-100 hover:fill-slate-200 stroke-slate-300 hover:stroke-slate-400 dark:fill-slate-800 dark:hover:fill-slate-700 dark:stroke-slate-700'
                      : 'fill-slate-50 stroke-slate-200 dark:fill-slate-950 dark:stroke-slate-900',
                  ].join(' ')}
                />
              )
            })}
          </g>

          {/* Render District Markers */}
          <g id="markers-group">
            {activeDistricts.map((d) => {
              if (d.latitude === null || d.longitude === null) return null
              
              const { x, y } = projectCoordinates(d.latitude, d.longitude)
              const isSelected = d.id === selectedDistrictId

              return (
                <g
                  key={d.id}
                  className="cursor-pointer group outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={t('map.districtAria', { district: d.name })}
                  onClick={() => onDistrictSelect(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onDistrictSelect(d.id)
                    }
                  }}
                >
                  {/* Glowing dynamic pulse rings around selected marker */}
                  {isSelected ? (
                    <circle cx={x} cy={y} r="6" className="fill-emerald-500/40">
                      <animate
                        attributeName="r"
                        values="6;22"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="1;0"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  ) : (
                    <circle cx={x} cy={y} r="4" className="fill-emerald-400/20 opacity-0 group-hover:opacity-100">
                      <animate
                        attributeName="r"
                        values="4;12"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="1;0"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Anchor Point Circle */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 6 : 4}
                    className={[
                      'transition-all duration-300 ease-out',
                      isSelected
                        ? 'fill-emerald-500 stroke-white stroke-[2px] filter drop-shadow-[0_0_8px_rgba(16,185,129,0.8)] dark:fill-emerald-400'
                        : 'fill-slate-400 hover:fill-emerald-500 stroke-white stroke-[1.2px] hover:scale-125 dark:fill-slate-500 dark:stroke-slate-900',
                    ].join(' ')}
                  />

                  {/* Marker Tooltip label */}
                  <title>{d.name}</title>
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
