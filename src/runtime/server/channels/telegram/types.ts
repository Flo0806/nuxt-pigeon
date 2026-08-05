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
