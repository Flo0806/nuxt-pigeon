/**
 * Web Crypto rather than `node:crypto`, so this also runs on edge runtimes. Every
 * channel that signs or checks a webhook needs it.
 */
async function hmac(key: Uint8Array<ArrayBuffer>, message: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return new Uint8Array(
    await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(message)),
  )
}

export async function hmacSha256Hex(key: Uint8Array<ArrayBuffer>, message: string) {
  const signed = await hmac(key, message)

  return [...signed].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hmacSha256Base64(key: Uint8Array<ArrayBuffer>, message: string) {
  return btoa(String.fromCharCode(...(await hmac(key, message))))
}

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text)
}

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
