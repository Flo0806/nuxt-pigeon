interface TelegramUser {
  id: number
  username?: string
  first_name?: string
}

interface TelegramMessage {
  text?: string
  caption?: string
  from?: TelegramUser
  chat?: { id: number }
}

/** Telegram wraps everything in an update, and only one of these keys is ever set. */
export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
}

/**
 * Pulls out the three things every channel can answer, and leaves the rest in `raw`.
 * An update we do not know, a poll answer or a reaction for instance, simply has no
 * text: better empty than a wrong guess.
 */
export function normalise(update: TelegramUpdate) {
  const message =
    update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post

  if (!message) {
    return {}
  }

  return {
    // A photo carries its text in `caption`, not in `text`.
    text: message.text ?? message.caption,
    from: message.from && {
      id: String(message.from.id),
      name: message.from.username ?? message.from.first_name,
    },
    conversation: message.chat && String(message.chat.id),
  }
}
