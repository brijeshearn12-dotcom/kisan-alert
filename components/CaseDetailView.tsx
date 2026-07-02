'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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

interface CaseDetailViewProps {
  initialCase: CaseRecord
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const ArrowLeftIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
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

export default function CaseDetailView({ initialCase }: CaseDetailViewProps) {
  const router = useRouter()
  const [caseRecord, setCaseRecord] = useState<CaseRecord>(initialCase)
  const [notes, setNotes] = useState(initialCase.expert_notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)

  const check = caseRecord.disease_checks
  const farmer = check?.users
  const isPending = caseRecord.status === 'pending'

  // Validate URL structure (prevent null or broken strings)
  const isValidUrl =
    check?.image_url &&
    (check.image_url.startsWith('http://') || check.image_url.startsWith('https://'))

  async function handleResolve() {
    if (submitting) return
    setSubmitting(true)
    setErrorMsg(null)

    try {
      const response = await fetch(`/api/cases/${caseRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'resolved',
          expert_notes: notes,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to update case.')
      }

      setCaseRecord((prev) => ({
        ...prev,
        status: 'resolved',
        expert_notes: notes,
        resolved_at: new Date().toISOString(),
      }))

      router.refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to resolve the case.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/expert"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded px-1 py-0.5"
      >
        {ArrowLeftIcon}
        <span>Back to Escalated Cases</span>
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Image & Metadata */}
        <div className="lg:col-span-2 space-y-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Image display with loading fallbacks */}
            <div className="relative aspect-[16/9] w-full bg-slate-900 flex items-center justify-center">
              {isValidUrl && !imageError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={check.image_url}
                  alt="Escalated plant leaf diagnosis"
                  className="h-full w-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                  <svg viewBox="0 0 24 24" width="32" height="32" {...stroke} className="text-slate-500">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span className="text-sm font-medium">Image unavailable or load failed</span>
                  <span className="text-xs text-slate-500 max-w-xs">
                    This scan was either submitted with a broken link or the asset was deleted from Cloudinary.
                  </span>
                </div>
              )}

              {/* Status Overlay */}
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

            {/* Analysis details */}
            <div className="p-5 sm:p-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Automated Scan Diagnosis</span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                {check?.diagnosis || 'Unknown Diagnosis'}
              </h2>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                <div>
                  Farmer: <span className="font-semibold text-slate-700">{farmer?.name || 'Anonymous Farmer'}</span>
                </div>
                <div>•</div>
                <div>
                  Confidence Score: <span className="font-semibold text-slate-700">{check?.confidence_score !== undefined ? `${(check.confidence_score * 100).toFixed(0)}%` : 'N/A'}</span>
                </div>
                <div>•</div>
                <div>
                  Escalated on: <span className="font-semibold text-slate-700">{new Date(caseRecord.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-6">
                <h3 className="text-sm font-semibold text-slate-800">AI Recommendation Feedback</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                  {check?.treatment_advice || 'No recommendations recorded.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Action form */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Expert Action Panel</h3>
            <p className="mt-1.5 text-xs text-slate-500">
              Provide feedback and mark this case as verified or resolved. Farmers will see your notes immediately on their dashboard.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="notes" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Resolution Notes / Treatment
                </label>
                <textarea
                  id="notes"
                  rows={6}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!isPending || submitting}
                  placeholder="Enter specific diagnosis verification notes, custom treatment advice, or chemical/biological countermeasures for the farmer."
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3 text-xs text-rose-700" role="alert">
                  {errorMsg}
                </div>
              )}

              {isPending ? (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={submitting}
                  className="flex w-full h-10 items-center justify-center rounded-xl bg-primary-green text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {submitting ? 'Resolving Case...' : 'Verify & Resolve'}
                </button>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
                  <div className="mx-auto block text-primary-green w-fit">{CheckCircleIcon}</div>
                  <h4 className="mt-2 text-sm font-bold text-slate-950">Resolved</h4>
                  {caseRecord.resolved_at && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      On {new Date(caseRecord.resolved_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
