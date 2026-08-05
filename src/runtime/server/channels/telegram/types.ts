import type { PigeonResult } from '../../core/result'

/**
 * The fields worth knowing about, the rest stays reachable through the index
 * signature. Telegram documents every field at https://core.telegram.org/bots/api
 */
export interface TelegramUser {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  [key: string]: unknown
}

export interface TelegramChat {
  id: number
  /** `private`, `group`, `supergroup` or `channel`. */
  type?: string
  title?: string
  username?: string
  [key: string]: unknown
}

/**
 * Every Bot API answer looks like this, whether it worked or not. Fully listed rather
 * than left open with an index signature: this envelope is one of the few things
 * Telegram specifies completely, and an open one here makes the Nitro route types
 * recurse until TypeScript gives up (TS2321 in the playground).
 *
 * The payload inside `result` stays open, which is where the unknown fields actually
 * are. https://core.telegram.org/bots/api#making-requests
 */
export interface TelegramEnvelope<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
  /** Carries `retry_after` on a 429, and `migrate_to_chat_id` when a group is upgraded. */
  parameters?: { retry_after?: number; migrate_to_chat_id?: number }
}

export interface TelegramResult extends PigeonResult<TelegramEnvelope<TelegramMessagePayload>> {
  channel: 'telegram'
  /** Where it actually went, which is not always the configured chat. */
  chatId: string | number
  messageId?: number
}

/** https://core.telegram.org/bots/api#message */
export interface TelegramMessagePayload {
  message_id: number
  /** Unix seconds. */
  date?: number
  from?: TelegramUser
  chat?: TelegramChat
  text?: string
  /** A photo or document carries its text here instead of in `text`. */
  caption?: string
  /** Set when the message answers another one. */
  reply_to_message?: TelegramMessagePayload
  [key: string]: unknown
}

/**
 * Telegram wraps everything in an update and sets **exactly one** of the payload
 * keys. https://core.telegram.org/bots/api#update
 */
export interface TelegramUpdate {
  /** Increases per update, and is what `getUpdates` offsets against. */
  update_id: number
  message?: TelegramMessagePayload
  edited_message?: TelegramMessagePayload
  channel_post?: TelegramMessagePayload
  edited_channel_post?: TelegramMessagePayload
  [key: string]: unknown
}
