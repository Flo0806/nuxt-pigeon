import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import type {
  TelegramEnvelope,
  TelegramMessagePayload,
  TelegramResult,
  TelegramUpdate,
} from './types'
import { createRequest, type RequestOptions } from '../../core/request'
import { toResult, type RawResponse } from '../../core/result'
import { assertWithinLimit, escapeHtml } from './format'
import { assertCaptionLimit, buildMedia } from './media'
import type { Media } from '../../core/media'

const API = 'https://api.telegram.org'

export type TelegramParseMode = 'HTML' | 'MarkdownV2'

export interface TelegramSendOptions extends RequestOptions {
  /** Without one Telegram treats the text literally. Passed through, never set by us. */
  parseMode?: TelegramParseMode
  /** Overrides the configured chat, for sending to more than one place. */
  chatId?: string | number
  disableNotification?: boolean
  disableLinkPreview?: boolean
  /**
   * One item becomes a photo, video, audio or document depending on its type,
   * several become an album. **A url is handed to Telegram untouched**, it fetches
   * the file itself, so nothing is downloaded here.
   *
   * With media the text becomes the caption, and a caption allows only 1024
   * characters instead of 4096.
   */
  media?: Media[]
  /** Turns the message into a reply. */
  replyToMessageId?: number
  /** Inline keyboard, passed through untouched. */
  replyMarkup?: unknown
}

function settings() {
  const { telegram } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return {
    token: telegram.token || process.env.PIGEON_TELEGRAM_BOT_TOKEN,
    chatId: telegram.chatId || process.env.PIGEON_TELEGRAM_CHAT_ID,
    secretToken: telegram.secretToken || process.env.PIGEON_TELEGRAM_SECRET_TOKEN,
    route: telegram.route,
  }
}

/**
 * Telegram answers a rate limit with `parameters.retry_after` in **seconds**, in the
 * body rather than in the `Retry-After` header. Handing this to the transport means
 * we wait as long as Telegram asked instead of guessing.
 */
function retryAfter(_response: Response, body: unknown): number | undefined {
  const seconds = (body as { parameters?: { retry_after?: number } })?.parameters?.retry_after

  return typeof seconds === 'number' ? seconds * 1000 : undefined
}

/**
 * Telegram puts the bot token in the path, so a raw error message would carry it into
 * every log line. The reason is rebuilt from the parsed body, which Telegram fills
 * with a readable `description` even when the status already says what went wrong.
 */
function fail(method: string, error: unknown): never {
  const data = (error as { data?: { description?: string } }).data
  const status = (error as { status?: number }).status

  throw new Error(
    data?.description
      ? `Telegram ${method} failed: ${data.description}`
      : `Telegram ${method} failed${status ? ` with ${status}` : ''}`,
    { cause: error },
  )
}

/**
 * Telegram wraps every answer in `{ ok, result }`. This returns the whole response so
 * the envelope, the status and the headers survive; `callApi` unwraps it for the calls
 * where only the value matters.
 */
async function callApiRaw<T>(
  method: string,
  payload: Record<string, unknown> | FormData,
  options: RequestOptions = {},
): Promise<RawResponse<TelegramEnvelope<T>>> {
  const { token } = settings()

  if (!token) {
    throw new Error('Telegram bot token is not defined. Set PIGEON_TELEGRAM_BOT_TOKEN')
  }

  try {
    return await createRequest({ retryAfter, ...options }).raw<TelegramEnvelope<T>>(
      `${API}/bot${token}/${method}`,
      // FormData sets its own content type, including the boundary.
      { method: 'POST', body: payload },
    )
  } catch (error) {
    fail(method, error)
  }
}

async function callApi<T>(
  method: string,
  payload: Record<string, unknown> | FormData,
  options: RequestOptions = {},
): Promise<T> {
  const answer = await callApiRaw<T>(method, payload, options)

  return answer._data?.result as T
}

/**
 * `raw` is the **whole** envelope Telegram sent, `{ ok, result }`, not just the message
 * inside it. Nothing gets unwrapped on the way out, so what you read is what arrived.
 *
 * A link only exists for a public chat: it is built from the `@name`, and a private
 * chat has none.
 */
function result(
  chatId: string | number,
  response: RawResponse<TelegramEnvelope<TelegramMessagePayload>>,
): TelegramResult {
  const message = response._data?.result
  const username = message?.chat?.username

  return {
    ...toResult('telegram', response),
    channel: 'telegram',
    id: message?.message_id?.toString(),
    url: username && message ? `https://t.me/${username}/${message.message_id}` : undefined,
    chatId,
    messageId: message?.message_id,
  }
}

async function send(text: string, options: TelegramSendOptions & RequestOptions = {}) {
  const { chatId } = settings()
  const target = options.chatId ?? chatId

  if (!target) {
    throw new Error('Telegram chat id is not defined. Set PIGEON_TELEGRAM_CHAT_ID')
  }

  const fields = {
    chat_id: target,
    parse_mode: options.parseMode,
    disable_notification: options.disableNotification,
    reply_to_message_id: options.replyToMessageId,
    reply_markup: options.replyMarkup,
  }

  if (options.media?.length) {
    assertCaptionLimit(text)

    const { method, body } = await buildMedia(options.media, { ...fields, caption: text }, options)

    return result(target, await callApiRaw<TelegramMessagePayload>(method, body, options))
  }

  assertWithinLimit(text)

  // Telegram echoes the parsed message back, which is what actually arrived.
  return result(
    target,
    await callApiRaw<TelegramMessagePayload>(
      'sendMessage',
      {
        ...fields,
        text,
        link_preview_options: options.disableLinkPreview ? { is_disabled: true } : undefined,
      },
      options,
    ),
  )
}

/**
 * Tells Telegram where to deliver updates. Takes the public base url of the app, the
 * route is appended from the config so nobody has to retype it.
 *
 * A write to the outside, so it is never done automatically: only the person
 * deploying knows the public address, and only they should decide when it changes.
 */
async function setWebhook(baseUrl: string, options: { dropPendingUpdates?: boolean } = {}) {
  const { secretToken, route } = settings()

  if (!secretToken) {
    throw new Error(
      'Telegram secret token is not defined. Set PIGEON_TELEGRAM_SECRET_TOKEN, otherwise ' +
        'anyone who guesses the url can send you forged updates',
    )
  }

  return callApi<boolean>('setWebhook', {
    url: new URL(route, baseUrl).toString(),
    secret_token: secretToken,
    drop_pending_updates: options.dropPendingUpdates,
  })
}

async function deleteWebhook() {
  return callApi<boolean>('deleteWebhook', {})
}

/** First thing to check when nothing arrives: is a url registered, and does it fail? */
async function webhookInfo() {
  return callApi<{
    url: string
    pending_update_count: number
    last_error_date?: number
    last_error_message?: string
  }>('getWebhookInfo', {})
}

/**
 * Register from a Nitro plugin. The returned function unregisters again.
 *
 * The handler gets the full update typed, see `TelegramUpdate`. Every field is
 * documented at https://core.telegram.org/bots/api#update
 */
function listen(handler: Handler<TelegramUpdate>): () => void {
  return addListener('telegram', handler)
}

export const telegram = { send, listen, setWebhook, deleteWebhook, webhookInfo, escapeHtml }
