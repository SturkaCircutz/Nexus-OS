import { useEffect, useState } from 'react'
import type { AppProps } from '@/apps/types'
import { AsciiMeter } from '@/ui'
import './sysmon.css'

export function SystemMonitorApp({ size }: AppProps) {
  const cpu = useDrift(38)
  const mem = useDrift(61)
  const gpu = useDrift(17)
  const width = size === '1x1' ? 6 : 22
  const aria = `CPU ${cpu}%, memory ${mem}%, GPU ${gpu}%`
  return (
    <div className="nx-sysmon" role="group" aria-label={aria}>
      <AsciiMeter label="cpu" value={cpu} width={width} />
      <AsciiMeter label="mem" value={mem} width={width} />
      <AsciiMeter label="gpu" value={gpu} width={width} />
    </div>
  )
}

/** Fake reading that wanders a little every couple of seconds (until the backend exists). */
function useDrift(base: number) {
  const [v, setV] = useState(base)
  useEffect(() => {
    if (document.hidden) return
    const id = window.setInterval(() => {
      setV((prev) => Math.min(95, Math.max(4, Math.round(prev + (Math.random() - 0.5) * 10 + (base - prev) * 0.2))))
    }, 2000)
    return () => window.clearInterval(id)
  }, [base])
  return v
}
