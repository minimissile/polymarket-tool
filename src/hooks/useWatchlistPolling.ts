import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DataApiActivity, DataApiTrade } from '../lib/polymarketDataApi'
import { getActivityByUser, getPositionsByUser, getTradesByUser } from '../lib/polymarketDataApi'
import { mergeUniqueByKey, readJson, writeJson } from '../lib/storage'

type Status = { status: 'idle' | 'loading' | 'ready' | 'error'; lastRunAtMs?: number; error?: string }

/** 构造本地缓存 key：用于按用户维度保存 trades/activity/positions。 */
function storageKey(prefix: string, user: string) {
  return `pmta.cache.${prefix}.${user}`
}

/** 读取缓存（JSON）并在解析失败时回退到 fallback。 */
function readCache<T>(key: string, fallback: T) {
  return readJson(key, fallback as never) as T
}

/** 对观察列表进行后台轮询更新：写入本地缓存，并暴露状态与手动 refresh。 */
export function useWatchlistPolling(users: string[], options?: { enabled?: boolean; pollMs?: number }) {
  const enabled = options?.enabled ?? true
  const pollMs = options?.pollMs ?? 45_000
  const usersKey = useMemo(() => users.map((u) => u.toLowerCase()).sort().join('|'), [users])
  const normalizedUsers = useMemo(() => usersKey.split('|').filter(Boolean), [usersKey])
  const shouldRun = enabled && users.length > 0
  const abortRef = useRef<AbortController | null>(null)
  const [status, setStatus] = useState<Status>({ status: shouldRun ? 'loading' : 'idle' })

  const run = useCallback(async () => {
    if (!shouldRun) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus((prev) => ({ ...prev, status: 'loading', error: undefined }))

    try {
      for (const normalizedUser of normalizedUsers) {
        const [trades, activity, positions] = await Promise.all([
          getTradesByUser(normalizedUser, { limit: 80, takerOnly: true }, { signal: controller.signal }),
          getActivityByUser(normalizedUser, { limit: 80 }, { signal: controller.signal }),
          getPositionsByUser(
            normalizedUser,
            { limit: 120, sortBy: 'CASHPNL', sortDirection: 'DESC', sizeThreshold: 1 },
            { signal: controller.signal },
          ),
        ])

        const mergedTrades = mergeUniqueByKey(
          readCache<DataApiTrade[]>(storageKey('trades', normalizedUser), []),
          trades,
          (t) => `${t.timestamp}:${t.transactionHash ?? ''}:${t.asset}`,
          2000,
        )
        const mergedActivity = mergeUniqueByKey(
          readCache<DataApiActivity[]>(storageKey('activity', normalizedUser), []),
          activity,
          (a) => `${a.timestamp}:${a.transactionHash ?? ''}:${a.type}:${a.asset ?? ''}`,
          2000,
        )

        writeJson(storageKey('trades', normalizedUser), mergedTrades as never)
        writeJson(storageKey('activity', normalizedUser), mergedActivity as never)
        writeJson(storageKey('positions', normalizedUser), positions as never)
      }

      setStatus({ status: 'ready', lastRunAtMs: Date.now() })
    } catch (e) {
      const message = e instanceof Error ? e.message : '请求失败'
      setStatus((prev) => ({
        status: prev.lastRunAtMs ? 'ready' : 'error',
        lastRunAtMs: Date.now(),
        error: message,
      }))
    }
  }, [normalizedUsers, shouldRun])

  useEffect(() => {
    if (!shouldRun) return

    void run()
    const id = window.setInterval(() => void run(), pollMs)

    return () => {
      window.clearInterval(id)
      abortRef.current?.abort()
    }
  }, [pollMs, run, shouldRun])

  const refresh = useCallback(() => void run(), [run])

  return shouldRun
    ? { ...status, refresh }
    : ({ status: 'idle', lastRunAtMs: status.lastRunAtMs, error: undefined, refresh } satisfies Status & {
        refresh: () => void
      })
}
