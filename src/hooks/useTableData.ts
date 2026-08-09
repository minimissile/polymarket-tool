import { useState, useMemo, useCallback } from 'react'

export interface UseTableDataOptions<T> {
  /** 原始数据列表 */
  data: T[]
  /** 筛选函数：返回 true 保留 */
  filterFn: (item: T, query: string) => boolean
  /** 排序函数：返回负数 a 排前，正数 b 排前 */
  sortFn?: (a: T, b: T) => number
  /** 最大展示行数限制（针对全量数据），默认 5000 */
  maxRows?: number
  /** 分页步长，默认 50 */
  pageSize?: number
  /** 远程分页控制（可选） */
  paging?: {
    hasMore: boolean
    loadMore: () => void
    status: string // 'idle' | 'loading' | 'error'
  }
}

export interface UseTableDataResult<T> {
  /** 搜索关键词 */
  query: string
  /** 设置搜索关键词 */
  setQuery: (q: string) => void
  /** 经过筛选与排序后的全量数据 */
  filteredData: T[]
  /** 当前页可见数据（分页后） */
  visibleData: T[]
  /** 加载更多（本地翻页或触发远程加载） */
  loadMore: () => void
  /** 是否可本地展开更多 */
  canRevealMore: boolean
  /** 是否可远程加载更多 */
  canFetchMore: boolean
  /** 远程加载是否进行中 */
  isPagingLoading: boolean
  /** 当前可见条数 */
  visibleCount: number
  /** 筛选后总条数 */
  totalFilteredCount: number
}

/**
 * 表格通用逻辑 Hook：封装了搜索筛选、排序、本地分页与远程加载更多联动逻辑。
 *
 * @param options 配置项
 */
export function useTableData<T>(options: UseTableDataOptions<T>): UseTableDataResult<T> {
  const { data, filterFn, sortFn, maxRows = 5000, pageSize = 50, paging } = options
  const [query, setQuery] = useState('')
  const [visiblePages, setVisiblePages] = useState(1)

  // 1. 筛选与排序
  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = data.slice()
    
    // 先排序
    if (sortFn) {
      list.sort(sortFn)
    }

    // 再筛选
    if (q) {
      list = list.filter((item) => filterFn(item, q))
    }

    // 截断最大条数
    return list.slice(0, maxRows)
  }, [data, query, sortFn, filterFn, maxRows])

  // 2. 分页计算
  const visibleCount = Math.min(filteredData.length, visiblePages * pageSize)
  const visibleData = useMemo(() => filteredData.slice(0, visibleCount), [filteredData, visibleCount])

  // 3. 加载状态判断
  const canRevealMore = visibleCount < filteredData.length
  const canFetchMore = Boolean(paging?.hasMore) && data.length < maxRows && paging?.status !== 'error'
  const isPagingLoading = paging?.status === 'loading'

  // 4. 加载更多动作
  const loadMore = useCallback(() => {
    if (canRevealMore) {
      setVisiblePages((prev) => prev + 1)
      return
    }
    if (canFetchMore && !isPagingLoading) {
      paging?.loadMore()
    }
  }, [canRevealMore, canFetchMore, isPagingLoading, paging])

  // 5. 搜索词变更处理
  const onQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery)
    setVisiblePages(1) // 重置页码
  }, [])

  return {
    query,
    setQuery: onQueryChange,
    filteredData,
    visibleData,
    loadMore,
    canRevealMore,
    canFetchMore,
    isPagingLoading,
    visibleCount,
    totalFilteredCount: filteredData.length,
  }
}
