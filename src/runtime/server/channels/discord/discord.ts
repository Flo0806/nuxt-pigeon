import { useRuntimeConfig } from '#imports'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { assertWithinLimit, escapeMarkdown } from './format'

export interface DiscordSendOptions extends RequestOptions {
  /** Overrides the name the webhook was created with. */
  username?: string
  avatarUrl?: string
  /** Passed through untouched, so `@everyone` can be defused. */
  allowedMentions?: unknown
  /**
   * Discord answers an empty 204 by default. `wait` asks for the created message
   * instead, which is the only way to learn its id.
   */
  wait?: boolean
}

function settings() {
  const { discord } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return { webhookUrl: discord.webhookUrl || process.env.PIGEON_DISCORD_WEBHOOK_URL }
}

/**
 * Everything below this is shared: retry, timeout, headers, the error that never
 * carries the url. Discord only contributes its own field names and its limit.
 */
async function send(text: string, options: DiscordSendOptions = {}) {
  const { webhookUrl } = settings()

  if (!webhookUrl) {
    throw new Error('Discord webhook url is not defined. Set PIGEON_DISCORD_WEBHOOK_URL')
  }

  assertWithinLimit(text)

  const wait = options.wait ?? true

  return post(
    `${webhookUrl}?wait=${wait}`,
    {
      content: text,
      username: options.username,
      avatar_url: options.avatarUrl,
      allowed_mentions: options.allowedMentions,
    },
    // No secret: our signature headers would mean nothing to Discord.
    { ...options, label: 'Discord' },
  )
}

export const discord = { send, escapeMarkdown }
