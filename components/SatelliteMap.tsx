'use client'

import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

interface SatelliteMapProps {
  latitude: number | null
  longitude: number | null
  districtName: string
}

export default function SatelliteMap({
  latitude,
  longitude,
  districtName,
}: SatelliteMapProps) {
  const [loaded, setLoaded] = useState(false)
  const { t } = useLanguage()

  if (latitude === null || longitude === null) {
    return (
      <div className="flex h-[200px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-500">
        <p className="text-sm font-medium">{t('sat.prompt')}</p>
      </div>
    )
  }

  const embedUrl = `https://maps.google.com/maps?q=${latitude},${longitude}&t=k&z=11&output=embed`

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm mb-6">
      <div className="border-b border-slate-100 px-4 py-2 bg-slate-50/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t('sat.title', { district: districtName })}
        </h3>
      </div>
      <div className={`relative h-[200px] w-full bg-slate-200 ${loaded ? '' : 'animate-pulse'}`}>
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          title={t('sat.iframeTitle', { district: districtName })}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <div className="border-t border-slate-100 px-4 py-1.5 bg-slate-50/50 text-[10px] text-slate-400 text-right">
        {t('sat.poweredBy')}
      </div>
    </section>
  )
}
