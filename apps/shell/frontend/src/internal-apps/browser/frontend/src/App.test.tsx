import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserApp } from './App'

// The widget end-to-end against the offline fixture source: home → search →
// results → read → back. The fixture's 240 ms latency is real, so waits use
// findBy*.

function renderBrowser(size: '2x2' | '4x2' = '2x2') {
  return render(<BrowserApp instanceId="test" size={size} mode="widget" />)
}

it('shows the honest home note before any search', () => {
  renderBrowser()
  expect(screen.getByText(/search, or open a result/)).toBeVisible()
})

it('does nothing on an empty query', async () => {
  const user = userEvent.setup()
  renderBrowser()
  await user.type(screen.getByLabelText(/search the web/i), '{Enter}')
  expect(screen.getByText(/search, or open a result/)).toBeVisible()
})

it('searches, opens a result, reads the article, and comes back', async () => {
  const user = userEvent.setup()
  renderBrowser('4x2')

  await user.type(screen.getByLabelText(/search the web/i), 'grid{Enter}')
  expect(await screen.findByText(/4 results for/)).toBeVisible()

  await user.click(screen.getByRole('button', { name: /grid snapping/i }))
  expect(await screen.findByText('Cells, not pixels')).toBeVisible()
  expect(screen.getByText('wm/layout.ts')).toBeVisible() // evidence badge

  await user.click(screen.getByRole('button', { name: /back/ }))
  expect(screen.getByText(/search, or open a result/)).toBeVisible()
})
