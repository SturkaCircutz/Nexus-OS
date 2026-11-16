import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { Mono } from '../components/Text'

interface BoundaryProps {
  /** The name of the surface being guarded, shown in the fallback. */
  label?: string
  /** Render the crashed app's content again after the reset chip. */
  onReset?: () => void
  children: ReactNode
}

interface BoundaryState {
  error: Error | null
}

/**
 * Catches a crashing surface and shows a quiet fallback: the `x` mark and a mono
 * message, never a red screen. Mount one per app instance so one app crashing
 * doesn't take down the desktop (decision D-8).
 */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console keeps the stack; the screen stays calm.
    console.error(`[${this.props.label ?? 'surface'}] crashed:`, error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="nx-error" role="alert">
        <span aria-hidden="true" className="nx-error-mark">
          x
        </span>
        <Mono className="nx-error-text">{this.props.label ?? 'this surface'} stopped working.</Mono>
        <Button variant="action" onClick={this.reset}>
          try again
        </Button>
      </div>
    )
  }
}
