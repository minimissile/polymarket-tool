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
    <div className="leaderboard">
      <div className="leaderboardHeader">
        <h2 className="sectionTitle">交易员排行榜（本地观察列表）</h2>
        <div className="segmented" role="group" aria-label="排行榜排序">
          <button
            className={`segmentedBtn ${props.sortBy === 'cashPnl' ? 'active' : ''}`}
            onClick={() => props.onSortByChange('cashPnl')}
            aria-label="按现金收益排序"
          >
            收益($)
          </button>
          <button
            className={`segmentedBtn ${props.sortBy === 'percentPnl' ? 'active' : ''}`}
            onClick={() => props.onSortByChange('percentPnl')}
            aria-label="按收益率排序"
          >
            收益率
          </button>
          <button
            className={`segmentedBtn ${props.sortBy === 'tradeVolumeUsd' ? 'active' : ''}`}
            onClick={() => props.onSortByChange('tradeVolumeUsd')}
            aria-label="按交易量排序"
          >
            交易量
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">观察列表为空。先在上方输入地址并点击「观察」。</div>
      ) : (
        <div className="tableWrap" role="region" aria-label="交易员排行榜表格">
          <table className="table">
            <thead>
              <tr>
                <th>地址</th>
                <th>收益($)</th>
                <th>收益率</th>
                <th>交易量</th>
                <th>交易数</th>
                <th>最近交易</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const active = props.selectedUser?.toLowerCase() === row.user.toLowerCase()
                return (
                  <tr
                    key={row.user}
                    className={active ? 'activeRow' : undefined}
                    onClick={() => props.onSelect(row.user)}
                    role="button"
                    tabIndex={0}
                    aria-label={`选择 ${row.user}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') props.onSelect(row.user)
                    }}
                  >
                    <td className="mono">{row.user.slice(0, 6)}…{row.user.slice(-4)}</td>
                    <td className={row.cashPnl >= 0 ? 'pos' : 'neg'}>{formatUsd(row.cashPnl)}</td>
                    <td className={row.percentPnl >= 0 ? 'pos' : 'neg'}>{formatPercent(row.percentPnl)}</td>
                    <td>{formatUsd(row.tradeVolumeUsd)}</td>
                    <td>{row.tradeCount}</td>
                    <td>{row.lastTradeTs ? formatDateTime(row.lastTradeTs) : '—'}</td>
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
