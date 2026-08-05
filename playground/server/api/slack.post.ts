export default defineEventHandler(async (event) => {
  const { text, mrkdwn, escape } = await readBody<{
    text: string
    mrkdwn: boolean
    escape: boolean
  }>(event)

  try {
    await slack.send(escape ? slack.escapeMrkdwn(text) : text, { mrkdwn })

    // Slack answers with the plain text `ok` and no message id, so there is nothing
    // to hand back. Whether it arrived can only be seen in Slack itself.
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
