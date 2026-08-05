import type { Media } from '../../core/media'

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

export interface DiscordSendOptions {
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
