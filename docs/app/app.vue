<script setup lang="ts">
/**
 * The shell. Navigation and search both come from the same content tree, so a page
 * that exists is always findable and a page that does not never shows up in a menu.
 */
const { data: navigation } = await useAsyncData('navigation', () =>
  queryCollectionNavigation('docs'),
)

const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
  server: false,
})

// Fetched once here, read by every page. Two fetches would mean two trees.
provide('navigation', navigation)

useHead({
  titleTemplate: (title) => (title ? `${title} · nuxt-pigeon` : 'nuxt-pigeon'),
  htmlAttrs: { lang: 'en' },
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
})

useSeoMeta({
  ogSiteName: 'nuxt-pigeon',
  description:
    'Send and receive messages in Nuxt, whether the service speaks webhooks, polling or streams.',
})
</script>

<template>
  <UApp>
    <UHeader to="/">
      <template #title>
        <img src="/logo.svg" alt="" class="size-7 shrink-0" >
        <span class="font-semibold">nuxt-pigeon</span>
      </template>

      <template #right>
        <UContentSearchButton />
        <UColorModeButton />
        <UButton
          icon="i-simple-icons-github"
          color="neutral"
          variant="ghost"
          to="https://github.com/Flo0806/nuxt-pigeon"
          target="_blank"
          aria-label="GitHub"
        />
      </template>

      <!-- Small screens: the same tree, in the slideover behind the burger. The
           header grows the button on its own as soon as this slot has content. -->
      <template #body>
        <UContentNavigation :navigation="navigation" highlight />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <ClientOnly>
      <LazyUContentSearch :files="files" :navigation="navigation" />
    </ClientOnly>
  </UApp>
</template>
