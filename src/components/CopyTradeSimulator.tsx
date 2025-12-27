import { useEffect, useMemo, useState } from 'react'
import type { DataApiActivity, DataApiTrade } from '../lib/polymarketDataApi'
import { buildEquityCurveFromActivity } from '../lib/analytics'
import { formatDateTime, formatNumber, formatPercent, formatUsd } from '../lib/format'
import { readJson, writeJson } from '../lib/storage'
import { simulateCopyTrades, type CopyTradeSimResult } from '../lib/copyTradeSim'
import { ChartCard } from './ChartCard'
import { EChart } from './EChart'

const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatUsdPrecise(value: number) {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${sign}$${formatNumber(abs, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

function formatPercentPrecise(value: number) {
  return `${formatNumber(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`
}

/** 计算交易金额（USDC）：数量 * 价格，并对异常输入做兜底。 */
function calcNotionalUsd(qty: number, price: number) {
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0
  return qty * price
}

function toDatetimeLocalValue(tsSec: number) {
  const d = new Date(tsSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseDatetimeLocalValue(value: string) {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return undefined
  return Math.floor(ms / 1000)
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;'
    if (ch === '<') return '&lt;'
    if (ch === '>') return '&gt;'
    if (ch === '"') return '&quot;'
    return '&#39;'
  })
}

function downloadTextFile(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCsv(rows: Record<string, string | number>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  return lines.join('\n')
}

function buildSimReportHtml(user: string, sim: CopyTradeSimResult) {
  const rows = [
    ['起始资金', formatUsdPrecise(sim.meta.initialCapitalUsd)],
    [
      '跟单方式',
      sim.meta.followMode === 'fixed' ? `固定金额（每笔 ${formatUsdPrecise(sim.meta.followNotionalUsd ?? 0)}）` : '按比例',
    ],
    ['跟单比例', sim.meta.followMode === 'ratio' ? `${formatNumber(sim.meta.followRatio * 100, { maximumFractionDigits: 4 })}%` : '-'],
    ['最终权益', formatUsdPrecise(sim.summary.finalEquityUsd)],
    ['累计盈亏', `${formatUsdPrecise(sim.summary.pnlUsd)} (${formatPercentPrecise(sim.summary.pnlPct)})`],
    ['胜率', formatPercentPrecise(sim.summary.winRate * 100)],
    ['最大单笔盈利', formatUsdPrecise(sim.summary.maxSingleWinUsd)],
    ['最大单笔亏损', formatUsdPrecise(sim.summary.maxSingleLossUsd)],
    ['最大回撤', formatPercentPrecise(sim.summary.maxDrawdownPct)],
    ['Sharpe Ratio', formatNumber(sim.summary.sharpeRatio, { maximumFractionDigits: 4 })],
    ['使用交易数', sim.meta.usedTradeCount],
    ['跳过交易数', sim.meta.skippedTradeCount],
    ['部分成交数', sim.meta.partialFillCount],
  ]

  const topMarkets = sim.pnlByMarket.slice(0, 20).map((m) => {
    const name = m.title ?? m.slug ?? m.key
    return `<tr><td>${escapeHtml(name)}</td><td style="text-align:right">${escapeHtml(
      formatUsdPrecise(m.realizedPnlUsd),
    )}</td><td style="text-align:right">${m.realizedCount}</td><td style="text-align:right">${escapeHtml(
      formatPercentPrecise((m.winCount / Math.max(1, m.realizedCount)) * 100),
    )}</td></tr>`
  })

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>跟单分析报告</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; color: #0f172a; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      .muted { color: #64748b; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; }
      th { background: #f1f5f9; text-align: left; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
      .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
      .k { color: #64748b; font-size: 12px; }
      .v { font-size: 14px; font-weight: 600; margin-top: 4px; }
      @media print { body { padding: 0; } .no-print { display: none; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom: 16px;">
      <button onclick="window.print()" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; cursor: pointer;">打印 / 保存为 PDF</button>
    </div>
    <h1>跟单分析报告</h1>
    <div class="muted">交易员：${escapeHtml(user)} · 生成时间：${escapeHtml(new Date().toLocaleString())}</div>
    <div class="grid">
      ${rows
        .map(
          ([k, v]) =>
            `<div class="card"><div class="k">${escapeHtml(String(k))}</div><div class="v">${escapeHtml(
              String(v),
            )}</div></div>`,
        )
        .join('')}
    </div>
    <h2 style="margin-top: 22px; font-size: 16px;">品种盈亏（Top 20）</h2>
    <table>
      <thead><tr><th>市场</th><th style="text-align:right">已实现盈亏</th><th style="text-align:right">笔数</th><th style="text-align:right">胜率</th></tr></thead>
      <tbody>
        ${topMarkets.join('')}
      </tbody>
    </table>
  </body>
</html>`
}

function buildEmptySimResult(args: {
  initialCapitalUsd: number
  followMode: 'ratio' | 'fixed'
  followRatio: number
  followNotionalUsd?: number
  startTs?: number
  endTs?: number
  inputTradeCount: number
}) {
  const ts = args.endTs ?? args.startTs ?? Math.floor(Date.now() / 1000)
  return {
    meta: {
      initialCapitalUsd: args.initialCapitalUsd,
      followMode: args.followMode,
      followRatio: args.followRatio,
      followNotionalUsd: args.followMode === 'fixed' ? (args.followNotionalUsd ?? 0) : undefined,
      startTs: args.startTs,
      endTs: args.endTs,
      inputTradeCount: args.inputTradeCount,
      usedTradeCount: 0,
      skippedTradeCount: 0,
      partialFillCount: 0,
    },
    summary: {
      finalEquityUsd: args.initialCapitalUsd,
      pnlUsd: 0,
      pnlPct: 0,
      winRate: 0,
      maxSingleWinUsd: 0,
      maxSingleLossUsd: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
    },
    equity: [{ ts, equityUsd: args.initialCapitalUsd, cashUsd: args.initialCapitalUsd }],
    realized: [],
    pnlByMarket: [],
    dayNight: [
      { label: 'day', realizedPnlUsd: 0, realizedCount: 0, winRate: 0 },
      { label: 'night', realizedPnlUsd: 0, realizedCount: 0, winRate: 0 },
    ],
    pnlHeatmap: dayLabels.flatMap((_, day) => Array.from({ length: 24 }, (_, hour) => ({ day, hour, value: 0 }))),
    skippedTradeReasons: [],
  } satisfies CopyTradeSimResult
}

/** 从本地存储读取跟单比例：兼容旧值（0-5 视为倍数，如 1 -> 100%）。 */
function readFollowPercent(key: string) {
  const raw = readJson<number>(key, 100)
  if (!Number.isFinite(raw)) return 100
  if (raw >= 0 && raw <= 5) return raw * 100
  return raw
}

/** 归一化本地存储的模式字段，避免异常值导致 UI 崩溃。 */
function normalizeMode(value: unknown, fallback: 'backtest' | 'live') {
  if (value === 'backtest' || value === 'live') return value
  return fallback
}

/** 归一化本地存储的跟单方式字段，避免异常值导致 UI 崩溃。 */
function normalizeFollowMode(value: unknown, fallback: 'ratio' | 'fixed') {
  if (value === 'ratio' || value === 'fixed') return value
  return fallback
}

export function CopyTradeSimulator(props: {
  user: string
  trades: DataApiTrade[]
  activity: DataApiActivity[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
}) {
  const settingsKey = useMemo(() => `pmta.copySim.settings.${props.user.toLowerCase()}`, [props.user])

  const latestTradeTs = useMemo(() => props.trades.reduce((acc, t) => Math.max(acc, t.timestamp), 0), [props.trades])
  const defaultStartTs = useMemo(() => {
    if (!latestTradeTs) return undefined
    return Math.max(0, latestTradeTs - 30 * 24 * 3600)
  }, [latestTradeTs])

  const [initialCapitalUsd, setInitialCapitalUsd] = useState(() => readJson<number>(`${settingsKey}.capital`, 10_000))
  const [followMode, setFollowMode] = useState<'ratio' | 'fixed'>(() =>
    normalizeFollowMode(readJson(`${settingsKey}.followMode`, 'ratio'), 'ratio'),
  )
  const [followPercent, setFollowPercent] = useState(() => readFollowPercent(`${settingsKey}.ratio`))
  const [followNotionalUsd, setFollowNotionalUsd] = useState(() => readJson<number>(`${settingsKey}.notionalUsd`, 100))
  const [runMode, setRunMode] = useState<'backtest' | 'live'>(() =>
    normalizeMode(readJson(`${settingsKey}.runMode`, 'backtest'), 'backtest'),
  )
  const [liveStartTs, setLiveStartTs] = useState<number | undefined>(() => readJson<number | null>(`${settingsKey}.liveStartTs`, null) ?? undefined)
  const [startTs, setStartTs] = useState<number | undefined>(() => readJson<number | null>(`${settingsKey}.startTs`, defaultStartTs ?? null) ?? undefined)
  const [endTs, setEndTs] = useState<number | undefined>(() => readJson<number | null>(`${settingsKey}.endTs`, null) ?? undefined)
  const [allowPartialFills, setAllowPartialFills] = useState(() => readJson<boolean>(`${settingsKey}.partial`, true))

  useEffect(() => {
    writeJson(`${settingsKey}.capital`, clampNumber(initialCapitalUsd, 0, 1_000_000_000, 10_000) as never)
  }, [initialCapitalUsd, settingsKey])
  useEffect(() => {
    writeJson(`${settingsKey}.followMode`, followMode as never)
  }, [followMode, settingsKey])
  useEffect(() => {
    writeJson(`${settingsKey}.ratio`, clampNumber(followPercent, 0, 1000, 100) as never)
  }, [followPercent, settingsKey])
  useEffect(() => {
    writeJson(`${settingsKey}.notionalUsd`, clampNumber(followNotionalUsd, 0, 1_000_000_000, 100) as never)
  }, [followNotionalUsd, settingsKey])
  useEffect(() => {
    writeJson(`${settingsKey}.runMode`, runMode as never)
  }, [runMode, settingsKey])
  useEffect(() => {
    writeJson(`${settingsKey}.liveStartTs`, (liveStartTs ?? null) as never)
  }, [liveStartTs, settingsKey])
  useEffect(() => {
    writeJson(`${settingsKey}.startTs`, (startTs ?? null) as never)
  }, [settingsKey, startTs])
  useEffect(() => {
    writeJson(`${settingsKey}.endTs`, (endTs ?? null) as never)
  }, [endTs, settingsKey])
  useEffect(() => {
    writeJson(`${settingsKey}.partial`, allowPartialFills as never)
  }, [allowPartialFills, settingsKey])

  useEffect(() => {
    if (startTs !== undefined) return
    if (defaultStartTs === undefined) return
    const id = window.setTimeout(() => setStartTs(defaultStartTs), 0)
    return () => window.clearTimeout(id)
  }, [defaultStartTs, startTs])

  const followRatio = useMemo(() => clampNumber(followPercent, 0, 1000, 100) / 100, [followPercent])
  const effectiveStartTs = useMemo(() => {
    if (runMode !== 'live') return startTs
    if (liveStartTs) return liveStartTs
    if (latestTradeTs) return latestTradeTs + 1
    return Number.MAX_SAFE_INTEGER
  }, [latestTradeTs, liveStartTs, runMode, startTs])
  const effectiveEndTs = useMemo(() => (runMode === 'live' ? undefined : endTs), [endTs, runMode])

  /** 快速切换历史回测窗口：基于最新成交时间向前回溯。 */
  const setBacktestRangeDays = (days: number) => {
    if (!latestTradeTs) return
    setRunMode('backtest')
    setLiveStartTs(undefined)
    setStartTs(Math.max(0, latestTradeTs - days * 24 * 3600))
    setEndTs(undefined)
  }

  /** 以“点击时刻”为起点开启实时跟单。 */
  const startLive = () => {
    const now = Math.floor(Date.now() / 1000)
    setRunMode('live')
    setLiveStartTs(now)
    setEndTs(undefined)
  }

  /** 停止实时跟单：清空起点时间戳并回到历史回测模式。 */
  const stopLive = () => {
    setLiveStartTs(undefined)
    setRunMode('backtest')
  }

  const cacheKey = useMemo(() => {
    const normalized = props.user.toLowerCase()
    return `pmta.copySim.cache.${normalized}.${JSON.stringify({
      v: 2,
      initialCapitalUsd: clampNumber(initialCapitalUsd, 0, 1_000_000_000, 10_000),
      followMode,
      followRatio,
      followNotionalUsd: clampNumber(followNotionalUsd, 0, 1_000_000_000, 100),
      runMode,
      liveStartTs: liveStartTs ?? null,
      startTs: effectiveStartTs ?? null,
      endTs: effectiveEndTs ?? null,
      allowPartialFills,
      tradeCount: props.trades.length,
      latestTradeTs,
    })}`
  }, [
    allowPartialFills,
    effectiveEndTs,
    effectiveStartTs,
    followMode,
    followNotionalUsd,
    followRatio,
    initialCapitalUsd,
    latestTradeTs,
    liveStartTs,
    props.trades.length,
    props.user,
    runMode,
  ])

  const cached = useMemo(() => readJson<CopyTradeSimResult | null>(cacheKey, null), [cacheKey])

  const simCalc = useMemo(() => {
    if (cached) return { sim: cached, computed: null as CopyTradeSimResult | null, error: null as string | null }
    try {
      const computed = simulateCopyTrades(props.trades, {
        initialCapitalUsd,
        followRatio,
        followNotionalUsd: followMode === 'fixed' ? followNotionalUsd : undefined,
        startTs: effectiveStartTs,
        endTs: effectiveEndTs,
        allowPartialFills,
      })
      return { sim: computed, computed, error: null as string | null }
    } catch (e) {
      const sim = buildEmptySimResult({
        initialCapitalUsd,
        followMode,
        followRatio,
        followNotionalUsd: followMode === 'fixed' ? followNotionalUsd : undefined,
        startTs: effectiveStartTs,
        endTs: effectiveEndTs,
        inputTradeCount: props.trades.length,
      })
      return { sim, computed: null as CopyTradeSimResult | null, error: e instanceof Error ? e.message : '模拟失败' }
    }
  }, [allowPartialFills, cached, effectiveEndTs, effectiveStartTs, followMode, followNotionalUsd, followRatio, initialCapitalUsd, props.trades])

  useEffect(() => {
    if (cached) return
    if (!simCalc.computed) return
    writeJson(cacheKey, simCalc.computed as never)
  }, [cacheKey, cached, simCalc.computed])

  const sim = simCalc.sim

  const traderCurve = useMemo(() => buildEquityCurveFromActivity(props.activity), [props.activity])

  const curveOption = useMemo(() => {
    const liveStartMs = liveStartTs ? liveStartTs * 1000 : undefined
    const simSeries = sim.equity
      .map((p) => [p.ts * 1000, p.equityUsd] as [number, number])
      .filter((p) => (liveStartMs ? p[0] >= liveStartMs : true))
    const traderSeries = traderCurve
      .map((p) => [p.ts * 1000, p.balanceUsd] as [number, number])
      .filter((p) => (liveStartMs ? p[0] >= liveStartMs : true))
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['跟单权益(含持仓估值)', '交易员净现金流(近似)'] },
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
      xAxis: { type: 'time', min: liveStartMs },
      yAxis: { type: 'value' },
      series: [
        { name: '跟单权益(含持仓估值)', type: 'line', showSymbol: false, data: simSeries, smooth: true },
        { name: '交易员净现金流(近似)', type: 'line', showSymbol: false, data: traderSeries, smooth: true },
      ],
    }
  }, [liveStartTs, sim.equity, traderCurve])

  const heatmapOption = useMemo(() => {
    const values = sim.pnlHeatmap.map((c) => ({ value: [c.hour, c.day, Math.abs(c.value)] as [number, number, number], raw: c.value }))
    let max = 0
    for (const c of sim.pnlHeatmap) max = Math.max(max, Math.abs(c.value))
    if (max === 0) max = 1
    return {
      tooltip: {
        formatter: (p: { data?: { raw?: number; value?: [number, number, number] } }) => {
          const v = p.data?.value ?? [0, 0, 0]
          const [hour, day] = v
          const raw = p.data?.raw ?? 0
          return `${dayLabels[day]} ${hour}:00<br/>盈亏：${formatUsdPrecise(raw)}`
        },
      },
      grid: { left: 60, right: 20, top: 40, bottom: 50 },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, i) => String(i)), name: '小时' },
      yAxis: { type: 'category', data: dayLabels, name: '星期' },
      visualMap: {
        max,
        min: 0,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 10,
        inRange: { color: ['#ffffff', '#2563eb'] },
      },
      series: [{ type: 'heatmap', data: values }],
    }
  }, [sim.pnlHeatmap])

  const marketPnlOption = useMemo(() => {
    const top = sim.pnlByMarket.slice(0, 12)
    const labels = top.map((m) => m.title ?? m.slug ?? m.key)
    const values = top.map((m) => m.realizedPnlUsd)
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 60, right: 20, top: 30, bottom: 100 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 40 } },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: values,
          itemStyle: { color: '#3b82f6' },
        },
      ],
    }
  }, [sim.pnlByMarket])

  const gaugeOption = useMemo(() => {
    const pnlPct = sim.summary.pnlPct
    const ddPct = sim.summary.maxDrawdownPct
    return {
      series: [
        {
          type: 'gauge',
          center: ['25%', '55%'],
          radius: '70%',
          min: -100,
          max: 100,
          splitNumber: 4,
          progress: { show: true, width: 10 },
          axisLine: { lineStyle: { width: 10 } },
          axisTick: { show: false },
          splitLine: { length: 10 },
          axisLabel: { fontSize: 10 },
          title: { fontSize: 12, offsetCenter: [0, '90%'] },
          detail: { fontSize: 14, formatter: (v: number) => `${formatNumber(v, { maximumFractionDigits: 2 })}%` },
          data: [{ value: pnlPct, name: '累计盈亏%' }],
        },
        {
          type: 'gauge',
          center: ['75%', '55%'],
          radius: '70%',
          min: 0,
          max: 100,
          splitNumber: 4,
          progress: { show: true, width: 10 },
          axisLine: { lineStyle: { width: 10 } },
          axisTick: { show: false },
          splitLine: { length: 10 },
          axisLabel: { fontSize: 10 },
          title: { fontSize: 12, offsetCenter: [0, '90%'] },
          detail: { fontSize: 14, formatter: (v: number) => `${formatNumber(v, { maximumFractionDigits: 2 })}%` },
          data: [{ value: ddPct, name: '最大回撤%' }],
        },
      ],
    }
  }, [sim.summary.maxDrawdownPct, sim.summary.pnlPct])

  const onExportCsv = () => {
    const rows = sim.realized.map((r) => ({
      ts: r.ts,
      time: formatDateTime(r.ts),
      market: r.title ?? r.slug ?? r.key,
      outcome: r.outcome ?? '',
      qty: r.qty,
      entryPrice: r.entryPrice,
      exitPrice: r.exitPrice,
      tradeAmountUsd: calcNotionalUsd(r.qty, r.entryPrice),
      entryNotionalUsd: calcNotionalUsd(r.qty, r.entryPrice),
      exitNotionalUsd: calcNotionalUsd(r.qty, r.exitPrice),
      pnlUsd: r.pnlUsd,
    }))
    const csv = toCsv(rows)
    downloadTextFile(`copy-sim-${props.user.slice(0, 6)}-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  const onExportPdf = () => {
    if (!sim) return
    const html = buildSimReportHtml(props.user, sim)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (!w) {
      downloadTextFile(`copy-sim-${props.user.slice(0, 6)}-${Date.now()}.html`, html, 'text/html;charset=utf-8')
      URL.revokeObjectURL(url)
      return
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  if (props.trades.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        暂无交易数据，无法进行跟单回测
      </div>
    )
  }

  if (simCalc.error) {
    return (
      <div className="p-8 text-center text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-900">
        跟单回测失败：{simCalc.error ?? '未知错误'}
      </div>
    )
  }

  return (
      <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">运行模式</div>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-semibold ${runMode === 'backtest' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                    aria-pressed={runMode === 'backtest'}
                    onClick={() => setRunMode('backtest')}
                  >
                    历史回测
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-semibold ${runMode === 'live' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                    aria-pressed={runMode === 'live'}
                    onClick={() => setRunMode('live')}
                  >
                    实时跟单
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">跟单方式</div>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-semibold ${followMode === 'ratio' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                    aria-pressed={followMode === 'ratio'}
                    onClick={() => setFollowMode('ratio')}
                  >
                    按比例
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-semibold ${followMode === 'fixed' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                    aria-pressed={followMode === 'fixed'}
                    onClick={() => setFollowMode('fixed')}
                  >
                    固定金额
                  </button>
                </div>
              </div>

              <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">高级设置</summary>
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={allowPartialFills}
                      onChange={(e) => setAllowPartialFills(e.target.checked)}
                      aria-label="允许资金不足时部分成交"
                    />
                    允许部分成交
                  </label>
                </div>
              </details>
            </div>

            <div className="flex gap-2 lg:ml-auto">
              <button
                className="px-3 py-2 rounded-md text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onExportCsv}
                aria-label="导出 CSV"
                disabled={sim.realized.length === 0}
              >
                导出 CSV
              </button>
              <button
                className="px-3 py-2 rounded-md text-xs font-semibold cursor-pointer bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onExportPdf}
                aria-label="导出 PDF"
              >
                导出 PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="copySimCapital">
                起始资金（USDC）
              </label>
              <input
                id="copySimCapital"
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500"
                inputMode="decimal"
                value={String(initialCapitalUsd)}
                onChange={(e) => setInitialCapitalUsd(Number(e.target.value))}
                aria-label="设置起始资金"
              />
            </div>

            {followMode === 'ratio' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="copySimRatio">
                  跟单比例（%）
                </label>
                <input
                  id="copySimRatio"
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500"
                  inputMode="decimal"
                  value={String(followPercent)}
                  onChange={(e) => setFollowPercent(Number(e.target.value))}
                  aria-label="设置跟单比例百分比（0-100）"
                />
                <div className="text-[11px] text-slate-400 dark:text-slate-500">100 表示 1:1 跟随；50 表示半仓跟随</div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="copySimNotional">
                  每笔固定金额（USDC）
                </label>
                <input
                  id="copySimNotional"
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500"
                  inputMode="decimal"
                  value={String(followNotionalUsd)}
                  onChange={(e) => setFollowNotionalUsd(Number(e.target.value))}
                  aria-label="设置每笔固定跟单金额"
                />
              </div>
            )}

            {runMode === 'backtest' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="copySimStart">
                  回测开始
                </label>
                <input
                  id="copySimStart"
                  type="datetime-local"
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500"
                  value={startTs ? toDatetimeLocalValue(startTs) : ''}
                  onChange={(e) => setStartTs(parseDatetimeLocalValue(e.target.value))}
                  aria-label="设置回测开始时间"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-[11px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                    onClick={() => setBacktestRangeDays(1)}
                    disabled={!latestTradeTs}
                    aria-label="回测最近一日"
                  >
                    近1日
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-[11px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                    onClick={() => setBacktestRangeDays(7)}
                    disabled={!latestTradeTs}
                    aria-label="回测最近一周"
                  >
                    近1周
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-[11px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                    onClick={() => setBacktestRangeDays(30)}
                    disabled={!latestTradeTs}
                    aria-label="回测最近一月"
                  >
                    近1月
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">实时起点</div>
                <div className="flex items-center gap-2">
                  {liveStartTs ? (
                    <>
                      <div className="text-xs font-mono text-slate-700 dark:text-slate-300">{formatDateTime(liveStartTs)}</div>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-md text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700"
                        onClick={stopLive}
                        aria-label="停止实时跟单"
                      >
                        停止
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="px-3 py-2 rounded-md text-xs font-semibold cursor-pointer bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700"
                      onClick={startLive}
                      aria-label="开始实时跟单"
                    >
                      开始跟单
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">从点击开始跟单后，只统计之后出现的成交</div>
              </div>
            )}

            {runMode === 'backtest' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="copySimEnd">
                  回测结束（可选）
                </label>
                <input
                  id="copySimEnd"
                  type="datetime-local"
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500"
                  value={endTs ? toDatetimeLocalValue(endTs) : ''}
                  onChange={(e) => setEndTs(parseDatetimeLocalValue(e.target.value))}
                  aria-label="设置回测结束时间"
                />
              </div>
            ) : (
              <div />
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            使用交易：{sim.meta.usedTradeCount} / {sim.meta.inputTradeCount}
          </span>
          <span>跳过：{sim.meta.skippedTradeCount}</span>
          <span>部分成交：{sim.meta.partialFillCount}</span>
          {props.status === 'loading' ? <span className="text-slate-400">数据更新中…</span> : null}
          {props.error ? <span className="text-red-500">更新失败：{props.error}</span> : null}
        </div>
      </div>

      {sim.skippedTradeReasons.length > 0 ? (
        <details className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-900 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-amber-900 dark:text-amber-200">
            跳过原因（展示前 {Math.min(50, sim.skippedTradeReasons.length)} 条）
          </summary>
          <ul className="mt-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
            {sim.skippedTradeReasons.slice(0, 50).map((r, idx) => (
              <li key={`${idx}-${r}`} className="font-mono break-words">
                {r}
              </li>
            ))}
          </ul>
          {sim.skippedTradeReasons.length > 50 ? (
            <div className="mt-2 text-xs text-amber-800/80 dark:text-amber-200/80">已省略 {sim.skippedTradeReasons.length - 50} 条</div>
          ) : null}
        </details>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">累计盈亏</div>
          <div className={`text-lg font-bold font-mono ${sim.summary.pnlUsd >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {formatUsdPrecise(sim.summary.pnlUsd)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{formatPercentPrecise(sim.summary.pnlPct)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">胜率</div>
          <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-50">{formatPercentPrecise(sim.summary.winRate * 100)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">最大单笔盈利</div>
          <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsdPrecise(sim.summary.maxSingleWinUsd)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">最大单笔亏损</div>
          <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsdPrecise(sim.summary.maxSingleLossUsd)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">最大回撤</div>
          <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-50">{formatPercentPrecise(sim.summary.maxDrawdownPct)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sharpe</div>
          <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-50">{formatNumber(sim.summary.sharpeRatio, { maximumFractionDigits: 4 })}</div>
        </div>
      </div>

      <ChartCard title="交易时间分布（日内 vs 夜间）" right="按 SELL 已实现统计">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sim.dayNight.map((row) => (
            <div key={row.label} className="bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{row.label === 'day' ? '日内（08:00-20:00）' : '夜间（20:00-08:00）'}</div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">已实现盈亏</div>
                  <div className={`font-mono mt-1 ${row.realizedPnlUsd >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatUsdPrecise(row.realizedPnlUsd)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">胜率</div>
                  <div className="font-mono mt-1 text-slate-900 dark:text-slate-50">{formatPercentPrecise(row.winRate * 100)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">笔数</div>
                  <div className="font-mono mt-1 text-slate-900 dark:text-slate-50">{row.realizedCount}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="曲线对比（跟单权益 vs 交易员净现金流）" right="卖出为 +，买入为 −；净买入会向下">
          {sim.equity.length <= 1 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              暂无可用曲线
            </div>
          ) : (
            <EChart option={curveOption} height={320} />
          )}
        </ChartCard>
        <ChartCard title="关键指标仪表盘">
          <EChart option={gaugeOption} height={320} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="盈亏分布热力图（按星期 x 小时）">
          <EChart option={heatmapOption} height={320} />
        </ChartCard>
        <ChartCard title="交易品种已实现盈亏（Top 12）" right="按 SELL 已实现统计">
          {sim.pnlByMarket.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              暂无已实现盈亏
            </div>
          ) : (
            <EChart option={marketPnlOption} height={320} />
          )}
        </ChartCard>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm" role="region" aria-label="跟单已实现盈亏明细">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-700">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">已实现盈亏明细（SELL 事件）</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">共 {sim.realized.length} 笔</div>
        </div>
        {sim.realized.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">暂无可统计的已实现盈亏（可能因为没有可卖出仓位）</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[1120px]">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    时间
                  </th>
                  <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    市场
                  </th>
                  <th className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    Outcome
                  </th>
                  <th className="text-right px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    数量
                  </th>
                  <th className="text-right px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    买入均价
                  </th>
                  <th className="text-right px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    卖出价
                  </th>
                  <th className="text-right px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    成交额（USDC）
                  </th>
                  <th className="text-right px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    已实现盈亏
                  </th>
                </tr>
              </thead>
              <tbody>
                {sim.realized.slice().reverse().slice(0, 300).map((r) => (
                  <tr key={`${r.ts}:${r.key}:${r.entryPrice}:${r.exitPrice}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono text-xs whitespace-nowrap">
                      {formatDateTime(r.ts)}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle">
                      <div className="truncate max-w-[520px]" title={r.title ?? r.slug ?? r.key}>
                        {r.title ?? r.slug ?? r.key}
                      </div>
                      {r.slug ? <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{r.slug}</div> : null}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle whitespace-nowrap">
                      {r.outcome ?? '—'}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap text-right">
                      {formatNumber(r.qty, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap text-right">
                      {formatNumber(r.entryPrice, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap text-right">
                      {formatNumber(r.exitPrice, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-900 dark:text-slate-50 align-middle font-mono whitespace-nowrap text-right">
                      {formatUsdPrecise(calcNotionalUsd(r.qty, r.exitPrice))}
                    </td>
                    <td className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 align-middle font-mono whitespace-nowrap text-right ${r.pnlUsd >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatUsdPrecise(r.pnlUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sim.realized.length > 300 ? (
              <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20">
                仅展示最近 300 行；导出 CSV 可获取完整明细
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
