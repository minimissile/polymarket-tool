import { useMemo, useState } from 'react'
import { isEvmAddress, normalizeAddress } from '../lib/validate'

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
    <div className="addressBar">
      <label className="label" htmlFor="addressInput">
        交易员地址
      </label>
      <div className="addressRow">
        <input
          id="addressInput"
          className="input"
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
          className="button primary"
          onClick={() => props.onAnalyze(normalized)}
          disabled={props.disabled || !valid}
          aria-label="开始分析该地址"
        >
          分析
        </button>
        <button
          className="button"
          onClick={() => props.onAddToWatchlist(normalized)}
          disabled={props.disabled || !valid}
          aria-label="加入观察列表"
        >
          观察
        </button>
      </div>
      {error ? (
        <div id="addressError" className="errorText">
          {error}
        </div>
      ) : null}
    </div>
  )
}

