import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { ThemeProvider } from '@/theme'
import { DesktopProvider, type DesktopState } from '@/wm/desktopStore'
import { AgentProvider, type AgentRun } from '@/shell/agent/agentStore'

// Providers wrapper for component tests. Only the providers a component actually
// reads; plain primitives render without any wrapper at all.

export interface ProvidersOptions {
  theme?: boolean
  desktop?: DesktopState | false
  agent?: AgentRun | false
}

function Providers({ options, children }: { options: ProvidersOptions; children: ReactNode }) {
  let tree = <>{children}</>
  if (options.agent !== false) tree = <AgentProvider run={options.agent ?? ((text) => ({ text }))}>{tree}</AgentProvider>
  if (options.desktop !== false) tree = <DesktopProvider initial={options.desktop || undefined}>{tree}</DesktopProvider>
  if (options.theme !== false) tree = <ThemeProvider>{tree}</ThemeProvider>
  return tree
}

/**
 * Renders with the shell providers. Theme wraps by default (token styling reads
 * data-theme); desktop/agent wrap when the component needs their stores.
 */
export function renderWithProviders(ui: ReactElement, options: ProvidersOptions & RenderOptions = {}) {
  const { theme, desktop, agent, ...renderOptions } = options
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers options={{ theme, desktop, agent }}>{children}</Providers>
    ),
    ...renderOptions,
  })
}
