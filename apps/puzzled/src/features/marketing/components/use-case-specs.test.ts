import { describe, expect, test } from 'bun:test'
import { getAllGameMetadata } from '@/games/registry'
import { gamePath } from '@/lib/game-slug'
import { defaultLocale, locales } from '@/lib/i18n/config'
import { PUBLIC_ROUTES } from '@/lib/seo/routes'
import { buildLocaleSitemap } from '@/lib/seo/sitemap'
import { GET as llms } from '@/server/llms-response'
import { USE_CASE_SPECS, type UseCaseSpec } from './use-case-specs'

const specs = Object.values(USE_CASE_SPECS)
const quickBreak: UseCaseSpec = USE_CASE_SPECS['quick-brain-break-no-sign-up']
const BASE = 'https://tryit.fun'

// docs/catalog.md#names: never a slug or title, and no sibling-product marks on a use case.
const THIRD_PARTY_MARKS =
	/wordle|connections|strands|spelling bee|letter boxed|queens|tango|kenken|picross|scrabble|nyt|new york times|linkedin|lumosity|elevate|puzzmo|brilliant/i

describe('use-case registry', () => {
	test('every spec is a public English-only route, and every use-case route has a spec', () => {
		const routed = PUBLIC_ROUTES.filter((route) => route.path.startsWith('/use-cases/'))
		expect(routed.map((route) => route.path).sort()).toEqual(specs.map((spec) => spec.path).sort())
		for (const route of routed) expect(route.englishOnly).toBe(true)
		for (const spec of specs) expect(spec.path).toBe(`/use-cases/${spec.slug}`)
	})

	test('use cases sit only in the default-locale sitemap, without hreflang alternates', () => {
		for (const locale of locales) {
			const urls = buildLocaleSitemap(BASE, locale)
			for (const spec of specs) {
				const entry = urls.find((item) => item.url === `${BASE}${spec.path}`)
				if (locale === defaultLocale) {
					expect(entry).toBeDefined()
					expect(entry?.alternates).toBeUndefined()
				} else {
					expect(urls.some((item) => item.url.endsWith(spec.path))).toBe(false)
				}
			}
		}
	})

	test('/llms.txt lists every use case from the registry', async () => {
		const text = await llms().text()
		for (const spec of specs) {
			expect(text).toContain(`(${BASE}${spec.path}): ${spec.llmsSummary}`)
		}
	})
})

describe('quick brain break page', () => {
	test('slug, titles and copy carry no third-party marks', () => {
		expect(JSON.stringify(quickBreak)).not.toMatch(THIRD_PARTY_MARKS)
	})

	test('plays through canonical internal targets with no tracking parameters', () => {
		for (const href of [quickBreak.primaryCta.href, quickBreak.secondaryCta.href]) {
			expect(href.startsWith('/')).toBe(true)
			expect(href).not.toContain('?')
		}
	})

	test('links every registry game once, by its canonical page, with its own time estimate', () => {
		const games = getAllGameMetadata()
		const links = quickBreak.workflows.flatMap((step) =>
			(step.groups ?? []).flatMap((group) => group.links ?? []),
		)
		expect(links.map((link) => link.href).sort()).toEqual(
			games.map((game) => gamePath(game.slug)).sort(),
		)
		for (const game of games) {
			expect(links).toContainEqual({
				label: `${game.name} (~${game.display.durationMinutes} min)`,
				href: gamePath(game.slug),
			})
		}
	})

	test('time bands place every game exactly once', () => {
		const placed = quickBreak.comparisonRows
			.flatMap((row) => row.columns)
			.flatMap((cell) => (cell === '—' ? [] : cell.split(', ')))
		expect(placed.sort()).toEqual(
			getAllGameMetadata()
				.map((game) => game.name)
				.sort(),
		)
	})

	test('describes no paid price; the pricing page owns the catalogue', () => {
		expect(JSON.stringify(quickBreak)).not.toMatch(/[$£€]\s?\d/)
		expect(quickBreak.offers).toEqual([
			{ name: 'Free (any 3 games a day)', price: '0', priceCurrency: 'USD' },
		])
	})
})
