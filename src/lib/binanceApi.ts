/** 币安 K线数据类型 */
export type BinanceKline = [
  number, // 0: 开盘时间
  string, // 1: 开盘价
  string, // 2: 最高价
  string, // 3: 最低价
  string, // 4: 收盘价
  string, // 5: 成交量
  number, // 6: 收盘时间
  string, // 7: 成交额
  number, // 8: 成交笔数
  string, // 9: 主动买入成交量
  string, // 10: 主动买入成交额
  string, // 11: 忽略
]

/** K线时间周期 */
export type KlineInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M'

/** 获取 K线数据的参数 */
export type GetKlinesParams = {
  symbol: string // 交易对，例如 BTCUSDT
  interval: KlineInterval // K线周期
  limit?: number // 返回数量，默认 500，最大 1000
  startTime?: number // 起始时间（毫秒时间戳）
  endTime?: number // 结束时间（毫秒时间戳）
}

const BINANCE_API_BASE = import.meta.env.DEV ? '/binance-api' : 'https://api.binance.com'

/**
 * 获取币安 K线数据
 * @see https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
 */
export async function getBinanceKlines(params: GetKlinesParams): Promise<BinanceKline[]> {
  const { symbol, interval, limit = 500, startTime, endTime } = params

  const url = new URL(`${BINANCE_API_BASE}/api/v3/klines`)
  url.searchParams.set('symbol', symbol.toUpperCase())
  url.searchParams.set('interval', interval)
  url.searchParams.set('limit', String(Math.min(limit, 1000)))

  if (startTime) url.searchParams.set('startTime', String(startTime))
  if (endTime) url.searchParams.set('endTime', String(endTime))

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text().catch(() => '')
      throw new Error(`币安 API 请求失败 (${response.status}): ${error}`)
    }

    return (await response.json()) as BinanceKline[]
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('获取 K线数据失败')
  }
}

/**
 * 将币安 K线数据转换为 TradingView 格式
 */
export function convertBinanceKlinesToTradingView(klines: BinanceKline[]) {
  return klines.map((kline) => ({
    time: Math.floor(kline[0] / 1000) as never, // 转换为秒级时间戳
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
  }))
}

/** 常用交易对列表 */
export const POPULAR_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'BTC/USDT', label: 'Bitcoin' },
  { symbol: 'ETHUSDT', name: 'ETH/USDT', label: 'Ethereum' },
  { symbol: 'BNBUSDT', name: 'BNB/USDT', label: 'BNB' },
  { symbol: 'SOLUSDT', name: 'SOL/USDT', label: 'Solana' },
  { symbol: 'ADAUSDT', name: 'ADA/USDT', label: 'Cardano' },
  { symbol: 'XRPUSDT', name: 'XRP/USDT', label: 'Ripple' },
  { symbol: 'DOGEUSDT', name: 'DOGE/USDT', label: 'Dogecoin' },
  { symbol: 'DOTUSDT', name: 'DOT/USDT', label: 'Polkadot' },
] as const

/** 时间周期选项 */
export const INTERVAL_OPTIONS = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '30m', label: '30分钟' },
  { value: '1h', label: '1小时' },
  { value: '4h', label: '4小时' },
  { value: '1d', label: '1天' },
  { value: '1w', label: '1周' },
] as const
