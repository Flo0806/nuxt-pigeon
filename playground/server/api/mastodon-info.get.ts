import { createRequest } from '../../../src/runtime/server/core/request'
import {
  MASTODON_DEFAULT_ATTACHMENTS,
  MASTODON_DEFAULT_LIMIT,
  MASTODON_DEFAULT_URL_COST,
} from '../../../src/runtime/server/channels/mastodon/format'

/**
 * The instance and **its** limits, so the counter on the card is the number that
 * actually decides. 500 is only Mastodon's default, instances run anywhere from there
 * into the thousands.
 *
 * The channel asks the same question internally and caches the answer. It is repeated
 * here rather than exported, because a page wanting the limits is a different need
 * from a channel enforcing them, and the module surface has not been asked to grow.
 */
export default defineEventHandler(async () => {
  const config = useRuntimeConfig().pigeon.channels.mastodon
  const instance = config.instance || process.env.PIGEON_MASTODON_INSTANCE || ''

  const fallback = {
    maxCharacters: MASTODON_DEFAULT_LIMIT,
    charactersReservedPerUrl: MASTODON_DEFAULT_URL_COST,
    maxAttachments: MASTODON_DEFAULT_ATTACHMENTS,
  }

  const info = {
    instance,
    token: Boolean(config.token || process.env.PIGEON_MASTODON_TOKEN),
    limits: fallback,
    reachable: false,
  }

  if (!instance) {
    return info
  }

  try {
    const data = await createRequest({ retries: 1 })<{
      configuration?: {
        statuses?: {
          max_characters?: number
          characters_reserved_per_url?: number
          max_media_attachments?: number
        }
      }
    }>(new URL('/api/v2/instance', instance).toString())

    const statuses = data.configuration?.statuses

    return {
      ...info,
      reachable: true,
      limits: {
        maxCharacters: statuses?.max_characters ?? fallback.maxCharacters,
        charactersReservedPerUrl:
          statuses?.characters_reserved_per_url ?? fallback.charactersReservedPerUrl,
        maxAttachments: statuses?.max_media_attachments ?? fallback.maxAttachments,
      },
    }
  } catch {
    // The defaults then, and the card says that they are guesses.
    return info
  }
})
