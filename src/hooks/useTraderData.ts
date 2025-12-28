import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DataApiActivity, DataApiPosition, DataApiTrade } from '../lib/polymarketDataApi'
import { getActivityByUser, getPositionsByUser, getTradesByUser } from '../lib/polymarketDataApi'
import { mergeUniqueByKey, readJson, writeJson } from '../lib/storage'

type TraderData = {
  trades: DataApiTrade[]
  positions: DataApiPosition[]
  activity: DataApiActivity[]
  lastUpdatedAtMs?: number
}

type TraderDataState =
  | { status: 'idle'; data: TraderData; error?: string }
  | { status: 'loading'; data: TraderData; error?: string }
  | { status: 'ready'; data: TraderData; error?: string }
  | { status: 'error'; data: TraderData; error: string }

type PagingState = {
  status: 'idle' | 'loading' | 'error'
  error?: string
  hasMore: boolean
}

type Options = {
  enabled?: boolean
  pollMs?: number
  tradeLimit?: number
  activityLimit?: number
  positionLimit?: number
  tradePageSize?: number
  activityPageSize?: number
}

/** 构造本地缓存 key：用于按用户维度保存 trades/activity/positions。 */
function storageKey(prefix: string, user: string) {
  return `pmta.cache.${prefix}.${user}`
}

/** 读取缓存（JSON）并在解析失败时回退到 fallback。 */
function readCache<T>(key: string, fallback: T) {
  return readJson(key, fallback as never) as T
}

function tradeCacheKey(t: DataApiTrade) {
  const hash = t.transactionHash?.trim()
  if (hash) return `${t.timestamp}:${hash}`
  return `${t.timestamp}:${t.asset}:${t.conditionId}:${t.side}:${t.outcomeIndex ?? ''}:${t.price}:${t.size}`
}

/** 拉取并缓存某交易员的 trades/activity/positions，并周期性轮询更新。 */
export function useTraderData(user: string | undefined, options?: Options) {
  const enabled = options?.enabled ?? Boolean(user)
  const pollMs = options?.pollMs ?? 15_000
  const tradeLimit = options?.tradeLimit ?? 200
  const activityLimit = options?.activityLimit ?? 200
  const positionLimit = options?.positionLimit ?? 200
  const tradePageSize = options?.tradePageSize ?? 200
  const activityPageSize = options?.activityPageSize ?? 200

  const normalizedUser = (user ?? '').toLowerCase()

  const initialData = useMemo<TraderData>(() => {
    if (!normalizedUser) return { trades: [], positions: [], activity: [] }
    return {
      trades: readCache<DataApiTrade[]>(storageKey('trades', normalizedUser), []),
      positions: readCache<DataApiPosition[]>(storageKey('positions', normalizedUser), []),
      activity: readCache<DataApiActivity[]>(storageKey('activity', normalizedUser), []),
    }
  }, [normalizedUser])

  const [state, setState] = useState<TraderDataState>({
    status: enabled ? 'loading' : 'idle',
    data: initialData,
  })

  const abortRef = useRef<AbortController | null>(null)
  const tradeMoreAbortRef = useRef<AbortController | null>(null)
  const activityMoreAbortRef = useRef<AbortController | null>(null)

  const [tradesPaging, setTradesPaging] = useState<PagingState>({ status: 'idle', hasMore: true })
  const [activityPaging, setActivityPaging] = useState<PagingState>({ status: 'idle', hasMore: true })
  const nextTradeOffsetRef = useRef(0)
  const nextActivityOffsetRef = useRef(0)

  useEffect(() => {
    void Promise.resolve().then(() => {
      abortRef.current?.abort()
      tradeMoreAbortRef.current?.abort()
      activityMoreAbortRef.current?.abort()

      if (!normalizedUser) {
        setState({ status: enabled ? 'loading' : 'idle', data: { trades: [], positions: [], activity: [] } })
        setTradesPaging({ status: 'idle', hasMore: false })
        setActivityPaging({ status: 'idle', hasMore: false })
        nextTradeOffsetRef.current = 0
        nextActivityOffsetRef.current = 0
        return
      }

      setState({ status: enabled ? 'loading' : 'idle', data: initialData })
      setTradesPaging({ status: 'idle', hasMore: true })
      setActivityPaging({ status: 'idle', hasMore: true })
      nextTradeOffsetRef.current = tradeLimit
      nextActivityOffsetRef.current = activityLimit
    })
  }, [activityLimit, enabled, initialData, normalizedUser, tradeLimit])

  useEffect(() => {
    if (!enabled || !normalizedUser) return

    let mounted = true

    const run = async (isFirst: boolean) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      if (isFirst) {
        setState((prev) => ({
          status: prev.data.trades.length || prev.data.positions.length ? 'loading' : 'loading',
          data: prev.data,
          error: undefined,
        }))
      }

      try {
        const [trades, activity, positions] = await Promise.all([
          getTradesByUser(normalizedUser, { limit: tradeLimit, takerOnly: true }, { signal: controller.signal }),
          getActivityByUser(normalizedUser, { limit: activityLimit }, { signal: controller.signal }),
          getPositionsByUser(
            normalizedUser,
            { limit: positionLimit, sortBy: 'CASHPNL', sortDirection: 'DESC', sizeThreshold: 1 },
            { signal: controller.signal },
          ),
        ])

        if (!mounted) return

        setState((prev) => {
          const mergedTrades = mergeUniqueByKey(prev.data.trades, trades, tradeCacheKey, 5000)
          const mergedActivity = mergeUniqueByKey(
            prev.data.activity,
            activity,
            (a) => `${a.timestamp}:${a.transactionHash ?? ''}:${a.type}:${a.asset ?? ''}`,
            5000,
          )
          const nextData: TraderData = {
            trades: mergedTrades,
            activity: mergedActivity,
            positions,
            lastUpdatedAtMs: Date.now(),
          }
          writeJson(storageKey('trades', normalizedUser), mergedTrades as never)
          writeJson(storageKey('activity', normalizedUser), mergedActivity as never)
          writeJson(storageKey('positions', normalizedUser), positions as never)
          return { status: 'ready', data: nextData, error: undefined }
        })

        setTradesPaging((prev) => {
          if (!prev.hasMore) return prev
          return trades.length < tradeLimit ? { status: 'idle', hasMore: false } : prev
        })
        setActivityPaging((prev) => {
          if (!prev.hasMore) return prev
          return activity.length < activityLimit ? { status: 'idle', hasMore: false } : prev
        })
      } catch (e) {
        if (!mounted) return
        const message = e instanceof Error ? e.message : '请求失败'
        setState((prev) => ({
          status: prev.data.trades.length || prev.data.positions.length ? 'ready' : 'error',
          data: prev.data,
          error: message,
        }))
      }
    }

    run(true)
    const id = window.setInterval(() => run(false), pollMs)

    return () => {
      mounted = false
      window.clearInterval(id)
      abortRef.current?.abort()
    }
  }, [activityLimit, enabled, normalizedUser, pollMs, positionLimit, tradeLimit])

  const loadMoreTrades = useCallback(async () => {
    if (!enabled || !normalizedUser) return
    if (!tradesPaging.hasMore || tradesPaging.status === 'loading') return

    tradeMoreAbortRef.current?.abort()
    const controller = new AbortController()
    tradeMoreAbortRef.current = controller

    setTradesPaging((prev) => ({ ...prev, status: 'loading', error: undefined }))
    const offset = nextTradeOffsetRef.current
    try {
      const trades = await getTradesByUser(
        normalizedUser,
        { limit: tradePageSize, offset, takerOnly: true },
        { signal: controller.signal },
      )

      nextTradeOffsetRef.current = offset + tradePageSize

      setState((prev) => {
        const mergedTrades = mergeUniqueByKey(prev.data.trades, trades, tradeCacheKey, 5000)
        const nextData: TraderData = {
          ...prev.data,
          trades: mergedTrades,
          lastUpdatedAtMs: Date.now(),
        }
        writeJson(storageKey('trades', normalizedUser), mergedTrades as never)
        if (prev.status === 'error') return { status: 'error', data: nextData, error: prev.error }
        return { status: prev.status, data: nextData, error: prev.error }
      })

      setTradesPaging({ status: 'idle', hasMore: trades.length >= tradePageSize })
    } catch (e) {
      const message = e instanceof Error ? e.message : '请求失败'
      setTradesPaging((prev) => ({ ...prev, status: 'error', error: message }))
    }
  }, [enabled, normalizedUser, tradePageSize, tradesPaging.hasMore, tradesPaging.status])

  const loadMoreActivity = useCallback(async () => {
    if (!enabled || !normalizedUser) return
    if (!activityPaging.hasMore || activityPaging.status === 'loading') return

    activityMoreAbortRef.current?.abort()
    const controller = new AbortController()
    activityMoreAbortRef.current = controller

    setActivityPaging((prev) => ({ ...prev, status: 'loading', error: undefined }))
    const offset = nextActivityOffsetRef.current
    try {
      const activity = await getActivityByUser(
        normalizedUser,
        { limit: activityPageSize, offset },
        { signal: controller.signal },
      )

      nextActivityOffsetRef.current = offset + activityPageSize

      setState((prev) => {
        const mergedActivity = mergeUniqueByKey(
          prev.data.activity,
          activity,
          (a) => `${a.timestamp}:${a.transactionHash ?? ''}:${a.type}:${a.asset ?? ''}`,
          5000,
        )
        const nextData: TraderData = {
          ...prev.data,
          activity: mergedActivity,
          lastUpdatedAtMs: Date.now(),
        }
        writeJson(storageKey('activity', normalizedUser), mergedActivity as never)
        if (prev.status === 'error') return { status: 'error', data: nextData, error: prev.error }
        return { status: prev.status, data: nextData, error: prev.error }
      })

      setActivityPaging({ status: 'idle', hasMore: activity.length >= activityPageSize })
    } catch (e) {
      const message = e instanceof Error ? e.message : '请求失败'
      setActivityPaging((prev) => ({ ...prev, status: 'error', error: message }))
    }
  }, [activityPageSize, activityPaging.hasMore, activityPaging.status, enabled, normalizedUser])

  return {
    ...state,
    tradesPaging,
    activityPaging,
    loadMoreTrades,
    loadMoreActivity,
  }
}
