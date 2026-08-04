import { createRequest, type RequestOptions } from './request'

export interface PostOptions extends RequestOptions {
  /** Merged over what we set. An **empty value removes** a header. */
  headers?: Record<string, string>
  /** Defaults to POST. */
  method?: string
  /** Set means sign with Standard Webhooks, unset means send plain. */
  secret?: string
  /** The `webhook-id` a receiver uses as its idempotency key. Defaults to a uuid. */
  id?: string
  /** Names the target in errors. Falls back to the host. */
  label?: string
}

/** Standard Webhooks secrets carry this, the rest is base64. */
const SECRET_PREFIX = 'whsec_'

/**
 * What `fetch` already understands goes out untouched, only a plain object becomes
 * JSON. ofetch would label a string as `application/json`, which lies about a plain
 * text body, so the type is decided here instead.
 */
export function serialise(payload: unknown): { body: BodyInit; contentType?: string } {
  if (typeof payload === 'string') {
    return { body: payload, contentType: 'text/plain;charset=UTF-8' }
  }

  if (
    payload instanceof URLSearchParams ||
    payload instanceof FormData ||
    payload instanceof ArrayBuffer ||
    payload instanceof Blob ||
    ArrayBuffer.isView(payload)
  ) {
    return { body: payload as BodyInit }
  }

  return { body: JSON.stringify(payload), contentType: 'application/json' }
}

/**
 * Later sources win, matched case insensitively because HTTP headers are. An empty
 * value **removes** the header, which is the only way to drop something we would set.
 */
export function mergeHeaders(
  ...sources: (Record<string, string> | undefined)[]
): Record<string, string> {
  const merged = new Map<string, [string, string]>()

  for (const source of sources) {
    for (const [key, value] of Object.entries(source ?? {})) {
      merged.set(key.toLowerCase(), [key, value])
    }
  }

  return Object.fromEntries([...merged.values()].filter(([, value]) => value !== ''))
}

/**
 * Names the target in an error without leaking it. For Discord and Slack the url path
 * **is** the credential, and ofetch puts the full url into its message.
 */
export function targetName(url: string, label?: string): string {
  if (label) {
    return label
  }

  try {
    return new URL(url).host
  } catch {
    return 'url'
  }
}

/** A `whsec_` secret is base64 by convention, anything else is taken literally. */
function signingKey(secret: string): Uint8Array<ArrayBuffer> {
  if (!secret.startsWith(SECRET_PREFIX)) {
    return new TextEncoder().encode(secret)
  }

  return Uint8Array.from(atob(secret.slice(SECRET_PREFIX.length)), (c) => c.charCodeAt(0))
}

/**
 * Standard Webhooks (standardwebhooks.com), so a receiver can verify with an existing
 * library instead of reading our docs. Web Crypto rather than `node:crypto`, so this
 * also runs on edge runtimes.
 */
export async function signature(secret: string, id: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    signingKey(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  )

  return `v1,${btoa(String.fromCharCode(...signed))}`
}

/**
 * One POST to a url. Adds nothing to the payload: what you pass is what the receiver
 * gets. The only header set on its own is `Content-Type`.
 */
export async function post(url: string, payload: unknown, options: PostOptions = {}) {
  const { body, contentType } = serialise(payload)
  const headers = mergeHeaders(
    contentType ? { 'Content-Type': contentType } : undefined,
    options.headers,
  )

  if (options.secret) {
    if (typeof body !== 'string') {
      throw new Error('Signing needs a body we can serialise, this one is a stream')
    }

    const id = options.id || crypto.randomUUID()
    const timestamp = Math.floor(Date.now() / 1000).toString()

    headers['webhook-id'] = id
    headers['webhook-timestamp'] = timestamp
    headers['webhook-signature'] = await signature(options.secret, id, timestamp, body)
  }

  const name = targetName(url, options.label)

  try {
    return await createRequest(options)(url, {
      method: options.method || 'POST',
      headers,
      body,
    })
  } catch (error) {
    const status = (error as { status?: number }).status

    // Rebuilt rather than passed on: ofetch puts the full url into its message, and
    // for a Discord or Slack webhook that url is the credential.
    throw new Error(
      status ? `${name} responded ${status}` : `${name} failed: ${(error as Error).message}`,
      { cause: error },
    )
  }
}
