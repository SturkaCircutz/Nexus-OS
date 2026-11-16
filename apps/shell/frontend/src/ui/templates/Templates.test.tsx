import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppTemplate, Button, SettingsRow, SettingsSection, SettingsTemplate, Switch, WidgetTemplate } from '@/ui'

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

describe('<SettingsTemplate>', () => {
  it('lays out sections of named rows, with the hint as the description', () => {
    render(
      <SettingsTemplate>
        <SettingsSection title="motion">
          <SettingsRow label="reduce motion" hint="skips the ascii build-in">
            <Switch checked={false} onChange={() => {}} label="reduce motion" />
          </SettingsRow>
          <SettingsRow label="engine">local</SettingsRow>
        </SettingsSection>
      </SettingsTemplate>,
    )
    expect(screen.getByText('motion')).toBeInTheDocument()
    const row = screen.getByRole('group', { name: 'reduce motion' })
    expect(row).toHaveAccessibleDescription('skips the ascii build-in')
    expect(row).toContainElement(screen.getByRole('switch', { name: 'reduce motion' }))
  })

  it('leaves the description off when there is no hint', () => {
    render(<SettingsRow label="engine">local</SettingsRow>)
    const row = screen.getByRole('group', { name: 'engine' })
    expect(row).not.toHaveAttribute('aria-describedby')
    expect(row).toHaveTextContent('local')
  })
})
