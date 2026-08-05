import type { BlueskyByteRange } from './types'

/** An emoji family is one grapheme but 25 bytes, which is why both limits exist. */
export const BLUESKY_GRAPHEME_LIMIT = 300

/** Applies on top of the grapheme limit, both have to hold. */
export const BLUESKY_BYTE_LIMIT = 3000

const encoder = new TextEncoder()

export function graphemeLength(text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  let count = 0

  for (const _ of segmenter.segment(text)) {
    count += 1
  }

  return count
}

export function byteLength(text: string): number {
  return encoder.encode(text).length
}

/** Both limits apply, and `.length` matches neither of them. */
export function assertWithinLimit(text: string): void {
  const graphemes = graphemeLength(text)
  if (graphemes > BLUESKY_GRAPHEME_LIMIT) {
    throw new Error(
      `Bluesky rejects posts over ${BLUESKY_GRAPHEME_LIMIT} graphemes, got ${graphemes}`,
    )
  }

  const bytes = byteLength(text)
  if (bytes > BLUESKY_BYTE_LIMIT) {
    throw new Error(`Bluesky rejects posts over ${BLUESKY_BYTE_LIMIT} bytes, got ${bytes}`)
  }
}

export interface DetectedRanges {
  links: (BlueskyByteRange & { uri: string })[]
  tags: (BlueskyByteRange & { tag: string })[]
  /** Still needs the handle resolved to a did before it can become a facet. */
  mentions: (BlueskyByteRange & { handle: string })[]
}

/**
 * Facet offsets are **UTF-8 bytes**, so a single umlaut before a link shifts every
 * range after it. Computing them from character positions is the classic bug here,
 * and it only shows up once somebody writes "grüße" before a url.
 */
function toByteRange(text: string, start: number, end: number): BlueskyByteRange {
  return {
    byteStart: byteLength(text.slice(0, start)),
    byteEnd: byteLength(text.slice(0, end)),
  }
}

/** A closing paren only counts when the match opened one: `(see https://a.dev/x)`. */
function trimTrailing(match: string): string {
  let end = match.length

  while (end > 0) {
    const char = match[end - 1]!

    if ('.,;:!?"\''.includes(char)) {
      end -= 1
      continue
    }

    if (char === ')' && !match.slice(0, end - 1).includes('(')) {
      end -= 1
      continue
    }

    break
  }

  return match.slice(0, end)
}

const LINK = /https?:\/\/\S+/g
// A tag cannot start with a digit, otherwise "#1" would become one.
const TAG = /(?<=^|\s)#(?![\d\s])\S+/g
const MENTION = /(?<=^|\s)@([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}/gi

/**
 * Pure. Mentions stay handles, because turning one into a facet needs a lookup that
 * only the channel can do.
 */
export function detectRanges(text: string): DetectedRanges {
  const ranges: DetectedRanges = { links: [], tags: [], mentions: [] }

  for (const match of text.matchAll(LINK)) {
    const uri = trimTrailing(match[0])
    ranges.links.push({ ...toByteRange(text, match.index, match.index + uri.length), uri })
  }

  for (const match of text.matchAll(TAG)) {
    const tag = trimTrailing(match[0]).slice(1)
    if (tag) {
      ranges.tags.push({ ...toByteRange(text, match.index, match.index + tag.length + 1), tag })
    }
  }

  for (const match of text.matchAll(MENTION)) {
    const handle = trimTrailing(match[0]).slice(1)
    ranges.mentions.push({
      ...toByteRange(text, match.index, match.index + handle.length + 1),
      handle,
    })
  }

  return ranges
}
