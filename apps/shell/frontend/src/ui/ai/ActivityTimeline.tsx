import type { TaskStatus } from '@/types/agentEvents'
import { AsciiSpinner } from '../ascii/AsciiSpinner'
import { Mono } from '../components/Text'

// One run's activity, as the wire reports it: task.progress events rendered as
// mono task lines with glyphs. Terminal states sit in --muted; the running one is ink.

const STATUS_GLYPH: Record<TaskStatus, string> = {
  queued: '·',
  running: '', // the spinner fills this slot
  done: '=',
  failed: 'x',
  skipped: '-',
}

const STATUS_WORD: Record<TaskStatus, string> = {
  queued: 'queued',
  running: 'running',
  done: 'done',
  failed: 'failed',
  skipped: 'skipped',
}

export interface TimelineTask {
  id: string
  label: string
  status: TaskStatus
}

export interface ActivityTimelineProps {
  tasks: TimelineTask[]
  className?: string
}

/** The mono task list for one agent run: what's queued, running, done, failed. */
export function ActivityTimeline({ tasks, className }: ActivityTimelineProps) {
  if (!tasks.length) return <Mono className="nx-timeline nx-timeline--empty">no activity yet.</Mono>
  return (
    <ul className={className ?? 'nx-timeline'}>
      {tasks.map((task) => (
        <li key={task.id} className="nx-timeline-row" data-status={task.status}>
          <span className="nx-timeline-glyph" aria-hidden="true">
            {task.status === 'running' ? <AsciiSpinner label="running" /> : STATUS_GLYPH[task.status]}
          </span>
          <span className="nx-timeline-label">{task.label}</span>
          <span className="nx-timeline-status">{STATUS_WORD[task.status]}</span>
        </li>
      ))}
    </ul>
  )
}

/** A reduced, text-only view for sr-only summarisation. */
export function ActivitySummary({ tasks }: { tasks: TimelineTask[] }) {
  const parts = tasks.map((t) => `${t.label}: ${STATUS_WORD[t.status]}`)
  return <p className="sr-only">{parts.join(', ') || 'no activity'}</p>
}
