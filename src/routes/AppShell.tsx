import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppState } from '../state/appState'
import { readJson } from '../lib/storage'
import type { DataApiTrade } from '../lib/polymarketDataApi'

/** 应用布局壳：渲染顶部信息、导航与子路由出口。 */
export function AppShell() {
  const { polling, watchlist } = useAppState()

  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastNotifiedTradeTsByUserRef = useRef<Record<string, number>>({})

  const playTone = useCallback(async () => {
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) return
      const ctx = audioCtxRef.current ?? new AudioContextCtor()
      audioCtxRef.current = ctx

      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.value = 0.0001
      osc.connect(gain)
      gain.connect(ctx.destination)

      const now = ctx.currentTime
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(0.06, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)

      osc.start(now)
      osc.stop(now + 0.22)
    } catch {
      return
    }
  }, [])

  const showToast = useCallback(
    (message: string, options?: { withTone?: boolean }) => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      setToast({ id: Date.now(), message })
      toastTimerRef.current = window.setTimeout(() => setToast(null), 6500)
      if (options?.withTone === false) return
      void playTone()
    },
    [playTone],
  )

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      if (audioCtxRef.current) void audioCtxRef.current.close().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent<{ message?: string; withTone?: boolean }>
      const msg = evt.detail?.message
      if (!msg) return
      showToast(msg, { withTone: evt.detail?.withTone })
    }
    window.addEventListener('pmta:notify', handler)
    return () => window.removeEventListener('pmta:notify', handler)
  }, [showToast])

  useEffect(() => {
    if (!polling.lastRunAtMs) return
    if (polling.status !== 'ready') return
    if (watchlist.length === 0) return

    const nowSec = Date.now() / 1000
    const newUsers: string[] = []
    const lastNotified = lastNotifiedTradeTsByUserRef.current

    for (const u of watchlist) {
      const key = u.toLowerCase()
      const trades = readJson<DataApiTrade[]>(`pmta.cache.trades.${key}`, [])
      const latestTs = trades.reduce((acc, t) => Math.max(acc, t.timestamp), 0)
      if (!latestTs) continue
      if (nowSec - latestTs > 300) continue
      const prev = lastNotified[key] ?? 0
      if (latestTs <= prev) continue
      newUsers.push(key)
      lastNotified[key] = latestTs
    }

    if (newUsers.length === 0) return
    const first = newUsers[0]
    const short = `${first.slice(0, 6)}…${first.slice(-4)}`
    const more = newUsers.length > 1 ? ` +${newUsers.length - 1}` : ''
    window.dispatchEvent(
      new CustomEvent('pmta:notify', {
        detail: { message: `观察列表检测到新交易：${short}${more}` },
      }),
    )
  }, [polling.lastRunAtMs, polling.status, watchlist])

  return (
    <div className="w-full min-h-screen p-4 md:p-8 md:pt-0">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center py-6 mb-8 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div className="flex flex-col">
          <div className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Polymarket 交易员分析</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">纯前端 · 输入地址即可实时观测</div>
        </div>
        <div className="flex flex-col items-start md:items-end gap-1">
          {polling.status === 'loading' ? <span className="text-xs text-slate-400">观察列表更新中…</span> : null}
          {polling.error ? <span className="text-xs text-red-500">观察列表更新失败：{polling.error}</span> : null}
          {polling.lastRunAtMs ? (
            <span className="text-xs text-slate-400">观察列表最近更新：{new Date(polling.lastRunAtMs).toLocaleTimeString()}</span>
          ) : null}
        </div>
      </header>

      <nav className="flex gap-2 mb-8 pb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto" aria-label="功能导航">
        <NavLink 
          className={({ isActive }) => 
            `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              isActive 
                ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50'
            }`
          } 
          to="/analyze"
        >
          分析
        </NavLink>
        <NavLink 
          className={({ isActive }) => 
            `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              isActive 
                ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50'
            }`
          } 
          to="/watchlist"
        >
          观察列表
        </NavLink>
        <NavLink 
          className={({ isActive }) => 
            `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              isActive 
                ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50'
            }`
          } 
          to="/discover"
        >
          发现
        </NavLink>
        <NavLink 
          className={({ isActive }) => 
            `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              isActive 
                ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50'
            }`
          } 
          to="/export"
        >
          导出
        </NavLink>
        <NavLink 
          className={({ isActive }) => 
            `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              isActive 
                ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50'
            }`
          } 
          to="/spread-watch"
        >
          价差监控
        </NavLink>
      </nav>

      {toast ? (
        <div className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-6 md:bottom-6 z-50">
          <div
            className="w-full md:w-[420px] bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 rounded-xl shadow-lg border border-slate-800 dark:border-slate-200 p-4 flex items-start gap-3"
            role="status"
            aria-live="polite"
          >
            <div className="flex-1 text-sm leading-relaxed">{toast.message}</div>
            <button
              className="text-xs font-semibold px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 dark:bg-slate-900/10 dark:hover:bg-slate-900/15"
              onClick={() => setToast(null)}
              aria-label="关闭通知"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <Outlet />
    </div>
  )
}
