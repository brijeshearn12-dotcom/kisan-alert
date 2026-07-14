'use client'

import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react'

interface AudioContextValue {
  currentId: string | null
  isPlaying: boolean
  isLoading: boolean
  play: (id: string, text: string, languageCode: string) => Promise<void>
  stop: () => void
}

const AudioContext = createContext<AudioContextValue | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Track the ID of the audio request that is currently in flight
  // to avoid race conditions if the user rapidly clicks different sections.
  const inFlightIdRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    inFlightIdRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsPlaying(false)
    setCurrentId(null)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const play = useCallback(async (id: string, text: string, languageCode: string) => {
    // If the same ID is clicked and we are loading or playing, stop it.
    if (currentId === id && (isPlaying || isLoading)) {
      stop()
      return
    }

    // Stop whatever is currently playing
    stop()

    if (!text || !text.trim()) {
      return
    }

    setIsLoading(true)
    setCurrentId(id)
    inFlightIdRef.current = id

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, languageCode }),
      })
      
      // Check if we are still the active request (not cancelled by another click)
      if (inFlightIdRef.current !== id) {
        return
      }

      if (!response.ok) {
        throw new Error('TTS API error')
      }

      const { audioContent } = await response.json()
      
      if (inFlightIdRef.current !== id) {
        return
      }

      if (audioContent) {
        const audioObj = new Audio(`data:audio/mp3;base64,${audioContent}`)
        audioRef.current = audioObj
        setIsPlaying(true)
        setIsLoading(false)

        audioObj.play().catch((err) => {
          console.error('Audio playback failed:', err)
          if (inFlightIdRef.current === id) {
            stop()
          }
        })

        audioObj.onended = () => {
          if (inFlightIdRef.current === id) {
            stop()
          }
        }
        audioObj.onerror = () => {
          if (inFlightIdRef.current === id) {
            stop()
          }
        }
      } else {
        stop()
      }
    } catch (err) {
      console.error('TTS failed:', err)
      if (inFlightIdRef.current === id) {
        stop()
      }
    }
  }, [currentId, isPlaying, isLoading, stop])

  return (
    <AudioContext.Provider value={{ currentId, isPlaying, isLoading, play, stop }}>
      {children}
    </AudioContext.Provider>
  )
}

export function useAudio(): AudioContextValue {
  const context = useContext(AudioContext)
  if (context === null) {
    throw new Error('useAudio must be used within an <AudioProvider>.')
  }
  return context
}
