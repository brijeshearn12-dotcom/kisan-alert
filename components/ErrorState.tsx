'use client'

import { type ReactNode } from 'react'

interface ErrorStateProps {
  icon?: ReactNode
  title: string
  description: string
  onRetry?: () => void
  retryText?: string
  secondaryAction?: ReactNode
}

export function ErrorState({
  icon,
  title,
  description,
  onRetry,
  retryText = 'Try again',
  secondaryAction,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-label={title}
      className="flex flex-col items-center justify-center rounded-2xl border border-rose-100 bg-rose-50/20 p-6 text-center shadow-sm sm:p-8"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
        {icon ? (
          icon
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        )}
      </div>
      <h3 className="mt-4 text-base font-bold text-rose-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-rose-700">{description}</p>
      {(onRetry || secondaryAction) && (
        <div className="mt-5 flex items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary-green px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-green/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>{retryText}</span>
            </button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
