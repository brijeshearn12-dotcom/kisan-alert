'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'
import { getLanguageMeta, formatNumber, parseTreatmentAdvice } from '@/lib/i18n/translations'

interface FarmerProfile {
  id: string
  name: string | null
}

interface DiseaseCheck {
  id: string
  image_url: string | null
  diagnosis: string | null
  confidence_score: number
  treatment_advice: string | null
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
  const { t, language } = useLanguage()
  const [caseRecord, setCaseRecord] = useState<CaseRecord>(initialCase)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)

  const check = caseRecord.disease_checks
  const farmer = check?.users
  const isPending = caseRecord.status === 'pending'
  const parsedAdvice = parseTreatmentAdvice(check?.treatment_advice || null)

  // Helper to derive severity from crop/confidence
  function getDerivedSeverity(diagnosis: string | null, confidence: number): 'Low' | 'Moderate' | 'High' {
    const d = (diagnosis || '').toLowerCase()
    if (d.includes('blight') || d.includes('rot') || d.includes('wilt') || d.includes('rust') || confidence < 0.4) {
      return 'High'
    }
    if (d.includes('spot') || d.includes('mildew') || d.includes('scab') || confidence < 0.7) {
      return 'Moderate'
    }
    return 'Low'
  }

  // Initialize states dynamically, pre-populating with AI values if pending or parsing JSON if resolved
  const [severity, setSeverity] = useState<'Low' | 'Moderate' | 'High'>(() => {
    if (initialCase.expert_notes) {
      try {
        const parsed = JSON.parse(initialCase.expert_notes)
        if (parsed.severity) return parsed.severity
      } catch {}
    }
    const aiSeverity = check?.treatment_advice ? parseTreatmentAdvice(check.treatment_advice).severity : null
    if (aiSeverity && ['Low', 'Moderate', 'High'].includes(aiSeverity)) {
      return aiSeverity as 'Low' | 'Moderate' | 'High'
    }
    return getDerivedSeverity(check?.diagnosis || null, check?.confidence_score || 0.5)
  })

  const [immediateAction, setImmediateAction] = useState(() => {
    if (initialCase.expert_notes) {
      try {
        const parsed = JSON.parse(initialCase.expert_notes)
        if (parsed.immediate_action) return parsed.immediate_action
      } catch {}
    }
    return check?.treatment_advice ? (parseTreatmentAdvice(check.treatment_advice).immediate_action || '') : ''
  })

  const [treatment, setTreatment] = useState(() => {
    if (initialCase.expert_notes) {
      try {
        const parsed = JSON.parse(initialCase.expert_notes)
        if (parsed.treatment) return parsed.treatment
      } catch {}
    }
    return check?.treatment_advice ? (parseTreatmentAdvice(check.treatment_advice).treatment_advice || '') : ''
  })

  const [prevention, setPrevention] = useState(() => {
    if (initialCase.expert_notes) {
      try {
        const parsed = JSON.parse(initialCase.expert_notes)
        if (parsed.prevention) return parsed.prevention
      } catch {}
    }
    return check?.treatment_advice ? (parseTreatmentAdvice(check.treatment_advice).prevention || '') : ''
  })

  const [recoveryOutlook, setRecoveryOutlook] = useState<'Excellent' | 'Moderate' | 'Poor'>(() => {
    if (initialCase.expert_notes) {
      try {
        const parsed = JSON.parse(initialCase.expert_notes)
        if (parsed.recovery_outlook) return parsed.recovery_outlook
      } catch {}
    }
    const derivedSev = check?.treatment_advice ? parseTreatmentAdvice(check.treatment_advice).severity : null
    if (derivedSev === 'High') return 'Poor'
    if (derivedSev === 'Moderate') return 'Moderate'
    return 'Excellent'
  })

  const [recoveryTime, setRecoveryTime] = useState(() => {
    if (initialCase.expert_notes) {
      try {
        const parsed = JSON.parse(initialCase.expert_notes)
        if (parsed.recovery_time) return parsed.recovery_time
      } catch {}
    }
    const derivedSev = check?.treatment_advice ? parseTreatmentAdvice(check.treatment_advice).severity : null
    if (derivedSev === 'High') return '14-21 Days'
    if (derivedSev === 'Moderate') return '10-14 Days'
    return '5-7 Days'
  })

  const [notes, setNotes] = useState(() => {
    if (initialCase.expert_notes) {
      try {
        const parsed = JSON.parse(initialCase.expert_notes)
        if (parsed.notes !== undefined) return parsed.notes
      } catch {}
      return initialCase.expert_notes
    }
    return ''
  })

  // Parse expert notes (might be JSON report or raw text notes)
  let expertReport: {
    severity: 'Low' | 'Moderate' | 'High'
    immediate_action: string
    treatment: string
    prevention: string
    recovery_outlook: 'Excellent' | 'Moderate' | 'Poor'
    recovery_time: string
    notes: string
  } | null = null

  if (caseRecord.expert_notes) {
    try {
      const parsed = JSON.parse(caseRecord.expert_notes)
      if (parsed && typeof parsed === 'object') {
        expertReport = {
          severity: parsed.severity || 'Moderate',
          immediate_action: parsed.immediate_action || '',
          treatment: parsed.treatment || '',
          prevention: parsed.prevention || '',
          recovery_outlook: parsed.recovery_outlook || 'Excellent',
          recovery_time: parsed.recovery_time || '',
          notes: parsed.notes || '',
        }
      }
    } catch {
      // Legacy note (plain text)
      const aiSeverity = check?.treatment_advice ? parseTreatmentAdvice(check.treatment_advice).severity : null
      const severityVal = (aiSeverity && ['Low', 'Moderate', 'High'].includes(aiSeverity))
        ? aiSeverity as 'Low' | 'Moderate' | 'High'
        : getDerivedSeverity(check?.diagnosis || null, check?.confidence_score || 0.5)

      const derivedOutlook: 'Excellent' | 'Moderate' | 'Poor' =
        severityVal === 'High' ? 'Poor' : severityVal === 'Moderate' ? 'Moderate' : 'Excellent'

      const derivedTime =
        severityVal === 'High' ? '14-21 Days' : severityVal === 'Moderate' ? '10-14 Days' : '5-7 Days'

      expertReport = {
        severity: severityVal,
        immediate_action: check?.treatment_advice ? (parseTreatmentAdvice(check.treatment_advice).immediate_action || 'No immediate action notes.') : 'No immediate action notes.',
        treatment: check?.treatment_advice ? (parseTreatmentAdvice(check.treatment_advice).treatment_advice || 'Follow standard local practice.') : 'Follow standard local practice.',
        prevention: check?.treatment_advice ? (parseTreatmentAdvice(check.treatment_advice).prevention || 'Maintain general farm hygiene.') : 'Maintain general farm hygiene.',
        recovery_outlook: derivedOutlook,
        recovery_time: derivedTime,
        notes: caseRecord.expert_notes || '',
      }
    }
  }

  // Validate URL structure (prevent null or broken strings)
  const isValidUrl =
    check?.image_url &&
    (check.image_url.startsWith('http://') || check.image_url.startsWith('https://'))

  async function handleResolve() {
    if (submitting) return
    setSubmitting(true)
    setErrorMsg(null)

    const payload = JSON.stringify({
      severity,
      immediate_action: immediateAction.trim(),
      treatment: treatment.trim(),
      prevention: prevention.trim(),
      recovery_outlook: recoveryOutlook,
      recovery_time: recoveryTime.trim(),
      notes: notes.trim(),
    })

    try {
      const response = await fetch(`/api/cases/${caseRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'resolved',
          expert_notes: payload,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? t('expert.updateFailed'))
      }

      setCaseRecord((prev) => ({
        ...prev,
        status: 'resolved',
        expert_notes: payload,
        resolved_at: new Date().toISOString(),
      }))

      router.refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('expert.resolveFailed'))
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
        <span>{t('expert.backToCases')}</span>
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Image, Metadata, AI Treatment, and Verified Expert Report Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Image display with loading fallbacks */}
            <div className="relative aspect-[16/9] w-full bg-slate-900 flex items-center justify-center">
              {isValidUrl && !imageError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={check.image_url || undefined}
                  alt={`Crop diagnosed as ${check.diagnosis}`}
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
                  <span className="text-sm font-medium">{t('expert.imageUnavailable')}</span>
                  <span className="text-xs text-slate-500 max-w-xs">
                    {t('expert.imageUnavailableDetail')}
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
                  <span>{isPending ? t('expert.status.pending') : t('expert.status.resolved')}</span>
                </span>
              </div>
            </div>

            {/* Analysis details */}
            <div className="p-5 sm:p-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('disease.label')}</span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                {check?.diagnosis || t('expert.unknownDisease')}
              </h2>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                <div>
                  {t('expert.farmer', { name: farmer?.name || t('expert.anonymousFarmer') })}
                </div>
                <div>•</div>
                <div>
                  {t('recommendation.result.confidence')}: <span className="font-semibold text-slate-700">{check?.confidence_score !== undefined ? `${formatNumber(Math.round(check.confidence_score * 100), language)}%` : 'N/A'}</span>
                </div>
                <div>•</div>
                <div>
                  {t('expert.submittedOn', { date: new Date(caseRecord.created_at).toLocaleString(getLanguageMeta(language).locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) })}
                </div>
              </div>

              {isPending && (
                <div className="mt-6 border-t border-slate-100 pt-6">
                  <h3 className="text-sm font-semibold text-slate-800">{t('expert.aiTreatment')}</h3>
                  {parsedAdvice.immediate_action && (
                    <div className="my-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 text-xs text-rose-800">
                      <span className="font-bold block mb-1 uppercase tracking-wide text-rose-500">{t('disease.immediateAction')}</span>
                      {parsedAdvice.immediate_action}
                    </div>
                  )}
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                    {parsedAdvice.treatment_advice || t('expert.noTreatment')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* VERIFIED EXPERT REPORT CARD */}
          {!isPending && expertReport && (
            <div className="rounded-2xl border-2 border-primary-green bg-white shadow-md overflow-hidden animate-fade-in-up">
              {/* Verified Ribbon Header */}
              <div className="bg-primary-green px-5 py-3 text-white text-sm font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  <span className="font-bold tracking-wide">{t('expert.verifiedBy')}</span>
                </div>
                <span className="text-xs uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded font-bold">
                  {t('expert.status.verified')}
                </span>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                {/* 1. Diagnosis & Severity */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      {t('expert.diagnosis')}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">
                      {check?.diagnosis || t('expert.unknownDisease')}
                    </h3>
                  </div>

                  {/* Severity Badge */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      {t('expert.severity')}
                    </span>
                    {(() => {
                      const sev = expertReport.severity
                      const badgeStyle =
                        sev === 'High'
                          ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
                          : sev === 'Moderate'
                            ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                      const dotStyle =
                        sev === 'High'
                          ? 'bg-rose-500'
                          : sev === 'Moderate'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      return (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${badgeStyle}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${dotStyle}`} />
                          {t(`expert.severity.${sev.toLowerCase()}` as any)}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* 2. Immediate Action (Visually Emphasized Card) */}
                {expertReport.immediate_action && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>{t('expert.immediateAction')}</span>
                    </h4>
                    <ul className="mt-2.5 space-y-1.5 text-sm text-slate-700 list-disc list-inside">
                      {expertReport.immediate_action.split('\n').filter(Boolean).map((line, idx) => (
                        <li key={idx} className="leading-relaxed">{line.replace(/^[•\-\*]\s*/, '')}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Recommended Treatment & Prevention (Grid) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* Treatment */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <span>🌱</span>
                      <span>{t('expert.treatmentRecommendation')}</span>
                    </h4>
                    <ul className="space-y-2">
                      {expertReport.treatment.split('\n').filter(Boolean).map((line, idx) => (
                        <li key={idx} className="flex items-start gap-2 bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-sm text-slate-700 shadow-sm">
                          <span className="text-primary-green font-bold text-xs mt-0.5">✔</span>
                          <span className="leading-relaxed">{line.replace(/^[•\-\*]\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Prevention */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <span>🛡️</span>
                      <span>{t('expert.preventiveMeasures')}</span>
                    </h4>
                    <ul className="space-y-2">
                      {expertReport.prevention.split('\n').filter(Boolean).map((line, idx) => (
                        <li key={idx} className="flex items-start gap-2 bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-sm text-slate-700 shadow-sm">
                          <span className="text-slate-400 font-bold text-xs mt-0.5">•</span>
                          <span className="leading-relaxed">{line.replace(/^[•\-\*]\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 4. Recovery Outlook Card */}
                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2.5">
                    <span>📈</span>
                    <span>{t('expert.recoveryOutlook')}</span>
                  </h4>
                  {(() => {
                    const outlook = expertReport.recovery_outlook
                    const cardStyle =
                      outlook === 'Poor'
                        ? 'border-rose-100 bg-rose-50/30 text-rose-800'
                        : outlook === 'Moderate'
                          ? 'border-amber-100 bg-amber-50/30 text-amber-800'
                          : 'border-emerald-100 bg-emerald-50/30 text-emerald-800'
                    const badgeStyle =
                      outlook === 'Poor'
                        ? 'bg-rose-100 text-rose-700'
                        : outlook === 'Moderate'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                    return (
                      <div className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${cardStyle}`}>
                        <div className="flex-1">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}>
                            {t(`expert.recovery.${outlook.toLowerCase()}` as any)}
                          </span>
                          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                            {t('expert.recovery.outlookDetail')}
                          </p>
                        </div>
                        {expertReport.recovery_time && (
                          <div className="text-left shrink-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              {t('expert.recoveryTime')}
                            </span>
                            <span className="text-sm font-bold text-slate-800">
                              {expertReport.recovery_time}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* 5. Expert Notes (at the bottom) */}
                {expertReport.notes && (
                  <div className="pt-4 border-t border-slate-100 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {t('expert.resolutionNotesLabel')}
                    </h4>
                    <p className="text-sm leading-relaxed text-slate-600 bg-slate-50 border border-slate-100 p-4 rounded-xl whitespace-pre-line italic">
                      &ldquo;{expertReport.notes}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Action form or Verified Status Panel */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">{t('expert.rskActionPanel')}</h3>
            <p className="mt-1.5 text-xs text-slate-500">
              {t('expert.rskActionPanelDetail')}
            </p>

            <div className="mt-6 space-y-4">
              {isPending ? (
                <>
                  {/* Severity Selector */}
                  <div>
                    <label htmlFor="severity" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {t('expert.severity')}
                    </label>
                    <select
                      id="severity"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as any)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 bg-white focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20"
                    >
                      <option value="Low">{t('expert.severity.low')}</option>
                      <option value="Moderate">{t('expert.severity.moderate')}</option>
                      <option value="High">{t('expert.severity.high')}</option>
                    </select>
                  </div>

                  {/* Immediate Action input */}
                  <div>
                    <label htmlFor="immediateAction" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {t('expert.immediateAction')}
                    </label>
                    <textarea
                      id="immediateAction"
                      rows={3}
                      value={immediateAction}
                      onChange={(e) => setImmediateAction(e.target.value)}
                      disabled={submitting}
                      placeholder={t('expert.form.immediateActionPlaceholder')}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20"
                    />
                  </div>

                  {/* Treatment Recommended */}
                  <div>
                    <label htmlFor="treatment" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {t('expert.treatmentRecommendation')}
                    </label>
                    <textarea
                      id="treatment"
                      rows={3}
                      value={treatment}
                      onChange={(e) => setTreatment(e.target.value)}
                      disabled={submitting}
                      placeholder={t('expert.form.treatmentPlaceholder')}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20"
                    />
                  </div>

                  {/* Prevention measures */}
                  <div>
                    <label htmlFor="prevention" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {t('expert.preventiveMeasures')}
                    </label>
                    <textarea
                      id="prevention"
                      rows={3}
                      value={prevention}
                      onChange={(e) => setPrevention(e.target.value)}
                      disabled={submitting}
                      placeholder={t('expert.form.preventionPlaceholder')}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20"
                    />
                  </div>

                  {/* Recovery Outlook & Recovery Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="recoveryOutlook" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {t('expert.recoveryOutlook')}
                      </label>
                      <select
                        id="recoveryOutlook"
                        value={recoveryOutlook}
                        onChange={(e) => setRecoveryOutlook(e.target.value as any)}
                        disabled={submitting}
                        className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 bg-white focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20"
                      >
                        <option value="Excellent">{t('expert.recovery.excellent')}</option>
                        <option value="Moderate">{t('expert.recovery.moderate')}</option>
                        <option value="Poor">{t('expert.recovery.poor')}</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="recoveryTime" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        {t('expert.recoveryTime')}
                      </label>
                      <input
                        id="recoveryTime"
                        type="text"
                        value={recoveryTime}
                        onChange={(e) => setRecoveryTime(e.target.value)}
                        disabled={submitting}
                        placeholder={t('expert.form.recoveryTimePlaceholder')}
                        className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20"
                      />
                    </div>
                  </div>

                  {/* Notes / Expert explanation */}
                  <div>
                    <label htmlFor="notes" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {t('expert.resolutionNotesLabel')} (Optional)
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={submitting}
                      placeholder={t('expert.form.expertNotesPlaceholder')}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-green focus:outline-none focus:ring-1 focus:ring-primary-green/20"
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-5 text-center space-y-4">
                  <div className="mx-auto block text-primary-green w-fit">{CheckCircleIcon}</div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{t('expert.caseStatus')}</span>
                    <h4 className="mt-1 text-sm font-bold text-slate-950 flex items-center justify-center gap-1.5">
                      <span>{t('expert.status.verified')}</span>
                      <span className="text-primary-green">✔</span>
                    </h4>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{t('expert.resolvedBy')}</span>
                    <span className="text-xs font-semibold text-slate-700 block mt-0.5">
                      {t('expert.verifiedBy')}
                    </span>
                  </div>
                  {caseRecord.resolved_at && (
                    <div className="border-t border-slate-100 pt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{t('expert.resolutionDate')}</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(caseRecord.resolved_at).toLocaleString(getLanguageMeta(language).locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {errorMsg && (
                <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3 text-xs text-rose-700" role="alert">
                  {errorMsg}
                </div>
              )}

              {isPending && (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={submitting}
                  className="flex w-full h-10 items-center justify-center rounded-xl bg-primary-green text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {submitting ? t('expert.resolvingCase') : t('expert.verifyResolveBtn')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
