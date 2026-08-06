/**
 * The names of the configured endpoints, and whether each has a url and a secret.
 * Names and the presence of a secret are useful on a page, the values are not.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig().pigeon.webhook

  const endpoints = Object.entries(config.endpoints ?? {}).map(([name, endpoint]) => ({
    name,
    // A name with no url of its own falls back to the default one, which is worth
    // seeing: it explains why an endpoint works that looks empty in the config.
    url: Boolean(endpoint.url || process.env[`PIGEON_WEBHOOK_${name.toUpperCase()}_URL`]),
    secret: Boolean(endpoint.secret || process.env[`PIGEON_WEBHOOK_${name.toUpperCase()}_SECRET`]),
  }))

  return {
    endpoints,
    url: Boolean(config.url || process.env.PIGEON_WEBHOOK_URL),
    secret: Boolean(config.secret || process.env.PIGEON_WEBHOOK_SECRET),
    // Where deliveries arrive. Not a secret, and useless if you cannot read it.
    route: '/api/_pigeon/webhook',
    origin: getRequestURL(event).origin,
  }
})
