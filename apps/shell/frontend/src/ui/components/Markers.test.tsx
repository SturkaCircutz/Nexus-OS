import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge, Divider, Kbd } from '@/ui'

describe('<Divider>', () => {
  it('is a horizontal rule by default', () => {
    render(<Divider />)
    expect(screen.getByRole('separator')).toHaveClass('nx-divider')
    expect(screen.getByRole('separator')).not.toHaveClass('nx-divider--v')
  })

  it('supports vertical orientation', () => {
    render(<Divider orientation="vertical" />)
    expect(screen.getByRole('separator')).toHaveClass('nx-divider--v')
  })
})

describe('<Badge>', () => {
  it('is a neutral label chip by default', () => {
    render(<Badge>queued</Badge>)
    expect(screen.getByText('queued')).toHaveClass('nx-badge')
    expect(screen.getByText('queued')).not.toHaveClass('nx-badge--accent')
  })

  it('marks accent tone for agent-at-work labels', () => {
    render(<Badge tone="accent">working</Badge>)
    expect(screen.getByText('working')).toHaveClass('nx-badge--accent')
  })
})

describe('<Kbd>', () => {
  it('renders a kbd element', () => {
    render(<Kbd>⌘K</Kbd>)
    expect(screen.getByText('⌘K').tagName).toBe('KBD')
    expect(screen.getByText('⌘K')).toHaveClass('nx-kbd')
  })
})
