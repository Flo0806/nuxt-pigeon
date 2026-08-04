/**
 * Constant time comparison for shared secrets, so a wrong value cannot be guessed
 * byte by byte from how long the answer took.
 *
 * The length check leaks the expected length, which is not a secret.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return diff === 0
}
