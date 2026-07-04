'use client'

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
  if (latitude === null || longitude === null) {
    return (
      <div className="flex h-[200px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-500">
        <p className="text-sm font-medium">Select a district to view satellite imagery</p>
      </div>
    )
  }

  const embedUrl = `https://maps.google.com/maps?q=${latitude},${longitude}&t=k&z=11&output=embed`

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm mb-6">
      <div className="border-b border-slate-100 px-4 py-2 bg-slate-50/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Satellite View — {districtName}
        </h3>
      </div>
      <div className="relative h-[200px] w-full bg-slate-100">
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          title={`Satellite view of ${districtName}`}
        />
      </div>
      <div className="border-t border-slate-100 px-4 py-1.5 bg-slate-50/50 text-[10px] text-slate-400 text-right">
        Powered by Google Maps
      </div>
    </section>
  )
}
