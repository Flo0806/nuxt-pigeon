<script setup lang="ts">
import { DEFAULT_RETRIES, DEFAULT_RETRY_DELAY_MS } from '../../src/runtime/server/core/request'

/**
 * The only card that sends nothing to anyone. It shows what sits **between** your call
 * and the service, and it shows it as a measurement rather than a claim: pick a status,
 * press, and the elapsed time is the proof.
 *
 * No channel, so no icon and no status dot. Same shell, deliberately quieter.
 */

const status = ref(500)
const retries = ref(DEFAULT_RETRIES)
const retryDelayMs = ref(DEFAULT_RETRY_DELAY_MS)
const pending = ref(false)
const result = ref<{
  ok: boolean
  status: number | null
  elapsedMs: number
  error?: string
} | null>(null)

/** Worth retrying at all. Anything else in the 4xx range is the caller's own fault. */
const RETRIABLE = [408, 409, 425, 429]

/** Predicted before the run, so the measurement has something to be checked against. */
const expected = computed(() => {
  if (status.value < 400) return { attempts: 1, waits: [] as number[] }
  if (!RETRIABLE.includes(status.value) && status.value < 500) {
    return { attempts: 1, waits: [] as number[] }
  }

  return {
    attempts: retries.value + 1,
    waits: Array.from({ length: retries.value }, (_, i) => retryDelayMs.value * 2 ** i),
  }
})

const expectedMs = computed(() => expected.value.waits.reduce((sum, ms) => sum + ms, 0))

/** Network time is on top of the waiting, so only the lower bound can be predicted. */
const closeEnough = computed(
  () => result.value !== null && result.value.elapsedMs >= expectedMs.value,
)

async function probe() {
  pending.value = true
  result.value = null

  result.value = await $fetch('/api/probe', {
    method: 'POST',
    body: { status: status.value, retries: retries.value, retryDelayMs: retryDelayMs.value },
  })

  pending.value = false
}
</script>

<template>
  <section class="card">
    <header>
      <div>
        <h2>Retries</h2>
        <p class="hint">
          What sits between your call and the service. Every card above sends through this.
        </p>
      </div>
    </header>

    <form @submit.prevent="probe">
      <div class="two">
        <label>
          The service answers with
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
          Base delay
          <select v-model.number="retryDelayMs">
            <option :value="200">200ms</option>
            <option :value="500">500ms, the default</option>
            <option :value="1000">1000ms</option>
          </select>
        </label>
      </div>

      <p class="hint">
        <strong>{{ expected.attempts }}</strong>
        {{ expected.attempts === 1 ? 'attempt' : 'attempts'
        }}<template v-if="expectedMs">
          , waiting {{ expected.waits.join(' + ') }} = <strong>{{ expectedMs }}ms</strong> in
          between</template
        ><template v-else>, no waiting</template>. The waits double, so a service that is briefly
        overloaded is not hammered while it recovers.
      </p>

      <button type="submit" :disabled="pending">
        {{ pending ? 'Running…' : 'Run it' }}
      </button>
    </form>

    <div v-if="result" class="zone linked">
      <p class="label">Measured</p>

      <p :class="result.ok ? 'ok' : 'fail'">
        {{ result.ok ? `Answered ${result.status}` : `Gave up after ${result.status}` }} in
        <strong>{{ result.elapsedMs }}ms</strong>
      </p>

      <p class="hint">
        <template v-if="closeEnough">
          At or above the {{ expectedMs }}ms predicted, and the rest is the network. Nothing counts
          the attempts inside the transport, the clock does it from outside.
        </template>
        <template v-else>
          Faster than the {{ expectedMs }}ms predicted, so it did not wait as often as expected.
        </template>
      </p>

      <pre v-if="result.error">{{ result.error }}</pre>
    </div>

    <details class="zone">
      <summary>The three rules this follows</summary>

      <div class="zone-body">
        <p class="hint">
          <strong>Not every failure is worth repeating.</strong> A 500 or a 429 is a bad moment, a
          404 is a bad url. Trying the second one again only wastes time, so the status decides.
        </p>

        <p class="hint">
          <strong>What the service asks for beats what we would pick.</strong> A
          <code>Retry-After</code> header wins over the doubling above. Telegram puts the same
          number in the body instead of the header, so a channel can hand its own reading down
          without the transport knowing anything about Telegram.
        </p>

        <p class="hint">
          <strong>No answer at all means no retry.</strong> This is the one worth knowing: when a
          request never comes back, we cannot tell whether it arrived. Sending again could deliver
          the message twice, and a duplicate notification is worse than a missing one. So a network
          error is reported rather than repeated, and <code>retryOnNetworkError</code> turns that
          off for anyone who disagrees.
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
</style>
