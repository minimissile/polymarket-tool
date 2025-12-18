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

/** 从路由参数、查询参数与全局选中态中挑选出一个合法 EVM 地址。 */
function resolveUser(paramUser: string | undefined, searchUser: string | null, fallbackUser: string | undefined) {
  const candidates = [paramUser, searchUser ?? undefined, fallbackUser]
  for (const v of candidates) {
    if (!v) continue
    const normalized = normalizeAddress(v)
    if (isEvmAddress(normalized)) return normalized
  }
  return undefined
}

/** 分析页：输入地址并跳转到详情；展示交易、持仓、活动统计与图表。 */
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

  const activeTab = useMemo(() => {
    const raw = (searchParams.get('tab') ?? 'overview').toLowerCase()
    if (raw === 'positions') return 'positions'
    if (raw === 'trades') return 'trades'
    return 'overview'
  }, [searchParams])

  useEffect(() => {
    writeJson('pmta.lastAddressInput', normalizedInput as never)
  }, [normalizedInput])

  /** 校验并跳转到交易员详情页，同时更新全局选中地址。 */
  const onAnalyze = (address: string) => {
    if (!isEvmAddress(address)) return
    const normalized = address.toLowerCase()
    setSelectedUser(normalized)
    navigate(`/trader/${normalized}`)
  }

  /** 把地址加入观察列表，并跳转到交易员详情页。 */
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

  /** 将当前用户最新一笔交易时间戳写入“已读”，用于清零新交易提示。 */
  const markAsSeen = () => {
    if (!routeUser) return
    const latestTs = selected.data.trades.reduce((acc, t) => Math.max(acc, t.timestamp), 0)
    markTradesAsSeen(routeUser, latestTs)
  }

  /** 切换模块 Tab，并写入 URL 查询参数，便于分享/刷新后保持一致。 */
  const setTab = (next: 'overview' | 'positions' | 'trades') => {
    const user = routeUser
    if (!user) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    navigate(`/trader/${user}?${nextParams.toString()}`, { replace: true })
  }

  return (
    <main className="flex flex-col gap-8 w-full">
      <div className="w-full">
        <AddressBar
          value={addressInput}
          onChange={setAddressInput}
          onAnalyze={onAnalyze}
          onAddToWatchlist={onWatch}
          disabled={selected.status === 'loading'}
        />
        {inputValid ? (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm flex items-start gap-2">
            <span className="font-semibold whitespace-nowrap">提示：</span>
            「分析」会跳转到该交易员详情页；「观察」会加入观察列表并后台更新。
          </div>
        ) : (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg text-sm flex items-start gap-2">
            <span className="font-semibold whitespace-nowrap">提示：</span>
            输入 `0x` 开头的 EVM 地址
          </div>
        )}
      </div>

      {!routeUser ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <div className="text-4xl mb-4">🔍</div>
          <div className="text-lg font-medium text-slate-900 dark:text-slate-50">输入地址并点击「分析」后查看交易员详情</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">支持查看交易热力图、持仓分布、资金曲线等详细数据</div>
        </div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400">当前交易员</div>
              <div className="font-mono text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-50 break-all">{routeUser}</div>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              {newTradeCount > 0 ? (
                <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-800">
                  <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-sm animate-pulse" aria-label="检测到新交易">
                    实时
                  </span>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">新交易 {newTradeCount} 笔</span>
                  <button className="text-xs font-semibold text-emerald-600 dark:text-emerald-500 hover:text-emerald-800 dark:hover:text-emerald-300 underline decoration-emerald-300 dark:decoration-emerald-700" onClick={markAsSeen} aria-label="标记新交易为已读">
                    已读
                  </button>
                </div>
              ) : null}
              {selected.status === 'loading' ? <span className="text-xs text-slate-400">加载中…</span> : null}
              {selected.error ? <span className="text-xs text-red-500">数据更新失败：{selected.error}</span> : null}
              {selected.data.lastUpdatedAtMs ? (
                <span className="text-xs text-slate-400">最近刷新：{new Date(selected.data.lastUpdatedAtMs).toLocaleTimeString()}</span>
              ) : null}
            </div>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <div className="flex gap-1" role="tablist" aria-label="分析模块">
              <button
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-600'}`}
                onClick={() => setTab('overview')}
                role="tab"
                aria-selected={activeTab === 'overview'}
                aria-controls="tabPanelOverview"
                id="tabOverview"
              >
                概览
              </button>
              <button
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'positions' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-600'}`}
                onClick={() => setTab('positions')}
                role="tab"
                aria-selected={activeTab === 'positions'}
                aria-controls="tabPanelPositions"
                id="tabPositions"
              >
                持仓
              </button>
              <button
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'trades' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-600'}`}
                onClick={() => setTab('trades')}
                role="tab"
                aria-selected={activeTab === 'trades'}
                aria-controls="tabPanelTrades"
                id="tabTrades"
              >
                交易
              </button>
            </div>
          </div>

          {activeTab === 'overview' ? (
            <section role="tabpanel" id="tabPanelOverview" aria-labelledby="tabOverview" className="flex flex-col gap-8">
              {selectedSummary ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">现金收益</div>
                    <div className={`text-xl md:text-2xl font-bold font-mono ${selectedSummary.cashPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatUsd(selectedSummary.cashPnl)}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">收益率（估算）</div>
                    <div className={`text-xl md:text-2xl font-bold font-mono ${selectedSummary.percentPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatPercent(selectedSummary.percentPnl)}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">交易量（USDC）</div>
                    <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsd(selectedSummary.tradeVolumeUsd)}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">交易数</div>
                    <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{selectedSummary.tradeCount}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">持仓市值</div>
                    <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsd(selectedSummary.currentValue)}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">最近交易</div>
                    <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{selectedSummary.lastTradeTs ? formatDateTime(selectedSummary.lastTradeTs) : '—'}</div>
                  </div>
                  {selectedProfile ? (
                    <>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">持仓偏好</div>
                        <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{selectedProfile.holdingPreference}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">活跃时段</div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-50 mt-2 break-words">
                          {selectedProfile.activeHours.length ? selectedProfile.activeHours.map((h) => `${h}:00`).join(' / ') : '—'}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">单笔均值</div>
                        <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsd(selectedProfile.avgTradeUsd)}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">最大单笔（近似）</div>
                        <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsd(selectedProfile.maxSingleTradeUsd)}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">交易尺度稳定性（CV）</div>
                        <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatNumber(selectedProfile.tradeSizeCv, { maximumFractionDigits: 2 })}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">P90 单笔（近似）</div>
                        <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatUsd(selectedProfile.p90TradeUsd)}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">单市场集中度</div>
                        <div className="text-xl md:text-2xl font-bold font-mono text-slate-900 dark:text-slate-50">{formatPercent(selectedProfile.topMarketConcentration * 100)}</div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <TraderCharts trades={selected.data.trades} activity={selected.data.activity} />
            </section>
          ) : null}

          {activeTab === 'positions' ? (
            <section role="tabpanel" id="tabPanelPositions" aria-labelledby="tabPositions">
              <PositionsTable positions={selected.data.positions} />
            </section>
          ) : null}

          {activeTab === 'trades' ? (
            <section role="tabpanel" id="tabPanelTrades" aria-labelledby="tabTrades">
              <TradesTable trades={selected.data.trades} />
            </section>
          ) : null}
        </>
      )}
    </main>
  )
}
