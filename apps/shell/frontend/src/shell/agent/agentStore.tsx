// Agent state: what the avatar is doing, its last reply, and where it rests.
// Same external-store pattern as the desktop store. Only the anchor is saved.

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isAnchor, type Anchor } from './anchors'

export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface AgentState {
  status: AgentStatus
  reply: string
  /** The last reply was a failure. Outlives the brief `error` status, like the bubble does. */
  replyError: boolean
  /** Bumps on every reply, so the bubble shows again even for the same words. */
  replyId: number
  anchor: Anchor
}

/** A reply, flagged when the agent couldn't do what was asked. */
export interface Reply {
  text: string
  error?: boolean
}

const STORAGE_KEY = 'nexus-agent-v1'
const DEFAULT_ANCHOR: Anchor = 'bottom-right'
// The mouth moves while the reply types in, then settles.
const CHAR_MS = 22
const SPEAK_MIN = 600
const SPEAK_MAX = 2400
const ERROR_MS = 1600

export type AgentStore = ReturnType<typeof createAgentStore>

/** Turns a request into a reply. Gets the store so it can move the avatar. */
export type AgentRun = (text: string, agent: AgentStore) => Reply | Promise<Reply>

export function createAgentStore(run: AgentRun) {
  let state: AgentState = { status: 'idle', reply: '', replyError: false, replyId: 0, anchor: loadAnchor() }
  const listeners = new Set<() => void>()
  let settle = 0

  const set = (patch: Partial<AgentState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  /** Shows a reply in the bubble and animates the avatar while it "speaks". */
  const say = (reply: Reply | string) => {
    const { text, error } = typeof reply === 'string' ? { text: reply, error: false } : reply
    window.clearTimeout(settle)
    set({ reply: text, replyError: !!error, replyId: state.replyId + 1, status: error ? 'error' : 'speaking' })
    const ms = error ? ERROR_MS : Math.min(SPEAK_MAX, Math.max(SPEAK_MIN, text.length * CHAR_MS))
    settle = window.setTimeout(() => set({ status: 'idle' }), ms)
  }

  /** Runs a request. Shows "thinking" only while an answer is actually pending. */
  const ask = (text: string) => {
    if (!text.trim()) return
    const result = run(text, api)
    if (!(result instanceof Promise)) {
      say(result)
      return
    }
    window.clearTimeout(settle)
    set({ status: 'thinking' })
    result.then(say, () => say({ text: "couldn't reach the agent. try again.", error: true }))
  }

  const setAnchor = (anchor: Anchor) => {
    if (anchor === state.anchor) return
    set({ anchor })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ anchor }))
    } catch {
      /* storage unavailable; the position lasts for this visit only */
    }
  }

  const api = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    say,
    ask,
    setAnchor,
  }
  return api
}

function loadAnchor(): Anchor {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return isAnchor(saved?.anchor) ? saved.anchor : DEFAULT_ANCHOR
  } catch {
    return DEFAULT_ANCHOR
  }
}

// --- React binding ---

const AgentContext = createContext<AgentStore | null>(null)

export function AgentProvider({ children, run }: { children: ReactNode; run: AgentRun }) {
  // The store is made once; it always calls the latest `run`.
  const [box] = useState(() => ({ run }))
  box.run = run
  const [store] = useState(() => createAgentStore((text, agent) => box.run(text, agent)))
  return <AgentContext.Provider value={store}>{children}</AgentContext.Provider>
}

/** The agent store plus its current state (re-renders on every change). */
export function useAgent() {
  const store = useContext(AgentContext)
  if (!store) throw new Error('useAgent must be used inside <AgentProvider>')
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return { state, store }
}
