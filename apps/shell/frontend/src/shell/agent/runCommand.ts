// Turns a typed request into store actions and a reply for the avatar's bubble.
// When the engine is connected, this is where its async answer comes back.

import type { Theme } from '@/theme'
import type { DesktopStore } from '@/wm/desktopStore'
import { anchorLabel, type Anchor } from './anchors'
import type { Reply } from './agentStore'
import { parseCommand } from './parseCommand'

const HELP =
  'try "show terminal", "make clock small", "minimize notes", "notes fullscreen", "move to top left" or "dark mode".'

export interface CommandContext {
  desktop: DesktopStore
  theme: Theme
  setTheme: (theme: Theme) => void
  moveAvatar: (anchor: Anchor) => void
  showDock: () => void
}

export function runCommand(text: string, ctx: CommandContext): Reply {
  const { desktop } = ctx
  const cmd = parseCommand(text)
  switch (cmd.type) {
    case 'open':
      return { text: desktop.open(cmd.appId, cmd.size) }
    case 'close':
      return { text: desktop.close(cmd.appId) }
    case 'resize':
      return { text: desktop.resize(cmd.appId, cmd.size) }
    case 'minimize':
      return { text: desktop.minimize(cmd.appId) }
    case 'restore':
      return { text: desktop.restore(cmd.appId) }
    case 'fullscreen':
      return { text: desktop.fullscreen(cmd.appId) }
    case 'exitFullscreen':
      return { text: desktop.exitFullscreen() }
    case 'tidy':
      return { text: desktop.tidy() }
    case 'closeAll':
      return { text: desktop.closeAll() }
    case 'moveAvatar':
      ctx.moveAvatar(cmd.anchor)
      return { text: `moved to ${anchorLabel(cmd.anchor)}.` }
    case 'dock':
      ctx.showDock()
      return { text: 'here is the dock.' }
    case 'theme':
      return { text: switchTheme(ctx, cmd.theme) }
    case 'help':
      return { text: HELP }
    case 'unknown':
      return { text: `i can only arrange apps for now. ${HELP}`, error: true }
  }
}

export function switchTheme(ctx: Pick<CommandContext, 'theme' | 'setTheme'>, next: Theme | 'toggle'): string {
  const target = next === 'toggle' ? (ctx.theme === 'dark' ? 'light' : 'dark') : next
  if (target === ctx.theme) return `already in ${ctx.theme} mode.`
  ctx.setTheme(target)
  return `switched to ${target} mode.`
}
