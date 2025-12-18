import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { LeaderboardSort } from '../components/Leaderboard'
import { useLocalStorageState } from '../hooks/useLocalStorageState'
import { useWatchlistPolling } from '../hooks/useWatchlistPolling'
import { isEvmAddress } from '../lib/validate'

/** 全局应用状态：在路由间共享选中地址、观察列表与轮询状态。 */
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

/** 从 URL 查询参数中解析初始用户地址（用于分享链接直达）。 */
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

/** 全局状态 Provider：把 localStorage 持久化状态与轮询能力注入到全应用。 */
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

  /** 把地址加入观察列表，并将其设为当前选中用户。 */
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

  /** 从观察列表移除地址；若移除的是当前选中地址，则清空选中。 */
  const removeFromWatchlist = useCallback(
    (address: string) => {
      const normalized = address.toLowerCase()
      setWatchlist((prev) => prev.filter((a) => a.toLowerCase() !== normalized))
      if (selectedUser?.toLowerCase() === normalized) setSelectedUser(undefined)
    },
    [selectedUser, setSelectedUser, setWatchlist],
  )

  /** 记录“已读”到某个时间戳，用于计算新交易数量。 */
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

/** 获取全局应用状态；必须在 `AppStateProvider` 内使用。 */
export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
