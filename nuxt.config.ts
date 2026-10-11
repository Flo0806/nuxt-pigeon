export default defineNuxtConfig({
  typescript: {
    tsConfig: { compilerOptions: { paths: { 'nitro/h3': ['../node_modules/h3-v2'] } } },
  },
})
