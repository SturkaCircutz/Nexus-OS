import { afterEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/ui/testing/fixtures'
import { SettingsApp } from './App'

const renderSettings = (size: '1x1' | '2x1') =>
  renderWithProviders(<SettingsApp instanceId="test" size={size} mode="widget" />, { agent: false })

afterEach(() => {
  window.localStorage.removeItem('nexus-theme')
  delete document.documentElement.dataset.theme
})

describe('settings', () => {
  it('1x1 shows only the theme picker', () => {
    renderSettings('1x1')
    expect(screen.getByRole('radiogroup', { name: 'theme' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByText('desk')).toBeNull()
    expect(screen.queryByText('spotlight')).toBeNull()
  })

  it('starts on system and switches the real theme', async () => {
    const user = userEvent.setup()
    renderSettings('1x1')
    expect(screen.getByRole('radio', { name: 'system' })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: 'ink' }))
    expect(screen.getByRole('radio', { name: 'ink' })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('nexus-theme')).toBe('dark')

    await user.click(screen.getByRole('radio', { name: 'system' }))
    expect(window.localStorage.getItem('nexus-theme')).toBeNull()
  })

  it('2x1 adds the theme hint, honest desk facts and the key legend', () => {
    renderSettings('2x1')
    const theme = screen.getByRole('group', { name: 'theme' })
    expect(theme).toHaveAccessibleDescription('system follows your OS')
    expect(screen.getByRole('group', { name: 'grid' })).toHaveTextContent('6 × 4')
    expect(screen.getByRole('group', { name: 'widgets open' })).toHaveTextContent(/\d+/)
    expect(screen.getByRole('group', { name: 'spotlight' })).toHaveTextContent('⌘K')
  })
})
