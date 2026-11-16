import { useMemo, useState } from 'react'
import { MediaSurface } from '@/ui'
import type { AppProps } from '@/apps/types'
import './files.css'

// The files viewer: a virtual tree until the files backend exists (fixture data,
// honestly marked). Folders open, files preview by type — text and code read as
// mono, images render through the media kit, and types without a preview say so
// instead of pretending.

export type FileKind = 'dir' | 'text' | 'code' | 'image' | 'media' | 'binary'

export interface FileNode {
  name: string
  kind: FileKind
  children?: FileNode[]
  /** Text/code preview body. */
  content?: string
  /** Data-URI for image previews. */
  src?: string
  bytes?: number
  modified?: string
}

const svg = (body: string, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`

const TEAL = '#2f6b62'
const PALE = '#f5f4f0'

export const ROOT: FileNode = {
  name: 'workspace',
  kind: 'dir',
  modified: 'now',
  children: [
    {
      name: 'README.md',
      kind: 'text',
      bytes: 1_204,
      modified: '2d',
      content:
        '# Nexus OS\n\nThe shell is the desk: a 6×4 grid of widgets, an agent orb,\nand apps that ask the window manager for room.\n\n- `shell/` — the desktop, avatar, chrome\n- `apps/` — the registry every app declares itself in\n- `internal-apps/` — the widgets themselves\n',
    },
    {
      name: 'design',
      kind: 'dir',
      modified: '1d',
      children: [
        {
          name: 'palette.svg',
          kind: 'image',
          bytes: 2_310,
          modified: '1d',
          src: svg(
            `<rect width="100%" height="100%" fill="${PALE}"/>` +
              [0, 1, 2, 3].map((i) => `<rect x="${10 + i * 20}" y="14" width="14" height="36" rx="3" fill="${i % 2 ? PALE : TEAL}" stroke="#dcd8ce"/>`).join('') +
              `<text x="10" y="62" font-family="monospace" font-size="7" fill="#26261f">ink · accent · paper</text>`,
            96,
            72,
          ),
        },
        {
          name: 'orbit-ref.html',
          kind: 'code',
          bytes: 14_800,
          modified: '3d',
          content:
            '<!doctype html>\n<title>ORBIT</title>\n<canvas id="o"></canvas>\n\n// three rotating shells, a pulsing core,\n// an expanding ring — the avatar engine\nstartOrbit(canvas, { fontSize: 9, state: "idle" })\n',
        },
      ],
    },
    {
      name: 'notes',
      kind: 'dir',
      modified: '1h',
      children: [
        {
          name: 'meeting-11-12.md',
          kind: 'text',
          bytes: 640,
          modified: '1h',
          content:
            '# 12 Nov\n\n- browser widget: data seam agreed, engine plugs in later\n- agents manager: concepts doc before the next meeting\n- grid: 6×4, sizes 1x1…4x2, pack when full\n',
        },
      ],
    },
    {
      name: 'src',
      kind: 'dir',
      modified: '2d',
      children: [
        {
          name: 'clock.tsx',
          kind: 'code',
          bytes: 5_120,
          modified: '2d',
          content:
            'export function ClockWidget({ hour12 }: { hour12?: boolean }) {\n  const now = useNow()\n  return <time>{fmt(now, hour12)}</time>\n}\n',
        },
      ],
    },
    { name: 'all-hands.mp4', kind: 'media', bytes: 88_400_000, modified: '1d' },
    { name: 'archive.zip', kind: 'binary', bytes: 4_820_000, modified: '5d' },
  ],
}

function findDir(root: FileNode, path: string[]): FileNode {
  let dir = root
  for (const part of path) {
    const next = dir.children?.find((c) => c.name === part && c.kind === 'dir')
    if (!next) break
    dir = next
  }
  return dir
}

const fmtBytes = (b: number) => (b >= 1_000_000 ? `${Math.round(b / 1e5) / 10} MB` : `${Math.round(b / 100) / 10} KB`)

export function FilesApp({ size, mode }: AppProps) {
  const [path, setPath] = useState<string[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const dir = useMemo(() => findDir(ROOT, path), [path])
  const file = dir.children?.find((c) => c.name === sel && c.kind !== 'dir') ?? null

  const enter = (node: FileNode) => {
    if (node.kind === 'dir') {
      setPath((p) => [...p, node.name])
      setSel(null)
    } else setSel(node.name)
  }
  const up = () => {
    setPath((p) => p.slice(0, -1))
    setSel(null)
  }

  // Tiny size: names only.
  if (size === '1x1') {
    return (
      <div className="w-files" data-view="tiny">
        <Breadcrumb path={path} onUp={up} />
        <ul className="w-files-list">
          {(dir.children ?? []).map((c) => (
            <li key={c.name}>
              <button type="button" className="w-files-row" onClick={() => enter(c)}>
                <Mark node={c} />
                <span className="w-files-name">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const tree = <Pane dir={dir} sel={sel} onEnter={enter} />
  const preview = file ? <Preview node={file} /> : <aside className="w-files-preview w-files-preview--empty">pick a file to read it</aside>

  return (
    <div className="w-files" data-view={mode === 'fullscreen' ? 'full' : 'split'}>
      <Breadcrumb path={path} onUp={up} />
      <div className="w-files-body">
        {tree}
        {preview}
      </div>
    </div>
  )
}

function Breadcrumb({ path, onUp }: { path: string[]; onUp: () => void }) {
  return (
    <nav className="w-files-crumbs" aria-label="folder">
      {path.length > 0 && (
        <button type="button" className="w-files-up" onClick={onUp}>
          ‹ up
        </button>
      )}
      <span className="w-files-path">{['workspace', ...path].join(' / ')}</span>
    </nav>
  )
}

function Mark({ node }: { node: FileNode }) {
  return (
    <span className="w-files-mark" aria-hidden="true">
      {node.kind === 'dir' ? '[/]' : node.kind === 'image' ? '[~]' : node.kind === 'code' ? '[<]' : node.kind === 'media' ? '(>)' : node.kind === 'binary' ? '[x]' : '[=]'}
    </span>
  )
}

function Pane({ dir, sel, onEnter }: { dir: FileNode; sel: string | null; onEnter: (n: FileNode) => void }) {
  return (
    <ul className="w-files-list w-files-pane">
      {(dir.children ?? []).map((c) => (
        <li key={c.name}>
          <button type="button" className="w-files-row" data-sel={sel === c.name || undefined} onClick={() => onEnter(c)}>
            <Mark node={c} />
            <span className="w-files-name">{c.name}</span>
            {c.bytes !== undefined && <span className="w-files-when">{fmtBytes(c.bytes)}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Preview({ node }: { node: FileNode }) {
  if (node.kind === 'image' && node.src) {
    return (
      <MediaSurface
        src={node.src}
        alt={node.name}
        className="nx-media w-files-preview--media"
        caption={`${node.name}${node.bytes ? ` · ${fmtBytes(node.bytes)}` : ''}`}
      />
    )
  }
  if ((node.kind === 'text' || node.kind === 'code') && node.content !== undefined) {
    return (
      <pre className="w-files-preview w-files-preview--text">
        <code>{node.content}</code>
      </pre>
    )
  }
  return (
    <aside className="w-files-preview w-files-preview--empty">
      {node.name}
      <span className="w-files-kind">{node.kind}</span>
      <span className="w-files-hint">preview lands with the files backend</span>
    </aside>
  )
}
