import { assertMediaSize, resolveMedia, type Media } from '../../core/media'
import { createRequest, type RequestOptions } from '../../core/request'

/**
 * The limit people actually run into. A plain screenshot is several times this, and
 * official clients resize before uploading. We do not, so the error has to say why.
 */
export const BLUESKY_BLOB_LIMIT = 1_000_000

/** A post carries **one** embed, and up to four images inside it. */
export const BLUESKY_MAX_IMAGES = 4

/** What `uploadBlob` hands back, and what an embed has to point at unchanged. */
export interface BlueskyBlob {
  $type: 'blob'
  ref: { $link: string }
  mimeType: string
  size: number
}

export interface BlueskyImage {
  image: BlueskyBlob
  /** Bluesky shows this to screen readers and in place of a failed image. */
  alt: string
}

/**
 * Bluesky takes **no url**: a blob is uploaded on its own and the post then references
 * it. The upload wants the raw bytes as the body, with the type in the header, not
 * multipart.
 */
export async function uploadBlob(
  service: string,
  accessJwt: string,
  media: Media,
  options: RequestOptions = {},
  fetch?: typeof globalThis.fetch,
): Promise<BlueskyBlob> {
  const resolved = await resolveMedia(media, options, fetch)
  assertMediaSize(resolved, BLUESKY_BLOB_LIMIT, 'Bluesky')

  const answer = await createRequest(options, fetch)<{ blob: BlueskyBlob }>(
    new URL('/xrpc/com.atproto.repo.uploadBlob', service).toString(),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessJwt}`, 'Content-Type': resolved.type },
      body: resolved.bytes,
    },
  )

  return answer.blob
}

export function imagesEmbed(images: BlueskyImage[]) {
  return { $type: 'app.bsky.embed.images', images }
}

/**
 * The link card, the thing that makes a post look like a shared article. Bluesky
 * builds **nothing** by itself: title, description and thumbnail are all given here,
 * and the thumbnail is a blob like any other.
 */
export function externalEmbed(card: {
  uri: string
  title: string
  description: string
  thumb?: BlueskyBlob
}) {
  return {
    $type: 'app.bsky.embed.external',
    external: {
      uri: card.uri,
      title: card.title,
      description: card.description,
      thumb: card.thumb,
    },
  }
}

export function assertImageCount(count: number): void {
  if (count > BLUESKY_MAX_IMAGES) {
    throw new Error(`Bluesky takes at most ${BLUESKY_MAX_IMAGES} images, got ${count}`)
  }
}
