import { describe, expect, test } from 'bun:test'
import { buildGlobalCss } from './test-support/build-global-css'

describe('tailwind sources', () => {
	test('emits the utilities used only by the shared UI dialog', async () => {
		const css = await buildGlobalCss()
		for (const utility of [
			'sm\\:left-1\\/2',
			'sm\\:top-1\\/2',
			'sm\\:-translate-x-1\\/2',
			'sm\\:inset-x-auto',
		]) {
			expect(css).toContain(`.${utility}`)
		}
	}, 15_000)
})
