<script setup lang="ts">
import type { PigeonMessage } from '../../src/runtime/types'

/**
 * What came in on one channel. The readable parts up front, the untouched payload one
 * click away.
 */
defineProps<{ messages: PigeonMessage[]; empty?: string }>()

/** The full stamp is noise in a list, the time of day is what you compare. */
function time(at: string) {
  return at.slice(11, 19)
}
</script>

<template>
  <div class="feed">
    <p v-if="!messages.length" class="hint">
      {{ empty ?? 'Nothing yet. Write to the channel and it shows up here.' }}
    </p>

    <ol v-else>
      <li v-for="message in messages" :key="message.at + message.raw.length">
        <div class="head">
          <span class="mono when">{{ time(message.at) }}</span>
          <span v-if="message.type" class="type">{{ message.type }}</span>
          <span v-if="message.from?.name" class="from">{{ message.from.name }}</span>
        </div>

        <p v-if="message.text" class="text">{{ message.text }}</p>

        <details>
          <summary>Raw payload, {{ message.raw.length }} bytes</summary>
          <pre>{{ message.raw }}</pre>
        </details>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.feed {
  /* Scrolls rather than pushing the page down: it can fill up quickly. */
  max-height: 15rem;
  overflow-y: auto;
  padding: 0.6rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg);
}

ol {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  gap: 0.5rem;
  list-style: none;
}

li {
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--muted);
}

.type {
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  background: var(--green-soft);
  color: var(--green-deep);
  font-family: var(--mono);
}

.from {
  margin-left: auto;
}

.text {
  margin: 0.3rem 0 0;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

details {
  margin-top: 0.4rem;
}

summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 0.75rem;
}

pre {
  max-height: 12rem;
  margin-top: 0.4rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
