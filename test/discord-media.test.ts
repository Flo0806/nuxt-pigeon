import { describe, it, expect } from 'vitest'
import { attach, spoilerName } from '../src/runtime/server/channels/discord/attachments'
import type { ResolvedMedia } from '../src/runtime/server/core/media'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const resolved: ResolvedMedia = {
  bytes: PNG,
  type: 'image/png',
  filename: 'shot.png',
  alt: 'Startseite',
}

describe('spoilerName', () => {
  it('leaves the name alone without a spoiler', () => {
    expect(spoilerName({ data: PNG }, resolved)).toBe('shot.png')
  })

  it('prefixes for a spoiler, which is the only way Discord honours one', () => {
    expect(spoilerName({ data: PNG, spoiler: true }, resolved)).toBe('SPOILER_shot.png')
  })

  it('does not prefix twice when the caller already did', () => {
    const media = { data: PNG, spoiler: true, filename: 'SPOILER_own.png' }

    expect(spoilerName(media, resolved)).toBe('SPOILER_own.png')
  })

  it('lets the given filename win over the resolved one', () => {
    expect(spoilerName({ data: PNG, filename: 'eigen.png' }, resolved)).toBe('eigen.png')
  })
})

describe('attach', () => {
  it('puts each file under files[n] and the rest into payload_json', async () => {
    const form = await attach({ content: 'hallo' }, [{ data: PNG, filename: 'a.png' }], {})

    expect(form.get('files[0]')).toBeInstanceOf(Blob)
    expect(JSON.parse(String(form.get('payload_json'))).content).toBe('hallo')
  })

  it('carries the alt text as `description`, tied by id to the file', async () => {
    const form = await attach({}, [{ data: PNG, alt: 'Ein Screenshot' }], {})
    const payload = JSON.parse(String(form.get('payload_json')))

    expect(payload.attachments).toEqual([
      { id: 0, filename: 'upload.png', description: 'Ein Screenshot' },
    ])
  })

  it('numbers several files so the metadata still matches', async () => {
    const form = await attach({}, [{ data: PNG }, { data: PNG, filename: 'b.png' }], {})
    const payload = JSON.parse(String(form.get('payload_json')))

    expect(form.get('files[1]')).toBeInstanceOf(Blob)
    expect(payload.attachments.map((a: { id: number }) => a.id)).toEqual([0, 1])
    expect(payload.attachments[1].filename).toBe('b.png')
  })

  it('renames a spoiler file, because the flag lives in the name', async () => {
    const form = await attach({}, [{ data: PNG, filename: 'nsfw.png', spoiler: true }], {})
    const payload = JSON.parse(String(form.get('payload_json')))

    expect(payload.attachments[0].filename).toBe('SPOILER_nsfw.png')
  })

  it('keeps an embed that points at the attachment', async () => {
    // How an image ends up inside an embed rather than below the message.
    const embeds = [{ image: { url: 'attachment://a.png' } }]
    const form = await attach({ embeds }, [{ data: PNG, filename: 'a.png' }], {})

    expect(JSON.parse(String(form.get('payload_json'))).embeds).toEqual(embeds)
  })
})
