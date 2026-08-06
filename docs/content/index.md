---
title: 'nuxt-pigeon'
description: 'Nuxt module to send and receive messages across Telegram, Discord, Slack, ntfy, Mastodon, Bluesky and any webhook. One API, whatever the service speaks.'
navigation: false
---

:hero-logo

Seven services want to be talked to in seven different ways. You write one.

```ts [server/api/deploy.post.ts]
await telegram.send('Deploy failed on main')
```

No client to construct, no token to pass around, no import to write. Channels are auto
imported on the server, they read their credentials from `.env`, and that is the whole
setup.

::card-group
:::card{title="Get started in five minutes" to="/getting-started/installation" icon="i-lucide-rocket"}
Install it, paste one line, watch the message arrive on your phone.
:::

:::card{title="Receiving in development" to="/receiving/tunnel" icon="i-lucide-cable"}
Why `localhost` cannot be reached from outside, and the one flag that fixes it.
:::
::

## What each channel can do

|                                  | send | media | edit | delete | receive       |
| -------------------------------- | ---- | ----- | ---- | ------ | ------------- |
| [Telegram](/channels/telegram)   | ✅   | ✅    | ✅   | ✅     | ✅ webhook    |
| [Discord](/channels/discord)     | ✅   | ✅    | ✅   | ✅     | —             |
| [Slack](/channels/slack)         | ✅   | ✅ ¹  | ✅ ¹ | ✅ ¹   | ✅ Events API |
| [ntfy](/channels/ntfy)           | ✅   | ✅    | ✅ ² | ✅ ²   | —             |
| [Mastodon](/channels/mastodon)   | ✅   | ✅    | ✅   | ✅     | ✅ polling    |
| [Bluesky](/channels/bluesky)     | ✅   | ✅    | ❌ ³ | ✅     | ✅ polling    |
| [Any webhook](/channels/webhook) | ✅   | —     | — ⁴  | — ⁴    | ✅ route      |

¹ needs a bot token. An incoming webhook answers `ok` and no message id, so there is
nothing to point at afterwards.
² needs an ntfy server of 2.16.0 or newer.
³ Bluesky has no post editing. `putRecord` answers `200` and the appview ignores the
change, so an edit would look like it worked and do nothing. It is not offered rather
than offered and broken.
⁴ you decide what the receiver is, so `send` carries `method` and `url` and a `PATCH` or
`DELETE` is one call.

**Where a channel cannot do something, the method is missing from its type**, so you
find out while typing rather than in production. Calling it anyway gets a sentence
naming the reason.

## What it takes care of

::card-group
:::card{title="Limits, counted properly" icon="i-lucide-ruler"}
ntfy counts bytes. Bluesky counts graphemes **and** bytes. Mastodon charges a flat 23
for any link and asks your instance for its real limit. All checked before anything
is sent, so you get a number instead of an API error.
:::

:::card{title="Images, four different ways" icon="i-lucide-image"}
Telegram fetches a url itself. Mastodon refuses urls. Slack turns the file into the
message. You pass `{ url }` or `{ data }` and never learn which.
:::

:::card{title="Retries that think" icon="i-lucide-refresh-cw"}
A 500 is retried, a 404 is not. `Retry-After` wins over our own backoff. A request
that never answered is **not** repeated, because a duplicate notification is worse
than a missing one.
:::

:::card{title="Errors you can log" icon="i-lucide-shield"}
For Telegram the token is in the url, for Discord the url **is** the credential. No
error here carries either. The target is named, the address never is.
:::
::

## Receiving, in one line

What arrives on the server shows up in your frontend on its own:

```vue [app/pages/inbox.vue]
<script setup lang="ts">
const { messages } = usePigeon()
</script>

<template>
  <p v-for="message in messages" :key="message.at">{{ message.text }}</p>
</template>
```

Underneath, that is a webhook for Telegram, an Events API route for Slack and a poller
for Bluesky. You never have to know which.

::card-group
:::card{title="How receiving works" to="/receiving/how-it-works" icon="i-lucide-inbox"}
Three transports, one listener, and which channels cannot run on serverless.
:::

:::card{title="Reliability" to="/reliability/retries" icon="i-lucide-shield-check"}
What sits between your call and the service, and the rule that does not retry.
:::
::
