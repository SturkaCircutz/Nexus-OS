import { useState } from 'react'
import type { AppProps } from '@/apps/types'
import { evaluate, format } from './evaluate'
import './calc.css'

// The calculator: an honest arithmetic widget. Expression builds in the display,
// evaluates live, commits on `=`. No pretending to be a scientific tool.

const KEYS: Array<[label: string, k: string][]> = [
  [
    ['C', 'C'],
    ['⌫', 'back'],
    ['%', '%'],
    ['÷', '÷'],
  ],
  [
    ['7', '7'],
    ['8', '8'],
    ['9', '9'],
    ['×', '×'],
  ],
  [
    ['4', '4'],
    ['5', '5'],
    ['6', '6'],
    ['−', '-'],
  ],
  [
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
    ['+', '+'],
  ],
  [
    ['±', 'neg'],
    ['0', '0'],
    ['.', '.'],
    ['=', '='],
  ],
]

export function CalcApp({ size }: AppProps) {
  const wide = size === '2x1'
  const [expr, setExpr] = useState('')
  const [history, setHistory] = useState<string[]>([])

  const live = expr ? evaluate(expr) : null

  const press = (k: string) => {
    if (k === 'C') {
      setExpr('')
      return
    }
    if (k === 'back') {
      setExpr((e) => e.slice(0, -1))
      return
    }
    if (k === '=') {
      const v = live
      if (v === null) return
      setHistory((h) => [`${expr} = ${format(v)}`, ...h].slice(0, 8))
      setExpr(format(v))
      return
    }
    if (k === 'neg') {
      // Toggle the sign of the live result, or of the number being typed.
      if (live !== null) setExpr(format(-live))
      else setExpr((e) => (e.startsWith('-') ? e.slice(1) : '-' + e))
      return
    }
    setExpr((e) => e + k)
  }

  return (
    <div className="w-calc" data-wide={wide || undefined}>
      <div className="w-calc-display">
        <span className="w-calc-expr">{expr || '0'}</span>
        {live !== null && <span className="w-calc-live">= {format(live)}</span>}
        {expr && live === null && <span className="w-calc-live" data-bad>…</span>}
      </div>
      <div className="w-calc-body">
        <div className="w-calc-pad" role="group" aria-label="keypad">
          {KEYS.flat().map(([label, k]) => (
            <button key={k} type="button" className="w-calc-key" data-op={['+', '-', '×', '÷', '%', '=', 'C'].includes(k) || undefined} onClick={() => press(k)}>
              {label}
            </button>
          ))}
        </div>
        {wide && (
          <ul className="w-calc-history" aria-label="history">
            {history.length === 0 && <li className="w-calc-hist-empty">no sums yet</li>}
            {history.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
