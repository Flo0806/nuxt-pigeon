import { useRuntimeConfig } from '#imports'
import {
  getOverride,
  notConfigured,
  resolveCredentials,
  type CredentialsMode,
} from '../../core/credentials'
import { defineLifecycle } from '../../core/lifecycle'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { isUrlMedia, resolveMedia } from '../../core/media'
import { toResult, type RawResponse } from '../../core/result'
import { assertWithinLimit } from './format'
import { uploadHeaders } from './media'
import type { NtfyCredentials, NtfyHandle, NtfyMessage, NtfyResult, NtfySendOptions } from './types'

const DEFAULT_SERVER = 'https://ntfy.sh'

function mode() {
  // Generated runtime config types widen the literal to `string`.
  return useRuntimeConfig().pigeon.channels.ntfy.credentials as CredentialsMode
}

function resolved() {
  const { ntfy } = useRuntimeConfig().pigeon.channels

  return resolveCredentials<NtfyCredentials>({
    channel: 'ntfy',
    mode: mode(),
    // Runtime config - or env as fallback
    static: {
      server: ntfy.server || process.env.PIGEON_NTFY_SERVER,
      topic: ntfy.topic || process.env.PIGEON_NTFY_TOPIC,
      token: ntfy.token || process.env.PIGEON_NTFY_TOKEN,
    },
    override: getOverride('ntfy'),
    // A public topic on ntfy.sh needs nothing else, so the topic is the one thing.
    configured: (values) => !!values.topic,
  })
}

function settings() {
  const { server, topic, token } = resolved().values

  return { server: server || DEFAULT_SERVER, topic, token }
}

function requireTopic(given?: string): string {
  const topic = given || settings().topic

  if (!topic) {
    throw notConfigured('ntfy', mode(), 'ntfy topic', 'PIGEON_NTFY_TOPIC', 'topic')
  }

  return topic
}

/**
 * Published as JSON to the server root rather than through the `X-Title` headers ntfy
 * also offers. HTTP headers are ASCII only, so an umlaut in a title would have to be
 * encoded. In the body it travels untouched.
 *
 * Two options have no body equivalent and stay headers. Their values are plain ASCII,
 * so the reason above does not apply to them.
 */
async function send(text: string, options: NtfySendOptions & RequestOptions = {}) {
  const { server, token } = settings()
  const topic = requireTopic(options.topic)

  assertWithinLimit(text)

  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (options.cache === false) {
    headers['X-Cache'] = 'no'
  }
  if (options.firebase === false) {
    headers['X-Firebase'] = 'no'
  }

  const fields = {
    message: text,
    title: options.title,
    priority: options.priority,
    tags: options.tags,
    click: options.click,
    markdown: options.markdown,
    icon: options.icon,
    filename: options.filename,
    actions: options.actions,
    email: options.email,
    call: options.call,
    delay: options.delay,
    // Ties messages together. Publishing again with the same one **replaces** the
    // notification on every client instead of adding a second one.
    sequence_id: options.sequenceId,
  }

  // Bytes take a completely different route: the body **is** the file, so the topic
  // moves into the path and every option has to travel as a header. A url stays on
  // the json route as `attach`, and ntfy fetches it itself.
  let response: RawResponse<NtfyMessage>

  if (options.media && !isUrlMedia(options.media)) {
    const resolved = await resolveMedia(options.media, options)

    response = await post<NtfyMessage>(new URL(`/${topic}`, server).toString(), resolved.bytes, {
      ...options,
      method: 'PUT',
      headers: {
        ...headers,
        ...uploadHeaders({ ...fields, filename: options.filename ?? resolved.filename }),
        ...options.headers,
      },
      label: 'ntfy',
    })
  } else {
    response = await post<NtfyMessage>(
      new URL('/', server).toString(),
      {
        topic,
        ...fields,
        attach: options.media ? options.media.url : options.attach,
      },
      { ...options, headers: { ...headers, ...options.headers }, label: 'ntfy' },
    )
  }

  return {
    ...toResult('ntfy', response),
    channel: 'ntfy',
    // Either the id you chose, or the one ntfy assigned. Both work as a handle.
    id: options.sequenceId ?? response._data?.id,
    topic,
  } satisfies NtfyResult
}

function sequence(handle: NtfyHandle): { topic: string; id: string } {
  const { topic: configured } = settings()
  const topic = handle.topic || configured

  if (!topic || !handle.id) {
    throw new Error(
      'This ntfy message has no topic or id, so it cannot be changed or removed. ' +
        'Pass the result of `send`, or a handle with `topic` and `id`',
    )
  }

  return { topic, id: handle.id }
}

/**
 * Replaces the notification on every client that has it. Not a separate endpoint:
 * ntfy links messages through a **sequence id**, and publishing again with the same
 * one replaces rather than adds. So this is `send` with the id carried over, which is
 * why every send option works here too.
 *
 * Needs an ntfy server of **2.16.0 or newer**, released 19 January 2026. An older
 * self hosted instance simply publishes a second message instead.
 */
async function edit(
  handle: NtfyHandle,
  text: string,
  options: NtfySendOptions & RequestOptions = {},
) {
  const { topic, id } = sequence(handle)

  return send(text, { ...options, topic, sequenceId: id })
}

/**
 * Removes the notification from the clients that have it, `DELETE /<topic>/<id>`.
 *
 * Same version requirement as `edit`.
 */
async function remove(handle: NtfyHandle, options: RequestOptions = {}) {
  const { server, token } = settings()
  const { topic, id } = sequence(handle)
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  const response = await post<NtfyMessage>(
    new URL(`/${topic}/${id}`, server).toString(),
    undefined,
    {
      ...options,
      method: 'DELETE',
      headers,
      label: 'ntfy',
    },
  )

  return {
    ...toResult('ntfy', response),
    channel: 'ntfy',
    id,
    topic,
  } satisfies NtfyResult
}

/** Nothing runs for ntfy, so `configure` only sets and `status` only tells. */
const lifecycle = defineLifecycle<NtfyCredentials>({
  channel: 'ntfy',
  mode,
  resolve: resolved,
  assert: () => void requireTopic(),
})

export const ntfy = { send, edit, delete: remove, ...lifecycle }
