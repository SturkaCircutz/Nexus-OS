import { describe, expect, it } from 'vitest'
import { fixtureSource } from './source'

// The offline seam: fixtures must behave the way the engine will — typed
// payloads, honest stubs, no thrown surprises.

describe('fixtureSource.search', () => {
  it('echoes the query and returns typed results', async () => {
    const res = await fixtureSource.search('grid')
    expect(res.kind).toBe('search')
    expect(res.query).toBe('grid')
    expect(res.results.length).toBeGreaterThan(2)
    for (const r of res.results) {
      expect(r.title).toBeTruthy()
      expect(r.url).toBeTruthy()
      expect(r.snippet).toBeTruthy()
    }
  })
})

describe('fixtureSource.open', () => {
  it('serves the article fixture with blocks and evidence', async () => {
    const read = await fixtureSource.open('nexus://notes/grid-snapping')
    expect(read.kind).toBe('article')
    if (read.kind === 'article') {
      expect(read.title).toBe('Grid snapping, explained like phone widgets')
      expect(read.blocks.length).toBeGreaterThan(2)
      expect(read.evidenceRefs.length).toBeGreaterThan(0)
    }
  })

  it('serves image and video fixtures by extension', async () => {
    const img = await fixtureSource.open('nexus://fixtures/metrics.svg')
    expect(img.kind).toBe('image')
    const vid = await fixtureSource.open('nexus://fixtures/all-hands.mp4')
    expect(vid.kind).toBe('video')
    if (vid.kind === 'video') expect(vid.src).toBe('') // offline: no stream, poster stands in
  })

  it('answers unknown links with an honest stub page, not an error', async () => {
    const read = await fixtureSource.open('nexus://nowhere')
    expect(read.kind).toBe('article')
    if (read.kind === 'article') {
      expect(read.title).toBe('nexus://nowhere')
      expect(read.blocks.some((b) => b.kind === 'paragraph' && b.text.includes('fetch_article'))).toBe(true)
      expect(read.evidenceRefs).toEqual([])
    }
  })
})
