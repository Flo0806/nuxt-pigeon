<script setup lang="ts">
/**
 * A url plus a preview of what it actually is, including URL validation.
 */
const url = defineModel<string>({ required: true })
const valid = defineModel<boolean>('valid', { default: true })

defineProps<{ label?: string }>()

const state = ref<'empty' | 'loading' | 'ok' | 'broken'>('empty')

watch(
  url,
  (value) => {
    state.value = value.trim() ? 'loading' : 'empty'
    // Empty is fine, it just means no image. Only a broken one blocks.
    valid.value = !value.trim()
  },
  { immediate: true },
)
</script>

<template>
  <div class="media">
    <label>
      {{ label ?? 'Image url, empty sends text only' }}
      <input v-model="url" placeholder="https://…/something.png" />
    </label>

    <div v-if="state !== 'empty'" class="preview" :class="state">
      <img
        :src="url"
        alt=""
        @load="((state = 'ok'), (valid = true))"
        @error="((state = 'broken'), (valid = false))"
      />

      <p v-if="state === 'loading'" class="hint">Loading…</p>
      <p v-else-if="state === 'broken'" class="fail">
        Nothing loads from this url. Sending is blocked until it does.
      </p>
      <p v-else class="ok">Reachable, this is what the channel will fetch.</p>
    </div>
  </div>
</template>

<style scoped>
.media {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.preview {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg);
}

.preview.broken {
  border-color: var(--fail);
}

.preview.ok {
  border-color: var(--green);
}

img {
  width: 3.5rem;
  height: 3.5rem;
  flex: none;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--line);
}

/* A broken image would otherwise show the browser's own placeholder icon. */
.preview.broken img,
.preview.loading img {
  visibility: hidden;
}

p {
  margin: 0;
  font-size: 0.8rem;
}
</style>
