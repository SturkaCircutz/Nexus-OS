import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ActivitySummary,
  ActivityTimeline,
  AgentStatus,
  AGENT_STATUS_TEXT,
  PromptInput,
  StreamingText,
  ToolCard,
  TYPE_MS,
} from '@/ui'

describe('<AgentStatus>', () => {
  it('spins while working and carries the state on data-status', () => {
    render(<AgentStatus status="thinking" />)
    const el = document.querySelector('span[data-status="thinking"]')
    expect(el).not.toBeNull()
    expect(el?.querySelector('.ascii-spinner')).not.toBeNull()
    expect(el?.textContent).toContain('thinking')
  })

  it('rests at idle with a dot', () => {
    render(<AgentStatus status="idle" />)
    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.queryByText('thinking')).toBeNull()
  })

  it('reports failures honestly', () => {
    render(<AgentStatus status="error" />)
    expect(screen.getByText("didn't get that")).toBeInTheDocument()
  })

  it('covers every wire state', () => {
    expect(Object.keys(AGENT_STATUS_TEXT).sort()).toEqual(
      ['acting', 'error', 'idle', 'listening', 'speaking', 'thinking', 'waiting'].sort(),
    )
  })
})

describe('<StreamingText>', () => {
  afterEach(() => vi.useRealTimers())

  it('shows everything at once under reduced motion', () => {
    const { container } = render(<StreamingText text="hello there" reduced />)
    const p = container.querySelector('p')!
    expect(p).toHaveAttribute('data-visible')
    expect(p.querySelector('.nx-stream-rest')?.textContent).toBe('')
    expect(p.textContent).toContain('hello there')
  })

  it('announces the full text in a live region', () => {
    const { container } = render(<StreamingText text="hello there" reduced />)
    const live = container.querySelector('p[aria-live="polite"]')
    expect(live?.textContent).toContain('hello there')
  })

  it('marks errors with the x and an ink edge, never a colour', () => {
    const { container } = render(<StreamingText text="nope" error reduced />)
    expect(container.querySelector('p')?.getAttribute('data-error')).toBe('true')
    expect(container.querySelector('.nx-stream-mark')?.textContent).toBe('x ')
  })

  it('types a character at a time at final size', () => {
    vi.useFakeTimers()
    const { container } = render(<StreamingText text="hello" />)
    const rest = () => container.querySelector('.nx-stream-rest')!
    expect(rest().textContent).toBe('hello')
    // One tick per act: React flushes the next timer's effect at act exit.
    const tick = () => act(() => vi.advanceTimersByTime(TYPE_MS))
    tick()
    expect(rest().textContent).toBe('ello')
    tick()
    expect(rest().textContent).toBe('llo')
    for (let i = 0; i < 5; i++) tick()
    expect(rest().textContent).toBe('')
  })
})

describe('<PromptInput>', () => {
  it('submits trimmed text on Enter and clears', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<PromptInput onSubmit={onSubmit} />)
    const input = screen.getByLabelText(/Ask Nexus/)
    await user.type(input, '  write me a poem  ')
    expect(screen.getByRole('button', { name: 'ask' })).toBeEnabled()
    await user.type(input, '{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('write me a poem')
    expect(input).toHaveValue('')
  })

  it('disables the submit chip while the field is empty', () => {
    render(<PromptInput onSubmit={() => {}} />)
    expect(screen.getByRole('button', { name: 'ask' })).toBeDisabled()
  })

  it('holds the value and blocks submit while busy', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<PromptInput onSubmit={onSubmit} busy />)
    const input = screen.getByLabelText(/Ask Nexus/)
    await user.type(input, 'hello')
    await user.type(input, '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(input).toHaveValue('hello')
    expect(screen.getByRole('button', { name: 'ask' })).toBeDisabled()
  })
})

describe('<ActivityTimeline>', () => {
  it('renders task rows with glyphs and honest words', () => {
    render(
      <ActivityTimeline
        tasks={[
          { id: '1', label: 'open note', status: 'done' },
          { id: '2', label: 'resize widget', status: 'running' },
          { id: '3', label: 'fetch', status: 'failed' },
        ]}
      />,
    )
    const rows = screen.getByRole('list').querySelectorAll('.nx-timeline-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute('data-status', 'done')
    expect(rows[0].textContent).toContain('open note')
    expect(rows[0].textContent).toContain('done')
    expect(rows[1].querySelector('.ascii-spinner')).not.toBeNull()
    expect(rows[2].textContent).toContain('failed')
  })

  it('stays quiet when there is nothing', () => {
    render(<ActivityTimeline tasks={[]} />)
    expect(screen.getByText('no activity yet.')).toBeInTheDocument()
  })

  it('summarises for screen readers', () => {
    render(
      <ActivitySummary
        tasks={[
          { id: '1', label: 'open note', status: 'done' },
          { id: '2', label: 'fetch', status: 'skipped' },
        ]}
      />,
    )
    expect(screen.getByText('open note: done, fetch: skipped')).toBeInTheDocument()
  })
})

describe('<ToolCard>', () => {
  it('shows name, args, status glyph and ack state', () => {
    render(<ToolCard name="open_note" args={'("groceries")'} status="running" ack="pending" />)
    const card = screen.getByText(/open_note/).closest('.nx-toolcard')
    expect(card).toHaveAttribute('data-status', 'running')
    expect(card?.textContent).toContain('("groceries")')
    expect(card?.textContent).toContain('…sent')
  })

  it('reports failed acks without colour', () => {
    render(<ToolCard name="open_note" status="done" ack="failed" />)
    expect(screen.getByText('no ack')).toBeInTheDocument()
  })
})
