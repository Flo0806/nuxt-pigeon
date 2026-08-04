<script setup lang="ts">
interface Probe {
  ok: boolean
  status: number | null
  elapsedMs: number
  error?: string
}

const status = ref(500)
const retries = ref(2)
const retryDelayMs = ref(500)
const pending = ref(false)
const result = ref<Probe | null>(null)

/** What the transport should do, so the measurement can be checked against it. */
const expected = computed(() => {
  if (status.value < 400) return '1 attempt, no waiting'
  if (![408, 409, 425, 429].includes(status.value) && status.value < 500) {
    return '1 attempt, this status is not worth retrying'
  }

  const waits = Array.from({ length: retries.value }, (_, i) => retryDelayMs.value * 2 ** i)
  const total = waits.reduce((sum, ms) => sum + ms, 0)

  return `${retries.value + 1} attempts, waiting ${waits.join(' + ') || '0'} = ${total}ms`
})

interface Mirror {
  ok: boolean
  mirrored?: {
    headers?: Record<string, string[]>
    json?: unknown
    data?: string
    form?: Record<string, unknown>
    url?: string
  }
  error?: string
}

const kind = ref<'json' | 'text' | 'form'>('json')
const text = ref('Deploy failed')
const secret = ref('')
const url = ref('')
const posting = ref(false)
const mirror = ref<Mirror | null>(null)

/** Only the headers we are responsible for. The rest comes from fetch and the CDN. */
const ours = computed(() => {
  const headers = mirror.value?.mirrored?.headers ?? {}
  const keep = ['Content-Type', 'Webhook-Id', 'Webhook-Timestamp', 'Webhook-Signature']

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => keep.includes(key))
      .map(([k, v]) => [k, v[0]]),
  )
})

/** httpbingo fills json, form and data, and leaves the unused ones empty rather than absent. */
const arrived = computed(() => {
  const m = mirror.value?.mirrored
  if (!m) return null
  if (m.json !== null && m.json !== undefined) return m.json
  if (m.form && Object.keys(m.form).length) return m.form

  return m.data
})

async function send() {
  posting.value = true
  mirror.value = null
  try {
    mirror.value = await $fetch('/api/post', {
      method: 'POST',
      body: { kind: kind.value, text: text.value, secret: secret.value, url: url.value },
    })
  } finally {
    posting.value = false
  }
}

const to = ref('chat')
const configText = ref('Deploy failed')
const sending = ref(false)
const configured = ref<Mirror | null>(null)

async function sendConfigured() {
  sending.value = true
  configured.value = null
  try {
    configured.value = await $fetch('/api/send', {
      method: 'POST',
      body: { to: to.value, text: configText.value },
    })
  } finally {
    sending.value = false
  }
}

/** No polling and no reload button: the messages arrive on their own. */
const { messages: inbox, connected } = usePigeon()

const selfText = ref('an mich selbst')
const selfSecret = ref('')
const selfPending = ref(false)
const selfError = ref('')

/** A GitHub push payload is 20kb, so the page shows the beginning and the size. */
function preview(raw: string) {
  return raw.length > 400 ? `${raw.slice(0, 400)}\n... ${raw.length - 400} more bytes` : raw
}

async function selfSend() {
  selfPending.value = true
  selfError.value = ''
  try {
    const sent = await $fetch('/api/self-send', {
      method: 'POST',
      body: { text: selfText.value, secret: selfSecret.value },
    })
    if (!sent.ok) selfError.value = sent.error ?? ''
  } finally {
    selfPending.value = false
  }
}

interface Sent {
  ok: boolean
  sent?: string
  error?: string
}

const discordText = ref('*Deploy failed* on `main`')
const discordEscape = ref(false)
const discordPending = ref(false)
const discordResult = ref<Sent | null>(null)

async function sendDiscord() {
  discordPending.value = true
  discordResult.value = null
  try {
    discordResult.value = await $fetch('/api/discord', {
      method: 'POST',
      body: { text: discordText.value, escape: discordEscape.value },
    })
  } finally {
    discordPending.value = false
  }
}

const tgText = ref('<b>Deploy failed</b> on main')
const tgParseMode = ref('HTML')
const tgEscape = ref(false)
const tgPending = ref(false)
const tgResult = ref<Sent | null>(null)

async function sendTelegram() {
  tgPending.value = true
  tgResult.value = null
  try {
    tgResult.value = await $fetch('/api/telegram', {
      method: 'POST',
      body: { text: tgText.value, parseMode: tgParseMode.value, escape: tgEscape.value },
    })
  } finally {
    tgPending.value = false
  }
}

interface HookInfo {
  ok: boolean
  info?: { url: string; pending_update_count: number; last_error_message?: string }
  error?: string
}

const baseUrl = ref('')
const hookPending = ref(false)
const hookInfo = ref<HookInfo | null>(null)

async function manageWebhook(action: 'set' | 'delete' | 'info') {
  hookPending.value = true
  try {
    hookInfo.value = await $fetch('/api/telegram-webhook', {
      method: 'POST',
      body: { action, baseUrl: baseUrl.value },
    })
  } finally {
    hookPending.value = false
  }
}

async function probe() {
  pending.value = true
  result.value = null
  try {
    result.value = await $fetch('/api/probe', {
      method: 'POST',
      body: { status: status.value, retries: retries.value, retryDelayMs: retryDelayMs.value },
    })
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main>
    <h1>nuxt-pigeon</h1>
    <h2>Layer 0: transport</h2>
    <p class="hint">
      One request to <code>httpbingo.org</code>. Nothing else exists yet, no channel and no config.
      The elapsed time is the proof: retries cost waiting, and the waits double.
    </p>

    <form @submit.prevent="probe">
      <label>
        Status the service should answer with
        <select v-model.number="status">
          <option :value="200">200, works right away</option>
          <option :value="500">500, broken, worth retrying</option>
          <option :value="429">429, rate limited, worth retrying</option>
          <option :value="404">404, not worth retrying</option>
        </select>
      </label>

      <label>
        Retries
        <select v-model.number="retries">
          <option :value="0">0, off</option>
          <option :value="1">1</option>
          <option :value="2">2, the default</option>
          <option :value="3">3</option>
        </select>
      </label>

      <label>
        Base delay in ms
        <select v-model.number="retryDelayMs">
          <option :value="200">200</option>
          <option :value="500">500, the default</option>
          <option :value="1000">1000</option>
        </select>
      </label>

      <p class="hint">Expected: {{ expected }}</p>

      <button type="submit" :disabled="pending">
        {{ pending ? 'Running...' : 'Send' }}
      </button>
    </form>

    <template v-if="result">
      <p :class="result.ok ? 'ok' : 'fail'">
        {{ result.ok ? `Answered ${result.status}` : `Failed with ${result.status}` }}
        after <strong>{{ result.elapsedMs }}ms</strong>
      </p>
      <pre v-if="result.error">{{ result.error }}</pre>
    </template>
    <section>
      <h2>Layer 1: post</h2>
      <p class="hint">
        One POST to a url. Nothing is added to the payload and only
        <code>Content-Type</code> is set by us. With a secret, three signature headers come along.
        The receiver is <code>httpbingo.org</code>, which mirrors the request back.
      </p>

      <form @submit.prevent="send">
        <fieldset>
          <legend>Payload</legend>
          <label class="inline">
            <input v-model="kind" type="radio" value="json" />
            object
          </label>
          <label class="inline">
            <input v-model="kind" type="radio" value="text" />
            string
          </label>
          <label class="inline">
            <input v-model="kind" type="radio" value="form" />
            URLSearchParams
          </label>
        </fieldset>

        <label>
          Text
          <input v-model="text" />
        </label>

        <label>
          Secret, empty sends unsigned
          <input v-model="secret" placeholder="whsec_... or any passphrase" />
        </label>

        <label>
          Url, empty uses httpbingo
          <input v-model="url" placeholder="https://httpbingo.org/post" />
        </label>

        <button type="submit" :disabled="posting || !text.trim()">
          {{ posting ? 'Sending...' : 'Send' }}
        </button>
      </form>

      <template v-if="mirror">
        <p v-if="!mirror.ok" class="fail">{{ mirror.error }}</p>
        <template v-else>
          <p class="hint">Headers we are responsible for:</p>
          <pre>{{ JSON.stringify(ours, null, 2) }}</pre>
          <p class="hint">What arrived as the body:</p>
          <pre>{{ JSON.stringify(arrived, null, 2) }}</pre>
        </template>
      </template>
    </section>
    <section>
      <h2>Layer 1: webhook.send with config</h2>
      <p class="hint">
        The same <code>post</code>, but the url now comes from <code>nuxt.config</code> and
        <code>.env</code> instead of the form. <code>chat</code> has its url in the config,
        <code>n8n</code> gets it from <code>PIGEON_WEBHOOK_N8N_URL</code> and adds a header of its
        own.
      </p>

      <form @submit.prevent="sendConfigured">
        <label>
          Endpoint
          <select v-model="to">
            <option value="">none, uses PIGEON_WEBHOOK_URL</option>
            <option value="chat">chat, url from nuxt.config</option>
            <option value="n8n">n8n, url from .env plus X-Demo</option>
            <option value="gibtsnicht">gibtsnicht, a typo</option>
          </select>
        </label>

        <label>
          Text
          <input v-model="configText" />
        </label>

        <button type="submit" :disabled="sending">
          {{ sending ? 'Sending...' : 'Send' }}
        </button>
      </form>

      <template v-if="configured">
        <p v-if="!configured.ok" class="fail">{{ configured.error }}</p>
        <template v-else>
          <p class="hint">Where it went and what it carried:</p>
          <pre>{{
            JSON.stringify(
              {
                url: configured.mirrored?.url,
                body: configured.mirrored?.json,
                demoHeader: configured.mirrored?.headers?.['X-Demo']?.[0] ?? null,
              },
              null,
              2,
            )
          }}</pre>
        </template>
      </template>
    </section>
    <section>
      <h2>Layer 3: usePigeon</h2>
      <p class="hint">
        Stream is
        <strong :class="connected ? 'ok' : 'fail'">{{
          connected ? 'connected' : 'not connected'
        }}</strong
        >. Nothing below is fetched: messages arrive on their own, whether they come from the button
        here, from Telegram through the tunnel, or from a second browser tab.
      </p>

      <form @submit.prevent="selfSend">
        <label>
          Text
          <input v-model="selfText" />
        </label>

        <label>
          Secret, only to see the signature headers arrive
          <input v-model="selfSecret" placeholder="empty sends unsigned" />
        </label>

        <button type="submit" :disabled="selfPending">
          {{ selfPending ? 'Sending...' : 'Send to myself' }}
        </button>
      </form>

      <p v-if="selfError" class="fail">{{ selfError }}</p>

      <p v-if="!inbox.length" class="hint">Nothing yet.</p>

      <template v-else>
        <p class="hint">Live, newest first:</p>
        <ul>
          <li v-for="message in inbox" :key="message.at">
            <strong>{{ message.channel }}</strong>
            <span v-if="message.from" class="hint"> from {{ message.from.name }}</span>
            <span class="hint"> - {{ message.at }} - {{ message.raw.length }} bytes</span>
            <!-- Channels that know their shape fill `text`, the generic webhook does not. -->
            <div v-if="message.text" class="quote">{{ message.text }}</div>
            <pre v-else>{{ preview(message.raw) }}</pre>
            <details>
              <summary>headers</summary>
              <pre>{{ JSON.stringify(message.headers, null, 2) }}</pre>
            </details>
          </li>
        </ul>
      </template>
    </section>
    <section>
      <h2>Layer 2: discord</h2>
      <p class="hint">
        The first channel, and it is deliberately thin: 54 lines. It contributes its field names,
        its 2000 character limit and an escaping helper. Retry, timeout, headers and the error that
        never carries the url all come from below.
      </p>

      <form @submit.prevent="sendDiscord">
        <label>
          Text
          <textarea v-model="discordText" rows="3" />
        </label>

        <label class="inline">
          <input v-model="discordEscape" type="checkbox" />
          Run it through <code>escapeMarkdown</code> first
        </label>

        <button type="submit" :disabled="discordPending || !discordText.trim()">
          {{ discordPending ? 'Sending...' : 'Send to Discord' }}
        </button>
      </form>

      <template v-if="discordResult">
        <p :class="discordResult.ok ? 'ok' : 'fail'">
          {{ discordResult.ok ? 'Sent' : discordResult.error }}
        </p>
        <!-- What Discord stored, so escaping is visible rather than claimed. -->
        <pre v-if="discordResult.sent">{{ discordResult.sent }}</pre>
      </template>
    </section>
    <section>
      <h2>Layer 2: telegram, receiving</h2>
      <p class="hint">
        Telegram cannot reach localhost, so this needs <code>--tunnel</code>. Paste the tunnel
        address, register it, then write to your bot. The message appears above in
        <code>usePigeon</code> without a reload, with its text already pulled out.
      </p>

      <form @submit.prevent="manageWebhook('set')">
        <label>
          Public base url
          <input v-model="baseUrl" placeholder="https://something.trycloudflare.com" />
        </label>

        <button type="submit" :disabled="hookPending || !baseUrl.trim()">Register</button>
      </form>

      <button :disabled="hookPending" @click="manageWebhook('info')">
        What does Telegram think is registered
      </button>
      <button :disabled="hookPending" @click="manageWebhook('delete')">Unregister</button>

      <template v-if="hookInfo">
        <p v-if="!hookInfo.ok" class="fail">{{ hookInfo.error }}</p>
        <!-- last_error_message is what Telegram itself saw when it tried to deliver. -->
        <pre v-else>{{ JSON.stringify(hookInfo.info, null, 2) }}</pre>
      </template>
    </section>

    <section>
      <h2>Layer 2: telegram, sending</h2>
      <p class="hint">
        The other shape of a channel: not a webhook. The method sits in the url, so this one talks
        to <code>createRequest</code> directly instead of <code>post</code>. The token sits in the
        url too, which is why its errors are rebuilt rather than passed on.
      </p>

      <form @submit.prevent="sendTelegram">
        <label>
          Text
          <textarea v-model="tgText" rows="3" />
        </label>

        <label>
          Parse mode
          <select v-model="tgParseMode">
            <option value="">none, the text stays literal</option>
            <option value="HTML">HTML</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
        </label>

        <label class="inline">
          <input v-model="tgEscape" type="checkbox" />
          Run it through <code>escapeHtml</code> first
        </label>

        <button type="submit" :disabled="tgPending || !tgText.trim()">
          {{ tgPending ? 'Sending...' : 'Send to Telegram' }}
        </button>
      </form>

      <template v-if="tgResult">
        <p :class="tgResult.ok ? 'ok' : 'fail'">
          {{ tgResult.ok ? 'Sent' : tgResult.error }}
        </p>
        <!-- Telegram echoes the parsed message, so this is what actually arrived. -->
        <pre v-if="tgResult.sent">{{ tgResult.sent }}</pre>
      </template>
    </section>
  </main>
</template>

<style>
main {
  max-width: 34rem;
  margin: 4rem auto;
  font-family: system-ui, sans-serif;
}

h2 {
  font-size: 1rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #666;
}

fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  border: 1px solid #ddd;
  padding: 0.5rem 0.75rem;
}

legend,
label.inline {
  font-size: 0.85rem;
  color: #666;
}

label.inline {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
  color: inherit;
  font-size: 1rem;
}

section {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

input,
select,
button {
  padding: 0.5rem;
  font: inherit;
  font-size: 1rem;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
}

.ok {
  color: #157f3d;
}

.fail {
  color: #b3261e;
}

ul {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.quote {
  margin-top: 0.3rem;
  padding-left: 0.6rem;
  border-left: 2px solid #ddd;
  color: #444;
}

summary {
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
}

pre {
  padding: 0.75rem;
  background: #f4f4f5;
  white-space: pre-wrap;
}
</style>
