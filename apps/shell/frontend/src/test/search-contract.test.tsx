import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { SearchResult } from '@/types/search'

function ResultKind({ result }: { result: SearchResult }) {
  switch (result.kind) {
    case 'web':
      return <span>Web: {result.title}</span>
    case 'image':
      return <span>Image: {result.title}</span>
    case 'video':
      return <span>Video: {result.title}</span>
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}

const results: SearchResult[] = [
  {
    id: 'web_fixture',
    kind: 'web',
    title: 'Web fixture',
    url: 'https://example.com/web',
    source_name: 'Example',
    snippet: 'Typed web result.',
  },
  {
    id: 'image_fixture',
    kind: 'image',
    title: 'Image fixture',
    url: 'https://example.com/image-source',
    source_name: 'Example',
    image_url: 'https://cdn.example.com/image.png',
    thumbnail_url: 'https://cdn.example.com/image-thumb.png',
  },
  {
    id: 'video_fixture',
    kind: 'video',
    title: 'Video fixture',
    url: 'https://example.com/video',
    source_name: 'Example',
    embeddable: false,
  },
]

describe('generated search result contract', () => {
  it.each(results)('renders the $kind discriminator', (result) => {
    render(<ResultKind result={result} />)
    expect(screen.getByText(new RegExp(`^${result.kind}`, 'i'))).toBeInTheDocument()
  })
})
