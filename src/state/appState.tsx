import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { LeaderboardSort } from '../components/Leaderboard'
import { useLocalStorageState } from '../hooks/useLocalStorageState'
import { useWatchlistPolling } from '../hooks/useWatchlistPolling'
import { isEvmAddress } from '../lib/validate'

export type AppState = {
  selectedUser?: string
  setSelectedUser: (next: string | undefined) => void

  watchlist: string[]
  addToWatchlist: (address: string) => void
  removeFromWatchlist: (address: string) => void

  sortBy: LeaderboardSort
  setSortBy: (next: LeaderboardSort) => void

  lastSeenByUser: Record<string, number>
  markTradesAsSeen: (user: string, latestTradeTs: number) => void

  polling: ReturnType<typeof useWatchlistPolling>
}

const AppStateContext = createContext<AppState | null>(null)

function getInitialUrlUser() {
  try {
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('user')
    if (!fromUrl) return undefined
    const normalized = fromUrl.trim().toLowerCase()
    return isEvmAddress(normalized) ? normalized : undefined
  } catch {
    return undefined
  }
}

export function AppStateProvider(props: { children: ReactNode }) {
  const urlUser = getInitialUrlUser()

  const [selectedUser, setSelectedUser] = useLocalStorageState<string | undefined>(
    'pmta.selectedUser',
    urlUser,
    { preferFallback: Boolean(urlUser) },
  )
  const [watchlist, setWatchlist] = useLocalStorageState<string[]>('pmta.watchlist', [])
  const [sortBy, setSortBy] = useLocalStorageState<LeaderboardSort>('pmta.leaderboard.sortBy', 'cashPnl')
  const [lastSeenByUser, setLastSeenByUser] = useLocalStorageState<Record<string, number>>(
    'pmta.selectedUser.lastSeenTradeTsByUser',
    {},
  )

  const addToWatchlist = useCallback(
    (address: string) => {
      if (!isEvmAddress(address)) return
      const normalized = address.toLowerCase()
      setWatchlist((prev) => {
        const next = Array.from(new Set([normalized, ...prev.map((a) => a.toLowerCase())])).slice(0, 20)
        return next
      })
      setSelectedUser(normalized)
    },
    [setSelectedUser, setWatchlist],
  )

  const removeFromWatchlist = useCallback(
    (address: string) => {
      const normalized = address.toLowerCase()
      setWatchlist((prev) => prev.filter((a) => a.toLowerCase() !== normalized))
      if (selectedUser?.toLowerCase() === normalized) setSelectedUser(undefined)
    },
    [selectedUser, setSelectedUser, setWatchlist],
  )

  const markTradesAsSeen = useCallback(
    (user: string, latestTradeTs: number) => {
      if (!isEvmAddress(user)) return
      if (latestTradeTs <= 0) return
      const key = user.toLowerCase()
      setLastSeenByUser((prev) => ({ ...prev, [key]: latestTradeTs }))
    },
    [setLastSeenByUser],
  )

  const polling = useWatchlistPolling(watchlist, { enabled: watchlist.length > 0, pollMs: 45_000 })

  const value = useMemo<AppState>(() => {
    return {
      selectedUser,
      setSelectedUser,
      watchlist,
      addToWatchlist,
      removeFromWatchlist,
      sortBy,
      setSortBy,
      lastSeenByUser,
      markTradesAsSeen,
      polling,
    }
  }, [
    addToWatchlist,
    lastSeenByUser,
    markTradesAsSeen,
    polling,
    removeFromWatchlist,
    selectedUser,
    setSelectedUser,
    setSortBy,
    sortBy,
    watchlist,
  ])

  return <AppStateContext.Provider value={value}>{props.children}</AppStateContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

