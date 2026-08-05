import { useRuntimeConfig } from '#imports'
import { attach } from './attachments'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { toResult, type RawResponse } from '../../core/result'
import { assertWithinLimit, escapeMarkdown } from './format'
import type {
  DiscordEditOptions,
  DiscordHandle,
  DiscordMessage,
  DiscordResult,
  DiscordSendOptions,
} from './types'

function settings() {
  const { discord } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return { webhookUrl: discord.webhookUrl || process.env.PIGEON_DISCORD_WEBHOOK_URL }
}

function result(response: RawResponse<DiscordMessage>, threadId?: string) {
  return {
    ...toResult('discord', response),
    channel: 'discord',
    id: response._data?.id,
    // No permalink: a message link needs the guild id, and the answer carries none.
    threadId,
    attachmentIds: response._data?.attachments?.map((file) => file.id),
  } satisfies DiscordResult
}

/**
 * The address of a single message. Built from the webhook url in the config rather
 * than from the handle on purpose: that url **is** the credential, and a handle is an
 * object users pass around and log.
 */
function messageUrl(handle: DiscordHandle, threadId?: string): string {
  const { webhookUrl } = settings()

  if (!webhookUrl) {
    throw new Error('Discord webhook url is not defined. Set PIGEON_DISCORD_WEBHOOK_URL')
  }

  if (!handle.id) {
    throw new Error(
      'This Discord message has no id, so it cannot be changed or removed. It was sent ' +
        'with `wait: false`, and Discord then answers 204 without telling anyone which ' +
        'message it created',
    )
  }

  const url = new URL(webhookUrl)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/messages/${handle.id}`

  const thread = threadId ?? handle.threadId
  if (thread) {
    url.searchParams.set('thread_id', thread)
  }

  return url.toString()
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

  return result(response, options.threadId)
}

/**
 * Changes a message the webhook sent. Everything left out stays as it is, **except
 * the files**: Discord drops every attachment that the `attachments` array does not
 * name, so leaving it out empties the message of its images.
 *
 * That is a footgun, so it is turned around here:
 *
 * - no `media` given: the files that are on the message stay on it
 * - `media: []`: they are removed, which is then something you asked for
 * - `media: [...]`: the new ones are added and the old ones still stay
 * - `attachments: [...]`: you take the wheel and none of the above applies
 *
 * https://docs.discord.com/developers/resources/webhook#edit-webhook-message
 */
async function edit(
  handle: DiscordHandle,
  text: string,
  options: DiscordEditOptions & RequestOptions = {},
) {
  const url = messageUrl(handle, options.threadId)

  assertWithinLimit(text)

  const keep: unknown[] = options.attachments ?? (handle.attachmentIds ?? []).map((id) => ({ id }))
  // An empty `media` is the only way to say "away with them", and an `attachments` of
  // your own overrules that too.
  const clear = options.media?.length === 0 && !options.attachments

  const payload = {
    content: text,
    allowed_mentions: options.allowedMentions,
    embeds: options.embeds,
    flags: options.flags,
    components: options.components,
    poll: options.poll,
  }

  const body = options.media?.length
    ? await attach(payload, options.media, options, undefined, keep)
    : { ...payload, attachments: clear ? [] : keep }

  const response = await post<DiscordMessage>(url, body, {
    ...options,
    method: 'PATCH',
    label: 'Discord',
  })

  return result(response, options.threadId ?? handle.threadId)
}

/** Gone for good, and Discord answers 204, so there is nothing to read afterwards. */
async function remove(handle: DiscordHandle, options: RequestOptions & { threadId?: string } = {}) {
  const url = messageUrl(handle, options.threadId)

  const response = await post<undefined>(url, undefined, {
    ...options,
    method: 'DELETE',
    label: 'Discord',
  })

  return {
    ...toResult('discord', response),
    channel: 'discord',
    // Kept so a log line after the fact still says which message this was.
    id: handle.id,
    threadId: options.threadId ?? handle.threadId,
  } satisfies DiscordResult
}

export const discord = { send, edit, delete: remove, escapeMarkdown }
