<script setup lang="ts">
/**
 * The generic webhook, and the only card with **both directions** in it. The seven
 * others each show one service. This one shows the promise: point it anywhere, and let
 * anything point at you.
 *
 * Nothing is added to what you send. The body is yours, the only header set on its own
 * is `Content-Type`, and a secret turns on Standard Webhooks signing so a receiver can
 * verify with a library instead of reading our docs.
 */

const { data: info } = await useFetch('/api/webhook-info')

// --- sending ---------------------------------------------------------------

const mode = ref<'endpoint' | 'url'>('endpoint')
const to = ref('chat')
const url = ref('https://httpbingo.org/post')
const kind = ref<'json' | 'text' | 'form'>('json')
const text = ref('Deploy failed')
const secret = ref('')
const pending = ref(false)
const error = ref('')

const mirrored = ref<{
  headers?: Record<string, string[]>
  json?: unknown
  form?: Record<string, unknown>
  data?: string
} | null>(null)

/** Only what we are responsible for. The rest comes from fetch and whatever CDN. */
const ours = computed(() => {
  const headers = mirrored.value?.headers ?? {}
  const keep = ['Content-Type', 'Webhook-Id', 'Webhook-Timestamp', 'Webhook-Signature']

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => keep.includes(key))
      .map(([key, value]) => [key, value[0]]),
  )
})

/** httpbingo fills json, form and data, and leaves the unused ones empty. */
const arrived = computed(() => {
  const body = mirrored.value
  if (!body) return null
  if (body.json !== null && body.json !== undefined) return body.json
  if (body.form && Object.keys(body.form).length) return body.form

  return body.data
})

async function send() {
  pending.value = true
  error.value = ''
  mirrored.value = null

  // Two routes on purpose: one goes through the configured endpoints, the other
  // straight at a url with nothing configured at all.
  const answer =
    mode.value === 'endpoint'
      ? await $fetch('/api/send', { method: 'POST', body: { to: to.value, text: text.value } })
      : await $fetch('/api/post', {
          method: 'POST',
          body: { kind: kind.value, text: text.value, secret: secret.value, url: url.value },
        })

  pending.value = false

  if (!answer.ok) {
    error.value = answer.error
    return
  }

  mirrored.value = answer.mirrored ?? null
}

// --- receiving -------------------------------------------------------------

const selfText = ref('to myself')
const selfSecret = ref('')
const selfPending = ref(false)
const selfError = ref('')

/** Sends to our own route, so the way out and back in is one click. */
async function selfSend() {
  selfPending.value = true
  selfError.value = ''

  const answer = await $fetch('/api/self-send', {
    method: 'POST',
    body: { text: selfText.value, secret: selfSecret.value },
  })

  selfPending.value = false
  if (!answer.ok) selfError.value = answer.error ?? ''
}

const { messages, connected } = usePigeon({ channel: 'webhook', limit: 20 })

const endpoint = computed(() => `${info.value?.origin ?? ''}${info.value?.route ?? ''}`)
const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(endpoint.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <ChannelCard
    name="Webhook"
    color="#0a0d33"
    icon="webhook.svg"
    hint="Both directions. Send to anything, and let anything send to you. Nothing is added to your payload."
  >
    <template #status>
      <span class="dot" :class="info?.endpoints.length ? 'on' : 'off'" />
      <span class="hint">{{ info?.endpoints.length ?? 0 }} endpoint(s)</span>
    </template>

    <!-- Sending ------------------------------------------------------------ -->

    <form @submit.prevent="send">
      <div class="tabs">
        <button type="button" :class="{ active: mode === 'endpoint' }" @click="mode = 'endpoint'">
          A configured endpoint
        </button>
        <button type="button" :class="{ active: mode === 'url' }" @click="mode = 'url'">
          Straight at a url
        </button>
      </div>

      <template v-if="mode === 'endpoint'">
        <label>
          Endpoint
          <select v-model="to">
            <option v-for="one in info?.endpoints ?? []" :key="one.name" :value="one.name">
              {{ one.name }}{{ one.url ? '' : ', url from the environment'
              }}{{ one.secret ? ', signed' : '' }}
            </option>
          </select>
        </label>

        <p class="hint">
          Named in <code>nuxt.config</code>, so nothing but the payload is passed at the call site.
          A name that has no url of its own falls back to the default one, and a wrong name is an
          error that lists the ones that exist.
        </p>
      </template>

      <template v-else>
        <label>
          Url
          <input v-model="url" placeholder="https://httpbingo.org/post" />
        </label>

        <div class="two">
          <label>
            Body
            <select v-model="kind">
              <option value="json">json object</option>
              <option value="text">plain text</option>
              <option value="form">form encoded</option>
            </select>
          </label>

          <label>
            Secret
            <input v-model="secret" placeholder="empty sends unsigned" />
          </label>
        </div>

        <p class="hint">
          The body type is decided here, not guessed: a string goes out as
          <code>text/plain</code>, because calling it json would be a lie. A secret adds
          <strong>Standard Webhooks</strong> headers, so the receiver can verify with an existing
          library.
        </p>
      </template>

      <label>
        Text
        <input v-model="text" />
      </label>

      <button type="submit" :disabled="pending || !text.trim()">
        {{ pending ? 'Sending…' : 'Send' }}
      </button>
    </form>

    <p v-if="error" class="fail">{{ error }}</p>

    <!-- The mirror --------------------------------------------------------- -->

    <div v-if="mirrored" class="zone linked">
      <p class="label">What actually arrived</p>

      <p class="hint">
        httpbingo mirrors the request back, so this is the real thing and not our own description of
        it.
      </p>

      <p class="hint">Headers we are responsible for:</p>
      <pre>{{ JSON.stringify(ours, null, 2) }}</pre>

      <p class="hint">Body:</p>
      <pre>{{ JSON.stringify(arrived, null, 2) }}</pre>
    </div>

    <!-- Receiving ---------------------------------------------------------- -->

    <details class="zone" open>
      <summary>
        Receiving
        <span class="dot" :class="connected ? 'on' : 'off'" />
        <span class="mono lower">{{ connected ? 'stream open' : 'no stream' }}</span>
      </summary>

      <div class="zone-body">
        <p class="hint">
          Your endpoint. Paste it into GitHub, Stripe, n8n or anything else that offers a webhook.
          From the outside it needs a public address, so a tunnel in development.
        </p>

        <div class="row">
          <input class="mono" :value="endpoint" readonly />
          <button type="button" class="ghost" @click="copy">
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
        </div>

        <p class="hint">
          There is <strong>no format</strong> to agree on here, which is the whole point: the body
          arrives untouched, together with every header. What one service calls an event type and
          another calls an action stays where it was, and you decide what it means.
        </p>

        <form class="self" @submit.prevent="selfSend">
          <label>
            Send to yourself
            <input v-model="selfText" />
          </label>

          <label>
            Secret, only to watch the signature headers arrive
            <input v-model="selfSecret" placeholder="empty sends unsigned" />
          </label>

          <button type="submit" :disabled="selfPending">
            {{ selfPending ? 'Sending…' : 'Send to my own endpoint' }}
          </button>
        </form>

        <p v-if="selfError" class="fail">{{ selfError }}</p>

        <p class="hint">
          No tunnel needed for that one: it goes out to your own route and comes back in through the
          same door a stranger would use, signature and all.
        </p>

        <MessageFeed
          :messages="messages"
          empty="Nothing yet. Press the button above, or point a service at the address."
        />
      </div>
    </details>
  </ChannelCard>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.2rem;
  border-radius: var(--radius-sm);
  background: var(--bg);
}

.tabs button {
  flex: 1;
  padding: 0.35rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font-size: 0.85rem;
}

.tabs button.active {
  border-color: var(--line);
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
}

.two {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.two > label {
  flex: 1 1 12rem;
}

.row input {
  flex: 1;
}

.self {
  padding-top: 0.4rem;
  border-top: 1px solid var(--line);
}

.lower {
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

pre {
  max-height: 14rem;
  overflow: auto;
}
</style>
