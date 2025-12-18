import { formatDateTime, formatUsd } from '../lib/format'
import type { TopTraderRow } from '../hooks/useTopTraders'

export function TopTraders(props: {
  rows: TopTraderRow[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  onRefresh: () => void
  onWatch: (user: string) => void
}) {
  return (
    <div className="topTraders">
      <div className="leaderboardHeader">
        <h2 className="sectionTitle">发现热门交易员（最近 300 笔）</h2>
        <button className="button" onClick={props.onRefresh} disabled={props.status === 'loading'} aria-label="刷新热门交易员">
          {props.status === 'loading' ? '刷新中…' : '刷新'}
        </button>
      </div>
      {props.error ? <div className="errorText">获取失败：{props.error}</div> : null}

      {props.rows.length === 0 ? (
        <div className="empty">点击「刷新」后会从公开 Data-API 拉取最近成交并聚合。</div>
      ) : (
        <div className="tableWrap" role="region" aria-label="热门交易员表格">
          <table className="table">
            <thead>
              <tr>
                <th>地址</th>
                <th>近似成交额</th>
                <th>交易数</th>
                <th>最近交易</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.user}>
                  <td className="mono">{row.user.slice(0, 6)}…{row.user.slice(-4)}</td>
                  <td>{formatUsd(row.approxVolumeUsd)}</td>
                  <td>{row.tradeCount}</td>
                  <td>{row.lastTradeTs ? formatDateTime(row.lastTradeTs) : '—'}</td>
                  <td style={{ width: 92 }}>
                    <button className="button primary" onClick={() => props.onWatch(row.user)} aria-label={`观察 ${row.user}`}>
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

