/** The server default. A self hosted instance can raise it. */
export const NTFY_LIMIT = 4096

/** ntfy counts bytes: an umlaut costs two, an emoji four. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function assertWithinLimit(text: string, limit = NTFY_LIMIT): void {
  const length = byteLength(text)

  if (length > limit) {
    throw new Error(`ntfy rejects messages over ${limit} bytes, got ${length}`)
  }
}
