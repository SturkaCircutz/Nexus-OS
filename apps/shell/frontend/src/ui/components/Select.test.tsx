import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from '@/ui'

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
]

function Harness({ onChange }: { onChange: (v: string) => void }) {
  return <Select label="fruit" value={null} options={FRUITS} onChange={onChange} />
}

/** Renders the select and opens it; returns the user handle. */
async function open(onChange: (v: string) => void = () => {}) {
  render(<Harness onChange={onChange} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'fruit' }))
  return user
}

describe('<Select>', () => {
  it('shows the placeholder when nothing is chosen', () => {
    render(<Harness onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('choose…')
  })

  it('opens a listbox of options', async () => {
    await open()
    const list = screen.getByRole('listbox', { name: 'fruit' })
    expect(list).toHaveClass('nx-select-list')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('picks on click and closes', async () => {
    const onChange = vi.fn()
    await open(onChange)
    await userEvent.click(screen.getByRole('option', { name: /Banana/ }))
    expect(onChange).toHaveBeenCalledWith('banana')
    expect(screen.queryByRole('listbox', { name: 'fruit' })).toBeNull()
  })

  it('moves with arrows and picks with Enter', async () => {
    const onChange = vi.fn()
    await open(onChange)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: /Cherry/ })).toHaveAttribute('data-active', 'true')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('cherry')
    expect(screen.queryByRole('listbox', { name: 'fruit' })).toBeNull()
  })

  it('jumps with typeahead', async () => {
    await open()
    await userEvent.keyboard('b')
    expect(screen.getByRole('option', { name: /Banana/ })).toHaveAttribute('data-active', 'true')
  })

  it('closes on Escape and refocuses the trigger', async () => {
    const user = await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox', { name: 'fruit' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'fruit' }))
  })

  it('marks the chosen option', async () => {
    const user = userEvent.setup()
    render(<Select label="fruit" value="cherry" options={FRUITS} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'fruit' })).toHaveTextContent('Cherry')
    await user.click(screen.getByRole('button', { name: 'fruit' }))
    expect(screen.getByRole('option', { name: /Cherry/ })).toHaveAttribute('aria-selected', 'true')
  })
})
