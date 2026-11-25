import { expect, test } from 'bun:test'
import { browserMessages, prepareBrowserMessages } from './browser-catalogue'
import { defaultLocale, locales } from './config'
import { loadMessages } from './messages'

test('only English is initially available; locale imports preserve all resolved copy', async () => {
	const english = browserMessages(defaultLocale)
	for (const locale of locales) {
		if (locale !== defaultLocale) expect(() => browserMessages(locale)).toThrow('not prepared')
	}

	// zh-TW needs the zh-HK module for fallback, but must not publish the
	// fallback as its own locale or change the English catalogue.
	await prepareBrowserMessages('zh-TW')
	expect(() => browserMessages('zh-HK')).toThrow('not prepared')

	for (const locale of locales) {
		await prepareBrowserMessages(locale)
		const messages = browserMessages(locale)
		expect(messages).toEqual(loadMessages(locale))
		await prepareBrowserMessages(locale)
		expect(browserMessages(locale)).toBe(messages)
	}
	expect(browserMessages(defaultLocale)).toBe(english)
})
