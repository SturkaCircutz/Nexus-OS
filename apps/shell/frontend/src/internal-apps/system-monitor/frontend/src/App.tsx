import type { AppProps } from '@/apps/types'
import type { Size } from '@/wm/layout'
import { AsciiMeter, MediaStates } from '@/ui'
import './sysmon.css'

// System monitor. "Never fake system state": until the backend reports real numbers
// (IPC `system_diagnostics`, see backend/README.md), the widget says so instead of
// drawing invented meters. The meter layout below is ready for the first real reading.

/** One snapshot from the backend, as percentages. `gpu` is null on machines without one. */
export interface Readings {
  cpu: number
  mem: number
  gpu: number | null
}

/**
 * Live readings, or null while no telemetry source exists. This is the seam the
 * backend plugs into: poll `system_diagnostics` here (pausing while minimized).
 */
function useReadings(): Readings | null {
  return null
}

export function SystemMonitorApp({ size }: AppProps) {
  return <SystemMonitorView size={size} readings={useReadings()} />
}

/** Pure view: meters for real readings, an honest empty state otherwise. */
export function SystemMonitorView({ size, readings }: { size: Size; readings: Readings | null }) {
  if (!readings) {
    return (
      <MediaStates
        state="empty"
        className="nx-sysmon-empty"
        emptyHint={size === '1x1' ? 'no telemetry yet' : 'no telemetry yet — the system backend is not connected'}
      />
    )
  }

  const width = size === '1x1' ? 6 : 22
  const parts = [`CPU ${readings.cpu}%`, `memory ${readings.mem}%`]
  if (readings.gpu != null) parts.push(`GPU ${readings.gpu}%`)
  return (
    <div className="nx-sysmon" role="group" aria-label={parts.join(', ')}>
      <AsciiMeter label="cpu" value={readings.cpu} width={width} />
      <AsciiMeter label="mem" value={readings.mem} width={width} />
      {readings.gpu != null && <AsciiMeter label="gpu" value={readings.gpu} width={width} />}
    </div>
  )
}
