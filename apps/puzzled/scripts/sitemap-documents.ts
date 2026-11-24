import { locales } from '../src/lib/i18n/config'
import { localeSitemapPath } from '../src/lib/seo/sitemap-paths'

/** Matches the loc elements in Tryit's own sitemap documents. */
export function sitemapLocs(xml: string): string[] {
	const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) =>
		loc.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => entities[entity]),
	)
}

/** Follow the complete index, rebasing only the expected paths onto the verifier's target. */
export async function readSitemap(request: (path: string) => Promise<Response>) {
	async function read(path: string) {
		const response = await request(path)
		if (response.status !== 200) throw new Error(`${path} answered ${response.status}`)
		return { path, xml: await response.text(), headers: response.headers }
	}

	const index = await read('/sitemap.xml')
	const refs = sitemapLocs(index.xml)
	const paths = locales.map(localeSitemapPath)
	const origin = refs[0] ? new URL(refs[0]).origin : null
	if (
		!origin ||
		!/<sitemapindex\b/.test(index.xml) ||
		refs.length !== paths.length ||
		!paths.every((path) => refs.includes(origin + path))
	) {
		throw new Error('/sitemap.xml must list exactly one same-origin child per locale')
	}
	const children = await Promise.all(paths.map(read))
	const locs = children.flatMap(({ path, xml }) => {
		const urls = sitemapLocs(xml)
		if (!/<urlset\b/.test(xml) || urls.length === 0) {
			throw new Error(`${path} contains no page URLs`)
		}
		return urls
	})
	if (new Set(locs).size !== locs.length) throw new Error('sitemap lists duplicate page URLs')
	return { origin, index, children, locs }
}
