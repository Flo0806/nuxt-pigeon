import { describe, it, expect } from 'vitest'
import {
  assertImageCount,
  BLUESKY_BLOB_LIMIT,
  externalEmbed,
  imagesEmbed,
  uploadBlob,
  type BlueskyBlob,
} from '../src/runtime/server/channels/bluesky/media'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const blob: BlueskyBlob = {
  $type: 'blob',
  ref: { $link: 'bafy…' },
  mimeType: 'image/png',
  size: 8,
}

function fake(body: unknown) {
  const calls: { url: string; headers?: HeadersInit; body?: BodyInit | null }[] = []

  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), headers: init.headers, body: init.body })

    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof globalThis.fetch

  return { fetch, calls }
}

describe('assertImageCount', () => {
  it('passes at four', () => {
    expect(() => assertImageCount(4)).not.toThrow()
  })

  it('throws at five', () => {
    expect(() => assertImageCount(5)).toThrow(/at most 4 images, got 5/)
  })
})

describe('uploadBlob', () => {
  it('sends the raw bytes with the type in the header, not multipart', async () => {
    const { fetch, calls } = fake({ blob })

    const result = await uploadBlob('https://bsky.social', 'jwt', { data: PNG }, {}, fetch)

    expect(result).toEqual(blob)
    expect(calls[0]!.url).toBe('https://bsky.social/xrpc/com.atproto.repo.uploadBlob')
    expect(calls[0]!.body).not.toBeInstanceOf(FormData)
  })

  it('refuses over the blob limit, which a normal screenshot exceeds', async () => {
    const { fetch } = fake({ blob })
    const big = { data: new Uint8Array(BLUESKY_BLOB_LIMIT + 1) }

    await expect(uploadBlob('https://bsky.social', 'jwt', big, {}, fetch)).rejects.toThrow(
      /Bluesky rejects media over 977 kB/,
    )
  })

  it('says that resizing is our deliberate omission', async () => {
    const { fetch } = fake({ blob })
    const big = { data: new Uint8Array(BLUESKY_BLOB_LIMIT + 1) }

    await expect(uploadBlob('https://bsky.social', 'jwt', big, {}, fetch)).rejects.toThrow(
      /deliberately does not/,
    )
  })
})

describe('imagesEmbed', () => {
  it('carries the blob reference untouched, it is what the record points at', () => {
    expect(imagesEmbed([{ image: blob, alt: 'Ein Bild' }])).toEqual({
      $type: 'app.bsky.embed.images',
      images: [{ image: blob, alt: 'Ein Bild' }],
    })
  })
})

describe('externalEmbed', () => {
  it('builds the link card from what it is given, Bluesky fetches nothing', () => {
    const card = externalEmbed({
      uri: 'https://nuxt.fyi',
      title: 'nuxt.fyi',
      description: 'Nuxt in the wild',
      thumb: blob,
    })

    expect(card).toEqual({
      $type: 'app.bsky.embed.external',
      external: {
        uri: 'https://nuxt.fyi',
        title: 'nuxt.fyi',
        description: 'Nuxt in the wild',
        thumb: blob,
      },
    })
  })

  it('works without a thumbnail', () => {
    const card = externalEmbed({ uri: 'https://a.dev', title: 'a', description: 'b' })

    expect((card.external as { thumb?: unknown }).thumb).toBeUndefined()
  })
})
