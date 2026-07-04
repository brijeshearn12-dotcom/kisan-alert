import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import { EntranceAnimation } from '@/components/EntranceAnimation'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

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

const CheckCircleIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke} className="text-primary-green">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

const ClockIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke} className="text-accent-amber">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

// ── Component ────────────────────────────────────────────────────────────────

export default async function ExpertDashboardPage() {
  const supabase = await createServerSupabaseClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <NoticeView title="Authentication Required" message="You must be signed in to access the Rythu Seva Kendra portal." />
  }

  // 2. Authorize user (must be an expert)
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'expert') {
    return <NoticeView title="Access Denied" message="This dashboard is restricted to Rythu Seva Kendra officers and extension officers." />
  }

  // 3. Fetch cases
  const { data: cases, error } = await supabase
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

  const casesTyped = (cases as unknown as CaseRecord[]) || []

  return (
    <main className="min-h-screen bg-canvas font-sans">
      {/* Navigation breadcrumb */}
      <nav className="border-b border-slate-100 bg-white" aria-label="Global breadcrumb">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-5 sm:px-6">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="text-primary-green">{LeafIcon}</span>
            Rythu Seva Kendra Verification Panel
          </span>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 sm:py-12">
        {/* Header section */}
        <header className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Escalated Cases
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Review and verify crop disease checks that fell below the automated confidence threshold.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200/60 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Total cases: {casesTyped.length}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-amber/5 px-3 py-1.5 text-xs font-semibold text-accent-amber ring-1 ring-inset ring-accent-amber/20">
              Pending: {casesTyped.filter(c => c.status === 'pending').length}
            </span>
          </div>
        </header>

        {error && (
          <ErrorState
            title="Database connection error"
            description="Failed to read records from the cases registry. Please verify database RLS policies allow selection for Rythu Seva Kendra accounts."
          />
        )}

        {!error && casesTyped.length === 0 && (
          <EmptyState
            icon={<span className="mx-auto block text-slate-300 w-fit">{ShieldAlertIcon}</span>}
            title="No cases waiting"
            description="All automated plant checks are currently healthy or resolved. No escalated leaf scans require your review."
          />
        )}

        {/* Cases Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {casesTyped.map((record) => {
            const check = record.disease_checks
            const farmer = check?.users
            const isPending = record.status === 'pending'

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
                        src={check.image_url}
                        alt={`Crop diagnosed as ${check.diagnosis}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400 text-xs">
                        No Image Available
                      </div>
                    )}

                    {/* Status Badge overlay */}
                    <div className="absolute right-3 top-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-md ${
                        isPending
                          ? 'bg-accent-amber/10 text-accent-amber ring-1 ring-accent-amber/20'
                          : 'bg-primary-green/10 text-primary-green ring-1 ring-primary-green/20'
                      }`}>
                        {isPending ? ClockIcon : CheckCircleIcon}
                        <span>{isPending ? 'Pending' : 'Resolved'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Content body */}
                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Submitted {new Date(record.created_at).toLocaleDateString()}</span>
                        {check?.confidence_score !== undefined && (
                          <span className="font-mono">Conf: {(check.confidence_score * 100).toFixed(0)}%</span>
                        )}
                      </div>

                      <h3 className="mt-2.5 text-base font-bold text-slate-900 line-clamp-1">
                        {check?.diagnosis || 'Unknown Disease'}
                      </h3>

                      <p className="mt-1.5 text-xs text-slate-500">
                        Farmer: <span className="font-medium text-slate-700">{farmer?.name || 'Anonymous Farmer'}</span>
                      </p>

                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Treatment Recommendation</h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600 line-clamp-3">
                          {check?.treatment_advice || 'No treatment details saved.'}
                        </p>
                      </div>

                      {record.expert_notes && (
                        <div className="mt-4 border-t border-slate-100 pt-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Rythu Seva Kendra Feedback</h4>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                            {record.expert_notes}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions bar */}
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <Link
                        href={`/expert/cases/${record.id}`}
                        className="inline-flex w-full h-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
                      >
                        View Details
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
              Sign in
            </Link>
          }
        />
      </div>
    </main>
  )
}
