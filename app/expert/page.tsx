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
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending')

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

  const pendingCases = useMemo(() => {
    return cases.filter((c) => c.status === 'pending')
  }, [cases])

  const resolvedCases = useMemo(() => {
    return cases.filter((c) => c.status === 'resolved')
  }, [cases])

  const resolvedTodayCount = useMemo(() => {
    const today = new Date().toDateString()
    return cases.filter(
      (c) => c.status === 'resolved' && c.resolved_at && new Date(c.resolved_at).toDateString() === today
    ).length
  }, [cases])

  const visibleCases = activeTab === 'pending' ? pendingCases : resolvedCases

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
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
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
              {t('expert.pendingCount', { count: pendingCases.length })}
            </span>
          </div>
        </header>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 mb-8 gap-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-4 text-sm font-semibold relative transition-colors focus:outline-none ${
              activeTab === 'pending' ? 'text-primary-green font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('expert.status.pending')}
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
              activeTab === 'pending' ? 'bg-primary-green/10 text-primary-green' : 'bg-slate-100 text-slate-600'
            }`}>
              {pendingCases.length}
            </span>
            {activeTab === 'pending' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-green rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`pb-4 text-sm font-semibold relative transition-colors focus:outline-none ${
              activeTab === 'resolved' ? 'text-primary-green font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('expert.status.resolved')}
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
              activeTab === 'resolved' ? 'bg-primary-green/10 text-primary-green' : 'bg-slate-100 text-slate-600'
            }`}>
              {resolvedCases.length}
            </span>
            {activeTab === 'resolved' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-green rounded-full" />
            )}
          </button>
        </div>

        {errorMsg && (
          <ErrorState
            title={t('expert.dbError')}
            description={t('expert.dbErrorDetail')}
          />
        )}

        {!errorMsg && visibleCases.length === 0 && (
          activeTab === 'pending' ? (
            <div className="flex flex-col items-center justify-center p-10 bg-white border border-slate-200 rounded-3xl shadow-sm text-center max-w-lg mx-auto my-12 transition-all duration-300">
              <div className="relative mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 animate-pulse">
                <div className="absolute inset-0 rounded-full bg-primary-green/10 animate-ping opacity-75" style={{ animationDuration: '3s' }} />
                <svg className="w-10 h-10 text-primary-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{t('expert.empty.title')}</h3>
              <p className="text-sm leading-relaxed text-slate-500 max-w-sm mb-4">{t('expert.empty.description')}</p>
              {resolvedTodayCount > 0 && (
                <div className="px-4 py-2 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-full border border-emerald-100/60 inline-flex items-center gap-1.5">
                  <span>🎉</span>
                  <span>
                    {resolvedTodayCount === 1
                      ? t('expert.empty.todaySummary', { count: 1 })
                      : t('expert.empty.todaySummaryPlural', { count: resolvedTodayCount })}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<span className="mx-auto block text-slate-300 w-fit">{ShieldAlertIcon}</span>}
              title={t('expert.noCases')}
              description={t('expert.noCasesDetail')}
            />
          )
        )}

        {/* Cases Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCases.map((record) => {
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
                      {(() => {
                        if (record.expert_notes) {
                          try {
                            const parsed = JSON.parse(record.expert_notes)
                            if (parsed.diagnosis) return parsed.diagnosis
                          } catch {}
                        }
                        return check?.diagnosis || t('expert.unknownDisease')
                      })()}
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
