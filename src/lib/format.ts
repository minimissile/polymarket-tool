export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    ...options,
  }).format(value)
}

export function formatPercent(value: number) {
  return `${formatNumber(value, { maximumFractionDigits: 2 })}%`
}

export function formatUsd(value: number) {
  const absValue = Math.abs(value)
  const maximumFractionDigits = absValue < 1 ? 4 : absValue < 100 ? 2 : 0
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(value)
}

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

