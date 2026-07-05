'use client'

/**
 * LanguageContext — the app-wide language + translation provider.
 * -----------------------------------------------------------------------------
 * Wrap the tree once (done in `app/layout.tsx`); then any client component can
 * do:
 *
 *   const { t } = useLanguage()
 *   t('dashboard.title')
 *
 * and never think about how translation works. The provider owns the selected
 * language, persists it to localStorage (key `preferredLanguage` — the same key
 * the recommendation page already uses, so the two stay in sync), and exposes a
 * memoized `t` so consumers don't re-render unnecessarily.
 *
 * Backward compatibility: this is additive. No existing feature depends on this
 * context yet; the recommendation page keeps its own local language state. This
 * only lays the foundation for future pages.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  RTL_LANGUAGES,
  isLanguageCode,
  translate,
  type LanguageCode,
  type LanguageMeta,
  type TranslationKey,
  type TranslationVars,
} from '@/lib/i18n/translations'

/**
 * localStorage key for the persisted language preference.
 * Intentionally identical to the recommendation page's existing key so both
 * read/write the same value — no migration, no divergence.
 */
const LANGUAGE_STORAGE_KEY = 'preferredLanguage'

/** The public shape of the context — the only surface components should use. */
export interface LanguageContextValue {
  /** Active language code. */
  language: LanguageCode
  /** Switch language; persists the choice. */
  setLanguage: (language: LanguageCode) => void
  /** Translate a key (with optional `{{var}}` interpolation). */
  t: (key: TranslationKey, vars?: TranslationVars) => string
  /** Ordered list of selectable languages for building a selector. */
  availableLanguages: readonly LanguageMeta[]
  /** True when the active language renders right-to-left. */
  isRTL: boolean
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export interface LanguageProviderProps {
  children: ReactNode
  /** Optional starting language; defaults to English (SSR-safe). */
  initialLanguage?: LanguageCode
}

export function LanguageProvider({
  children,
  initialLanguage = DEFAULT_LANGUAGE,
}: LanguageProviderProps) {
  // Start from the SSR-safe default so server and first client render agree;
  // the persisted preference is applied in an effect below (post-hydration).
  const [language, setLanguageState] = useState<LanguageCode>(initialLanguage)

  // Restore the saved preference once, after mount. Doing this in an effect —
  // rather than a lazy initializer — avoids a hydration mismatch, since
  // localStorage doesn't exist during SSR.
  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguageCode(saved) && saved !== language) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing persisted client-only preference post-hydration
      setLanguageState(saved)
    }
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect the language on <html> for accessibility + correct text direction.
  useEffect(() => {
    const meta = LANGUAGES.find((l) => l.code === language)
    document.documentElement.lang = language
    document.documentElement.dir = meta?.dir ?? 'ltr'
  }, [language])

  // Update state + persist. Stable identity so consumers don't re-render.
  const setLanguage = useCallback((next: LanguageCode) => {
    setLanguageState(next)
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      // Private mode / storage disabled — a non-persisted switch is fine.
    }
  }, [])

  // `t` identity changes only when the language changes, so components that
  // depend on it re-render exactly when they should and no more often.
  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) => translate(language, key, vars),
    [language],
  )

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      availableLanguages: LANGUAGES,
      isRTL: RTL_LANGUAGES.has(language),
    }),
    [language, setLanguage, t],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/**
 * Access the language context. Must be called under a `<LanguageProvider>`
 * (mounted once at the app root), otherwise it throws — surfacing the wiring
 * mistake immediately instead of silently returning English.
 */
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (context === null) {
    throw new Error('useLanguage must be used within a <LanguageProvider>.')
  }
  return context
}
