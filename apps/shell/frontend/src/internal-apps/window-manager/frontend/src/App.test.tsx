/**
 * @vitest-environment jsdom
 *
 * Window Manager inspector — table rendering + IPC-dispatched actions.
 */

import { act, cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { WindowManagerWidget } from '@/internal-apps/window-manager/frontend/src/App'
import { DesktopProvider } from '@/wm/DesktopProvider'
import { createSeedSession } from '@/wm/windowStore'

afterEach(() => {
  cleanup()
})

function renderInspector() {
  return render(
    <DesktopProvider initialSession={createSeedSession()} persist={false} ipc={false}>
      <WindowManagerWidget />
    </DesktopProvider>,
  )
}

describe('WindowManagerWidget', () => {
  it('lists Notes and Files with mode and size', () => {
    const { container } = renderInspector()
    const view = within(container)

    expect(view.getByTestId('wm-summary').textContent).toMatch(/2 windows/)
    expect(view.getByTestId('wm-mode-seed-notes').textContent).toBe('windowed')
    expect(view.getByTestId('wm-mode-seed-files').textContent).toBe('windowed')
    expect(view.getByTestId('wm-size-seed-notes').textContent).toMatch(/520\s*×\s*360/)
    expect(view.getByTestId('wm-size-seed-files').textContent).toMatch(/520\s*×\s*380/)
    expect(view.getByTestId('wm-focused').textContent).toBe('seed-files')
  })

  it('Minimize on Files updates the row and logs set_window_mode success', () => {
    const { container } = renderInspector()
    const view = within(container)
    const row = view.getByTestId('wm-row-seed-files')

    act(() => {
      within(row).getByRole('button', { name: 'Minimize' }).click()
    })

    expect(view.getByTestId('wm-mode-seed-files').textContent).toBe('minimized')
    const response = JSON.parse(view.getByTestId('wm-log-response').textContent!)
    expect(response.success).toBe(true)
    const request = JSON.parse(view.getByTestId('wm-log-request').textContent!)
    expect(request).toMatchObject({
      command: 'set_window_mode',
      args: { window_id: 'seed-files', mode: 'minimized' },
    })
  })

  it('Focus on Notes updates focusedId', () => {
    const { container } = renderInspector()
    const view = within(container)
    const row = view.getByTestId('wm-row-seed-notes')

    act(() => {
      within(row).getByRole('button', { name: 'Focus' }).click()
    })

    expect(view.getByTestId('wm-focused').textContent).toBe('seed-notes')
    expect(view.getByTestId('wm-row-seed-notes').className).toMatch(/is-focused/)
    const response = JSON.parse(view.getByTestId('wm-log-response').textContent!)
    expect(response.success).toBe(true)
  })

  it('Open Terminal adds a row', () => {
    const { container } = renderInspector()
    const view = within(container)

    act(() => {
      view.getByTestId('wm-open-terminal').click()
    })

    expect(view.getByTestId('wm-summary').textContent).toMatch(/3 windows/)
    expect(view.getByTestId('wm-window-table').textContent).toMatch(/Terminal/)
    const response = JSON.parse(view.getByTestId('wm-log-response').textContent!)
    expect(response.success).toBe(true)
    expect(response.data.window_id).toMatch(/nexus\.terminal/)
  })

  it('Send invalid request shows success:false and an error', () => {
    const { container } = renderInspector()
    const view = within(container)

    act(() => {
      view.getByTestId('wm-invalid').click()
    })

    const response = JSON.parse(view.getByTestId('wm-log-response').textContent!)
    expect(response.success).toBe(false)
    expect(String(response.error)).toMatch(/window_id/)
    expect(view.getByTestId('wm-log-response').className).toMatch(/is-error/)
  })

  it('get_desktop_state returns the window list', () => {
    const { container } = renderInspector()
    const view = within(container)

    act(() => {
      view.getByTestId('wm-get-desktop-state').click()
    })

    const response = JSON.parse(view.getByTestId('wm-log-response').textContent!)
    expect(response.success).toBe(true)
    expect(response.data.windows).toHaveLength(2)
    expect(response.data.windows.map((w: { id: string }) => w.id)).toEqual([
      'seed-notes',
      'seed-files',
    ])
  })
})
