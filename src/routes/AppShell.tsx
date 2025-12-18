import { NavLink, Outlet } from 'react-router-dom'
import { useAppState } from '../state/appState'

/** 应用布局壳：渲染顶部信息、导航与子路由出口。 */
export function AppShell() {
  const { polling } = useAppState()

  return (
    <div className="w-full min-h-screen p-4 md:p-8">
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
      </nav>

      <Outlet />
    </div>
  )
}
