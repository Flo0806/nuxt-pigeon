import { queryCollection } from '@nuxt/content/server'

/**
 * Built from the same collection the navigation and the search read, so a page cannot
 * exist without being listed, and a listed page cannot 404.
 */
export default defineEventHandler(async (event) => {
  const site = useRuntimeConfig().public.siteUrl
  const pages = await queryCollection(event, 'docs').select('path').all()

  const urls = pages
    .map((page) => {
      const loc = `${site}${page.path === '/' ? '' : page.path}`

      return `  <url>\n    <loc>${loc}</loc>\n    <priority>${page.path === '/' ? '1.0' : '0.8'}</priority>\n  </url>`
    })
    .join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
})
