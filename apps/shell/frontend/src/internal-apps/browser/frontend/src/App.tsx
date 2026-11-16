import { useCallback, useState } from 'react'
import { MediaSurface, SearchField, SourceBadge } from '@/ui'
import type { AppProps } from '@/apps/types'
import type { Size } from '@/wm/layout'
import type { ArticleBlock } from '@/types/agentEvents'
import { fixtureSource, type BrowserSource, type ReadPayload, type SearchPayload } from './source'
import './browser.css'

// The headless browser widget: renders the typed payloads the search team's
// tools produce (search results, article blocks, images, video) through the
// media kit. The engine isn't wired yet — the data comes from the BrowserSource
// seam, currently the offline fixture source.

type View = { kind: 'home' } | { kind: 'search'; payload: SearchPayload } | { kind: 'read'; payload: ReadPayload; url: string }

export function BrowserApp({ size, mode }: AppProps) {
  const wide = size === '4x2' || mode === 'fullscreen'
  const [view, setView] = useState<View>({ kind: 'home' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (work: () => Promise<View>) => {
    setBusy(true)
    setError(null)
    try {
      setView(await work())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'the source failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const search = useCallback(
    (source: BrowserSource, query: string) => run(async () => ({ kind: 'search', payload: await source.search(query) })),
    [run],
  )
  const read = useCallback(
    (source: BrowserSource, url: string) => run(async () => ({ kind: 'read', payload: await source.open(url), url })),
    [run],
  )

  return (
    <Browser
      source={fixtureSource}
      size={size}
      wide={wide}
      view={view}
      busy={busy}
      error={error}
      onSearch={search}
      onRead={read}
      onHome={() => setView({ kind: 'home' })}
    />
  )
}

interface BrowserProps {
  source: BrowserSource
  size: Size
  wide: boolean
  view: View
  busy: boolean
  error: string | null
  onSearch: (source: BrowserSource, query: string) => void
  onRead: (source: BrowserSource, url: string) => void
  /** Leave the current page for the search home. */
  onHome: () => void
}

export function Browser({ source, size, wide, view, busy, error, onSearch, onRead, onHome }: BrowserProps) {
  const [query, setQuery] = useState('')
  const [crumb, setCrumb] = useState<string | null>(null)

  const submit = () => {
    const q = query.trim()
    if (!q || busy) return
    setCrumb(q)
    onSearch(source, q)
  }

  return (
    <div className="w-browser" data-wide={wide || undefined}>
      <div className="w-browser-bar">
        <SearchField
          label="search the web"
          placeholder={crumb ?? 'ask the web…'}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="w-browser-field"
        />
        {view.kind !== 'home' && (
          <button
            type="button"
            className="w-browser-back"
            onClick={() => {
              onHome()
              setCrumb(null)
            }}
          >
            ‹ back
          </button>
        )}
      </div>

      {busy && <p className="w-browser-note">loading…</p>}
      {error && <p className="w-browser-note" data-error>{error}</p>}

      {!busy && !error && view.kind === 'home' && (
        <p className="w-browser-note">search, or open a result — text, images and video come from the source seam.</p>
      )}

      {!busy && !error && view.kind === 'search' && (
        <Results payload={view.payload} wide={wide} compact={size === '2x1'} onRead={(url) => onRead(source, url)} />
      )}

      {!busy && !error && view.kind === 'read' && <Reader payload={view.payload} url={view.url} wide={wide} />}
    </div>
  )
}

function Results({
  payload,
  wide,
  compact,
  onRead,
}: {
  payload: SearchPayload
  wide: boolean
  compact: boolean
  onRead: (url: string) => void
}) {
  const list = compact ? payload.results.slice(0, 3) : payload.results
  return (
    <div className="w-browser-results">
      <p className="w-browser-note">
        {payload.results.length} results for “{payload.query}”
      </p>
      <ul className="w-browser-list">
        {list.map((r) => (
          <li key={r.url}>
            <button type="button" className="w-browser-hit" onClick={() => onRead(r.url)}>
              <span className="w-browser-title">{r.title}</span>
              <span className="w-browser-url">{r.url}</span>
              {wide && <span className="w-browser-snippet">{r.snippet}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Reader({ payload, url, wide }: { payload: ReadPayload; url: string; wide: boolean }) {
  if (payload.kind === 'article') {
    return (
      <article className="w-browser-article">
        <h1 className="w-browser-h1">{payload.title}</h1>
        <div className="w-browser-blocks">
          {payload.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>
        {payload.evidenceRefs.length > 0 && (
          <footer className="w-browser-evidence">
            {payload.evidenceRefs.map((ref) => (
              <SourceBadge key={ref} source={ref} />
            ))}
          </footer>
        )}
      </article>
    )
  }
  if (payload.kind === 'image') {
    return <MediaSurface src={payload.src} alt={payload.alt} source={payload.source} fit={wide ? 'contain' : 'cover'} caption={url} />
  }
  // Video: the fixture has no stream, so the poster stands in honestly.
  return (
    <MediaSurface
      alt="video poster"
      source={payload.source}
      caption={payload.src ? undefined : 'stream not available offline'}
    >
      {payload.src ? (
        <video className="w-browser-video" controls src={payload.src} poster={payload.poster} />
      ) : (
        <div className="w-browser-video-off" style={payload.poster ? { backgroundImage: `url(${payload.poster})` } : undefined}>
          <span>video fixture · offline</span>
        </div>
      )}
    </MediaSurface>
  )
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.kind) {
    case 'heading':
      return block.level === 1 ? (
        <h2 className="w-browser-h2">{block.text}</h2>
      ) : (
        <h3 className="w-browser-h3">{block.text}</h3>
      )
    case 'paragraph':
      return <p className="w-browser-p">{block.text}</p>
    case 'list':
      return (
        <ul className="w-browser-ul">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
  }
}
