/**
 * 将未知值解析为数组。
 * - value 为数组时直接返回
 * - value 为 JSON 字符串数组时尝试解析
 */
export function parseMaybeArray(value: unknown): unknown[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

