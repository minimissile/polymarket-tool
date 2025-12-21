import type { DataApiTrade } from './polymarketDataApi'

const SCALE = 10_000n

export type CopyTradeSimOptions = {
  initialCapitalUsd?: number
  followRatio?: number
  followNotionalUsd?: number
  startTs?: number
  endTs?: number
  allowPartialFills?: boolean
}

export type CopyTradeRealized = {
  ts: number
  key: string
  title?: string
  slug?: string
  outcome?: string
  side: 'SELL'
  qty: number
  entryPrice: number
  exitPrice: number
  pnlUsd: number
}

export type CopyTradeEquityPoint = {
  ts: number
  equityUsd: number
  cashUsd: number
}

export type CopyTradeMarketPnlRow = {
  key: string
  title?: string
  slug?: string
  outcome?: string
  realizedPnlUsd: number
  realizedCount: number
  winCount: number
}

export type CopyTradeDayNightStats = {
  label: 'day' | 'night'
  realizedPnlUsd: number
  realizedCount: number
  winRate: number
}

export type CopyTradeHeatmapCell = { day: number; hour: number; value: number }

export type CopyTradeSimResult = {
  meta: {
    initialCapitalUsd: number
    followMode: 'ratio' | 'fixed'
    followRatio: number
    followNotionalUsd?: number
    startTs?: number
    endTs?: number
    inputTradeCount: number
    usedTradeCount: number
    skippedTradeCount: number
    partialFillCount: number
  }
  summary: {
    finalEquityUsd: number
    pnlUsd: number
    pnlPct: number
    winRate: number
    maxSingleWinUsd: number
    maxSingleLossUsd: number
    maxDrawdownPct: number
    sharpeRatio: number
  }
  equity: CopyTradeEquityPoint[]
  realized: CopyTradeRealized[]
  pnlByMarket: CopyTradeMarketPnlRow[]
  dayNight: CopyTradeDayNightStats[]
  pnlHeatmap: CopyTradeHeatmapCell[]
  skippedTradeReasons: string[]
}

type PositionState = {
  qty: bigint
  avgPrice: bigint
  lastPrice: bigint
  title?: string
  slug?: string
  outcome?: string
}

function clampFinite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function toScaled(value: number) {
  const v = clampFinite(value, 0)
  return BigInt(Math.round(v * 10_000))
}

function toNumber(value: bigint) {
  return Number(value) / 10_000
}

function mulDiv(a: bigint, b: bigint, div: bigint) {
  return (a * b) / div
}

function safeDivNumber(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0
  return n / d
}

function marketKey(t: Pick<DataApiTrade, 'conditionId' | 'asset' | 'outcomeIndex'>) {
  return `${t.conditionId}:${t.asset}:${t.outcomeIndex ?? ''}`
}

function isWithinRange(ts: number, startTs?: number, endTs?: number) {
  if (startTs !== undefined && ts < startTs) return false
  if (endTs !== undefined && ts > endTs) return false
  return true
}

export function simulateCopyTrades(trades: DataApiTrade[], options?: CopyTradeSimOptions): CopyTradeSimResult {
  const initialCapitalUsd = clampFinite(options?.initialCapitalUsd ?? 10_000, 10_000)
  const followRatio = clampFinite(options?.followRatio ?? 1, 1)
  const followNotionalUsd = clampFinite(options?.followNotionalUsd ?? 0, 0)
  const followMode: 'ratio' | 'fixed' = options?.followNotionalUsd === undefined ? 'ratio' : 'fixed'
  const startTs = options?.startTs
  const endTs = options?.endTs
  const allowPartialFills = options?.allowPartialFills ?? true

  const normalizedTrades = trades
    .filter((t) => isWithinRange(t.timestamp, startTs, endTs))
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)

  let cash = toScaled(initialCapitalUsd)
  const positions = new Map<string, PositionState>()
  const markedValueByKey = new Map<string, bigint>()
  let markedSum = 0n
  const realized: CopyTradeRealized[] = []
  const equity: { ts: number; equity: bigint; cash: bigint }[] = []

  let skippedTradeCount = 0
  let partialFillCount = 0
  const skippedTradeReasons: string[] = []

  const pushSkip = (reason: string) => {
    if (skippedTradeReasons.length >= 200) return
    skippedTradeReasons.push(reason)
  }

  const pushEquity = (ts: number) => {
    equity.push({ ts, equity: cash + markedSum, cash })
  }

  const fixedNotional = followMode === 'fixed' ? toScaled(followNotionalUsd) : 0n

  /** 计算“本次跟随”目标数量：支持按比例或按固定金额两种模式。 */
  const desiredQtyAbs = (t: DataApiTrade, price: bigint) => {
    if (followMode === 'fixed') return mulDiv(fixedNotional, SCALE, price)
    return toScaled(t.size * followRatio)
  }

  for (const t of normalizedTrades) {
    const key = marketKey(t)
    const price = toScaled(t.price)
    const rawQty = desiredQtyAbs(t, price)
    if (rawQty <= 0n || price <= 0n) continue

    const state =
      positions.get(key) ?? { qty: 0n, avgPrice: 0n, lastPrice: 0n, title: t.title, slug: t.slug, outcome: t.outcome }
    state.lastPrice = price
    state.title = state.title ?? t.title
    state.slug = state.slug ?? t.slug
    state.outcome = state.outcome ?? t.outcome

    if (t.side === 'BUY') {
      const qtyAbs = rawQty
      let notional = mulDiv(price, qtyAbs, SCALE)
      if (notional > cash) {
        if (!allowPartialFills) {
          skippedTradeCount += 1
          pushSkip(
            `${formatTs(t.timestamp)} BUY 资金不足：${state.title ?? state.slug ?? key} 需要${toNumber(notional)} 可用${toNumber(cash)}`,
          )
          positions.set(key, state)
          const prevMarked = markedValueByKey.get(key) ?? 0n
          const nextMarked = mulDiv(state.lastPrice || state.avgPrice, state.qty, SCALE)
          markedValueByKey.set(key, nextMarked)
          markedSum += nextMarked - prevMarked
          pushEquity(t.timestamp)
          continue
        }
        const maxQtyAbs = mulDiv(cash, SCALE, price)
        if (maxQtyAbs <= 0n) {
          skippedTradeCount += 1
          pushSkip(
            `${formatTs(t.timestamp)} BUY 资金不足：${state.title ?? state.slug ?? key} 可买数量为0（可用${toNumber(cash)}）`,
          )
          positions.set(key, state)
          const prevMarked = markedValueByKey.get(key) ?? 0n
          const nextMarked = mulDiv(state.lastPrice || state.avgPrice, state.qty, SCALE)
          markedValueByKey.set(key, nextMarked)
          markedSum += nextMarked - prevMarked
          pushEquity(t.timestamp)
          continue
        }
        partialFillCount += 1
        notional = cash
        const nextQty = state.qty + maxQtyAbs
        if (nextQty > 0n) {
          const nextAvg = state.qty === 0n ? price : mulDiv(state.avgPrice * state.qty + price * maxQtyAbs, 1n, nextQty)
          state.qty = nextQty
          state.avgPrice = nextAvg
        }
        cash -= notional
        positions.set(key, state)
        const prevMarked = markedValueByKey.get(key) ?? 0n
        const nextMarked = mulDiv(state.lastPrice || state.avgPrice, state.qty, SCALE)
        markedValueByKey.set(key, nextMarked)
        markedSum += nextMarked - prevMarked
        pushEquity(t.timestamp)
        continue
      }

      const nextQty = state.qty + qtyAbs
      const nextAvg = state.qty === 0n ? price : mulDiv(state.avgPrice * state.qty + price * qtyAbs, 1n, nextQty)
      state.qty = nextQty
      state.avgPrice = nextAvg
      cash -= notional
      positions.set(key, state)
      const prevMarked = markedValueByKey.get(key) ?? 0n
      const nextMarked = mulDiv(state.lastPrice || state.avgPrice, state.qty, SCALE)
      markedValueByKey.set(key, nextMarked)
      markedSum += nextMarked - prevMarked
      pushEquity(t.timestamp)
      continue
    }

    if (t.side === 'SELL') {
      if (state.qty <= 0n) {
        skippedTradeCount += 1
        pushSkip(`${formatTs(t.timestamp)} SELL 无可卖仓位：${state.title ?? state.slug ?? key}`)
        positions.set(key, state)
        const prevMarked = markedValueByKey.get(key) ?? 0n
        const nextMarked = mulDiv(state.lastPrice || state.avgPrice, state.qty, SCALE)
        markedValueByKey.set(key, nextMarked)
        markedSum += nextMarked - prevMarked
        pushEquity(t.timestamp)
        continue
      }

      const qtyAbs = rawQty
      const sellQty = qtyAbs > state.qty ? state.qty : qtyAbs
      if (sellQty <= 0n) {
        skippedTradeCount += 1
        pushSkip(`${formatTs(t.timestamp)} SELL 数量为0：${state.title ?? state.slug ?? key}`)
        positions.set(key, state)
        const prevMarked = markedValueByKey.get(key) ?? 0n
        const nextMarked = mulDiv(state.lastPrice || state.avgPrice, state.qty, SCALE)
        markedValueByKey.set(key, nextMarked)
        markedSum += nextMarked - prevMarked
        pushEquity(t.timestamp)
        continue
      }
      if (sellQty !== qtyAbs) partialFillCount += 1

      const notional = mulDiv(price, sellQty, SCALE)
      cash += notional

      const pnl = mulDiv(price - state.avgPrice, sellQty, SCALE)
      realized.push({
        ts: t.timestamp,
        key,
        title: state.title,
        slug: state.slug,
        outcome: state.outcome,
        side: 'SELL',
        qty: toNumber(sellQty),
        entryPrice: toNumber(state.avgPrice),
        exitPrice: toNumber(price),
        pnlUsd: toNumber(pnl),
      })

      state.qty -= sellQty
      if (state.qty === 0n) state.avgPrice = 0n
      positions.set(key, state)
      const prevMarked = markedValueByKey.get(key) ?? 0n
      const nextMarked = mulDiv(state.lastPrice || state.avgPrice, state.qty, SCALE)
      markedValueByKey.set(key, nextMarked)
      markedSum += nextMarked - prevMarked
      pushEquity(t.timestamp)
      continue
    }
  }

  if (equity.length === 0) pushEquity(startTs ?? endTs ?? Math.floor(Date.now() / 1000))

  const initialScaled = toScaled(initialCapitalUsd)
  const finalScaled = equity[equity.length - 1]?.equity ?? initialScaled
  const pnlScaled = finalScaled - initialScaled

  let winCount = 0
  let maxWin = 0
  let maxLoss = 0
  for (const r of realized) {
    if (r.pnlUsd > 0) winCount += 1
    maxWin = Math.max(maxWin, r.pnlUsd)
    maxLoss = Math.min(maxLoss, r.pnlUsd)
  }

  const pnlUsd = toNumber(pnlScaled)
  const pnlPct = safeDivNumber(pnlUsd, initialCapitalUsd) * 100

  let peak = equity[0]?.equity ?? initialScaled
  let maxDd = 0
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity
    const dd = peak === 0n ? 0 : safeDivNumber(toNumber(peak - p.equity), toNumber(peak)) * 100
    if (dd > maxDd) maxDd = dd
  }

  const returns: number[] = []
  for (let i = 1; i < equity.length; i++) {
    const prev = toNumber(equity[i - 1].equity)
    const next = toNumber(equity[i].equity)
    returns.push(prev === 0 ? 0 : (next - prev) / prev)
  }
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const variance =
    returns.length > 1 ? returns.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) / (returns.length - 1) : 0
  const std = Math.sqrt(Math.max(0, variance))
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(returns.length)

  const pnlByMarketMap = new Map<string, CopyTradeMarketPnlRow>()
  for (const r of realized) {
    const row = pnlByMarketMap.get(r.key) ?? {
      key: r.key,
      title: r.title,
      slug: r.slug,
      outcome: r.outcome,
      realizedPnlUsd: 0,
      realizedCount: 0,
      winCount: 0,
    }
    row.realizedPnlUsd += r.pnlUsd
    row.realizedCount += 1
    if (r.pnlUsd > 0) row.winCount += 1
    row.title = row.title ?? r.title
    row.slug = row.slug ?? r.slug
    row.outcome = row.outcome ?? r.outcome
    pnlByMarketMap.set(r.key, row)
  }
  const pnlByMarket = Array.from(pnlByMarketMap.values()).sort((a, b) => b.realizedPnlUsd - a.realizedPnlUsd)

  const dayNightBuckets: Record<'day' | 'night', { pnl: number; count: number; wins: number }> = {
    day: { pnl: 0, count: 0, wins: 0 },
    night: { pnl: 0, count: 0, wins: 0 },
  }
  for (const r of realized) {
    const d = new Date(r.ts * 1000)
    const hour = d.getHours()
    const label: 'day' | 'night' = hour >= 8 && hour < 20 ? 'day' : 'night'
    dayNightBuckets[label].pnl += r.pnlUsd
    dayNightBuckets[label].count += 1
    if (r.pnlUsd > 0) dayNightBuckets[label].wins += 1
  }
  const dayNight: CopyTradeDayNightStats[] = (['day', 'night'] as const).map((label) => {
    const b = dayNightBuckets[label]
    const winRate = b.count ? b.wins / b.count : 0
    return { label, realizedPnlUsd: b.pnl, realizedCount: b.count, winRate }
  })

  const heatPnl: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const r of realized) {
    const d = new Date(r.ts * 1000)
    const day = d.getDay()
    const hour = d.getHours()
    heatPnl[day][hour] += r.pnlUsd
  }
  const pnlHeatmap: CopyTradeHeatmapCell[] = []
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      pnlHeatmap.push({ day, hour, value: heatPnl[day][hour] })
    }
  }

  const metaStart = startTs
  const metaEnd = endTs

  return {
    meta: {
      initialCapitalUsd,
      followMode,
      followRatio,
      followNotionalUsd: followMode === 'fixed' ? followNotionalUsd : undefined,
      startTs: metaStart,
      endTs: metaEnd,
      inputTradeCount: trades.length,
      usedTradeCount: normalizedTrades.length,
      skippedTradeCount,
      partialFillCount,
    },
    summary: {
      finalEquityUsd: toNumber(finalScaled),
      pnlUsd,
      pnlPct,
      winRate: realized.length ? winCount / realized.length : 0,
      maxSingleWinUsd: maxWin,
      maxSingleLossUsd: maxLoss,
      maxDrawdownPct: maxDd,
      sharpeRatio: sharpe,
    },
    equity: equity.map((p) => ({ ts: p.ts, equityUsd: toNumber(p.equity), cashUsd: toNumber(p.cash) })),
    realized,
    pnlByMarket,
    dayNight,
    pnlHeatmap,
    skippedTradeReasons,
  }
}

/** 把秒级时间戳格式化为本地可读字符串，用于跳过原因与调试展示。 */
function formatTs(tsSec: number) {
  const d = new Date(tsSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds(),
  )}`
}
