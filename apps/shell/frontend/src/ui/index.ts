// The Nexus UI library — the ONLY public API. Apps and chrome import from '@/ui'
// and never reach into these folders directly. Layering: L0 ← L1 ← L2 ← L3 ← L4 ←
// L5; nothing below the integration seam imports from `shell/` or `wm/`.

// L0 — foundations
export { DUR, FRAME_MS, TYPE_MS, STAY_MS } from './tokens/motion'

// L1 — motion + ASCII
export { FLING, MOVE, SHEET, Springs, project, rubberband, useSprings, type SpringConfig } from './motion/spring'
export { animate } from './motion/timeline'
export { AsciiFrame, ENTER_MS, type Phase, type FrameVariant } from './ascii/AsciiFrame'
export { AsciiSpinner } from './ascii/AsciiSpinner'
export { AsciiMeter } from './ascii/AsciiMeter'
export { AsciiFace, FACES, faceLines, type Face } from './ascii/AsciiFace'
export { Glyph, APP_GLYPH, MARKS, KEYS, type GlyphName } from './ascii/glyphs'

// L2 — components
export { Text, Bubble, Mono, Label, Micro } from './components/Text'
export { Button, IconButton, type ButtonProps } from './components/Button'
export { Divider, Badge, Kbd } from './components/Markers'
export { Spinner, Meter, Loading } from './components/Status'
export { Input, Textarea, SearchField } from './components/Input'
export { Checkbox, Radio, RadioGroup, Switch } from './components/Controls'
export { Popover, type PopoverProps, type PopoverTriggerProps } from './components/Popover'
export { Select, type SelectOption, type SelectProps } from './components/Select'
export { Panel, Section, Stack, ScrollArea, Tabs, type TabDef } from './components/Layout'

// L3 — overlays
export { Dialog, type DialogProps } from './overlays/Dialog'
export { EmptyState } from './overlays/EmptyState'
export { ErrorBoundary } from './overlays/ErrorBoundary'
export { ConfirmPanel, type ConfirmPanelProps } from './overlays/ConfirmPanel'
export { trapTabKey } from './overlays/trapTab'
export {
  ToastHost,
  Toast,
  useToasts,
  createToastStore,
  type ToastStore,
  type Notice,
} from './overlays/Toast'

// L4 — AI-native
export { AgentStatus, AGENT_STATUS_TEXT, WORKING } from './ai/AgentStatus'
export { StreamingText, type StreamingTextProps } from './ai/StreamingText'
export { PromptInput, type PromptInputProps } from './ai/PromptInput'
export { ActivityTimeline, ActivitySummary, type TimelineTask } from './ai/ActivityTimeline'
export { ToolCard, type ToolCardProps } from './ai/ToolCard'
export { InterruptPanel, type InterruptPanelProps } from './ai/InterruptPanel'

// L4B — media/content kit
export { MediaSurface, type MediaSurfaceProps, type MediaPhase } from './media/MediaSurface'
export { MediaStates, type MediaStatesProps } from './media/MediaStates'
export { SourceBadge, type SourceBadgeProps } from './media/SourceBadge'
export { useMediaLifecycle, type MediaLifecycle } from './media/useMediaLifecycle'

// L5 — templates
export { WidgetTemplate, type WidgetTemplateProps } from './templates/WidgetTemplate'
export { AppTemplate, type AppTemplateProps } from './templates/AppTemplate'

// WM integration seam (the sanctioned exception — see integration.ts)
export {
  useAppActions,
  useDesktopCommands,
  useDesktopInstances,
  type AppActions,
  type DesktopCommands,
} from './integration'
