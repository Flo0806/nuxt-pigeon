import { describe, it, expect } from 'vitest'
import {
  assertMediaSize,
  detectType,
  isUrlMedia,
  resolveMedia,
} from '../src/runtime/server/core/media'

/** The first bytes of each format, padded so the later offsets exist. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

/** Answers one request with the given body and headers. */
function fake(body: Uint8Array, headers: Record<string, string> = {}) {
  return (async () =>
    new Response(body.slice().buffer, { headers })) as unknown as typeof globalThis.fetch
}

describe('detectType', () => {
  it('recognises the four image formats by their signature', () => {
    expect(detectType(PNG)).toBe('image/png')
    expect(detectType(JPEG)).toBe('image/jpeg')
    expect(detectType(GIF)).toBe('image/gif')
    expect(detectType(WEBP)).toBe('image/webp')
  })

  it('does not mistake a webp for a riff of something else', () => {
    // RIFF is also the wrapper for wav, so the WEBP marker at byte 8 decides.
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])

    expect(detectType(wav)).toBeUndefined()
  })

  it('says nothing rather than guessing', () => {
    expect(detectType(new Uint8Array([1, 2, 3, 4]))).toBeUndefined()
  })
})

describe('resolveMedia from bytes', () => {
  it('takes the type from the bytes when none is given', async () => {
    const media = await resolveMedia({ data: PNG })

    expect(media.type).toBe('image/png')
    expect(media.bytes).toEqual(PNG)
  })

  it('lets an explicit type win, the caller may know better', async () => {
    expect((await resolveMedia({ data: PNG, type: 'image/apng' })).type).toBe('image/apng')
  })

  it('takes the type of a Blob', async () => {
    const blob = new Blob([JPEG], { type: 'image/jpeg' })

    expect((await resolveMedia({ data: blob })).type).toBe('image/jpeg')
  })

  it('invents a filename from the type when there is none', async () => {
    expect((await resolveMedia({ data: PNG })).filename).toBe('upload.png')
  })

  it('keeps the given filename and the alt text', async () => {
    const media = await resolveMedia({ data: PNG, filename: 'shot.png', alt: 'Startseite' })

    expect(media.filename).toBe('shot.png')
    expect(media.alt).toBe('Startseite')
  })

  it('falls back to octet-stream instead of pretending to know', async () => {
    expect((await resolveMedia({ data: new Uint8Array([1, 2, 3]) })).type).toBe(
      'application/octet-stream',
    )
  })
})

describe('resolveMedia from a url', () => {
  it('fetches the bytes and names the file after the path', async () => {
    const media = await resolveMedia({ url: 'https://x.dev/a/shot.png' }, {}, fake(PNG))

    expect(media.bytes).toEqual(PNG)
    expect(media.filename).toBe('shot.png')
    expect(media.type).toBe('image/png')
  })

  it('trusts the bytes over a wrong content type', async () => {
    // A server that labels everything octet-stream is common enough that the
    // signature has to win.
    const fetcher = fake(PNG, { 'content-type': 'application/octet-stream' })

    expect((await resolveMedia({ url: 'https://x.dev/a.png' }, {}, fetcher)).type).toBe('image/png')
  })

  it('uses the content type when the bytes say nothing', async () => {
    const fetcher = fake(new Uint8Array([1, 2, 3]), {
      'content-type': 'image/svg+xml; charset=utf-8',
    })

    expect((await resolveMedia({ url: 'https://x.dev/a.svg' }, {}, fetcher)).type).toBe(
      'image/svg+xml',
    )
  })
})

describe('isUrlMedia', () => {
  it('tells the two forms apart, which is how a channel decides to download', () => {
    expect(isUrlMedia({ url: 'https://x.dev/a.png' })).toBe(true)
    expect(isUrlMedia({ data: PNG })).toBe(false)
  })
})

describe('assertMediaSize', () => {
  const media = { bytes: new Uint8Array(2048), type: 'image/png', filename: 'shot.png' }

  it('passes under the limit', () => {
    expect(() => assertMediaSize(media, 4096, 'Bluesky')).not.toThrow()
  })

  it('names the channel, the file and both sizes in kB', () => {
    // Bluesky's limit is the one people run into, so the message has to say why.
    expect(() => assertMediaSize(media, 1024, 'Bluesky')).toThrow(
      /Bluesky rejects media over 1 kB, "shot.png" is 2 kB/,
    )
  })

  it('says that resizing is deliberately not our job', () => {
    expect(() => assertMediaSize(media, 1024, 'Bluesky')).toThrow(/deliberately does not/)
  })
})
