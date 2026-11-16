import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, IconButton } from '@/ui'

describe('<Button>', () => {
  it('renders a button chip that defaults to type="button"', () => {
    render(<Button>open</Button>)
    const btn = screen.getByRole('button', { name: 'open' })
    expect(btn).toHaveClass('chip')
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('marks the primary verb with the action variant', () => {
    render(<Button variant="action">send</Button>)
    expect(screen.getByRole('button', { name: 'send' })).toHaveClass('chip--action')
  })

  it('announces a toggled state', () => {
    render(<Button pressed>pins</Button>)
    expect(screen.getByRole('button', { name: 'pins' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('fires on click', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>press</Button>)
    await user.click(screen.getByRole('button', { name: 'press' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('<IconButton>', () => {
  it('names itself for assistive tech and hides the glyph', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<IconButton label="close" onClick={onClick}>x</IconButton>)
    const btn = screen.getByRole('button', { name: 'close' })
    expect(btn).toHaveClass('nx-icon-btn')
    expect(btn.querySelector('span')).toHaveAttribute('aria-hidden', 'true')
    await user.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
