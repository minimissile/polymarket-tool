import { useMemo, useState } from 'react'
import type { DataApiPosition } from '../lib/polymarketDataApi'
import { formatPercent, formatUsd } from '../lib/format'

export function PositionsTable(props: { positions: DataApiPosition[]; maxRows?: number }) {
  const [query, setQuery] = useState('')
  const maxRows = props.maxRows ?? 50

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = props.positions.slice()
    if (!q) return list.slice(0, maxRows)
    return list
      .filter((p) => {
        const title = (p.title ?? '').toLowerCase()
        const slug = (p.slug ?? '').toLowerCase()
        const outcome = (p.outcome ?? '').toLowerCase()
        return title.includes(q) || slug.includes(q) || outcome.includes(q) || p.conditionId.toLowerCase().includes(q)
      })
      .slice(0, maxRows)
  }, [maxRows, props.positions, query])

  return (
    <div className="tableSection">
      <div className="tableToolbar">
        <h2 className="sectionTitle">当前持仓（Data-API Positions）</h2>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="筛选：标题 / outcome / conditionId"
          aria-label="筛选当前持仓"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="empty">暂无持仓</div>
      ) : (
        <div className="tableWrap" role="region" aria-label="当前持仓表格">
          <table className="table">
            <thead>
              <tr>
                <th>市场</th>
                <th>Outcome</th>
                <th>当前价值</th>
                <th>现金收益</th>
                <th>收益率</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={`${p.conditionId}:${p.asset}`}>
                  <td title={p.title ?? p.conditionId}>{p.title ?? p.conditionId.slice(0, 10) + '…'}</td>
                  <td>{p.outcome ?? '—'}</td>
                  <td>{formatUsd(p.currentValue)}</td>
                  <td className={p.cashPnl >= 0 ? 'pos' : 'neg'}>{formatUsd(p.cashPnl)}</td>
                  <td className={p.percentPnl >= 0 ? 'pos' : 'neg'}>{formatPercent(p.percentPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

