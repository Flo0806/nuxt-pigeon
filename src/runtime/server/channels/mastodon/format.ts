/** Used when the instance cannot be asked. Mastodon's own defaults. */
export const MASTODON_DEFAULT_LIMIT = 500
export const MASTODON_DEFAULT_URL_COST = 23

export interface MastodonLimits {
  maxCharacters: number
  charactersReservedPerUrl: number
}

const URL_PATTERN = /https?:\/\/\S+/g

/** `@user@instance.social` costs what `@user` costs, the domain is free. */
const REMOTE_MENTION_DOMAIN = /(@[a-z0-9_]+)@[a-z0-9.-]+/gi

/**
 * Mastodon counts characters, but not the ones you see: **every url costs a flat
 * amount** no matter how long it is, and the domain of a remote mention costs
 * nothing. Both rules are documented, and a plain `text.length` rejects posts the
 * instance would happily accept.
 */
export function countCharacters(text: string, limits: MastodonLimits): number {
  const withoutDomains = text.replace(REMOTE_MENTION_DOMAIN, '$1')
  const urls = withoutDomains.match(URL_PATTERN) ?? []
  const urlChars = urls.reduce((sum, url) => sum + url.length, 0)

  return withoutDomains.length - urlChars + urls.length * limits.charactersReservedPerUrl
}

export function assertWithinLimit(text: string, limits: MastodonLimits): void {
  const length = countCharacters(text, limits)

  if (length > limits.maxCharacters) {
    throw new Error(`Mastodon rejects posts over ${limits.maxCharacters} characters, got ${length}`)
  }
}

/**
 * Mastodon paginates through a `Link` header instead of a cursor in the body, and
 * tells clients to follow it rather than sorting ids themselves: ids are opaque, and
 * only sortable on Mastodon itself, not on every server speaking its api.
 */
export function pageIds(header: string | null | undefined) {
  const links = header?.match(/<[^>]+>;\s*rel="(?:next|prev)"/g) ?? []

  let nextMaxId: string | undefined
  let prevMinId: string | undefined

  for (const link of links) {
    const params = new URL(link.slice(1, link.indexOf('>'))).searchParams
    nextMaxId ??= params.get('max_id') ?? undefined
    prevMinId ??= params.get('min_id') ?? undefined
  }

  return { nextMaxId, prevMinId }
}

/**
 * Mastodon delivers post content as **HTML**, so a handler that just wants the words
 * would otherwise get `<p>@flo hallo</p>`. Turned into text for `message.text`, while
 * the untouched html stays in `body` for anyone who wants the markup.
 *
 * Deliberately small: this is a view, not a parser.
 */
export function plainText(html: string): string {
  return (
    html
      .replaceAll(/<br\s*\/?>/gi, '\n')
      .replaceAll(/<\/p>\s*<p>/gi, '\n\n')
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      // Last, otherwise it would decode the ampersands of the entities above.
      .replaceAll('&amp;', '&')
      .trim()
  )
}
