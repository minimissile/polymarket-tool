import { useEffect, useMemo, useRef, useState } from 'react'

export type ClobPriceInfo = { bestBid?: number; bestAsk?: number; lastTrade?: number }

/**
 * 订阅 Polymarket CLOB WS 行情，返回按 assetId 聚合的 bestBid/bestAsk/lastTrade 快照。
 */
export function useClobMarketPrices(options: { enabled: boolean; assetIds: string[] }) {
  const wsRef = useRef<WebSocket | null>(null)
  const pingIdRef = useRef<number | null>(null)
  const reconnectIdRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const shouldReconnectRef = useRef(true)
  const priceByAssetIdRef = useRef<Record<string, ClobPriceInfo>>({})
  const flushIdRef = useRef<number | null>(null)
  const [version, setVersion] = useState(0)

  const assetIdsKey = useMemo(() => options.assetIds.join('|'), [options.assetIds])

  const scheduleFlush = () => {
    if (flushIdRef.current !== null) return
    flushIdRef.current = window.setTimeout(() => {
      flushIdRef.current = null
      setVersion((v) => v + 1)
    }, 200)
  }

  useEffect(() => {
    if (!options.enabled) return
    if (!assetIdsKey) return
    const assetIds = assetIdsKey.split('|').filter(Boolean)

    const closeExisting = () => {
      shouldReconnectRef.current = false

      if (reconnectIdRef.current !== null) {
        window.clearTimeout(reconnectIdRef.current)
        reconnectIdRef.current = null
      }
      if (pingIdRef.current !== null) {
        window.clearInterval(pingIdRef.current)
        pingIdRef.current = null
      }
      if (flushIdRef.current !== null) {
        window.clearTimeout(flushIdRef.current)
        flushIdRef.current = null
      }

      const existing = wsRef.current
      wsRef.current = null
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        existing.close()
      }
    }

    const parsePriceNumber = (value: unknown) => {
      const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN
      if (!Number.isFinite(n)) return undefined
      if (!(n > 0 && n < 1)) return undefined
      return n
    }

    const connect = () => {
      closeExisting()
      shouldReconnectRef.current = true
      priceByAssetIdRef.current = {}
      setVersion((v) => v + 1)

      const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market')
      wsRef.current = ws

      const upsert = (assetId: string, next: ClobPriceInfo) => {
        const prev = priceByAssetIdRef.current[assetId] ?? {}
        priceByAssetIdRef.current[assetId] = { ...prev, ...next }
        scheduleFlush()
      }

      ws.onopen = () => {
        reconnectAttemptRef.current = 0
        ws.send(JSON.stringify({ type: 'market', assets_ids: assetIds, custom_feature_enabled: true }))
        pingIdRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('PING')
        }, 10_000)
      }

      ws.onmessage = (evt) => {
        const raw = typeof evt.data === 'string' ? evt.data : ''
        if (!raw) return
        if (raw === 'PONG') return
        if (raw === 'PING') {
          if (ws.readyState === WebSocket.OPEN) ws.send('PONG')
          return
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(raw) as unknown
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') return

        const msg = parsed as Record<string, unknown>
        const eventType = msg.event_type

        if (eventType === 'book') {
          const assetId = typeof msg.asset_id === 'string' ? msg.asset_id : undefined
          if (!assetId) return
          const bids = (msg.bids ?? msg.buys) as unknown
          const asks = (msg.asks ?? msg.sells) as unknown
          const bidsArr = Array.isArray(bids) ? bids : []
          const asksArr = Array.isArray(asks) ? asks : []
          const bid0 = bidsArr[0]
          const ask0 = asksArr[0]
          const bestBid =
            bid0 && typeof bid0 === 'object' ? parsePriceNumber((bid0 as Record<string, unknown>).price) : undefined
          const bestAsk =
            ask0 && typeof ask0 === 'object' ? parsePriceNumber((ask0 as Record<string, unknown>).price) : undefined
          upsert(assetId, { bestBid, bestAsk })
          return
        }

        if (eventType === 'best_bid_ask') {
          const assetId = typeof msg.asset_id === 'string' ? msg.asset_id : undefined
          if (!assetId) return
          const bestBid = parsePriceNumber(msg.best_bid)
          const bestAsk = parsePriceNumber(msg.best_ask)
          upsert(assetId, { bestBid, bestAsk })
          return
        }

        if (eventType === 'last_trade_price') {
          const assetId = typeof msg.asset_id === 'string' ? msg.asset_id : undefined
          if (!assetId) return
          const lastTrade = parsePriceNumber(msg.price)
          upsert(assetId, { lastTrade })
          return
        }

        if (eventType === 'price_change') {
          const changes = msg.price_changes
          if (!Array.isArray(changes)) return
          for (const ch of changes) {
            if (!ch || typeof ch !== 'object') continue
            const r = ch as Record<string, unknown>
            const assetId = typeof r.asset_id === 'string' ? r.asset_id : undefined
            if (!assetId) continue
            const bestBid = parsePriceNumber(r.best_bid)
            const bestAsk = parsePriceNumber(r.best_ask)
            upsert(assetId, { bestBid, bestAsk })
          }
        }
      }

      ws.onclose = () => {
        if (pingIdRef.current !== null) {
          window.clearInterval(pingIdRef.current)
          pingIdRef.current = null
        }
        if (!shouldReconnectRef.current) return

        const attempt = reconnectAttemptRef.current + 1
        reconnectAttemptRef.current = attempt
        const delayMs = Math.min(30_000, 800 * 2 ** Math.min(6, attempt))
        reconnectIdRef.current = window.setTimeout(() => connect(), delayMs)
      }
    }

    connect()
    return () => closeExisting()
  }, [assetIdsKey, options.enabled])

  const pricesByAssetId = useMemo(() => {
    void version
    return priceByAssetIdRef.current
  }, [version])

  return { pricesByAssetId, version }
}
