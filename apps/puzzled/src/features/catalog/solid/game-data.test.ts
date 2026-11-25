import { expect, test } from 'bun:test'
import { DAILY_FREE_PICKS } from '@/features/daily/lib/daily-picks'
import { getGameSlugs } from '@/games/registry'
import { gamePath } from '@/lib/game-slug'
import { type Locale, locales } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { buildGamePage, type GamePageData } from './game-data'

const games = getGameSlugs()
const origin = 'https://tryit.fun'
const day = new Date('2026-11-24T00:00:00Z')
const freeCopy: Record<Locale, string> = {
	'en-US': 'no account needed',
	'en-GB': 'no account needed',
	'zh-HK': '唔使開帳戶',
	'zh-TW': '不用帳號',
	'zh-CN': '无需账号',
	ja: 'アカウントなし',
	es: 'sin crear una cuenta',
	'pt-BR': 'sem criar uma conta',
}

function findVideoGame(page: GamePageData) {
	for (const block of page.schema) {
		if ('@graph' in block) return block['@graph']?.find((node) => node['@type'] === 'VideoGame')
	}
}

for (const locale of locales) {
	for (const slug of games) {
		const path = localizedPath(locale, gamePath(slug))
		test(`${path} publishes the complete game and FAQ schemas`, () => {
			const page = buildGamePage(locale, slug, origin, day)
			if (!page) throw new Error('Missing game page')
			const videoGame = findVideoGame(page)
			expect(videoGame).toEqual({
				'@type': 'VideoGame',
				name: page.name,
				description: page.description,
				genre: page.category,
				playMode: 'SinglePlayer',
				publisher: { '@type': 'Organization', name: 'Tryit' },
				url: origin + path,
				inLanguage: locale,
				isAccessibleForFree: true,
				image: page.meta.openGraph.images[0].url,
				offers: {
					'@type': 'Offer',
					price: '0',
					priceCurrency: 'USD',
					availability: 'https://schema.org/InStock',
				},
				gamePlatform: 'Web browser',
				operatingSystem: 'Any',
				applicationCategory: 'Game',
			})
			const image = new URL(page.meta.openGraph.images[0].url)
			expect(image.origin).toBe(origin)
			expect(image.pathname).toBe('/og')
			expect(image.searchParams.get('title')).toBe(page.name)

			expect(page.faq).toHaveLength(3)
			const freeAccess = page.faq[2]
			expect(freeAccess.question).toContain(page.name)
			expect(freeAccess.answer).toContain(page.name)
			expect(freeAccess.answer).toContain(String(DAILY_FREE_PICKS))
			expect(freeAccess.answer).toContain(String(games.length))
			expect(freeAccess.answer).toContain('16:00 UTC')
			expect(freeAccess.answer).toContain(freeCopy[locale])
			const faqPage = page.schema.find((node) => node['@type'] === 'FAQPage')
			expect(faqPage).toEqual({
				'@context': 'https://schema.org',
				'@type': 'FAQPage',
				mainEntity: page.faq.map(({ question, answer }) => ({
					'@type': 'Question',
					name: question,
					acceptedAnswer: { '@type': 'Answer', text: answer },
				})),
			})
			expect(JSON.stringify(page.schema)).not.toMatch(
				/localhost|127\.0\.0\.1|\{(?:game|count|total)\}|freeAccessFaq/i,
			)
		})
	}
}

test('local builds use the same public share image for Open Graph and VideoGame', () => {
	const page = buildGamePage('en-US', 'sudoku', 'http://localhost:3014', day)
	const publicPage = buildGamePage('en-US', 'sudoku', origin, day)
	if (!page || !publicPage) throw new Error('Missing Sudoku page')
	const image = publicPage.meta.openGraph.images[0].url
	expect(page.meta.openGraph.images[0].url).toBe(image)
	const videoGame = findVideoGame(page)
	expect(videoGame).toHaveProperty('image', image)
})
