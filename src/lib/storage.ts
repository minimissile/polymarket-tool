type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** 从 localStorage 读取 JSON；失败时返回 fallback。 */
export function readJson<T extends JsonValue>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 将值写入 localStorage（JSON 序列化）；失败时静默忽略。 */
export function writeJson<T extends JsonValue>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

/** 合并两组数据并按 key 去重，同时限制最大数量（保留最新的一段）。 */
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
