'use client'

import { useLanguage } from '@/contexts/LanguageContext'
import { formatNumber } from '@/lib/i18n/translations'

interface SoilMoistureSliderProps {
  value: number
  onChange: (value: number) => void
  /**
   * Render without the outer card chrome (border / shadow / padding) so the
   * slider can sit inside another card — e.g. the recommendation form.
   */
  bare?: boolean
}

export default function SoilMoistureSlider({
  value,
  onChange,
  bare = false,
}: SoilMoistureSliderProps) {
  const { t, language } = useLanguage()

  // Interpretation styling
  let statusText = t('soil.moisture.status.adequate')
  let statusStyle = 'bg-blue-50 text-blue-700 border-blue-200/50'
  let dotStyle = 'bg-blue-500'

  if (value <= 30) {
    statusText = t('soil.moisture.status.low')
    statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200/50'
    dotStyle = 'bg-emerald-500'
  } else if (value <= 60) {
    statusText = t('soil.moisture.status.moderate')
    statusStyle = 'bg-amber-50 text-amber-600 border-amber-200/50'
    dotStyle = 'bg-amber-500'
  }

  return (
    <div className={bare ? '' : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('soil.moisture.sensor')}
        </span>
        <span className="text-sm font-bold text-slate-800">{formatNumber(value, language)}%</span>
      </div>

      <div className="mb-4">
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-100 accent-primary-green focus:outline-none"
        />
      </div>

      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${statusStyle}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotStyle}`} />
        <span>{statusText}</span>
      </div>
    </div>
  )
}
