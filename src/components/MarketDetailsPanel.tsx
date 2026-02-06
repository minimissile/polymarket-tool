import { useMemo } from 'react'
import { formatNumber } from '../lib/format'
import { parseMaybeArray } from '../lib/parse'
import type { MarketDetailState } from '../hooks/useMarketDetailsBySlug'

/**
 * Market 详情面板：在表格行内展开时展示 Gamma market 详情。
 */
export function MarketDetailsPanel(props: {
  slugKey: string
  marketState: MarketDetailState | undefined
  onRetry: () => void
}) {
  const outcomes = useMemo(() => {
    if (props.marketState?.status !== 'ready') return undefined
    return parseMaybeArray((props.marketState.data as unknown as Record<string, unknown>).outcomes)
  }, [props.marketState])

  const outcomePrices = useMemo(() => {
    if (props.marketState?.status !== 'ready') return undefined
    return parseMaybeArray((props.marketState.data as unknown as Record<string, unknown>).outcomePrices)
  }, [props.marketState])

  if (props.marketState?.status === 'loading') {
    return <div className="text-sm text-slate-500 dark:text-slate-400">加载详情中…</div>
  }

  if (props.marketState?.status === 'error') {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-sm text-red-500">加载失败：{props.marketState.error}</div>
        <div>
          <button
            className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={props.onRetry}
            aria-label={`重试加载 ${props.slugKey} 市场详情`}
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (props.marketState?.status !== 'ready') {
    return <div className="text-sm text-slate-500 dark:text-slate-400">暂无详情</div>
  }

  const data = props.marketState.data

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate" title={data.question ?? props.slugKey}>
            {data.question ?? props.slugKey}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all">slug: {props.slugKey}</div>
        </div>
        <a
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline whitespace-nowrap"
          href={`https://polymarket.com/market/${props.slugKey}`}
          target="_blank"
          rel="noreferrer"
        >
          打开页面
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className="text-slate-500 dark:text-slate-400">结束时间</div>
          <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">{data.endDateIso ?? data.endDate ?? '—'}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className="text-slate-500 dark:text-slate-400">成交量</div>
          <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">
            {data.volumeNum !== undefined ? formatNumber(data.volumeNum) : '—'}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className="text-slate-500 dark:text-slate-400">流动性</div>
          <div className="text-slate-900 dark:text-slate-50 font-mono mt-1">
            {data.liquidityNum !== undefined ? formatNumber(data.liquidityNum) : '—'}
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
                  <tr key={`${props.slugKey}:outcome:${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
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

      {data.description ? <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{data.description}</div> : null}
    </div>
  )
}

