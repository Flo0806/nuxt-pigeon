/** Documented at https://docs.bsky.app/docs/advanced-guides/post-richtext */

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
