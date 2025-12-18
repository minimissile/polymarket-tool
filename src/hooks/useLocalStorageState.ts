import { useCallback, useEffect, useState } from 'react'

/** 本地持久化的 `useState`：用 `localStorage` 做读写与跨刷新保存。 */
export function useLocalStorageState<T>(key: string, fallback: T, options?: { preferFallback?: boolean }) {
  const [value, setValue] = useState<T>(() => {
    try {
      if (options?.preferFallback) return fallback
      const raw = localStorage.getItem(key)
      if (!raw) return fallback
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    try {
      const serialized = JSON.stringify(value)
      if (serialized === undefined) {
        localStorage.removeItem(key)
        return
      }
      localStorage.setItem(key, serialized)
    } catch {
      return
    }
  }, [key, value])

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next))
  }, [])

  return [value, set] as const
}
