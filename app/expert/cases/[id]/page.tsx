'use client'

import * as React from 'react'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import CaseDetailView from '@/components/CaseDetailView'
import { EmptyState } from '@/components/EmptyState'
import { useLanguage } from '@/contexts/LanguageContext'

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

export default function ExpertCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = React.use(params)
  const caseId = resolvedParams.id

  const supabase = useMemo(() => createClient(), [])
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState<'loading' | 'unauthenticated' | 'forbidden' | 'authorized'>('loading')
  const [caseRow, setCaseRow] = useState<CaseRecord | null>(null)
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

      // 3. Fetch specific case details
      try {
        const { data, error } = await supabase
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
          .eq('id', caseId)
          .single()

        if (!active) return

        if (error || !data) {
          throw new Error(error?.message || 'Case not found')
        }

        setCaseRow(data as unknown as CaseRecord)
      } catch (err) {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Case fetch failed')
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
  }, [supabase, caseId])

  if (loading) {
    return (
      <main className="min-h-screen bg-canvas font-sans flex items-center justify-center p-5">
        <div className="w-full max-w-5xl space-y-8 animate-pulse">
          <div className="h-8 w-48 bg-slate-200 rounded-lg" />
          <div className="h-60 bg-slate-200 rounded-2xl" />
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

  if (errorMsg || !caseRow) {
    return (
      <main className="min-h-screen bg-canvas font-sans flex items-center justify-center p-5">
        <div className="w-full max-w-md">
          <EmptyState
            title={t('expert.caseNotFound')}
            description={t('expert.caseNotFoundDetail', { id: caseId })}
            action={
              <Link
                href="/expert"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary-green px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
              >
                {t('disease.returnDashboard')}
              </Link>
            }
          />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-canvas font-sans">
      {/* Navigation header */}
      <nav className="border-b border-slate-100 bg-white" aria-label="Global breadcrumb">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-5 sm:px-6">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="text-primary-green">{LeafIcon}</span>
            {t('expert.rskPanel')}
          </span>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 sm:py-12">
        <CaseDetailView initialCase={caseRow} />
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
