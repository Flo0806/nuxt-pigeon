import type { TelegramUpdate } from './types'

const KINDS = ['message', 'edited_message', 'channel_post', 'edited_channel_post'] as const

/**
 * Pulls out the few things every channel can answer, and leaves the rest in `raw`.
 * An update we do not know, a poll answer or a reaction for instance, simply has no
 * text: better empty than a wrong guess.
 */
export function normalise(update: TelegramUpdate) {
  // Which key is set **is** the event type, and Telegram only ever sets one.
  const type = KINDS.find((kind) => update[kind])
  const message = type && update[type]

  if (!message) {
    return {}
  }

  return {
    type,
    // A photo carries its text in `caption`, not in `text`.
    text: message.text ?? message.caption,
    from: message.from && {
      id: String(message.from.id),
      name: message.from.username ?? message.from.first_name,
    },
    conversation: message.chat && String(message.chat.id),
  }
}
