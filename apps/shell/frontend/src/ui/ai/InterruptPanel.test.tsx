import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InterruptPanel } from '@/ui'

const interrupt = {
  kind: 'confirm' as const,
  message: 'Delete the widget?',
  options: ['Yes, delete it', 'No, keep it'],
}

describe('<InterruptPanel>', () => {
  it('renders the engine\u2019s question with lowercased option chips', () => {
    render(<InterruptPanel interrupt={interrupt} onResolve={() => {}} />)
    expect(screen.getByText('Delete the widget?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'yes, delete it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'no, keep it' })).toBeInTheDocument()
  })

  it('resolves with the original option text, not the index', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn()
    render(<InterruptPanel interrupt={interrupt} onResolve={onResolve} />)
    await user.click(screen.getByRole('button', { name: 'no, keep it' }))
    expect(onResolve).toHaveBeenCalledWith('No, keep it')
  })
})
