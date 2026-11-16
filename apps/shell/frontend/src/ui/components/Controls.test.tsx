import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox, Radio, RadioGroup, Switch } from '@/ui'

describe('<Checkbox>', () => {
  it('toggles on click and shows the character mark', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox checked={false} onChange={onChange} label="compact" />)
    const box = screen.getByRole('checkbox', { name: 'compact' })
    expect(box).toHaveAttribute('aria-checked', 'false')
    expect(box).toHaveTextContent('[ ]')
    await user.click(box)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('shows [x] when on', () => {
    render(<Checkbox checked onChange={() => {}} label="compact" />)
    expect(screen.getByRole('checkbox', { name: 'compact' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'compact' })).toHaveTextContent('[x]')
  })

  it('toggles on Enter without double-firing', () => {
    // The keydown handler preventDefaults, which stops the button's native
    // click-activation in a real browser; simulate just the key event here.
    const onChange = vi.fn()
    render(<Checkbox checked={false} onChange={onChange} label="compact" />)
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'compact' }), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does not fire when disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox checked={false} onChange={onChange} label="compact" disabled />)
    await user.click(screen.getByRole('checkbox', { name: 'compact' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('<Switch>', () => {
  it('says its state out loud', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="telemetry" />)
    const sw = screen.getByRole('switch', { name: 'telemetry' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveTextContent('off')
    await user.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<Switch checked onChange={() => {}} label="telemetry" />)
    expect(screen.getByRole('switch', { name: 'telemetry' })).toHaveTextContent('on')
  })
})

describe('<RadioGroup>/<Radio>', () => {
  function Harness() {
    const [value, setValue] = useState('a')
    return (
      <RadioGroup label="theme" value={value} onChange={setValue}>
        <Radio value="a" label="light" />
        <Radio value="b" label="dark" />
        <Radio value="c" label="system" />
      </RadioGroup>
    )
  }

  it('marks exactly one radio and roves focus', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'light' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'dark' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'light' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'dark' })).toHaveAttribute('tabindex', '-1')
  })

  it('selects on click and marks the choice with a character', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'dark' }))
    expect(screen.getByRole('radio', { name: 'dark' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'dark' }).querySelector('.nx-mark-glyph')?.textContent).toBe(' > ')
    expect(screen.getByRole('radio', { name: 'light' }).querySelector('.nx-mark-glyph')?.textContent).toBe('   ')
  })

  it('moves with arrow keys, wrapping around', () => {
    render(<Harness />)
    const light = screen.getByRole('radio', { name: 'light' })
    light.focus()
    fireEvent.keyDown(light, { key: 'ArrowDown' })
    expect(screen.getByRole('radio', { name: 'dark' })).toHaveAttribute('aria-checked', 'true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'dark' }))
    fireEvent.keyDown(screen.getByRole('radio', { name: 'dark' }), { key: 'ArrowUp' })
    expect(screen.getByRole('radio', { name: 'light' })).toHaveAttribute('aria-checked', 'true')
  })

  it('throws when a radio is used outside a group', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Radio value="a" label="lonely" />)).toThrow('<Radio> must be used inside <RadioGroup>')
    err.mockRestore()
  })
})
