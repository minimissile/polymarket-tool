import { useEffect, useMemo, useRef, useState } from 'react'
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

type Options = {
  enabled?: boolean
  pollMs?: number
  tradeLimit?: number
  activityLimit?: number
  positionLimit?: number
}

function storageKey(prefix: string, user: string) {
  return `pmta.cache.${prefix}.${user}`
}

function readCache<T>(key: string, fallback: T) {
  return readJson(key, fallback as never) as T
}

export function useTraderData(user: string | undefined, options?: Options) {
  const enabled = options?.enabled ?? Boolean(user)
  const pollMs = options?.pollMs ?? 15_000
  const tradeLimit = options?.tradeLimit ?? 200
  const activityLimit = options?.activityLimit ?? 200
  const positionLimit = options?.positionLimit ?? 200

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
          const mergedTrades = mergeUniqueByKey(prev.data.trades, trades, (t) => `${t.timestamp}:${t.transactionHash ?? ''}:${t.asset}`, 2000)
          const mergedActivity = mergeUniqueByKey(
            prev.data.activity,
            activity,
            (a) => `${a.timestamp}:${a.transactionHash ?? ''}:${a.type}:${a.asset ?? ''}`,
            2000,
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

  return state
}

