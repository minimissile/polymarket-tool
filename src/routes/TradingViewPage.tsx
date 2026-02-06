import { useMemo, useState } from 'react'
import { TradingViewChart, type PriceLine } from '../components/TradingViewChart'
import { ChartCard } from '../components/ChartCard'
import { useBinanceKlines } from '../hooks/useBinanceKlines'
import { POPULAR_SYMBOLS, INTERVAL_OPTIONS, type KlineInterval } from '../lib/binanceApi'

/** TradingView 图表展示页：展示币安真实 K线数据。 */
export default function TradingViewPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT')
  const [selectedInterval, setSelectedInterval] = useState<KlineInterval>('15m')
  const [showPriceLines, setShowPriceLines] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // 获取币安 K线数据
  const { data: chartData, loading, error, refresh } = useBinanceKlines({
    symbol: selectedSymbol,
    interval: selectedInterval,
    limit: 500,
    autoRefresh,
    refreshInterval: 10000, // 10秒自动刷新
  })

  // 计算当前价格（最后一根 K线的收盘价）
  const currentPrice = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData[chartData.length - 1].close
  }, [chartData])

  // 自定义价格线（基于当前价格的 ±5%）
  const priceLines: PriceLine[] = useMemo(() => {
    if (!showPriceLines || currentPrice === 0) return []
    return [
      {
        price: currentPrice * 1.05,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: 2,
        title: '目标 +5%',
      },
      {
        price: currentPrice * 0.95,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 2,
        title: '止损 -5%',
      },
    ]
  }, [showPriceLines, currentPrice])

  // 获取当前选中币种的信息
  const selectedSymbolInfo = useMemo(
    () => POPULAR_SYMBOLS.find((s) => s.symbol === selectedSymbol) || POPULAR_SYMBOLS[0],
    [selectedSymbol],
  )

  return (
    <main className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">币安 K线图表</h1>
          <div className="flex gap-4 items-center flex-wrap">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              自动刷新 (10s)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showPriceLines}
                onChange={(e) => setShowPriceLines(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              显示价格线
            </label>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '加载中...' : '刷新'}
            </button>
          </div>
        </div>

        {/* 币种和时间周期选择 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">选择币种</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {POPULAR_SYMBOLS.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.name} - {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">时间周期</label>
            <select
              value={selectedInterval}
              onChange={(e) => setSelectedInterval(e.target.value as KlineInterval)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 当前价格显示 */}
        {currentPrice > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col">
              <span className="text-sm text-slate-500 dark:text-slate-400">当前价格</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex-1" />
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {selectedSymbolInfo.label} ({selectedSymbolInfo.name})
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
            <div className="font-semibold mb-1">加载失败</div>
            <div className="text-sm">{error}</div>
          </div>
        )}

        <div className="text-sm text-slate-600 dark:text-slate-400">
          实时显示币安交易所的 K线数据。数据每 10 秒自动更新（可关闭自动刷新）。
        </div>
      </div>

      <ChartCard title={`${selectedSymbolInfo.name} K线图 (${INTERVAL_OPTIONS.find(o => o.value === selectedInterval)?.label})`}>
        {loading && chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[500px] text-slate-500 dark:text-slate-400">
            加载中...
          </div>
        ) : (
          <TradingViewChart data={chartData} priceLines={priceLines} height={500} />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">数据来源</h3>
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-sm bg-yellow-500 mt-0.5" />
              <div>
                <div className="font-medium">币安公共 API</div>
                <div className="text-slate-500 dark:text-slate-400">使用币安交易所的公共 K线数据接口</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-sm bg-blue-500 mt-0.5" />
              <div>
                <div className="font-medium">实时更新</div>
                <div className="text-slate-500 dark:text-slate-400">每 10 秒自动获取最新数据，保持图表实时性</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">功能说明</h3>
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-sm bg-green-500 mt-0.5" />
              <div>
                <div className="font-medium">价格线标记</div>
                <div className="text-slate-500 dark:text-slate-400">绿色线为当前价格 +5%，红色线为 -5%</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-sm bg-purple-500 mt-0.5" />
              <div>
                <div className="font-medium">多币种支持</div>
                <div className="text-slate-500 dark:text-slate-400">支持 BTC、ETH、BNB 等 8 种热门加密货币</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-3">功能特性</h3>
        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-blue-500">✓</span>
            <span>支持 K线图（蜡烛图）展示，绿色表示上涨，红色表示下跌</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">✓</span>
            <span>实时数据：接入币安公共 API，展示真实的加密货币 K线数据</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">✓</span>
            <span>多币种选择：支持 BTC、ETH、BNB、SOL 等 8 种热门数字货币</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">✓</span>
            <span>时间周期：支持 1分钟、5分钟、15分钟、1小时、4小时、1天等多种周期</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">✓</span>
            <span>自定义价格线：基于当前价格自动计算 ±5% 的目标和止损位</span>
          </li>
        </ul>
      </div>
    </main>
  )
}
