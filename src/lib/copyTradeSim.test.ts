import assert from 'node:assert/strict'
import test from 'node:test'
import type { DataApiTrade } from './polymarketDataApi'
import { simulateCopyTrades } from './copyTradeSim'

function makeTrade(partial: Partial<DataApiTrade>): DataApiTrade {
  return {
    proxyWallet: '0x0000000000000000000000000000000000000000',
    side: 'BUY',
    asset: 'asset',
    conditionId: 'condition',
    size: 1,
    price: 0.5,
    timestamp: 1_700_000_000,
    ...partial,
  }
}

function approxEqual(a: number, b: number, eps = 1e-9) {
  assert.ok(Number.isFinite(a) && Number.isFinite(b), `expected finite numbers, got ${a} and ${b}`)
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`)
}

test('simulateCopyTrades: basic buy then sell realizes pnl', () => {
  const trades: DataApiTrade[] = [
    makeTrade({ side: 'BUY', price: 0.4, size: 100, timestamp: 1 }),
    makeTrade({ side: 'SELL', price: 0.6, size: 100, timestamp: 2 }),
  ]
  const sim = simulateCopyTrades(trades, { initialCapitalUsd: 10_000, followRatio: 1, allowPartialFills: true })

  approxEqual(sim.summary.pnlUsd, 20)
  approxEqual(sim.summary.finalEquityUsd, 10_020)
  assert.equal(sim.meta.skippedTradeCount, 0)
  assert.equal(sim.realized.length, 1)
})

test('simulateCopyTrades: allowPartialFills buys max affordable and sells available qty', () => {
  const trades: DataApiTrade[] = [
    makeTrade({ side: 'BUY', price: 0.4, size: 100, timestamp: 1 }),
    makeTrade({ side: 'SELL', price: 0.5, size: 100, timestamp: 2 }),
  ]
  const sim = simulateCopyTrades(trades, { initialCapitalUsd: 10, followRatio: 1, allowPartialFills: true })

  approxEqual(sim.summary.pnlUsd, 2.5)
  approxEqual(sim.summary.finalEquityUsd, 12.5)
  assert.equal(sim.meta.skippedTradeCount, 0)
  assert.equal(sim.meta.partialFillCount, 2)
  assert.equal(sim.realized.length, 1)
})

test('simulateCopyTrades: disallow partial fills skips insufficient-cash buy', () => {
  const trades: DataApiTrade[] = [makeTrade({ side: 'BUY', price: 0.4, size: 100, timestamp: 1 })]
  const sim = simulateCopyTrades(trades, { initialCapitalUsd: 10, followRatio: 1, allowPartialFills: false })

  approxEqual(sim.summary.pnlUsd, 0)
  approxEqual(sim.summary.finalEquityUsd, 10)
  assert.equal(sim.meta.skippedTradeCount, 1)
  assert.ok(sim.skippedTradeReasons.length >= 1)
})

test('simulateCopyTrades: sell without position is skipped', () => {
  const trades: DataApiTrade[] = [makeTrade({ side: 'SELL', price: 0.6, size: 100, timestamp: 1 })]
  const sim = simulateCopyTrades(trades, { initialCapitalUsd: 100, followRatio: 1, allowPartialFills: true })

  approxEqual(sim.summary.pnlUsd, 0)
  approxEqual(sim.summary.finalEquityUsd, 100)
  assert.equal(sim.meta.skippedTradeCount, 1)
  assert.ok(sim.skippedTradeReasons.some((r) => r.includes('SELL')))
})

test('simulateCopyTrades: fixed notional mode buys and sells by dollars', () => {
  const trades: DataApiTrade[] = [
    makeTrade({ side: 'BUY', price: 0.5, size: 9999, timestamp: 1 }),
    makeTrade({ side: 'SELL', price: 0.6, size: 9999, timestamp: 2 }),
  ]
  const sim = simulateCopyTrades(trades, { initialCapitalUsd: 1000, followNotionalUsd: 100, allowPartialFills: true })

  approxEqual(sim.summary.pnlUsd, 20)
  approxEqual(sim.summary.finalEquityUsd, 1020)
  assert.equal(sim.meta.followMode, 'fixed')
})
