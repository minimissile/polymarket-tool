import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopTraders } from '../components/TopTraders'
import { useTopTraders } from '../hooks/useTopTraders'
import { useAppState } from '../state/appState'

export default function DiscoverPage() {
  const navigate = useNavigate()
  const { addToWatchlist } = useAppState()
  const topTraders = useTopTraders()
  const { status, rows, error, refresh } = topTraders

  useEffect(() => {
    if (status !== 'idle') return
    if (rows.length > 0) return
    refresh()
  }, [refresh, rows.length, status])

  const onWatch = (user: string) => {
    addToWatchlist(user)
    navigate(`/trader/${user.toLowerCase()}`)
  }

  return (
    <main className="page">
      <TopTraders
        rows={rows}
        status={status}
        error={error}
        onRefresh={refresh}
        onWatch={onWatch}
      />
    </main>
  )
}
