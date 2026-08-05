export default defineEventHandler(async (event) => {
  const { text, mrkdwn, escape, channelId, threadTs, mediaUrl } = await readBody<{
    text: string
    mrkdwn: boolean
    escape: boolean
    channelId: string
    threadTs: string
    mediaUrl: string
  }>(event)

  try {
    const message = await slack.send(escape ? slack.escapeMrkdwn(text) : text, {
      mrkdwn,
      // Empty falls back to PIGEON_SLACK_CHANNEL, which is the normal case.
      channelId: channelId || undefined,
      threadTs: threadTs || undefined,
      // Slack takes no url, so this one is really fetched and uploaded again.
      media: mediaUrl ? [{ url: mediaUrl }] : undefined,
    })

    // With a bot token there is an id and a channel, so this can be changed again.
    // Through an incoming webhook both stay empty, and that is the whole difference.
    return {
      ok: true as const,
      id: message.id,
      channelId: message.channelId,
      // Set instead of `id` when the message is an upload: Slack answers those
      // without a message timestamp.
      fileIds: message.fileIds,
      sent: typeof message.raw === 'string' ? message.raw : undefined,
    }
  } catch (error) {
    return { ok: false as const, error: (error as Error).message }
  }
})
