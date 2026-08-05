<script setup lang="ts">
defineProps<{
  name: string
  /** Brand colour, used for the icon tile. */
  color: string
  /** File under `public/icons`, white on transparent. */
  icon: string
  /** What this channel is, in one line. */
  hint?: string
}>()
</script>

<template>
  <section class="card">
    <header>
      <span class="badge" :style="{ background: color }">
        <img :src="`/icons/${icon}`" :alt="name" />
      </span>

      <div>
        <h2>{{ name }}</h2>
        <p v-if="hint" class="hint">{{ hint }}</p>
      </div>

      <div class="status">
        <slot name="status" />
      </div>
    </header>

    <slot />
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

.badge {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: none;
  border-radius: 10px;
  place-items: center;
}

.badge img {
  width: 1.4rem;
  height: 1.4rem;
}

h2 {
  font-size: 1.05rem;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  font-size: 0.8rem;
}
</style>
