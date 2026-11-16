import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Divider } from './Markers'
import { Label } from './Text'

// Containers: paper surfaces and layout helpers. The library exposes surfaces, not
// window chrome — a Panel never positions, sizes or decorates itself beyond the card.

export interface PanelProps {
  label?: ReactNode
  /** Removes the padding for edge-to-edge content. */
  flush?: boolean
  className?: string
  children?: ReactNode
  style?: CSSProperties
}

/** A solid card surface: paper, 1px rule, card radius, card shadow. Never glass. */
export function Panel({ label, flush, className, children, style }: PanelProps) {
  return (
    <section className={cx('nx-panel', flush && 'nx-panel--flush', className)} style={style}>
      {label != null && (
        <header className="nx-panel-label">
          <Label>{label}</Label>
        </header>
      )}
      {children}
    </section>
  )
}

export interface SectionProps {
  title: string
  className?: string
  children?: ReactNode
}

/** A labelled region: mono label, rule, content. The building block of settings pages. */
export function Section({ title, className, children }: SectionProps) {
  return (
    <section className={cx('nx-section', className)}>
      <header className="nx-section-head">
        <Label className="nx-section-title">{title}</Label>
        <Divider className="nx-section-rule" />
      </header>
      {children}
    </section>
  )
}

export interface StackProps {
  direction?: 'column' | 'row'
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'card' | 'gap'
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
  wrap?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** Flex layout with token gaps. `gap` names a spacing token; no raw values. */
export function Stack({ direction = 'column', gap = 'md', align, justify, wrap, className, style, children }: StackProps) {
  const css: CSSProperties = {
    ...style,
    flexDirection: direction,
    gap: `var(--s-${gap})`,
    alignItems: align,
    justifyContent: justify,
    flexWrap: wrap ? 'wrap' : undefined,
  }
  return (
    <div className={cx('nx-stack', className)} style={css}>
      {children}
    </div>
  )
}

export interface ScrollAreaProps {
  /** Accessible name; also makes the area a labelled region. */
  label?: string
  className?: string
  children?: ReactNode
}

/**
 * A scrollable region with fade masks at the edges and keyboard scrolling
 * (focusable, arrow/pg keys scroll natively once focused).
 */
export function ScrollArea({ label, className, children }: ScrollAreaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [cans, setCans] = useState({ top: false, bottom: false })

  const update = () => {
    const el = ref.current
    if (!el) return
    setCans({ top: el.scrollTop > 1, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1 })
  }

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      role={label ? 'region' : undefined}
      aria-label={label}
      tabIndex={0}
      data-can-top={cans.top || undefined}
      data-can-bottom={cans.bottom || undefined}
      className={cx('nx-scroll', className)}
      onScroll={update}
    >
      {children}
    </div>
  )
}

export interface TabDef {
  id: string
  label: string
  content: ReactNode
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string
  active: string
  onChange: (id: string) => void
  tabs: TabDef[]
  className?: string
}

/** Tabs with a roving tabindex and arrow-key movement, for fullscreen layouts. */
export function Tabs({ label, active, onChange, tabs, className }: TabsProps) {
  const base = useId()
  const i = Math.max(0, tabs.findIndex((t) => t.id === active))
  const current = tabs[i]

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    onChange(next.id)
    document.getElementById(`${base}-tab-${next.id}`)?.focus()
  }

  return (
    <div className={cx('nx-tabs', className)}>
      <div role="tablist" aria-label={label} className="nx-tablist" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${base}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            className="nx-tab"
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${base}-panel-${current.id}`}
          aria-labelledby={`${base}-tab-${current.id}`}
          className="nx-tabpanel"
        >
          {current.content}
        </div>
      )}
    </div>
  )
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
