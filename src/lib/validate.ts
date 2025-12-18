export function normalizeAddress(input: string) {
  return input.trim().toLowerCase()
}

export function isEvmAddress(input: string) {
  return /^0x[a-f0-9]{40}$/.test(normalizeAddress(input))
}

