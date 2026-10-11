import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestHeaders,
  setResponseStatus,
} from 'nuxt/server'
import { dispatch } from '../../core/listeners'
import { waitUntil } from '../../core/wait-until'
import { signingSecret } from './slack'
import { verifySignature } from './verify'
import type { PigeonMessage } from '../../../types'
import type { SlackEnvelope } from './types'

const SIGNATURE_HEADER = 'x-slack-signature'
const TIMESTAMP_HEADER = 'x-slack-request-timestamp'

export default defineEventHandler(async (event) => {
  const secret = signingSecret()

  if (!secret) {
    throw createError({ status: 503, statusText: 'Slack signing secret is not configured' })
  }

  // Raw, not parsed: the signature covers the exact bytes Slack sent.
  const rawBody = await event.req.text()
  if (!rawBody) {
    throw createError({ status: 400, statusText: 'Empty body' })
  }

  const valid = await verifySignature({
    signature: getRequestHeader(event, SIGNATURE_HEADER) || '',
    timestamp: getRequestHeader(event, TIMESTAMP_HEADER) || '',
    rawBody,
    signingSecret: secret,
  })

  if (!valid) {
    throw createError({ status: 401, statusText: 'Invalid signature' })
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
    headers: getRequestHeaders(event),
    // `app_mention` and `message` both fire for one mention, so this is what tells
    // the two deliveries apart.
    type: envelope.event?.type ?? envelope.type,
    text: envelope.event?.text,
    from: envelope.event?.user ? { id: envelope.event.user } : undefined,
    conversation: envelope.event?.channel,
  }

  // Slack wants an answer within **three** seconds and redelivers up to three times
  // without one. So acknowledge now and let the handlers run after the response.
  waitUntil(event, dispatch('slack', message))

  // An explicit 200 with an empty body: the docs only promise that 200 is accepted.
  setResponseStatus(event, 200)

  return ''
})
