'use client'

/**
 * LanguageSelector — the single, global, premium language switcher.
 * -----------------------------------------------------------------------------
 * Fully self-contained: it reads and writes the active language straight from
 * `useLanguage()`, so it can be dropped anywhere (it's mounted once globally in
 * `app/layout.tsx`) with no props and no prop-drilling. There is exactly one
 * source of language state — this component never keeps its own copy.
 *
 * It is a custom listbox (not a native <select>) so it can be styled to match
 * the app and animated, while remaining fully keyboard- and screen-reader-
 * accessible per the WAI-ARIA listbox pattern:
 *   • Button: aria-haspopup="listbox", aria-expanded, aria-label.
 *   • Panel: role="listbox" with roving aria-activedescendant.
 *   • Keyboard: ↑/↓ move, Home/End jump, Enter/Space select, Esc closes,
 *     Tab/outside-click dismiss. Focus returns to the button on close.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '@/contexts/LanguageContext'
import type { LanguageCode } from '@/lib/i18n/translations'

/** Globe glyph — signals "language" independent of any one script. */
const GlobeIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const ChevronIcon = (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M6 8l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const CheckIcon = (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
    <path
      d="M4 10.5l3.5 3.5L16 6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export interface LanguageSelectorProps {
  /**
   * Direction the dropdown panel opens. Defaults to `up` because the selector
   * is mounted at the bottom-right of the viewport.
   */
  placement?: 'up' | 'down'
  /** Optional extra classes for the trigger button. */
  className?: string
}

export function LanguageSelector({ placement = 'up', className = '' }: LanguageSelectorProps) {
  const { language, setLanguage, availableLanguages } = useLanguage()

  const [open, setOpen] = useState(false)
  // Which option is visually highlighted for keyboard navigation.
  const [activeIndex, setActiveIndex] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const listboxId = useId()
  const optionId = (code: LanguageCode) => `${listboxId}-opt-${code}`

  const active = availableLanguages.find((l) => l.code === language) ?? availableLanguages[0]
  const selectedIndex = availableLanguages.findIndex((l) => l.code === language)

  // Open the panel with the current language pre-highlighted.
  const openMenu = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }, [selectedIndex])

  const closeMenu = useCallback((returnFocus = true) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  const choose = useCallback(
    (code: LanguageCode) => {
      setLanguage(code)
      closeMenu()
    },
    [setLanguage, closeMenu],
  )

  // Dismiss on outside pointer / focus leaving the component.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Move keyboard focus into the list when it opens so arrow keys work at once.
  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function onButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu()
    }
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % availableLanguages.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + availableLanguages.length) % availableLanguages.length)
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(availableLanguages.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(availableLanguages[activeIndex].code)
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        break
      case 'Tab':
        // Let focus leave naturally, but close the menu.
        setOpen(false)
        break
      default:
        break
    }
  }

  const panelVariants = {
    hidden: { opacity: 0, y: placement === 'up' ? 6 : -6, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1 },
  }

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Change language — current language ${active.englishLabel}`}
        className={[
          'flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 py-2 pl-3 pr-2.5 shadow-sm backdrop-blur',
          'text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/50',
          className,
        ].join(' ')}
      >
        <span className="text-slate-400">{GlobeIcon}</span>
        <span className="max-w-[8rem] truncate">{active.label}</span>
        <motion.span
          className="text-slate-400"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
        >
          {ChevronIcon}
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-label="Select language"
            aria-activedescendant={optionId(availableLanguages[activeIndex].code)}
            onKeyDown={onListKeyDown}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={panelVariants}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={[
              'absolute right-0 z-50 max-h-72 w-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl',
              placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2',
            ].join(' ')}
          >
            {availableLanguages.map((lang, index) => {
              const isSelected = lang.code === language
              const isActive = index === activeIndex
              return (
                <li
                  key={lang.code}
                  id={optionId(lang.code)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(lang.code)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={[
                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-slate-100' : 'bg-transparent',
                    isSelected ? 'font-semibold text-slate-900' : 'font-medium text-slate-600',
                  ].join(' ')}
                >
                  <span className="text-base leading-none" aria-hidden="true">
                    {lang.flag}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate">{lang.label}</span>
                    <span className="truncate text-[11px] font-normal text-slate-400">
                      {lang.englishLabel}
                    </span>
                  </span>
                  <span className={`ml-auto text-primary-green ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
                    {CheckIcon}
                  </span>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

export default LanguageSelector
