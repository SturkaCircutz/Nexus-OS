import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppTemplate, Button, WidgetTemplate } from '@/ui'

describe('<WidgetTemplate>', () => {
  it('maps the current size to its content', () => {
    render(
      <WidgetTemplate
        size="2x2"
        content={{
          '1x1': <p>small</p>,
          '2x2': <p>big</p>,
        }}
      />,
    )
    expect(screen.getByText('big')).toBeInTheDocument()
    expect(screen.queryByText('small')).toBeNull()
  })

  it('falls back when the size has no entry, then to empty', () => {
    const { rerender } = render(
      <WidgetTemplate size="4x2" content={{ '1x1': <p>small</p> }} fallback={<p>fallback view</p>} />,
    )
    expect(screen.getByText('fallback view')).toBeInTheDocument()

    rerender(<WidgetTemplate size="4x2" content={{ '1x1': <p>small</p> }} />)
    expect(screen.getByText('nothing here yet')).toBeInTheDocument()
  })

  it('takes a custom empty hint', () => {
    render(<WidgetTemplate size="1x1" content={{}} empty="add a feed first" />)
    expect(screen.getByText('add a feed first')).toBeInTheDocument()
  })
})

describe('<AppTemplate>', () => {
  it('lays out the fullscreen frame: label, actions, body', () => {
    render(
      <AppTemplate label="timer" actions={<Button>start</Button>} meta={<span>00:00</span>}>
        <p>the body</p>
      </AppTemplate>,
    )
    expect(screen.getByText('timer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'start' })).toBeInTheDocument()
    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByText('the body').closest('.nx-app-body')).not.toBeNull()
  })

  it('works with nothing but a body', () => {
    render(
      <AppTemplate label="timer">
        <p>the body</p>
      </AppTemplate>,
    )
    expect(screen.queryByText('00:00')).toBeNull()
    expect(screen.getByText('the body')).toBeInTheDocument()
  })
})
