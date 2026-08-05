/** Absent headers are `undefined`, so nothing pretends to be there that is not. */
export type PigeonHeaders = Record<string, string | undefined>

/**
 * Shared by the server and the browser, so neither has to import from the other.
 *
 * `Body` is filled in by the channel, so `slack.listen` hands you a Slack envelope
 * rather than `unknown`. Those types cover the useful fields and **hide nothing**:
 * each carries an index signature, so anything a service adds stays reachable.
 */
export interface PigeonMessage<Body = unknown> {
  /** Which channel it came in on. */
  channel: string
  /** When we received it, not when the sender created it. */
  at: string
  /** The untouched bytes. A signature covers these, a re-serialised body does not. */
  raw: string
  /** Parsed when the body is JSON, otherwise the same string as `raw`. */
  body: Body
  headers: PigeonHeaders
  /**
   * The event name in the channel's own words: Slack `app_mention` or `message`,
   * Telegram `edited_message`, GitHub `push`. Not interpreted, only passed on, and
   * it is what tells two deliveries of the same message apart.
   */
  type?: string
  /**
   * The few things every channel can answer, so a handler that does not care which
   * channel it is can still read them. **Nothing is filtered out on the way**: the
   * complete payload stays in `raw` and `body`.
   */
  text?: string
  from?: { id: string; name?: string }
  /** Chat, channel or thread the message belongs to. */
  conversation?: string
}
