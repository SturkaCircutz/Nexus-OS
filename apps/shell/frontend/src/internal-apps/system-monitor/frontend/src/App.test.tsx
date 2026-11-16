import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SystemMonitorApp, SystemMonitorView } from './App'

describe('system monitor', () => {
  it('shows no meters while the backend is missing (never fake system state)', () => {
    for (const size of ['1x1', '2x1'] as const) {
      const { unmount } = render(<SystemMonitorApp instanceId="test" size={size} mode="widget" />)
      expect(screen.getByText(/no telemetry yet/)).toBeInTheDocument()
      expect(screen.queryByRole('group')).toBeNull()
      expect(screen.queryByText(/%/)).toBeNull()
      unmount()
    }
  })

  it('says more when there is room', () => {
    render(<SystemMonitorView size="2x1" readings={null} />)
    expect(screen.getByText(/backend is not connected/)).toBeInTheDocument()
  })

  it('draws real readings as meters, labelled for screen readers', () => {
    render(<SystemMonitorView size="2x1" readings={{ cpu: 40, mem: 70, gpu: 10 }} />)
    expect(screen.getByRole('group', { name: 'CPU 40%, memory 70%, GPU 10%' })).toBeInTheDocument()
    expect(screen.getByText(/cpu/)).toHaveTextContent('[#########.............] 40')
  })

  it('leaves out the gpu meter when the machine has none', () => {
    render(<SystemMonitorView size="1x1" readings={{ cpu: 50, mem: 50, gpu: null }} />)
    expect(screen.getByRole('group', { name: 'CPU 50%, memory 50%' })).toBeInTheDocument()
    expect(screen.queryByText(/gpu/)).toBeNull()
  })
})
