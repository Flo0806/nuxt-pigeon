/**
 * Everything is public documentation, so everything may be indexed. The only thing
 * worth saying is where the map is.
 */
export default defineEventHandler((event) => {
  const site = useRuntimeConfig().public.siteUrl

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')

  return ['User-agent: *', 'Allow: /', '', `Sitemap: ${site}/sitemap.xml`, ''].join('\n')
})
