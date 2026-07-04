'use client'

interface SoilMoistureSliderProps {
  value: number
  onChange: (value: number) => void
}

export default function SoilMoistureSlider({
  value,
  onChange,
}: SoilMoistureSliderProps) {
  // Interpretation styling
  let statusText = 'Adequate: No irrigation needed'
  let statusStyle = 'bg-blue-50 text-blue-700 border-blue-200/50'
  let dotStyle = 'bg-blue-500'

  if (value <= 30) {
    statusText = 'Low: Consider irrigating'
    statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200/50'
    dotStyle = 'bg-emerald-500'
  } else if (value <= 60) {
    statusText = 'Moderate: Monitor soil moisture'
    statusStyle = 'bg-amber-50 text-amber-600 border-amber-200/50'
    dotStyle = 'bg-amber-500'
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Soil Moisture Sensor
        </span>
        <span className="text-sm font-bold text-slate-800">{value}%</span>
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
