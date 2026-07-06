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
  /** Called once with the Cloudinary `secure_url` after a successful upload, or null if removed. */
  onUpload: (secureUrl: string | null) => void
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

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
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

const TrashIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...iconProps}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
)

const CheckIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...iconProps} strokeWidth={2.5}>
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
  <svg viewBox="0 0 24 24" width="16" height="16" {...iconProps}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

// ── Component ──────────────────────────────────────────────────────────────

const VALIDATION_ERRORS: Record<string, Record<string, string>> = {
  en: {
    unsupported: 'Unsupported image format. Please upload a clear photo (JPG, PNG, or WEBP).',
    tooLarge: 'The selected photo is too large. Please select a photo under 15MB.',
  },
  hi: {
    unsupported: 'असमर्थित छवि प्रारूप। कृपया एक स्पष्ट फोटो (JPG, PNG, या WEBP) अपलोड करें।',
    tooLarge: 'चुनी गई फोटो बहुत बड़ी है। कृपया 15MB से कम की फोटो चुनें।',
  },
  te: {
    unsupported: 'మద్దతు లేని చిత్ర ఫార్మాట్. దయచేసి స్పష్టమైన ఫోటోను (JPG, PNG, లేదా WEBP) అప్‌లోడ్ చేయండి.',
    tooLarge: 'ఎంచుకున్న ఫోటో చాలా పెద్దదిగా ఉంది. దయచేసి 15MB లోపు ఫోటోను ఎంచుకోండి.',
  },
}

const LOCAL_UI: Record<string, Record<string, string>> = {
  en: {
    failed: 'Failed',
    remove: 'Remove',
  },
  hi: {
    failed: 'विफल',
    remove: 'हटाएं',
  },
  te: {
    failed: 'విఫలమైంది',
    remove: 'తొలగించు',
  },
}

export default function PhotoUpload({
  onUpload,
  onError,
  maxDimension = 1280,
  quality = 0.82,
  label = 'Photo',
  className = '',
}: PhotoUploadProps) {
  const { t, language } = useLanguage()

  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fileMeta, setFileMeta] = useState<{ name: string; size: string } | null>(null)

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
      setFileMeta({
        name: file.name,
        size: formatBytes(file.size),
      })

      // Validation
      if (!file.type.startsWith('image/')) {
        const errorDict = VALIDATION_ERRORS[language] || VALIDATION_ERRORS.en
        const msg = errorDict.unsupported
        setStatus('error')
        setErrorMessage(msg)
        onError?.(msg)
        return
      }

      if (file.size > 15 * 1024 * 1024) {
        const errorDict = VALIDATION_ERRORS[language] || VALIDATION_ERRORS.en
        const msg = errorDict.tooLarge
        setStatus('error')
        setErrorMessage(msg)
        onError?.(msg)
        return
      }

      try {
        const resized = await resizeImage(file, maxDimension, quality)
        setPreview(resized)

        const signatureRes = await fetch('/api/upload-signature')
        if (!signatureRes.ok) {
          throw new Error(
            signatureRes.status === 401
              ? t('upload.signInToUpload') || 'Please sign in to upload.'
              : t('upload.authError') || 'Authentication failed. Please try again.',
          )
        }
        const signature = (await signatureRes.json()) as SignatureResponse

        setStatus('uploading')
        const secureUrl = await uploadToCloudinary(resized, signature, setProgress)

        setStatus('success')
        onUpload(secureUrl)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('upload.genericError') || 'Upload failed. Please check connection.'
        setStatus('error')
        setErrorMessage(message)
        onError?.(message)
      }
    },
    [maxDimension, quality, setPreview, onUpload, onError, t, language],
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
    setFileMeta(null)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
    onUpload(null)
  }, [onUpload])

  const busy = status === 'preparing' || status === 'uploading'

  return (
    <div className={`font-sans ${className}`}>
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>

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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
        {/* Before Upload UI */}
        {(status === 'idle' || (status === 'error' && !previewUrl)) ? (
          <div className="flex w-full flex-col items-center justify-center p-6 text-center sm:p-8">
            {/* Premium Illustration */}
            <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50/50 ring-8 ring-emerald-500/[0.03]">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-emerald-200/60 animate-[spin_60s_linear_infinite]" />
              <svg viewBox="0 0 24 24" width="32" height="32" className="text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 20A7 7 0 0 1 14 6c3 0 6 3 6 6a7 7 0 0 1-5 6.7" />
                <path d="M11 20a7 7 0 0 1-7-7c0-3 3-6 6-6 1.4 0 2.7.5 3.7 1.3" />
                <path d="M11 20v-8" />
              </svg>
            </div>
            
            <h3 className="text-base font-bold text-slate-800">
              {t('disease.uploadPhoto') || 'Upload Crop Photo'}
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              Provide a photo of the affected plant leaf to receive instant AI crop advisory.
            </p>

            {/* Guidance Grid */}
            <div className="mt-6 w-full max-w-md rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                Image Guidelines for Best Results
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>Use a clear image</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>Capture affected leaves</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>Prefer natural daylight</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>Avoid blurry images</span>
                </div>
              </div>
            </div>

            {/* Actions for selection */}
            <div className="mt-6 flex w-full max-w-md flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={busy}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none min-h-[44px]"
              >
                {CameraIcon}
                {t('upload.camera') || 'Take Photo'}
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={busy}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:text-slate-400 min-h-[44px]"
              >
                {GalleryIcon}
                {t('upload.gallery') || 'Choose from Gallery'}
              </button>
            </div>
          </div>
        ) : (
          /* Selected Image Preview State */
          <div className="flex flex-col">
            <div className="relative aspect-[16/9] w-full bg-slate-900 overflow-hidden">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Selected plant crop leaf"
                  className="h-full w-full object-cover"
                />
              )}

              {/* Progress/Preparing Overlay */}
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-[1px]">
                  <div className="w-48 px-4 text-center">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <span>{status === 'preparing' ? t('upload.preparing') || 'Preparing image...' : t('upload.uploading') || 'Uploading image...'}</span>
                      {status === 'uploading' && <span className="tabular-nums font-semibold text-emerald-600">{progress}%</span>}
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-slate-200 shadow-inner"
                      role="progressbar"
                      aria-valuenow={status === 'uploading' ? progress : undefined}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Upload progress"
                    >
                      <div
                        className={`h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-300 ${
                          status === 'preparing' ? 'w-1/3 animate-pulse' : ''
                        }`}
                        style={status === 'uploading' ? { width: `${progress}%` } : undefined}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Status badges */}
              {!busy && status === 'success' && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md animate-fade-in-up">
                  {CheckIcon}
                  {t('upload.success') || 'Ready'}
                </div>
              )}

              {!busy && status === 'error' && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-md">
                  {WarningIcon}
                  {(LOCAL_UI[language] || LOCAL_UI.en).failed}
                </div>
              )}
            </div>

            {/* Meta details & control bar */}
            <div className="border-t border-slate-100 bg-slate-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {fileMeta && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-700" title={fileMeta.name}>
                      {fileMeta.name}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400">
                      {fileMeta.size} • {status === 'success' ? 'Uploaded to secure server' : 'Status: ' + status}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (galleryInputRef.current) galleryInputRef.current.click()
                    }}
                    disabled={busy}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:text-slate-400 min-h-[40px]"
                  >
                    {RefreshIcon}
                    {t('upload.replace') || 'Replace'}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50/50 px-4 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:text-slate-400 min-h-[40px]"
                  >
                    {TrashIcon}
                    {(LOCAL_UI[language] || LOCAL_UI.en).remove}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error alert message below card if any error during active selection */}
      {status === 'error' && errorMessage && previewUrl && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-100 bg-rose-50/60 p-4 text-sm text-rose-700 animate-fade-in-up"
        >
          <span className="mt-0.5 shrink-0 text-rose-500">{WarningIcon}</span>
          <div className="flex-1">
            <p className="font-semibold text-rose-900">Upload Issue</p>
            <p className="mt-0.5 leading-relaxed text-xs">{errorMessage}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 text-xs font-bold text-rose-600 hover:underline underline-offset-2"
            >
              Reset and Try Again
            </button>
          </div>
        </div>
      )}

      {/* Screen-reader status announcements */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {status === 'preparing' && t('upload.sr.preparing') || 'Preparing image...'}
        {status === 'uploading' && (t('upload.sr.uploading', { percent: progress }) || `Uploading image, ${progress} percent`)}
        {status === 'success' && (t('upload.sr.success') || 'Image uploaded successfully')}
        {status === 'error' && errorMessage}
      </p>
    </div>
  )
}
