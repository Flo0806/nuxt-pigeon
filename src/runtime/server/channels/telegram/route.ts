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
import { safeEqual } from '../../core/verify'
import { normalise, type TelegramUpdate } from './normalise'
import type { PigeonMessage } from '../../../types'

const SECRET_HEADER = 'x-telegram-bot-api-secret-token'

export default defineEventHandler(async (event) => {
  const secret =
    useRuntimeConfig().pigeon.channels.telegram.secretToken ||
    process.env.PIGEON_TELEGRAM_SECRET_TOKEN

  // Without a secret the route is open to anyone who guesses the path, and forged
  // updates are indistinguishable from real ones. Refusing beats accepting.
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'Telegram secret token is not configured' })
  }

  if (!safeEqual(getHeader(event, SECRET_HEADER) || '', secret)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid secret token' })
  }

  const raw = await readRawBody(event)
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  const update = JSON.parse(raw) as TelegramUpdate

  const message: PigeonMessage = {
    channel: 'telegram',
    at: new Date().toISOString(),
    raw,
    body: update,
    headers: getRequestHeaders(event) as Record<string, string>,
    ...normalise(update),
  }

  // Telegram retries an update it gets no quick answer for, so acknowledge first.
  event.waitUntil(dispatch('telegram', message))

  setResponseStatus(event, 200)

  return ''
})
