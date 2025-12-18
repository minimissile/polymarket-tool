type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export function readJson<T extends JsonValue>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson<T extends JsonValue>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

export function mergeUniqueByKey<T>(
  existing: T[],
  incoming: T[],
  keySelector: (item: T) => string,
  maxSize: number,
) {
  const map = new Map<string, T>()
  for (const item of existing) map.set(keySelector(item), item)
  for (const item of incoming) map.set(keySelector(item), item)
  const merged = Array.from(map.values())
  merged.sort((a, b) => {
    const ka = keySelector(a)
    const kb = keySelector(b)
    if (ka < kb) return -1
    if (ka > kb) return 1
    return 0
  })
  return merged.slice(Math.max(0, merged.length - maxSize))
}

