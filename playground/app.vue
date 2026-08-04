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

pre {
  padding: 0.75rem;
  background: #f4f4f5;
  white-space: pre-wrap;
}
</style>
