/**
 * HTTP headers are ASCII. ntfy accepts UTF-8 in practice but documents RFC 2047 as
 * the safe form, so a title with an umlaut travels as `=?UTF-8?B?…?=` instead of
 * arriving as question marks.
 *
 * Only touched when it has to be: plain ASCII stays readable in a log.
 */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value
  }

  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(value)))

  return `=?UTF-8?B?${base64}?=`
}

/** Maps our option names onto the headers ntfy expects on the upload path. */
const HEADERS: Record<string, string> = {
  message: 'X-Message',
  title: 'X-Title',
  priority: 'X-Priority',
  tags: 'X-Tags',
  click: 'X-Click',
  markdown: 'X-Markdown',
  icon: 'X-Icon',
  filename: 'X-Filename',
  email: 'X-Email',
  call: 'X-Call',
  delay: 'X-Delay',
  actions: 'X-Actions',
  sequence_id: 'X-Sequence-ID',
}

/**
 * Turns the publish fields into headers, because a binary upload uses the body for
 * the file itself and leaves nowhere else to put them.
 */
export function uploadHeaders(fields: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const [key, value] of Object.entries(fields)) {
    const name = HEADERS[key]
    if (!name || value === undefined || value === null) {
      continue
    }

    const text = Array.isArray(value)
      ? value.join(',')
      : JSON.stringify(value).replace(/^"|"$/g, '')
    headers[name] = encodeHeader(text)
  }

  return headers
}
