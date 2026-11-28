import { expect, test } from 'bun:test'
import { buildCatalogPage } from '@/features/catalog/solid/catalog-data'
import { homeDocument } from '@/features/marketing/solid/home-data'
import type { Locale } from '@/lib/i18n/config'

// Five is featured on this product day independently of the test runner's clock.
const featuredDay = new Date('2026-11-26T19:00:00Z')
const origin = 'https://tryit.fun'
const offers = {
	'zh-HK': '英文詞語 • 5 個字母 • 6 次機會',
	es: 'Palabras en inglés • 6 intentos',
	'pt-BR': 'Palavras em inglês • 6 tentativas',
	'en-US': '5 letters • 6 tries',
	'en-GB': '5 letters • 6 tries', // Falls back to the US English game catalogue.
} satisfies Partial<Record<Locale, string>>

for (const [locale, tagline] of Object.entries(offers) as [keyof typeof offers, string][]) {
	test(`Five's ${locale} offer copy reaches featured Home and the catalog`, () => {
		const { featured } = homeDocument(locale, origin, featuredDay)
		expect(featured).toMatchObject({ slug: 'word-guess', tagline })

		const { entries } = buildCatalogPage(locale, origin, featuredDay)
		const five = entries.find(({ slug }) => slug === 'word-guess')
		const prefix = locale === 'en-US' ? '' : `/${locale}`
		expect(five).toMatchObject({ tagline, href: `${prefix}/games/word-guess` })
	})
}
