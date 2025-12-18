import { useMemo, useState } from 'react'
import type { DataApiTrade } from '../lib/polymarketDataApi'
import { formatDateTime, formatNumber } from '../lib/format'

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
    <div className="tableSection">
      <div className="tableToolbar">
        <h2 className="sectionTitle">最近交易</h2>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="筛选：标题 / 市场 / outcome / conditionId"
          aria-label="筛选最近交易"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="empty">暂无交易</div>
      ) : (
        <div className="tableWrap" role="region" aria-label="最近交易表格">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>方向</th>
                <th>市场</th>
                <th>Outcome</th>
                <th>价格</th>
                <th>数量</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={`${t.timestamp}:${t.transactionHash ?? ''}:${t.asset}`}>
                  <td className="mono">{formatDateTime(t.timestamp)}</td>
                  <td className={t.side === 'BUY' ? 'pos' : 'neg'}>{t.side}</td>
                  <td title={t.title ?? t.conditionId}>{t.title ?? t.conditionId.slice(0, 10) + '…'}</td>
                  <td>{t.outcome ?? '—'}</td>
                  <td>{formatNumber(t.price, { maximumFractionDigits: 4 })}</td>
                  <td>{formatNumber(t.size, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

