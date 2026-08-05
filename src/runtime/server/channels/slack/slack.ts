import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import type { SlackEnvelope } from './types'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { assertWithinLimit, escapeMrkdwn } from './format'

export interface SlackSendOptions extends RequestOptions {
  /** Slack parses by default. False sends the text literally. */
  mrkdwn?: boolean
  /** Block Kit, passed through untouched. `text` stays the notification preview. */
  blocks?: unknown[]
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
 * Returns nothing on purpose: Slack answers with the plain text `ok` and **no message
 * id**, so the message can never be edited, deleted or linked to. Inventing a result
 * here would hide that.
 */
async function send(text: string, options: SlackSendOptions = {}) {
  const { webhookUrl } = settings()

  if (!webhookUrl) {
    throw new Error('Slack webhook url is not defined. Set PIGEON_SLACK_WEBHOOK_URL')
  }

  assertWithinLimit(text)

  await post(
    webhookUrl,
    { text, mrkdwn: options.mrkdwn, blocks: options.blocks },
    { ...options, label: 'Slack' },
  )
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

export const slack = { send, listen, escapeMrkdwn }
