import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { formatDateTime } from '../lib/format'
import { getActivityByUser, getGammaMarketBySlug, getTradesByUser } from '../lib/polymarketDataApi'
import { readJson, writeJson } from '../lib/storage'
import { isEvmAddress, normalizeAddress } from '../lib/validate'

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

function toCsv(rows: Record<string, string | number | boolean | null | undefined>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: string | number | boolean | null | undefined) => {
    const s = String(v ?? '')
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(','))
  return lines.join('\n')
}

function downloadBlobFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function parseMarketSlugFromInput(input: string) {
  const raw = (input ?? '').trim()
  if (!raw) return undefined

  if (!/^https?:\/\//i.test(raw)) return raw

  try {
    const url = new URL(raw)
    const segments = url.pathname.split('/').filter(Boolean)
    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i].toLowerCase()
      if (seg === 'event' || seg === 'market') {
        const next = segments[i + 1]
        return next ? decodeURIComponent(next).trim() : undefined
      }
    }
    const last = segments[segments.length - 1]
    return last ? decodeURIComponent(last).trim() : undefined
  } catch {
    return undefined
  }
}

async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; rawCount: number }>,
  options?: { pageSize?: number; maxPages?: number }
) {
  const pageSize = options?.pageSize ?? 200
  const maxPages = options?.maxPages ?? 500

  const rows: T[] = []
  let offset = 0
  for (let i = 0; i < maxPages; i += 1) {
    const page = await fetchPage(offset, pageSize)
    rows.push(...page.rows)
    if (page.rawCount < pageSize) break
    offset += pageSize
  }
  return rows
}

export default function ExportPage() {
  const [addressInput, setAddressInput] = useState(() => readJson<string>('pmta.export.addressInput', ''))
  const [marketInput, setMarketInput] = useState(() => readJson<string>('pmta.export.marketInput', ''))
  const [tab, setTab] = useState<'market' | 'range'>('market')
  const [format, setFormat] = useState<'json' | 'csv' | 'excel'>(() => {
    const saved = readJson<'json' | 'csv' | 'excel'>('pmta.export.format', 'json')
    if (saved === 'csv' || saved === 'excel') return saved
    return 'json'
  })
  const [status, setStatus] = useState<'idle' | 'running' | 'error' | 'done'>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [logs, setLogs] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement | null>(null)
  const cancelRef = useRef(false)
  const [range, setRange] = useState<'15m' | '1h' | '1d' | '7d'>(() => {
    const saved = readJson<'15m' | '1h' | '1d' | '7d'>('pmta.export.range', '15m')
    if (saved === '1h' || saved === '1d' || saved === '7d') return saved
    return '15m'
  })

  const normalizedAddress = useMemo(() => normalizeAddress(addressInput), [addressInput])
  const addressValid = useMemo(() => isEvmAddress(normalizedAddress), [normalizedAddress])

  const exportSlug = useMemo(() => {
    const raw = parseMarketSlugFromInput(marketInput)
    const normalized = (raw ?? '').trim().toLowerCase()
    return normalized || undefined
  }, [marketInput])
  const slugValid = Boolean(exportSlug)

  useEffect(() => {
    writeJson('pmta.export.addressInput', normalizedAddress as never)
  }, [normalizedAddress])

  useEffect(() => {
    writeJson('pmta.export.marketInput', marketInput as never)
  }, [marketInput])

  useEffect(() => {
    writeJson('pmta.export.format', format as never)
  }, [format])

  useEffect(() => {
    writeJson('pmta.export.range', range as never)
  }, [range])

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [logs.length])

  const appendLog = (line: string) => {
    const now = new Date()
    const ts = now.toLocaleTimeString()
    setLogs(prev => [...prev, `[${ts}] ${line}`])
  }

  const canExportMarket = addressValid && slugValid && status !== 'running'
  const canExportRange = addressValid && status !== 'running'

  const onExport = async () => {
    if (!canExportMarket || !exportSlug) return

    cancelRef.current = false
    setStatus('running')
    setError(undefined)
    setLogs([])

    const user = normalizedAddress.toLowerCase()
    const slug = exportSlug

    try {
      appendLog('准备获取 market 信息…')
      const market = await getGammaMarketBySlug(slug, { timeoutMs: 12_000 }).catch(() => undefined)
      const conditionId = market?.conditionId?.trim() || undefined

      if (!market) appendLog('未从 Gamma API 获取到 market 信息，将仅按 slug 过滤。')
      else appendLog(`已获取 market：${market.question ?? slug}`)

      const tradeMatches = (t: { slug?: string; conditionId?: string }) => {
        const tSlug = (t.slug ?? '').toLowerCase()
        if (tSlug && tSlug === slug) return true
        if (conditionId && t.conditionId && t.conditionId === conditionId) return true
        return false
      }
      const activityMatches = (a: { slug?: string; conditionId?: string }) => {
        const aSlug = (a.slug ?? '').toLowerCase()
        if (aSlug && aSlug === slug) return true
        if (conditionId && a.conditionId && a.conditionId === conditionId) return true
        return false
      }

      const candidates = [conditionId, slug].filter(Boolean) as string[]

      const pickMarketParamForTrades = async () => {
        for (const marketParam of candidates) {
          appendLog(`尝试 trades.market = ${marketParam} 采样…`)
          const sample = await getTradesByUser(
            user,
            { limit: 30, offset: 0, market: marketParam, takerOnly: false },
            { timeoutMs: 12_000 }
          )
          if (sample.some(tradeMatches)) {
            appendLog(`确认使用 trades.market = ${marketParam}`)
            return marketParam
          }
        }
        appendLog('未找到合适的 trades.market，回退为客户端过滤。')
        return undefined
      }

      const pickMarketParamForActivity = async () => {
        for (const marketParam of candidates) {
          appendLog(`尝试 activity.market = ${marketParam} 采样…`)
          const sample = await getActivityByUser(user, { limit: 30, offset: 0, market: marketParam }, { timeoutMs: 12_000 })
          if (sample.some(activityMatches)) {
            appendLog(`确认使用 activity.market = ${marketParam}`)
            return marketParam
          }
        }
        appendLog('未找到合适的 activity.market，回退为客户端过滤。')
        return undefined
      }

      appendLog('检测可用的 market 参数…')
      const [tradeMarketParam, activityMarketParam] = await Promise.all([
        pickMarketParamForTrades(),
        pickMarketParamForActivity()
      ])

      appendLog('开始拉取 trades 全量数据…')
      const allTradesRaw = await fetchAllPages(
        async (offset, limit) => {
          if (cancelRef.current) return { rows: [], rawCount: 0 }
          const page = await getTradesByUser(
            user,
            { limit, offset, market: tradeMarketParam, takerOnly: false },
            { timeoutMs: 12_000 }
          )
          appendLog(`trades 第 ${offset / limit + 1} 页：返回 ${page.length} 条`)
          return { rows: tradeMarketParam ? page : page.filter(tradeMatches), rawCount: page.length }
        },
        { pageSize: 200, maxPages: 500 }
      )

      appendLog('开始拉取 activity 全量数据…')
      const allActivityRaw = await fetchAllPages(
        async (offset, limit) => {
          if (cancelRef.current) return { rows: [], rawCount: 0 }
          const page = await getActivityByUser(user, { limit, offset, market: activityMarketParam }, { timeoutMs: 12_000 })
          appendLog(`activity 第 ${offset / limit + 1} 页：返回 ${page.length} 条`)
          return { rows: activityMarketParam ? page : page.filter(activityMatches), rawCount: page.length }
        },
        { pageSize: 200, maxPages: 500 }
      )

      appendLog('开始去重与排序…')

      const tradeKey = (t: {
        timestamp: number
        transactionHash?: string
        asset?: string
        conditionId?: string
        side?: string
        outcomeIndex?: number
        price?: number
        size?: number
      }) => {
        const hash = t.transactionHash?.trim()
        if (hash) return `${t.timestamp}:${hash}`
        return `${t.timestamp}:${t.asset ?? ''}:${t.conditionId ?? ''}:${t.side ?? ''}:${t.outcomeIndex ?? ''}:${t.price ?? ''}:${t.size ?? ''}`
      }
      const activityKey = (a: { timestamp: number; transactionHash?: string; type?: string; asset?: string }) => {
        return `${a.timestamp}:${a.transactionHash ?? ''}:${a.type ?? ''}:${a.asset ?? ''}`
      }

      const dedupTrades: typeof allTradesRaw = []
      const seenTrade = new Set<string>()
      for (const t of allTradesRaw) {
        const key = tradeKey(t)
        if (seenTrade.has(key)) continue
        seenTrade.add(key)
        dedupTrades.push(t)
      }

      const dedupActivity: typeof allActivityRaw = []
      const seenActivity = new Set<string>()
      for (const a of allActivityRaw) {
        const key = activityKey(a)
        if (seenActivity.has(key)) continue
        seenActivity.add(key)
        dedupActivity.push(a)
      }

      dedupTrades.sort((a, b) => a.timestamp - b.timestamp)
      dedupActivity.sort((a, b) => a.timestamp - b.timestamp)

      appendLog(`去重后 trades ${dedupTrades.length} 条，activity ${dedupActivity.length} 条。`)

      const jsonTrades = dedupTrades.map(t => {
        const { asset, eventSlug, conditionId, ...rest } = t
        return rest
      })
      const jsonActivity = dedupActivity.map(a => {
        const { asset, eventSlug, conditionId, ...rest } = a
        return rest
      })

      const payload = {
        exportedAtMs: Date.now(),
        user,
        market: {
          input: marketInput.trim(),
          slug,
          question: market?.question,
          conditionId: market?.conditionId,
          endDate: market?.endDate ?? market?.endDateIso,
          resolutionSource: market?.resolutionSource
        },
        trades: jsonTrades,
        activity: jsonActivity
      }

      const fileSafeSlug = slug.replace(/[^a-z0-9._-]/gi, '_')
      const fileSafeUser = `${user.slice(0, 6)}_${user.slice(-4)}`
      const baseName = `pmta-market-${fileSafeSlug}-${fileSafeUser}-${Date.now()}`

      appendLog('生成 JSON 文件…')
      downloadTextFile(`${baseName}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')

      if (format === 'json') {
        appendLog('已选择仅导出 JSON，跳过表格文件。')
        window.dispatchEvent(
          new CustomEvent('pmta:notify', {
            detail: { message: `已导出 JSON：交易 ${dedupTrades.length} 笔 / 流水 ${dedupActivity.length} 条`, withTone: false }
          })
        )
        setStatus('done')
        return
      }

      appendLog(format === 'excel' ? '生成 trades Excel…' : '生成 trades CSV…')
      const tradeRows = dedupTrades.map(t => ({
        ts: t.timestamp,
        time: formatDateTime(t.timestamp),
        side: t.side,
        size: t.size,
        price: t.price,
        amountUsd: (t.size ?? 0) * (t.price ?? 0),
        outcome: t.outcome ?? '',
        outcomeIndex: t.outcomeIndex ?? '',
        transactionHash: t.transactionHash ?? '',
        title: t.title ?? '',
        slug: t.slug ?? ''
      }))

      appendLog(format === 'excel' ? '生成 activity Excel…' : '生成 activity CSV…')
      const activityRows = dedupActivity.map(a => ({
        ts: a.timestamp,
        time: formatDateTime(a.timestamp),
        type: a.type,
        side: a.side ?? '',
        size: a.size ?? '',
        usdcSize: a.usdcSize ?? '',
        price: a.price ?? '',
        outcome: a.outcome ?? '',
        outcomeIndex: a.outcomeIndex ?? '',
        transactionHash: a.transactionHash ?? '',
        title: a.title ?? '',
        slug: a.slug ?? ''
      }))

      if (format === 'csv') {
        const tradeCsv = toCsv(tradeRows)
        const activityCsv = toCsv(activityRows)
        if (tradeCsv) downloadTextFile(`${baseName}.trades.csv`, tradeCsv, 'text/csv;charset=utf-8')
        if (activityCsv) downloadTextFile(`${baseName}.activity.csv`, activityCsv, 'text/csv;charset=utf-8')
      } else {
        if (tradeRows.length > 0) {
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(tradeRows)
          XLSX.utils.book_append_sheet(wb, ws, 'trades')
          const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
          const blob = new Blob([wbArray], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          })
          downloadBlobFile(`${baseName}.trades.xlsx`, blob)
        }
        if (activityRows.length > 0) {
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(activityRows)
          XLSX.utils.book_append_sheet(wb, ws, 'activity')
          const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
          const blob = new Blob([wbArray], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          })
          downloadBlobFile(`${baseName}.activity.xlsx`, blob)
        }
      }

      appendLog('导出完成。')

      window.dispatchEvent(
        new CustomEvent('pmta:notify', {
          detail: { message: `已导出：交易 ${dedupTrades.length} 笔 / 流水 ${dedupActivity.length} 条`, withTone: false }
        })
      )

      setStatus('done')
    } catch (e) {
      const message = e instanceof Error ? e.message : '导出失败'
      setStatus('error')
      setError(message)
      appendLog(`导出失败：${message}`)
    }
  }

  const onExportRange = async () => {
    if (!canExportRange) return

    cancelRef.current = false
    setStatus('running')
    setError(undefined)
    setLogs([])

    const user = normalizedAddress.toLowerCase()
    const nowSec = Date.now() / 1000
    const fromSec =
      range === '15m' ? nowSec - 900 : range === '1h' ? nowSec - 3600 : range === '1d' ? nowSec - 86400 : nowSec - 7 * 86400

    try {
      appendLog('开始拉取时间范围内的 trades 全量数据…')
      const allTradesRaw: {
        timestamp: number
        transactionHash?: string
        asset?: string
        conditionId?: string
        side?: string
        outcomeIndex?: number
        price?: number
        size?: number
        title?: string
        slug?: string
        eventSlug?: string
        outcome?: string
      }[] = []
      {
        const pageSize = 200
        const maxPages = 500
        const targetCount = 2000
        let collected = 0
        let stop = false
        for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
          if (cancelRef.current) {
            appendLog('检测到停止标记，终止 trades 请求。')
            stop = true
            break
          }
          const offset = pageIndex * pageSize
          const page = await getTradesByUser(user, { limit: pageSize, offset, takerOnly: false }, { timeoutMs: 12_000 })
          if (!page.length) break
          let pageMinTs = Number.POSITIVE_INFINITY
          let pageMaxTs = 0
          for (const t of page) {
            if (t.timestamp <= nowSec) {
              allTradesRaw.push(t)
              collected += 1
            }
            if (t.timestamp > 0) {
              pageMinTs = Math.min(pageMinTs, t.timestamp)
              pageMaxTs = Math.max(pageMaxTs, t.timestamp)
            }
            if (collected >= targetCount) {
              stop = true
              break
            }
          }
          if (pageMinTs === Number.POSITIVE_INFINITY) break
          const minLabel = new Date(pageMinTs * 1000).toLocaleTimeString()
          const maxLabel = new Date(pageMaxTs * 1000).toLocaleTimeString()
          appendLog(
            `trades 第 ${pageIndex + 1} 页：返回 ${page.length} 条，时间范围：${minLabel} ~ ${maxLabel}，累计 ${collected} 条`
          )

          if (pageMaxTs < fromSec) {
            stop = true
          }
          if (page.length < pageSize || stop) break
        }
      }

      appendLog('开始拉取时间范围内的 activity 全量数据…')
      const allActivityRaw: {
        timestamp: number
        transactionHash?: string
        type?: string
        asset?: string
        size?: number
        usdcSize?: number
        price?: number
        side?: string
        conditionId?: string
        title?: string
        slug?: string
        eventSlug?: string
        outcome?: string
        outcomeIndex?: number
      }[] = []
      {
        const pageSize = 200
        const maxPages = 500
        const targetCount = 2000
        let collected = 0
        let stop = false
        for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
          if (cancelRef.current) {
            appendLog('检测到停止标记，终止 activity 请求。')
            stop = true
            break
          }
          const offset = pageIndex * pageSize
          const page = await getActivityByUser(user, { limit: pageSize, offset }, { timeoutMs: 12_000 })
          if (!page.length) break
          let pageMinTs = Number.POSITIVE_INFINITY
          let pageMaxTs = 0
          for (const a of page) {
            if (a.timestamp <= nowSec) {
              allActivityRaw.push(a)
              collected += 1
            }
            if (a.timestamp > 0) {
              pageMinTs = Math.min(pageMinTs, a.timestamp)
              pageMaxTs = Math.max(pageMaxTs, a.timestamp)
            }
            if (collected >= targetCount) {
              stop = true
              break
            }
          }
          if (pageMinTs === Number.POSITIVE_INFINITY) break
          const minLabel = new Date(pageMinTs * 1000).toLocaleTimeString()
          const maxLabel = new Date(pageMaxTs * 1000).toLocaleTimeString()
          appendLog(
            `activity 第 ${pageIndex + 1} 页：返回 ${page.length} 条，时间范围：${minLabel} ~ ${maxLabel}，累计 ${collected} 条`
          )

          if (pageMaxTs < fromSec) {
            stop = true
          }
          if (page.length < pageSize || stop) break
        }
      }

      appendLog('按时间范围过滤、去重与排序…')

      const tradeKey = (t: {
        timestamp: number
        transactionHash?: string
        asset?: string
        conditionId?: string
        side?: string
        outcomeIndex?: number
        price?: number
        size?: number
      }) => {
        const hash = t.transactionHash?.trim()
        if (hash) return `${t.timestamp}:${hash}`
        return `${t.timestamp}:${t.asset ?? ''}:${t.conditionId ?? ''}:${t.side ?? ''}:${t.outcomeIndex ?? ''}:${t.price ?? ''}:${t.size ?? ''}`
      }
      const activityKey = (a: { timestamp: number; transactionHash?: string; type?: string; asset?: string }) => {
        return `${a.timestamp}:${a.transactionHash ?? ''}:${a.type ?? ''}:${a.asset ?? ''}`
      }

      const dedupTrades: typeof allTradesRaw = []
      const seenTrade = new Set<string>()
      for (const t of allTradesRaw) {
        if (t.timestamp < fromSec) continue
        const key = tradeKey(t)
        if (seenTrade.has(key)) continue
        seenTrade.add(key)
        dedupTrades.push(t)
      }

      const dedupActivity: typeof allActivityRaw = []
      const seenActivity = new Set<string>()
      for (const a of allActivityRaw) {
        if (a.timestamp < fromSec) continue
        const key = activityKey(a)
        if (seenActivity.has(key)) continue
        seenActivity.add(key)
        dedupActivity.push(a)
      }

      dedupTrades.sort((a, b) => a.timestamp - b.timestamp)
      dedupActivity.sort((a, b) => a.timestamp - b.timestamp)

      appendLog(`过滤后 trades ${dedupTrades.length} 条，activity ${dedupActivity.length} 条。`)

      const jsonTrades = dedupTrades.map(t => {
        const { asset, eventSlug, conditionId, ...rest } = t
        return rest
      })
      const jsonActivity = dedupActivity.map(a => {
        const { asset, eventSlug, conditionId, ...rest } = a
        return rest
      })

      const payload = {
        exportedAtMs: Date.now(),
        user,
        range,
        fromTs: Math.floor(fromSec),
        toTs: Math.floor(nowSec),
        trades: jsonTrades,
        activity: jsonActivity
      }

      const fileSafeUser = `${user.slice(0, 6)}_${user.slice(-4)}`
      const baseName = `pmta-range-${range}-${fileSafeUser}-${Date.now()}`

      appendLog('生成 JSON 文件…')
      downloadTextFile(`${baseName}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')

      if (format === 'json') {
        appendLog('已选择仅导出 JSON，跳过表格文件。')
        window.dispatchEvent(
          new CustomEvent('pmta:notify', {
            detail: { message: `已导出 JSON：交易 ${dedupTrades.length} 笔 / 流水 ${dedupActivity.length} 条`, withTone: false }
          })
        )
        setStatus('done')
        return
      }

      appendLog(format === 'excel' ? '生成 trades Excel…' : '生成 trades CSV…')
      const tradeRows = dedupTrades.map(t => ({
        ts: t.timestamp,
        time: formatDateTime(t.timestamp),
        side: t.side,
        size: t.size,
        price: t.price,
        amountUsd: (t.size ?? 0) * (t.price ?? 0),
        outcome: t.outcome ?? '',
        outcomeIndex: t.outcomeIndex ?? '',
        transactionHash: t.transactionHash ?? '',
        title: t.title ?? '',
        slug: t.slug ?? ''
      }))

      appendLog(format === 'excel' ? '生成 activity Excel…' : '生成 activity CSV…')
      const activityRows = dedupActivity.map(a => ({
        ts: a.timestamp,
        time: formatDateTime(a.timestamp),
        type: a.type,
        side: a.side ?? '',
        size: a.size ?? '',
        usdcSize: a.usdcSize ?? '',
        price: a.price ?? '',
        outcome: a.outcome ?? '',
        outcomeIndex: a.outcomeIndex ?? '',
        transactionHash: a.transactionHash ?? '',
        title: a.title ?? '',
        slug: a.slug ?? ''
      }))

      if (format === 'csv') {
        const tradeCsv = toCsv(tradeRows)
        const activityCsv = toCsv(activityRows)
        if (tradeCsv) downloadTextFile(`${baseName}.trades.csv`, tradeCsv, 'text/csv;charset=utf-8')
        if (activityCsv) downloadTextFile(`${baseName}.activity.csv`, activityCsv, 'text/csv;charset=utf-8')
      } else {
        if (tradeRows.length > 0) {
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(tradeRows)
          XLSX.utils.book_append_sheet(wb, ws, 'trades')
          const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
          const blob = new Blob([wbArray], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          })
          downloadBlobFile(`${baseName}.trades.xlsx`, blob)
        }
        if (activityRows.length > 0) {
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.json_to_sheet(activityRows)
          XLSX.utils.book_append_sheet(wb, ws, 'activity')
          const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
          const blob = new Blob([wbArray], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          })
          downloadBlobFile(`${baseName}.activity.xlsx`, blob)
        }
      }

      appendLog('导出完成。')

      window.dispatchEvent(
        new CustomEvent('pmta:notify', {
          detail: { message: `已导出：交易 ${dedupTrades.length} 笔 / 流水 ${dedupActivity.length} 条`, withTone: false }
        })
      )

      setStatus('done')
    } catch (e) {
      const message = e instanceof Error ? e.message : '导出失败'
      setStatus('error')
      setError(message)
      appendLog(`导出失败：${message}`)
    }
  }

  return (
    <main className="flex w-full flex-col gap-8">
      <div className="w-full">
        <div className="mb-4">
          <div className="text-xl font-bold text-slate-900 dark:text-slate-50">单市场记录导出</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            输入 Polymarket 市场 URL 和用户地址，导出该用户在该市场的全部交易与活动记录。
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex gap-2">
            <button
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                tab === 'market'
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                  : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
              onClick={() => {
                if (status === 'running') return
                setTab('market')
              }}
            >
              单市场导出
            </button>
            <button
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                tab === 'range'
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                  : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
              onClick={() => {
                if (status === 'running') return
                setTab('range')
              }}
            >
              时间范围导出
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              {tab === 'market' ? (
                <>
                  <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="exportMarketInput">
                    市场 URL（或 slug）
                  </label>
                  <input
                    id="exportMarketInput"
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-900"
                    value={marketInput}
                    onChange={e => setMarketInput(e.target.value)}
                    placeholder="https://polymarket.com/event/..."
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="text"
                    disabled={status === 'running'}
                    aria-invalid={Boolean(marketInput.trim()) && !slugValid}
                  />
                </>
              ) : (
                <>
                  <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="exportRange">
                    时间范围
                  </label>
                  <select
                    id="exportRange"
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-900"
                    value={range}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '1h' || value === '1d' || value === '7d') setRange(value as '1h' | '1d' | '7d')
                      else setRange('15m')
                    }}
                    disabled={status === 'running'}
                  >
                    <option value="15m">最近 15 分钟</option>
                    <option value="1h">最近 1 小时</option>
                    <option value="1d">最近 1 天</option>
                    <option value="7d">最近 7 天</option>
                  </select>
                </>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="exportAddressInput">
                用户地址
              </label>
              <input
                id="exportAddressInput"
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-900"
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                placeholder="0x..."
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                disabled={status === 'running'}
                aria-invalid={Boolean(addressInput.trim()) && !addressValid}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="exportFormat">
                导出格式
              </label>
              <select
                id="exportFormat"
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:ring-blue-900"
                value={format}
                onChange={e => {
                  const value = e.target.value
                  if (value === 'excel') setFormat('excel')
                  else if (value === 'csv') setFormat('csv')
                  else setFormat('json')
                }}
                disabled={status === 'running'}
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="excel">Excel（.xlsx）</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {tab === 'market'
                ? slugValid
                  ? `已解析 slug：${exportSlug}`
                  : marketInput.trim()
                    ? '无法从输入解析 slug（支持 /event/xxx 或 /market/xxx）。'
                    : '支持直接粘贴 Polymarket 市场链接。'
                : range === '15m'
                  ? '时间范围：最近 15 分钟（基于当前时间计算）。'
                  : range === '1h'
                    ? '时间范围：最近 1 小时（基于当前时间计算）。'
                    : range === '1d'
                      ? '时间范围：最近 1 天（基于当前时间计算）。'
                      : '时间范围：最近 7 天（基于当前时间计算）。'}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="cursor-pointer rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:border-blue-700 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (tab === 'market') void onExport()
                  else void onExportRange()
                }}
                disabled={status === 'running' ? true : tab === 'market' ? !canExportMarket : !canExportRange}
                aria-label="开始导出该地址在指定市场的全部记录"
              >
                {status === 'running' ? '导出中…' : '开始导出'}
              </button>
              <button
                className="cursor-pointer rounded-lg border border-slate-300 bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-50 dark:hover:bg-slate-600"
                onClick={() => {
                  cancelRef.current = true
                  setStatus('idle')
                  appendLog('已手动停止导出。')
                }}
                disabled={status !== 'running'}
                aria-label="停止当前导出任务"
              >
                停止
              </button>
            </div>
          </div>

          {error ? <div className="text-xs text-red-500">导出失败：{error}</div> : null}

          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">导出日志</div>
            <div
              ref={logRef}
              className="h-48 overflow-auto rounded-lg border border-slate-800 bg-slate-950/90 p-3 font-mono text-xs text-slate-100 dark:bg-slate-950"
            >
              {logs.length === 0 ? <div className="text-slate-500">点击「开始导出」后会在这里显示进度与详情。</div> : null}
              {logs.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
