import { useEffect, useState, type ReactNode } from 'react'
import { SourceBadge } from './SourceBadge'
import { MediaStates } from './MediaStates'

// MediaSurface: places any media into a fixed grid cell. The frame stays the
// standard widget surface (paper, never glass); fit crops or letterboxes; captions
// wrap in Bubble text; attribution is a slot, not an afterthought.

export type MediaPhase = 'loading' | 'ready' | 'error' | 'empty'

export interface MediaSurfaceProps {
  src?: string
  alt: string
  /** cover crops to the box; contain letterboxes on --surface with the dot texture. */
  fit?: 'cover' | 'contain'
  /** Overrides the phase the surface tracks from its own load events. */
  state?: MediaPhase
  message?: string
  onRetry?: () => void
  /** Caption line under the media, in Bubble-scale text. */
  caption?: ReactNode
  /** Attribution slot: a source string, or a ready badge. */
  source?: ReactNode
  className?: string
  /** Content for non-image media (video, article blocks) shown when ready. */
  children?: ReactNode
}

export function MediaSurface({
  src,
  alt,
  fit = 'contain',
  state,
  message,
  onRetry,
  caption,
  source,
  className,
  children,
}: MediaSurfaceProps) {
  const tracked: MediaPhase = state ?? (src ? 'loading' : children ? 'ready' : 'empty')
  const [phase, setPhase] = useState<MediaPhase>(tracked)
  useEffect(() => setPhase(tracked), [tracked])

  return (
    <figure className={className ?? 'nx-media'} data-fit={fit}>
      <div className="nx-media-box">
        {src && (
          <img
            src={src}
            alt={phase === 'ready' ? alt : ''}
            className="nx-media-img"
            loading="lazy"
            decoding="async"
            onLoad={() => setPhase('ready')}
            onError={() => setPhase('error')}
          />
        )}
        {phase !== 'ready' ? (
          <MediaStates state={phase} message={message} onRetry={onRetry} className="nx-media-state" />
        ) : (
          children
        )}
      </div>
      {(caption || source) && (
        <figcaption className="nx-media-caption">
          {caption && <span className="nx-media-caption-text">{caption}</span>}
          {source && (typeof source === 'string' ? <SourceBadge source={source} /> : source)}
        </figcaption>
      )}
    </figure>
  )
}
