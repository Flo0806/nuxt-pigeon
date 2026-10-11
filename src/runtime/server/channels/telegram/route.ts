import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestHeaders,
  setResponseStatus,
} from 'nuxt/server'
import { dispatch } from '../../core/listeners'
import { waitUntil } from '../../core/wait-until'
import { safeEqual } from '../../core/verify'
import { normalise } from './normalise'
import { secretToken } from './telegram'
import type { TelegramUpdate } from './types'
import type { PigeonMessage } from '../../../types'

const SECRET_HEADER = 'x-telegram-bot-api-secret-token'

export default defineEventHandler(async (event) => {
  const secret = secretToken()

  // Without a secret the route is open to anyone who guesses the path, and forged
  // updates are indistinguishable from real ones. Refusing beats accepting.
  if (!secret) {
    throw createError({ status: 503, statusText: 'Telegram secret token is not configured' })
  }

  if (!safeEqual(getRequestHeader(event, SECRET_HEADER) || '', secret)) {
    throw createError({ status: 401, statusText: 'Invalid secret token' })
  }

  const raw = await event.req.text()
  if (!raw) {
    throw createError({ status: 400, statusText: 'Empty body' })
  }

  const update = JSON.parse(raw) as TelegramUpdate

  const message: PigeonMessage<TelegramUpdate> = {
    channel: 'telegram',
    at: new Date().toISOString(),
    raw,
    body: update,
    headers: getRequestHeaders(event),
    ...normalise(update),
  }

  // Telegram retries an update it gets no quick answer for, so acknowledge first.
  waitUntil(event, dispatch('telegram', message))

  setResponseStatus(event, 200)

  return ''
})
