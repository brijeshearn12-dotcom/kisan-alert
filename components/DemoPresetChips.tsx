'use client'

/**
 * DemoPresetChips
 * -----------------------------------------------------------------------------
 * A row of one-click "scenario" chips for live demos. Clicking a chip populates
 * the existing recommendation-form state (state, district, soil type, soil
 * moisture) and then invokes the page's existing recommendation workflow — it
 * does NOT duplicate any recommendation, weather, or Gemini logic.
 *
 * State/district/soil/moisture are applied via the setters passed from the
 * page, so the India map, weather fetch, vegetation index, and advisory all
 * refresh reactively. The crop recommendation is triggered through `onGenerate`
 * with EXPLICIT values (not read from state), so it never races the setState
 * calls above it.
 * -----------------------------------------------------------------------------
 */
import { useState } from 'react'
import type { SoilTypeId } from '@/lib/constants'

/** A demo scenario. `soilId` maps the display soil to an existing SoilTypeId. */
interface DemoPreset {
  id: string
  emoji: string
  soilLabel: string
  soilId: SoilTypeId
  state: string
  district: string
  moisture: number
}

/**
 * The five demo scenarios. Districts must exist in the `districts` table
 * (see seed_districts.sql); any preset whose district is missing is disabled
 * rather than allowed to fail mid-demo. "Alluvial" maps to the closest existing
 * soil type (loamy) so we reuse the shared SOIL_TYPES ids without inventing new
 * ones.
 */
const PRESETS: readonly DemoPreset[] = [
  { id: 'black', emoji: '🌑', soilLabel: 'Black Soil', soilId: 'black_cotton', state: 'Maharashtra', district: 'Pune', moisture: 68 },
  { id: 'alluvial', emoji: '🌾', soilLabel: 'Alluvial Soil', soilId: 'loamy', state: 'Punjab', district: 'Ludhiana', moisture: 82 },
  { id: 'red', emoji: '🟥', soilLabel: 'Red Soil', soilId: 'red', state: 'Karnataka', district: 'Mysuru', moisture: 54 },
  { id: 'arid', emoji: '🏜', soilLabel: 'Arid Sandy Soil', soilId: 'sandy', state: 'Rajasthan', district: 'Jaipur', moisture: 18 },
  { id: 'laterite', emoji: '🌳', soilLabel: 'Laterite Soil', soilId: 'laterite', state: 'West Bengal', district: 'Bardhaman', moisture: 47 },
]

/** Minimal shape needed to resolve a preset to a real district id. */
interface DistrictLike {
  id: string
  name: string
  state: string
}

interface DemoPresetChipsProps {
  districts: DistrictLike[]
  setState: (state: string) => void
  setDistrict: (districtId: string) => void
  setSoilType: (soil: SoilTypeId) => void
  setMoisture: (value: number) => void
  /** Triggers the existing recommendation workflow with explicit, race-free values. */
  onGenerate: (soil: SoilTypeId, districtId: string) => void
  /** True while a recommendation request is in flight. */
  submitting: boolean
}

const SpinnerIcon = (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    className="animate-spin"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

export default function DemoPresetChips({
  districts,
  setState,
  setDistrict,
  setSoilType,
  setMoisture,
  onGenerate,
  submitting,
}: DemoPresetChipsProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  /** Case-insensitive resolve of a preset to a seeded district id, or null. */
  function resolveDistrictId(preset: DemoPreset): string | null {
    const match = districts.find(
      (d) =>
        d.name.toLowerCase() === preset.district.toLowerCase() &&
        d.state.toLowerCase() === preset.state.toLowerCase(),
    )
    return match?.id ?? null
  }

  function handleClick(preset: DemoPreset, districtId: string) {
    if (submitting) return // prevent rapid double-clicks while one is loading
    setActiveId(preset.id)

    // Populate the visible form state → India map, weather, vegetation index and
    // advisory all refresh reactively off these values.
    setState(preset.state)
    setDistrict(districtId)
    setSoilType(preset.soilId)
    setMoisture(preset.moisture)

    // Trigger the existing workflow with explicit values so it can't read stale
    // state from the setters above (Never race React state updates).
    onGenerate(preset.soilId, districtId)
  }

  return (
    <section aria-label="Demo scenarios" className="mb-6">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
          Try a demo scenario
        </span>
        <span className="rounded-full bg-primary-green/10 px-2 py-0.5 text-[10px] font-medium text-primary-green">
          One click
        </span>
      </div>

      {/* Horizontally scrollable on overflow; never wraps into messy rows. */}
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESETS.map((preset) => {
          const districtId = resolveDistrictId(preset)
          const available = districtId !== null
          const isActive = activeId === preset.id
          const isLoading = isActive && submitting
          const disabled = submitting || !available

          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => districtId && handleClick(preset, districtId)}
              aria-label={
                available
                  ? `Load demo: ${preset.soilLabel}, ${preset.district}, ${preset.state}, soil moisture ${preset.moisture} percent`
                  : `${preset.soilLabel} demo unavailable — ${preset.district} is not in the district list`
              }
              title={available ? undefined : `${preset.district}, ${preset.state} is not available`}
              className={[
                'group relative flex shrink-0 items-center gap-2.5 rounded-full border px-3.5 py-2 text-left shadow-sm transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 focus-visible:ring-offset-1',
                'active:scale-[0.98]',
                isActive
                  ? 'border-primary-green bg-primary-green/5 ring-1 ring-primary-green/10'
                  : 'border-slate-200 bg-white',
                disabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow',
              ].join(' ')}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-base ring-1 ring-inset ring-slate-100"
                aria-hidden="true"
              >
                {isLoading ? <span className="text-primary-green">{SpinnerIcon}</span> : preset.emoji}
              </span>
              <span className="min-w-0 pr-0.5">
                <span className="block whitespace-nowrap text-xs font-semibold text-slate-800">
                  {preset.soilLabel}
                </span>
                <span className="block whitespace-nowrap text-[11px] text-slate-400">
                  {preset.district}, {preset.state}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
