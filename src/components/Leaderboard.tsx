import type { TraderSummary } from '../lib/analytics'
import { formatDateTime, formatPercent, formatUsd } from '../lib/format'

/** 排序维度：用于观察列表排行榜的展示与交互。 */
export type LeaderboardSort = 'cashPnl' | 'percentPnl' | 'tradeVolumeUsd'

/** 交易员排行榜：根据本地缓存汇总数据进行排序与选择跳转。 */
export function Leaderboard(props: {
  rows: TraderSummary[]
  selectedUser?: string
  onSelect: (user: string) => void
  sortBy: LeaderboardSort
  onSortByChange: (next: LeaderboardSort) => void
}) {
  const sorted = props.rows.slice().sort((a, b) => {
    if (props.sortBy === 'cashPnl') return b.cashPnl - a.cashPnl
    if (props.sortBy === 'percentPnl') return b.percentPnl - a.percentPnl
    return b.tradeVolumeUsd - a.tradeVolumeUsd
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">交易员排行榜（本地观察列表）</h2>
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1" role="group" aria-label="排行榜排序">
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${props.sortBy === 'cashPnl' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50'}`}
            onClick={() => props.onSortByChange('cashPnl')}
            aria-label="按现金收益排序"
          >
            收益($)
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${props.sortBy === 'percentPnl' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50'}`}
            onClick={() => props.onSortByChange('percentPnl')}
            aria-label="按收益率排序"
          >
            收益率
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${props.sortBy === 'tradeVolumeUsd' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50'}`}
            onClick={() => props.onSortByChange('tradeVolumeUsd')}
            aria-label="按交易量排序"
          >
            交易量
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">观察列表为空。先在上方输入地址并点击「观察」。</div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm" role="region" aria-label="交易员排行榜表格">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">地址</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">收益($)</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">收益率</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">交易量</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">交易数</th>
                <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap sticky top-0 z-20 first:rounded-tl-xl last:rounded-tr-xl">最近交易</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const active = props.selectedUser?.toLowerCase() === row.user.toLowerCase()
                return (
                  <tr
                    key={row.user}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${active ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    onClick={() => props.onSelect(row.user)}
                    role="button"
                    tabIndex={0}
                    aria-label={`选择 ${row.user}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') props.onSelect(row.user)
                    }}
                  >
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono">{row.user.slice(0, 6)}…{row.user.slice(-4)}</td>
                    <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle ${row.cashPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatUsd(row.cashPnl)}</td>
                    <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle ${row.percentPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatPercent(row.percentPnl)}</td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{formatUsd(row.tradeVolumeUsd)}</td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{row.tradeCount}</td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">{row.lastTradeTs ? formatDateTime(row.lastTradeTs) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
