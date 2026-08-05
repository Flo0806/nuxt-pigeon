import { resolveMedia, type Media } from '../../core/media'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { assertOk } from './mode'

const API = 'https://slack.com/api'

export interface SlackUpload {
  id: string
  title: string
}

/**
 * Slack is the only channel here where a file is not attached to a message, it
 * **becomes** one. Three steps, and none of them is optional:
 *
 * 1. `files.getUploadURLExternal` hands out a one time url and a file id
 * 2. the bytes go to that url, not to the API
 * 3. `files.completeUploadExternal` shares the file into a channel, with the text as
 *    its `initial_comment`
 *
 * Both API calls are **form encoded**. These are older style methods and do not take
 * json, which is why `files` travels as a string.
 *
 * `fetch` is injectable so the three steps can be tested without a network.
 */
export async function uploadFiles(
  token: string,
  media: Media[],
  options: RequestOptions = {},
  fetch?: typeof globalThis.fetch,
): Promise<SlackUpload[]> {
  const uploads: SlackUpload[] = []

  for (const item of media) {
    const resolved = await resolveMedia(item, options, fetch)
    const title = ('filename' in item && item.filename) || resolved.filename

    const ticket = await post<{ upload_url?: string; file_id?: string }>(
      `${API}/files.getUploadURLExternal`,
      new URLSearchParams({
        filename: title,
        // Slack checks this against what actually arrives, so it is the byte length
        // and not the character count.
        length: String(resolved.bytes.byteLength),
        ...(resolved.alt ? { alt_txt: resolved.alt } : {}),
      }),
      { ...options, headers: { Authorization: `Bearer ${token}` }, label: 'Slack upload' },
      fetch,
    )

    assertOk('files.getUploadURLExternal', ticket._data)

    const { upload_url: url, file_id: id } = ticket._data ?? {}
    if (!url || !id) {
      throw new Error('Slack handed out no upload url, so there is nowhere to put the file')
    }

    // The bytes go to files.slack.com, not to the API, and this one answers with plain
    // text rather than json.
    await post(url, resolved.bytes, { ...options, label: 'Slack upload' }, fetch)

    uploads.push({ id, title })
  }

  return uploads
}

/** The `files` list travels as a string, which is what the form encoding forces. */
export function completeBody(
  uploads: SlackUpload[],
  fields: Record<string, string | undefined>,
): URLSearchParams {
  const body = new URLSearchParams({ files: JSON.stringify(uploads) })

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') {
      body.set(key, value)
    }
  }

  return body
}
