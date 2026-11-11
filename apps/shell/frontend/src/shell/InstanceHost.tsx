import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getApp } from '@/apps/registry'
import { AsciiFrame } from '@/ui'
import { useDesktop, type AppInstance } from '@/wm/desktopStore'
import { AppHost } from './AppHost'
import { captureRects, hostNode, releaseHostNode, setFlightLayer, useHostSlot } from './hostNodes'

// Apps open at launch build in one after another.
const INTRO_START = 150
const INTRO_STEP = 200

/**
 * Renders every open app exactly once, into its own stable div. The grid, the fullscreen
 * panel and the hidden keep-alive box below only decide where that div sits.
 */
export function InstanceHost() {
  const { state, store } = useDesktop()
  const [introDelays] = useState(
    () => new Map(state.instances.map((it, n) => [it.id, INTRO_START + n * INTRO_STEP] as const)),
  )

  // Measure positions before each change is drawn, so moves can fly from there.
  useEffect(() => store.subscribe(captureRects), [store])

  // Drop the divs of apps that have left.
  const known = useRef(new Set<string>())
  useEffect(() => {
    const ids = new Set(state.instances.map((i) => i.id))
    for (const id of known.current) if (!ids.has(id)) releaseHostNode(id)
    known.current = ids
  }, [state.instances])

  return (
    <>
      {state.instances.map((it) =>
        createPortal(
          <InstanceView
            key={it.id}
            instance={it}
            delay={introDelays.get(it.id) ?? 0}
            onFocus={() => store.focus(it.id)}
            onFullscreen={() => store.fullscreen(it.appId)}
            onExited={() => store.remove(it.id)}
          />,
          hostNode(it.id),
          it.id,
        ),
      )}
      <div className="nx-keepalive" hidden inert>
        {state.instances
          .filter((it) => it.mode === 'minimized')
          .map((it) => (
            <AwaySlot key={it.id} id={it.id} />
          ))}
      </div>
      <div className="nx-flight" ref={setFlightLayer} aria-hidden="true" />
    </>
  )
}

function AwaySlot({ id }: { id: string }) {
  return <div ref={useHostSlot(id, 'away')} />
}

interface InstanceViewProps {
  instance: AppInstance
  delay: number
  onFocus: () => void
  onFullscreen: () => void
  onExited: () => void
}

function InstanceView({ instance: it, delay, onFocus, onFullscreen, onExited }: InstanceViewProps) {
  const { label } = getApp(it.appId)
  return (
    <div
      className="nx-instance-inner"
      // Focusable from code (Spotlight, dock restore) so apps without controls can hold focus.
      tabIndex={-1}
      onPointerDown={onFocus}
      onFocus={onFocus}
      onDoubleClick={(e) => {
        if (e.target instanceof Element && e.target.closest('.ascii-frame-label')) onFullscreen()
      }}
    >
      <AsciiFrame
        phase={it.exiting ? 'exit' : 'enter'}
        delay={delay}
        label={label}
        moveKey={`${it.col},${it.row},${it.size},${it.mode}`}
        onExited={onExited}
      >
        <AppHost instance={it} />
      </AsciiFrame>
    </div>
  )
}
