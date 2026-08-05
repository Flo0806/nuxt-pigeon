import { createRequest, type RequestOptions } from './request'

interface MediaBase {
  /**
   * Description for people who cannot see the image. Bluesky and Mastodon both take
   * it, Mastodon actively nags about it, and it costs one sentence.
   */
  alt?: string
  filename?: string
}

export interface MediaUrl extends MediaBase {
  /** Passed straight through by the channels that accept one, fetched for the rest. */
  url: string
}

export interface MediaBytes extends MediaBase {
  data: Blob | Uint8Array | ArrayBuffer
  /** Only needed when the bytes carry no hint of their own. */
  type?: string
}

export type Media = MediaUrl | MediaBytes

export interface ResolvedMedia {
  bytes: Uint8Array<ArrayBuffer>
  type: string
  filename: string
  alt?: string
}

export function isUrlMedia(media: Media): media is MediaUrl {
  return 'url' in media
}

/**
 * Reads the type out of the first bytes rather than trusting a name. A file called
 * `shot.png` that holds a jpeg is common enough, and several apis refuse a mismatch.
 */
export function detectType(bytes: Uint8Array): string | undefined {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte)

  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif'

  // RIFF....WEBP, the four size bytes in between are not part of the signature.
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    [0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b)
  ) {
    return 'image/webp'
  }

  // ....ftyp, the box length comes first.
  if ([0x66, 0x74, 0x79, 0x70].every((byte, i) => bytes[4 + i] === byte)) return 'video/mp4'

  return undefined
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
}

/** Several apis want a name in the multipart part, and some reject an empty one. */
function nameFor(media: Media, type: string): string {
  if (media.filename) {
    return media.filename
  }

  if (isUrlMedia(media)) {
    const last = new URL(media.url).pathname.split('/').pop()
    if (last) {
      return last
    }
  }

  return `upload.${EXTENSIONS[type] ?? 'bin'}`
}

async function toBytes(data: Blob | Uint8Array | ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  // Copied rather than shared: a view can sit on a SharedArrayBuffer, which several
  // apis will not take.
  return new Uint8Array(data)
}

/**
 * Turns either input form into bytes, a type and a name. Only called for channels
 * that cannot take a url themselves: Mastodon, Bluesky and a Discord attachment.
 * The others get the url handed to them untouched and nothing is downloaded.
 */
export async function resolveMedia(
  media: Media,
  options: RequestOptions = {},
  fetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<ResolvedMedia> {
  if (isUrlMedia(media)) {
    const response = await createRequest(options, fetch).raw<ArrayBuffer, 'arrayBuffer'>(
      media.url,
      {
        responseType: 'arrayBuffer',
      },
    )
    const bytes = new Uint8Array(response._data ?? new ArrayBuffer(0))

    // Sniffed first: a server that labels everything octet-stream is common.
    const type =
      detectType(bytes) ??
      response.headers.get('content-type')?.split(';')[0]?.trim() ??
      'application/octet-stream'

    return { bytes, type, filename: nameFor(media, type), alt: media.alt }
  }

  const bytes = await toBytes(media.data)
  const type =
    media.type ??
    (media.data instanceof Blob && media.data.type ? media.data.type : undefined) ??
    detectType(bytes) ??
    'application/octet-stream'

  return { bytes, type, filename: nameFor(media, type), alt: media.alt }
}

/**
 * Refuses what the service would refuse, **with the real numbers**. Bluesky takes
 * just under 1 MB per image while a normal screenshot is several times that, so this
 * is the limit people actually run into. We do not resize: that would mean a heavy
 * dependency and a decision about the caller's content.
 */
export function assertMediaSize(media: ResolvedMedia, limit: number, channel: string): void {
  if (media.bytes.length > limit) {
    const got = Math.round(media.bytes.length / 1024)
    const max = Math.round(limit / 1024)

    throw new Error(
      `${channel} rejects media over ${max} kB, "${media.filename}" is ${got} kB. ` +
        'Resize it before sending, this module deliberately does not.',
    )
  }
}
