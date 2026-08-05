import { describe, it, expect } from 'vitest'
import { encodeHeader, uploadHeaders } from '../src/runtime/server/channels/ntfy/media'

describe('encodeHeader', () => {
  it('leaves plain ascii readable', () => {
    // Encoding everything would turn every log line into base64 for nothing.
    expect(encodeHeader('Deploy failed')).toBe('Deploy failed')
  })

  it('encodes an umlaut per RFC 2047, otherwise it arrives as question marks', () => {
    const encoded = encodeHeader('Grüße')
    const base64 = encoded.slice('=?UTF-8?B?'.length, -2)
    const back = new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))

    expect(encoded).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    expect(back).toBe('Grüße')
  })

  it('encodes emoji too', () => {
    expect(encodeHeader('🐦')).toMatch(/^=\?UTF-8\?B\?/)
  })

  it('treats a newline as needing encoding, it would break the header', () => {
    expect(encodeHeader('a\nb')).toMatch(/^=\?UTF-8\?B\?/)
  })
})

describe('uploadHeaders', () => {
  it('maps the fields onto the headers ntfy expects', () => {
    const headers = uploadHeaders({ message: 'hallo', title: 'Titel', priority: 5 })

    expect(headers).toEqual({ 'X-Message': 'hallo', 'X-Title': 'Titel', 'X-Priority': '5' })
  })

  it('joins tags, ntfy takes them comma separated in a header', () => {
    expect(uploadHeaders({ tags: ['warning', 'skull'] })['X-Tags']).toBe('warning,skull')
  })

  it('leaves out what was not set', () => {
    expect(uploadHeaders({ title: undefined, click: null })).toEqual({})
  })

  it('encodes a non ascii title on the way', () => {
    expect(uploadHeaders({ title: 'Grüße' })['X-Title']).toMatch(/^=\?UTF-8\?B\?/)
  })

  it('ignores fields with no header of their own', () => {
    // `cache` and `firebase` are set elsewhere, `topic` lives in the path.
    expect(uploadHeaders({ topic: 'deploys', cache: false })).toEqual({})
  })
})
