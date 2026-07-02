'use client'

/**
 * TEMPORARY verification page for <PhotoUpload />.
 *
 * Renders the component, shows the returned Cloudinary secure URL, the live
 * preview, and the last upload status. Safe to delete once the flow is wired
 * into the real product surface.
 */
import { useState } from 'react'
import Link from 'next/link'
import PhotoUpload from '@/components/PhotoUpload'

const ArrowLeftIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

const CopyIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

type Status = 'Idle' | 'Uploaded' | 'Failed'
type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Copy text to the clipboard, resilient across contexts.
 *
 * The async Clipboard API (`navigator.clipboard`) only exists in secure
 * contexts (HTTPS or localhost), so over plain HTTP on a phone it's undefined.
 * We feature-detect it, then fall back to a temporary <textarea> +
 * `document.execCommand('copy')`. Returns whether the copy succeeded; never
 * throws.
 */
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or blocked — fall through to the legacy path.
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // Keep it off-screen and non-disruptive while still selectable.
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export default function UploadTestPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('Idle')
  const [copyState, setCopyState] = useState<CopyState>('idle')

  async function copyUrl() {
    if (!url) return
    const ok = await copyText(url)
    setCopyState(ok ? 'copied' : 'failed')
    window.setTimeout(() => setCopyState('idle'), ok ? 1500 : 4000)
  }

  return (
    <main className="min-h-screen bg-slate-50 font-sans">
      {/* Breadcrumb */}
      <div className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-12 w-full max-w-xl items-center gap-2 px-5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded text-xs text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          >
            {ArrowLeftIcon}
            <span>Back</span>
          </Link>
          <span className="text-slate-200" aria-hidden="true">/</span>
          <span className="text-xs font-medium text-slate-500">Photo upload · test</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl px-5 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Photo upload
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Temporary page for verifying the direct-to-Cloudinary upload flow. Works with
            the device camera or gallery.
          </p>
        </header>

        <PhotoUpload
          label="Crop photo"
          onUpload={(secureUrl) => {
            setUrl(secureUrl)
            setStatus('Uploaded')
          }}
          onError={() => setStatus('Failed')}
        />

        {/* Result panel */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
              Last result
            </p>
            <StatusPill status={status} />
          </div>

          {url ? (
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary preview */}
                <img
                  src={url}
                  alt="Uploaded result"
                  className="max-h-72 w-full object-contain"
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">Secure URL</p>
                <div className="flex items-stretch gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                    {url}
                  </code>
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    {CopyIcon}
                    {copyState === 'copied' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {copyState === 'failed' && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    Couldn&apos;t copy automatically — select the URL above and copy it manually.
                  </p>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded text-xs font-medium text-emerald-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                >
                  Open in new tab ↗
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              Upload a photo above to see its Cloudinary URL and preview here.
            </p>
          )}
        </section>
      </div>
    </main>
  )
}

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    Idle: 'bg-slate-50 text-slate-500 ring-slate-200',
    Uploaded: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    Failed: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  }
  const dot: Record<Status, string> = {
    Idle: 'bg-slate-300',
    Uploaded: 'bg-emerald-500',
    Failed: 'bg-rose-500',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status]}`} />
      {status}
    </span>
  )
}
