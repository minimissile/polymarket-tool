import { useCallback, useEffect, useRef, useState } from 'react'
import { getGammaMarketBySlug, type GammaMarket } from '../lib/polymarketDataApi'

export type MarketDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: GammaMarket }
  | { status: 'error'; error: string }

/**
 * 管理「按 slug 展开并加载 market 详情」的状态机与取消请求。
 * - 支持「打开外部 market 页面」模式（传入 onOpenMarket 时不在表内展开）
 * - 内部对每个 slug 维护独立 loading/ready/error 状态
 */
export function useMarketDetailsBySlug(options?: { onOpenMarket?: (slug: string) => void }) {
  const [expandedBySlug, setExpandedBySlug] = useState<Record<string, boolean>>({})
  const [marketBySlug, setMarketBySlug] = useState<Record<string, MarketDetailState>>({})
  const marketBySlugRef = useRef<Record<string, MarketDetailState>>({})
  const abortBySlugRef = useRef<Record<string, AbortController>>({})

  useEffect(() => {
    marketBySlugRef.current = marketBySlug
  }, [marketBySlug])

  const fetchMarket = useCallback(async (slug: string) => {
    const key = slug.toLowerCase()
    const existing = marketBySlugRef.current[key]
    if (existing?.status === 'loading' || existing?.status === 'ready') return

    abortBySlugRef.current[key]?.abort()
    const controller = new AbortController()
    abortBySlugRef.current[key] = controller

    setMarketBySlug((prev) => ({ ...prev, [key]: { status: 'loading' } }))
    try {
      const data = await getGammaMarketBySlug(key, { signal: controller.signal, timeoutMs: 12_000 })
      setMarketBySlug((prev) => ({ ...prev, [key]: { status: 'ready', data } }))
    } catch (e) {
      const message = e instanceof Error ? e.message : '请求失败'
      setMarketBySlug((prev) => ({ ...prev, [key]: { status: 'error', error: message } }))
    }
  }, [])

  const toggleDetails = useCallback(
    (slug: string) => {
      const key = slug.toLowerCase()
      if (options?.onOpenMarket) {
        options.onOpenMarket(key)
        return
      }

      setExpandedBySlug((prev) => ({ ...prev, [key]: !prev[key] }))
      void fetchMarket(key)
    },
    [fetchMarket, options],
  )

  return { expandedBySlug, marketBySlug, fetchMarket, toggleDetails }
}

