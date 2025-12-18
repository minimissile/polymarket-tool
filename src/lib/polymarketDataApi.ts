export type DataApiTrade = {
  proxyWallet: string
  side: 'BUY' | 'SELL'
  asset: string
  conditionId: string
  size: number
  price: number
  timestamp: number
  title?: string
  slug?: string
  icon?: string
  eventSlug?: string
  outcome?: string
  outcomeIndex?: number
  name?: string
  pseudonym?: string
  bio?: string
  profileImage?: string
  profileImageOptimized?: string
  transactionHash?: string
}

export type DataApiActivity = {
  proxyWallet: string
  timestamp: number
  conditionId?: string
  type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD' | 'CONVERSION'
  size?: number
  usdcSize?: number
  transactionHash?: string
  price?: number
  asset?: string
  side?: 'BUY' | 'SELL'
  outcomeIndex?: number
  title?: string
  slug?: string
  icon?: string
  eventSlug?: string
  outcome?: string
  name?: string
  pseudonym?: string
  bio?: string
  profileImage?: string
  profileImageOptimized?: string
}

export type DataApiPosition = {
  proxyWallet: string
  asset: string
  conditionId: string
  size: number
  avgPrice: number
  initialValue: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  totalBought: number
  realizedPnl: number
  percentRealizedPnl: number
  curPrice: number
  redeemable: boolean
  title?: string
  slug?: string
  icon?: string
  eventSlug?: string
  outcome?: string
  outcomeIndex?: number
  oppositeOutcome?: string
  oppositeAsset?: string
  endDate?: string
  negativeRisk?: boolean
}

type FetchJsonOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

const BASE_URL = 'https://data-api.polymarket.com'

/** 以 JSON 方式请求 Data API，带超时与可选的 AbortSignal。 */
async function fetchJson<T>(url: string, options?: FetchJsonOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 12_000
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  const signal = options?.signal
  const compositeSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: compositeSignal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`请求失败 (${response.status}) ${text}`.trim())
    }
    return (await response.json()) as T
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/** 生成带查询参数的 Data API URL。 */
function buildUrl(pathname: string, params: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`${BASE_URL}${pathname}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

/** 获取某个用户的成交（trades）。 */
export async function getTradesByUser(
  user: string,
  params?: { limit?: number; offset?: number; market?: string; takerOnly?: boolean },
  options?: FetchJsonOptions,
) {
  const url = buildUrl('/trades', {
    user,
    limit: params?.limit,
    offset: params?.offset,
    market: params?.market,
    takerOnly: params?.takerOnly ?? true,
  })
  return fetchJson<DataApiTrade[]>(url, options)
}

/** 获取全局最近成交（用于发现页聚合热门交易员）。 */
export async function getRecentTrades(
  params?: { limit?: number; offset?: number; market?: string; takerOnly?: boolean },
  options?: FetchJsonOptions,
) {
  const url = buildUrl('/trades', {
    limit: params?.limit,
    offset: params?.offset,
    market: params?.market,
    takerOnly: params?.takerOnly ?? true,
  })
  return fetchJson<DataApiTrade[]>(url, options)
}

/** 获取某个用户的活动（activity）。 */
export async function getActivityByUser(
  user: string,
  params?: { limit?: number; offset?: number; market?: string; side?: 'BUY' | 'SELL' },
  options?: FetchJsonOptions,
) {
  const url = buildUrl('/activity', {
    user,
    limit: params?.limit,
    offset: params?.offset,
    market: params?.market,
    side: params?.side,
  })
  return fetchJson<DataApiActivity[]>(url, options)
}

/** 获取某个用户的持仓（positions）。 */
export async function getPositionsByUser(
  user: string,
  params?: {
    limit?: number
    offset?: number
    sortBy?:
      | 'TOKENS'
      | 'CURRENT'
      | 'INITIAL'
      | 'CASHPNL'
      | 'PERCENTPNL'
      | 'TITLE'
      | 'RESOLVING'
      | 'PRICE'
    sortDirection?: 'ASC' | 'DESC'
    sizeThreshold?: number
  },
  options?: FetchJsonOptions,
) {
  const url = buildUrl('/positions', {
    user,
    limit: params?.limit,
    offset: params?.offset,
    sortBy: params?.sortBy,
    sortDirection: params?.sortDirection,
    sizeThreshold: params?.sizeThreshold,
  })
  return fetchJson<DataApiPosition[]>(url, options)
}
