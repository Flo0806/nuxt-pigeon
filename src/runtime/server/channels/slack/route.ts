import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestHeaders,
  readRawBody,
  setResponseStatus,
} from 'h3'
import { useRuntimeConfig } from '#imports'
import { dispatch } from '../../core/listeners'
import { verifySignature } from './verify'
import type { PigeonMessage } from '../../../types'
import type { SlackEnvelope } from './types'

const SIGNATURE_HEADER = 'x-slack-signature'
const TIMESTAMP_HEADER = 'x-slack-request-timestamp'

export default defineEventHandler(async (event) => {
  const signingSecret =
    useRuntimeConfig().pigeon.channels.slack.signingSecret ||
    process.env.PIGEON_SLACK_SIGNING_SECRET

  if (!signingSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Slack signing secret is not configured' })
  }

  // Raw, not parsed: the signature covers the exact bytes Slack sent.
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  const valid = await verifySignature({
    signature: getHeader(event, SIGNATURE_HEADER) || '',
    timestamp: getHeader(event, TIMESTAMP_HEADER) || '',
    rawBody,
    signingSecret,
  })

  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  const envelope = JSON.parse(rawBody) as SlackEnvelope

  // Slack only stores the address if we echo this back, once, when it is entered.
  if (envelope.type === 'url_verification') {
    return { challenge: envelope.challenge }
  }

  const message: PigeonMessage<SlackEnvelope> = {
    channel: 'slack',
    at: new Date().toISOString(),
    raw: rawBody,
    body: envelope,
    headers: getRequestHeaders(event) as Record<string, string>,
    // `app_mention` and `message` both fire for one mention, so this is what tells
    // the two deliveries apart.
    type: envelope.event?.type ?? envelope.type,
    text: envelope.event?.text,
    from: envelope.event?.user ? { id: envelope.event.user } : undefined,
    conversation: envelope.event?.channel,
  }

  // Slack wants an answer within **three** seconds and redelivers up to three times
  // without one. So acknowledge now and let the handlers run after the response.
  event.waitUntil(dispatch('slack', message))

  // An explicit 200 with an empty body: the docs only promise that 200 is accepted.
  setResponseStatus(event, 200)

  return ''
})
