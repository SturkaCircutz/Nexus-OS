import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '@/ui'

let shouldThrow = true
function Crash() {
  if (shouldThrow) throw new Error('boom')
  return <p>fine</p>
}

describe('<ErrorBoundary>', () => {
  it('shows a quiet fallback when the surface crashes', () => {
    shouldThrow = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary label="widget">
        <Crash />
      </ErrorBoundary>,
    )
    err.mockRestore()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('widget stopped working.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'try again' })).toHaveClass('chip--action')
  })

  it('falls back to the generic label', () => {
    shouldThrow = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    )
    err.mockRestore()
    expect(screen.getByText('this surface stopped working.')).toBeInTheDocument()
  })

  it('resets on the chip and calls onReset', async () => {
    shouldThrow = true
    const user = userEvent.setup()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReset = vi.fn()
    render(
      <ErrorBoundary label="widget" onReset={onReset}>
        <Crash />
      </ErrorBoundary>,
    )
    err.mockRestore()
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: 'try again' }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByText('fine')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
