/** 通用数字格式化（基于 Intl.NumberFormat）。 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    ...options,
  }).format(value)
}

/** 百分比格式化：输入为百分比数值（例如 12.34 => "12.34%"）。 */
export function formatPercent(value: number) {
  return `${formatNumber(value, { maximumFractionDigits: 2 })}%`
}

/** 美元金额格式化：根据数量级自动调整小数位。 */
export function formatUsd(value: number) {
  const absValue = Math.abs(value)
  const maximumFractionDigits = absValue < 1 ? 4 : absValue < 100 ? 2 : 0
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(value)
}

/** 将秒级 epoch 时间戳格式化为本地日期时间字符串。 */
export function formatDateTime(epochSeconds: number) {
  const date = new Date(epochSeconds * 1000)
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function formatRelativeTime(epochSeconds: number, nowMs: number = Date.now()) {
  const deltaMs = nowMs - epochSeconds * 1000
  const absMs = Math.abs(deltaMs)
  const isFuture = deltaMs < 0

  const sec = Math.floor(absMs / 1000)
  if (sec < 5) return isFuture ? '即将' : '刚刚'
  if (sec < 60) return `${sec}秒${isFuture ? '后' : '前'}`

  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分钟${isFuture ? '后' : '前'}`

  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}小时${isFuture ? '后' : '前'}`

  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}天${isFuture ? '后' : '前'}`

  const month = Math.floor(day / 30)
  if (month < 12) return `${month}个月${isFuture ? '后' : '前'}`

  const year = Math.floor(month / 12)
  return `${year}年${isFuture ? '后' : '前'}`
}
