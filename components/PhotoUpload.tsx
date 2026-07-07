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
    guidelineDesc: 'Provide a photo of the affected plant leaf to receive instant AI crop advisory.',
    guidelineTitle: 'Image Guidelines for Best Results',
    clearImage: 'Use a clear image',
    captureLeaves: 'Capture affected leaves',
    naturalDaylight: 'Prefer natural daylight',
    avoidBlurry: 'Avoid blurry images',
    altText: 'Selected plant crop leaf',
    uploadedSecure: 'Uploaded to secure server',
    status: 'Status: ',
    uploadIssue: 'Upload Issue',
    resetTryAgain: 'Reset and Try Again',
    preparing: 'Preparing image...',
    uploading: 'Uploading image...',
    success: 'Image uploaded successfully',
  },
  hi: {
    failed: 'विफल',
    remove: 'हटाएं',
    guidelineDesc: 'त्वरित एआई फसल सलाह प्राप्त करने के लिए प्रभावित पौधे की पत्ती का फोटो प्रदान करें।',
    guidelineTitle: 'सर्वोत्तम परिणामों के लिए छवि दिशानिर्देश',
    clearImage: 'स्पष्ट छवि का उपयोग करें',
    captureLeaves: 'प्रभावित पत्तियों को कैप्चर करें',
    naturalDaylight: 'प्राकृतिक दिन के प्रकाश को प्राथमिकता दें',
    avoidBlurry: 'धुंधली छवियों से बचें',
    altText: 'चयनित पौधे की पत्ती',
    uploadedSecure: 'सुरक्षित सर्वर पर अपलोड किया गया',
    status: 'स्थिति: ',
    uploadIssue: 'अपलोड समस्या',
    resetTryAgain: 'रीसेट करें और पुनः प्रयास करें',
    preparing: 'छवि तैयार की जा रही है...',
    uploading: 'छवि अपलोड की जा रही है...',
    success: 'छवि सफलतापूर्वक अपलोड की गई',
  },
  mr: {
    failed: 'अपयशी',
    remove: 'काढून टाका',
    guidelineDesc: 'त्वरित एआय पीक सल्ला मिळविण्यासाठी प्रभावित वनस्पतीच्या पानाचा फोटो प्रदान करा.',
    guidelineTitle: 'सर्वोत्तम परिणामांसाठी प्रतिमा मार्गदर्शक तत्त्वे',
    clearImage: 'स्पष्ट प्रतिमा वापरा',
    captureLeaves: 'प्रभावित पाने कॅप्चर करा',
    naturalDaylight: 'नैसर्गिक दिवसाच्या प्रकाशाला प्राधान्य द्या',
    avoidBlurry: 'अस्पष्ट प्रतिमा टाळा',
    altText: 'निवडलेले वनस्पतीचे पान',
    uploadedSecure: 'सुरक्षित सर्व्हरवर अपलोड केले',
    status: 'स्थिती: ',
    uploadIssue: 'अपलोड समस्या',
    resetTryAgain: 'रीसेट करा आणि पुन्हा प्रयत्न करा',
    preparing: 'प्रतिमा तयार करत आहे...',
    uploading: 'प्रतिमा अपलोड करत आहे...',
    success: 'प्रतिमा यशस्वीरित्या अपलोड केली',
  },
  gu: {
    failed: 'નિષ્ફળ',
    remove: 'દૂર કરો',
    guidelineDesc: 'ત્વરિત એઆઈ પાક સલાહ મેળવવા માટે અસરગ્રસ્ત છોડના પાનનો ફોટો પ્રદાન કરો.',
    guidelineTitle: 'શ્રેષ્ઠ પરિણામો માટે છબી માર્ગદર્શિકા',
    clearImage: 'સ્પષ્ટ છબી વાપરો',
    captureLeaves: 'અસરગ્રસ્ત પાંદડા કેપ્ચર કરો',
    naturalDaylight: 'કુદરતી દિવસના પ્રકાશને પ્રાધાન્ય આપો',
    avoidBlurry: 'ઝાંખી છબીઓ ટાળો',
    altText: 'પસંદ કરેલ છોડનું પાન',
    uploadedSecure: 'સુરક્ષિત સર્વર પર અપલોડ કરવામાં આવ્યું',
    status: 'સ્થિતિ: ',
    uploadIssue: 'અપલોડ સમસ્યા',
    resetTryAgain: 'રીસેટ કરો અને ફરી પ્રયાસ કરો',
    preparing: 'છબી તૈયાર થઈ રહી છે...',
    uploading: 'છબી અપલોડ થઈ રહી છે...',
    success: 'છબી સફળતાપૂર્વક અપલોડ થઈ',
  },
  kn: {
    failed: 'ವಿಫಲವಾಗಿದೆ',
    remove: 'ತೆಗೆದುಹಾಕಿ',
    guidelineDesc: 'ತ್ವರಿత AI ಬೆಳೆ ಸಲಹೆ ಪಡೆಯಲು ಬಾಧిత ಸಸ್ಯದ ఎಲೆಯ ಫೋಟೋವನ್ನು ಒದಗಿಸಿ.',
    guidelineTitle: 'ಅತ್ಯುತ್ತม ಫಲಿತಾಂಶಗಳಿಗಾಗಿ ಚಿತ್ರ ಮಾರ್ಗಸೂಚಿಗಳು',
    clearImage: 'ಸ್ಪಷ್ಟ ಚಿತ್ರವನ್ನು ಬಳಸಿ',
    captureLeaves: 'ಬಾಧಿತ ಎಲೆಗಳನ್ನು ಸೆರೆಹಿಡಿಯಿರಿ',
    naturalDaylight: 'ನೈಸರ್ಗಿಕ ಹಗಲು ಬೆಳಕನ್ನು ಆದ್ಯತೆ ನೀಡಿ',
    avoidBlurry: 'ಮಸುಕಾದ ಚಿತ್ರಗಳನ್ನು ತಪ್ಪಿಸಿ',
    altText: 'ಆಯ್ಕೆಮಾಡಿದ ಸಸ್ಯದ ಎಲೆ',
    uploadedSecure: 'ಸುರಕ್ಷಿತ ಸರ್ವರ್‌ಗೆ అప్‍ಲೋడ్ ಮಾಡಲಾಗಿದೆ',
    status: 'ಸ್ಥಿತಿ: ',
    uploadIssue: 'అప్‍ಲೋడ్ ಸಮಸ್ಯೆ',
    resetTryAgain: 'ರೀಸೆಟ್ ಮಾಡಿ ಮತ್ತು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    preparing: 'ಚಿತ್ರವನ್ನು ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ...',
    uploading: 'ಚಿತ್ರವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ...',
    success: 'ಚಿತ್ರವನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಅಪ್‌ಲೋಡ್ ಮಾಡಲಾಗಿದೆ',
  },
  ta: {
    failed: 'தோல்வி',
    remove: 'நீக்கு',
    guidelineDesc: 'உடனடி AI பயிர் ஆலோசனையைப் பெற பாதிக்கப்பட்ட தாவர இலையின் புகைப்படத்தை வழங்கவும்.',
    guidelineTitle: 'சிறந்த முடிவுகளுக்கான பட வழிகாட்டுதல்கள்',
    clearImage: 'தெளிவான படத்தைப் பயன்படுத்தவும்',
    captureLeaves: 'பாதிக்கப்பட்ட இலைகளைப் படம் பிடிக்கவும்',
    naturalDaylight: 'இயற்கையான பகல் வெளிச்சத்தை விரும்பவும்',
    avoidBlurry: 'மங்கலான படங்களைத் தவிர்க்கவும்',
    altText: 'தேர்ந்தெடுக்கப்பட்ட தாவர இலை',
    uploadedSecure: 'பாதுகாப்பான சேவையகத்தில் பதிவேற்றப்பட்டது',
    status: 'நிலை: ',
    uploadIssue: 'பதிவேற்ற சிக்கல்',
    resetTryAgain: 'மீட்டமைத்து மீண்டும் முயற்சிக்கவும்',
    preparing: 'படம் தயார் செய்யப்படுகிறது...',
    uploading: 'படம் பதிவேற்றப்படுகிறது...',
    success: 'படம் வெற்றிகரமாக பதிவேற்றப்பட்டது',
  },
  te: {
    failed: 'విఫలమైంది',
    remove: 'తొలగించు',
    guidelineDesc: 'తక్షణ AI పంట సలహా పొందడానికి ప్రభావిత మొక్క ఆకు ఫోటోను అందించండి.',
    guidelineTitle: 'ఉత్తమ ఫలితాల కోసం చిత్ర మార్గదర్శకాలు',
    clearImage: 'స్పష్టమైన చిత్రాన్ని ఉపయోగించండి',
    captureLeaves: 'ప్రభావిత ఆకులను క్యాప్చర్ చేయండి',
    naturalDaylight: 'సహజ పగటి వెలుతురును ప్రాధాన్యత ఇవ్వండి',
    avoidBlurry: 'మసకబారిన చిత్రాలను నివారించండి',
    altText: 'ఎంచుకున్న మొక్క ఆకు',
    uploadedSecure: 'సురక్షిత సర్వర్‌కు అప్‌లోడ్ చేయబడింది',
    status: 'స్థితి: ',
    uploadIssue: 'అప్‌లోడ్ సమస్య',
    resetTryAgain: 'రీసెట్ చేసి మళ్లీ ప్రయత్నించండి',
    preparing: 'చిత్రాన్ని సిద్ధం చేస్తోంది...',
    uploading: 'చిత్రాన్ని అప్‌లోడ్ చేస్తోంది...',
    success: 'చిత్రం విజయవంతంగా అప్‌లోడ్ చేయబడింది',
  },
  bn: {
    failed: 'ব্যর্থ',
    remove: 'সরিয়ে ফেলুন',
    guidelineDesc: 'তাৎক্ষণিক এআই ফসল পরামর্শ পেতে আক্রান্ত গাছের পাতার ছবি দিন।',
    guidelineTitle: 'সেরা ফলাফলের জন্য ছবির নির্দেশিকা',
    clearImage: 'পরিষ্কার ছবি ব্যবহার করুন',
    captureLeaves: 'আক্রান্ত পাতার ছবি তুলুন',
    naturalDaylight: 'প্রাকৃতিক দিনের আলো পছন্দ করুন',
    avoidBlurry: 'ঝাপসা ছবি এড়িয়ে চলুন',
    altText: 'নির্বাচিত গাছের পাতা',
    uploadedSecure: 'সুরক্ষিত সার্ভারে আপলোড করা হয়েছে',
    status: 'অবস্থা: ',
    uploadIssue: 'আপলোড সমস্যা',
    resetTryAgain: 'রিসেট করে আবার চেষ্টা করুন',
    preparing: 'ছবি প্রস্তুত করা হচ্ছে...',
    uploading: 'ছবি আপলোড করা হচ্ছে...',
    success: 'ছবি সফলভাবে আপলোড করা হয়েছে',
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
  const ui = LOCAL_UI[language] || LOCAL_UI.en

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
              {ui.guidelineDesc}
            </p>

            {/* Guidance Grid */}
            <div className="mt-6 w-full max-w-md rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                {ui.guidelineTitle}
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>{ui.clearImage}</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>{ui.captureLeaves}</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>{ui.naturalDaylight}</span>
                </div>
                <div className="flex items-start gap-2 text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓</span>
                  <span>{ui.avoidBlurry}</span>
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
                  alt={ui.altText}
                  className="h-full w-full object-cover"
                />
              )}

              {/* Progress/Preparing Overlay */}
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-[1px]">
                  <div className="w-48 px-4 text-center">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <span>{status === 'preparing' ? t('upload.preparing') || ui.preparing : t('upload.uploading') || ui.uploading}</span>
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
                  {ui.failed}
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
                      {fileMeta.size} • {status === 'success' ? ui.uploadedSecure : `${ui.status} ${status}`}
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
                    {ui.remove}
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
            <p className="font-semibold text-rose-900">{ui.uploadIssue}</p>
            <p className="mt-0.5 leading-relaxed text-xs">{errorMessage}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 text-xs font-bold text-rose-600 hover:underline underline-offset-2"
            >
              {ui.resetTryAgain}
            </button>
          </div>
        </div>
      )}

      {/* Screen-reader status announcements */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {status === 'preparing' && (t('upload.sr.preparing') || ui.preparing)}
        {status === 'uploading' && (t('upload.sr.uploading', { percent: progress }) || `${ui.uploading} ${progress}%`)}
        {status === 'success' && (t('upload.sr.success') || ui.success)}
        {status === 'error' && errorMessage}
      </p>
    </div>
  )
}
