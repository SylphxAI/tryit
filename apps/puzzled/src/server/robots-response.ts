import { robotsDisallowPaths } from '@/lib/seo/routes'
import { getServerBaseUrl } from '@/lib/utils'

/**
 * `/robots.txt` — crawl rules for the routes the app actually serves.
 *
 * The disallow list is generated from `lib/seo/routes.ts` (the same table the
 * sitemap is built from), so "crawlable" and "listed" cannot drift apart: no
 * private surface is ever advertised, and no public surface is ever blocked.
 * Every HTML route on the private list also sets `robots: noindex` itself —
 * the block stops the crawl, the meta tag stops the *URL* from being indexed
 * without content when it is discovered through a link.
 */
export function GET(): Response {
	const document = [
		'User-Agent: *',
		'Allow: /',
		...robotsDisallowPaths().map((path) => `Disallow: ${path}`),
		'',
		`Sitemap: ${getServerBaseUrl()}/sitemap.xml`,
		'',
	].join('\n')
	return new Response(document, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=0, must-revalidate',
		},
	})
}
