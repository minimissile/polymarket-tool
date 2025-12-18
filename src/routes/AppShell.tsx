import { NavLink, Outlet } from 'react-router-dom'
import { useAppState } from '../state/appState'

/** 应用布局壳：渲染顶部信息、导航与子路由出口。 */
export function AppShell() {
  const { polling } = useAppState()

  return (
    <div className="app">
      <header className="appHeader">
        <div className="brand">
          <div className="brandTitle">Polymarket 交易员分析</div>
          <div className="brandSub">纯前端 · 输入地址即可实时观测</div>
        </div>
        <div className="headerMeta">
          {polling.status === 'loading' ? <span className="muted">观察列表更新中…</span> : null}
          {polling.error ? <span className="errorText">观察列表更新失败：{polling.error}</span> : null}
          {polling.lastRunAtMs ? (
            <span className="muted">观察列表最近更新：{new Date(polling.lastRunAtMs).toLocaleTimeString()}</span>
          ) : null}
        </div>
      </header>

      <nav className="nav" aria-label="功能导航">
        <NavLink className={({ isActive }) => `navLink ${isActive ? 'active' : ''}`} to="/analyze">
          分析
        </NavLink>
        <NavLink className={({ isActive }) => `navLink ${isActive ? 'active' : ''}`} to="/watchlist">
          观察列表
        </NavLink>
        <NavLink className={({ isActive }) => `navLink ${isActive ? 'active' : ''}`} to="/discover">
          发现
        </NavLink>
      </nav>

      <Outlet />
    </div>
  )
}
