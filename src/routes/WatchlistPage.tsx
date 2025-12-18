import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddressBar } from '../components/AddressBar'
import { Leaderboard } from '../components/Leaderboard'
import type { DataApiActivity, DataApiPosition, DataApiTrade } from '../lib/polymarketDataApi'
import { readJson, writeJson } from '../lib/storage'
import { isEvmAddress, normalizeAddress } from '../lib/validate'
import { summarizeTrader } from '../lib/analytics'
import { useAppState } from '../state/appState'

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
    return watchlist.map((user) => {
      const trades = readJson<DataApiTrade[]>(`pmta.cache.trades.${user.toLowerCase()}`, [])
      const activity = readJson<DataApiActivity[]>(`pmta.cache.activity.${user.toLowerCase()}`, [])
      const positions = readJson<DataApiPosition[]>(`pmta.cache.positions.${user.toLowerCase()}`, [])
      return summarizeTrader(user, trades, activity, positions)
    })
  }, [polling.lastRunAtMs, watchlist])

  const onAnalyze = (address: string) => {
    if (!isEvmAddress(address)) return
    const normalized = address.toLowerCase()
    setSelectedUser(normalized)
    navigate(`/trader/${normalized}`)
  }

  const onWatch = (address: string) => {
    if (!isEvmAddress(address)) return
    const normalized = address.toLowerCase()
    addToWatchlist(normalized)
    navigate(`/trader/${normalized}`)
  }

  return (
    <main className="page">
      <div className="pageHeader">
        <AddressBar value={addressInput} onChange={setAddressInput} onAnalyze={onAnalyze} onAddToWatchlist={onWatch} />
      </div>

      <div className="watchlistBar">
        <div className="leaderboardHeader">
          <div className="sectionTitle">观察列表</div>
          <div className="watchlistControls">
            {watchlist.length > 0 && !polling.lastRunAtMs && polling.status === 'loading' ? (
              <span className="muted">首次加载中…</span>
            ) : null}
            {polling.error ? <span className="errorText">更新失败：{polling.error}</span> : null}
            {polling.lastRunAtMs ? (
              <span className="muted">最近更新：{new Date(polling.lastRunAtMs).toLocaleTimeString()}</span>
            ) : null}
            <button
              className="button"
              onClick={polling.refresh}
              disabled={watchlist.length === 0 || polling.status === 'loading'}
              aria-label="立即刷新观察列表"
            >
              {polling.status === 'loading' ? '刷新中…' : '刷新'}
            </button>
          </div>
        </div>
        <div className="watchlistChips">
          {watchlist.length === 0 ? <span className="muted">暂无</span> : null}
          {watchlist.map((addr) => {
            const active = selectedUser?.toLowerCase() === addr.toLowerCase()
            return (
              <div key={addr} className={`chip ${active ? 'active' : ''}`}>
                <button className="chipMain" onClick={() => onAnalyze(addr)} aria-label={`选择 ${addr}`}>
                  <span className="mono">{addr.slice(0, 6)}…{addr.slice(-4)}</span>
                </button>
                <button className="chipClose" onClick={() => removeFromWatchlist(addr)} aria-label={`移除 ${addr}`}>
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
