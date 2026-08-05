import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import type { TelegramUpdate } from './types'
import { createRequest, type RequestOptions } from '../../core/request'
import { assertWithinLimit, escapeHtml } from './format'

const API = 'https://api.telegram.org'

export type TelegramParseMode = 'HTML' | 'MarkdownV2'

export interface TelegramSendOptions extends RequestOptions {
  /** Without one Telegram treats the text literally. Passed through, never set by us. */
  parseMode?: TelegramParseMode
  /** Overrides the configured chat, for sending to more than one place. */
  chatId?: string | number
  disableNotification?: boolean
  disableLinkPreview?: boolean
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

async function callApi<T>(
  method: string,
  payload: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<T> {
  const { token } = settings()

  if (!token) {
    throw new Error('Telegram bot token is not defined. Set PIGEON_TELEGRAM_BOT_TOKEN')
  }

  try {
    const answer = await createRequest({ retryAfter, ...options })<{ result: T }>(
      `${API}/bot${token}/${method}`,
      { method: 'POST', body: payload },
    )

    return answer.result
  } catch (error) {
    fail(method, error)
  }
}

async function send(text: string, options: TelegramSendOptions = {}) {
  const { chatId } = settings()
  const target = options.chatId ?? chatId

  if (!target) {
    throw new Error('Telegram chat id is not defined. Set PIGEON_TELEGRAM_CHAT_ID')
  }

  assertWithinLimit(text)

  // Telegram echoes the parsed message back, which is what actually arrived.
  return callApi<{ message_id: number; text?: string }>(
    'sendMessage',
    {
      chat_id: target,
      text,
      parse_mode: options.parseMode,
      disable_notification: options.disableNotification,
      link_preview_options: options.disableLinkPreview ? { is_disabled: true } : undefined,
    },
    options,
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
