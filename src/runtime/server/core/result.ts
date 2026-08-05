/**
 * What every `send` returns. Two jobs, kept apart on purpose:
 *
 * `channel`, `id` and `url` are **ours**. They are the same shape everywhere, they are
 * what `edit` and `delete` need, and each channel fills them from whatever it happens
 * to call the thing.
 *
 * `raw` and `response` are **the service's**, handed over 1:1 and never trimmed. We
 * cannot know what somebody needs: Discord's rate limit budget lives in the headers,
 * Mastodon paginates through `Link`, Slack answers with the string `ok` and nothing
 * else. Whoever needs it must not have to leave the module to get it.
 */
export interface PigeonResult<Body = unknown> {
  channel: string
  /** The service's own id for what was just sent, as a string. Missing where there is none. */
  id?: string
  /** Permalink, only when it is known to be right. Never guessed together. */
  url?: string
  /** The parsed body, exactly as it came back. `undefined` when the answer had none. */
  raw: Body
  /** The rest of the answer. */
  response: PigeonResponse
}

export interface PigeonResponse {
  status: number
  /** Lower cased names, because HTTP header names are case insensitive. */
  headers: Record<string, string>
}

/** The part of an ofetch response this needs, so tests can pass a plain object. */
export interface RawResponse<Body = unknown> {
  status: number
  headers: Headers
  _data?: Body
}

/**
 * Repeated names are joined with `, `, which is what `Headers` itself does when it is
 * read. The one exception in HTTP is `set-cookie`, and no channel here sets cookies.
 */
export function headersToObject(headers: Headers): Record<string, string> {
  const object: Record<string, string> = {}

  headers.forEach((value, key) => {
    object[key.toLowerCase()] = value
  })

  return object
}

/**
 * The base every channel builds on. Ids and links are added by the channel afterwards,
 * because only it knows where they sit.
 */
export function toResult<Body = unknown>(
  channel: string,
  response: RawResponse<Body>,
): PigeonResult<Body> {
  return {
    channel,
    raw: response._data as Body,
    response: { status: response.status, headers: headersToObject(response.headers) },
  }
}
