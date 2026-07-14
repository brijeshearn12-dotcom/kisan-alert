'use client'

import { useLanguage } from '@/contexts/LanguageContext'
import { useAudio } from '@/contexts/AudioContext'

interface ListenButtonProps {
  text: string
  languageCode: string
  id?: string
}

export function ListenButton({ text, languageCode, id }: ListenButtonProps) {
  const { t } = useLanguage()
  const { currentId, isPlaying, isLoading, play, stop } = useAudio()

  const buttonId = id || text
  const isThisPlaying = currentId === buttonId && isPlaying
  const isThisLoading = currentId === buttonId && isLoading

  function handlePlay() {
    if (isThisPlaying || isThisLoading) {
      stop()
    } else {
      play(buttonId, text, languageCode)
    }
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={isThisLoading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 mt-2 min-h-[44px] disabled:opacity-70"
    >
      {isThisLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{t('voice.listening') || 'Loading…'}</span>
        </>
      ) : isThisPlaying ? (
        <>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500 animate-pulse">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          <span>{t('voice.stop')}</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <span>{t('buttons.listen')}</span>
        </>
      )}
    </button>
  )
}

