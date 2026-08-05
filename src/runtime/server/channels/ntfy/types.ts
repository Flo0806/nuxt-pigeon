/** Everything ntfy accepts. Documented at https://docs.ntfy.sh/publish/ */

import type { Media } from '../../core/media'
import type { PigeonResult } from '../../core/result'

/** What ntfy echoes back after publishing. */
export interface NtfyMessage {
  id: string
  /** Unix seconds. */
  time?: number
  topic?: string
  message?: string
  [key: string]: unknown
}

/**
 * ntfy can neither edit nor delete a published message, so the id is only good for
 * matching a delivery against your own logs.
 */
export interface NtfyResult extends PigeonResult<NtfyMessage | undefined> {
  channel: 'ntfy'
  /** The topic it actually went to, which may come from the call rather than config. */
  topic: string
}

interface NtfyActionBase {
  label: string
  /** Clears the notification after the action ran. */
  clear?: boolean
}

export interface NtfyViewAction extends NtfyActionBase {
  action: 'view'
  url: string
}

/** Lets a notification flip a switch without opening an app. */
export interface NtfyHttpAction extends NtfyActionBase {
  action: 'http'
  url: string
  /** Defaults to POST on ntfy's side. */
  method?: string
  headers?: Record<string, string>
  body?: string
}

/** Android only. */
export interface NtfyBroadcastAction extends NtfyActionBase {
  action: 'broadcast'
  intent?: string
  extras?: Record<string, string>
}

export type NtfyAction = NtfyViewAction | NtfyHttpAction | NtfyBroadcastAction

/** 1 is silent, 3 is the default, 5 rings through do-not-disturb. */
export type NtfyPriority = 1 | 2 | 3 | 4 | 5

export interface NtfySendOptions {
  /** Overrides the configured topic. ntfy publishes to one topic per request. */
  topic?: string
  /**
   * **One** attachment, ntfy takes no more per message.
   *
   * A url stays a url and ntfy fetches it itself. Bytes take a different route
   * entirely: the body becomes the file, so the options travel as headers, and a
   * title with an umlaut is encoded per RFC 2047 on the way.
   */
  media?: Media
  /**
   * Merged over the ones we set. ntfy accepts every option as a header too, so this
   * is the way to reach anything it adds before we know about it.
   */
  headers?: Record<string, string>
  title?: string
  priority?: NtfyPriority
  /** Known names like `warning` or `skull` render as emoji, the rest as text. */
  tags?: string[]
  /** Opened when the notification is tapped. */
  click?: string
  /** Web app and Android only, iOS shows the raw text. */
  markdown?: boolean
  /** PNG or JPEG url. Android only, ignored by iOS and the web app. */
  icon?: string
  /** File url. ntfy fetches it, the caller does not upload. */
  attach?: string
  filename?: string
  /** Up to three. `broadcast` is Android only, iOS shows no buttons at all. */
  actions?: NtfyAction[]
  /** Needs an SMTP capable server. */
  email?: string
  /** ntfy.sh only, paid plan and a verified number. `yes` uses the default one. */
  call?: string
  /** `30min`, `tomorrow, 9am` or a unix timestamp. Between 10 seconds and 3 days. */
  delay?: string
  /** False keeps it out of the server cache, so `since=` will not find it. */
  cache?: boolean
  /** False skips Firebase, which delays Android delivery. */
  firebase?: boolean
}
