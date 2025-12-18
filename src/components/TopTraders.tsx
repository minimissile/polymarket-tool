import { formatDateTime, formatUsd } from '../lib/format'
import type { TopTraderRow } from '../hooks/useTopTraders'

/** 热门交易员表格：展示聚合结果，并支持刷新与一键观察。 */
export function TopTraders(props: {
  rows: TopTraderRow[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  onRefresh: () => void
  onWatch: (user: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">发现热门交易员（最近 300 笔）</h2>
        <button className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed" onClick={props.onRefresh} disabled={props.status === 'loading'} aria-label="刷新热门交易员">
          {props.status === 'loading' ? '刷新中…' : '刷新'}
        </button>
      </div>
      {props.error ? <div className="text-red-500 text-sm">获取失败：{props.error}</div> : null}

      {props.rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">点击「刷新」后会从公开 Data-API 拉取最近成交并聚合。</div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm" role="region" aria-label="热门交易员表格">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">地址</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">近似成交额</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">交易数</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">最近交易</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.user} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono">{row.user.slice(0, 6)}…{row.user.slice(-4)}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{formatUsd(row.approxVolumeUsd)}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{row.tradeCount}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{row.lastTradeTs ? formatDateTime(row.lastTradeTs) : '—'}</td>
                  <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle" style={{ width: 92 }}>
                    <button className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 dark:bg-blue-600 dark:border-blue-600 transition-all" onClick={() => props.onWatch(row.user)} aria-label={`观察 ${row.user}`}>
                      观察
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
