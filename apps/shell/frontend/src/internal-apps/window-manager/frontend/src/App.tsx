/**
 * Window Manager inspector — live window table + IPC API tester for Raghav.
 * Reads from useDesktopStore(); all actions go through createDesktopIPCHandler.
 */

import { useMemo, useState } from 'react'

import type { IPCResponse } from '@/types/ipc'
import type { WindowMode, WindowState } from '@/types/WindowState'
import { useDesktopStoreHandle } from '@/wm/DesktopProvider'
import { useDesktopStore } from '@/wm/DesktopStoreContext'
import { createDesktopIPCHandler } from '@/wm/desktopIPC'

export const WINDOW_MANAGER_APP_ID = 'nexus.window-manager'

interface LastCall {
  request: unknown
  response: IPCResponse
}

function truncateId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}

function modeCounts(windows: WindowState[]) {
  let windowed = 0
  let minimized = 0
  let fullscreen = 0
  for (const w of windows) {
    if (w.mode === 'minimized') minimized += 1
    else if (w.mode === 'fullscreen') fullscreen += 1
    else windowed += 1
  }
  return { windowed, minimized, fullscreen }
}

export function WindowManagerWidget() {
  const store = useDesktopStore()
  const handle = useDesktopStoreHandle()
  const ipc = useMemo(() => createDesktopIPCHandler(handle), [handle])
  const [lastCall, setLastCall] = useState<LastCall | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)

  const { windows, focusedId, activeWorkspaceId, getSnapshot } = store
  const counts = modeCounts(windows)

  function run(request: unknown) {
    const response = ipc.dispatch(request)
    setLastCall({ request, response })
    return response
  }

  function setMode(windowId: string, mode: WindowMode) {
    run({ command: 'set_window_mode', args: { window_id: windowId, mode } })
  }

  return (
    <div className="nexus-app-window-manager">
      <header className="wm-inspector-header">
        <div>
          <h2>Window Manager</h2>
          <p className="wm-inspector-summary" data-testid="wm-summary">
            {windows.length} windows: {counts.windowed} windowed, {counts.minimized} minimized,{' '}
            {counts.fullscreen} fullscreen
          </p>
          <p className="wm-inspector-meta">
            workspace <code data-testid="wm-workspace">{activeWorkspaceId}</code>
            {' · '}
            focused <code data-testid="wm-focused">{focusedId ?? 'none'}</code>
          </p>
        </div>
      </header>

      <div className="wm-inspector-table-wrap">
        <table className="wm-inspector-table" data-testid="wm-window-table">
          <thead>
            <tr>
              <th>Window</th>
              <th>Mode</th>
              <th>Position</th>
              <th>Size</th>
              <th>Focus / z</th>
              <th>Workspace</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => {
              const isSelf = w.appId === WINDOW_MANAGER_APP_ID
              return (
                <tr
                  key={w.id}
                  data-testid={`wm-row-${w.id}`}
                  data-window-id={w.id}
                  className={w.focused ? 'is-focused' : undefined}
                >
                  <td>
                    <div className="wm-inspector-title">{w.title}</div>
                    <div className="wm-inspector-sub">
                      <code>{w.appId}</code>
                      {isSelf ? <span className="wm-inspector-badge">this window</span> : null}
                    </div>
                    <div className="wm-inspector-sub">
                      <code title={w.id}>{truncateId(w.id)}</code>
                    </div>
                  </td>
                  <td>
                    <span className={`wm-mode wm-mode-${w.mode}`} data-testid={`wm-mode-${w.id}`}>
                      {w.mode}
                    </span>
                  </td>
                  <td className="wm-mono" data-testid={`wm-pos-${w.id}`}>
                    {w.x}, {w.y}
                  </td>
                  <td className="wm-mono" data-testid={`wm-size-${w.id}`}>
                    {w.width} × {w.height}
                  </td>
                  <td className="wm-mono">
                    {w.focused ? 'yes' : 'no'} / {w.zIndex}
                  </td>
                  <td className="wm-mono">{w.workspaceId}</td>
                  <td>
                    <div className="wm-inspector-actions">
                      <button type="button" onClick={() => run({ command: 'focus_window', args: { window_id: w.id } })}>
                        Focus
                      </button>
                      <button type="button" onClick={() => setMode(w.id, 'minimized')}>
                        Minimize
                      </button>
                      <button type="button" onClick={() => setMode(w.id, 'windowed')}>
                        Windowed
                      </button>
                      <button type="button" onClick={() => setMode(w.id, 'fullscreen')}>
                        Fullscreen
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run({
                            command: 'move_window',
                            args: { window_id: w.id, x: w.x + 20, y: w.y + 20 },
                          })
                        }
                      >
                        Nudge
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run({
                            command: 'resize_window',
                            args: { window_id: w.id, width: w.width + 40, height: w.height + 40 },
                          })
                        }
                      >
                        Grow
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => run({ command: 'close_app', args: { window_id: w.id } })}
                      >
                        Close
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="wm-inspector-footer">
        <div className="wm-inspector-actions" role="toolbar" aria-label="IPC test actions">
          <button
            type="button"
            data-testid="wm-get-desktop-state"
            onClick={() => run({ command: 'get_desktop_state', args: {} })}
          >
            get_desktop_state
          </button>
          <button
            type="button"
            data-testid="wm-persist"
            onClick={() => run({ command: 'persist_workspace', args: {} })}
          >
            persist_workspace
          </button>
          <button
            type="button"
            data-testid="wm-open-terminal"
            onClick={() =>
              run({ command: 'open_app', args: { app_name: 'nexus.terminal', title: 'Terminal' } })
            }
          >
            Open Terminal
          </button>
          <button
            type="button"
            data-testid="wm-invalid"
            onClick={() => run({ command: 'move_window', args: { x: 1, y: 1 } })}
          >
            Send invalid request
          </button>
          <button
            type="button"
            data-testid="wm-toggle-snapshot"
            onClick={() => setSnapshotOpen((v) => !v)}
          >
            {snapshotOpen ? 'Hide snapshot' : 'Show snapshot'}
          </button>
        </div>
      </footer>

      <section className="wm-inspector-log" data-testid="wm-log" aria-live="polite">
        <h3>Last IPC call</h3>
        {lastCall ? (
          <>
            <pre className="wm-mono" data-testid="wm-log-request">
              {JSON.stringify(lastCall.request, null, 2)}
            </pre>
            <pre
              className={`wm-mono${lastCall.response.success ? '' : ' is-error'}`}
              data-testid="wm-log-response"
            >
              {JSON.stringify(lastCall.response, null, 2)}
            </pre>
          </>
        ) : (
          <p className="wm-inspector-sub">Run an action to see the request and response.</p>
        )}
      </section>

      {snapshotOpen ? (
        <section className="wm-inspector-snapshot" data-testid="wm-snapshot">
          <h3>Session snapshot</h3>
          <pre className="wm-mono">{JSON.stringify(getSnapshot(), null, 2)}</pre>
        </section>
      ) : null}
    </div>
  )
}
