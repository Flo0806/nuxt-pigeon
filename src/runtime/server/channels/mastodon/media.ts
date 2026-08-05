import { assertMediaSize, resolveMedia, type Media } from '../../core/media'
import { createRequest, type RequestOptions } from '../../core/request'

/** How long to wait for the server to finish processing before giving up. */
const PROCESSING_TIMEOUT_MS = 30_000
const PROCESSING_POLL_MS = 1000

export interface MastodonMediaLimits {
  /** From `configuration.statuses.max_media_attachments`, four by default. */
  maxAttachments: number
  /** From `configuration.media_attachments.image_size_limit`. */
  imageSizeLimit: number
}

interface Attachment {
  id: string
  url?: string
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Mastodon takes **no url**: `/api/v2/media` accepts a multipart `file` and nothing
 * else, so anything given as a url is fetched here first.
 *
 * The upload answers **202 while it is still processing** a large image or a video,
 * and a status posted with such an id is rejected. So the id is polled until the
 * server reports it ready. That waiting is the whole reason this is not two lines.
 */
export async function uploadMedia(
  instance: string,
  token: string,
  media: Media,
  limits: MastodonMediaLimits,
  options: RequestOptions = {},
  fetch?: typeof globalThis.fetch,
): Promise<string> {
  const resolved = await resolveMedia(media, options, fetch)
  assertMediaSize(resolved, limits.imageSizeLimit, 'Mastodon')

  const form = new FormData()
  form.set('file', new Blob([resolved.bytes], { type: resolved.type }), resolved.filename)
  if (resolved.alt) {
    // Mastodon calls the alt text `description` and nags when it is missing.
    form.set('description', resolved.alt)
  }

  const request = createRequest(options, fetch)
  const response = await request.raw<Attachment>(new URL('/api/v2/media', instance).toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })

  const id = response._data?.id
  if (!id) {
    throw new Error('Mastodon accepted the upload but returned no id')
  }

  if (response.status !== 202) {
    return id
  }

  const until = Date.now() + PROCESSING_TIMEOUT_MS
  while (Date.now() < until) {
    await wait(PROCESSING_POLL_MS)

    const check = await request.raw<Attachment>(
      new URL(`/api/v1/media/${id}`, instance).toString(),
      { headers: { Authorization: `Bearer ${token}` } },
    )

    // 200 means processing finished, 206 means it is still going.
    if (check.status === 200) {
      return id
    }
  }

  throw new Error(
    `Mastodon was still processing "${resolved.filename}" after ` +
      `${PROCESSING_TIMEOUT_MS / 1000}s. Posting with an unfinished attachment fails, ` +
      'so try a smaller file.',
  )
}

export function assertAttachmentCount(count: number, limits: MastodonMediaLimits): void {
  if (count > limits.maxAttachments) {
    throw new Error(`Mastodon takes at most ${limits.maxAttachments} attachments, got ${count}`)
  }
}
