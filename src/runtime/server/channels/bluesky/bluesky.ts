import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import { createRequest, type RequestOptions } from '../../core/request'
import { toResult, type RawResponse } from '../../core/result'
import { assertWithinLimit, detectRanges } from './format'
import { assertImageCount, externalEmbed, imagesEmbed, uploadBlob } from './media'
import { withSession, type Session } from './session'
import type {
  BlueskyCommit,
  BlueskyDeleteResult,
  BlueskyFacet,
  BlueskyHandle,
  BlueskyNotification,
  BlueskyNotificationOptions,
  BlueskyPostOptions,
  BlueskyRecordRef,
  BlueskyResult,
} from './types'

const DEFAULT_SERVICE = 'https://bsky.social'

function settings() {
  const { bluesky } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return {
    service: bluesky.service || process.env.PIGEON_BLUESKY_SERVICE || DEFAULT_SERVICE,
    identifier: bluesky.identifier || process.env.PIGEON_BLUESKY_IDENTIFIER,
    password: bluesky.password || process.env.PIGEON_BLUESKY_PASSWORD,
  }
}

function credentials() {
  const { service, identifier, password } = settings()

  if (!identifier || !password) {
    throw new Error(
      'Bluesky identifier or app password is not defined. Set PIGEON_BLUESKY_IDENTIFIER ' +
        'and _PASSWORD, and use an **app password**, never the account one',
    )
  }

  return { service, identifier, password }
}

/** AT Proto procedures are POST, queries are GET. This is the procedure half. */
function procedure<T>(
  service: string,
  method: string,
  session: Session,
  body: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<RawResponse<T>> {
  return createRequest(options).raw<T>(new URL(`/xrpc/${method}`, service).toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessJwt}` },
    body,
  })
}

function query<T>(
  service: string,
  method: string,
  params: Record<string, string | number | boolean | string[] | undefined>,
  session: Session,
  options: RequestOptions = {},
) {
  const url = new URL(`/xrpc/${method}`, service)

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue
    }
    // Array params repeat the key, they are not comma separated.
    for (const entry of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(entry))
    }
  }

  return createRequest(options)<T>(url.toString(), {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  })
}

/** A mention only becomes a facet once the handle is resolved to a did. */
async function resolveHandle(service: string, handle: string): Promise<string | undefined> {
  try {
    const result = await createRequest({ retries: 1 })<{ did: string }>(
      new URL(`/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`, service).toString(),
    )

    return result.did
  } catch {
    // A typo in a handle must not fail the whole post, it simply stays plain text.
    return undefined
  }
}

/**
 * Bluesky links **nothing** on its own: a url in the text stays plain text unless a
 * facet points at it, with byte ranges. Every client computes this before posting,
 * so we do it too, and `facets: false` turns it off.
 */
async function buildFacets(service: string, text: string): Promise<BlueskyFacet[]> {
  const { links, tags, mentions } = detectRanges(text)
  const facets: BlueskyFacet[] = []

  for (const link of links) {
    facets.push({
      index: { byteStart: link.byteStart, byteEnd: link.byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: link.uri }],
    })
  }

  for (const tag of tags) {
    facets.push({
      index: { byteStart: tag.byteStart, byteEnd: tag.byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tag.tag }],
    })
  }

  for (const mention of mentions) {
    const did = await resolveHandle(service, mention.handle)
    if (did) {
      facets.push({
        index: { byteStart: mention.byteStart, byteEnd: mention.byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
      })
    }
  }

  return facets
}

/**
 * Bluesky builds the embed from what it is given and nothing else. Images and a link
 * card are the same slot, so only one of them can be there.
 */
async function buildEmbed(
  service: string,
  session: Session,
  options: BlueskyPostOptions & RequestOptions,
) {
  // A post carries exactly one embed, so both cannot go. Refusing the whole post
  // would be worse than sending a slightly reduced one, but it must never happen
  // quietly: the caller asked for something the format cannot hold and has to hear it.
  if (options.media?.length && options.external) {
    const [first] = options.media

    if (!options.external.thumb && first) {
      console.warn(
        '[nuxt-pigeon] bluesky: a post carries one embed, so the link card wins. ' +
          `Your first image became its thumbnail${options.media.length > 1 ? `, the other ${options.media.length - 1} were dropped` : ''}.`,
      )

      return buildEmbed(service, session, {
        ...options,
        media: undefined,
        external: { ...options.external, thumb: first },
      })
    }

    console.warn(
      `[nuxt-pigeon] bluesky: dropped ${options.media.length} image(s). A post carries one ` +
        'embed, and the link card already has a thumbnail.',
    )

    return buildEmbed(service, session, { ...options, media: undefined })
  }

  if (options.media?.length) {
    assertImageCount(options.media.length)

    const images = []
    for (const item of options.media) {
      images.push({
        image: await uploadBlob(service, session.accessJwt, item, options),
        // Required by the lexicon, so an empty string beats leaving it out.
        alt: ('alt' in item && item.alt) || '',
      })
    }

    return imagesEmbed(images)
  }

  if (options.external) {
    const { thumb, ...card } = options.external

    return externalEmbed({
      ...card,
      thumb: thumb ? await uploadBlob(service, session.accessJwt, thumb, options) : undefined,
    })
  }

  return undefined
}

/** Public, so this lands in your feed where everyone can read it. */
async function post(text: string, options: BlueskyPostOptions & RequestOptions = {}) {
  const { service, identifier, password } = credentials()

  assertWithinLimit(text)

  const facets =
    options.facets === false ? undefined : (options.facets ?? (await buildFacets(service, text)))

  return withSession(service, identifier, password, async (session) => {
    const collection = 'app.bsky.feed.post'
    const response = await procedure<BlueskyRecordRef>(
      service,
      'com.atproto.repo.createRecord',
      session,
      {
        repo: session.did,
        collection,
        record: {
          $type: collection,
          text,
          createdAt: options.createdAt ?? new Date().toISOString(),
          langs: options.langs,
          facets: facets?.length ? facets : undefined,
          embed: await buildEmbed(service, session, options),
        },
      },
    )

    // The record key is the last segment of `at://<did>/<collection>/<rkey>`, and it
    // is what deleteRecord needs. Bluesky never sends it on its own.
    const rkey = response._data?.uri.split('/').pop()

    return {
      ...toResult('bluesky', response),
      channel: 'bluesky',
      id: response._data?.uri,
      url: rkey ? `https://bsky.app/profile/${session.did}/post/${rkey}` : undefined,
      repo: session.did,
      collection,
      rkey,
    } satisfies BlueskyResult
  })
}

/**
 * Removes the record from your repository. There is **no `edit`** to go with it, and
 * that is not a gap here: `putRecord` on a post answers happily and the appview
 * ignores it, so an edit would look like it worked and change nothing. Bluesky's own
 * words: *"The Bluesky service prohibits updating posts, so appview intentionally
 * ignores it."* https://github.com/bluesky-social/atproto/discussions/3038
 *
 * Deleting is idempotent by design, so removing the same record twice is not an error.
 */
async function remove(handle: BlueskyHandle, options: RequestOptions = {}) {
  const { service, identifier, password } = credentials()

  if (!handle.rkey) {
    throw new Error(
      'This Bluesky post has no record key, so it cannot be removed. Pass the result ' +
        'of `post`, or a handle with `repo`, `collection` and `rkey`',
    )
  }

  return withSession(service, identifier, password, async (session) => {
    const response = await procedure<BlueskyCommit>(
      service,
      'com.atproto.repo.deleteRecord',
      session,
      {
        repo: handle.repo || session.did,
        collection: handle.collection,
        rkey: handle.rkey,
      },
      options,
    )

    return {
      ...toResult('bluesky', response),
      channel: 'bluesky',
      // Kept so a log line after the fact still says which post this was.
      id: `at://${handle.repo || session.did}/${handle.collection}/${handle.rkey}`,
      repo: handle.repo || session.did,
      collection: handle.collection,
      rkey: handle.rkey,
    } satisfies BlueskyDeleteResult
  })
}

/**
 * Polling, there is no webhook. The cursor pages **backwards into history**, so
 * finding what is new means fetching the newest page and comparing, not asking for
 * everything since a marker.
 */
async function notifications(options: BlueskyNotificationOptions & RequestOptions = {}) {
  const { service, identifier, password } = credentials()

  return withSession(service, identifier, password, (session) =>
    query<{ notifications: BlueskyNotification[]; cursor?: string }>(
      service,
      'app.bsky.notification.listNotifications',
      {
        cursor: options.cursor,
        limit: options.limit,
        reasons: options.reasons,
        priority: options.priority,
        seenAt: options.seenAt,
      },
      session,
      options,
    ),
  )
}

/** Register from a Nitro plugin. The returned function unregisters again. */
function listen(handler: Handler<BlueskyNotification>): () => void {
  return addListener('bluesky', handler)
}

export const bluesky = { post, delete: remove, listen, notifications }
