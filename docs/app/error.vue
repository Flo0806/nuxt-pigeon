<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

/**
 * Its own shell: the layout in `app.vue` is not mounted while an error renders.
 *
 * Deliberately without any data fetching. An error page that has to await something
 * can fail while failing, and then Nuxt falls back to its built in one, which is what
 * happened here the first time.
 */
const missing = computed(() => props.error?.statusCode === 404)

const sections = [
  { label: 'Installation', to: '/getting-started/installation', icon: 'i-lucide-rocket' },
  { label: 'Sending', to: '/sending/text', icon: 'i-lucide-send' },
  { label: 'Receiving', to: '/receiving/how-it-works', icon: 'i-lucide-inbox' },
  { label: 'Channels', to: '/channels/telegram', icon: 'i-lucide-radio' },
  { label: 'Reliability', to: '/reliability/retries', icon: 'i-lucide-shield-check' },
]

useHead({ title: missing.value ? 'Page not found' : 'Something broke' })
</script>

<template>
  <UApp>
    <UHeader to="/">
      <template #title>
        <img src="/logo.svg" alt="" class="size-7 shrink-0" />
        <span class="font-semibold">nuxt-pigeon</span>
      </template>
    </UHeader>

    <UMain>
      <UContainer>
        <UPageHeader
          :title="missing ? 'This page does not exist' : 'Something broke'"
          :description="
            missing
              ? 'It may have moved. Here is everything there is.'
              : (error?.message ?? 'No idea what happened, which is the worst kind.')
          "
        />

        <UPageBody>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="section in sections"
              :key="section.to"
              :icon="section.icon"
              :label="section.label"
              :to="section.to"
              color="neutral"
              variant="subtle"
              @click="clearError()"
            />
          </div>
        </UPageBody>
      </UContainer>
    </UMain>
  </UApp>
</template>
