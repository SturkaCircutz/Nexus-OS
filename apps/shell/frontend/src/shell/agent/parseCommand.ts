// Stand-in for the real agent: keyword matching only, no backend call.
// Stays as the offline fallback once the engine's agent is connected.

import { APP_IDS, getApp, type AppId } from '@/apps/registry'
import type { SizeRequest } from '@/wm/desktopStore'
import { anchorFromText, type Anchor } from './anchors'

export type Command =
  | { type: 'open'; appId: AppId; size?: SizeRequest }
  | { type: 'close'; appId: AppId }
  | { type: 'resize'; appId: AppId; size: SizeRequest }
  | { type: 'minimize'; appId: AppId }
  | { type: 'restore'; appId: AppId }
  | { type: 'fullscreen'; appId: AppId }
  | { type: 'exitFullscreen' }
  | { type: 'moveAvatar'; anchor: Anchor }
  | { type: 'dock' }
  | { type: 'closeAll' }
  | { type: 'tidy' }
  | { type: 'theme'; theme: 'light' | 'dark' | 'toggle' }
  | { type: 'help' }
  | { type: 'unknown' }

const has = (text: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text))
const includes = (text: string, phrases: string[]) => phrases.some((p) => text.includes(p))

function findApp(text: string): AppId | undefined {
  return APP_IDS.find((id) => has(text, getApp(id).aliases))
}

function findSize(text: string): SizeRequest | undefined {
  if (has(text, ['bigger', 'larger', 'grow', 'expand'])) return 'up'
  if (has(text, ['smaller', 'shrink'])) return 'down'
  if (has(text, ['small', 'tiny', 'compact', '1x1'])) return '1x1'
  if (has(text, ['panorama', 'widest', '4x2']) || text.includes('extra wide')) return '4x2'
  if (has(text, ['tall', '1x2'])) return '1x2'
  if (has(text, ['medium', 'wide', '2x1'])) return '2x1'
  if (has(text, ['large', 'big', 'huge', '2x2'])) return '2x2'
  return undefined
}

export function parseCommand(input: string): Command {
  const text = input.toLowerCase().trim()
  const appId = findApp(text)
  const size = findSize(text)

  if (has(text, ['help']) || text.includes('what can you do')) return { type: 'help' }

  // The avatar: "move to the top left", "go to the center", "avatar bottom right".
  const anchor = anchorFromText(text)
  if (anchor && !appId && (has(text, ['avatar', 'agent', 'yourself', 'you']) || has(text, ['move', 'go', 'sit'])))
    return { type: 'moveAvatar', anchor }

  if (!appId) {
    if (has(text, ['dock'])) return { type: 'dock' }
    if (has(text, ['dark'])) return { type: 'theme', theme: 'dark' }
    if (has(text, ['light'])) return { type: 'theme', theme: 'light' }
    if (has(text, ['theme'])) return { type: 'theme', theme: 'toggle' }
  }

  if (includes(text, ['exit full', 'leave full', 'back to the grid', 'back to grid']) || has(text, ['unfocus']))
    return { type: 'exitFullscreen' }
  if (appId && (has(text, ['fullscreen', 'maximize', 'maximise']) || includes(text, ['full screen', 'focus on'])))
    return { type: 'fullscreen', appId }
  if (appId && (has(text, ['minimize', 'minimise']) || includes(text, ['put away', 'hide away', 'tuck away'])))
    return { type: 'minimize', appId }
  if (appId && (has(text, ['restore', 'unminimize']) || includes(text, ['bring back'])))
    return { type: 'restore', appId }

  if (has(text, ['tidy', 'arrange', 'rearrange', 'organize', 'organise']) || text.includes('clean up'))
    return { type: 'tidy' }
  if (has(text, ['hide', 'close', 'remove', 'dismiss', 'clear'])) {
    if (has(text, ['all', 'everything']) || text === 'clear') return { type: 'closeAll' }
    if (appId) return { type: 'close', appId }
  }
  if (appId && size && has(text, ['make', 'resize', 'set', 'bigger', 'smaller', 'larger', 'grow', 'shrink', 'expand']))
    return { type: 'resize', appId, size }
  if (appId) return { type: 'open', appId, size }
  return { type: 'unknown' }
}
