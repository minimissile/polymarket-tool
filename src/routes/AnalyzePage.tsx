import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AddressBar } from '../components/AddressBar'
import { PositionsTable } from '../components/PositionsTable'
import { TraderCharts } from '../components/TraderCharts'
import { TradesTable } from '../components/TradesTable'
import { inferTraderProfile, summarizeTrader } from '../lib/analytics'
import { formatDateTime, formatNumber, formatPercent, formatUsd } from '../lib/format'
import { readJson, writeJson } from '../lib/storage'
import { isEvmAddress, normalizeAddress } from '../lib/validate'
import { useTraderData } from '../hooks/useTraderData'
import { useAppState } from '../state/appState'

function resolveUser(paramUser: string | undefined, searchUser: string | null, fallbackUser: string | undefined) {
  const candidates = [paramUser, searchUser ?? undefined, fallbackUser]
  for (const v of candidates) {
    if (!v) continue
    const normalized = normalizeAddress(v)
    if (isEvmAddress(normalized)) return normalized
  }
  return undefined
}

export default function AnalyzePage() {
  const navigate = useNavigate()
  const params = useParams<{ user?: string }>()
  const [searchParams] = useSearchParams()
  const { selectedUser, setSelectedUser, lastSeenByUser, markTradesAsSeen, addToWatchlist } = useAppState()

  const routeUser = useMemo(() => {
    return resolveUser(params.user, searchParams.get('user'), selectedUser)
  }, [params.user, searchParams, selectedUser])

  const [addressInput, setAddressInput] = useState(() => {
    if (routeUser) return routeUser
    const last = readJson<string>('pmta.lastAddressInput', '')
    return last
  })

  const normalizedInput = useMemo(() => normalizeAddress(addressInput), [addressInput])
  const inputValid = useMemo(() => isEvmAddress(normalizedInput), [normalizedInput])

  const selected = useTraderData(routeUser, { enabled: Boolean(routeUser), pollMs: 12_000 })

  useEffect(() => {
    writeJson('pmta.lastAddressInput', normalizedInput as never)
  }, [normalizedInput])

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

  const selectedSummary = useMemo(() => {
    if (!routeUser) return undefined
    return summarizeTrader(routeUser, selected.data.trades, selected.data.activity, selected.data.positions)
  }, [routeUser, selected.data.activity, selected.data.positions, selected.data.trades])

  const selectedProfile = useMemo(() => {
    if (!routeUser) return undefined
    return inferTraderProfile(selected.data.trades, selected.data.activity)
  }, [routeUser, selected.data.activity, selected.data.trades])

  const newTradeCount = useMemo(() => {
    if (!routeUser) return 0
    if (selected.data.trades.length === 0) return 0
    const lastSeenTradeTs = lastSeenByUser[routeUser.toLowerCase()] ?? 0
    const latestTs = selected.data.trades.reduce((acc, t) => Math.max(acc, t.timestamp), 0)
    if (latestTs <= lastSeenTradeTs) return 0
    return selected.data.trades.filter((t) => t.timestamp > lastSeenTradeTs).length
  }, [lastSeenByUser, routeUser, selected.data.trades])

  const markAsSeen = () => {
    if (!routeUser) return
    const latestTs = selected.data.trades.reduce((acc, t) => Math.max(acc, t.timestamp), 0)
    markTradesAsSeen(routeUser, latestTs)
  }

  return (
    <main className="page">
      <div className="pageHeader">
        <AddressBar
          value={addressInput}
          onChange={setAddressInput}
          onAnalyze={onAnalyze}
          onAddToWatchlist={onWatch}
          disabled={selected.status === 'loading'}
        />
        {inputValid ? (
          <div className="hint">
            <span className="muted">提示：</span>
            「分析」会跳转到该交易员详情页；「观察」会加入观察列表并后台更新。
          </div>
        ) : (
          <div className="hint">
            <span className="muted">提示：</span>
            输入 `0x` 开头的 EVM 地址
          </div>
        )}
      </div>

      {!routeUser ? (
        <div className="empty bigEmpty">输入地址并点击「分析」后查看交易员详情</div>
      ) : (
        <>
          <div className="summaryBar">
            <div className="summaryLeft">
              <div className="sectionTitle">当前交易员</div>
              <div className="mono">{routeUser}</div>
            </div>
            <div className="summaryRight">
              {newTradeCount > 0 ? (
                <div className="liveRow">
                  <span className="liveBadge" aria-label="检测到新交易">
                    实时
                  </span>
                  <span className="muted">新交易 {newTradeCount} 笔</span>
                  <button className="button" onClick={markAsSeen} aria-label="标记新交易为已读">
                    已读
                  </button>
                </div>
              ) : null}
              {selected.status === 'loading' ? <span className="muted">加载中…</span> : null}
              {selected.error ? <span className="errorText">数据更新失败：{selected.error}</span> : null}
              {selected.data.lastUpdatedAtMs ? (
                <span className="muted">最近刷新：{new Date(selected.data.lastUpdatedAtMs).toLocaleTimeString()}</span>
              ) : null}
            </div>
          </div>

          {selectedSummary ? (
            <div className="kpiGrid">
              <div className="kpi">
                <div className="kpiLabel">现金收益</div>
                <div className={`kpiValue ${selectedSummary.cashPnl >= 0 ? 'pos' : 'neg'}`}>
                  {formatUsd(selectedSummary.cashPnl)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">收益率（估算）</div>
                <div className={`kpiValue ${selectedSummary.percentPnl >= 0 ? 'pos' : 'neg'}`}>
                  {formatPercent(selectedSummary.percentPnl)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">交易量（USDC）</div>
                <div className="kpiValue">{formatUsd(selectedSummary.tradeVolumeUsd)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">交易数</div>
                <div className="kpiValue">{selectedSummary.tradeCount}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">持仓市值</div>
                <div className="kpiValue">{formatUsd(selectedSummary.currentValue)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">最近交易</div>
                <div className="kpiValue">{selectedSummary.lastTradeTs ? formatDateTime(selectedSummary.lastTradeTs) : '—'}</div>
              </div>
              {selectedProfile ? (
                <>
                  <div className="kpi">
                    <div className="kpiLabel">持仓偏好</div>
                    <div className="kpiValue">{selectedProfile.holdingPreference}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">活跃时段</div>
                    <div className="kpiValue">
                      {selectedProfile.activeHours.length ? selectedProfile.activeHours.map((h) => `${h}:00`).join(' / ') : '—'}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">单笔均值</div>
                    <div className="kpiValue">{formatUsd(selectedProfile.avgTradeUsd)}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">最大单笔（近似）</div>
                    <div className="kpiValue">{formatUsd(selectedProfile.maxSingleTradeUsd)}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">交易尺度稳定性（CV）</div>
                    <div className="kpiValue">{formatNumber(selectedProfile.tradeSizeCv, { maximumFractionDigits: 2 })}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">P90 单笔（近似）</div>
                    <div className="kpiValue">{formatUsd(selectedProfile.p90TradeUsd)}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpiLabel">单市场集中度</div>
                    <div className="kpiValue">{formatPercent(selectedProfile.topMarketConcentration * 100)}</div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <TraderCharts trades={selected.data.trades} activity={selected.data.activity} />
          <PositionsTable positions={selected.data.positions} />
          <TradesTable trades={selected.data.trades} />
        </>
      )}
    </main>
  )
}

