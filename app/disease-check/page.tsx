'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase'
import PhotoUpload from '@/components/PhotoUpload'
import { EntranceAnimation } from '@/components/EntranceAnimation'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListenButton } from '@/components/ListenButton'
import { VoiceInput } from '@/components/VoiceInput'
import { useLanguage } from '@/contexts/LanguageContext'
import { toSpeechLocale } from '@/lib/i18n/speech'
import { type TranslationKey } from '@/lib/i18n/translations'

// ── Types ───────────────────────────────────────────────────────────────────

interface DiseaseCheckResponse {
  diagnosis: string | null
  confidence_score: number
  treatment_advice: string | null
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  spread_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  immediate_action?: string | null
  organic_treatment?: string | null
  chemical_treatment?: string | null
  prevention?: string | null
  monitoring?: string | null
  escalated: boolean
  case_id: string | null
  disease_check_id: string | null
  error?: string
}

type ScreenState = 'loading' | 'ready' | 'unauthenticated' | 'analyzing' | 'success' | 'escalated' | 'error'

// ── Icons (consistent with the project's convention) ────────────────────────

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

const LeafIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="M11 20A7 7 0 0 1 14 6c3 0 6 3 6 6a7 7 0 0 1-5 6.7" />
    <path d="M11 20a7 7 0 0 1-7-7c0-3 3-6 6-6 1.4 0 2.7.5 3.7 1.3" />
    <path d="M11 20v-8" />
  </svg>
)

const CheckIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" {...stroke} strokeWidth={2.5} className="text-emerald-600">
    <path d="m20 6-11 11-5-5" />
  </svg>
)

const ShieldAlertIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" {...stroke}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
)

const RefreshIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const OrganicIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
    <path d="M12 2a15 15 0 0 0-3 9c0 4.4 3.6 8 8 8a8 8 0 0 0 8-8c0-3.3-3.6-9-13-9Z" />
    <path d="M12 2A15 15 0 0 1 15 11c0 4.4-3.6 8-8 8A8 8 0 0 1 1 11c0-3.3 3.6-9 11-9Z" />
  </svg>
)

const ChemicalIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
    <path d="M4.5 3h15" />
    <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
    <path d="M6 14h12" />
  </svg>
)

const PreventionIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const MonitoringIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
    <circle cx="12" cy="12" r="10" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

// ── Localized Mapped Loading Statuses ────────────────────────────────────────

const LOADING_STATUSES: Record<string, string[]> = {
  en: [
    'Analyzing crop image...',
    'Detecting disease patterns...',
    'Comparing symptoms...',
    'Evaluating confidence...',
    'Generating treatment...',
    'Preparing localized response...',
  ],
  hi: [
    'फसल की छवि का विश्लेषण किया जा रहा है...',
    'रोग के लक्षणों की पहचान की जा रही है...',
    'लक्षणों की तुलना की जा रही है...',
    'विश्वास स्कोर का मूल्यांकन किया जा रहा है...',
    'उपचार तैयार किया जा रहा है...',
    'स्थानीयकृत प्रतिक्रिया तैयार की जा रही है...',
  ],
  te: [
    'పంట చిత్రాన్ని విశ్లేషిస్తోంది...',
    'తెగులు నమూనాలను గుర్తిస్తోంది...',
    'లక్షణాలను పోల్చి చూస్తోంది...',
    'నమ్మక స్థాయిని అంచనా వేస్తోంది...',
    'చికిత్సను రూపొందిస్తోంది...',
    'స్థానిక ప్రతిస్పందనను సిద్ధం చేస్తోంది...',
  ],
  mr: [
    'पिकाच्या चित्राचे विश्लेषण करत आहे...',
    'रोगाची लक्षणे शोधत आहे...',
    'लक्षणांची तुलना करत आहे...',
    'विश्वासार्हतेचे मूल्यमापन करत आहे...',
    'उपचार तयार करत आहे...',
    'स्थानिक प्रतिसाद तयार करत आहे...',
  ],
  gu: [
    'પાકની છબીનું વિશ્લેષણ કરવામાં આવી રહ્યું છે...',
    'રોગના લક્ષણો ઓળખવામાં આવી રહ્યા છે...',
    'લક્ષણોની સરખામણી કરવામાં આવી રહી છે...',
    'વિશ્વાસ સ્કોરનું મૂલ્યાંકન કરવામાં આવી રહ્યું છે...',
    'સારવાર તૈયાર કરવામાં આવી રહી છે...',
    'સ્થાનિક પ્રતિસાદ તૈયાર કરવામાં આવી રહ્યો છે...',
  ],
  kn: [
    'ಬೆಳೆಯ ಚಿತ್ರವನ್ನು ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ...',
    'ರೋಗದ ಲಕ್ಷಣಗಳನ್ನು ಗುರುತಿಸಲಾಗುತ್ತಿದೆ...',
    'ಲಕ್ಷಣಗಳನ್ನು ಹೋಲಿಸಲಾಗುತ್ತಿದೆ...',
    'ವಿಶ್ವಾಸಾರ್ಹತೆಯನ್ನು ಮೌಲ್ಯಮಾಪನ ಮಾಡಲಾಗುತ್ತಿದೆ...',
    'ಚಿಕಿತ್ಸೆಯನ್ನು ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ...',
    'ಸ್ಥಳೀಯ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ...',
  ],
  ta: [
    'பயிர் படத்தை பகுப்பாய்வு செய்கிறது...',
    'நோய் அறிகுறிகளை கண்டறிகிறது...',
    'அறிகுறிகளை ஒப்பிடுகிறது...',
    'நம்பிக்கை அளவை மதிப்பிடுகிறது...',
    'சிகிச்சையை உருவாக்குகிறது...',
    'உள்ளூர் பதிலை தயார் செய்கிறது...',
  ],
  bn: [
    'ফসলের ছবি বিশ্লেষণ করা হচ্ছে...',
    'রোগের লক্ষণ সনাক্ত করা হচ্ছে...',
    'লক্ষণগুলির তুলনা করা হচ্ছে...',
    'আত্মবিশ্বাসের মাত্রা মূল্যায়ন করা হচ্ছে...',
    'চিকিৎসা প্রস্তুত করা হচ্ছে...',
    'স্থানীয় প্রতিক্রিয়া প্রস্তুত করা হচ্ছে...',
  ],
}

// ── Farmer-Friendly Error Mappings ───────────────────────────────────────────

const ERROR_MAPPINGS: Record<string, Record<string, string>> = {
  en: {
    upload_failed: 'We could not upload your image. Please check your internet and try again.',
    network_error: 'Unable to connect to the server. Please check your internet and try again.',
    ai_unavailable: 'The AI crop assistant is temporarily busy. Please try again in a few moments.',
    image_unsupported: 'This file format is not supported. Please upload a clear photo (JPG, PNG, or WEBP).',
    file_too_large: 'The selected photo is too large. Please take another photo with a smaller file size.',
    generic: 'An unexpected issue occurred while analyzing your crop. Please try again.',
  },
  hi: {
    upload_failed: 'हम आपकी छवि अपलोड नहीं कर सके। कृपया अपना इंटरनेट जांचें और पुनः प्रयास करें।',
    network_error: 'सर्वर से कनेक्ट करने में असमर्थ। कृपया अपना इंटरनेट जांचें और पुनः प्रयास करें।',
    ai_unavailable: 'एआई फसल सहायक अस्थायी रूप से व्यस्त है। कृपया कुछ क्षणों में पुनः प्रयास करें।',
    image_unsupported: 'यह फ़ाइल प्रारूप समर्थित नहीं है। कृपया एक स्पष्ट फोटो (JPG, PNG, या WEBP) अपलोड करें।',
    file_too_large: 'चुनी गई फोटो बहुत बड़ी है। कृपया छोटे आकार की दूसरी फोटो लें।',
    generic: 'आपकी फसल का विश्लेषण करते समय एक अप्रत्याशित समस्या उत्पन्न हुई। कृपया पुनः प्रयास करें।',
  },
  te: {
    upload_failed: 'మేము మీ చిత్రాన్ని అప్‌లోడ్ చేయలేకపోయాము. దయచేసి మీ ఇంటర్నెట్‌ని తనిఖీ చేసి, మళ్లీ ప్రయత్నించండి.',
    network_error: 'సర్వర్‌కు కనెక్ట్ చేయడం సాధ్యం కాలేదు. దయచేసి మీ ఇంటర్నెట్‌ని తనిఖీ చేసి, మళ్లీ ప్రయత్నించండి.',
    ai_unavailable: 'AI క్రాప్ అసిస్టెంట్ తాత్కాలికంగా బిజీగా ఉన్నారు. దయచేసి కొద్దిసేపటి తర్వాత ప్రయత్నించండి.',
    image_unsupported: 'ఈ ఫైల్ ఫార్మాట్‌కు మద్దతు లేదు. దయచేసి స్పష్టమైన ఫోటోను (JPG, PNG, లేదా WEBP) అప్‌లోడ్ చేయండి.',
    file_too_large: 'ఎంచుకున్న ఫోటో చాలా పెద్దదిగా ఉంది. దయచేసి తక్కువ సైజులో ఉన్న మరో ఫోటోను తీసుకోండి.',
    generic: 'మీ పంటను విశ్లేషించేటప్పుడు ఊహించని సమస్య సంభవించింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
  },
}

function getFriendlyErrorMessage(err: unknown, lang: string): string {
  const errorText = err instanceof Error ? err.message.toLowerCase() : ''
  const dict = ERROR_MAPPINGS[lang] || ERROR_MAPPINGS.en

  if (errorText.includes('unsupported') || errorText.includes('format') || errorText.includes('invalid file')) {
    return dict.image_unsupported
  }
  if (errorText.includes('large') || errorText.includes('size') || errorText.includes('15mb') || errorText.includes('10mb')) {
    return dict.file_too_large
  }
  if (errorText.includes('upload') || errorText.includes('cloudinary') || errorText.includes('signature')) {
    return dict.upload_failed
  }
  if (errorText.includes('network') || errorText.includes('failed to fetch') || errorText.includes('connection')) {
    return dict.network_error
  }
  if (errorText.includes('gemini') || errorText.includes('ai') || errorText.includes('failed') || errorText.includes('model')) {
    return dict.ai_unavailable
  }
  return dict.generic
}

// ── Confidence styling ───────────────────────────────────────────────────────

function confidenceStyle(score: number, t: (key: TranslationKey) => string): {
  label: string
  text: string
  bg: string
  ring: string
  dot: string
} {
  if (score >= 0.8) {
    return {
      label: t('disease.confidence.high'),
      text: 'text-emerald-700 font-semibold',
      bg: 'bg-emerald-50 dark:bg-emerald-950/20',
      ring: 'ring-emerald-600/20',
      dot: 'bg-emerald-500',
    }
  }
  if (score >= 0.6) {
    return {
      label: t('disease.confidence.moderate'),
      text: 'text-amber-700 font-semibold',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      ring: 'ring-amber-600/20',
      dot: 'bg-amber-500',
    }
  }
  return {
    label: t('disease.confidence.low'),
    text: 'text-rose-700 font-semibold',
    bg: 'bg-rose-50 dark:bg-rose-950/20',
    ring: 'ring-rose-600/20',
    dot: 'bg-rose-500',
  }
}

// ── Crop Selector Options ───────────────────────────────────────────────────

const CROPS = [
  { value: 'Cotton', key: 'crop.cotton' },
  { value: 'Rice', key: 'crop.rice' },
  { value: 'Wheat', key: 'crop.wheat' },
  { value: 'Maize', key: 'crop.maize' },
  { value: 'Tomato', key: 'crop.tomato' },
  { value: 'Potato', key: 'crop.potato' },
  { value: 'Onion', key: 'crop.onion' },
  { value: 'Chilli', key: 'crop.chilli' },
  { value: 'Sugarcane', key: 'crop.sugarcane' },
  { value: 'Soybean', key: 'crop.soybean' },
  { value: 'Groundnut', key: 'crop.groundnut' },
  { value: 'Banana', key: 'crop.banana' },
  { value: 'Grapes', key: 'crop.grapes' },
  { value: 'Mango', key: 'crop.mango' },
  { value: 'Pomegranate', key: 'crop.pomegranate' },
  { value: 'Millets', key: 'crop.millets' },
] as const

// ── Component ────────────────────────────────────────────────────────────────

export default function DiseaseCheckPage() {
  const supabase = useMemo(() => createClient(), [])
  const statusId = useId()
  const { t, language } = useLanguage()

  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [diagnosisResult, setDiagnosisResult] = useState<DiseaseCheckResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [voiceDescription, setVoiceDescription] = useState<string>('')
  const [selectedCrop, setSelectedCrop] = useState<string>('')

  // Loading animation state variables
  const [statusIndex, setStatusIndex] = useState(0)
  const [analysisProgress, setAnalysisProgress] = useState(0)

  // Verification & Auth check on mount
  useEffect(() => {
    let active = true

    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return

      if (!user) {
        setScreenState('unauthenticated')
      } else {
        setScreenState('ready')
      }
    }

    checkAuth()
    return () => {
      active = false
    }
  }, [supabase])

  // Cycle messages during active analysis (every 1.5 seconds)
  useEffect(() => {
    if (screenState !== 'analyzing') return

    const interval = setInterval(() => {
      setStatusIndex((prev) => prev + 1)
    }, 1500)

    return () => clearInterval(interval)
  }, [screenState])

  // Smooth progress bar increment logic (0 - 90%)
  useEffect(() => {
    if (screenState !== 'analyzing') return

    const interval = setInterval(() => {
      setAnalysisProgress((prev) => {
        if (prev >= 90) return 90
        const diff = 90 - prev
        const increment = Math.max(0.5, diff * 0.08)
        return Math.min(90, prev + increment)
      })
    }, 120)

    return () => clearInterval(interval)
  }, [screenState])

  // Main diagnosis triggering function
  async function handleCheck(urlToDiagnose: string) {
    setScreenState('analyzing')
    setErrorMsg(null)
    setAnalysisProgress(0)
    setStatusIndex(0)

    try {
      const response = await fetch('/api/disease-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: urlToDiagnose,
          target_lang: language,
          crop_type: selectedCrop || undefined,
        }),
      })

      const data = (await response.json()) as DiseaseCheckResponse

      if (!response.ok) {
        throw new Error(data.error ?? t('disease.failed'))
      }

      // Smooth progress completion to 100%
      setAnalysisProgress(100)
      await new Promise((resolve) => setTimeout(resolve, 450))

      setDiagnosisResult(data)

      // Decide screen redirect based on backend escalation or confidence score
      if (data.escalated || (data.confidence_score !== undefined && data.confidence_score < 0.6)) {
        setScreenState('escalated')
      } else {
        setScreenState('success')
      }
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, language)
      setErrorMsg(friendlyMsg)
      setScreenState('error')
    }
  }

  async function handleVoiceDiagnosis() {
    if (!voiceDescription.trim()) return

    setScreenState('analyzing')
    setErrorMsg(null)
    setAnalysisProgress(0)
    setStatusIndex(0)

    try {
      const response = await fetch('/api/disease-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_description: voiceDescription,
          target_lang: language,
          crop_type: selectedCrop || undefined,
        }),
      })

      const data = (await response.json()) as DiseaseCheckResponse

      if (!response.ok) {
        throw new Error(data.error ?? t('disease.failed'))
      }

      // Smooth progress completion to 100%
      setAnalysisProgress(100)
      await new Promise((resolve) => setTimeout(resolve, 450))

      setDiagnosisResult(data)

      if (data.escalated || (data.confidence_score !== undefined && data.confidence_score < 0.6)) {
        setScreenState('escalated')
      } else {
        setScreenState('success')
      }
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, language)
      setErrorMsg(friendlyMsg)
      setScreenState('error')
    }
  }

  function handleReset() {
    setImageUrl(null)
    setDiagnosisResult(null)
    setErrorMsg(null)
    setVoiceDescription('')
    setAnalysisProgress(0)
    setStatusIndex(0)
    setScreenState('ready')
  }

  // Get active rotating status message
  const currentLoadingMsg = useMemo(() => {
    const msgs = LOADING_STATUSES[language] || LOADING_STATUSES.en
    return msgs[statusIndex % msgs.length]
  }, [language, statusIndex])

  return (
    <main className="min-h-screen bg-slate-50 font-sans" aria-busy={screenState === 'analyzing'}>
      {/* Navigation Header */}
      <nav className="border-b border-slate-100 bg-white shadow-sm" aria-label="Global breadcrumb">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-5 sm:px-6">
          <Link
            href="/dashboard"
            className="flex h-11 items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded px-2 py-1 min-h-[44px]"
          >
            {ArrowLeftIcon}
            <span>{t('disease.back')}</span>
          </Link>
          <span className="text-slate-200" aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="text-primary-green">{LeafIcon}</span>
            {t('disease.diagnosisHeader')}
          </span>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-6 sm:py-10">
        {/* Header Block */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t('disease.aiDiagnosisTitle')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {t('disease.aiDiagnosisDetail')}
          </p>
        </header>

        <AnimatePresence mode="wait">
          {/* 1. Loading Auth State */}
          {screenState === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 animate-pulse"
              aria-hidden="true"
            >
              <div className="h-60 w-full rounded-2xl bg-slate-200" />
              <div className="h-10 w-full rounded-xl bg-slate-200" />
            </motion.div>
          )}

          {/* 2. Unauthenticated state */}
          {screenState === 'unauthenticated' && (
            <EntranceAnimation
              key="unauthenticated"
              exit={{ opacity: 0 }}
            >
              <EmptyState
                title={t('disease.authRequired')}
                description={t('disease.authRequiredDetail')}
                action={
                  <Link
                    href="/login"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-green px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 min-h-[44px]"
                  >
                    {t('login.signIn')}
                  </Link>
                }
              />
            </EntranceAnimation>
          )}

          {/* 3. Drop/Upload Area (Ready state) */}
          {screenState === 'ready' && (
            <EntranceAnimation
              key="ready"
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Crop Selector Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label htmlFor="crop-select" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {t('disease.selectCrop')}
                </label>
                <div className="relative">
                  <select
                    id="crop-select"
                    value={selectedCrop}
                    onChange={(e) => setSelectedCrop(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 hover:border-slate-300 focus:border-primary-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-green/20 transition-all cursor-pointer min-h-[44px]"
                  >
                    <option value="">-- {t('disease.selectCrop') || 'Select Crop'} --</option>
                    {CROPS.map((crop) => (
                      <option key={crop.value} value={crop.value}>
                        {t(crop.key as TranslationKey)}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Photo Upload Area */}
              <PhotoUpload
                label={t('disease.uploadStep1')}
                onUpload={(url) => {
                  setImageUrl(url)
                  setErrorMsg(null)
                }}
                onError={(msg) => {
                  setErrorMsg(msg)
                  setScreenState('error')
                }}
              />

              {/* Diagnose Button if image is loaded */}
              {imageUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="pt-2 animate-fade-in"
                >
                  <button
                    type="button"
                    onClick={() => handleCheck(imageUrl)}
                    className="flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-primary-green px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-green/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 focus-visible:ring-offset-2 min-h-[44px]"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span>Run Crop Diagnosis</span>
                  </button>
                </motion.div>
              )}

              {/* OR Divider & Voice Option if no image selected */}
              {!imageUrl && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-slate-50 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t('disease.describeOr')}
                      </span>
                    </div>
                  </div>

                  <VoiceInput onTranscript={(text) => setVoiceDescription(text)} />

                  {voiceDescription.trim() !== '' && (
                    <button
                      type="button"
                      onClick={handleVoiceDiagnosis}
                      className="mt-4 flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-primary-green px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 active:scale-[0.99] min-h-[44px]"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4z" />
                        <path d="M22 2 11 13" />
                      </svg>
                      {t('disease.diagnoseBtn')}
                    </button>
                  )}
                </>
              )}
            </EntranceAnimation>
          )}

          {/* 4. Analyzing State (Scanning UI + Rotating messages + Smooth progress) */}
          {screenState === 'analyzing' && (imageUrl || voiceDescription) && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md"
            >
              <div className="relative aspect-[4/3] w-full bg-slate-950">
                {imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Analyzing leaf upload"
                      className="h-full w-full object-cover opacity-50 filter blur-[0.5px]"
                    />

                    {/* Laser scan animation overlay */}
                    <motion.div
                      className="absolute left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_rgba(52,211,153,0.9)]"
                      initial={{ top: '0%' }}
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </>
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                )}
                
                {/* Overlay Panel */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 p-6 text-center">
                  <div className="rounded-full bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20 backdrop-blur-md">
                    <span className="flex h-4 w-4 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                    </span>
                  </div>
                  
                  <h3 className="mt-5 text-sm font-bold text-white uppercase tracking-wider">
                    {t('disease.analyzingSnapshot') || 'Analyzing Snapshot'}
                  </h3>
                  
                  {/* Rotating status message */}
                  <div className="h-6 mt-1 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={statusIndex}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs text-emerald-400 font-mono tracking-wide"
                      >
                        {currentLoadingMsg}
                      </motion.p>
                    </AnimatePresence>
                  </div>

                  {/* Visual Progress bar */}
                  <div className="mt-8 w-64 max-w-full px-4">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                      <span>Advisory Progress</span>
                      <span className="tabular-nums font-semibold text-emerald-400">{Math.round(analysisProgress)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden backdrop-blur-sm shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 5. Diagnosis Result (Success / Escalated) */}
          {(screenState === 'success' || screenState === 'escalated') && diagnosisResult && (imageUrl || voiceDescription) && (
            <EntranceAnimation
              key="result"
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {imageUrl && (
                  <div className="relative aspect-[16/9] w-full bg-slate-100 border-b border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Diagnosed plant leaf"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md uppercase tracking-wider">
                      {CheckIcon}
                      {t('disease.analysisCompleted')}
                    </div>
                  </div>
                )}

                {!imageUrl && voiceDescription && (
                  <div className="border-b border-slate-100 bg-emerald-50/10 p-5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" x2="12" y1="19" y2="22" />
                        </svg>
                      </span>
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">{t('disease.voiceDiagnosis')}</span>
                    </div>
                    <p className="mt-3 text-sm italic text-slate-500 leading-relaxed">&ldquo;{voiceDescription}&rdquo;</p>
                  </div>
                )}

                <div className="p-5 sm:p-6">
                  {/* Low Confidence / Escalation Warning Banner */}
                  {(screenState === 'escalated' || diagnosisResult.escalated) && (
                    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
                      <span className="mt-0.5 shrink-0 text-amber-500">{ShieldAlertIcon}</span>
                      <div className="flex-1">
                        <h4 className="font-bold text-amber-950 leading-snug">
                          {t('disease.lowConfidenceWarning')}
                        </h4>
                        {diagnosisResult.case_id && (
                          <p className="mt-1.5 text-xs font-bold text-amber-800">
                            {t('disease.referenceId', { id: diagnosisResult.case_id })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Title and Badges */}
                  <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {screenState === 'escalated' || diagnosisResult.escalated ? t('disease.suspectedDisease') : t('disease.label')}
                      </span>
                      <h2 className="text-xl font-bold text-slate-900 mt-1 leading-tight">
                        {diagnosisResult.diagnosis}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      {diagnosisResult.confidence_score !== undefined && (
                        (() => {
                          const style = confidenceStyle(diagnosisResult.confidence_score, t)
                          return (
                            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${style.text} ${style.bg} ring-1 ring-inset ${style.ring}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                              <span>{t('disease.confidencePercent', { percent: (diagnosisResult.confidence_score * 100).toFixed(0) })}</span>
                            </div>
                          )
                        })()
                      )}

                      {/* Severity badge */}
                      {diagnosisResult.severity && (
                        (() => {
                          const sev = diagnosisResult.severity.toUpperCase()
                          const classes = 
                            sev === 'HIGH' 
                              ? 'bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/20 dark:text-rose-400'
                              : sev === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/20 dark:text-amber-400'
                                : 'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/20 dark:text-emerald-400'
                          return (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset ${classes} uppercase tracking-wider`}>
                              {t(`disease.severity.${sev.toLowerCase()}` as TranslationKey)} {language === 'gu' ? 'તીવ્રતા' : language === 'hi' ? 'तीव्रता' : language === 'mr' ? 'तीव्रता' : language === 'kn' ? 'ತೀವ್ರತೆ' : language === 'ta' ? 'தீவிரம்' : language === 'te' ? 'తీవ్రత' : language === 'bn' ? 'তীব্রতা' : 'Severity'}
                            </span>
                          )
                        })()
                      )}
                    </div>
                  </div>

                  {/* Spread Risk Section */}
                  {diagnosisResult.spread_risk && (
                    <div className="mt-5 border-b border-slate-100 pb-5">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        {(() => {
                          const risk = diagnosisResult.spread_risk.toUpperCase()
                          const emoji = risk === 'HIGH' ? '🔴' : risk === 'MEDIUM' ? '🟡' : '🟢'
                          return (
                            <>
                              <span aria-hidden="true" className="text-sm">{emoji}</span>
                              <span>{t(`disease.spreadRisk.${risk.toLowerCase()}` as TranslationKey)}</span>
                            </>
                          )
                        })()}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {t(`disease.spreadRisk.${diagnosisResult.spread_risk.toLowerCase()}.desc` as TranslationKey)}
                      </p>
                    </div>
                  )}

                  {/* Immediate Action Card */}
                  {diagnosisResult.immediate_action && (
                    <div className="mt-5 rounded-2xl border-l-4 border-rose-500 bg-rose-50/50 p-5 shadow-sm">
                      <div className="flex items-center gap-2 text-rose-800">
                        <span aria-hidden="true" className="text-sm">🚨</span>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600">
                          {t('disease.immediateAction') || 'CRITICAL IMMEDIATE ACTION'}
                        </h4>
                      </div>
                      <p className="mt-2.5 text-sm font-semibold text-rose-950 leading-relaxed">
                        {diagnosisResult.immediate_action}
                      </p>
                    </div>
                  )}

                  {/* Structured Treatment Advisory Report */}
                  <div className="mt-8 border-t border-slate-100 pt-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                      {t('disease.recommendedTreatment') || 'Recommended Treatment Advisory'}
                    </h3>
                    
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {/* Organic Treatment Card */}
                      {diagnosisResult.organic_treatment && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/[0.05] p-4 transition-all hover:shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            {OrganicIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.organic')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.organic_treatment}
                          </p>
                        </div>
                      )}

                      {/* Chemical Treatment Card */}
                      {diagnosisResult.chemical_treatment && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/[0.05] p-4 transition-all hover:shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            {ChemicalIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.chemical')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.chemical_treatment}
                          </p>
                        </div>
                      )}

                      {/* Prevention Card */}
                      {diagnosisResult.prevention && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/[0.05] p-4 transition-all hover:shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            {PreventionIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.prevention')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.prevention}
                          </p>
                        </div>
                      )}

                      {/* Monitoring Card */}
                      {diagnosisResult.monitoring && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50/[0.05] p-4 transition-all hover:shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            {MonitoringIcon}
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              {t('disease.treatment.monitoring')}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {diagnosisResult.monitoring}
                          </p>
                        </div>
                      )}
                    </div>

                    {diagnosisResult.treatment_advice && (
                      <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-relaxed text-slate-400 italic flex-1">
                          {diagnosisResult.treatment_advice}
                        </p>
                        <div className="shrink-0">
                          <ListenButton
                            text={(() => {
                              const parts = [
                                diagnosisResult.treatment_advice
                              ]
                              if (diagnosisResult.organic_treatment) {
                                parts.push(`${t('disease.treatment.organic')}: ${diagnosisResult.organic_treatment}`)
                              }
                              if (diagnosisResult.chemical_treatment) {
                                parts.push(`${t('disease.treatment.chemical')}: ${diagnosisResult.chemical_treatment}`)
                              }
                              if (diagnosisResult.prevention) {
                                parts.push(`${t('disease.treatment.prevention')}: ${diagnosisResult.prevention}`)
                              }
                              if (diagnosisResult.monitoring) {
                                parts.push(`${t('disease.treatment.monitoring')}: ${diagnosisResult.monitoring}`)
                              }
                              return parts.join('. ')
                            })()}
                            languageCode={toSpeechLocale(language)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Reset button */}
              <button
                type="button"
                onClick={handleReset}
                className="flex w-full h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 min-h-[44px]"
              >
                {RefreshIcon}
                {t('disease.scanAnother') || 'Scan Another Crop Leaf'}
              </button>
            </EntranceAnimation>
          )}

          {/* 7. Error state card */}
          {screenState === 'error' && errorMsg && (
            <EntranceAnimation
              key="error"
              exit={{ opacity: 0 }}
            >
              <ErrorState
                title={t('disease.failed') || 'Advisory Failed'}
                description={errorMsg}
                onRetry={handleReset}
                secondaryAction={
                  <Link
                    href="/dashboard"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 min-h-[44px]"
                  >
                    {t('disease.returnDashboard') || 'Return to Dashboard'}
                  </Link>
                }
              />
            </EntranceAnimation>
          )}
        </AnimatePresence>
      </div>

      {/* Screen reader live updates */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {screenState === 'loading' && (t('disease.sr.checkingAuth') || 'Verifying user auth...')}
        {screenState === 'analyzing' && currentLoadingMsg}
        {screenState === 'success' && (t('disease.sr.complete', { diagnosis: diagnosisResult?.diagnosis || '' }) || `Diagnosis complete. Result is ${diagnosisResult?.diagnosis}`)}
        {screenState === 'escalated' && (t('disease.sr.escalated') || 'Diagnosis escalated to expert panel')}
        {screenState === 'error' && (t('disease.sr.failed', { error: errorMsg || '' }) || `Analysis failed: ${errorMsg}`)}
      </p>
    </main>
  )
}
