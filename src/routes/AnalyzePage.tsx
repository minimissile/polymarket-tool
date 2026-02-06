import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AddressBar } from '../components/AddressBar'
import { PositionsTable } from '../components/PositionsTable'
import { TraderCharts } from '../components/TraderCharts'
import { TradesTable } from '../components/TradesTable'
import { ActivitiesTable } from '../components/ActivitiesTable'
import { CopyTradeSimulator } from '../components/CopyTradeSimulator'
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
  const params = useParams<{ user?: string; tab?: string }>()
  const [searchParams] = useSearchParams()
  const { selectedUser, setSelectedUser, lastSeenByUser, markTradesAsSeen, addToWatchlist } = useAppState()

  const routeUser = useMemo(() => {
    return resolveUser(params.user, searchParams.get('user'), selectedUser)
  }, [params.user, searchParams, selectedUser])

  useEffect(() => {
    if (!routeUser) return
    if (!params.user) return
    const tab = (params.tab ?? 'overview').toLowerCase()
    const valid = tab === 'overview' || tab === 'positions' || tab === 'trades' || tab === 'activity' || tab === 'copy'
    if (!valid || !params.tab) navigate(`/trader/${routeUser}/overview`, { replace: true })
  }, [navigate, params.tab, params.user, routeUser])

  const [addressInput, setAddressInput] = useState(() => {
    if (routeUser) return routeUser
    return readJson<string>('pmta.lastAddressInput', '')
  })

  const normalizedInput = useMemo(() => normalizeAddress(addressInput), [addressInput])
  const inputValid = useMemo(() => isEvmAddress(normalizedInput), [normalizedInput])

  const selected = useTraderData(routeUser, { enabled: Boolean(routeUser), pollMs: 12_000 })
  const lastNotifiedLatestTradeTsRef = useRef(0)

  const activeTab = useMemo(() => {
    const raw = (params.tab ?? 'overview').toLowerCase()
    if (raw === 'positions') return 'positions'
    if (raw === 'trades') return 'trades'
    if (raw === 'activity') return 'activity'
    if (raw === 'copy') return 'copy'
    return 'overview'
  }, [params.tab])

  useEffect(() => {
    writeJson('pmta.lastAddressInput', normalizedInput as never)
  }, [normalizedInput])

  useEffect(() => {
    if (!routeUser) {
      lastNotifiedLatestTradeTsRef.current = 0
      return
    }
    const latestTs = selected.data.trades.reduce((acc, t) => Math.max(acc, t.timestamp), 0)
    if (!latestTs) return
    if (lastNotifiedLatestTradeTsRef.current === 0) {
      lastNotifiedLatestTradeTsRef.current = latestTs
      return
    }
    if (latestTs <= lastNotifiedLatestTradeTsRef.current) return
    const nowSec = Date.now() / 1000
    if (nowSec - latestTs > 300) {
      lastNotifiedLatestTradeTsRef.current = latestTs
      return
    }
    const newCount = selected.data.trades.filter(t => t.timestamp > lastNotifiedLatestTradeTsRef.current).length
    lastNotifiedLatestTradeTsRef.current = latestTs
    const short = `${routeUser.slice(0, 6)}…${routeUser.slice(-4)}`
    window.dispatchEvent(
      new CustomEvent('pmta:notify', {
        detail: { message: `检测到新交易：${short} ${newCount} 笔` }
      })
    )
  }, [routeUser, selected.data.trades])

  /** 校验并跳转到交易员详情页，同时更新全局选中地址。 */
  const onAnalyze = (address: string) => {
    if (!isEvmAddress(address)) return
    const normalized = address.toLowerCase()
    setSelectedUser(normalized)
    navigate(`/trader/${normalized}/overview`)
  }

  /** 把地址加入观察列表，并跳转到交易员详情页。 */
  const onWatch = (address: string) => {
    if (!isEvmAddress(address)) return
    const normalized = address.toLowerCase()
    addToWatchlist(normalized)
    navigate(`/trader/${normalized}/overview`)
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
    return selected.data.trades.filter(t => t.timestamp > lastSeenTradeTs).length
  }, [lastSeenByUser, routeUser, selected.data.trades])

  /** 将当前用户最新一笔交易时间戳写入“已读”，用于清零新交易提示。 */
  const markAsSeen = () => {
    if (!routeUser) return
    const latestTs = selected.data.trades.reduce((acc, t) => Math.max(acc, t.timestamp), 0)
    markTradesAsSeen(routeUser, latestTs)
  }

  /** 切换模块 Tab，并写入 URL 查询参数，便于分享/刷新后保持一致。 */
  const setTab = (next: 'overview' | 'positions' | 'trades' | 'activity' | 'copy') => {
    const user = routeUser
    if (!user) return
    navigate(`/trader/${user}/${next}`, { replace: true })
  }

  const openMarket = (slug: string) => {
    const user = routeUser
    if (!user) return
    navigate(`/trader/${user}/market/${encodeURIComponent(slug)}`)
  }

  return (
    <main className="flex w-full flex-col gap-8">
      <div className="w-full">
        <AddressBar
          value={addressInput}
          onChange={setAddressInput}
          onAnalyze={onAnalyze}
          onAddToWatchlist={onWatch}
          disabled={selected.status === 'loading'}
        />
        {inputValid ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <span className="whitespace-nowrap font-semibold">提示：</span>
            「分析」会跳转到该交易员详情页；「观察」会加入观察列表并后台更新。
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <span className="whitespace-nowrap font-semibold">提示：</span>
            输入 `0x` 开头的 EVM 地址
          </div>
        )}
      </div>

      {!routeUser ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <div className="mb-4 text-4xl">🔍</div>
          <div className="text-lg font-medium text-slate-900 dark:text-slate-50">输入地址并点击「分析」后查看交易员详情</div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">支持查看交易热力图、持仓分布、资金曲线等详细数据</div>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center dark:border-slate-700">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400">当前交易员</div>
              <div className="break-all font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                {routeUser}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              {newTradeCount > 0 ? (
                <div className="flex items-center gap-3 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <span
                    className="animate-pulse rounded-sm bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                    aria-label="检测到新交易"
                  >
                    实时
                  </span>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">新交易 {newTradeCount} 笔</span>
                  <button
                    className="text-xs font-semibold text-emerald-600 underline decoration-emerald-300 hover:text-emerald-800 dark:text-emerald-500 dark:decoration-emerald-700 dark:hover:text-emerald-300"
                    onClick={markAsSeen}
                    aria-label="标记新交易为已读"
                  >
                    已读
                  </button>
                </div>
              ) : null}
              {selected.status === 'loading' ? <span className="text-xs text-slate-400">加载中…</span> : null}
              {selected.error ? <span className="text-xs text-red-500">数据更新失败：{selected.error}</span> : null}
              {selected.data.lastUpdatedAtMs ? (
                <span className="text-xs text-slate-400">
                  最近刷新：{new Date(selected.data.lastUpdatedAtMs).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <div className="flex gap-1" role="tablist" aria-label="分析模块">
              <button
                className={`border-b-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'overview' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300'}`}
                onClick={() => setTab('overview')}
                role="tab"
                aria-selected={activeTab === 'overview'}
                aria-controls="tabPanelOverview"
                id="tabOverview"
              >
                概览
              </button>
              <button
                className={`border-b-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'positions' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300'}`}
                onClick={() => setTab('positions')}
                role="tab"
                aria-selected={activeTab === 'positions'}
                aria-controls="tabPanelPositions"
                id="tabPositions"
              >
                持仓
              </button>
              <button
                className={`border-b-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'trades' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300'}`}
                onClick={() => setTab('trades')}
                role="tab"
                aria-selected={activeTab === 'trades'}
                aria-controls="tabPanelTrades"
                id="tabTrades"
              >
                交易
              </button>
              <button
                className={`border-b-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'activity' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300'}`}
                onClick={() => setTab('activity')}
                role="tab"
                aria-selected={activeTab === 'activity'}
                aria-controls="tabPanelActivity"
                id="tabActivity"
              >
                流水
              </button>
              <button
                className={`border-b-2 px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'copy' ? 'border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300'}`}
                onClick={() => setTab('copy')}
                role="tab"
                aria-selected={activeTab === 'copy'}
                aria-controls="tabPanelCopy"
                id="tabCopy"
              >
                跟单
              </button>
            </div>
          </div>

          {activeTab === 'overview' ? (
            <section role="tabpanel" id="tabPanelOverview" aria-labelledby="tabOverview" className="flex flex-col gap-8">
              {selectedSummary ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">现金收益</div>
                    <div
                      className={`font-mono text-xl font-bold md:text-2xl ${selectedSummary.cashPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                    >
                      {formatUsd(selectedSummary.cashPnl)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">收益率（估算）</div>
                    <div
                      className={`font-mono text-xl font-bold md:text-2xl ${selectedSummary.percentPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                    >
                      {formatPercent(selectedSummary.percentPnl)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">交易量（USDC）</div>
                    <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                      {formatUsd(selectedSummary.tradeVolumeUsd)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">交易数</div>
                    <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                      {selectedSummary.tradeCount}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">持仓市值</div>
                    <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                      {formatUsd(selectedSummary.currentValue)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">最近交易</div>
                    <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                      {selectedSummary.lastTradeTs ? formatDateTime(selectedSummary.lastTradeTs) : '—'}
                    </div>
                  </div>
                  {selectedProfile ? (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">持仓偏好</div>
                        <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                          {selectedProfile.holdingPreference}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">活跃时段</div>
                        <div className="mt-2 break-words text-sm font-medium text-slate-900 dark:text-slate-50">
                          {selectedProfile.activeHours.length ? selectedProfile.activeHours.map(h => `${h}:00`).join(' / ') : '—'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">单笔均值</div>
                        <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                          {formatUsd(selectedProfile.avgTradeUsd)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">最大单笔（近似）</div>
                        <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                          {formatUsd(selectedProfile.maxSingleTradeUsd)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">交易尺度稳定性（CV）</div>
                        <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                          {formatNumber(selectedProfile.tradeSizeCv, { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">P90 单笔（近似）</div>
                        <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                          {formatUsd(selectedProfile.p90TradeUsd)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">单市场集中度</div>
                        <div className="font-mono text-xl font-bold text-slate-900 md:text-2xl dark:text-slate-50">
                          {formatPercent(selectedProfile.topMarketConcentration * 100)}
                        </div>
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
              <PositionsTable positions={selected.data.positions} trades={selected.data.trades} />
            </section>
          ) : null}

          {activeTab === 'trades' ? (
            <section role="tabpanel" id="tabPanelTrades" aria-labelledby="tabTrades" className="flex flex-col gap-8">
              <TradesTable
                trades={selected.data.trades}
                status={selected.status}
                onOpenMarket={openMarket}
                paging={{
                  status: selected.tradesPaging.status,
                  error: selected.tradesPaging.error,
                  hasMore: selected.tradesPaging.hasMore,
                  loadMore: selected.loadMoreTrades
                }}
              />
            </section>
          ) : null}

          {activeTab === 'activity' ? (
            <section role="tabpanel" id="tabPanelActivity" aria-labelledby="tabActivity" className="flex flex-col gap-8">
              <ActivitiesTable
                activity={selected.data.activity}
                status={selected.status}
                onOpenMarket={openMarket}
                paging={{
                  status: selected.activityPaging.status,
                  error: selected.activityPaging.error,
                  hasMore: selected.activityPaging.hasMore,
                  loadMore: selected.loadMoreActivity
                }}
              />
            </section>
          ) : null}

          {activeTab === 'copy' ? (
            <section role="tabpanel" id="tabPanelCopy" aria-labelledby="tabCopy" className="flex flex-col gap-8">
              <CopyTradeSimulator
                user={routeUser}
                trades={selected.data.trades}
                activity={selected.data.activity}
                status={selected.status}
                error={selected.error}
              />
            </section>
          ) : null}
        </>
      )}
    </main>
  )
}
