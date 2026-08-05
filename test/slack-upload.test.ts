import { describe, it, expect } from 'vitest'
import { completeBody, uploadFiles } from '../src/runtime/server/channels/slack/upload'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Answers the two API calls and the upload url, and records what it was asked. */
function slack(calls: { url: string; body?: string }[] = []) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    // URLSearchParams travels as itself, not as a string, so it is read back here.
    const body = init?.body
    calls.push({ url, body: body instanceof URLSearchParams ? body.toString() : undefined })

    if (url.endsWith('files.getUploadURLExternal')) {
      return new Response(
        JSON.stringify({ ok: true, upload_url: 'https://files.slack.com/upload/x', file_id: 'F1' }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response('OK')
  }
}

describe('uploadFiles', () => {
  it('asks for a url, puts the bytes there, and returns the file id', async () => {
    const calls: { url: string; body?: string }[] = []
    const uploads = await uploadFiles(
      'xoxb-1',
      [{ data: PNG, filename: 'shot.png' }],
      {},
      slack(calls),
    )

    expect(uploads).toEqual([{ id: 'F1', title: 'shot.png' }])
    // Two steps, and the second one goes to files.slack.com, not to the API.
    expect(calls[0]!.url).toBe('https://slack.com/api/files.getUploadURLExternal')
    expect(calls[1]!.url).toBe('https://files.slack.com/upload/x')
  })

  it('sends the byte length, which Slack checks against what arrives', async () => {
    const calls: { url: string; body?: string }[] = []
    await uploadFiles('xoxb-1', [{ data: PNG, filename: 'shot.png' }], {}, slack(calls))

    const asked = new URLSearchParams(calls[0]!.body)
    expect(asked.get('length')).toBe('8')
    expect(asked.get('filename')).toBe('shot.png')
  })

  it('throws when Slack answers ok but hands out no url', async () => {
    const empty = async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })

    await expect(uploadFiles('xoxb-1', [{ data: PNG }], {}, empty)).rejects.toThrow('no upload url')
  })

  it('reports an ok:false, which arrives with status 200', async () => {
    const denied = async () =>
      new Response(JSON.stringify({ ok: false, error: 'missing_scope', needed: 'files:write' }), {
        headers: { 'Content-Type': 'application/json' },
      })

    await expect(uploadFiles('xoxb-1', [{ data: PNG }], {}, denied)).rejects.toThrow('files:write')
  })
})

describe('completeBody', () => {
  it('sends the file list as a string, which the form encoding forces', () => {
    const body = completeBody([{ id: 'F1', title: 'shot.png' }], { channel_id: 'C1' })

    expect(body.get('files')).toBe('[{"id":"F1","title":"shot.png"}]')
    expect(body.get('channel_id')).toBe('C1')
  })

  it('leaves out what was not given, so Slack keeps its own defaults', () => {
    const body = completeBody([{ id: 'F1', title: 'a' }], {
      channel_id: 'C1',
      thread_ts: undefined,
      initial_comment: '',
    })

    expect(body.has('thread_ts')).toBe(false)
    expect(body.has('initial_comment')).toBe(false)
  })
})
