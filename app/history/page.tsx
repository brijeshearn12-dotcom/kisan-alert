'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { EntranceAnimation } from '@/components/EntranceAnimation'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { confidenceStyle } from '@/lib/confidence'
import { TopNav, SiteFooter } from '@/app/dashboard/ui'

interface TimelineItem {
  id: string
  type: 'recommendation' | 'disease_check'
  title: string
  details: string
  confidence_score: number | null
  created_at: string
  image_url?: string
}

type Status = 'loading' | 'success' | 'error'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const SproutIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="M7 20h10" />
    <path d="M10 20V8a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v12" />
    <path d="M10 12h6" />
  </svg>
)

const CheckCircleIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [status, setStatus] = useState<Status>('loading')
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [userInitial, setUserInitial] = useState('U')
  const [userDistrict, setUserDistrict] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true

    async function loadHistory() {
      setStatus('loading')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return
      if (!user) {
        router.replace('/login')
        return
      }

      // Fetch user profile for TopNav
      const { data: profile } = await supabase
        .from('users')
        .select('name, districts(name, state)')
        .eq('id', user.id)
        .single()

      if (active && profile) {
        if (profile.name) {
          setUserInitial(profile.name.charAt(0).toUpperCase())
        }
        if (profile.districts) {
          const dist = Array.isArray(profile.districts) ? profile.districts[0] : profile.districts
          if (dist) {
            setUserDistrict(dist.state ? `${dist.name}, ${dist.state}` : (dist.name || null))
          }
        }
      }

      try {
        const response = await fetch('/api/history', { cache: 'no-store' })
        if (!active) return
        if (!response.ok) throw new Error('Failed to fetch history')

        const result = await response.json()
        setTimeline(result.timeline || [])
        setStatus('success')
      } catch (err) {
        if (active) {
          setStatus('error')
        }
      }
    }

    loadHistory()

    return () => {
      active = false
    }
  }, [supabase, router, reloadKey])

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas font-sans text-slate-600 antialiased">
      <TopNav
        district={userDistrict}
        initial={userInitial}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        showUser={true}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Activity History</h1>
          <p className="mt-2 text-sm text-slate-500">
            A comprehensive record of your farm's crop recommendations and leaf disease checks.
          </p>
        </header>

        {status === 'loading' && (
          <div className="space-y-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        )}

        {status === 'error' && (
          <ErrorState
            title="Could not load history"
            description="We encountered an issue retrieving your timeline logs. Please try again."
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        )}

        {status === 'success' && timeline.length === 0 && (
          <EmptyState
            icon={SproutIcon}
            title="No activity yet"
            description="You haven't requested any crop recommendations or completed plant leaf diagnoses yet."
            action={
              <Link
                href="/recommendation"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-green px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 focus-visible:ring-offset-2"
              >
                Get Started
              </Link>
            }
          />
        )}

        {status === 'success' && timeline.length > 0 && (
          <div className="space-y-6">
            {timeline.map((item) => {
              const conf = item.confidence_score !== null ? confidenceStyle(item.confidence_score) : null
              const percent = item.confidence_score !== null ? Math.round(item.confidence_score * 100) : null

              return (
                <EntranceAnimation key={item.id}>
                  <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                    <div className="flex flex-col sm:flex-row">
                      {item.type === 'disease_check' && item.image_url && (
                        <div className="relative aspect-[16/9] w-full bg-slate-100 sm:aspect-square sm:w-36 sm:shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      <div className="flex-1 p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                              {item.type === 'recommendation' ? (
                                <>
                                  <span className="text-primary-green">{SproutIcon}</span>
                                  <span>Recommendation</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-accent-amber">{CheckCircleIcon}</span>
                                  <span>Disease Check</span>
                                </>
                              )}
                            </span>
                            <h2 className="mt-1 text-lg font-bold text-slate-900">
                              {item.title}
                            </h2>
                          </div>

                          {conf && percent !== null && (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${conf.bg} ${conf.text} ${conf.ring}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} />
                              {percent}%
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                          {item.details}
                        </p>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                          <span>
                            {new Date(item.created_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                </EntranceAnimation>
              )
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
