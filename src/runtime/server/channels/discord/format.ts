/** Discord counts the message body, embeds have their own budget. */
export const DISCORD_LIMIT = 2000

export function assertWithinLimit(text: string): void {
  if (text.length > DISCORD_LIMIT) {
    throw new Error(`Discord rejects messages over ${DISCORD_LIMIT} characters, got ${text.length}`)
  }
}

/**
 * Offered, never applied on its own: Discord always parses markdown and we do not
 * decide for the caller whether their asterisks mean emphasis or belong to the text.
 *
 * Quote, heading and list markers only count at the start of a line, so escaping them
 * anywhere else would put backslashes into ordinary prose.
 */
export function escapeMarkdown(text: string): string {
  return text.replaceAll(/([\\*_~`|])/g, '\\$1').replaceAll(/^([>#-])/gm, '\\$1')
}
