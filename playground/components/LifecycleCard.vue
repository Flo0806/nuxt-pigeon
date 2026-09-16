<script setup lang="ts">
/**
 * The card for "I changed the token, now what". Every channel can be handed new
 * credentials while the process keeps running, and the pollers restart on them as if
 * the server had just booted. This shows the state and lets you drive it.
 *
 * No icon and no status dot, like the retry card: this is about the module, not a
 * service.
 */

interface Status {
  running: boolean
  source: 'static' | 'runtime' | 'none'
  configured: boolean
}

type Channel = 'telegram' | 'discord' | 'slack' | 'ntfy' | 'mastodon' | 'bluesky' | 'webhook'

const { data: statuses, refresh } = await useFetch<Record<Channel, Status>>('/api/lifecycle')

/**
 * What each channel takes, the same fields the environment would, camel cased. The
 * textarea is filled from this when the channel changes, so the shape is never a guess.
 * `needed` is what has to be there for the channel to work at all.
 */
const FIELDS: Record<Channel, { needed: string[]; example: Record<string, string> }> = {
  telegram: {
    needed: ['token'],
    example: { token: '8123456789:AAF…', chatId: '123456789', secretToken: '' },
  },
  discord: {
    needed: ['webhookUrl'],
    example: { webhookUrl: 'https://discord.com/api/webhooks/…/…' },
  },
  slack: {
    needed: ['botToken or webhookUrl'],
    example: { botToken: 'xoxb-…', channel: 'C01ABC2DEF', webhookUrl: '', signingSecret: '' },
  },
  ntfy: {
    needed: ['topic'],
    example: { topic: 'pigeon-from-the-database', server: 'https://ntfy.sh', token: '' },
  },
  mastodon: {
    needed: ['instance', 'token'],
    example: { instance: 'https://mastodon.social', token: '…' },
  },
  bluesky: {
    needed: ['identifier', 'password'],
    example: { identifier: 'you.bsky.social', password: 'xxxx-xxxx-xxxx-xxxx', service: '' },
  },
  webhook: {
    needed: [],
    example: { url: 'https://httpbingo.org/post', secret: '' },
  },
}

/** Only the fields with a value, so an empty string does not read as "set to nothing". */
function template(name: Channel) {
  const filled = Object.fromEntries(
    Object.entries(FIELDS[name].example).filter(([, value]) => value !== ''),
  )

  return JSON.stringify(filled, null, 2)
}

const channel = ref<Channel>('ntfy')
const values = ref(template(channel.value))

watch(channel, (name) => {
  values.value = template(name)
})

const needed = computed(() => FIELDS[channel.value].needed)
const optional = computed(() =>
  Object.keys(FIELDS[channel.value].example).filter(
    (field) => !needed.value.some((entry) => entry.includes(field)),
  ),
)
const pending = ref(false)
const result = ref<{ ok: boolean; status?: Status; error?: string } | null>(null)

/** Only these two have something that runs. The rest only send, so nothing restarts. */
const POLLERS: Channel[] = ['mastodon', 'bluesky']

async function act(action: 'configure' | 'reset' | 'restart' | 'stop', target = channel.value) {
  pending.value = true
  result.value = null

  let parsed: Record<string, unknown> | undefined
  if (action === 'configure') {
    try {
      parsed = JSON.parse(values.value)
    } catch {
      result.value = { ok: false, error: 'The values are not valid JSON' }
      pending.value = false
      return
    }
  }

  result.value = await $fetch('/api/lifecycle', {
    method: 'POST',
    body: { channel: target, action, values: parsed },
  })

  await refresh()
  pending.value = false
}

const sourceWord: Record<Status['source'], string> = {
  static: 'config / env',
  runtime: 'configure()',
  none: 'nothing',
}
</script>

<template>
  <section class="card">
    <header>
      <div>
        <h2>Credentials at runtime</h2>
        <p class="hint">
          Change a token without restarting the process. <code>configure()</code> hands new values
          over and restarts what runs on them, <code>restart()</code> keeps the values and drops the
          state, <code>stop()</code> is off. What you see here is <code>status()</code>.
        </p>
      </div>
    </header>

    <div class="zone">
      <p class="label">Right now</p>

      <table>
        <thead>
          <tr>
            <th>channel</th>
            <th>runs on</th>
            <th>can send</th>
            <th>polling</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(status, name) in statuses" :key="name">
            <td>
              <code>{{ name }}</code>
            </td>
            <td>{{ sourceWord[status.source] }}</td>
            <td :class="status.configured ? 'ok' : 'fail'">
              {{ status.configured ? 'yes' : 'no' }}
            </td>
            <td>
              <template v-if="POLLERS.includes(name)">
                <span :class="status.running ? 'ok' : 'fail'">
                  {{ status.running ? 'yes' : 'no' }}
                </span>
              </template>
              <span v-else class="hint">-</span>
            </td>
            <td class="actions">
              <template v-if="POLLERS.includes(name)">
                <button type="button" :disabled="pending" @click="act('restart', name)">
                  restart
                </button>
                <button type="button" :disabled="pending" @click="act('stop', name)">stop</button>
              </template>
              <button
                v-if="status.source === 'runtime'"
                type="button"
                :disabled="pending"
                @click="act('reset', name)"
              >
                back to env
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form @submit.prevent="act('configure')">
      <div class="two">
        <label>
          Channel
          <select v-model="channel">
            <option value="telegram">telegram</option>
            <option value="discord">discord</option>
            <option value="slack">slack</option>
            <option value="ntfy">ntfy</option>
            <option value="mastodon">mastodon</option>
            <option value="bluesky">bluesky</option>
            <option value="webhook">webhook</option>
          </select>
        </label>
      </div>

      <label>
        Values, as your settings page would hand them over
        <textarea v-model="values" rows="4" spellcheck="false" />
      </label>

      <p class="hint">
        <template v-if="needed.length">
          Needs
          <template v-for="(field, index) in needed" :key="field">
            <template v-if="index > 0"> and </template><code>{{ field }}</code></template
          >.
        </template>
        <template v-else>
          Nothing is required, a <code>send</code> can always name its own url.
        </template>
        <template v-if="optional.length">
          Optional:
          <template v-for="(field, index) in optional" :key="field">
            <template v-if="index > 0">, </template><code>{{ field }}</code></template
          >.
        </template>
        A field you leave out keeps, in the default mode, its value from the environment.
      </p>

      <p class="hint">
        In the default mode this replaces what the environment said and warns in the server log,
        because the channel already started once for nothing. Set
        <code>credentials: 'runtime'</code> on the channel in <code>nuxt.config</code> and it waits
        for this call instead.
      </p>

      <button type="submit" :disabled="pending">
        {{ pending ? 'Working…' : 'configure()' }}
      </button>
    </form>

    <div v-if="result" class="zone linked">
      <p class="label">Answer</p>

      <p v-if="result.ok" class="ok">
        {{ channel }} now runs on {{ sourceWord[result.status!.source]
        }}<template v-if="POLLERS.includes(channel)"
          >, polling {{ result.status!.running ? 'on' : 'off' }}</template
        >
      </p>
      <pre v-else>{{ result.error }}</pre>
    </div>

    <details class="zone">
      <summary>What restarts, and what does not</summary>

      <div class="zone-body">
        <p class="hint">
          <strong>Mastodon and Bluesky poll</strong>, so they are stopped and started again with no
          memory of where they were. The first round after that only marks the position, nothing old
          is replayed. Bluesky also forgets its session, it belonged to the old account.
        </p>

        <p class="hint">
          <strong>Telegram and Slack receive on a route</strong> that reads its secret per request,
          so a new <code>secretToken</code> or <code>signingSecret</code> applies to the next
          delivery with nothing to restart. A new Telegram token is a different bot though, and the
          webhook is registered per bot: call <code>telegram.setWebhook()</code> again.
        </p>

        <p class="hint">
          <strong>Nothing survives a process restart.</strong> The values live in memory. Hand them
          over again from a Nitro plugin at startup, from wherever you keep them.
        </p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  padding: 1.25rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

h2 {
  font-size: 1.05rem;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.two {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.two > label {
  flex: 1 1 10rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th {
  padding: 0.25rem 0.5rem 0.25rem 0;
  color: var(--muted);
  font-weight: 500;
  text-align: left;
}

td {
  padding: 0.35rem 0.5rem 0.35rem 0;
  border-top: 1px solid var(--line);
  vertical-align: middle;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
}

.actions button {
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
}

textarea {
  width: 100%;
  font-family: ui-monospace, monospace;
}
</style>
