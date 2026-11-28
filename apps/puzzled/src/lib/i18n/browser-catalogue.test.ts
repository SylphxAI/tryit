import { expect, test } from 'bun:test'
import {
	browserMessages,
	prepareBrowserMessages,
	prepareExtendedBrowserMessages,
	prepareHomeBrowserMessages,
} from './browser-catalogue'
import { messages as englishHome } from './catalogues/en-US-home'
import { defaultLocale, locales } from './config'
import { loadMessages } from './messages'

test('Home copy loads before the full catalogue; locale upgrades preserve all resolved copy', async () => {
	const english = browserMessages(defaultLocale)
	expect(english).not.toHaveProperty('games')
	expect(english).not.toHaveProperty('archive')
	for (const locale of locales) {
		if (locale !== defaultLocale) expect(() => browserMessages(locale)).toThrow('not prepared')
	}

	// zh-TW needs the zh-HK module for fallback, but must not publish the
	// fallback as its own locale or change the English catalogue.
	await prepareBrowserMessages('zh-TW')
	expect(() => browserMessages('zh-HK')).toThrow('not prepared')

	for (const locale of locales) {
		await prepareHomeBrowserMessages(locale)
		const messages = browserMessages(locale)
		for (const key of Object.keys(englishHome)) {
			expect(messages[key]).toEqual(loadMessages(locale)[key])
		}
		await prepareBrowserMessages(locale)
		expect(browserMessages(locale)).toBe(messages)
		expect(messages).toHaveProperty('games.sudoku')
		expect(messages).not.toHaveProperty('settings')
		await prepareExtendedBrowserMessages(locale)
		expect(messages).toEqual(loadMessages(locale))
		await prepareBrowserMessages(locale)
		expect(browserMessages(locale)).toBe(messages)
	}
	expect(browserMessages(defaultLocale)).toBe(english)
})
