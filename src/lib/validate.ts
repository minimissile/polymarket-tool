/** 规范化地址输入：去空格并转小写。 */
export function normalizeAddress(input: string) {
  return input.trim().toLowerCase()
}

/** 判断是否为合法 EVM 地址（0x + 40 位十六进制，小写）。 */
export function isEvmAddress(input: string) {
  return /^0x[a-f0-9]{40}$/.test(normalizeAddress(input))
}
