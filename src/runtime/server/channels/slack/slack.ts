import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import type { SlackEnvelope, SlackMessage } from './types'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { toResult, type PigeonResult, type RawResponse } from '../../core/result'
import { assertWithinLimit, escapeMrkdwn } from './format'
import { assertOk, chooseMode, requireBot, type SlackCredentials } from './mode'
import { completeBody, uploadFiles } from './upload'
import type { Media } from '../../core/media'

const API = 'https://slack.com/api'

export interface SlackSendOptions extends RequestOptions {
  /** Slack parses by default. False sends the text literally. */
  mrkdwn?: boolean
  /** Block Kit, passed through untouched. `text` stays the notification preview. */
  blocks?: unknown[]
  /**
   * Channel **id** like `C01ABC2DEF`, never a name like `#deploys`. Bot token only:
   * an incoming webhook has its channel baked in and cannot be pointed elsewhere.
   */
  channelId?: string
  /** Replies in a thread. The `id` of the message being answered. */
  threadTs?: string
  /** A thread reply that also shows up in the channel itself. */
  replyBroadcast?: boolean
  /** Off stops Slack from expanding links into previews. */
  unfurlLinks?: boolean
  unfurlMedia?: boolean
  /** Overrides the app's name and picture for this one message. */
  username?: string
  iconEmoji?: string
  iconUrl?: string
  /** Passed through untouched. The older, pre Block Kit way of adding structure. */
  attachments?: unknown[]
  /** Passed through untouched, for your own event metadata. */
  metadata?: unknown
  /**
   * Bot token only, and the bot has to be **in** the channel: `chat:write.public`
   * covers messages but not uploads.
   *
   * A file is not attached to a message here, it **becomes** one, with the text as its
   * comment. Slack does not hand back a message timestamp for it, so the result has
   * `fileIds` instead of an `id`, and such a message cannot be edited afterwards.
   */
  media?: Media[]
}

/** Everything needed to point at a message again, and all `edit` and `delete` ask for. */
export interface SlackHandle {
  /** Where it went. `chat.update` cannot find a message without it. */
  channelId?: string
  /** Slack's `ts`, which doubles as the message id. */
  id?: string
  /**
   * The blocks **we** sent, not the ones Slack echoed back. `chat.update` drops the
   * blocks when only text is given, so they have to travel again to survive an edit.
   *
   * The echo is ignored on purpose: Slack builds its own blocks out of plain text, and
   * sending those back would make the **old** text win over the new one.
   */
  blocks?: unknown[]
  /**
   * Set instead of `id` when the message is a file upload. `delete` uses these, `edit`
   * cannot: Slack answers an upload without a message timestamp.
   */
  fileIds?: string[]
}

export interface SlackResult extends PigeonResult<SlackMessage | string | undefined>, SlackHandle {
  channel: 'slack'
}

function settings(): SlackCredentials {
  const { slack } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return {
    webhookUrl: slack.webhookUrl || process.env.PIGEON_SLACK_WEBHOOK_URL,
    botToken: slack.botToken || process.env.PIGEON_SLACK_BOT_TOKEN,
    channel: slack.channel || process.env.PIGEON_SLACK_CHANNEL,
  }
}

/**
 * One call against the Web API. The status is not the answer here: Slack replies 200
 * and puts the failure in the body, so `assertOk` decides.
 */
async function callApi<T>(
  method: string,
  token: string,
  body: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<RawResponse<T>> {
  const response = await post<T>(`${API}/${method}`, body, {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
    label: `Slack ${method}`,
  })

  assertOk(method, response._data)

  return response
}

function result(response: RawResponse<SlackMessage>, handle: SlackHandle): SlackResult {
  return {
    ...toResult('slack', response),
    ...handle,
    channel: 'slack',
    // `ts` is both the id and the sort key. Falls back to the handle, because
    // chat.delete answers without one.
    id: response._data?.ts ?? handle.id,
    // Where it actually landed, which the handle only assumed.
    channelId: response._data?.channel ?? handle.channelId,
  } as SlackResult
}

/**
 * Two ways in, one signature. With a bot token this is `chat.postMessage`: it picks
 * its channel per message, answers with an id and can be changed afterwards. Without
 * one it is the incoming webhook, which answers with the plain text `ok`.
 *
 * That `ok` is still handed over, because it is what Slack said, and the missing `id`
 * is what says the rest.
 */
async function send(text: string, options: SlackSendOptions = {}): Promise<SlackResult> {
  const credentials = settings()
  const mode = chooseMode(credentials, options.channelId)

  assertWithinLimit(text)

  if (mode === 'webhook') {
    const response = await post<string>(
      credentials.webhookUrl!,
      { text, mrkdwn: options.mrkdwn, blocks: options.blocks, attachments: options.attachments },
      { ...options, label: 'Slack' },
    )

    return { ...toResult('slack', response), channel: 'slack', id: undefined }
  }

  const target = options.channelId || credentials.channel!

  if (options.media?.length) {
    return upload(credentials.botToken!, target, text, options)
  }

  const response = await callApi<SlackMessage>(
    'chat.postMessage',
    credentials.botToken!,
    {
      channel: target,
      text,
      mrkdwn: options.mrkdwn,
      blocks: options.blocks,
      attachments: options.attachments,
      thread_ts: options.threadTs,
      reply_broadcast: options.replyBroadcast,
      unfurl_links: options.unfurlLinks,
      unfurl_media: options.unfurlMedia,
      username: options.username,
      icon_emoji: options.iconEmoji,
      icon_url: options.iconUrl,
      metadata: options.metadata,
    },
    options,
  )

  return result(response, { channelId: target, blocks: options.blocks })
}

/**
 * The file path through `send`. Reads the same from outside, works completely
 * differently inside, and ends with one message in the channel: the picture with the
 * text above it.
 *
 * What cannot be hidden is the missing timestamp. Slack answers with file ids and no
 * `ts`, so the message has no address, and `edit` has to say so rather than pretend.
 */
async function upload(
  token: string,
  channelId: string,
  text: string,
  options: SlackSendOptions,
): Promise<SlackResult> {
  const uploads = await uploadFiles(token, options.media!, options)

  const response = await post<SlackMessage>(
    `${API}/files.completeUploadExternal`,
    completeBody(uploads, {
      channel_id: channelId,
      initial_comment: text,
      thread_ts: options.threadTs,
      blocks: options.blocks ? JSON.stringify(options.blocks) : undefined,
      username: options.username,
      icon_emoji: options.iconEmoji,
      icon_url: options.iconUrl,
    }),
    {
      ...options,
      headers: { Authorization: `Bearer ${token}` },
      label: 'Slack files.completeUploadExternal',
    },
  )

  assertOk('files.completeUploadExternal', response._data)

  return {
    ...toResult('slack', response),
    channel: 'slack',
    channelId,
    // No id on purpose: Slack does not say which message it created.
    id: undefined,
    fileIds: uploads.map((file) => file.id),
  }
}

function addressed(handle: SlackHandle, verb: string): { channel: string; ts: string } {
  if (handle.fileIds?.length && !handle.id) {
    throw new Error(
      `slack cannot ${verb} a message that is a file upload. Slack answers an upload ` +
        'with file ids and **no message timestamp**, so there is no address for ' +
        '`chat.update`. Delete it and send again, or send the text and the file as two ' +
        'separate messages if you need to change it later.',
    )
  }

  if (!handle.channelId || !handle.id) {
    throw new Error(
      'This Slack message has no channel or id, so it cannot be changed or removed. ' +
        'Pass the result of `send`, or a handle with `channelId` and `id`. A message sent ' +
        'through an incoming webhook never has one.',
    )
  }

  return { channel: handle.channelId, ts: handle.id }
}

/**
 * Bot token only. Two Slack rules that surprise people, both handled here rather than
 * passed on, and they contradict each other:
 *
 * - **blocks are dropped** when only text is sent, so the ones from `send` travel
 *   again unless you pass your own. `blocks: []` removes them on purpose
 * - **attachments are kept** when left out, the exact opposite rule
 */
async function edit(
  handle: SlackHandle,
  text: string,
  options: SlackSendOptions = {},
): Promise<SlackResult> {
  const credentials = settings()
  const token = requireBot(credentials, 'edit')
  const { channel, ts } = addressed(handle, 'edit')

  assertWithinLimit(text)

  const blocks = options.blocks ?? handle.blocks
  const response = await callApi<SlackMessage>(
    'chat.update',
    token,
    { channel, ts, text, blocks, attachments: options.attachments, metadata: options.metadata },
    options,
  )

  return result(response, { channelId: channel, id: ts, blocks })
}

/**
 * Bot token only, and a bot may only remove what it posted itself.
 *
 * A file upload takes the other road: it has no message timestamp, so `chat.delete`
 * has nothing to grab. `files.delete` removes the file, and the message it created
 * goes with it. Same verb for you, a different call underneath.
 */
async function remove(handle: SlackHandle, options: RequestOptions = {}): Promise<SlackResult> {
  const credentials = settings()
  const token = requireBot(credentials, 'delete')

  if (handle.fileIds?.length && !handle.id) {
    let last: RawResponse<SlackMessage> | undefined
    for (const file of handle.fileIds) {
      last = await callApi<SlackMessage>('files.delete', token, { file }, options)
    }

    return {
      ...toResult('slack', last!),
      channel: 'slack',
      channelId: handle.channelId,
      fileIds: handle.fileIds,
    }
  }

  const { channel, ts } = addressed(handle, 'delete')
  const response = await callApi<SlackMessage>('chat.delete', token, { channel, ts }, options)

  return result(response, { channelId: channel, id: ts })
}

/**
 * Register from a Nitro plugin. The returned function unregisters again.
 *
 * The handler gets the full envelope typed, see `SlackEnvelope`. Every event and its
 * fields are documented at https://api.slack.com/events
 */
function listen(handler: Handler<SlackEnvelope>): () => void {
  return addListener('slack', handler)
}

export const slack = { send, edit, delete: remove, listen, escapeMrkdwn }
