import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmPanel } from '@/ui'

describe('<ConfirmPanel>', () => {
  it('asks the message and offers chips, first as the primary action', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    render(
      <ConfirmPanel
        message="Delete the note?"
        options={[
          { id: 'yes', label: 'Delete' },
          { id: 'no', label: 'Keep it' },
        ]}
        onChoose={onChoose}
      />,
    )
    expect(screen.getByText('Delete the note?')).toHaveClass('nx-confirm-message')
    expect(screen.getByRole('group', { name: 'Options' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('chip--action')
    expect(screen.getByRole('button', { name: 'Keep it' })).not.toHaveClass('chip--action')
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onChoose).toHaveBeenCalledWith('no')
  })
})
