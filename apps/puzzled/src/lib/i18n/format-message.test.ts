import { expect, test } from 'bun:test'
import { IntlMessageFormat } from 'intl-messageformat'
import { locales } from './config'
import { messageCompiler, type Values } from './format-message'
import { loadMessages } from './messages'

function* leaves(value: unknown, path = ''): Generator<[string, string]> {
	if (typeof value === 'string') yield [path, value]
	else if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value))
			yield* leaves(child, path ? `${path}.${key}` : key)
	}
}

test('native format matches ICU for every formatted catalogue message and locale', () => {
	for (const locale of locales) {
		const compile = messageCompiler(locale)
		for (const [path, message] of leaves(loadMessages(locale))) {
			if (path === 'auth.unified.terms' || path === 'auth.termsContinue') continue // raw rich text
			if (!/[{}'<]/.test(message)) continue
			const expected = new IntlMessageFormat(message, locale)
			const actual = compile(message)
			const values = Object.fromEntries(
				[...message.matchAll(/\{\s*([\w-]+)\s*[,}]/g)].map((match) => [match[1], 0]),
			) as Values
			for (const value of [0, 1, 2, -1, 1234.5]) {
				for (const key of Object.keys(values)) values[key] = value
				expect([locale, path, actual(values)]).toEqual([
					locale,
					path,
					String(expected.format(values)),
				])
			}
		}
	}
})

test('fails closed on unsupported ICU and absent required values', () => {
	const compile = messageCompiler('en-US')
	expect(() => compile('{stamp, date}')).toThrow('Unsupported ICU message')
	expect(() => compile('{count, plural, one {# item}}')).toThrow('Unsupported ICU message')
	expect(() => compile('Row {index}')()).toThrow('Missing ICU value: index')
	expect(compile('Row {index}')({ index: 'row A' })).toBe('Row row A')
})
