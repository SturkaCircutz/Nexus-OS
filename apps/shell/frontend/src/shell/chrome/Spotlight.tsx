import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { APP_IDS, getApp, type AppId } from '@/apps/registry'
import { useReducedMotion } from '@/theme'
import { SHEET, useSprings, type SpringConfig } from '@/ui'
import { useDesktop, type AppInstance } from '@/wm/desktopStore'
import type { Size } from '@/wm/layout'
import { useAgent } from '../agent/agentStore'
import { focusTarget } from '../hostNodes'

/** Closes the sheet. With a target, focus lands there instead of where it came from. */
type Close = (focus?: HTMLElement | null) => void

// With reduced motion the sheet only fades, quickly.
const FADE: SpringConfig = { damping: 1, response: 0.15 }

type Row =
  | { kind: 'ask'; key: 'ask'; text: string }
  | { kind: 'app'; key: AppId; appId: AppId; instance?: AppInstance }

interface Section {
  title: string
  rows: Row[]
}

interface SpotlightProps {
  open: boolean
  /** What opened it: the sheet grows out of this and focus returns to it. */
  origin: HTMLElement | null
  onClose: () => void
}

/**
 * Ask Nexus, or reach any app. A glass sheet that grows from whatever opened it and
 * shrinks back to it. Replies are spoken by the avatar, not printed here.
 */
export function Spotlight({ open, origin, onClose }: SpotlightProps) {
  const [present, setPresent] = useState(open)
  const reduced = useReducedMotion()
  const scrimRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const springs = useSprings({ p: 0 }, ({ p }) => {
    const sheet = sheetRef.current
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, p)))
    if (!sheet) return
    sheet.style.opacity = String(Math.max(0, Math.min(1, p * 1.6)))
    sheet.style.transform = reduced ? '' : `scale(${0.5 + 0.5 * p})`
  }, 0.002)

  if (open && !present) setPresent(true)

  // Grow out of the origin on open, shrink back into it on close.
  useLayoutEffect(() => {
    if (!present) return
    const sheet = sheetRef.current
    if (open && sheet) {
      returnFocus.current = (document.activeElement as HTMLElement | null) ?? origin
      const r = origin?.getBoundingClientRect()
      // offsetLeft/Top ignore the transform, so this is the sheet's resting box.
      sheet.style.transformOrigin = r
        ? `${r.left + r.width / 2 - sheet.offsetLeft}px ${r.top + r.height / 2 - sheet.offsetTop}px`
        : '50% 0'
      sheet.querySelector('input')?.focus()
    }
    springs.to({ p: open ? 1 : 0 }, reduced ? FADE : SHEET, {
      onRest: open
        ? undefined
        : () => {
            setPresent(false)
            const back = returnFocus.current
            if (back?.isConnected) back.focus({ preventScroll: true })
          },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present])

  if (!present) return null
  return (
    <div className="nx-spotlight" data-open={open || undefined}>
      <div ref={scrimRef} className="nx-spotlight-scrim" aria-hidden="true" onPointerDown={onClose} style={{ opacity: 0 }} />
      <div
        ref={sheetRef}
        className="nx-spotlight-sheet nx-glass"
        role="dialog"
        aria-modal="true"
        aria-label="Ask Nexus"
        style={{ opacity: 0 }}
        inert={!open}
      >
        <SpotlightBody
          onClose={(focus) => {
            if (focus) returnFocus.current = focus
            onClose()
          }}
        />
      </div>
    </div>
  )
}

function SpotlightBody({ onClose }: { onClose: Close }) {
  const { state, store } = useDesktop()
  const agent = useAgent().store
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  const sections = useMemo(() => buildSections(query, state.instances), [query, state.instances])
  const rows = sections.flatMap((s) => s.rows)
  const current = rows[Math.min(active, rows.length - 1)] as Row | undefined
  const rowId = (r: Row) => `${listId}-${r.key}`

  // A new query starts at the top.
  useEffect(() => setActive(0), [query])

  // Keep the active row in view.
  useEffect(() => {
    if (current) document.getElementById(rowId(current))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key])

  const run = (row: Row) => {
    if (row.kind === 'ask') {
      onClose()
      agent.ask(row.text)
      return
    }
    const it = row.instance
    if (it && it.mode !== 'minimized') {
      // Already on the desk: hand it focus and say so, rather than closing silently.
      store.focus(it.id)
      onClose(focusTarget(it.id))
      agent.say(`${getApp(row.appId).label} is ${it.mode === 'fullscreen' ? 'fullscreen' : 'on the desk'}.`)
      return
    }
    onClose()
    agent.say(it ? store.restore(row.appId) : store.open(row.appId))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (query) setQuery('')
      else onClose()
      return
    }
    if (e.key === 'Tab') {
      trapTab(e)
      return
    }
    if (!(e.target instanceof HTMLInputElement)) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!rows.length) return
      const step = e.key === 'ArrowDown' ? 1 : rows.length - 1
      setActive((i) => (Math.min(i, rows.length - 1) + step) % rows.length)
    } else if (e.key === 'Enter' && current) {
      e.preventDefault()
      run(current)
    }
  }

  return (
    <div className="nx-spotlight-body" onKeyDown={onKeyDown}>
      <label className="nx-spotlight-field">
        <span className="nx-spotlight-mark" aria-hidden="true">
          &gt;
        </span>
        <span className="sr-only">Ask Nexus or find an app</span>
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current ? rowId(current) : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ask nexus, or type an app"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <ul ref={listRef} id={listId} className="nx-spotlight-list" role="listbox" aria-label="Results">
        {sections.map((s) => (
          <li key={s.title} role="presentation">
            <p className="nx-spotlight-section" aria-hidden="true">
              {s.title}
            </p>
            <ul role="group" aria-label={s.title} className="nx-spotlight-group">
              {s.rows.map((r) => (
                <li
                  key={r.key}
                  id={rowId(r)}
                  role="option"
                  aria-selected={r === current}
                  className="nx-spotlight-row"
                  onPointerMove={() => r !== current && setActive(rows.indexOf(r))}
                  onClick={() => run(r)}
                >
                  <RowContent row={r} />
                </li>
              ))}
            </ul>
          </li>
        ))}
        {rows.length === 0 && (
          <li role="presentation" className="nx-spotlight-empty">
            nothing here yet
          </li>
        )}
      </ul>

      {current?.kind === 'app' ? (
        <ActionBar key={current.key} appId={current.appId} instance={current.instance} onClose={onClose} />
      ) : (
        <p className="nx-spotlight-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>move
          </span>
          <span>
            <kbd>↵</kbd>
            {current?.kind === 'ask' ? 'ask' : 'open'}
          </span>
          <span>
            <kbd>esc</kbd>
            {query ? 'clear' : 'close'}
          </span>
        </p>
      )}
    </div>
  )
}

function RowContent({ row }: { row: Row }) {
  if (row.kind === 'ask') {
    return (
      <>
        <span className="nx-spotlight-glyph" aria-hidden="true">
          (?)
        </span>
        <span className="nx-spotlight-name">
          ask nexus: <span className="nx-spotlight-query">{row.text}</span>
        </span>
        <span className="nx-spotlight-meta" aria-hidden="true">
          ↵
        </span>
      </>
    )
  }
  const app = getApp(row.appId)
  return (
    <>
      <span className="nx-spotlight-glyph" aria-hidden="true">
        {app.glyph}
      </span>
      <span className="nx-spotlight-name">{app.label}</span>
      <span className="nx-spotlight-meta">{describe(row.instance)}</span>
    </>
  )
}

/** Size chips and the moves that make sense for the highlighted app. */
function ActionBar({ appId, instance: it, onClose }: { appId: AppId; instance?: AppInstance; onClose: () => void }) {
  const { store } = useDesktop()
  const agent = useAgent().store
  const app = getApp(appId)
  const say = (reply: string) => agent.say(reply)

  const setSize = (size: Size) => say(it ? store.resize(appId, size) : store.open(appId, size))

  return (
    <div className="nx-spotlight-actions" role="group" aria-label={`${app.label} actions`}>
      <div className="nx-spotlight-sizes">
        {app.sizes.map((size) => (
          <button
            key={size}
            type="button"
            className="chip"
            aria-pressed={it?.size === size && it.mode !== 'minimized'}
            onClick={() => setSize(size)}
          >
            {size}
          </button>
        ))}
      </div>
      <div className="nx-spotlight-moves">
        {!it && (
          <ActionChip label="open" onClick={() => (onClose(), say(store.open(appId)))} />
        )}
        {it?.mode === 'minimized' && (
          <ActionChip label="restore" onClick={() => (onClose(), say(store.restore(appId)))} />
        )}
        {it && it.mode !== 'minimized' && (
          <ActionChip label="minimize" onClick={() => say(store.minimize(appId))} />
        )}
        {app.fullscreen && it?.mode !== 'fullscreen' && (
          <ActionChip label="full" onClick={() => (onClose(), say(store.fullscreen(appId)))} />
        )}
        {it && <ActionChip label="hide" onClick={() => say(store.close(appId))} />}
      </div>
    </div>
  )
}

function ActionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="chip chip--action" onClick={onClick}>
      {label}
    </button>
  )
}

function describe(it?: AppInstance) {
  if (!it) return 'not open'
  if (it.mode === 'minimized') return 'minimized'
  if (it.mode === 'fullscreen') return 'fullscreen'
  return `open ${it.size}`
}

/**
 * Empty query: what's on the desk, then everything else. With a query: app matches,
 * plus an "ask" row that leads when the query reads like a sentence.
 */
function buildSections(query: string, instances: AppInstance[]): Section[] {
  const live = new Map(instances.filter((i) => !i.exiting).map((i) => [i.appId, i] as const))
  const appRow = (appId: AppId): Row => ({ kind: 'app', key: appId, appId, instance: live.get(appId) })
  const q = query.trim().toLowerCase()

  if (!q) {
    const desk = APP_IDS.filter((id) => live.has(id))
    const rest = APP_IDS.filter((id) => !live.has(id))
    return [
      { title: 'on the desk', rows: desk.map(appRow) },
      { title: 'apps', rows: rest.map(appRow) },
    ].filter((s) => s.rows.length)
  }

  const matches = APP_IDS.filter((id) => {
    const app = getApp(id)
    return app.label.startsWith(q) || app.aliases.some((a) => a.startsWith(q))
  }).map(appRow)
  const ask: Section = { title: 'ask nexus', rows: [{ kind: 'ask', key: 'ask', text: query.trim() }] }
  const apps: Section = { title: 'apps', rows: matches }
  const sentence = /\s/.test(q) || matches.length === 0
  return (sentence ? [ask, apps] : [apps, ask]).filter((s) => s.rows.length)
}

/** Keeps Tab inside the sheet while it's open. */
function trapTab(e: KeyboardEvent<HTMLElement>) {
  const items = [
    ...e.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled), [tabindex="0"]'),
  ]
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
