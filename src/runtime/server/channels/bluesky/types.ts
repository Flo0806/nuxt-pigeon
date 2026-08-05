import type { Media } from '../../core/media'
import type { PigeonResult } from '../../core/result'

/** Documented at https://docs.bsky.app/docs/advanced-guides/post-richtext */

/** What `createRecord` answers with, and all it answers with. */
export interface BlueskyRecordRef {
  /** `at://<did>/<collection>/<rkey>` */
  uri: string
  cid: string
  [key: string]: unknown
}

/**
 * `id` is the `at://` uri, because that is what Bluesky calls the post. The three
 * parts below are the same thing taken apart, which is the form `deleteRecord` wants.
 */
/**
 * The three parts `deleteRecord` wants. `send` hands them over as part of its result,
 * and an `at://` uri kept in your own database splits into exactly these.
 */
export interface BlueskyHandle {
  repo: string
  collection: string
  rkey?: string
}

export interface BlueskyResult extends PigeonResult<BlueskyRecordRef | undefined>, BlueskyHandle {
  channel: 'bluesky'
}

/** What `deleteRecord` answers with, and it is not much. */
export interface BlueskyCommit {
  commit?: { cid: string; rev: string }
  [key: string]: unknown
}

export interface BlueskyDeleteResult
  extends PigeonResult<BlueskyCommit | undefined>, BlueskyHandle {
  channel: 'bluesky'
}

/** **UTF-8 byte** offsets, not character positions. */
export interface BlueskyByteRange {
  byteStart: number
  byteEnd: number
}

export type BlueskyFacetFeature =
  | { $type: 'app.bsky.richtext.facet#link'; uri: string }
  | { $type: 'app.bsky.richtext.facet#mention'; did: string }
  | { $type: 'app.bsky.richtext.facet#tag'; tag: string }

export interface BlueskyFacet {
  index: BlueskyByteRange
  features: BlueskyFacetFeature[]
}

export interface BlueskyPostOptions {
  /**
   * Up to four images, and **never a url**: a blob is uploaded separately and the post
   * references it. The limit per blob is about **1 MB**, which a normal screenshot
   * exceeds, so expect to resize before sending.
   */
  media?: Media[]
  /**
   * A link card. Bluesky builds **nothing** by itself, so title, description and the
   * thumbnail all come from here. Cannot be combined with `media`, a post carries one
   * embed.
   */
  external?: { uri: string; title: string; description: string; thumb?: Media }
  /**
   * Detected by default, because Bluesky links **nothing** on its own and every
   * client computes this before posting. `false` leaves the post unlinked.
   */
  facets?: BlueskyFacet[] | false
  /** BCP-47, for example `['de']`. */
  langs?: string[]
  /** ISO 8601, defaults to now. Bluesky takes what it is given. */
  createdAt?: string
}

export interface BlueskyAuthor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  [key: string]: unknown
}

/** Bluesky may add more, so this is not exhaustive. */
export type BlueskyNotificationReason =
  | 'like'
  | 'repost'
  | 'follow'
  | 'mention'
  | 'reply'
  | 'quote'
  | (string & {})

export interface BlueskyNotification {
  uri: string
  cid: string
  author: BlueskyAuthor
  reason: BlueskyNotificationReason
  /** The post that was liked, replied to or quoted. Absent for a follow. */
  reasonSubject?: string
  /** The record that caused this, untouched. */
  record?: { text?: string; [key: string]: unknown }
  isRead: boolean
  indexedAt: string
  [key: string]: unknown
}

export interface BlueskyNotificationOptions {
  /** Pages **backwards into history**, not a "since" marker. There is no time range. */
  cursor?: string
  /** Up to 100, Bluesky defaults to 50. */
  limit?: number
  /** Likes and follows are usually the bulk, so filtering cuts most of the noise. */
  reasons?: BlueskyNotificationReason[]
  /** Roughly the people you follow. */
  priority?: boolean
  /** Reference point for `isRead`, **not** a filter. */
  seenAt?: string
}
