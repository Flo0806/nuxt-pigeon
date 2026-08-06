---
title: 'nuxt-pigeon'
description: 'Send and receive messages in Nuxt, whether the service speaks webhooks, polling or streams.'
navigation: false
---

:hero-logo

Seven services want to be talked to in seven different ways. You write one.

```ts [server/api/deploy.post.ts]
await telegram.send('Deploy failed on main')
```

No client to construct, no token to pass around, no import to write. The channels are
auto imported on the server, they read their credentials from `.env`, and that is the
whole setup.

::card-group
  :::card{title="Get started in five minutes" to="/getting-started/installation" icon="i-lucide-rocket"}
  Install it, paste one line, watch the message arrive on your phone.
  :::

  :::card{title="Receiving in development" to="/receiving/tunnel" icon="i-lucide-cable"}
  Why `localhost` cannot be reached from outside, and the one flag that fixes it.
  :::
::
