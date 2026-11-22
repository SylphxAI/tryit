import sitemap from '@/lib/seo/sitemap'

function xml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

export function GET() {
	const urls = sitemap().map(({ url, alternates, changeFrequency, priority }) => {
		const links = Object.entries(alternates?.languages ?? {}).flatMap(([locale, target]) =>
			typeof target === 'string'
				? [`<xhtml:link rel="alternate" hreflang="${xml(locale)}" href="${xml(target)}" />`]
				: [],
		)
		return [
			'<url>',
			`<loc>${xml(url)}</loc>`,
			...links,
			`<changefreq>${changeFrequency}</changefreq>`,
			`<priority>${priority}</priority>`,
			'</url>',
		].join('\n')
	})
	return new Response(
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
			...urls,
			'</urlset>',
			'',
		].join('\n'),
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': 'public, max-age=3600',
			},
		},
	)
}
