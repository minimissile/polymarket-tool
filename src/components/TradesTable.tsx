import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getGammaMarketBySlug, type DataApiTrade, type GammaMarket } from '../lib/polymarketDataApi'
import { formatDateTime, formatNumber, formatRelativeTime, formatUsd } from '../lib/format'

/** 最近交易表格：按时间倒序展示，并支持关键词筛选。 */
export function TradesTable(props: {
  trades: DataApiTrade[]
  status?: 'idle' | 'loading' | 'ready' | 'error'
  onOpenMarket?: (slug: string) => void
  maxRows?: number
  latestPricesByAssetId?: Record<string, { bestBid?: number; bestAsk?: number; lastTrade?: number }>
  marketCloseTimeMs?: number
  paging?: {
    status: 'idle' | 'loading' | 'error'
    error?: string
    hasMore: boolean
    loadMore: () => void
  }
  features?: Partial<{
    showOrderAmount: boolean
    showIcon: boolean
    showTradeType: boolean
    showRelativeTime: boolean
    highlightRecentTrades: boolean
    enableMarketDetails: boolean
  }>
}) {
  const [query, setQuery] = useState('')
  const maxRows = props.maxRows ?? 5000
  const pageSize = Math.min(50, maxRows)
  const [visiblePages, setVisiblePages] = useState(1)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const features = useMemo(() => {
    return {
      showOrderAmount: true,
      showIcon: true,
      showTradeType: true,
      showRelativeTime: true,
      highlightRecentTrades: true,
      enableMarketDetails: true,
      ...props.features,
    }
  }, [props.features])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!features.showRelativeTime && !features.highlightRecentTrades) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [features.highlightRecentTrades, features.showRelativeTime])

  const lastUpdatedEpochSeconds = useMemo(() => {
    let latest = 0
    for (const t of props.trades) {
      const ts = t.timestamp
      if (typeof ts === 'number' && Number.isFinite(ts) && ts > latest) latest = ts
    }
    return latest > 0 ? latest : undefined
  }, [props.trades])

  type MarketDetailState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; data: GammaMarket }
    | { status: 'error'; error: string }

  const [expandedBySlug, setExpandedBySlug] = useState<Record<string, boolean>>({})
  const [marketBySlug, setMarketBySlug] = useState<Record<string, MarketDetailState>>({})
  const marketBySlugRef = useRef<Record<string, MarketDetailState>>({})
  const abortBySlugRef = useRef<Record<string, AbortController>>({})

  useEffect(() => {
    marketBySlugRef.current = marketBySlug
  }, [marketBySlug])

  const showLivePnl = Boolean(props.latestPricesByAssetId)
  const showCloseCountdown = typeof props.marketCloseTimeMs === 'number' && Number.isFinite(props.marketCloseTimeMs)
  const colCount =
    6 +
    (features.showOrderAmount ? 1 : 0) +
    (showCloseCountdown ? 1 : 0) +
    (showLivePnl ? 2 : 0) +
    (features.enableMarketDetails ? 1 : 0)

  const fetchMarket = async (slug: string) => {
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
  }

  const toggleDetails = (slug: string) => {
    if (props.onOpenMarket) {
      const key = slug.toLowerCase()
      props.onOpenMarket(key)
      return
    }
    const key = slug.toLowerCase()
    setExpandedBySlug((prev) => {
      const next = !prev[key]
      return { ...prev, [key]: next }
    })
    void fetchMarket(key)
  }

  const parseMaybeArray = (value: unknown): unknown[] | undefined => {
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

  const formatTimeCell = (epochSeconds: number) => {
    const abs = formatDateTime(epochSeconds)
    if (!features.showRelativeTime) return abs
    return `${abs} ${formatRelativeTime(epochSeconds, nowMs)}`
  }

  const tradeRowKey = (t: DataApiTrade) => {
    const hash = t.transactionHash?.trim()
    if (hash) return `${t.timestamp}:${hash}`
    return `${t.timestamp}:${t.asset}:${t.conditionId}:${t.side}:${t.outcomeIndex ?? ''}:${t.price}:${t.size}`
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = props.trades.slice().sort((a, b) => b.timestamp - a.timestamp)
    const matched = q
      ? list.filter((t) => {
          const title = (t.title ?? '').toLowerCase()
          const slug = (t.slug ?? '').toLowerCase()
          const outcome = (t.outcome ?? '').toLowerCase()
          return title.includes(q) || slug.includes(q) || outcome.includes(q) || t.conditionId.toLowerCase().includes(q)
        })
      : list
    return matched.slice(0, maxRows)
  }, [maxRows, props.trades, query])
  const visibleCount = Math.min(filtered.length, visiblePages * pageSize)

  const canRevealMore = visibleCount < filtered.length
  const canFetchMore = Boolean(props.paging?.hasMore) && props.trades.length < maxRows && props.paging?.status !== 'error'
  const isPagingLoading = props.paging?.status === 'loading'

  const loadMore = useCallback(() => {
    if (canRevealMore) {
      setVisiblePages((prev) => prev + 1)
      return
    }
    if (canFetchMore && !isPagingLoading) props.paging?.loadMore()
  }, [canFetchMore, canRevealMore, isPagingLoading, props.paging])

  useEffect(() => {
    if (!canRevealMore && !canFetchMore) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [canFetchMore, canRevealMore, loadMore])

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 items-center">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">最近交易</h2>
        <input
          className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 transition-all mb-4"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setVisiblePages(1)
          }}
          placeholder="筛选：标题 / 市场 / outcome / conditionId"
          aria-label="筛选最近交易"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          {props.status === 'loading' ? '加载中…' : '暂无交易'}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-sm" role="region" aria-label="最近交易表格">
          <table className="w-full border-collapse text-sm min-w-[1240px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">时间</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">交易类型</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">市场</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">Outcome</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">价格</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">数量</th>
                {features.showOrderAmount ? (
                  <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">下单金额</th>
                ) : null}
                {showCloseCountdown ? (
                  <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                    距收盘
                  </th>
                ) : null}
                {showLivePnl ? (
                  <>
                    <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                      收益
                    </th>
                    <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                      收益率
                    </th>
                  </>
                ) : null}
                {features.enableMarketDetails ? (
                  <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">操作</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const rowKey = tradeRowKey(t)
                const slug = (t.slug ?? '').trim()
                const slugKey = slug.toLowerCase()
                const expanded = Boolean(slugKey && expandedBySlug[slugKey])
                const marketState: MarketDetailState | undefined = slugKey ? marketBySlug[slugKey] : undefined
                const ageSec = nowMs / 1000 - t.timestamp
                const isRecent = features.highlightRecentTrades && ageSec >= 0 && ageSec <= 300

                const sideLabel = t.side === 'BUY' ? '买入' : '卖出'
                const sideBadge =
                  t.side === 'BUY'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'

                const orderAmountUsd = (t.size ?? 0) * (t.price ?? 0)

                const outcomes = marketState?.status === 'ready' ? parseMaybeArray(marketState.data.outcomes) : undefined
                const outcomePrices = marketState?.status === 'ready' ? parseMaybeArray(marketState.data.outcomePrices) : undefined

                const livePrice = props.latestPricesByAssetId?.[t.asset]
                const liveClosePriceRaw = t.side === 'BUY' ? livePrice?.bestBid : livePrice?.bestAsk
                const liveClosePrice =
                  liveClosePriceRaw !== undefined && liveClosePriceRaw > 0 && liveClosePriceRaw < 1 ? liveClosePriceRaw : undefined
                const pnlUsd =
                  showLivePnl && liveClosePrice !== undefined && t.price !== undefined && t.size !== undefined
                    ? (t.side === 'BUY' ? (liveClosePrice - t.price) * t.size : (t.price - liveClosePrice) * t.size)
                    : undefined
                const pnlPct =
                  pnlUsd !== undefined && t.price !== undefined && t.size !== undefined && t.price > 0 && t.size > 0
                    ? pnlUsd / (t.price * t.size)
                    : undefined
                const pnlColor =
                  pnlUsd !== undefined
                    ? pnlUsd > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : pnlUsd < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-500 dark:text-slate-400'

                const closeText = (() => {
                  if (!showCloseCountdown) return undefined
                  const closeMs = props.marketCloseTimeMs as number
                  const remainingMs = closeMs - nowMs
                  if (!(remainingMs > 0)) return '已收盘'
                  const totalSeconds = Math.floor(remainingMs / 1000)
                  const minutes = Math.floor(totalSeconds / 60)
                  const seconds = totalSeconds % 60
                  const secText = String(seconds).padStart(2, '0')
                  return `${minutes}分${secText}秒`
                })()

                return (
                  <Fragment key={rowKey}>
                    <tr
                      key={rowKey}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isRecent ? 'bg-amber-50/70 dark:bg-amber-900/15 border-l-4 border-amber-400 dark:border-amber-600' : ''}`}
                    >
                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono text-xs whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isRecent ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold" aria-label="5 分钟内">
                              NEW
                            </span>
                          ) : null}
                          <span>{formatTimeCell(t.timestamp)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold ${sideBadge}`}>
                          <span aria-hidden>{t.side === 'BUY' ? '↑' : '↓'}</span>
                          {features.showTradeType ? sideLabel : t.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle min-w-[340px]">
                        <div className="flex items-center gap-2 min-w-0">
                          {features.showIcon && t.icon ? (
                            <img
                              src={t.icon}
                              alt={t.title ? `${t.title} icon` : 'market icon'}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded object-cover border border-slate-200 dark:border-slate-700"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="truncate" title={t.title ?? t.conditionId}>
                              {t.title ?? `${t.conditionId.slice(0, 10)}…`}
                            </div>
                            {t.slug ? (
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate" title={t.slug}>
                                {t.slug}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle whitespace-nowrap font-semibold">
                        {t.outcome ?? '—'}
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap">
                        {formatNumber(t.price, { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap">
                        {formatNumber(t.size, { maximumFractionDigits: 2 })}
                      </td>
                      {features.showOrderAmount ? (
                        <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap">
                          {formatUsd(orderAmountUsd)}
                        </td>
                      ) : null}
                      {showCloseCountdown ? (
                        <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap">
                          {closeText ?? '—'}
                        </td>
                      ) : null}
                      {showLivePnl ? (
                        <>
                          <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle font-mono whitespace-nowrap ${pnlColor}`}>
                            {pnlUsd !== undefined ? formatUsd(pnlUsd) : '—'}
                          </td>
                          <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle font-mono whitespace-nowrap ${pnlColor}`}>
                            {pnlPct !== undefined ? `${formatNumber(pnlPct * 100, { maximumFractionDigits: 2 })}%` : '—'}
                          </td>
                        </>
                      ) : null}
                      {features.enableMarketDetails ? (
                        <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle whitespace-nowrap">
                          <button
                            className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => toggleDetails(slug)}
                            disabled={!slug}
                            aria-label={slug ? '打开 market 分析页' : '缺少 slug，无法打开'}
                            aria-expanded={props.onOpenMarket ? undefined : expanded}
                            aria-controls={props.onOpenMarket ? undefined : slug ? `tradeDetails:${slugKey}` : undefined}
                          >
                            {props.onOpenMarket ? '详情' : expanded ? '收起' : '详情'}
                          </button>
                        </td>
                      ) : null}
                    </tr>

                    {features.enableMarketDetails && slugKey && expanded ? (
                      <tr key={`${rowKey}:details`} id={`tradeDetails:${slugKey}`}>
                        <td
                          colSpan={colCount}
                          className="px-4 py-4 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/20"
                        >
                          {marketState?.status === 'loading' ? (
                            <div className="text-sm text-slate-500 dark:text-slate-400">加载详情中…</div>
                          ) : marketState?.status === 'error' ? (
                            <div className="flex flex-col gap-2">
                              <div className="text-sm text-red-500">加载失败：{marketState.error}</div>
                              <div>
                                <button
                                  className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => fetchMarket(slugKey)}
                                  aria-label={`重试加载 ${slugKey} 市场详情`}
                                >
                                  重试
                                </button>
                              </div>
                            </div>
                          ) : marketState?.status === 'ready' ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate" title={marketState.data.question ?? slugKey}>
                                    {marketState.data.question ?? slugKey}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all">
                                    slug: {slugKey}
                                  </div>
                                </div>
                                <a
                                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline whitespace-nowrap"
                                  href={`https://polymarket.com/market/${slugKey}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  打开页面
                                </a>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                                  <div className="text-slate-500 dark:text-slate-400">结束时间</div>
                                  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">
                                    {marketState.data.endDateIso ?? marketState.data.endDate ?? '—'}
                                  </div>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                                  <div className="text-slate-500 dark:text-slate-400">成交量</div>
                                  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">
                                    {marketState.data.volumeNum !== undefined ? formatNumber(marketState.data.volumeNum) : '—'}
                                  </div>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                                  <div className="text-slate-500 dark:text-slate-400">流动性</div>
                                  <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">
                                    {marketState.data.liquidityNum !== undefined ? formatNumber(marketState.data.liquidityNum) : '—'}
                                  </div>
                                </div>
                              </div>

                              {outcomes && outcomes.length > 0 ? (
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                  <table className="w-full border-collapse text-sm">
                                    <thead>
                                      <tr>
                                        <th className="text-left px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                          Outcome
                                        </th>
                                        <th className="text-left px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                          Price
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {outcomes.map((o, idx) => {
                                        const p = outcomePrices?.[idx]
                                        const priceText =
                                          typeof p === 'number'
                                            ? formatNumber(p, { maximumFractionDigits: 4 })
                                            : typeof p === 'string'
                                              ? p
                                              : p === undefined
                                                ? '—'
                                                : String(p)
                                        return (
                                          <tr key={`${slugKey}:outcome:${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50">
                                              {typeof o === 'string' ? o : JSON.stringify(o)}
                                            </td>
                                            <td className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 font-mono">
                                              {priceText}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}

                              {marketState.data.description ? (
                                <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                                  {marketState.data.description}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 dark:text-slate-400">暂无详情</div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/60 dark:bg-slate-900/10 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              已显示 {Math.min(visibleCount, filtered.length)} / {filtered.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
              最后更新时间：
              {lastUpdatedEpochSeconds !== undefined
                ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
                    new Date(lastUpdatedEpochSeconds * 1000),
                  )
                : '—'}
              {canRevealMore
                ? '（滚动加载中…）'
                : isPagingLoading || canFetchMore
                  ? '（更新中…）'
                  : props.paging?.status === 'error'
                    ? '（加载失败）'
                    : props.trades.length >= maxRows
                      ? '（已达上限）'
                      : '（已加载全部）'}
            </div>
          </div>
          {props.paging?.status === 'error' && props.paging.error ? (
            <div
              className="px-4 py-3 text-xs text-red-500 bg-slate-50/60 dark:bg-slate-900/10 border-t border-slate-200 dark:border-slate-700"
              role="status"
              aria-live="polite"
            >
              加载更多失败：{props.paging.error}
            </div>
          ) : null}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </div>
      )}
    </div>
  )
}
