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
import { getSeasonForMonth } from '@/lib/season'
import { computeIndex, estimateSoilMoisture } from '@/lib/vegetationIndex'
import EnvironmentalConditionsCard from '@/components/EnvironmentalConditionsCard'
import { useLanguage } from '@/contexts/LanguageContext'

export default function DashboardPage() {
  const { language } = useLanguage()
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
            .select('name, role, districts(name, state)')
            .eq('id', user.id)
            .single<ProfileRow>(),
          fetch(`/api/dashboard?lang=${language}`, { cache: 'no-store' }),
        ])

        if (!active) return
        if (!dashRes.ok) throw new Error('Dashboard request failed')

        const dash = (await dashRes.json()) as DashboardData
        if (!active) return

        const row = profileRes.data
        let locationLabel: string | null = null
        if (row?.districts) {
          const d = Array.isArray(row.districts) ? row.districts[0] : row.districts
          if (d && d.name) {
            locationLabel = d.state ? `${d.name.trim()}, ${d.state.trim()}` : d.name.trim()
          }
        }

        setProfile({
          name: row?.name?.trim() || null,
          district: locationLabel,
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
  }, [supabase, router, reloadKey, language])

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const initial = (profile?.name?.[0] ?? 'K').toUpperCase()

  const rainfallMm7d = useMemo(() => {
    if (!data?.weather) return 0
    return Math.round(
      data.weather.forecast.reduce((sum, day) => sum + day.precipitation, 0) * 10,
    ) / 10
  }, [data])

  const season = useMemo(() => {
    const month = new Date().getMonth() + 1
    return getSeasonForMonth(month)
  }, [])

  const { percent: estMoisturePercent, level: estMoistureLevel } = useMemo(() => {
    if (!data?.weather) return { percent: 50, level: 'moderate' as const }
    return estimateSoilMoisture(rainfallMm7d, data.weather.humidity, data.weather.temperature)
  }, [data, rainfallMm7d])

  const computedVegIndex = useMemo(() => {
    return computeIndex(estMoisturePercent, rainfallMm7d, season)
  }, [estMoisturePercent, rainfallMm7d, season])

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

            <EnvironmentalConditionsCard
              weather={data.weather}
              weatherLoading={false}
              vegetationStatus={computedVegIndex.status}
              moistureLevel={estMoistureLevel}
              moisturePercent={estMoisturePercent}
            />

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
