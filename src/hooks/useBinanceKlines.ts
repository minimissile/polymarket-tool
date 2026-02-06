import { useEffect, useState } from 'react'
import { getBinanceKlines, convertBinanceKlinesToTradingView, type KlineInterval } from '../lib/binanceApi'
import type { CandlestickData } from '../components/TradingViewChart'

type UseBinanceKlinesOptions = {
  symbol: string
  interval: KlineInterval
  limit?: number
  autoRefresh?: boolean // 是否自动刷新
  refreshInterval?: number // 自动刷新间隔（毫秒），默认 10 秒
}

type UseBinanceKlinesResult = {
  data: CandlestickData[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * 获取币安 K线数据的 Hook
 */
export function useBinanceKlines(options: UseBinanceKlinesOptions): UseBinanceKlinesResult {
  const { symbol, interval, limit = 500, autoRefresh = false, refreshInterval = 10000 } = options

  const [data, setData] = useState<CandlestickData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setError(null)
      const klines = await getBinanceKlines({ symbol, interval, limit })
      const converted = convertBinanceKlinesToTradingView(klines)
      setData(converted)
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取 K线数据失败'
      setError(message)
      console.error('获取 K线数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 初始加载和参数变化时重新获取
  useEffect(() => {
    setLoading(true)
    void fetchData()
  }, [symbol, interval, limit])

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return

    const timer = setInterval(() => {
      void fetchData()
    }, refreshInterval)

    return () => clearInterval(timer)
  }, [autoRefresh, refreshInterval, symbol, interval, limit])

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  }
}
