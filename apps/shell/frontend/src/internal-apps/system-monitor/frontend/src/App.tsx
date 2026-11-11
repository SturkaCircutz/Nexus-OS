import { useEffect, useState } from 'react'
import type { AppProps } from '@/apps/types'

export function SystemMonitorApp({ size }: AppProps) {
  const cpu = useDrift(38)
  const mem = useDrift(61)
  const gpu = useDrift(17)
  const width = size === '1x1' ? 6 : 22
  const bar = (name: string, v: number) => {
    const n = Math.round((v / 100) * width)
    return `${name.padEnd(4)}[${'#'.repeat(n)}${'.'.repeat(width - n)}]${String(v).padStart(4)}%`
  }
  return (
    <pre className="w-mono" aria-label={`CPU ${cpu}%, memory ${mem}%, GPU ${gpu}%`}>
      {[bar('cpu', cpu), bar('mem', mem), bar('gpu', gpu)].join('\n')}
    </pre>
  )
}

/** Fake reading that wanders a little every couple of seconds (until the backend exists). */
function useDrift(base: number) {
  const [v, setV] = useState(base)
  useEffect(() => {
    const id = window.setInterval(() => {
      setV((prev) => Math.min(95, Math.max(4, Math.round(prev + (Math.random() - 0.5) * 10 + (base - prev) * 0.2))))
    }, 2000)
    return () => window.clearInterval(id)
  }, [base])
  return v
}
