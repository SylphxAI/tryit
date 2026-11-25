import { expect, test } from 'bun:test'
import { getGameSlugs } from '@/games/registry'
import { gamePath } from '@/lib/game-slug'
import { buildGamePage } from './game-data'

const games = getGameSlugs()
const origin = 'https://tryit.fun'
const dailyResetGames = new Set(['word-guess', 'quad-words', 'word-search'])
const day = new Date('2026-11-24T00:00:00Z')

for (const slug of games) {
	test(`/zh-TW${gamePath(slug)} has localized tips and FAQ copy`, () => {
		const page = buildGamePage('zh-TW', slug, origin, day)
		expect(page?.canonicalPath).toBe(`/zh-TW${gamePath(slug)}`)
		if (!page) throw new Error(`Missing game page: ${slug}`)
		expect(page.tips).toHaveLength(3)
		for (const tip of page.tips) {
			expect(tip).toMatch(/\p{Script=Han}/u)
			// Cipher's quoted English letter/word examples are puzzle content, not prose.
			const prose = slug === 'cryptogram' ? tip.replace(/「(?:a|I|letter|tt)」/g, '') : tip
			expect(prose).not.toMatch(/\p{Script=Latin}/u)
		}
		expect(page.faq).toHaveLength(3)
		for (const { question, answer } of page.faq) {
			expect(question).toContain(page.name)
			expect(question).not.toMatch(/\p{Script=Latin}/u)
			expect(answer).toMatch(/\p{Script=Han}/u)
			// Keep the shared daily reset explicit without allowing Latin words in the prose.
			expect(answer.replace('16:00 UTC', '').replace('Tryit', '')).not.toMatch(/\p{Script=Latin}/u)
		}
		expect(page.faq[2].question + page.faq[2].answer).not.toMatch(/唔|嘅|喺|揀|㗎|㖿|啦|囉/u)
		if (dailyResetGames.has(slug)) {
			expect(page.faq[1].answer).toMatch(/每天午夜（16:00 UTC）(?:換題|更新)/u)
		}
	})
}
