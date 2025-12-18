import { useCallback, useState } from 'react'
import type { DataApiTrade } from '../lib/polymarketDataApi'
import { getRecentTrades } from '../lib/polymarketDataApi'

/** 热门交易员行：按近似成交额排序后用于表格展示。 */
export type TopTraderRow = {
  user: string
  tradeCount: number
  approxVolumeUsd: number
  lastTradeTs?: number
}

type State =
  | { status: 'idle'; rows: TopTraderRow[]; error?: string }
  | { status: 'loading'; rows: TopTraderRow[]; error?: string }
  | { status: 'ready'; rows: TopTraderRow[]; error?: string }
  | { status: 'error'; rows: TopTraderRow[]; error: string }

/** 将最近成交聚合到交易员维度，并按成交额降序排序。 */
function aggregate(trades: DataApiTrade[]) {
  const map = new Map<string, TopTraderRow>()
  for (const t of trades) {
    const user = (t.proxyWallet ?? '').toLowerCase()
    if (!user) continue
    const approxUsd = (t.size ?? 0) * (t.price ?? 0)
    const row = map.get(user) ?? { user, tradeCount: 0, approxVolumeUsd: 0, lastTradeTs: undefined }
    row.tradeCount += 1
    row.approxVolumeUsd += approxUsd
    row.lastTradeTs = row.lastTradeTs ? Math.max(row.lastTradeTs, t.timestamp) : t.timestamp
    map.set(user, row)
  }
  return Array.from(map.values()).sort((a, b) => b.approxVolumeUsd - a.approxVolumeUsd)
}

/** 拉取最近成交并聚合为热门交易员列表（手动触发刷新）。 */
export function useTopTraders() {
  const [state, setState] = useState<State>({ status: 'idle', rows: [] })

  const refresh = useCallback(async () => {
    setState((prev) => ({ status: 'loading', rows: prev.rows, error: undefined }))
    try {
      const trades = await getRecentTrades({ limit: 300, takerOnly: true })
      const rows = aggregate(trades).slice(0, 20)
      setState({ status: 'ready', rows })
    } catch (e) {
      const message = e instanceof Error ? e.message : '请求失败'
      setState((prev) => ({ status: prev.rows.length ? 'ready' : 'error', rows: prev.rows, error: message }))
    }
  }, [])

  return { ...state, refresh }
}
