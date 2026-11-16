import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Panel, ScrollArea, Section, Stack, Tabs } from '@/ui'

describe('<Panel>', () => {
  it('is a card surface with an optional label header', () => {
    const { rerender } = render(<Panel>body</Panel>)
    const panel = screen.getByText('body').closest('section')
    expect(panel).toHaveClass('nx-panel')
    expect(panel?.querySelector('header')).toBeNull()
    rerender(<Panel label="notes" flush>body</Panel>)
    expect(screen.getByText('body').closest('section')).toHaveClass('nx-panel--flush')
    expect(screen.getByText('notes').tagName).toBe('SPAN')
  })
})

describe('<Section>', () => {
  it('labels its region', () => {
    render(<Section title="appearance">rows</Section>)
    expect(screen.getByText('appearance').className).toContain('nx-section-title')
  })
})

describe('<Stack>', () => {
  it('names its gap with a spacing token', () => {
    render(<Stack gap="sm" direction="row">items</Stack>)
    const stack = screen.getByText('items') // text directly inside the stack div
    expect(stack).toHaveClass('nx-stack')
    expect(stack.style.flexDirection).toBe('row')
    expect(stack.style.gap).toBe('var(--s-sm)')
  })
})

describe('<ScrollArea>', () => {
  it('is a focusable labelled region', () => {
    render(
      <ScrollArea label="log">
        <p>line</p>
      </ScrollArea>,
    )
    const area = screen.getByRole('region', { name: 'log' })
    expect(area).toHaveClass('nx-scroll')
    expect(area).toHaveAttribute('tabindex', '0')
  })
})

describe('<Tabs>', () => {
  function Harness() {
    const [active, setActive] = useState('one')
    return (
      <Tabs
        label="views"
        active={active}
        onChange={setActive}
        tabs={[
          { id: 'one', label: 'One', content: <p>first body</p> },
          { id: 'two', label: 'Two', content: <p>second body</p> },
          { id: 'three', label: 'Three', content: <p>third body</p> },
        ]}
      />
    )
  }

  it('shows only the active panel with proper wiring', () => {
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    expect(one).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('first body')
    expect(one.getAttribute('aria-controls')).toBe(screen.getByRole('tabpanel').id)
    expect(screen.queryByText('second body')).toBeNull()
  })

  it('switches on click with a roving tabindex', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('second body')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('tabindex', '-1')
  })

  it('moves with arrow keys and moves focus too', () => {
    render(<Harness />)
    const one = screen.getByRole('tab', { name: 'One' })
    one.focus()
    fireEvent.keyDown(one, { key: 'ArrowRight' })
    expect(screen.getByRole('tabpanel')).toHaveTextContent('second body')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Two' }))
    fireEvent.keyDown(one, { key: 'ArrowLeft' }) // bubbles to the tablist; active is 'Two'
    expect(screen.getByRole('tabpanel')).toHaveTextContent('first body')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'One' }))
  })
})
