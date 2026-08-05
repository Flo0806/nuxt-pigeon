import { useRuntimeConfig } from '#imports'
import { post } from '../../core/post'
import type { RequestOptions } from '../../core/request'
import { assertWithinLimit } from './format'
import type { NtfySendOptions } from './types'

const DEFAULT_SERVER = 'https://ntfy.sh'

function settings() {
  const { ntfy } = useRuntimeConfig().pigeon.channels

  // Runtime config - or env as fallback
  return {
    server: ntfy.server || process.env.PIGEON_NTFY_SERVER || DEFAULT_SERVER,
    topic: ntfy.topic || process.env.PIGEON_NTFY_TOPIC,
    token: ntfy.token || process.env.PIGEON_NTFY_TOKEN,
  }
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
  const { server, topic: configured, token } = settings()
  const topic = options.topic || configured

  if (!topic) {
    throw new Error('ntfy topic is not defined. Set PIGEON_NTFY_TOPIC or pass one per call')
  }

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

  return post(
    new URL('/', server).toString(),
    {
      topic,
      message: text,
      title: options.title,
      priority: options.priority,
      tags: options.tags,
      click: options.click,
      markdown: options.markdown,
      icon: options.icon,
      attach: options.attach,
      filename: options.filename,
      actions: options.actions,
      email: options.email,
      call: options.call,
      delay: options.delay,
    },
    { ...options, headers: { ...headers, ...options.headers }, label: 'ntfy' },
  )
}

export const ntfy = { send }
