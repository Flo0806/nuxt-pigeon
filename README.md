<p align="center">
  <img src="https://raw.githubusercontent.com/Flo0806/nuxt-pigeon/main/.github/assets/logo.png" width="120" alt="nuxt-pigeon">
</p>

<h1 align="center">nuxt-pigeon</h1>

<h3 align="center">
  Send and receive messages in Nuxt, whether the service speaks webhooks, polling or streams.
</h3>

<p align="center">
  <a href="https://core.telegram.org/bots/api"><img src="https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
  <a href="https://discord.com/developers/docs/resources/webhook"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://docs.slack.dev"><img src="https://img.shields.io/badge/Slack-4A154B?style=for-the-badge&logoColor=white&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAQAAABKfvVzAAACRUlEQVR42m2Uz6uVVRSGn7X3%2Fs65epUMCQXBkSI2iZIGGgXNSoQGgqAFNnGiIBjU%2FxAOHIih6EwCKVDKWUEDiUYmjRoUqAO71XVwuRD3eM737e9pcI%2Be%2B8N3zfbai%2FWutd93wxSGYeOVuuJCdwbA0z5x5PVHc4bBRljAc2pVqwfc60Tt1C9Ws6tI66qO0tIxIXGQN2hokZ73AF9e8BMNAwrQIRJAYrz2SjGeF9lwldc5QSbTk3jOO4CwINBvmuV%2B4xZfc85P1NZWvQ2zoYtNPZ%2FfmbYPgmc85VI8nY1JAFu9wFv153wZr7kZi2735IsOd6DeWk3U6zixXRedI%2FWYH1md2Fr91qGdnRNbTSxRZksDpADLPCGR6EgsAhNESr%2BEp1zZROkbi%2BFN1frYfe6anq90pwLcw5sAvEJhzH%2F8Hb%2BCEXqInfEDgB%2BSgQexUIB5AGp8DRY%2BYDtACMwz9CQDKsv0BDtYwE9tpw13u9%2B%2FVOv3NmbvbKLaexb%2FVce2rjisl9WRE%2FVdj0zXOouJOkpsoxIEQ0i76SkEPTuZByprZR10zCW%2BItOQuRVjylRXia3c4zFDMmVdXCvxub9ztP6Sr66T1CDGHuYs%2Bxj2gZAEfuTG7L0SePuFHD52zr3ucNtGcSYwmy0bnLHM%2BzzkH5bqXV%2B1sTGbzUaCqFGjwzW%2BEilkGlI6xmfRYtSoUWONiAEaegSiK6UHOiD6t19u0QDukmhoeFZ%2B4wEjBgxo0nfT7IZfI0wmv6yL%2FukJAI%2F7h4teNJtmjvsfX%2BG225o5dhMAAAAASUVORK5CYII%3D" alt="Slack"></a>
  <a href="https://docs.ntfy.sh"><img src="https://img.shields.io/badge/ntfy-317F6F?style=for-the-badge&logo=ntfy&logoColor=white" alt="ntfy"></a>
  <a href="https://docs.joinmastodon.org/api/"><img src="https://img.shields.io/badge/Mastodon-6364FF?style=for-the-badge&logo=mastodon&logoColor=white" alt="Mastodon"></a>
  <a href="https://docs.bsky.app"><img src="https://img.shields.io/badge/Bluesky-0285FF?style=for-the-badge&logo=bluesky&logoColor=white" alt="Bluesky"></a>
  <a href="https://www.standardwebhooks.com"><img src="https://img.shields.io/badge/Any%20webhook-020420?style=for-the-badge&logoColor=white" alt="Any webhook"></a>
</p>

<p align="center">
  <em>They want to be talked to in seven different ways. You write one.</em>
</p>

<p align="center">
  <a href="https://npmjs.com/package/nuxt-pigeon"><img src="https://img.shields.io/npm/v/nuxt-pigeon/latest.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm version"></a>
  <a href="https://npm.chart.dev/nuxt-pigeon"><img src="https://img.shields.io/npm/dm/nuxt-pigeon.svg?style=flat&colorA=020420&colorB=00DC82" alt="npm downloads"></a>
  <a href="https://npmjs.com/package/nuxt-pigeon"><img src="https://img.shields.io/npm/l/nuxt-pigeon.svg?style=flat&colorA=020420&colorB=00DC82" alt="License"></a>
  <a href="https://nuxt.com"><img src="https://img.shields.io/badge/Nuxt-020420?logo=nuxt" alt="Nuxt"></a>
</p>

```ts
// server/api/contact.post.ts
await telegram.send('New contact request from Flo')
```

That is the whole setup. No client to construct, no token to pass around, no import to write.

## What you get

**Four verbs, seven services.** `send`, `listen`, `edit`, `delete`. They look the same everywhere, even though one service wants multipart, the next wants an upload first, and the third wants a blob reference.

**Receiving does not care how.** Telegram delivers by webhook, Bluesky has to be polled, Slack has a three second deadline to answer. You write one handler and get the same shape back.

**What arrives in the frontend, arrives.** One composable, no polling loop of your own.

**Nothing is swallowed.** Every send hands back the service's own answer, body and headers included. Where a service cannot do something, you get a sentence that says why, not silence.

## Setup

```bash
npx nuxt module add nuxt-pigeon
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-pigeon'],
  nuxtPigeon: {
    channels: {
      telegram: { receive: true },
      discord: true,
    },
  },
})
```

```bash
# .env
PIGEON_TELEGRAM_BOT_TOKEN=123456:ABC…
PIGEON_TELEGRAM_CHAT_ID=987654321
PIGEON_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/…
```

Secrets live in `.env`, never in `nuxt.config.ts`. Every value can also be set in the config if it is not a secret, and every call can override it.

## Sending

Each channel is auto imported on the server. No `import`, no setup.

```ts
// server/api/deploy.post.ts
export default defineEventHandler(async () => {
  await discord.send('Deploy failed on `main`', {
    embeds: [{ title: 'Build #42', color: 0xd4262a }],
    media: [{ url: 'https://example.com/log.png', alt: 'The failing step' }],
  })
})
```

Everything the service accepts is reachable. Discord embeds, Slack blocks, Telegram keyboards, ntfy priorities and actions, Mastodon content warnings, Bluesky link cards. We add the parts that are easy to get wrong: character limits counted the way the service counts them, escaping, byte offsets, media fetched and uploaded for the services that take no url.

### Images

The same option everywhere, either a url or bytes:

```ts
await mastodon.post('Release 1.0', { media: [{ url: 'https://…/shot.png', alt: 'The new panel' }] })
await telegram.send('Look', { media: [{ data: pngBytes, filename: 'shot.png' }] })
```

Underneath these are four different mechanisms. Telegram is handed the url and fetches it itself, Discord gets multipart, Mastodon uploads first and waits for processing, Bluesky wants raw bytes, Slack needs three requests. You do not have to know that.

### Changing and removing

Sending returns a handle. Pass it back:

```ts
const msg = await discord.send('Deploy running…')
await discord.edit(msg, 'Deploy finished')
await discord.delete(msg)
```

The handle is a small plain object (`id`, and whatever else the service needs), so you can store it in your database and rebuild it tomorrow.

## Receiving

Register once at startup, from a Nitro plugin:

```ts
// server/plugins/pigeon.ts
export default defineNitroPlugin((nitro) => {
  const stop = telegram.listen(async (update) => {
    if (update.message?.text === '/status') {
      await telegram.send('running', { chatId: update.message.chat.id })
    }
  })

  nitro.hooks.hook('close', stop)
})
```

The route, the signature check and the transport are handled. Telegram verifies its secret token, Slack its signing secret and answers the challenge within its deadline, Mastodon and Bluesky are polled by a hot reload safe poller.

Your handler gets the service's own payload, fully typed and with nothing removed.

### In the browser

```vue
<script setup>
const { messages, connected } = usePigeon()
</script>

<template>
  <p v-for="m in messages" :key="m.at">{{ m.channel }}: {{ m.text }}</p>
</template>
```

A server sent event stream, one connection, closed automatically when the component goes away. Normalised fields (`text`, `from`, `conversation`) sit next to the untouched `raw` and `body`.

## What each channel can do

| | send | media | edit | delete | receive |
|---|---|---|---|---|---|
| Telegram | ✅ | ✅ | ✅ | ✅ | ✅ webhook |
| Discord | ✅ | ✅ | ✅ | ✅ | — |
| Slack | ✅ | ✅ ¹ | ✅ ¹ | ✅ ¹ | ✅ Events API |
| ntfy | ✅ | ✅ | ✅ ² | ✅ ² | — |
| Mastodon | ✅ | ✅ | ✅ | ✅ | ✅ polling |
| Bluesky | ✅ | ✅ | ❌ ³ | ✅ | ✅ polling |
| Webhook | ✅ | — | — ⁴ | — ⁴ | ✅ route |

¹ needs a bot token. With only an incoming webhook Slack answers `ok` and no message id, so there is nothing to point at afterwards.
² needs an ntfy server of 2.16.0 or newer.
³ Bluesky has no post editing. `putRecord` answers with a 200 and the appview ignores the change, so an edit would look like it worked and do nothing. It is not offered rather than offered and broken.
⁴ you decide what the receiver is, so `send` carries `method` and `url` and a `PATCH` or `DELETE` is one call.

Where a channel cannot do something, the method is missing from its type, so you find out while typing rather than in production. Calling it anyway gets a sentence naming the reason.

## Generic webhooks

Point it at anything and it sends what you give it, adding nothing:

```ts
nuxtPigeon: {
  webhook: {
    endpoints: {
      n8n: { headers: { 'X-Source': 'nuxt' } },   // url from PIGEON_WEBHOOK_N8N_URL
    },
  },
}
```

```ts
await webhook.send({ event: 'deploy', ok: true }, { to: 'n8n' })
```

With a secret it signs to [Standard Webhooks](https://www.standardwebhooks.com), so the other side can verify with an existing library instead of reading our docs. Incoming requests are verified the same way.

## Reliability

Retry with growing delays for 5xx, `Retry-After` respected where the service sends one, and read from the body where a service puts it there instead (Telegram does). Network errors are **not** retried by default: without an answer there is no way to know whether the message already arrived, and sending it twice is worse than not knowing.

Errors never carry a token. For Discord and Slack the url itself is the credential, so errors name the target instead of the address.

## Things that will cost you an hour if nobody tells you

- **Mentions are written differently everywhere.** Discord `@here`, Slack `<!here>`. A `@here` copied from Discord into Slack sits there as dead text and notifies nobody, without an error.
- **Telegram lowers its own limit with an image.** 4096 characters for text, 1024 for a caption. The same string can fit before an edit and be too long after one.
- **Bluesky counts graphemes and bytes.** 300 and 3000, and neither is `String.length`. A blob is limited to about 1 MB, which a normal screenshot exceeds.
- **Discord drops attachments on an edit** that does not name them. We send them again unless you say `media: []`.
- **Server sent events do not arrive through a Cloudflare quick tunnel.** The connection opens and stays empty, which looks exactly like a broken server. Use the tunnel for the incoming side and open the page on `localhost`.

## Nuxt compatibility

Nuxt 4, Node 22 or newer. The server side runs on Nitro, the composable is the only part in the browser.

## Contributing

```bash
pnpm install
pnpm dev            # the playground, with every channel to click through
pnpm test           # vitest, no network
pnpm test:types
pnpm lint
```

## License

[MIT](./LICENSE)
