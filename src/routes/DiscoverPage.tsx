import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopTraders } from '../components/TopTraders'
import { useTopTraders } from '../hooks/useTopTraders'
import { useAppState } from '../state/appState'

/** 发现页：基于最近成交聚合热门交易员，并支持一键加入观察列表。 */
export default function DiscoverPage() {
  const navigate = useNavigate()
  const { addToWatchlist } = useAppState()
  const topTraders = useTopTraders()
  const { status, rows, error, refresh } = topTraders

  /** 首次进入时自动拉取一次数据，避免空页还需要手动点刷新。 */
  useEffect(() => {
    if (status !== 'idle') return
    if (rows.length > 0) return
    refresh()
  }, [refresh, rows.length, status])

  /** 将热门交易员加入观察列表，并跳转到其详情页。 */
  const onWatch = (user: string) => {
    addToWatchlist(user)
    navigate(`/trader/${user.toLowerCase()}/overview`)
  }

  return (
    <main className="flex flex-col gap-8 w-full">
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
