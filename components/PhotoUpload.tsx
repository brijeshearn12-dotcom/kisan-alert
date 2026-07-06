'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

/**
 * PhotoUpload
 * -----------------------------------------------------------------------------
 * Reusable, signed, direct-to-Cloudinary photo upload.
 *
 * Flow: user picks a photo (gallery or camera) -> the image is resized and
 * JPEG-compressed on the client -> we fetch a short-lived signature from
 * `/api/upload-signature` -> the file is uploaded straight to Cloudinary with a
 * live progress bar -> the resulting `secure_url` is handed back via `onUpload`.
 *
 * The component owns its own UI state; the parent only receives the final URL.
 * -----------------------------------------------------------------------------
 */

// ── Public API ────────────────────────────────────────────────────────────

interface PhotoUploadProps {
  /** Called once with the Cloudinary `secure_url` after a successful upload. */
  onUpload: (secureUrl: string) => void
  /** Optional hook for surfacing failures to the parent (analytics, toasts…). */
  onError?: (message: string) => void
  /** Longest edge of the uploaded image, in pixels. Aspect ratio is preserved. */
  maxDimension?: number
  /** JPEG quality between 0 and 1. */
  quality?: number
  /** Visible field label. */
  label?: string
  /** Extra classes for the outer container. */
  className?: string
}

// ── Internal types ────────────────────────────────────────────────────────

type Status = 'idle' | 'preparing' | 'uploading' | 'success' | 'error'

interface SignatureResponse {
  timestamp: number
  signature: string
  api_key: string
  cloud_name: string
}

interface CloudinaryUploadResponse {
  secure_url: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Resize an image file to fit within `maxDimension` (longest edge) and return a
 * compressed JPEG blob. Falls back to the original file if the browser can't
 * decode it (e.g. some HEIC images) so the upload can still proceed.
 */
async function resizeImage(
  file: File,
  maxDimension: number,
  quality: number,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)

    const largestEdge = Math.max(image.width, image.height)
    const scale = largestEdge > maxDimension ? maxDimension / largestEdge : 1
    const width = Math.round(image.width * scale)
    const height = Math.round(image.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    return blob ?? file
  } catch {
    // Undecodable image — upload the original bytes untouched.
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode image'))
    image.src = src
  })
}

/** Upload to Cloudinary via XHR so we can report real progress events. */
function uploadToCloudinary(
  file: Blob,
  signature: SignatureResponse,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('api_key', signature.api_key)
    form.append('timestamp', String(signature.timestamp))
    form.append('signature', signature.signature)

    const xhr = new XMLHttpRequest()
    xhr.open(
      'POST',
      `https://api.cloudinary.com/v1_1/${signature.cloud_name}/image/upload`,
    )

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as CloudinaryUploadResponse
          resolve(data.secure_url)
        } catch {
          reject(new Error('Unexpected response from the image service.'))
        }
      } else {
        reject(new Error('The image service rejected the upload.'))
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload.'))
    xhr.send(form)
  })
}

// ── Icons (match the project's inline-SVG convention) ──────────────────────

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const CameraIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" {...iconProps}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)

const GalleryIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" {...iconProps}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
)

const CheckIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" {...iconProps} strokeWidth={2.5}>
    <path d="m20 6-11 11-5-5" />
  </svg>
)

const WarningIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...iconProps}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
)

const RefreshIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" {...iconProps}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

// ── Component ──────────────────────────────────────────────────────────────

export default function PhotoUpload({
  onUpload,
  onError,
  maxDimension = 1280,
  quality = 0.82,
  label = 'Photo',
  className = '',
}: PhotoUploadProps) {
  const { t } = useLanguage()

  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const statusId = useId()

  // Revoke the last preview object URL on unmount to avoid leaking memory.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const setPreview = useCallback((blob: Blob) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(blob)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setStatus('preparing')
      setProgress(0)
      setErrorMessage(null)

      try {
        const resized = await resizeImage(file, maxDimension, quality)
        setPreview(resized)

        const signatureRes = await fetch('/api/upload-signature')
        if (!signatureRes.ok) {
          throw new Error(
            signatureRes.status === 401
              ? t('upload.signInToUpload')
              : t('upload.authError'),
          )
        }
        const signature = (await signatureRes.json()) as SignatureResponse

        setStatus('uploading')
        const secureUrl = await uploadToCloudinary(resized, signature, setProgress)

        setStatus('success')
        onUpload(secureUrl)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('upload.genericError')
        setStatus('error')
        setErrorMessage(message)
        onError?.(message)
      }
    },
    [maxDimension, quality, setPreview, onUpload, onError, t],
  )

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // Reset the input so re-selecting the same file fires `change` again.
      event.target.value = ''
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(0)
    setErrorMessage(null)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
  }, [])

  const busy = status === 'preparing' || status === 'uploading'

  return (
    <div className={`font-sans ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>

      {/* Hidden inputs. `capture` opens the rear camera on mobile devices. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={onInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Preview / dropzone area */}
        <div className="relative aspect-[4/3] w-full bg-slate-50">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- transient blob/remote preview, not a static asset
            <img
              src={previewUrl}
              alt="Selected photo preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-6 text-center">
              <span className="text-slate-300">{GalleryIcon}</span>
              <p className="mt-1 text-sm font-medium text-slate-500">{t('upload.noPhoto')}</p>
              <p className="text-xs text-slate-400">{t('upload.prompt')}</p>
            </div>
          )}

          {/* Progress / preparing overlay */}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-[2px]">
              <div className="w-40">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>{status === 'preparing' ? t('upload.preparing') : t('upload.uploading')}</span>
                  {status === 'uploading' && <span className="tabular-nums">{progress}%</span>}
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-valuenow={status === 'uploading' ? progress : undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                >
                  <div
                    className={`h-full rounded-full bg-emerald-600 transition-all duration-300 ${
                      status === 'preparing' ? 'w-1/3 animate-pulse' : ''
                    }`}
                    style={status === 'uploading' ? { width: `${progress}%` } : undefined}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Success badge */}
          {status === 'success' && (
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm animate-fade-in-up">
              {CheckIcon}
              {t('upload.success')}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 border-t border-slate-100 p-3">
          {status === 'success' ? (
            <button
              type="button"
              onClick={reset}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            >
              {RefreshIcon}
              {t('upload.replace')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={busy}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {CameraIcon}
                {t('upload.camera')}
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={busy}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {GalleryIcon}
                {t('upload.gallery')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {status === 'error' && errorMessage && (
        <div
          role="alert"
          className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-sm text-rose-700"
        >
          <span className="mt-0.5 shrink-0 text-rose-500">{WarningIcon}</span>
          <div className="flex-1">
            <p className="leading-relaxed">{errorMessage}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-1 text-xs font-medium text-rose-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 rounded"
            >
              {t('upload.tryAgain')}
            </button>
          </div>
        </div>
      )}

      {/* Screen-reader status announcements */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {status === 'preparing' && t('upload.sr.preparing')}
        {status === 'uploading' && t('upload.sr.uploading', { percent: progress })}
        {status === 'success' && t('upload.sr.success')}
        {status === 'error' && errorMessage}
      </p>
    </div>
  )
}
