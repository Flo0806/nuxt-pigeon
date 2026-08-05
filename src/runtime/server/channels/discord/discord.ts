import { useRuntimeConfig } from '#imports'
import { attach } from './attachments'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { toResult } from '../../core/result'
import { assertWithinLimit, escapeMarkdown } from './format'
import type { DiscordMessage, DiscordResult, DiscordSendOptions } from './types'

function settings() {
  const { discord } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return { webhookUrl: discord.webhookUrl || process.env.PIGEON_DISCORD_WEBHOOK_URL }
}

/**
 * Everything below this is shared: retry, timeout, headers, the error that never
 * carries the url. Discord only contributes its own field names and its limits.
 */
async function send(text: string, options: DiscordSendOptions & RequestOptions = {}) {
  const { webhookUrl } = settings()

  if (!webhookUrl) {
    throw new Error('Discord webhook url is not defined. Set PIGEON_DISCORD_WEBHOOK_URL')
  }

  assertWithinLimit(text)

  const wait = options.wait ?? true
  const url = new URL(webhookUrl)
  url.searchParams.set('wait', String(wait))
  if (options.threadId) {
    url.searchParams.set('thread_id', options.threadId)
  }

  const payload = {
    content: text,
    username: options.username,
    avatar_url: options.avatarUrl,
    allowed_mentions: options.allowedMentions,
    embeds: options.embeds,
    tts: options.tts,
    flags: options.flags,
    thread_name: options.threadName,
    applied_tags: options.appliedTags,
    components: options.components,
    poll: options.poll,
  }

  const body = options.media?.length ? await attach(payload, options.media, options) : payload

  // No secret: our signature headers would mean nothing to Discord.
  const response = await post<DiscordMessage>(url.toString(), body, {
    ...options,
    label: 'Discord',
  })

  return {
    ...toResult('discord', response),
    channel: 'discord',
    id: response._data?.id,
    // No permalink: a message link needs the guild id, and the answer has none.
    threadId: options.threadId,
  } satisfies DiscordResult
}

export const discord = { send, escapeMarkdown }
