import type { DataApiActivity, DataApiPosition, DataApiTrade } from './polymarketDataApi'

export type TraderSummary = {
  user: string
  tradeCount: number
  tradeVolumeUsd: number
  cashPnl: number
  percentPnl: number
  currentValue: number
  realizedPnl: number
  percentRealizedPnl: number
  avgTradeUsd: number
  lastTradeTs?: number
}

export function summarizeTrader(
  user: string,
  trades: DataApiTrade[],
  activities: DataApiActivity[],
  positions: DataApiPosition[],
): TraderSummary {
  const tradeActivities = activities.filter((a) => a.type === 'TRADE')
  const tradeCount = trades.length
  const tradeVolumeUsd = tradeActivities.reduce((acc, a) => acc + (a.usdcSize ?? 0), 0)

  const cashPnl = positions.reduce((acc, p) => acc + (p.cashPnl ?? 0), 0)
  const currentValue = positions.reduce((acc, p) => acc + (p.currentValue ?? 0), 0)
  const realizedPnl = positions.reduce((acc, p) => acc + (p.realizedPnl ?? 0), 0)

  const initialValue = positions.reduce((acc, p) => acc + (p.initialValue ?? 0), 0)
  const percentPnl = initialValue > 0 ? (cashPnl / initialValue) * 100 : 0
  const percentRealizedPnl = initialValue > 0 ? (realizedPnl / initialValue) * 100 : 0

  const lastTradeTs = trades.reduce<number | undefined>((acc, t) => {
    if (!t.timestamp) return acc
    if (acc === undefined) return t.timestamp
    return Math.max(acc, t.timestamp)
  }, undefined)

  const avgTradeUsd = tradeCount > 0 ? tradeVolumeUsd / tradeCount : 0

  return {
    user,
    tradeCount,
    tradeVolumeUsd,
    cashPnl,
    percentPnl,
    currentValue,
    realizedPnl,
    percentRealizedPnl,
    avgTradeUsd,
    lastTradeTs,
  }
}

export type HeatmapCell = { day: number; hour: number; value: number }

export function buildTradeTimeHeatmap(trades: DataApiTrade[]) {
  const counts: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const t of trades) {
    const date = new Date(t.timestamp * 1000)
    const day = date.getDay()
    const hour = date.getHours()
    counts[day][hour] += 1
  }
  const cells: HeatmapCell[] = []
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({ day, hour, value: counts[day][hour] })
    }
  }
  return cells
}

export type HoldingBin = {
  label: string
  count: number
}

type Lot = { ts: number; size: number }

function holdingBinsFromSeconds(seconds: number) {
  const hours = seconds / 3600
  if (hours <= 1) return '≤1h'
  if (hours <= 4) return '1–4h'
  if (hours <= 24) return '4–24h'
  if (hours <= 24 * 7) return '1–7d'
  return '>7d'
}

export function buildHoldingTimeDistribution(trades: DataApiTrade[]) {
  const buckets: Record<string, number> = {
    '≤1h': 0,
    '1–4h': 0,
    '4–24h': 0,
    '1–7d': 0,
    '>7d': 0,
  }

  const grouped = new Map<string, DataApiTrade[]>()
  for (const t of trades) {
    const key = `${t.conditionId}:${t.outcomeIndex ?? -1}`
    const list = grouped.get(key) ?? []
    list.push(t)
    grouped.set(key, list)
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp)
    const openLots: Lot[] = []
    for (const t of list) {
      if (t.side === 'BUY') {
        openLots.push({ ts: t.timestamp, size: t.size })
        continue
      }

      let remaining = t.size
      while (remaining > 0 && openLots.length > 0) {
        const lot = openLots[0]
        const matched = Math.min(remaining, lot.size)
        const seconds = Math.max(0, t.timestamp - lot.ts)
        const bin = holdingBinsFromSeconds(seconds)
        buckets[bin] += 1

        remaining -= matched
        lot.size -= matched
        if (lot.size <= 0) openLots.shift()
      }
    }
  }

  return (Object.keys(buckets) as Array<keyof typeof buckets>).map((label) => ({
    label,
    count: buckets[label],
  }))
}

export type EquityPoint = { ts: number; balanceUsd: number }

export function buildEquityCurveFromActivity(activities: DataApiActivity[]) {
  const tradeActivities = activities
    .filter((a) => a.type === 'TRADE' && a.usdcSize !== undefined && a.side)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)

  const points: EquityPoint[] = []
  let balance = 0
  for (const a of tradeActivities) {
    const delta = a.side === 'BUY' ? -(a.usdcSize ?? 0) : a.usdcSize ?? 0
    balance += delta
    points.push({ ts: a.timestamp, balanceUsd: balance })
  }
  return points
}

export type TraderProfile = {
  holdingPreference: '短线' | '中线' | '长线' | '未知'
  activeHours: number[]
  activityConcentration: number
  avgTradeUsd: number
  maxSingleTradeUsd: number
  tradeSizeCv: number
  p90TradeUsd: number
  topMarketConcentration: number
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[idx]
}

function coefficientOfVariation(values: number[]) {
  if (values.length < 2) return 0
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
  const stdev = Math.sqrt(variance)
  return stdev / Math.abs(mean)
}

export function inferTraderProfile(trades: DataApiTrade[], activities: DataApiActivity[]) {
  const holding = buildHoldingTimeDistribution(trades)
  const totalHoldingSamples = holding.reduce((acc, b) => acc + b.count, 0)
  const shortCount = (holding.find((b) => b.label === '≤1h')?.count ?? 0) + (holding.find((b) => b.label === '1–4h')?.count ?? 0)
  const longCount = (holding.find((b) => b.label === '1–7d')?.count ?? 0) + (holding.find((b) => b.label === '>7d')?.count ?? 0)

  let holdingPreference: TraderProfile['holdingPreference'] = '未知'
  if (totalHoldingSamples >= 10) {
    const shortRatio = shortCount / totalHoldingSamples
    const longRatio = longCount / totalHoldingSamples
    if (shortRatio >= 0.6) holdingPreference = '短线'
    else if (longRatio >= 0.6) holdingPreference = '长线'
    else holdingPreference = '中线'
  }

  const hourCounts = Array.from({ length: 24 }, () => 0)
  const tradeActivities = activities.filter((a) => a.type === 'TRADE' && a.timestamp)
  for (const a of tradeActivities) {
    const hour = new Date(a.timestamp * 1000).getHours()
    hourCounts[hour] += 1
  }
  const totalTrades = hourCounts.reduce((acc, v) => acc + v, 0)
  const activeHours = hourCounts
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((x) => x.count > 0)
    .map((x) => x.hour)

  const maxHour = hourCounts.reduce((acc, v) => Math.max(acc, v), 0)
  const activityConcentration = totalTrades > 0 ? maxHour / totalTrades : 0

  const tradeUsd = trades.map((t) => (t.size ?? 0) * (t.price ?? 0))
  const totalUsd = tradeUsd.reduce((acc, v) => acc + v, 0)
  const avgTradeUsd = trades.length > 0 ? totalUsd / trades.length : 0
  const maxSingleTradeUsd = tradeUsd.reduce((acc, v) => Math.max(acc, v), 0)
  const p90TradeUsd = percentile(tradeUsd, 0.9)
  const tradeSizeCv = coefficientOfVariation(tradeUsd)

  const marketCounts = new Map<string, number>()
  for (const t of trades) {
    marketCounts.set(t.conditionId, (marketCounts.get(t.conditionId) ?? 0) + 1)
  }
  const topMarketCount = Array.from(marketCounts.values()).reduce((acc, v) => Math.max(acc, v), 0)
  const topMarketConcentration = trades.length > 0 ? topMarketCount / trades.length : 0

  return {
    holdingPreference,
    activeHours,
    activityConcentration,
    avgTradeUsd,
    maxSingleTradeUsd,
    tradeSizeCv,
    p90TradeUsd,
    topMarketConcentration,
  } satisfies TraderProfile
}
