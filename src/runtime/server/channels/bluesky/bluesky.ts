import { useRuntimeConfig } from '#imports'
import { addListener, type Handler } from '../../core/listeners'
import { createRequest, type RequestOptions } from '../../core/request'
import { assertWithinLimit, detectRanges } from './format'
import { withSession, type Session } from './session'
import type {
  BlueskyFacet,
  BlueskyNotification,
  BlueskyNotificationOptions,
  BlueskyPostOptions,
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
) {
  return createRequest()<T>(new URL(`/xrpc/${method}`, service).toString(), {
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

/** Public, so this lands in your feed where everyone can read it. */
async function post(text: string, options: BlueskyPostOptions & RequestOptions = {}) {
  const { service, identifier, password } = credentials()

  assertWithinLimit(text)

  const facets =
    options.facets === false ? undefined : (options.facets ?? (await buildFacets(service, text)))

  return withSession(service, identifier, password, (session) =>
    procedure<{ uri: string; cid: string }>(service, 'com.atproto.repo.createRecord', session, {
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: options.createdAt ?? new Date().toISOString(),
        langs: options.langs,
        facets: facets?.length ? facets : undefined,
      },
    }),
  )
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

export const bluesky = { post, listen, notifications }
