import { useEffect, useRef } from 'react'

/**
 * 用 IntersectionObserver 在滚动接近底部时触发加载。
 * 由调用方控制 enabled 与 onTrigger 的去抖/去重策略。
 */
export function useInfiniteScrollTrigger<T extends Element = HTMLDivElement>(options: {
  enabled: boolean
  onTrigger: () => void
  rootMargin?: string
}) {
  const ref = useRef<T | null>(null)
  const enabled = options.enabled
  const onTrigger = options.onTrigger
  const rootMargin = options.rootMargin ?? '240px 0px'

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onTrigger()
      },
      { root: null, rootMargin, threshold: 0 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, onTrigger, rootMargin])

  return ref
}
