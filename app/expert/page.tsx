'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { EntranceAnimation } from '@/components/EntranceAnimation'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { useLanguage } from '@/contexts/LanguageContext'
import { getLanguageMeta, parseTreatmentAdvice } from '@/lib/i18n/translations'

// ── Types ───────────────────────────────────────────────────────────────────

interface FarmerProfile {
  id: string
  name: string | null
}

interface DiseaseCheck {
  id: string
  image_url: string
  diagnosis: string
  confidence_score: number
  treatment_advice: string
  users: FarmerProfile | null
}

interface CaseRecord {
  id: string
  status: 'pending' | 'resolved'
  expert_notes: string | null
  resolved_at: string | null
  created_at: string
  disease_checks: DiseaseCheck | null
}

// ── Icons (consistent SVG convention) ───────────────────────────────────────

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const LeafIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="M11 20A7 7 0 0 1 14 6c3 0 6 3 6 6a7 7 0 0 1-5 6.7" />
    <path d="M11 20a7 7 0 0 1-7-7c0-3 3-6 6-6 1.4 0 2.7.5 3.7 1.3" />
    <path d="M11 20v-8" />
  </svg>
)

const ShieldAlertIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
)



// ── Component ────────────────────────────────────────────────────────────────

export default function ExpertDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const { t, language } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState<'loading' | 'unauthenticated' | 'forbidden' | 'authorized'>('loading')
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function initialize() {
      // 1. Authenticate user
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        setAuthState('unauthenticated')
        setLoading(false)
        return
      }

      // 2. Authorize user (must be an expert)
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!active) return

      if (!profile || profile.role !== 'expert') {
        setAuthState('forbidden')
        setLoading(false)
        return
      }

      setAuthState('authorized')

      // 3. Fetch cases
      try {
        const { data: casesData, error: casesError } = await supabase
          .from('cases')
          .select(`
            id,
            status,
            expert_notes,
            resolved_at,
            created_at,
            disease_checks (
              id,
              image_url,
              diagnosis,
              confidence_score,
              treatment_advice,
              users (
                id,
                name
              )
            )
          `)
          .order('status', { ascending: true })
          .order('created_at', { ascending: false })

        if (!active) return

        if (casesError) {
          throw new Error(casesError.message)
        }

        setCases((casesData as unknown as CaseRecord[]) || [])
      } catch (err) {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : t('expert.dbError'))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    initialize()
    return () => {
      active = false
    }
    // `t` is intentionally omitted: cases must not refetch on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  if (loading) {
    return (
      <main className="min-h-screen bg-canvas font-sans flex items-center justify-center p-5">
        <div className="w-full max-w-5xl space-y-8 animate-pulse">
          <div className="h-8 w-48 bg-slate-200 rounded-lg" />
          <div className="h-20 bg-slate-200 rounded-2xl" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-60 bg-slate-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <NoticeView
        title={t('disease.authRequired')}
        message={t('expert.authRequiredDetail')}
      />
    )
  }

  if (authState === 'forbidden') {
    return (
      <NoticeView
        title={t('expert.accessDenied')}
        message={t('expert.forbiddenDetail')}
      />
    )
  }

  return (
    <main className="min-h-screen bg-canvas font-sans">
      {/* Navigation breadcrumb */}
      <nav className="border-b border-slate-100 bg-white" aria-label="Global breadcrumb">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-5 sm:px-6">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="text-primary-green">{LeafIcon}</span>
            {t('expert.rskPanel')}
          </span>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 sm:py-12">
        {/* Header section */}
        <header className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t('expert.escalatedCases')}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {t('expert.escalatedCasesDetail')}
            </p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200/60 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {t('expert.totalCases', { count: cases.length })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-amber/5 px-3 py-1.5 text-xs font-semibold text-accent-amber ring-1 ring-inset ring-accent-amber/20">
              {t('expert.pendingCount', { count: cases.filter((c) => c.status === 'pending').length })}
            </span>
          </div>
        </header>

        {errorMsg && (
          <ErrorState
            title={t('expert.dbError')}
            description={t('expert.dbErrorDetail')}
          />
        )}

        {!errorMsg && cases.length === 0 && (
          <EmptyState
            icon={<span className="mx-auto block text-slate-300 w-fit">{ShieldAlertIcon}</span>}
            title={t('expert.noCases')}
            description={t('expert.noCasesDetail')}
          />
        )}

        {/* Cases Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((record) => {
            const check = record.disease_checks
            const farmer = check?.users
            const isPending = record.status === 'pending'
            const { treatment_advice: cleanAdvice } = parseTreatmentAdvice(check?.treatment_advice || null)

            const isValidUrl =
              check?.image_url &&
              (check.image_url.startsWith('http://') || check.image_url.startsWith('https://'))

            return (
              <EntranceAnimation key={record.id} className="flex flex-col">
                <article className="flex flex-col flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                  {/* Image header */}
                  <div className="relative aspect-[4/3] w-full bg-slate-100 border-b border-slate-100">
                    {isValidUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={check.image_url!}
                        alt="Crop leaf scan"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-slate-50 text-slate-400">
                        <span aria-hidden="true" className="text-xl">📷</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('expert.imageUnavailable')}</span>
                      </div>
                    )}
                    <div
                      className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm ${
                        isPending ? 'bg-amber-500' : 'bg-primary-green'
                      }`}
                    >
                      <span>{isPending ? t('expert.status.pending') : t('expert.status.resolved')}</span>
                    </div>
                  </div>

                  {/* Body details */}
                  <div className="flex flex-col flex-1 p-5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {new Date(record.created_at).toLocaleDateString(getLanguageMeta(language).locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <h3 className="mt-2.5 text-base font-bold text-slate-900 line-clamp-1">
                      {check?.diagnosis || t('expert.unknownDisease')}
                    </h3>

                    <p className="mt-1.5 text-xs text-slate-500">
                      {t('expert.farmer', { name: farmer?.name || t('expert.anonymousFarmer') })}
                    </p>

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('expert.aiTreatment')}</h4>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 line-clamp-3">
                        {cleanAdvice || t('expert.noTreatment')}
                      </p>
                    </div>

                    {record.expert_notes && (
                      <div className="mt-4 border-t border-slate-100 pt-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('expert.rskFeedback')}</h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                          {(() => {
                            try {
                              const parsed = JSON.parse(record.expert_notes)
                              return parsed.notes || parsed.treatment || record.expert_notes
                            } catch {
                              return record.expert_notes
                            }
                          })()}
                        </p>
                      </div>
                    )}

                    {/* Actions bar */}
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <Link
                        href={`/expert/cases/${record.id}`}
                        className="inline-flex w-full h-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
                      >
                        {t('expert.viewDetails')}
                      </Link>
                    </div>
                  </div>
                </article>
              </EntranceAnimation>
            )
          })}
        </div>
      </div>
    </main>
  )
}

// ── Shared Notice View ──────────────────────────────────────────────────────

function NoticeView({ title, message }: { title: string; message: string }) {
  const { t } = useLanguage()

  return (
    <main className="min-h-screen bg-canvas font-sans flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <EmptyState
          title={title}
          description={message}
          action={
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary-green px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
            >
              {t('login.signIn')}
            </Link>
          }
        />
      </div>
    </main>
  )
}
