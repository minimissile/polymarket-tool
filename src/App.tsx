import './App.css'
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './state/appState'
import { AppShell } from './routes/AppShell'

const AnalyzePage = lazy(() => import('./routes/AnalyzePage'))
const WatchlistPage = lazy(() => import('./routes/WatchlistPage'))
const DiscoverPage = lazy(() => import('./routes/DiscoverPage'))

function App() {
  return (
    <AppStateProvider>
      <Suspense fallback={<div className="page"><div className="empty bigEmpty">加载中…</div></div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/analyze" replace />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/trader/:user" element={<AnalyzePage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="*" element={<Navigate to="/analyze" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AppStateProvider>
  )
}

export default App
