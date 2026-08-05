import { isUrlMedia, resolveMedia, type Media } from '../../core/media'
import type { RequestOptions } from '../../core/request'
import { kindFor } from './media'
import type { TelegramMessagePayload } from './types'

/**
 * What the message is made of. Only two values, because only two matter here: a text
 * message carries its words in `text`, everything else carries them in `caption`, and
 * Telegram has a separate method for each.
 */
export type TelegramKind = 'text' | 'media'

/** Any of these turns a message into one with a caption instead of a text. */
const MEDIA_FIELDS = [
  'photo',
  'video',
  'audio',
  'document',
  'animation',
  'voice',
  'video_note',
  'sticker',
] as const

/**
 * Read once from what Telegram echoed back and then kept as our own field, so editing
 * never has to dig through `raw` to work out what it is dealing with.
 */
export function messageKind(payload?: TelegramMessagePayload): TelegramKind {
  if (!payload) {
    return 'text'
  }

  return MEDIA_FIELDS.some((field) => payload[field] !== undefined) ? 'media' : 'text'
}

/**
 * An empty `media` means "away with the picture" on other channels. Telegram has no
 * such thing: `editMessageMedia` replaces and, since 7.11, adds, but it takes no empty
 * media and there is no `deleteMedia`. Open since 2020, see
 * https://github.com/tdlib/telegram-bot-api/issues/168
 *
 * Without this the call would quietly fall through to a caption edit, the picture would
 * stay, and nobody would be told.
 */
export function assertNoMediaRemoval(media?: unknown[]): void {
  if (media?.length === 0) {
    throw new Error(
      'Telegram cannot remove media from a message, only replace it. Delete the message ' +
        'and send a new one instead.',
    )
  }
}

export type EditMethod =
  | 'editMessageText'
  | 'editMessageCaption'
  | 'editMessageMedia'
  | 'editMessageReplyMarkup'

/**
 * Telegram has four ways to change a message and refuses the wrong one, so the choice
 * is made here rather than left to the caller. Order matters:
 *
 * - a file was given, so the file changes. Since Bot API 7.11 this also works on a
 *   message that was text only, which is why nothing is refused here
 * - no new words, so only the buttons can have been meant
 * - the message carries a caption, so the words live there
 * - otherwise it is a plain text message
 */
export function editMethod(input: {
  text?: string
  media?: unknown[]
  kind: TelegramKind
}): EditMethod {
  if (input.media?.length) {
    return 'editMessageMedia'
  }

  if (input.text === undefined) {
    return 'editMessageReplyMarkup'
  }

  return input.kind === 'media' ? 'editMessageCaption' : 'editMessageText'
}

/**
 * `editMessageMedia` takes **one** `InputMedia`, and the caption travels inside it
 * rather than beside it, which is the opposite of how sending works.
 */
export async function buildEditMedia(
  item: Media,
  fields: Record<string, unknown>,
  caption: { caption?: string; parse_mode?: string },
  options: RequestOptions = {},
  fetch?: typeof globalThis.fetch,
): Promise<Record<string, unknown> | FormData> {
  if (isUrlMedia(item)) {
    const kind = kindFor(item.filename?.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg')

    return { ...fields, media: { type: kind, media: item.url, ...caption } }
  }

  const resolved = await resolveMedia(item, options, fetch)
  const form = new FormData()

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
    }
  }

  // The file rides along as its own part and the descriptor points at it by name.
  form.set(
    'media',
    JSON.stringify({ type: kindFor(resolved.type), media: 'attach://file0', ...caption }),
  )
  form.set('file0', new Blob([resolved.bytes], { type: resolved.type }), resolved.filename)

  return form
}
