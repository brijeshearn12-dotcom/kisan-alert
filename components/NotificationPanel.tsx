'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { database } from '@/lib/firebase'
import { ref, onValue, update } from 'firebase/database'

// ── Types ────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string
  message: string
  timestamp: number
  read: boolean
}

// ── Icons ────────────────────────────────────────────────────────────────────

const BellIcon = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

// ── Component ────────────────────────────────────────────────────────────────

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [animateBadge, setAnimateBadge] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  // 1. Fetch authenticated user ID on mount
  useEffect(() => {
    async function getSessionUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
      }
    }
    getSessionUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // 2. Set up real-time Firebase Realtime Database listener
  useEffect(() => {
    if (!userId) {
      setNotifications([])
      return
    }

    const notificationsRef = ref(database, `notifications/${userId}`)

    const unsubscribe = onValue(notificationsRef, (snapshot) => {
      const data = snapshot.val()
      if (!data) {
        setNotifications([])
        return
      }

      // Convert object payload to array and sort descending by timestamp (latest first)
      const list: NotificationItem[] = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }))
      list.sort((a, b) => b.timestamp - a.timestamp)

      // Trigger animation badge if there is a new unread notification
      setNotifications((prev) => {
        const unreadCount = list.filter((n) => !n.read).length
        const prevUnreadCount = prev.filter((n) => !n.read).length
        if (unreadCount > prevUnreadCount) {
          setAnimateBadge(true)
          setTimeout(() => setAnimateBadge(false), 1000)
        }
        return list
      })
    })

    return () => {
      unsubscribe()
    }
  }, [userId])

  // 3. Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // 4. Mark specific notification as read in Firebase
  const handleMarkAsRead = async (id: string) => {
    if (!userId) return
    const itemRef = ref(database, `notifications/${userId}/${id}`)
    try {
      await update(itemRef, { read: true })
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
        aria-label={`Open notifications, ${unreadCount} unread`}
        aria-expanded={isOpen}
      >
        {BellIcon}
        {unreadCount > 0 && (
          <span
            className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white ${
              animateBadge ? 'animate-bounce scale-110' : ''
            }`}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 origin-top-right rounded-2xl border border-slate-100 bg-white shadow-xl ring-1 ring-black/5 focus:outline-none z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                {unreadCount} new
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                No notifications yet
              </div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleMarkAsRead(item.id)}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50 flex gap-3 ${
                    !item.read ? 'bg-primary-green/5' : ''
                  }`}
                >
                  <span className="flex-1">
                    <p
                      className={`text-xs leading-relaxed ${
                        !item.read
                          ? 'font-medium text-slate-800'
                          : 'text-slate-500'
                      }`}
                    >
                      {item.message}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </span>
                  {!item.read && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-green" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
