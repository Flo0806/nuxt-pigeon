import { describe, it, expect } from 'vitest'
import {
  assertCaptionLimit,
  buildMedia,
  kindFor,
  methodFor,
  TELEGRAM_CAPTION_LIMIT,
} from '../src/runtime/server/channels/telegram/media'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('assertCaptionLimit', () => {
  it('passes at exactly the caption limit', () => {
    expect(() => assertCaptionLimit('x'.repeat(TELEGRAM_CAPTION_LIMIT))).not.toThrow()
  })

  it('throws one over, and says the text limit is different', () => {
    // 1024 with media, 4096 without. That difference is the trap.
    expect(() => assertCaptionLimit('x'.repeat(1025))).toThrow(/1024 characters in a caption/)
    expect(() => assertCaptionLimit('x'.repeat(1025))).toThrow(/Without media the limit is 4096/)
  })
})

describe('kindFor', () => {
  it('picks the method that fits the type', () => {
    expect(kindFor('image/png')).toBe('photo')
    expect(kindFor('video/mp4')).toBe('video')
    expect(kindFor('audio/mpeg')).toBe('audio')
    expect(kindFor('application/pdf')).toBe('document')
  })

  it('sends a gif as a document, a photo would drop the animation', () => {
    expect(kindFor('image/gif')).toBe('document')
  })
})

describe('methodFor', () => {
  it('names the method after the kind', () => {
    expect(methodFor('photo')).toBe('sendPhoto')
    expect(methodFor('document')).toBe('sendDocument')
  })
})

describe('buildMedia with one item', () => {
  it('hands a url over untouched, Telegram fetches it itself', async () => {
    const { method, body } = await buildMedia([{ url: 'https://x.dev/a.jpg' }], { chat_id: 1 })

    expect(method).toBe('sendPhoto')
    expect(body).toEqual({ chat_id: 1, photo: 'https://x.dev/a.jpg' })
  })

  it('sends bytes as multipart under the field the method expects', async () => {
    const { method, body } = await buildMedia([{ data: PNG }], { chat_id: 1, caption: 'hallo' })

    expect(method).toBe('sendPhoto')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('photo')).toBeInstanceOf(Blob)
    expect((body as FormData).get('caption')).toBe('hallo')
  })

  it('leaves out fields that were not set', async () => {
    const { body } = await buildMedia([{ data: PNG }], { chat_id: 1, parse_mode: undefined })

    expect((body as FormData).has('parse_mode')).toBe(false)
  })
})

describe('buildMedia with several items', () => {
  it('becomes an album', async () => {
    const media = [{ url: 'https://x.dev/a.jpg' }, { url: 'https://x.dev/b.jpg' }]
    const { method, body } = await buildMedia(media, { chat_id: 1, caption: 'zwei' })

    expect(method).toBe('sendMediaGroup')
    expect((body as Record<string, unknown>).media).toHaveLength(2)
  })

  it('puts the caption on the first entry only, an album shows one', async () => {
    const media = [{ url: 'https://x.dev/a.jpg' }, { url: 'https://x.dev/b.jpg' }]
    const { body } = await buildMedia(media, { chat_id: 1, caption: 'zwei' })
    const entries = (body as { media: Record<string, unknown>[] }).media

    expect(entries[0]!.caption).toBe('zwei')
    expect(entries[1]!.caption).toBeUndefined()
  })

  it('references uploaded files as attach://, which is how Telegram ties them', async () => {
    const { body } = await buildMedia([{ data: PNG }, { data: PNG }], { chat_id: 1 })
    const form = body as FormData
    const entries = JSON.parse(String(form.get('media'))) as { media: string }[]

    expect(entries.map((entry) => entry.media)).toEqual(['attach://file0', 'attach://file1'])
    expect(form.get('file0')).toBeInstanceOf(Blob)
    expect(form.get('file1')).toBeInstanceOf(Blob)
  })
})
