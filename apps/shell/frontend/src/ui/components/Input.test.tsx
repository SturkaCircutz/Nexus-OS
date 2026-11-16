import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input, SearchField, Textarea } from '@/ui'

describe('<Input>', () => {
  it('is a borderless input with autocomplete off', () => {
    render(<Input aria-label="name" />)
    const input = screen.getByLabelText('name')
    expect(input).toHaveClass('nx-input')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })
})

describe('<Textarea>', () => {
  it('renders a textarea', () => {
    render(<Textarea aria-label="notes" />)
    expect(screen.getByLabelText('notes').tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText('notes')).toHaveClass('nx-textarea')
  })
})

describe('<SearchField>', () => {
  it('associates the label with the input and shows a key hint', () => {
    render(<SearchField label="Search apps" hint="⌘K" />)
    const input = screen.getByLabelText(/Search apps/)
    expect(input.tagName).toBe('INPUT')
    expect(screen.getByText('⌘K').tagName).toBe('KBD')
  })

  it('forwards an explicit id', () => {
    render(<SearchField label="Search apps" id="spot" />)
    expect(screen.getByLabelText(/Search apps/)).toHaveAttribute('id', 'spot')
  })
})
