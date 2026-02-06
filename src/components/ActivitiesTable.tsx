import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { MarketDetailsPanel } from './MarketDetailsPanel'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { useMarketDetailsBySlug, type MarketDetailState } from '../hooks/useMarketDetailsBySlug'
import { type DataApiActivity } from '../lib/polymarketDataApi'
import { formatClockTime, formatDateTime, formatNumber, formatRelativeTime, formatUsd } from '../lib/format'

type ActivityFeatures = Partial<{
  showIcon: boolean
  showRelativeTime: boolean
  highlightRecent: boolean
  enableMarketDetails: boolean
}>

export function ActivitiesTable(props: {
  activity: DataApiActivity[]
  status?: 'idle' | 'loading' | 'ready' | 'error'
  onOpenMarket?: (slug: string) => void
  maxRows?: number
  paging?: {
    status: 'idle' | 'loading' | 'error'
    error?: string
    hasMore: boolean
    loadMore: () => void
  }
  features?: ActivityFeatures
}) {
  const [query, setQuery] = useState('')
  const maxRows = props.maxRows ?? 5000
  const pageSize = Math.min(50, maxRows)
  const [visiblePages, setVisiblePages] = useState(1)

  const features = useMemo(() => {
    return {
      showIcon: true,
      showRelativeTime: true,
      highlightRecent: true,
      enableMarketDetails: true,
      ...props.features,
    }
  }, [props.features])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!features.showRelativeTime && !features.highlightRecent) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [features.highlightRecent, features.showRelativeTime])

  const lastUpdatedEpochSeconds = useMemo(() => {
    let latest = 0
    for (const a of props.activity) {
      const ts = a.timestamp
      if (typeof ts === 'number' && Number.isFinite(ts) && ts > latest) latest = ts
    }
    return latest > 0 ? latest : undefined
  }, [props.activity])

  const { expandedBySlug, marketBySlug, fetchMarket, toggleDetails } = useMarketDetailsBySlug({ onOpenMarket: props.onOpenMarket })

  const colCount = 8 + (features.enableMarketDetails ? 1 : 0)

  const formatTimeCell = (epochSeconds: number) => {
    const abs = formatDateTime(epochSeconds)
    if (!features.showRelativeTime) return abs
    return `${abs} ${formatRelativeTime(epochSeconds, nowMs)}`
  }

  const activityRowKey = (a: DataApiActivity) => {
    const hash = a.transactionHash?.trim()
    if (hash) return `${a.timestamp}:${hash}:${a.type}`
    return `${a.timestamp}:${a.type}:${a.asset ?? ''}:${a.conditionId ?? ''}:${a.side ?? ''}:${a.outcomeIndex ?? ''}:${a.price ?? ''}:${a.size ?? ''}:${a.usdcSize ?? ''}`
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = props.activity.slice().sort((a, b) => b.timestamp - a.timestamp)
    const matched = q
      ? list.filter((a) => {
          const title = (a.title ?? '').toLowerCase()
          const slug = (a.slug ?? '').toLowerCase()
          const outcome = (a.outcome ?? '').toLowerCase()
          const type = (a.type ?? '').toLowerCase()
          const conditionId = (a.conditionId ?? '').toLowerCase()
          return title.includes(q) || slug.includes(q) || outcome.includes(q) || type.includes(q) || conditionId.includes(q)
        })
      : list
    return matched.slice(0, maxRows)
  }, [maxRows, props.activity, query])
  const visibleCount = Math.min(filtered.length, visiblePages * pageSize)

  const canRevealMore = visibleCount < filtered.length
  const canFetchMore = Boolean(props.paging?.hasMore) && props.activity.length < maxRows && props.paging?.status !== 'error'
  const isPagingLoading = props.paging?.status === 'loading'

  const loadMore = useCallback(() => {
    if (canRevealMore) {
      setVisiblePages((prev) => prev + 1)
      return
    }
    if (canFetchMore && !isPagingLoading) props.paging?.loadMore()
  }, [canFetchMore, canRevealMore, isPagingLoading, props.paging])

  const sentinelRef = useInfiniteScrollTrigger<HTMLDivElement>({
    enabled: canRevealMore || canFetchMore,
    onTrigger: loadMore,
  })

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 items-center">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">账户活动流水</h2>
        <input
          className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 transition-all mb-4"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setVisiblePages(1)
          }}
          placeholder="筛选：标题 / 市场 / type / conditionId"
          aria-label="筛选账户活动流水"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          {props.status === 'loading' ? '加载中…' : '暂无活动'}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-sm" role="region" aria-label="账户活动流水表格">
          <table className="w-full border-collapse text-sm min-w-[1100px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  时间
                </th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  类型
                </th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  方向
                </th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  市场
                </th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  Outcome
                </th>

                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  价格
                </th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  数量
                </th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                  金额
                </th>
                {features.enableMarketDetails ? (
                  <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">
                    操作
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const rowKey = activityRowKey(a)
                const slug = (a.slug ?? '').trim()
                const slugKey = slug.toLowerCase()
                const expanded = Boolean(slugKey && expandedBySlug[slugKey])
                const marketState: MarketDetailState | undefined = slugKey ? marketBySlug[slugKey] : undefined

                const ageSec = nowMs / 1000 - a.timestamp
                const isRecent = features.highlightRecent && ageSec >= 0 && ageSec <= 300

                const typeBadge =
                  a.type === 'TRADE'
                    ? 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'
                    : 'bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'

                const sideLabel = a.side === 'BUY' ? '买入' : a.side === 'SELL' ? '卖出' : '—'
                const sideBadge =
                  a.side === 'BUY'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                    : a.side === 'SELL'
                      ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                      : 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'

                const usdc =
                  a.usdcSize !== undefined
                    ? a.usdcSize
                    : a.size !== undefined && a.price !== undefined
                      ? a.size * a.price
                      : undefined

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isRecent ? 'bg-amber-50/70 dark:bg-amber-900/15 border-l-4 border-amber-400 dark:border-amber-600' : ''}`}
                    >
                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono text-xs whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isRecent ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold" aria-label="5 分钟内">
                              NEW
                            </span>
                          ) : null}
                          <span>{formatTimeCell(a.timestamp)}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-semibold ${typeBadge}`}>{a.type}</span>
                      </td>

                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold ${sideBadge}`}>
                          {a.side === 'BUY' ? <span aria-hidden>↑</span> : a.side === 'SELL' ? <span aria-hidden>↓</span> : null}
                          {sideLabel}
                        </span>
                      </td>

                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle min-w-[340px]">
                        <div className="flex items-center gap-2 min-w-0">
                          {features.showIcon && a.icon ? (
                            <img
                              src={a.icon}
                              alt={a.title ? `${a.title} icon` : 'market icon'}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded object-cover border border-slate-200 dark:border-slate-700"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="truncate" title={a.title ?? a.conditionId ?? rowKey}>
                              {a.title ?? (a.conditionId ? `${a.conditionId.slice(0, 10)}…` : '—')}
                            </div>
                            {a.slug ? (
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate" title={a.slug}>
                                {a.slug}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle whitespace-nowrap">
                        {a.outcome ?? '—'}
                      </td>



                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap">
                        {a.price === undefined ? '—' : formatNumber(a.price, { maximumFractionDigits: 4 })}
                      </td>

                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap">
                        {a.size === undefined ? '—' : formatNumber(a.size, { maximumFractionDigits: 2 })}
                      </td>

                      <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap">
                        {usdc === undefined ? '—' : formatUsd(usdc)}
                      </td>

                      {features.enableMarketDetails ? (
                        <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle whitespace-nowrap">
                          <button
                            className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => toggleDetails(slug)}
                            disabled={!slug}
                            aria-label={slug ? '打开 market 分析页' : '缺少 slug，无法打开'}
                            aria-expanded={props.onOpenMarket ? undefined : expanded}
                            aria-controls={props.onOpenMarket ? undefined : slug ? `activityDetails:${slugKey}` : undefined}
                          >
                            {props.onOpenMarket ? '详情' : expanded ? '收起' : '详情'}
                          </button>
                        </td>
                      ) : null}
                    </tr>

                    {features.enableMarketDetails && slugKey && expanded ? (
                      <tr id={`activityDetails:${slugKey}`}>
                        <td colSpan={colCount} className="px-4 py-4 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/20">
                          <MarketDetailsPanel slugKey={slugKey} marketState={marketState} onRetry={() => fetchMarket(slugKey)} />
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
              {lastUpdatedEpochSeconds !== undefined ? formatClockTime(lastUpdatedEpochSeconds) : '—'}
              {canRevealMore
                ? '（滚动加载中…）'
                : isPagingLoading || canFetchMore
                  ? '（更新中…）'
                  : props.paging?.status === 'error'
                    ? '（加载失败）'
                    : props.activity.length >= maxRows
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
