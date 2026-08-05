import { assertMediaSize, resolveMedia, type ResolvedMedia } from '../../core/media'
import type { RequestOptions } from '../../core/request'
import type { DiscordMedia } from './types'

/** Default tier. Boosted servers get more, but that cannot be known from here. */
export const MEDIA_LIMIT = 10 * 1024 * 1024
export const MAX_FILES = 10

/** Discord honours a spoiler only through the filename, never through a flag. */
export function spoilerName(media: DiscordMedia, resolved: ResolvedMedia): string {
  const name = media.filename ?? resolved.filename

  return media.spoiler && !name.startsWith('SPOILER_') ? `SPOILER_${name}` : name
}

/**
 * Discord takes files as multipart next to a `payload_json` part, and **no url**: an
 * `embed.image.url` works for a plain picture but ignores spoilers, which is the case
 * people actually reach for. So anything passed as `media` is fetched if needed and
 * attached for real.
 *
 * To show one inside an embed, point at it: `image: { url: 'attachment://shot.png' }`.
 */
export async function attach(
  payload: Record<string, unknown>,
  media: DiscordMedia[],
  options: RequestOptions = {},
  fetch?: typeof globalThis.fetch,
  retained: unknown[] = [],
): Promise<FormData> {
  const total = media.length + retained.length

  if (total > MAX_FILES) {
    throw new Error(`Discord takes at most ${MAX_FILES} files, got ${total}`)
  }

  const form = new FormData()
  // Only used when editing: an entry already on the message keeps that file, the
  // numeric ones below point at a `files[n]` part. What is missing here, Discord drops.
  const meta: unknown[] = [...retained]

  for (const [index, item] of media.entries()) {
    const resolved = await resolveMedia(item, options, fetch)
    assertMediaSize(resolved, MEDIA_LIMIT, 'Discord')

    const filename = spoilerName(item, resolved)

    form.set(`files[${index}]`, new Blob([resolved.bytes], { type: resolved.type }), filename)
    // `id` ties the metadata to `files[n]`, `description` is the alt text.
    meta.push({ id: index, filename, description: resolved.alt })
  }

  form.set('payload_json', JSON.stringify({ ...payload, attachments: meta }))

  return form
}
