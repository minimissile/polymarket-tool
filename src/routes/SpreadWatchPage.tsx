import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardBody, CardHeader, Input, Button } from '@heroui/react'
import { getGammaMarketBySlug } from '../lib/polymarketDataApi'

type Status =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'listening'; slug: string }
  | { status: 'error'; error: string }

function parseMarketSlugFromInput(raw: string): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (!value.includes('/')) return value.toLowerCase()
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex(p => p === 'event' || p === 'market')
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].toLowerCase()
    return parts[parts.length - 1]?.toLowerCase()
  } catch {
    const parts = value.split('/').filter(Boolean)
    return parts[parts.length - 1]?.toLowerCase()
  }
}

function parseMaybeArray(value: unknown): unknown[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

type TradeLogEntry = { text: string; highlighted: boolean }

export default function SpreadWatchPage() {
  const [marketInput, setMarketInput] = useState('')
  const [highlightAddressInput, setHighlightAddressInput] = useState('')
  const [state, setState] = useState<Status>({ status: 'idle' })
  const [spreadLogs, setSpreadLogs] = useState<string[]>([])
  const [tradeLogsUp, setTradeLogsUp] = useState<TradeLogEntry[]>([])
  const [tradeLogsDown, setTradeLogsDown] = useState<TradeLogEntry[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const wsPingIdRef = useRef<number | null>(null)
  const rtdsWsRef = useRef<WebSocket | null>(null)
  const rtdsPingIdRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(false)
  const lastAlertKeyRef = useRef<number | null>(null)
  const hasLoggedSpreadRef = useRef(false)
  const spreadLogRef = useRef<HTMLDivElement | null>(null)
  const tradeLogUpRef = useRef<HTMLDivElement | null>(null)
  const tradeLogDownRef = useRef<HTMLDivElement | null>(null)

  const slug = useMemo(() => parseMarketSlugFromInput(marketInput), [marketInput])
  const highlightAddress = useMemo(() => {
    const v = highlightAddressInput.trim().toLowerCase()
    return v || undefined
  }, [highlightAddressInput])

  const appendSpreadLog = useCallback((line: string) => {
    setSpreadLogs(prev => {
      const next = [...prev, line]
      if (next.length > 500) next.shift()
      return next
    })
  }, [])

  useEffect(() => {
    const el = spreadLogRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [spreadLogs.length])

  const appendTradeLogUp = useCallback(
    (line: string, highlighted: boolean) => {
      setTradeLogsUp(prev => {
        const next = [...prev, { text: line, highlighted }]
        if (next.length > 500) next.shift()
        return next
      })
    },
    [],
  )

  useEffect(() => {
    const el = tradeLogUpRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [tradeLogsUp.length])

  const appendTradeLogDown = useCallback(
    (line: string, highlighted: boolean) => {
      setTradeLogsDown(prev => {
        const next = [{ text: line, highlighted }, ...prev]
        if (next.length > 500) next.pop()
        return next
      })
    },
    [],
  )

  useEffect(() => {
    const el = tradeLogDownRef.current
    if (!el) return
    el.scrollTop = 0
  }, [tradeLogsDown.length])

  const stop = useCallback(() => {
    shouldReconnectRef.current = false
    if (wsPingIdRef.current !== null) {
      window.clearInterval(wsPingIdRef.current)
      wsPingIdRef.current = null
    }
    if (rtdsPingIdRef.current !== null) {
      window.clearInterval(rtdsPingIdRef.current)
      rtdsPingIdRef.current = null
    }
    const ws = wsRef.current
    wsRef.current = null
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close()
    const rtds = rtdsWsRef.current
    rtdsWsRef.current = null
    if (rtds && (rtds.readyState === WebSocket.OPEN || rtds.readyState === WebSocket.CONNECTING)) rtds.close()
    hasLoggedSpreadRef.current = false
    setState({ status: 'idle' })
    appendSpreadLog(`[${new Date().toLocaleTimeString()}] 已停止监听`)
    appendTradeLogUp(`[${new Date().toLocaleTimeString()}] 已停止监听`, false)
    appendTradeLogDown(`[${new Date().toLocaleTimeString()}] 已停止监听`, false)
  }, [appendSpreadLog, appendTradeLogUp, appendTradeLogDown])

  const start = useCallback(async () => {
    if (!slug) {
      setState({ status: 'error', error: '无法从输入解析市场 slug' })
      appendSpreadLog(`[${new Date().toLocaleTimeString()}] 输入错误：无法解析市场 slug`)
      return
    }
    if (state.status === 'connecting' || state.status === 'listening') return

    stop()
    setSpreadLogs([])
    setTradeLogsUp([])
    setTradeLogsDown([])
    setState({ status: 'connecting' })
    appendSpreadLog(`[${new Date().toLocaleTimeString()}] 开始为市场 ${slug} 建立监听…`)

    try {
      const market = await getGammaMarketBySlug(slug, { timeoutMs: 12_000 })
      const marketRecord = market as unknown as Record<string, unknown>
      const tokenIdsRaw = marketRecord.clobTokenIds ?? marketRecord.tokenIds ?? marketRecord.clobTokenId
      const tokenIds = parseMaybeArray(tokenIdsRaw)
      const assets = (tokenIds ?? [])
        .map(v => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''))
        .filter(Boolean)
      if (assets.length < 2) {
        setState({ status: 'error', error: '该市场缺少足够的 outcome 资产 ID（需要至少两个）' })
        appendLog(`[${new Date().toLocaleTimeString()}] 市场资产不足，无法监听二元价差`)
        return
      }

      const outcomes = parseMaybeArray(marketRecord.outcomes) ?? []
      const nameFor = (idx: number) => {
        const o = outcomes[idx]
        if (!o) return `Outcome${idx}`
        if (typeof o === 'string') return o
        const r = o as Record<string, unknown>
        if (typeof r.name === 'string') return r.name
        if (typeof r.title === 'string') return r.title
        if (typeof r.outcome === 'string') return r.outcome
        return `Outcome${idx}`
      }
      const upLabel = nameFor(0)
      const downLabel = nameFor(1)
      const [asset0, asset1] = assets

      const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market')
      wsRef.current = ws
      shouldReconnectRef.current = false
      lastAlertKeyRef.current = null

      const prices: Record<string, { bid?: number; ask?: number; last?: number }> = {}

      const parsePriceNumber = (value: unknown) => {
        const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN
        if (!Number.isFinite(n)) return undefined
        if (!(n > 0 && n < 1)) return undefined
        return n
      }

      const updateAndCheckSpread = () => {
        const info0 = prices[asset0] ?? {}
        const info1 = prices[asset1] ?? {}
        const mark = (info: { bid?: number; ask?: number; last?: number }) => {
          const { bid, ask, last } = info
          if (bid !== undefined && ask !== undefined) return (bid + ask) / 2
          return bid ?? ask ?? last
        }
        const p0 = mark(info0)
        const p1 = mark(info1)
        if (typeof p0 !== 'number' || typeof p1 !== 'number') return

        const sum = (p0 + p1) * 100
        const ts = new Date().toLocaleTimeString()
        const upPct = (p0 * 100).toFixed(4)
        const downPct = (p1 * 100).toFixed(4)
        const sumText = sum.toFixed(4)

        if (!hasLoggedSpreadRef.current) {
          hasLoggedSpreadRef.current = true
          appendSpreadLog(
            `[${ts}] 当前 ${upLabel}/${downLabel} 价格总和≈${sumText}（${upLabel}≈${upPct}，${downLabel}≈${downPct}）`
          )
        }

        const inBand = sum >= 98 && sum <= 102
        if (inBand) {
          lastAlertKeyRef.current = null
          return
        }
        const key = Math.round(sum * 1000)
        if (lastAlertKeyRef.current === key) return
        lastAlertKeyRef.current = key
        appendSpreadLog(`[${ts}] ${upLabel}/${downLabel} 价格总和≈${sumText}（${upLabel}≈${upPct}，${downLabel}≈${downPct}）`)
      }

      ws.onopen = () => {
        setState({ status: 'listening', slug })
        appendSpreadLog(
          `[${new Date().toLocaleTimeString()}] 价格 WebSocket 已连接，开始监听 ${upLabel}/${downLabel}（assets_ids=${asset0.slice(0, 6)}…，${asset1.slice(0, 6)}…）…`
        )
        ws.send(
          JSON.stringify({
            type: 'market',
            assets_ids: [asset0, asset1],
            custom_feature_enabled: true
          })
        )
        wsPingIdRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('PING')
        }, 10_000)
      }

      ws.onmessage = evt => {
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

        const upsert = (assetId: string, next: { bid?: number; ask?: number; last?: number }) => {
          const prev = prices[assetId] ?? {}
          prices[assetId] = { ...prev, ...next }
          updateAndCheckSpread()
        }

        if (eventType === 'best_bid_ask') {
          const assetId = typeof msg.asset_id === 'string' ? msg.asset_id : undefined
          if (!assetId || (assetId !== asset0 && assetId !== asset1)) return
          const bid = parsePriceNumber(msg.best_bid)
          const ask = parsePriceNumber(msg.best_ask)
          upsert(assetId, { bid, ask })
          return
        }

        if (eventType === 'book') {
          const assetId = typeof msg.asset_id === 'string' ? msg.asset_id : undefined
          if (!assetId || (assetId !== asset0 && assetId !== asset1)) return
          const bids = msg.bids ?? msg.buys
          const asks = msg.asks ?? msg.sells
          const bidsArr = Array.isArray(bids) ? bids : []
          const asksArr = Array.isArray(asks) ? asks : []
          const bid0 = bidsArr[0]
          const ask0 = asksArr[0]
          const bid = bid0 && typeof bid0 === 'object' ? parsePriceNumber((bid0 as Record<string, unknown>).price) : undefined
          const ask = ask0 && typeof ask0 === 'object' ? parsePriceNumber((ask0 as Record<string, unknown>).price) : undefined
          upsert(assetId, { bid, ask })
          return
        }

        if (eventType === 'last_trade_price') {
          const assetId = typeof msg.asset_id === 'string' ? msg.asset_id : undefined
          if (!assetId || (assetId !== asset0 && assetId !== asset1)) return
          const last = parsePriceNumber(msg.price)
          upsert(assetId, { last })
          return
        }

        if (eventType === 'price_change') {
          const changes = msg.price_changes
          if (!Array.isArray(changes)) return
          for (const ch of changes) {
            if (!ch || typeof ch !== 'object') continue
            const r = ch as Record<string, unknown>
            const assetId = typeof r.asset_id === 'string' ? r.asset_id : undefined
            if (!assetId || (assetId !== asset0 && assetId !== asset1)) continue
            const bid = parsePriceNumber(r.best_bid)
            const ask = parsePriceNumber(r.best_ask)
            upsert(assetId, { bid, ask })
          }
        }
      }

      ws.onclose = () => {
        if (wsPingIdRef.current !== null) {
          window.clearInterval(wsPingIdRef.current)
          wsPingIdRef.current = null
        }
      }

      const rtds = new WebSocket('wss://ws-live-data.polymarket.com/')
      rtdsWsRef.current = rtds

      rtds.onopen = () => {
        appendTradeLogUp(`[${new Date().toLocaleTimeString()}] RTDS 已连接，开始订阅成交流…`, false)
        const sub = {
          action: 'subscribe',
          subscriptions: [
            {
              topic: 'activity',
              type: 'orders_matched',
              filters: JSON.stringify({ event_slug: slug })
            },
            {
              topic: 'activity',
              type: 'trades',
              filters: JSON.stringify({ event_slug: slug })
            }
          ]
        }
        rtds.send(JSON.stringify(sub))
        rtdsPingIdRef.current = window.setInterval(() => {
          if (rtds.readyState === WebSocket.OPEN) rtds.send('PING')
        }, 5000)
      }

      rtds.onmessage = evt => {
        const raw = typeof evt.data === 'string' ? evt.data : ''
        if (!raw) return
        let parsed: unknown
        try {
          parsed = JSON.parse(raw) as unknown
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') return
        const msg = parsed as { topic?: unknown; type?: unknown; timestamp?: unknown; payload?: unknown }
        if (msg.topic !== 'activity') return
        if (msg.type !== 'orders_matched' && msg.type !== 'trades') return
        if (!msg.payload || typeof msg.payload !== 'object') return
        const payload = msg.payload as Record<string, unknown>

        const tsMs =
          typeof msg.timestamp === 'number'
            ? msg.timestamp
            : typeof payload.timestamp === 'number'
              ? payload.timestamp * 1000
              : Date.now()
        const ts = new Date(tsMs).toLocaleTimeString()

        const sideRaw = payload.side
        const side =
          typeof sideRaw === 'string'
            ? sideRaw.toUpperCase() === 'BUY'
              ? 'BUY'
              : sideRaw.toUpperCase() === 'SELL'
                ? 'SELL'
                : sideRaw
            : 'UNKNOWN'
        const sideText = side === 'BUY' ? '买入' : side === 'SELL' ? '卖出' : String(side)

        const outcomeRaw = payload.outcome
        const outcome =
          typeof outcomeRaw === 'string'
            ? outcomeRaw
            : (() => {
                const idx = typeof payload.outcomeIndex === 'number' ? payload.outcomeIndex : undefined
                return idx !== undefined ? nameFor(idx) : '未知'
              })()

        const sizeRaw = payload.size
        const size = typeof sizeRaw === 'number' ? sizeRaw : typeof sizeRaw === 'string' ? Number.parseFloat(sizeRaw) : undefined
        const priceRaw = payload.price
        const price =
          typeof priceRaw === 'number' ? priceRaw : typeof priceRaw === 'string' ? Number.parseFloat(priceRaw) : undefined
        const sizeText = size !== undefined && Number.isFinite(size) ? size.toFixed(4) : '?'
        const priceText = price !== undefined && Number.isFinite(price) ? (price * 100).toFixed(2) : '?'

        const outcomeLower = typeof outcome === 'string' ? outcome.toLowerCase() : ''
        const upLower = upLabel.toLowerCase()
        const downLower = downLabel.toLowerCase()
        const line = `[${ts}] ${sideText} ${outcome} @ ${priceText}`
        const proxyRaw = payload.proxyWallet ?? payload.proxy_wallet
        const proxyLower = typeof proxyRaw === 'string' ? proxyRaw.toLowerCase() : ''
        const isHighlighted = Boolean(highlightAddress && proxyLower === highlightAddress)
        if (outcomeLower === upLower) {
          appendTradeLogUp(line, isHighlighted)
        } else if (outcomeLower === downLower) {
          appendTradeLogDown(line, isHighlighted)
        } else {
          appendTradeLogUp(line, isHighlighted)
        }
      }

      rtds.onclose = () => {
        if (rtdsPingIdRef.current !== null) {
          window.clearInterval(rtdsPingIdRef.current)
          rtdsPingIdRef.current = null
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '请求失败'
      setState({ status: 'error', error: message })
      appendSpreadLog(`[${new Date().toLocaleTimeString()}] 请求市场信息失败：${message}`)
    }
  }, [appendSpreadLog, appendTradeLogDown, appendTradeLogUp, highlightAddress, slug, state.status, stop])

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false
      if (wsPingIdRef.current !== null) {
        window.clearInterval(wsPingIdRef.current)
        wsPingIdRef.current = null
      }
      const ws = wsRef.current
      wsRef.current = null
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
    }
  }, [])

  const canStart = Boolean(slug) && state.status !== 'connecting' && state.status !== 'listening'

  return (
    <main className="flex w-full flex-col gap-4">
      <Card shadow="sm" radius="lg">
        <CardHeader className="flex flex-col items-start gap-2">
          <h1 className="text-lg font-semibold">价差监控工具</h1>
          <p className="text-foreground/70 text-xs">
            输入 Polymarket 市场链接或 slug，实时监听 Up/Down 价格总和，当偏离 100 太多（小于 98 或大于 102）时输出到日志。
          </p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <Input
                label="市场 URL 或 slug"
                labelPlacement="outside"
                size="sm"
                value={marketInput}
                onChange={e => setMarketInput(e.target.value)}
                placeholder="https://polymarket.com/market/..."
                isInvalid={Boolean(marketInput.trim()) && !slug}
              />
              <div className="text-foreground/60 mt-1 text-[11px]">
                {slug ? `已解析 slug：${slug}` : '支持直接粘贴 Polymarket 市场链接。'}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" color="primary" isDisabled={!canStart} onPress={() => void start()}>
                {state.status === 'connecting' ? '连接中…' : '开始监听'}
              </Button>
              <Button size="sm" variant="bordered" isDisabled={state.status !== 'listening'} onPress={() => stop()}>
                停止
              </Button>
            </div>
          </div>
          {state.status === 'error' ? (
            <div className="text-danger text-xs">错误：{state.error}</div>
          ) : state.status === 'listening' ? (
            <div className="text-success text-xs">已连接，正在监听 {state.slug} …</div>
          ) : null}
        </CardBody>
      </Card>

      <Card shadow="sm" radius="lg">
        <CardHeader className="flex flex-col items-start gap-1">
          <h2 className="text-sm font-semibold">价差日志</h2>
          <p className="text-foreground/70 text-[11px]">
            当两个 outcome 的价格总和小于 98 或大于 102 时，输出一条记录。价格按 0–1 概率刻度换算为 0–100。
          </p>
        </CardHeader>
        <CardBody>
          <div
            ref={spreadLogRef}
            className="border-default-200 rounded-medium bg-content2 text-foreground h-64 w-full overflow-auto border px-3 py-2 font-mono text-xs"
          >
            {spreadLogs.length === 0 ? (
              <div className="text-foreground/60">点击「开始监听」后，这里会显示价差信号。</div>
            ) : (
              spreadLogs.map((line, idx) => <div key={idx}>{line}</div>)
            )}
          </div>
        </CardBody>
      </Card>

      <Card shadow="sm" radius="lg">
        <CardHeader className="flex flex-col items-start gap-2">
          <h2 className="text-sm font-semibold">高亮地址</h2>
          <p className="text-foreground/70 text-[11px]">
            输入需要重点关注的地址，如果成交记录中的 proxyWallet 与该地址完全一致，则在对应方向的成交日志中以红色高亮显示。
          </p>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="flex-1">
              <Input
                label="Proxy Wallet 地址"
                labelPlacement="outside"
                size="sm"
                value={highlightAddressInput}
                onChange={e => setHighlightAddressInput(e.target.value)}
                placeholder="0x 开头的地址，例如 0xabc...123"
              />
              <div className="text-foreground/60 mt-1 text-[11px]">
                仅做精确匹配，不会自动补全或忽略大小写差异。
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card shadow="sm" radius="lg">
        <CardHeader className="flex flex-col items-start gap-1">
          <h2 className="text-sm font-semibold">成交日志 - Up</h2>
          <p className="text-foreground/70 text-[11px]">只显示 Up 方向的成交（买入/卖出 + 价格）。</p>
        </CardHeader>
        <CardBody>
          <div
            ref={tradeLogUpRef}
            className="border-default-200 rounded-medium bg-content2 text-foreground h-80 w-full overflow-auto border px-3 py-2 font-mono text-xs"
          >
            {tradeLogsUp.length === 0 ? (
              <div className="text-foreground/60">连接成功并有 Up 成交后，这里会显示记录。</div>
            ) : (
              tradeLogsUp.map((entry, idx) => (
                <div key={idx} className={entry.highlighted ? 'text-red-500 font-semibold' : undefined}>
                  {entry.text}
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      <Card shadow="sm" radius="lg">
        <CardHeader className="flex flex-col items-start gap-1">
          <h2 className="text-sm font-semibold">成交日志 - Down</h2>
          <p className="text-foreground/70 text-[11px]">只显示 Down 方向的成交（买入/卖出 + 价格）。</p>
        </CardHeader>
        <CardBody>
          <div
            ref={tradeLogDownRef}
            className="border-default-200 rounded-medium bg-content2 text-foreground h-80 w-full overflow-auto border px-3 py-2 font-mono text-xs"
          >
            {tradeLogsDown.length === 0 ? (
              <div className="text-foreground/60">连接成功并有 Down 成交后，这里会显示记录。</div>
            ) : (
              tradeLogsDown.map((entry, idx) => (
                <div key={idx} className={entry.highlighted ? 'text-red-500 font-semibold' : undefined}>
                  {entry.text}
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </main>
  )
}
