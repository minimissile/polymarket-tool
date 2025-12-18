import { useMemo, useState } from 'react'
import type { DataApiTrade } from '../lib/polymarketDataApi'
import { formatDateTime, formatNumber } from '../lib/format'

/** 最近交易表格：按时间倒序展示，并支持关键词筛选。 */
export function TradesTable(props: { trades: DataApiTrade[]; maxRows?: number }) {
  const [query, setQuery] = useState('')
  const maxRows = props.maxRows ?? 50

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = props.trades.slice().sort((a, b) => b.timestamp - a.timestamp)
    if (!q) return list.slice(0, maxRows)
    return list
      .filter((t) => {
        const title = (t.title ?? '').toLowerCase()
        const slug = (t.slug ?? '').toLowerCase()
        const outcome = (t.outcome ?? '').toLowerCase()
        return (
          title.includes(q) ||
          slug.includes(q) ||
          outcome.includes(q) ||
          t.conditionId.toLowerCase().includes(q)
        )
      })
      .slice(0, maxRows)
  }, [maxRows, props.trades, query])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 items-center">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">最近交易</h2>
        <input
          className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 transition-all mb-4"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="筛选：标题 / 市场 / outcome / conditionId"
          aria-label="筛选最近交易"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">暂无交易</div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm" role="region" aria-label="最近交易表格">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">时间</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">方向</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">市场</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Outcome</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">价格</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">数量</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={`${t.timestamp}:${t.transactionHash ?? ''}:${t.asset}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono text-xs">{formatDateTime(t.timestamp)}</td>
                  <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle ${t.side === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}>{t.side}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle" title={t.title ?? t.conditionId}>{t.title ?? t.conditionId.slice(0, 10) + '…'}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{t.outcome ?? '—'}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{formatNumber(t.price, { maximumFractionDigits: 4 })}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{formatNumber(t.size, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
