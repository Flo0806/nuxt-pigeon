export interface EndpointConfig {
  url?: string
  secret?: string
  headers?: Record<string, string>
}

export interface WebhookConfig extends EndpointConfig {
  endpoints?: Record<string, EndpointConfig>
}

export interface ResolvedEndpoint {
  url?: string
  secret?: string
  headers: Record<string, string>
}

/** `PIGEON_WEBHOOK_MY_HOOK_URL` for an endpoint named `my-hook`. */
function envKey(name: string, suffix: string) {
  return `PIGEON_WEBHOOK_${name.toUpperCase().replaceAll('-', '_')}_${suffix}`
}

/**
 * Where a call actually goes. Config first, then the environment, then the channel
 * defaults, so a shared `PIGEON_WEBHOOK_SECRET` can cover every endpoint at once
 * while a single one can still carry its own.
 *
 * Reads the environment as an argument rather than from `process`, so the whole
 * chain is testable without touching the real one.
 */
export function resolveEndpoint(
  config: WebhookConfig,
  env: Record<string, string | undefined>,
  name?: string,
): ResolvedEndpoint {
  const fallback = {
    url: config.url || env.PIGEON_WEBHOOK_URL,
    secret: config.secret || env.PIGEON_WEBHOOK_SECRET,
    headers: config.headers ?? {},
  }

  if (!name) {
    return fallback
  }

  const endpoint = config.endpoints?.[name]
  if (!endpoint) {
    const known = Object.keys(config.endpoints ?? {}).join(', ') || 'none'

    throw new Error(`Webhook endpoint "${name}" is not configured. Known: ${known}`)
  }

  return {
    url: endpoint.url || env[envKey(name, 'URL')] || fallback.url,
    secret: endpoint.secret || env[envKey(name, 'SECRET')] || fallback.secret,
    headers: { ...fallback.headers, ...endpoint.headers },
  }
}
