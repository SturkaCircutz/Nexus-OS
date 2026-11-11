import { useState } from 'react'
import type { AppProps } from '@/apps/types'
import './notes.css'

const STORAGE_KEY = 'nexus-notes'

function loadNotes() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Placeholder: one plain-text note saved in the browser. */
export function NotesApp(_props: AppProps) {
  const [text, setText] = useState(loadNotes)
  return (
    <textarea
      className="w-notes"
      aria-label="Notes"
      placeholder="write something…"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        try {
          localStorage.setItem(STORAGE_KEY, e.target.value)
        } catch {
          /* storage unavailable; keep it in memory */
        }
      }}
    />
  )
}
