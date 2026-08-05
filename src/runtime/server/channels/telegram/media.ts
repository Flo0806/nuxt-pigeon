import { isUrlMedia, resolveMedia, type Media, type ResolvedMedia } from '../../core/media'
import type { RequestOptions } from '../../core/request'

/**
 * A caption is **not** a message: Telegram allows 4096 characters for text but only
 * 1024 for the caption under a photo. Sending media therefore lowers the limit, which
 * is the kind of surprise that only shows up in production.
 */
export const TELEGRAM_CAPTION_LIMIT = 1024

export function assertCaptionLimit(text: string): void {
  if (text.length > TELEGRAM_CAPTION_LIMIT) {
    throw new Error(
      `Telegram allows ${TELEGRAM_CAPTION_LIMIT} characters in a caption, got ${text.length}. ` +
        'Without media the limit is 4096.',
    )
  }
}

export type TelegramMediaKind = 'photo' | 'video' | 'audio' | 'document'

/** The method and the field are named after the kind, so one lookup covers both. */
export function kindFor(type: string): TelegramMediaKind {
  if (type.startsWith('image/') && type !== 'image/gif') return 'photo'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'

  // A gif sent as a photo loses its animation, so it goes as a document.
  return 'document'
}

export function methodFor(kind: TelegramMediaKind): string {
  return `send${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
}

/**
 * Telegram fetches a url itself, so nothing is downloaded for that case. Bytes go as
 * multipart. Both forms accept the same fields next to them.
 *
 * Several items become an album through `sendMediaGroup`, where the caption belongs
 * to the **first** entry and the files are referenced as `attach://<name>`.
 */
export async function buildMedia(
  media: Media[],
  fields: Record<string, unknown>,
  options: RequestOptions = {},
  fetch?: typeof globalThis.fetch,
): Promise<{ method: string; body: Record<string, unknown> | FormData }> {
  if (media.length === 1) {
    const item = media[0]!

    if (isUrlMedia(item)) {
      const kind = kindFor(item.filename?.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg')

      return { method: methodFor(kind), body: { ...fields, [kind]: item.url } }
    }

    const resolved = await resolveMedia(item, options, fetch)
    const kind = kindFor(resolved.type)
    const form = new FormData()

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        form.set(key, String(value))
      }
    }
    form.set(kind, new Blob([resolved.bytes], { type: resolved.type }), resolved.filename)

    return { method: methodFor(kind), body: form }
  }

  const entries: Record<string, unknown>[] = []
  const files = new Map<string, ResolvedMedia>()

  for (const [index, item] of media.entries()) {
    // The caption belongs to the first entry, an album shows only one.
    const caption = index === 0 ? { caption: fields.caption, parse_mode: fields.parse_mode } : {}

    if (isUrlMedia(item)) {
      entries.push({ type: 'photo', media: item.url, ...caption })
      continue
    }

    const resolved = await resolveMedia(item, options, fetch)
    const name = `file${index}`
    files.set(name, resolved)
    entries.push({ type: kindFor(resolved.type), media: `attach://${name}`, ...caption })
  }

  if (!files.size) {
    const { caption: _caption, parse_mode: _mode, ...rest } = fields

    return { method: 'sendMediaGroup', body: { ...rest, media: entries } }
  }

  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && key !== 'caption' && key !== 'parse_mode') {
      form.set(key, String(value))
    }
  }
  form.set('media', JSON.stringify(entries))
  for (const [name, file] of files) {
    form.set(name, new Blob([file.bytes], { type: file.type }), file.filename)
  }

  return { method: 'sendMediaGroup', body: form }
}
