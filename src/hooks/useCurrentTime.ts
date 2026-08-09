import { useState, useEffect } from 'react'

/**
 * 一个用于获取当前时间戳并在指定间隔后自动更新的 Hook。
 *
 * @param intervalMs - 更新间隔（毫秒），默认 1000ms
 * @param enabled - 是否启用定时更新，默认 true
 * @returns 当前时间戳 (Date.now())
 *
 * @example
 * ```ts
 * const nowMs = useCurrentTime(1000)
 * ```
 */
export function useCurrentTime(intervalMs: number = 1000, enabled: boolean = true) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, intervalMs])

  return nowMs
}
