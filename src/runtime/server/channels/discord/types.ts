import type { Media } from '../../core/media'
import type { PigeonResult } from '../../core/result'

/**
 * Everything Execute Webhook accepts, documented at
 * https://docs.discord.com/developers/resources/webhook#execute-webhook
 *
 * No bot and no extra permissions: the webhook token alone can do all of this.
 */

/**
 * Discord shows an attachment below the message unless an embed points at it.
 *
 * An intersection rather than `Omit`, because omitting from a union would collapse
 * the two input forms into one and lose which of them was given.
 */
export type DiscordMedia = Media & {
  /**
   * Hides the image behind a click. Discord honours this **only** on attached files,
   * through a `SPOILER_` filename prefix, never on an `embed.image.url`.
   */
  spoiler?: boolean
}

/** Up to ten per message, each with its own budget. */
export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  /** Decimal, not a css string: `0x00dc82` for Nuxt green. */
  color?: number
  timestamp?: string
  fields?: { name: string; value: string; inline?: boolean }[]
  /** `attachment://<filename>` points at one of the files sent alongside. */
  image?: { url: string }
  thumbnail?: { url: string }
  author?: { name: string; url?: string; icon_url?: string }
  footer?: { text: string; icon_url?: string }
  [key: string]: unknown
}

/** What a webhook answers with when `wait` is on. Discord sends far more than this. */
export interface DiscordMessage {
  id: string
  channel_id?: string
  content?: string
  attachments?: { id: string; filename?: string }[]
  [key: string]: unknown
}

/**
 * Everything needed to point at a message again, and all `edit` and `delete` ask for.
 * Deliberately **not** the full result: an id kept in your own database has to be
 * turnable back into a handle, without inventing a `raw` and a `response` for it.
 */
export interface DiscordHandle {
  /** Missing with `wait: false`, because Discord then answers 204 and says nothing. */
  id?: string
  /** Only known here, never in the answer, and needed to edit or delete again. */
  threadId?: string
  /**
   * Ids of the files currently on the message. Kept as our own field rather than read
   * back out of `raw`, so editing never has to dig around in what the service sent.
   *
   * An edit has to name every attachment that should survive it, see `edit`.
   */
  attachmentIds?: string[]
}

export interface DiscordResult extends PigeonResult<DiscordMessage | undefined>, DiscordHandle {
  channel: 'discord'
}

/**
 * Discord allows a smaller set on `PATCH` than on the first send. Left out because the
 * message is already there and they cannot change any more: `username`, `avatarUrl`,
 * `tts`, `threadName`, `appliedTags`, and `wait`, which an edit always does.
 *
 * https://docs.discord.com/developers/resources/webhook#edit-webhook-message
 */
export type DiscordEditOptions = Omit<
  DiscordSendOptions,
  'username' | 'avatarUrl' | 'tts' | 'threadName' | 'appliedTags' | 'wait'
> & {
  /**
   * The raw `attachments` array, for taking the wheel yourself. Set this and the
   * handling described on `edit` steps aside completely.
   */
  attachments?: unknown[]
}

export interface DiscordCredentials {
  /** The url is the credential: it names the channel and grants the right to post there. */
  webhookUrl?: string
}

export interface DiscordSendOptions {
  /**
   * Another webhook for this one call, so a second server or channel is one option
   * away. `edit` and `delete` need it again, it is never kept in the handle.
   */
  webhookUrl?: string
  /** Overrides the name the webhook was created with. */
  username?: string
  avatarUrl?: string
  /** Passed through untouched, so `@everyone` can be defused. */
  allowedMentions?: unknown
  /** Up to ten. */
  embeds?: DiscordEmbed[]
  /** Up to ten files. A url is fetched first, Discord takes no url for an attachment. */
  media?: DiscordMedia[]
  /** Reads the message aloud for whoever has that turned on. */
  tts?: boolean
  /** For example `4` to suppress the link previews Discord would generate. */
  flags?: number
  /** Posts into an existing thread. */
  threadId?: string
  /** Creates a thread in a forum or media channel. */
  threadName?: string
  appliedTags?: string[]
  /** Buttons and selects. Only works for an application owned webhook. */
  components?: unknown[]
  poll?: unknown
  /**
   * Discord answers an empty 204 by default. `wait` asks for the created message
   * instead, which is the only way to learn its id.
   */
  wait?: boolean
}
