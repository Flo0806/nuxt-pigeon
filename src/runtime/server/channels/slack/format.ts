/** The `text` field of a message. Blocks have their own, much smaller budget. */
export const SLACK_LIMIT = 40_000

export function assertWithinLimit(text: string): void {
  if (text.length > SLACK_LIMIT) {
    throw new Error(`Slack rejects messages over ${SLACK_LIMIT} characters, got ${text.length}`)
  }
}

/**
 * Offered, never applied on its own. `mrkdwn` is not Discord's markdown: bold is a
 * single `*`, and links are written `<url|text>`. Which is why these three characters
 * have to go, otherwise a `<` starts a link that swallows the rest of the line.
 */
export function escapeMrkdwn(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
