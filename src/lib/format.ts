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
