import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddressBar } from '../components/AddressBar'
import { Leaderboard } from '../components/Leaderboard'
import type { DataApiActivity, DataApiPosition, DataApiTrade } from '../lib/polymarketDataApi'
import { readJson, writeJson } from '../lib/storage'
import { isEvmAddress, normalizeAddress } from '../lib/validate'
import { summarizeTrader } from '../lib/analytics'
import { useAppState } from '../state/appState'

/** 观察列表页：维护本地观察地址集合，并用缓存数据渲染排行榜。 */
export default function WatchlistPage() {
  const navigate = useNavigate()
  const { watchlist, removeFromWatchlist, sortBy, setSortBy, polling, addToWatchlist, selectedUser, setSelectedUser } =
    useAppState()

  const [addressInput, setAddressInput] = useState(() => readJson<string>('pmta.lastAddressInput', ''))
  const normalizedInput = useMemo(() => normalizeAddress(addressInput), [addressInput])

  useEffect(() => {
    writeJson('pmta.lastAddressInput', normalizedInput as never)
  }, [normalizedInput])

  const summaries = useMemo(() => {
    const lastRunAtMs = polling.lastRunAtMs
    return watchlist.map((user) => {
      const trades = readJson<DataApiTrade[]>(`pmta.cache.trades.${user.toLowerCase()}`, [])
      const activity = readJson<DataApiActivity[]>(`pmta.cache.activity.${user.toLowerCase()}`, [])
      const positions = readJson<DataApiPosition[]>(`pmta.cache.positions.${user.toLowerCase()}`, [])
      void lastRunAtMs
      return summarizeTrader(user, trades, activity, positions)
    })
  }, [polling.lastRunAtMs, watchlist])

  /** 选择某个地址进行分析（跳转到详情页并更新全局选中地址）。 */
  const onAnalyze = (address: string) => {
    if (!isEvmAddress(address)) return
    const normalized = address.toLowerCase()
    setSelectedUser(normalized)
    navigate(`/trader/${normalized}/overview`)
  }

  /** 将地址加入观察列表并跳转到详情页。 */
  const onWatch = (address: string) => {
    if (!isEvmAddress(address)) return
    const normalized = address.toLowerCase()
    addToWatchlist(normalized)
    navigate(`/trader/${normalized}/overview`)
  }

  return (
    <main className="flex flex-col gap-8 w-full">
      <div className="w-full">
        <AddressBar value={addressInput} onChange={setAddressInput} onAnalyze={onAnalyze} onAddToWatchlist={onWatch} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="text-lg font-bold text-slate-900 dark:text-slate-50">观察列表</div>
          <div className="flex items-center gap-4 text-xs">
            {watchlist.length > 0 && !polling.lastRunAtMs && polling.status === 'loading' ? (
              <span className="text-slate-400">首次加载中…</span>
            ) : null}
            {polling.error ? <span className="text-red-500">更新失败：{polling.error}</span> : null}
            {polling.lastRunAtMs ? (
              <span className="text-slate-400">最近更新：{new Date(polling.lastRunAtMs).toLocaleTimeString()}</span>
            ) : null}
            <button
              className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={polling.refresh}
              disabled={watchlist.length === 0 || polling.status === 'loading'}
              aria-label="立即刷新观察列表"
            >
              {polling.status === 'loading' ? '刷新中…' : '刷新'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {watchlist.length === 0 ? <span className="text-sm text-slate-400">暂无</span> : null}
          {watchlist.map((addr) => {
            const active = selectedUser?.toLowerCase() === addr.toLowerCase()
            return (
              <div key={addr} className={`inline-flex items-center rounded-full border text-xs font-mono transition-colors ${active ? 'bg-blue-100 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300' : 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}>
                <button className="px-3 py-1.5 cursor-pointer hover:underline" onClick={() => onAnalyze(addr)} aria-label={`选择 ${addr}`}>
                  <span className="font-mono">{addr.slice(0, 6)}…{addr.slice(-4)}</span>
                </button>
                <button className="pr-3 py-1.5 pl-1 cursor-pointer opacity-50 hover:opacity-100 text-lg leading-none" onClick={() => removeFromWatchlist(addr)} aria-label={`移除 ${addr}`}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <Leaderboard rows={summaries} selectedUser={selectedUser} onSelect={onAnalyze} sortBy={sortBy} onSortByChange={setSortBy} />
    </main>
  )
}
