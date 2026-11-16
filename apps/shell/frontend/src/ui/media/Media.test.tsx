import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MediaSurface, MediaStates, SourceBadge } from '@/ui'

describe('<MediaStates>', () => {
  it('shows a skeleton and status while loading', () => {
    render(<MediaStates state="loading" />)
    expect(screen.getByRole('status', { name: 'loading' })).toBeInTheDocument()
    expect(document.querySelector('.nx-media-skeleton')).not.toBeNull()
  })

  it('alerts on error with a retry chip', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<MediaStates state="error" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/couldn't load that/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('carries a custom error message', () => {
    render(<MediaStates state="error" message="image too large" />)
    expect(screen.getByText(/image too large/)).toBeInTheDocument()
  })

  it('is an empty state when there is nothing', () => {
    render(<MediaStates state="empty" emptyHint="no results" />)
    expect(screen.getByText('no results')).toBeInTheDocument()
  })

  it('defaults the empty hint', () => {
    render(<MediaStates state="empty" />)
    expect(screen.getByText('nothing here yet')).toBeInTheDocument()
  })
})

describe('<SourceBadge>', () => {
  it('attributes the source accessibly', () => {
    render(<SourceBadge source="en.wikipedia.org" />)
    expect(screen.getByLabelText('Source: en.wikipedia.org')).toBeInTheDocument()
    expect(screen.getByText(/en.wikipedia.org/).textContent).toContain('en.wikipedia.org')
  })

  it('uses the full title for the accessible name', () => {
    render(<SourceBadge source="[3]" title="Nature, 2019 — Study on sleep" />)
    expect(screen.getByLabelText('Source: Nature, 2019 — Study on sleep')).toBeInTheDocument()
  })
})

describe('<MediaSurface>', () => {
  it('renders ready content with attribution and caption', () => {
    render(
      <MediaSurface
        alt="chart"
        caption="Downloads this week"
        source="example.com"
      >
        <p>the media</p>
      </MediaSurface>,
    )
    expect(screen.getByText('the media')).toBeInTheDocument()
    expect(screen.getByText('Downloads this week')).toBeInTheDocument()
    expect(screen.getByLabelText('Source: example.com')).toBeInTheDocument()
  })

  it('shows the empty state when given nothing', () => {
    render(<MediaSurface alt="nothing" />)
    expect(screen.getByText('nothing here yet')).toBeInTheDocument()
  })

  it('lets the caller override the phase for errors', () => {
    render(<MediaSurface alt="x" state="error" onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders a lazy image once ready', () => {
    render(<MediaSurface src="img.png" alt="a chart" state="ready" />)
    const img = screen.getByRole('img', { name: 'a chart' })
    expect(img).toHaveAttribute('src', 'img.png')
    expect(img).toHaveAttribute('loading', 'lazy')
  })
})
