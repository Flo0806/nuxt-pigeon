import { defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-pigeon',
    configKey: 'nuxtPigeon',
  },
  defaults: {},
  setup() {},
})
