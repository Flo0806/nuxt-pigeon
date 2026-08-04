import {
  createError,
  defineEventHandler,
  getRequestHeaders,
  readRawBody,
  setResponseStatus,
} from 'h3'
import { dispatch, type WebhookMessage } from '../listeners'

/**
 * The route incoming webhooks land on. Reads the body raw and hands it on untouched:
 * we know nothing about the sender, so there is nothing to normalise here.
 *
 * Answers before the handlers run. A sender that does not get a quick answer counts
 * the delivery as failed and sends it again, and then the same message arrives twice.
 */
export default defineEventHandler(async (event) => {
  const raw = await readRawBody(event)

  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  let body: unknown = raw
  try {
    body = JSON.parse(raw)
  } catch {
    // Not JSON, so the string itself is the body.
  }

  const message: WebhookMessage = {
    channel: 'webhook',
    at: new Date().toISOString(),
    raw,
    body,
    headers: getRequestHeaders(event) as Record<string, string>,
  }

  event.waitUntil(dispatch('webhook', message))

  setResponseStatus(event, 202)

  return ''
})
