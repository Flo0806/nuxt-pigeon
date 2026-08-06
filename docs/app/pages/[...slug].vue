<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

const route = useRoute()

const { data: page } = await useAsyncData(`page-${route.path}`, () =>
  queryCollection('docs').path(route.path).first(),
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const { data: surround } = await useAsyncData(`surround-${route.path}`, () =>
  queryCollectionItemSurroundings('docs', route.path, { fields: ['description'] }),
)

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

/** The landing page is not a docs page: no sidebar, no table of contents. */
const framed = computed(() => page.value?.navigation !== false)

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
  ogTitle: page.value.title,
  ogDescription: page.value.description,
})
</script>

<template>
  <UContainer v-if="page">
    <UPage>
      <template v-if="framed" #left>
        <UPageAside>
          <UContentNavigation :navigation="navigation" highlight />
        </UPageAside>
      </template>

      <UPageHeader :title="page.title" :description="page.description" />

      <UPageBody>
        <ContentRenderer :value="page" />

        <template v-if="framed && surround?.length">
          <USeparator />
          <UContentSurround :surround="surround" />
        </template>
      </UPageBody>

      <template v-if="framed && page.body?.toc?.links?.length" #right>
        <UContentToc :links="page.body.toc.links" highlight />
      </template>
    </UPage>
  </UContainer>
</template>
