/** Shared by the server and the browser, so neither has to import from the other. */
export interface PigeonMessage {
  /** Which channel it came in on. */
  channel: string
  /** When we received it, not when the sender created it. */
  at: string
  /** The untouched bytes. A signature covers these, a re-serialised body does not. */
  raw: string
  /** Parsed when the body is JSON, otherwise the same string as `raw`. */
  body: unknown
  /** Lower cased keys, which is what h3 hands out. */
  headers: Record<string, string>
}
