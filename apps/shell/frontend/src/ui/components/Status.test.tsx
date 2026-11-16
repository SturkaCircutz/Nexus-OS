import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AsciiMeter, Loading, Meter, Spinner } from '@/ui'

describe('<Spinner>', () => {
  it('announces itself as a status with a label', () => {
    render(<Spinner label="working" />)
    expect(screen.getByRole('status')).toHaveTextContent('working')
  })
})

describe('<Meter>', () => {
  it('carries progressbar semantics', () => {
    render(<Meter label="CPU use" value={42} />)
    const bar = screen.getByRole('progressbar', { name: 'CPU use' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
  })

  it('scales aria-valuenow against a custom max', () => {
    render(<Meter label="heap" value={4200} max={10000} />)
    expect(screen.getByRole('progressbar', { name: 'heap' })).toHaveAttribute('aria-valuenow', '42')
  })

  it('clamps out-of-range values', () => {
    const { rerender } = render(<Meter label="m" value={-5} />)
    expect(screen.getByRole('progressbar', { name: 'm' })).toHaveAttribute('aria-valuenow', '0')
    rerender(<Meter label="m" value={999} max={100} />)
    expect(screen.getByRole('progressbar', { name: 'm' })).toHaveAttribute('aria-valuenow', '100')
  })
})

describe('<AsciiMeter>', () => {
  it('draws the bar at the right fill', () => {
    const { container } = render(<AsciiMeter label="cpu" value={42} width={10} />)
    // filled = round(4.2) = 4
    expect(container.querySelector('.nx-ameter')?.textContent).toBe('cpu [####......] 42')
  })

  it('clamps and formats', () => {
    const { container } = render(
      <AsciiMeter value={7} max={4} width={4} formatValue={(v) => v.toFixed(1)} />,
    )
    expect(container.querySelector('.nx-ameter')?.textContent).toBe('[####] 4.0')
  })

  it('can hide the value tail', () => {
    const { container } = render(<AsciiMeter value={50} showValue={false} />)
    expect(container.querySelector('.nx-ameter')?.textContent).toBe('[#####.....]')
  })
})

describe('<Loading>', () => {
  it('shows a status with an optional hint', () => {
    render(<Loading label="loading" hint="fetching widgets" />)
    const status = document.querySelector('.nx-loading')!
    expect(status).toHaveTextContent('loading')
    expect(status).toHaveTextContent('fetching widgets')
    expect(status).toHaveAttribute('role', 'status')
  })
})
