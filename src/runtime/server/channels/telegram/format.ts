export const TELEGRAM_LIMIT = 4096

export function assertWithinLimit(text: string): void {
  if (text.length > TELEGRAM_LIMIT) {
    throw new Error(
      `Telegram rejects messages over ${TELEGRAM_LIMIT} characters, got ${text.length}`,
    )
  }
}

/**
 * Offered, never applied on its own. Only relevant with `parseMode: 'HTML'`, where
 * these three characters would otherwise start a tag Telegram then rejects.
 *
 * HTML rather than MarkdownV2 on purpose: MarkdownV2 reserves eighteen characters,
 * with different rules inside code and link entities. Three beats eighteen for text
 * a machine produced.
 */
export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
