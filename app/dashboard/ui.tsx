'use client'

/**
 * ui.tsx
 * -----------------------------------------------------------------------------
 * Presentational building blocks for the dashboard. These are pure, prop-driven
 * components (no data fetching) so they can be composed by `page.tsx` and
 * rendered/verified in isolation. Types mirror the GET /api/dashboard response.
 * -----------------------------------------------------------------------------
 */

import { type ReactNode } from 'react'
import Link from 'next/link'
import { confidenceStyle } from '@/lib/confidence'

// ── Types (mirror GET /api/dashboard) ───────────────────────────────────────

export interface DailyForecast {
  date: string
  temperature_max: number
  temperature_min: number
  precipitation: number
}

export interface Weather {
  temperature: number
  humidity: number
  rainfall: number
  forecast: DailyForecast[]
}

export interface Recommendation {
  crop_name: string | null
  reasoning: string | null
  confidence_score: number | null
  created_at: string
}

export interface DashboardData {
  weather: Weather | null
  is_dry_spell: boolean
  latest_recommendation: Recommendation | null
}

export interface ProfileRow {
  name: string | null
  role: string | null
  districts: { name: string | null } | null
}

export interface Profile {
  name: string | null
  district: string | null
  isExpert: boolean
}

export type Status = 'loading' | 'ready' | 'error'

// ── Formatting helpers ──────────────────────────────────────────────────────

export function greetingFor(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Local-midnight parse so a YYYY-MM-DD date never slips to the previous day. */
export function dayLabel(iso: string, index: number): string {
  if (index === 0) return 'Today'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Inline icons (stroke style, matches the rest of the app) ─────────────────

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} aria-hidden="true">
      {children}
    </svg>
  )
}

export const LeafPath = (
  <>
    <path d="M11 20A7 7 0 0 1 14 6c3 0 6 3 6 6a7 7 0 0 1-5 6.7" />
    <path d="M11 20a7 7 0 0 1-7-7c0-3 3-6 6-6 1.4 0 2.7.5 3.7 1.3" />
    <path d="M11 20v-8" />
  </>
)
const ArrowRightPath = (
  <>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </>
)
const ClockPath = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
)
const ThermPath = <path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0Z" />
const DropPath = <path d="M12 2.5 6.5 9a7 7 0 1 0 11 0L12 2.5Z" />
const WarningPath = (
  <>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>
)
const SproutPath = (
  <>
    <path d="M7 20h10" />
    <path d="M12 20c0-6 0-8 4-10" />
    <path d="M12 14C8 12 8 9 4 9c0 4 3 6 8 5Z" />
    <path d="M12 12c0-3 2-5 6-5 0 3-2 5-6 5Z" />
  </>
)
const ScanPath = (
  <>
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10" />
  </>
)
const ShieldPath = (
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </>
)
const PinPath = (
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>
)
const LogoutPath = (
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </>
)
const RefreshPath = (
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </>
)

// ── Top navigation ───────────────────────────────────────────────────────────

export function TopNav({
  district,
  initial,
  onSignOut,
  signingOut,
  showUser,
}: {
  district: string | null
  initial: string
  onSignOut: () => void
  signingOut: boolean
  showUser: boolean
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-5 sm:px-6"
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Icon size={16}>{LeafPath}</Icon>
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-900">Kisan Alert</span>
        </Link>

        {showUser && (
          <div className="flex items-center gap-3">
            {district && (
              <span className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 sm:flex">
                <span className="text-slate-400">
                  <Icon size={14}>{PinPath}</Icon>
                </span>
                {district}
              </span>
            )}
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
              aria-hidden="true"
            >
              {initial}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-60"
            >
              <Icon size={14}>{LogoutPath}</Icon>
              <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        )}
      </nav>
    </header>
  )
}

// ── Welcome header ───────────────────────────────────────────────────────────

export function WelcomeHeader({ name, district }: { name: string | null; district: string | null }) {
  const greeting = greetingFor(new Date())

  return (
    <header className="animate-fade-in-up">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
        {greeting}
        {name ? <span>, {name}</span> : null}
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        {district
          ? `Here is what is happening around ${district} today.`
          : 'Here is your farm overview for today.'}
      </p>
    </header>
  )
}

// ── Weather card ─────────────────────────────────────────────────────────────

export function WeatherCard({
  weather,
  fetchedAt,
}: {
  weather: Weather | null
  fetchedAt: Date | null
}) {
  return (
    <section
      aria-label="Weather"
      className="animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ animationDelay: '40ms' }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 sm:px-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
          Local weather
        </h2>
        {fetchedAt && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Icon size={13}>{ClockPath}</Icon>
            Updated {formatTime(fetchedAt)}
          </span>
        )}
      </div>

      {weather ? (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-start gap-1">
                <span className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {Math.round(weather.temperature)}
                </span>
                <span className="mt-1 text-lg font-medium text-slate-400">°C</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Current temperature</p>
            </div>

            <div className="flex gap-2">
              <Stat icon={DropPath} label="Humidity" value={`${Math.round(weather.humidity)}%`} />
              <Stat icon={ThermPath} label="Rain today" value={`${weather.rainfall} mm`} />
            </div>
          </div>

          {weather.forecast.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                5-day forecast
              </p>
              <ul className="grid grid-cols-5 gap-1.5">
                {weather.forecast.slice(0, 5).map((day, index) => (
                  <li
                    key={day.date}
                    className="flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-slate-50/60 py-2.5"
                  >
                    <span className="text-[11px] font-medium text-slate-500">
                      {dayLabel(day.date, index)}
                    </span>
                    <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
                      {Math.round(day.temperature_max)}°
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {Math.round(day.temperature_min)}°
                    </span>
                    <span
                      className={`text-[10px] tabular-nums ${
                        day.precipitation >= 1 ? 'text-emerald-600' : 'text-slate-300'
                      }`}
                    >
                      {day.precipitation >= 1 ? `${Math.round(day.precipitation)}mm` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3 p-5 sm:p-6">
          <span className="mt-0.5 shrink-0 text-slate-400">
            <Icon size={18}>{PinPath}</Icon>
          </span>
          <div>
            <p className="text-sm font-medium text-slate-700">Weather unavailable</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              We could not load a forecast for your area. Set your district in a recommendation to
              see live weather here.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-right">
      <div className="flex items-center justify-end gap-1 text-slate-400">
        <Icon size={13}>{icon}</Icon>
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{value}</p>
    </div>
  )
}

// ── Dry spell banner ─────────────────────────────────────────────────────────

export function DrySpellBanner() {
  return (
    <section
      role="alert"
      aria-label="Dry spell warning"
      className="animate-fade-in-up flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-amber-500">
          <Icon size={18}>{WarningPath}</Icon>
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900">Dry spell expected</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
            No meaningful rain is forecast for the next several days. Choose a crop that suits low
            rainfall and plan your irrigation early.
          </p>
        </div>
      </div>
      <Link
        href="/recommendation"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1"
      >
        View recommendations
        <Icon size={14}>{ArrowRightPath}</Icon>
      </Link>
    </section>
  )
}

// ── Recommendation card ──────────────────────────────────────────────────────

export function RecommendationCard({ recommendation }: { recommendation: Recommendation | null }) {
  if (!recommendation || !recommendation.crop_name) {
    return (
      <section
        aria-label="Latest recommendation"
        className="animate-fade-in-up rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center sm:p-8"
        style={{ animationDelay: '80ms' }}
      >
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon size={20}>{SproutPath}</Icon>
        </span>
        <h2 className="mt-3 text-base font-semibold text-slate-900">Get your first recommendation</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
          Tell us your soil type and district, and we will suggest the best crop for this season
          using live weather data.
        </p>
        <Link
          href="/recommendation"
          className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2"
        >
          Get a recommendation
          <Icon size={15}>{ArrowRightPath}</Icon>
        </Link>
      </section>
    )
  }

  const score = recommendation.confidence_score ?? 0
  const confidence = confidenceStyle(score)
  const percent = Math.round(score * 100)

  return (
    <section
      aria-label="Latest recommendation"
      className="animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ animationDelay: '80ms' }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
              Latest recommendation
            </p>
            <h2 className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-slate-900">
              {recommendation.crop_name}
            </h2>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${confidence.bg} ${confidence.text} ${confidence.ring}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${confidence.dot}`} />
            {percent}%
          </span>
        </div>

        {recommendation.reasoning && (
          <p className="mt-4 text-sm leading-relaxed text-slate-600">{recommendation.reasoning}</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 sm:px-6">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Icon size={13}>{ClockPath}</Icon>
          {formatDate(recommendation.created_at)}
        </span>
        <Link
          href="/recommendation"
          className="flex items-center gap-1 rounded text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          New recommendation
          <Icon size={13}>{ArrowRightPath}</Icon>
        </Link>
      </div>
    </section>
  )
}

// ── Quick actions ────────────────────────────────────────────────────────────

interface Action {
  href: string
  title: string
  description: string
  icon: ReactNode
}

export function QuickActions({ isExpert }: { isExpert: boolean }) {
  const actions: Action[] = [
    {
      href: '/recommendation',
      title: 'Crop Recommendation',
      description: 'Find the best crop for your soil and weather.',
      icon: SproutPath,
    },
    {
      href: '/disease-check',
      title: 'Disease Check',
      description: 'Diagnose a crop disease from a photo.',
      icon: ScanPath,
    },
  ]

  if (isExpert) {
    actions.push({
      href: '/expert',
      title: 'Expert Dashboard',
      description: 'Review escalated farmer cases.',
      icon: ShieldPath,
    })
  }

  return (
    <section aria-label="Quick actions" className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
        Quick actions
      </h2>
      <div
        className={`grid grid-cols-1 gap-3 ${
          actions.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
              <Icon size={19}>{action.icon}</Icon>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{action.title}</span>
                <span className="text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-emerald-500">
                  <Icon size={15}>{ArrowRightPath}</Icon>
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                {action.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Footer ───────────────────────────────────────────────────────────────────

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-100 bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-slate-400 sm:flex-row sm:px-6">
        <span className="flex items-center gap-1.5">
          <span className="text-emerald-600">
            <Icon size={14}>{LeafPath}</Icon>
          </span>
          Kisan Alert
        </span>
        <span>AI crop advisory for smallholder farmers</span>
      </div>
    </footer>
  )
}

// ── Loading skeleton (mirrors the ready layout) ──────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {/* Welcome */}
      <div className="animate-pulse space-y-2">
        <div className="h-7 w-64 rounded-md bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-100" />
      </div>

      {/* Weather */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="animate-pulse p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-10 w-24 rounded-md bg-slate-200" />
              <div className="h-3 w-28 rounded bg-slate-100" />
            </div>
            <div className="flex gap-2">
              <div className="h-14 w-20 rounded-xl bg-slate-100" />
              <div className="h-14 w-20 rounded-xl bg-slate-100" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-5 gap-1.5 border-t border-slate-100 pt-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="animate-pulse space-y-3 p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-2.5 w-28 rounded bg-slate-100" />
              <div className="h-7 w-40 rounded-md bg-slate-200" />
            </div>
            <div className="h-6 w-16 rounded-full bg-slate-100" />
          </div>
          <div className="h-3.5 w-full rounded bg-slate-100" />
          <div className="h-3.5 w-4/5 rounded bg-slate-100" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  )
}

// ── Error state ──────────────────────────────────────────────────────────────

export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
        <Icon size={20}>{WarningPath}</Icon>
      </span>
      <h2 className="mt-3 text-base font-semibold text-slate-900">We could not load your dashboard</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Something went wrong while fetching your latest weather and recommendation. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 focus-visible:ring-offset-2"
      >
        <Icon size={15}>{RefreshPath}</Icon>
        Try again
      </button>
    </div>
  )
}
