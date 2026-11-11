import type { AppProps } from '@/apps/types'
import './files.css'

// Placeholder data until the files backend exists.
const RECENT_FILES: [name: string, when: string][] = [
  ['UI-Overview.md', 'now'],
  ['todoDoc.pdf', '1h'],
  ['README.md', '2d'],
  ['clock/App.tsx', '2d'],
]

export function FilesApp({ size }: AppProps) {
  const compact = size === '1x1'
  const files = compact ? RECENT_FILES.slice(0, 3) : RECENT_FILES
  return (
    <ul className="w-files">
      {files.map(([name, when]) => (
        <li key={name}>
          <span className="w-files-name">{name}</span>
          {!compact && <span className="w-files-when">{when}</span>}
        </li>
      ))}
    </ul>
  )
}
