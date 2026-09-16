/** Documented at https://docs.joinmastodon.org/entities/Status/ */

/** `private` means followers only, `direct` only the mentioned accounts. */
export type MastodonVisibility = 'public' | 'unlisted' | 'private' | 'direct'

import type { Media } from '../../core/media'
import type { PigeonResult } from '../../core/result'

/**
 * All that is needed to point at a status again. The instance is deliberately **not**
 * part of it: the token belongs to one instance, so editing somewhere else could not
 * work anyway, and the host comes from the config just like when sending.
 */
export interface MastodonCredentials {
  /** Form `https://mastodon.social`. */
  instance?: string
  /** An access token with `write:statuses`, plus `read:notifications` to receive. */
  token?: string
}

export interface MastodonHandle {
  id?: string
  /**
   * Ids of the files on the status. Kept as our own field rather than read back out of
   * `raw`, so editing never has to dig through what the service sent.
   */
  mediaIds?: string[]
}

export interface MastodonResult extends PigeonResult<MastodonStatus | undefined>, MastodonHandle {
  channel: 'mastodon'
  /** Which instance it went to. Information, not a handle: see `MastodonHandle`. */
  instance: string
}

/**
 * Mastodon takes a smaller set on `PUT` than on the first post, and the ones left out
 * are exactly the ones that only mean something while a post is being created.
 *
 * https://docs.joinmastodon.org/methods/statuses/#edit
 */
export type MastodonEditOptions = Omit<
  MastodonPostOptions,
  'visibility' | 'inReplyToId' | 'scheduledAt' | 'idempotencyKey'
>

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
  media_attachments?: { id: string; type?: string; url?: string }[]
  /** Set once a status has been changed, and clients show an "edited" marker for it. */
  edited_at?: string
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
