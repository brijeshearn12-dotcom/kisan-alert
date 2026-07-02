'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  DashboardSkeleton,
  DrySpellBanner,
  ErrorCard,
  QuickActions,
  RecommendationCard,
  SiteFooter,
  TopNav,
  WeatherCard,
  WelcomeHeader,
  type DashboardData,
  type Profile,
  type ProfileRow,
  type Status,
} from './ui'

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [status, setStatus] = useState<Status>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true

    async function run() {
      setStatus('loading')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return
      if (!user) {
        router.replace('/login')
        return
      }

      try {
        const [profileRes, dashRes] = await Promise.all([
          supabase
            .from('users')
            .select('name, role, districts(name)')
            .eq('id', user.id)
            .single<ProfileRow>(),
          fetch('/api/dashboard', { cache: 'no-store' }),
        ])

        if (!active) return
        if (!dashRes.ok) throw new Error('Dashboard request failed')

        const dash = (await dashRes.json()) as DashboardData
        if (!active) return

        const row = profileRes.data
        setProfile({
          name: row?.name?.trim() || null,
          district: row?.districts?.name?.trim() || null,
          isExpert: row?.role === 'expert',
        })
        setData(dash)
        setFetchedAt(new Date())
        setStatus('ready')
      } catch {
        if (active) setStatus('error')
      }
    }

    run()
    return () => {
      active = false
    }
  }, [supabase, router, reloadKey])

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const initial = (profile?.name?.[0] ?? 'K').toUpperCase()

  return (
    <main className="min-h-screen bg-slate-50 font-sans">
      <TopNav
        district={profile?.district ?? null}
        initial={initial}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        showUser={status === 'ready'}
      />

      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-6 sm:py-10">
        {status === 'loading' && <DashboardSkeleton />}

        {status === 'error' && <ErrorCard onRetry={() => setReloadKey((k) => k + 1)} />}

        {status === 'ready' && data && (
          <div className="space-y-6">
            <WelcomeHeader name={profile?.name ?? null} district={profile?.district ?? null} />

            <WeatherCard weather={data.weather} fetchedAt={fetchedAt} />

            {data.is_dry_spell && <DrySpellBanner />}

            <RecommendationCard recommendation={data.latest_recommendation} />

            <QuickActions isExpert={profile?.isExpert ?? false} />
          </div>
        )}
      </div>

      <SiteFooter />
    </main>
  )
}
