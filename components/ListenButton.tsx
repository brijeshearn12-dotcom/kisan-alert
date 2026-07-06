'use client'

import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

interface ListenButtonProps {
  text: string
  languageCode: string
}

export function ListenButton({ text, languageCode }: ListenButtonProps) {
  const { t } = useLanguage()
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  async function handlePlay() {
    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setPlaying(false)
      return
    }

    setPlaying(true)
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, languageCode }),
      })
      const { audioContent } = await response.json()
      if (audioContent) {
        const audioObj = new Audio(`data:audio/mp3;base64,${audioContent}`)
        audioRef.current = audioObj
        audioObj.play().catch((err) => {
          console.error('Audio playback failed:', err)
          setPlaying(false)
        })
        audioObj.onended = () => {
          setPlaying(false)
        }
      } else {
        setPlaying(false)
      }
    } catch (err) {
      console.error('TTS failed:', err)
      setPlaying(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 mt-2 min-h-[44px]"
    >
      {playing ? (
        <>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
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
