/** Documented at https://docs.joinmastodon.org/entities/Status/ */

/** `private` means followers only, `direct` only the mentioned accounts. */
export type MastodonVisibility = 'public' | 'unlisted' | 'private' | 'direct'

import type { Media } from '../../core/media'
import type { PigeonResult } from '../../core/result'

export interface MastodonResult extends PigeonResult<MastodonStatus | undefined> {
  channel: 'mastodon'
  /** Which instance it went to, so editing or deleting hits the right host. */
  instance: string
}

export interface MastodonPostOptions {
  /**
   * Up to four, and **never a url**: `/api/v2/media` takes a multipart file only, so
   * anything given as a url is fetched first. A large upload answers 202 while it is
   * still processing, and posting before that finishes is refused, so the upload
   * waits.
   */
  media?: Media[]
  visibility?: MastodonVisibility
  /** Content warning. The post is collapsed behind this text. */
  spoilerText?: string
  sensitive?: boolean
  /** ISO 639, drives the translation offer in clients. */
  language?: string
  /** Turns the post into a reply, which is how threads are built. */
  inReplyToId?: string
  /** ISO 8601, at least five minutes out. Returns a scheduled status, not a post. */
  scheduledAt?: string
  /** Same key twice creates no second post. The one real retry guard Mastodon offers. */
  idempotencyKey?: string
}

export interface MastodonAccount {
  id: string
  /** `flo` locally, `flo@mastodon.social` for someone on another instance. */
  acct: string
  display_name?: string
  url?: string
  bot?: boolean
  [key: string]: unknown
}

export interface MastodonStatus {
  id: string
  url?: string
  /** **HTML**, not plain text. */
  content?: string
  created_at?: string
  visibility?: MastodonVisibility
  spoiler_text?: string
  account?: MastodonAccount
  [key: string]: unknown
}

/** Mastodon may add more, so this is not exhaustive. */
export type MastodonNotificationType =
  | 'mention'
  | 'status'
  | 'reblog'
  | 'follow'
  | 'follow_request'
  | 'favourite'
  | 'poll'
  | 'update'
  | 'admin.sign_up'
  | 'admin.report'
  | (string & {})

/** https://docs.joinmastodon.org/entities/Notification/ */
export interface MastodonNotification {
  id: string
  type: MastodonNotificationType
  created_at: string
  account: MastodonAccount
  /** The post this is about. Absent for a follow. */
  status?: MastodonStatus
  [key: string]: unknown
}

export interface MastodonNotificationOptions {
  /**
   * Walks **forward** from this id, so polling with the newest id you have leaves no
   * gap. Mastodon: "sets a cursor at this ID and paginates forward".
   */
  minId?: string
  /**
   * Lower bound that returns the **newest** results, so more new items than `limit`
   * means the ones in between are silently missing. Use `minId` for polling.
   */
  sinceId?: string
  /** Pages backwards into history. */
  maxId?: string
  /** Up to 80, Mastodon defaults to 15. */
  limit?: number
  types?: MastodonNotificationType[]
  excludeTypes?: MastodonNotificationType[]
  /** Only notifications caused by this account. */
  accountId?: string
}
