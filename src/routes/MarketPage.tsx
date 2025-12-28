import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ActivitiesTable } from '../components/ActivitiesTable'
import { TradesTable } from '../components/TradesTable'
import { formatNumber, formatUsd } from '../lib/format'
import { getGammaMarketBySlug, type GammaMarket } from '../lib/polymarketDataApi'
import { isEvmAddress, normalizeAddress } from '../lib/validate'
import { useTraderData } from '../hooks/useTraderData'

type MarketState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: GammaMarket }
  | { status: 'error'; error: string }

function parseMaybeArray(value: unknown): unknown[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function formatMaybeIso(value: string | undefined) {
  if (!value) return '—'
  const ms = Date.parse(value)
  if (!Number.isNaN(ms)) return new Date(ms).toLocaleString()
  return value
}

function inferOutcomeId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const candidates = [record.id, record.outcomeId, record.tokenId, record.assetId, record.asset]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return undefined
}

export default function MarketPage() {
  const navigate = useNavigate()
  const params = useParams<{ user?: string; slug?: string }>()

  const routeUser = useMemo(() => {
    const raw = params.user
    if (!raw) return undefined
    const normalized = normalizeAddress(raw)
    if (!isEvmAddress(normalized)) return undefined
    return normalized.toLowerCase()
  }, [params.user])

  const slug = (params.slug ?? '').trim()
  const slugKey = useMemo(() => slug.toLowerCase(), [slug])

  const trader = useTraderData(routeUser, { enabled: Boolean(routeUser), pollMs: 12_000 })

  const [market, setMarket] = useState<MarketState>(() => {
    if (!slugKey) return { status: 'idle' }
    return { status: 'loading' }
  })
  const marketRef = useRef<MarketState>(market)
  const marketAbortRef = useRef<AbortController | null>(null)
  const marketInFlightRef = useRef(false)

  useEffect(() => {
    marketRef.current = market
  }, [market])

  const fetchMarket = useCallback(
    async (options?: { silent?: boolean; preferFresh?: boolean }) => {
      if (!slugKey) return
      const silent = options?.silent ?? false
      const preferFresh = options?.preferFresh ?? false

      if (marketInFlightRef.current && !preferFresh) return

      if (preferFresh) marketAbortRef.current?.abort()
      const controller = new AbortController()
      marketAbortRef.current = controller
      marketInFlightRef.current = true

      if (!silent || marketRef.current.status !== 'ready') setMarket({ status: 'loading' })
      try {
        const data = await getGammaMarketBySlug(slugKey, { signal: controller.signal, timeoutMs: 12_000 })
        setMarket({ status: 'ready', data })
      } catch (e) {
        const message = e instanceof Error ? e.message : '请求失败'
        setMarket({ status: 'error', error: message })
      } finally {
        marketInFlightRef.current = false
      }
    },
    [slugKey],
  )

  useEffect(() => {
    if (!slugKey) return
    void Promise.resolve().then(() => fetchMarket({ silent: false, preferFresh: true }))
    const id = window.setInterval(() => {
      void fetchMarket({ silent: true, preferFresh: false })
    }, 2000)
    return () => {
      window.clearInterval(id)
      marketAbortRef.current?.abort()
      marketInFlightRef.current = false
    }
  }, [fetchMarket, slugKey])

  const tradesInMarket = useMemo(() => {
    if (!slugKey) return []
    return trader.data.trades.filter((t) => (t.slug ?? '').toLowerCase() === slugKey)
  }, [slugKey, trader.data.trades])

  const activityInMarket = useMemo(() => {
    if (!slugKey) return []
    return trader.data.activity.filter((a) => (a.slug ?? '').toLowerCase() === slugKey)
  }, [slugKey, trader.data.activity])

  const tradeVolumeUsd = useMemo(() => {
    return tradesInMarket.reduce((acc, t) => acc + (t.size ?? 0) * (t.price ?? 0), 0)
  }, [tradesInMarket])

  const activityVolumeUsd = useMemo(() => {
    return activityInMarket.reduce((acc, a) => {
      if (a.usdcSize !== undefined) return acc + a.usdcSize
      if (a.size !== undefined && a.price !== undefined) return acc + a.size * a.price
      return acc
    }, 0)
  }, [activityInMarket])

  const marketOutcomes = useMemo(() => {
    if (market.status !== 'ready') return undefined
    return parseMaybeArray(market.data.outcomes)
  }, [market])

  const marketOutcomePrices = useMemo(() => {
    if (market.status !== 'ready') return undefined
    return parseMaybeArray(market.data.outcomePrices)
  }, [market])

  const goBack = () => {
    if (routeUser) {
      navigate(`/trader/${routeUser}/trades`)
      return
    }
    navigate(-1)
  }

  return (
    <main className="flex flex-col gap-7 w-full pt-6 px-4">
      <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex flex-col gap-2 min-w-0">
          <button
            className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={goBack}
            aria-label="返回交易列表"
          >
            ← 返回
          </button>
          {/*<div className="text-sm font-medium text-slate-500 dark:text-slate-400">Market</div>*/}
          {/*<div className="font-mono text-base md:text-lg font-bold text-slate-900 dark:text-slate-50 break-all">{slugKey || '—'}</div>*/}
        </div>

        {slugKey ? (
          <a
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline whitespace-nowrap"
            href={`https://polymarket.com/market/${encodeURIComponent(slugKey)}`}
            target="_blank"
            rel="noreferrer"
          >
            打开 Polymarket
          </a>
        ) : null}
      </div>

      {!routeUser ? (
        <div
          className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          role="status"
          aria-live="polite"
        >
          地址无效，无法展示交易员在该 Market 的交易行为
        </div>
      ) : !slugKey ? (
        <div
          className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          role="status"
          aria-live="polite"
        >
          缺少 market slug
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">市场信息</h2>

          {market.status === 'loading' ? (
            <div
              className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-slate-500 dark:text-slate-400"
              role="status"
              aria-live="polite"
            >
              Market 信息加载中…
            </div>
          ) : market.status === 'error' ? (
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-sm text-red-500" role="status" aria-live="polite">
                加载失败：{market.error}
              </div>
              <div className="mt-3">
                <button
                  className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => void fetchMarket()}
                  aria-label="重试加载 market 信息"
                >
                  重试
                </button>
              </div>
            </div>
          ) : market.status === 'ready' ? (
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
              <div className="flex items-start gap-3">
                {market.data.icon || market.data.image ? (
                  <img
                    src={market.data.icon ?? market.data.image}
                    alt={market.data.question ? `${market.data.question} icon` : 'market icon'}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : null}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-50 break-words">{market.data.question ?? slugKey}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all">slug: {slugKey}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="text-slate-500 dark:text-slate-400">成交量</div>
                  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1 text-base font-semibold">
                    {market.data.volumeNum !== undefined ? formatNumber(market.data.volumeNum) : '—'}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="text-slate-500 dark:text-slate-400">流动性</div>
                  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1 text-base font-semibold">
                    {market.data.liquidityNum !== undefined ? formatNumber(market.data.liquidityNum) : '—'}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="text-slate-500 dark:text-slate-400">开始时间</div>
                  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">{formatMaybeIso(market.data.startDateIso ?? market.data.startDate)}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="text-slate-500 dark:text-slate-400">结束时间</div>
                  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">{formatMaybeIso(market.data.endDateIso ?? market.data.endDate)}</div>
                </div>
                {/*<div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-700 p-3">*/}
                {/*  <div className="text-slate-500 dark:text-slate-400">条件</div>*/}
                {/*  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1 break-all">{market.data.conditionId ?? '—'}</div>*/}
                {/*</div>*/}
              </div>

              {marketOutcomes && marketOutcomes.length ? (
                <div className="bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="text-left px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          Outcome
                        </th>
                        <th className="text-left px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          Price
                        </th>
                        <th className="text-left px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          Outcome ID
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketOutcomes.map((o, idx) => {
                        const p = marketOutcomePrices?.[idx]
                        const priceText =
                          typeof p === 'number'
                            ? formatNumber(p, { maximumFractionDigits: 4 })
                            : typeof p === 'string'
                              ? p
                              : p === undefined
                                ? '—'
                                : String(p)
                        const marketRecord = market.data as unknown as Record<string, unknown>
                        const tokenIdsRaw = marketRecord.clobTokenIds ?? marketRecord.tokenIds ?? marketRecord.clobTokenId
                        const tokenIds = parseMaybeArray(tokenIdsRaw)
                        const tokenId = tokenIds?.[idx]
                        const tokenIdText =
                          inferOutcomeId(o) ??
                          (typeof tokenId === 'string' && tokenId.trim()
                            ? tokenId
                            : typeof tokenId === 'number' && Number.isFinite(tokenId)
                              ? String(tokenId)
                              : undefined)

                        return (
                          <tr key={`marketOutcome:${idx}`} className="hover:bg-slate-100/60 dark:hover:bg-slate-700/40">
                            <td className="px-4 py-2 md:w-1/5 border-b border-slate-200/60 dark:border-slate-700/50 text-slate-900 dark:text-slate-50">
                              {typeof o === 'string' ? o : JSON.stringify(o)}
                            </td>
                            <td className="px-4 md:w-1/4 py-2 border-b border-slate-200/60 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 font-mono">
                              {priceText}
                            </td>
                            <td className="px-4 py-2 border-b border-slate-200/60 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 font-mono break-all">
                              {tokenIdText ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {market.data.description ? (
                <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{market.data.description}</div>
              ) : null}
            </div>
          ) : (
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-slate-500 dark:text-slate-400">
              暂无 Market 信息
            </div>
          )}

          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">交易员统计</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">本市场交易数</div>
              <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{tradesInMarket.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">本市场交易量（估算）</div>
              <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsd(tradeVolumeUsd)}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">本市场流水条数</div>
              <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{activityInMarket.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">本市场流水金额（估算）</div>
              <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsd(activityVolumeUsd)}</div>
            </div>
          </div>

          <section className="flex flex-col gap-8">
            <TradesTable
              trades={tradesInMarket}
              status={trader.status}
              paging={{
                status: trader.tradesPaging.status,
                error: trader.tradesPaging.error,
                hasMore: trader.tradesPaging.hasMore,
                loadMore: trader.loadMoreTrades,
              }}
              features={{ enableMarketDetails: false }}
            />

            <ActivitiesTable
              activity={activityInMarket}
              status={trader.status}
              paging={{
                status: trader.activityPaging.status,
                error: trader.activityPaging.error,
                hasMore: trader.activityPaging.hasMore,
                loadMore: trader.loadMoreActivity,
              }}
              features={{ enableMarketDetails: false }}
            />
          </section>
        </section>
      )}
    </main>
  )
}
