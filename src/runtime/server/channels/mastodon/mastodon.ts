import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import { createRequest, type RequestOptions } from '../../core/request'
import type { Media } from '../../core/media'
import {
  assertWithinLimit,
  MASTODON_DEFAULT_ATTACHMENTS,
  MASTODON_DEFAULT_IMAGE_SIZE,
  MASTODON_DEFAULT_LIMIT,
  MASTODON_DEFAULT_URL_COST,
  pageIds,
  type MastodonLimits,
} from './format'
import { assertAttachmentCount, uploadMedia } from './media'
import type {
  MastodonNotification,
  MastodonNotificationOptions,
  MastodonPostOptions,
  MastodonStatus,
} from './types'

/** Survives HMR, otherwise every reload asks the instance for its limits again. */
const LIMITS = Symbol.for('nuxt-pigeon:mastodon-limits')

function settings() {
  const { mastodon } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return {
    instance: mastodon.instance || process.env.PIGEON_MASTODON_INSTANCE,
    token: mastodon.token || process.env.PIGEON_MASTODON_TOKEN,
  }
}

function credentials() {
  const { instance, token } = settings()

  if (!instance || !token) {
    throw new Error(
      'Mastodon instance or token is not defined. Set PIGEON_MASTODON_INSTANCE and _TOKEN',
    )
  }

  return { instance, token }
}

function cache(): Map<string, MastodonLimits> {
  const store = globalThis as Record<symbol, Map<string, MastodonLimits> | undefined>

  return (store[LIMITS] ??= new Map())
}

/**
 * The limit is per instance, from 500 up to several thousand. Asked once and kept,
 * because otherwise every post would cost two requests.
 *
 * Falls back to Mastodon's defaults when the instance cannot be reached: the post
 * then either goes through or the instance refuses it, which beats blocking here.
 */
async function limits(instance: string): Promise<MastodonLimits> {
  const known = cache().get(instance)
  if (known) {
    return known
  }

  const fallback: MastodonLimits = {
    maxCharacters: MASTODON_DEFAULT_LIMIT,
    charactersReservedPerUrl: MASTODON_DEFAULT_URL_COST,
    maxAttachments: MASTODON_DEFAULT_ATTACHMENTS,
    imageSizeLimit: MASTODON_DEFAULT_IMAGE_SIZE,
  }

  let resolved = fallback
  try {
    const data = await createRequest({ retries: 1 })<{
      configuration?: {
        statuses?: {
          max_characters?: number
          characters_reserved_per_url?: number
          max_media_attachments?: number
        }
        media_attachments?: { image_size_limit?: number }
      }
    }>(new URL('/api/v2/instance', instance).toString())

    const statuses = data.configuration?.statuses
    resolved = {
      maxCharacters: statuses?.max_characters ?? fallback.maxCharacters,
      charactersReservedPerUrl:
        statuses?.characters_reserved_per_url ?? fallback.charactersReservedPerUrl,
      // Both numbers vary by instance as well, so they come from the same call.
      maxAttachments: statuses?.max_media_attachments ?? fallback.maxAttachments,
      imageSizeLimit:
        data.configuration?.media_attachments?.image_size_limit ?? fallback.imageSizeLimit,
    }
  } catch {
    // Keep the defaults, the instance decides in the end anyway.
  }

  cache().set(instance, resolved)

  return resolved
}

/** Public, so this lands on your timeline where everyone can read it. */
async function post(
  text: string,
  options: MastodonPostOptions & RequestOptions & { media?: Media[] } = {},
) {
  const { instance, token } = credentials()
  const known = await limits(instance)

  assertWithinLimit(text, known)

  // Every attachment is uploaded first and referenced by id, Mastodon takes no url.
  let mediaIds: string[] | undefined
  if (options.media?.length) {
    assertAttachmentCount(options.media.length, known)
    mediaIds = []
    for (const item of options.media) {
      mediaIds.push(await uploadMedia(instance, token, item, known, options))
    }
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }

  return createRequest(options)<MastodonStatus>(new URL('/api/v1/statuses', instance).toString(), {
    method: 'POST',
    headers,
    body: {
      status: text,
      visibility: options.visibility,
      spoiler_text: options.spoilerText,
      sensitive: options.sensitive,
      language: options.language,
      in_reply_to_id: options.inReplyToId,
      scheduled_at: options.scheduledAt,
      media_ids: mediaIds,
    },
  })
}

/**
 * Polling, there is no webhook for your own account. The rate limit is 300 requests
 * per five minutes, so anything above a few seconds is safe.
 *
 * Poll with `minId` set to the newest id you hold, never with `sinceId`: the first
 * walks forward from that point, the second returns the newest results and drops
 * whatever did not fit into `limit`.
 */
async function notifications(options: MastodonNotificationOptions & RequestOptions = {}) {
  const { instance, token } = credentials()
  const url = new URL('/api/v1/notifications', instance)

  const query: Record<string, string | undefined> = {
    min_id: options.minId,
    since_id: options.sinceId,
    max_id: options.maxId,
    limit: options.limit?.toString(),
    account_id: options.accountId,
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value)
    }
  }

  // Both filters are repeated keys, not comma separated lists.
  for (const type of options.types ?? []) {
    url.searchParams.append('types[]', type)
  }
  for (const type of options.excludeTypes ?? []) {
    url.searchParams.append('exclude_types[]', type)
  }

  const response = await createRequest(options).raw<MastodonNotification[]>(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  return {
    notifications: response._data ?? [],
    ...pageIds(response.headers.get('link')),
  }
}

/** Register from a Nitro plugin. The returned function unregisters again. */
function listen(handler: Handler<MastodonNotification>): () => void {
  return addListener('mastodon', handler)
}

export const mastodon = { post, listen, notifications }
