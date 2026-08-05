import { describe, it, expect } from 'vitest'
import { assertAttachmentCount, uploadMedia } from '../src/runtime/server/channels/mastodon/media'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const limits = { maxAttachments: 4, imageSizeLimit: 1024 * 1024 }

/** Answers the upload, then the status checks, in the given order. */
function fake(...steps: { status: number; body?: unknown }[]) {
  const calls: { url: string; method?: string; body?: BodyInit | null }[] = []

  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    const step = steps[calls.length] ?? steps.at(-1)!
    calls.push({ url: String(url), method: init.method, body: init.body })

    return new Response(JSON.stringify(step.body ?? {}), {
      status: step.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof globalThis.fetch

  return { fetch, calls }
}

describe('assertAttachmentCount', () => {
  it('passes at the limit', () => {
    expect(() => assertAttachmentCount(4, limits)).not.toThrow()
  })

  it('throws one over, with the instance number', () => {
    expect(() => assertAttachmentCount(5, limits)).toThrow(/at most 4 attachments, got 5/)
  })
})

describe('uploadMedia', () => {
  it('sends the file as multipart, Mastodon takes no url', async () => {
    const { fetch, calls } = fake({ status: 200, body: { id: '42' } })

    const id = await uploadMedia('https://m.social', 'tok', { data: PNG }, limits, {}, fetch)

    expect(id).toBe('42')
    expect(calls[0]!.url).toBe('https://m.social/api/v2/media')
    expect(calls[0]!.body).toBeInstanceOf(FormData)
  })

  it('carries the alt text as `description`', async () => {
    const { fetch, calls } = fake({ status: 200, body: { id: '42' } })

    await uploadMedia('https://m.social', 'tok', { data: PNG, alt: 'Ein Bild' }, limits, {}, fetch)

    expect((calls[0]!.body as FormData).get('description')).toBe('Ein Bild')
  })

  it('waits when the upload answers 202, posting early would be refused', async () => {
    // 202 means still processing, 200 on the follow up means ready.
    const { fetch, calls } = fake(
      { status: 202, body: { id: '42' } },
      { status: 200, body: { id: '42' } },
    )

    const id = await uploadMedia('https://m.social', 'tok', { data: PNG }, limits, {}, fetch)

    expect(id).toBe('42')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.url).toBe('https://m.social/api/v1/media/42')
  })

  it('refuses a file over the instance limit, with both numbers', async () => {
    const { fetch } = fake({ status: 200, body: { id: '42' } })
    const big = { data: new Uint8Array(2 * 1024 * 1024) }

    await expect(uploadMedia('https://m.social', 'tok', big, limits, {}, fetch)).rejects.toThrow(
      /Mastodon rejects media over 1024 kB/,
    )
  })

  it('complains when no id comes back rather than posting nothing', async () => {
    const { fetch } = fake({ status: 200, body: {} })

    await expect(
      uploadMedia('https://m.social', 'tok', { data: PNG }, limits, {}, fetch),
    ).rejects.toThrow(/returned no id/)
  })
})
