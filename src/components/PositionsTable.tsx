import { useMemo, useState } from 'react'
import type { DataApiPosition, DataApiTrade } from '../lib/polymarketDataApi'
import { formatPercent, formatUsd } from '../lib/format'

/** 当前持仓表格：展示 Data-API Positions，并支持关键词筛选。 */
export function PositionsTable(props: { positions: DataApiPosition[]; trades?: DataApiTrade[]; maxRows?: number }) {
  const [query, setQuery] = useState('')
  const maxRows = props.maxRows ?? 50

  const lastTradeTsByCondition = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of props.trades ?? []) {
      const key = t.conditionId.toLowerCase()
      map[key] = Math.max(map[key] ?? 0, t.timestamp)
    }
    return map
  }, [props.trades])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = props.positions
      .slice()
      .sort((a, b) => {
        const ta = lastTradeTsByCondition[a.conditionId.toLowerCase()] ?? 0
        const tb = lastTradeTsByCondition[b.conditionId.toLowerCase()] ?? 0
        if (tb !== ta) return tb - ta
        return b.currentValue - a.currentValue
      })

    if (!q) return list.slice(0, maxRows)
    return list
      .filter((p) => {
        const title = (p.title ?? '').toLowerCase()
        const slug = (p.slug ?? '').toLowerCase()
        const outcome = (p.outcome ?? '').toLowerCase()
        return title.includes(q) || slug.includes(q) || outcome.includes(q) || p.conditionId.toLowerCase().includes(q)
      })
      .slice(0, maxRows)
  }, [lastTradeTsByCondition, maxRows, props.positions, query])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 items-center">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">当前持仓（Data-API Positions）</h2>
        <input
          className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 transition-all mb-4"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="筛选：标题 / outcome / conditionId"
          aria-label="筛选当前持仓"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">暂无持仓</div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm" role="region" aria-label="当前持仓表格">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">市场</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">Outcome</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">当前价值</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">现金收益</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">收益率</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={`${p.conditionId}:${p.asset}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle" title={p.title ?? p.conditionId}>{p.title ?? p.conditionId.slice(0, 10) + '…'}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{p.outcome ?? '—'}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{formatUsd(p.currentValue)}</td>
                  <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle ${p.cashPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatUsd(p.cashPnl)}</td>
                  <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle ${p.percentPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPercent(p.percentPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
