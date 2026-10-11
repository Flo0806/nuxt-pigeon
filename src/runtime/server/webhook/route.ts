import { createError, defineEventHandler, getRequestHeaders, setResponseStatus } from 'nuxt/server'
import { dispatch } from '../core/listeners'
import { waitUntil } from '../core/wait-until'
import type { PigeonMessage } from '../../types'

/**
 * The route incoming webhooks land on. Reads the body raw and hands it on untouched:
 * we know nothing about the sender, so there is nothing to normalise here.
 *
 * Answers before the handlers run. A sender that does not get a quick answer counts
 * the delivery as failed and sends it again, and then the same message arrives twice.
 */
export default defineEventHandler(async (event) => {
  const raw = await event.req.text()

  if (!raw) {
    throw createError({ status: 400, statusText: 'Empty body' })
  }

  let body: unknown = raw
  try {
    body = JSON.parse(raw)
  } catch {
    // Not JSON, so the string itself is the body.
  }

  const message: PigeonMessage = {
    channel: 'webhook',
    at: new Date().toISOString(),
    raw,
    body,
    headers: getRequestHeaders(event),
  }

  waitUntil(event, dispatch('webhook', message))

  setResponseStatus(event, 202)

  return ''
})
