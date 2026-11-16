import { useRef, useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, Dialog } from '@/ui'
import { setReducedMotion } from '../testing/a11y'

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const originRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button onClick={() => setOpen(true)} ref={originRef}>
        open
      </button>
      <Dialog open={open} onClose={() => { setOpen(false); onClose() }} title="Settings">
        <Button>do it</Button>
        <Button>more</Button>
      </Dialog>
    </>
  )
}

// Reduced motion keeps the exit spring short (~0.15s) while still exercising the
// real same-path exit — the removal is awaited, not faked.
beforeAll(() => setReducedMotion(true))

describe('<Dialog>', () => {
  it('stays out of the DOM when closed', () => {
    render(<Harness onClose={() => {}} />)
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
  })

  it('opens, names itself, and focuses its first control', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'do it' })))
  })

  it('closes on Escape through the same path, returning focus', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument())
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'open' }))
  })

  it('closes on a scrim press', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument())
    fireEvent.pointerDown(document.querySelector('.nx-dialog-scrim')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps Tab inside the panel', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument())
    const panel = screen.getByRole('dialog', { name: 'Settings' })
    const last = panel.querySelectorAll('button')[1]
    last.focus()
    await user.tab()
    expect(document.activeElement).toBe(panel.querySelector('button'))
  })
})
