import { createFetch, type $Fetch, type FetchContext } from 'ofetch'

export const DEFAULT_TIMEOUT_MS = 10_000
export const DEFAULT_RETRIES = 2
export const DEFAULT_RETRY_DELAY_MS = 500

/** Waiting longer than this helps nobody, so a huge `Retry-After` is trimmed. */
const MAX_RETRY_AFTER_MS = 60_000

export interface RequestOptions {
  /** Time limit per attempt. 0 disables it. Long polling needs a large value. */
  timeoutMs?: number
  /** Extra attempts after the first. 0 disables retrying. */
  retries?: number
  /** Delay before the second attempt, doubled for each one after. */
  retryDelayMs?: number
  /**
   * Retry when the request never got an answer. Off by default: without a response
   * we cannot know whether it already arrived, and sending again would deliver the
   * message twice.
   */
  retryOnNetworkError?: boolean
  /**
   * How long a service asked us to wait, when it does not use `Retry-After`.
   * Telegram puts it in the body as `parameters.retry_after`, others elsewhere.
   *
   * Exists so no channel specific knowledge has to live down here: the channel
   * supplies the reading, the transport keeps the policy. Milliseconds, and
   * `undefined` means the header decides, or our own backoff.
   */
  retryAfter?: (response: Response, body: unknown) => number | undefined
}

/**
 * `Retry-After` is either seconds or an HTTP date. Undefined means the caller picks
 * the delay itself.
 */
export function retryAfterMs(header: string | null | undefined, now = Date.now()) {
  if (!header) {
    return undefined
  }

  const seconds = Number(header)
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now

  if (!Number.isFinite(ms) || ms < 0) {
    return undefined
  }

  return Math.min(ms, MAX_RETRY_AFTER_MS)
}

/**
 * The transport every channel sends through. ofetch already brings the time limit,
 * the retry counter and the list of retriable status codes, so this only adds what
 * it lacks: growing delays and respecting `Retry-After`.
 *
 * `fetch` is injectable so the behaviour can be tested without a network.
 */
export function createRequest(
  options: RequestOptions = {},
  fetch: typeof globalThis.fetch = globalThis.fetch,
): $Fetch {
  const retries = options.retries ?? DEFAULT_RETRIES
  const baseDelay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  return createFetch({ fetch }).create({
    retry: retries,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,

    retryDelay(context: FetchContext) {
      const response = context.response

      // The service telling us beats anything we would come up with. Header first,
      // because it is the standard, then whatever the channel knows about its body.
      const asked =
        retryAfterMs(response?.headers.get('retry-after')) ??
        (response && options.retryAfter?.(response, response._data))

      if (asked !== undefined && asked !== null) {
        return Math.min(asked, MAX_RETRY_AFTER_MS)
      }

      // ofetch counts down, so the remaining tries tell us which attempt this is.
      const remaining = typeof context.options.retry === 'number' ? context.options.retry : retries

      return baseDelay * 2 ** Math.max(0, retries - remaining)
    },

    onRequestError(context: FetchContext) {
      // No response at all, so we cannot know whether the message already arrived.
      // ofetch would treat this like a 500 and try again, which could deliver twice.
      if (!options.retryOnNetworkError) {
        context.options.retry = 0
      }
    },
  })
}
