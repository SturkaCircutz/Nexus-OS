import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, Popover } from '@/ui'

function setup(onCloseInside?: () => void) {
  return render(
    <Popover label="options" trigger={(p) => <button {...p}>menu</button>}>
      {(close) => <Button onClick={() => { close(); onCloseInside?.() }}>inside action</Button>}
    </Popover>,
  )
}

describe('<Popover>', () => {
  it('starts closed', () => {
    setup()
    expect(screen.queryByRole('dialog', { name: 'options' })).toBeNull()
    expect(screen.getByRole('button', { name: 'menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens from the trigger with dialog semantics', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'menu' }))
    const panel = screen.getByRole('dialog', { name: 'options' })
    expect(panel).toHaveClass('nx-popover')
    expect(screen.getByRole('button', { name: 'menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'menu' })).toHaveAttribute('aria-haspopup', 'true')
  })

  it('hands the panel a close() that refocuses the trigger', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'menu' }))
    await user.click(screen.getByRole('button', { name: 'inside action' }))
    expect(screen.queryByRole('dialog', { name: 'options' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'menu' }))
  })

  it('closes on Escape and refocuses the trigger', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'menu' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'options' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'menu' }))
  })

  it('closes on an outside pointerdown without refocusing', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'menu' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'options' })).toBeNull()
  })

  it('ignores outside pointerdown while closed', () => {
    setup()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'options' })).toBeNull()
  })
})
