import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesktopProvider } from '@/wm/desktopStore'
import { TimerApp } from './App'

function renderTimer(size: '1x1' | '2x1' = '1x1') {
  return render(
    <DesktopProvider>
      <TimerApp instanceId="test" size={size} mode="widget" />
    </DesktopProvider>,
  )
}

it('renders the default duration', () => {
  renderTimer()
  expect(screen.getByLabelText(/5 minutes 00 seconds remaining/)).toBeVisible()
})

it('starts counting, then pauses', async () => {
  const user = userEvent.setup()
  renderTimer()

  await user.click(screen.getByRole('button', { name: 'start' }))
  expect(screen.getByRole('button', { name: 'pause' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'pause' }))
  expect(screen.getByRole('button', { name: 'start' })).toBeVisible()
})

it('offers reset once finished, which restores the default duration', async () => {
  const user = userEvent.setup()
  window.localStorage.setItem('nexus-timer', JSON.stringify({ remainingMs: 0, running: false, endsAt: null }))
  renderTimer()

  // Two reset chips exist at zero: the primary action and the quiet extra.
  const resets = screen.getAllByRole('button', { name: 'reset' })
  expect(screen.queryByRole('button', { name: 'start' })).toBeNull()
  await user.click(resets[0])
  expect(screen.getByLabelText(/5 minutes 00 seconds remaining/)).toBeVisible()
  window.localStorage.removeItem('nexus-timer')
})

it('is denser at 1x1 than at 2x1', () => {
  const { container: small } = renderTimer('1x1')
  expect(small.querySelector('.nx-timer--small')).toBeTruthy()
  const { container: large } = renderTimer('2x1')
  expect(large.querySelector('.nx-timer--large')).toBeTruthy()
})
