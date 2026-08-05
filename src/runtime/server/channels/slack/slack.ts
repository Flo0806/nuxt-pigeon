import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import type { SlackEnvelope } from './types'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { toResult, type PigeonResult } from '../../core/result'
import { unsupported } from '../../core/unsupported'
import { assertWithinLimit, escapeMrkdwn } from './format'

export interface SlackSendOptions extends RequestOptions {
  /** Slack parses by default. False sends the text literally. */
  mrkdwn?: boolean
  /** Block Kit, passed through untouched. `text` stays the notification preview. */
  blocks?: unknown[]
}

/** `raw` is the literal string `ok`, and there is no id to edit or delete with. */
export interface SlackResult extends PigeonResult<string> {
  channel: 'slack'
  id?: undefined
}

function settings() {
  const { slack } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return { webhookUrl: slack.webhookUrl || process.env.PIGEON_SLACK_WEBHOOK_URL }
}

/**
 * The channel is fixed when the webhook is created and cannot be overridden per
 * message. Two channels need two webhooks.
 *
 * There is **no id**: an incoming webhook answers with the plain text `ok`, so the
 * message can never be edited, deleted or linked to. That `ok` is still handed over,
 * because it is what Slack said, and the missing `id` is what says the rest.
 */
async function send(text: string, options: SlackSendOptions = {}): Promise<SlackResult> {
  const { webhookUrl } = settings()

  if (!webhookUrl) {
    throw new Error('Slack webhook url is not defined. Set PIGEON_SLACK_WEBHOOK_URL')
  }

  assertWithinLimit(text)

  const response = await post<string>(
    webhookUrl,
    { text, mrkdwn: options.mrkdwn, blocks: options.blocks },
    { ...options, label: 'Slack' },
  )

  // Spelled out rather than left off: an incoming webhook has no id, and the type
  // says so, so nobody writes an `edit` against it and finds out at runtime.
  return { ...toResult('slack', response), channel: 'slack', id: undefined }
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

/**
 * `edit` and `delete` exist at runtime only to explain themselves, and are cut out of
 * the type below. This is the "other credentials" case: Slack can do both, an incoming
 * webhook cannot.
 */
const api = {
  send,
  listen,
  escapeMrkdwn,
  edit: unsupported(
    'slack',
    'edit',
    'An incoming webhook answers with the plain text `ok` and no message id, so there ' +
      'is nothing to address. `chat.update` can do it, but that needs a bot token.',
  ),
  delete: unsupported(
    'slack',
    'delete',
    'An incoming webhook answers with the plain text `ok` and no message id, so there ' +
      'is nothing to address. `chat.delete` can do it, but that needs a bot token.',
  ),
}

export const slack: Omit<typeof api, 'edit' | 'delete'> = api
