import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './state/appState'
import { AppShell } from './routes/AppShell'

const AnalyzePage = lazy(() => import('./routes/AnalyzePage'))
const WatchlistPage = lazy(() => import('./routes/WatchlistPage'))
const DiscoverPage = lazy(() => import('./routes/DiscoverPage'))
const ExportPage = lazy(() => import('./routes/ExportPage'))
const MarketPage = lazy(() => import('./routes/MarketPage'))

/** 应用根组件：提供全局状态、懒加载路由与统一布局壳。 */
function App() {
  return (
    <AppStateProvider>
      <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-500">加载中…</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/analyze" replace />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/trader/:user/:tab?" element={<AnalyzePage />} />

            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="*" element={<Navigate to="/analyze" replace />} />
          </Route>

          <Route>
            <Route path="/trader/:user/market/:slug" element={<MarketPage />} />
          </Route>
        </Routes>
      </Suspense>
    </AppStateProvider>
  )
}

export default App
