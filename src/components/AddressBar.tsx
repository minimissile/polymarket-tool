import { useMemo, useState } from 'react'
import { isEvmAddress, normalizeAddress } from '../lib/validate'

/** 地址输入条：校验 EVM 地址并提供“分析/观察”快捷操作。 */
export function AddressBar(props: {
  value: string
  disabled?: boolean
  onChange: (next: string) => void
  onAnalyze: (address: string) => void
  onAddToWatchlist: (address: string) => void
}) {
  const [touched, setTouched] = useState(false)
  const normalized = useMemo(() => normalizeAddress(props.value), [props.value])
  const valid = useMemo(() => isEvmAddress(normalized), [normalized])

  const error = touched && !valid ? '请输入合法 EVM 地址（0x + 40 位十六进制）' : undefined

  return (
    <div className="flex flex-col gap-4">
      <label className="text-sm font-medium text-slate-500 dark:text-slate-400" htmlFor="addressInput">
        交易员地址
      </label>
      <div className="flex gap-3">
        <input
          id="addressInput"
          className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 transition-all"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="0x..."
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          disabled={props.disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'addressError' : undefined}
        />
        <button
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 dark:bg-blue-600 dark:border-blue-600"
          onClick={() => props.onAnalyze(normalized)}
          disabled={props.disabled || !valid}
          aria-label="开始分析该地址"
        >
          分析
        </button>
        <button
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-700"
          onClick={() => props.onAddToWatchlist(normalized)}
          disabled={props.disabled || !valid}
          aria-label="加入观察列表"
        >
          观察
        </button>
      </div>
      {error ? (
        <div id="addressError" className="text-red-500 text-xs mt-1">
          {error}
        </div>
      ) : null}
    </div>
  )
}
