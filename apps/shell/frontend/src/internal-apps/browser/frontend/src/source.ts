import type { ArticleBlock, WidgetPayload } from '@/types/agentEvents'

// The browser's data seam. The web-search team's engine plugs in here behind the
// shell's IPC contract (`search_web` / `fetch_article`, src/types/ipc.ts); until
// that lands, the fixture source keeps the widget honest and fully offline.

export type SearchPayload = Extract<WidgetPayload, { kind: 'search' }>
export type ReadPayload = Extract<WidgetPayload, { kind: 'article' | 'image' | 'video' }>

export interface BrowserSource {
  search(query: string): Promise<SearchPayload>
  open(url: string): Promise<ReadPayload>
}

/** A fixture result page, so previews work without a network. */
const svg = (body: string, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`

const POSTER = svg(
  '<rect width="100%" height="100%" fill="#181816"/><rect x="18" y="14" width="10" height="8" fill="#74b8ad"/>' +
    '<rect x="34" y="14" width="10" height="8" fill="#74b8ad"/><rect x="50" y="14" width="10" height="8" fill="#3a3935"/>' +
    '<path d="M30 40 L46 30 L46 50 Z" fill="#74b8ad"/>',
  96,
  64,
)

const CHART = svg(
  '<rect width="100%" height="100%" fill="#f5f4f0"/><rect x="8" y="46" width="12" height="10" fill="#2f6b62"/>' +
    '<rect x="26" y="36" width="12" height="20" fill="#2f6b62"/><rect x="44" y="26" width="12" height="30" fill="#2f6b62"/>' +
    '<rect x="62" y="16" width="12" height="40" fill="#2f6b62"/>',
  96,
  64,
)

const RESULTS: SearchPayload['results'] = [
  {
    title: 'Nexus OS — shell plan, §6.3 widget payloads',
    url: 'nexus://plan/shell#widget-payloads',
    snippet: 'What the engine’s tools produce and the shell renders through the media kit as info widgets.',
    source: 'nexus plan',
  },
  {
    title: 'Grid snapping, explained like phone widgets',
    url: 'nexus://notes/grid-snapping',
    snippet: 'Widgets claim cells on a 6×4 grid; the system packs them biggest-first when space runs out.',
    source: 'team notes',
  },
  {
    title: 'Weekly metrics — desk usage',
    url: 'nexus://fixtures/metrics.svg',
    snippet: 'A fixture image: every app the desk shipped this week, rendered as bars.',
    source: 'fixtures',
  },
  {
    title: 'All-hands recording, Nov 12',
    url: 'nexus://fixtures/all-hands.mp4',
    snippet: 'Fixture video: the meeting where the browser widget was specced (poster only, offline).',
    source: 'fixtures',
  },
]

const READS: Record<string, ReadPayload> = {
  'nexus://notes/grid-snapping': {
    kind: 'article',
    title: 'Grid snapping, explained like phone widgets',
    blocks: [
      { kind: 'heading', level: 1, text: 'Cells, not pixels' },
      {
        kind: 'paragraph',
        text:
          'A widget never floats freely. It claims whole cells on a 6×4 grid, the same way a phone home screen claims slots — so every size is a designed layout, not a stretched box.',
      },
      { kind: 'heading', level: 2, text: 'When space runs out' },
      {
        kind: 'paragraph',
        text:
          'The packer re-places everything biggest-first. If the grid can’t hold the desk, the command answers honestly instead of stacking widgets.',
      },
      {
        kind: 'list',
        items: ['1x1 · 2x1 · 1x2 — small widgets', '2x2 — the standard card', '4x2 — the wide board'],
      },
    ],
    evidenceRefs: ['wm/layout.ts', 'wm/desktopStore.tsx'],
  },
}

/** Minimal latency so loading states are real. */
const wait = (ms = 240) => new Promise((r) => setTimeout(r, ms))

export const fixtureSource: BrowserSource = {
  async search(query) {
    await wait()
    return {
      kind: 'search',
      query,
      results: RESULTS,
    }
  },

  async open(url) {
    await wait()
    const read = READS[url]
    if (read) return read
    if (url.endsWith('.svg')) {
      return { kind: 'image', src: CHART, alt: 'Fixture chart: desk usage by app', source: 'fixtures' }
    }
    if (url.endsWith('.mp4')) {
      return { kind: 'video', src: '', poster: POSTER, source: 'fixtures' }
    }
    // Unknown link: an honest stub page, the way a 404 is honest.
    const blocks: ArticleBlock[] = [
      { kind: 'heading', level: 1, text: 'No fixture for this page' },
      {
        kind: 'paragraph',
        text:
          'The engine’s fetch_article will fill real pages in. This widget renders the typed payloads the tools produce — connect the source and this reads whatever they fetch.',
      },
    ]
    return { kind: 'article', title: url, blocks, evidenceRefs: [] }
  },
}
