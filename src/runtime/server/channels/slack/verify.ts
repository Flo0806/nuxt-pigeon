import { hmacSha256Hex, safeEqual, utf8 } from '../../core/verify'

/** Slack prefixes both the string it signs and the signature with the version. */
const VERSION = 'v0'

/** Older requests are rejected, so a captured one cannot be replayed later. */
export const MAX_AGE_SECONDS = 300

export interface SignatureCheck {
  signature: string
  timestamp: string
  /** Must be the untouched body. A re-serialised one produces a different hash. */
  rawBody: string
  signingSecret: string
  /** Unix seconds, injectable for tests. */
  now?: number
}

export async function verifySignature(check: SignatureCheck): Promise<boolean> {
  const timestamp = Number(check.timestamp)
  if (!check.timestamp || !Number.isFinite(timestamp)) {
    return false
  }

  const now = check.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > MAX_AGE_SECONDS) {
    return false
  }

  const base = `${VERSION}:${check.timestamp}:${check.rawBody}`
  const expected = `${VERSION}=${await hmacSha256Hex(utf8(check.signingSecret), base)}`

  return safeEqual(check.signature, expected)
}
