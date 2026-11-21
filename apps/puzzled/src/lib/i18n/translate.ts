import { IntlMessageFormat } from 'intl-messageformat'
import type { Locale } from './config'
import { loadMessages } from './messages'

type Values = Record<string, string | number | boolean | Date | null | undefined>

export function createTranslator(locale: Locale) {
	const messages = loadMessages(locale)
	const formats = new Map<string, IntlMessageFormat>()

	function lookup(path: string): string | undefined {
		let value: unknown = messages
		for (const key of path.split('.')) {
			if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined
			value = (value as Record<string, unknown>)[key]
		}
		return typeof value === 'string' ? value : undefined
	}

	const translate = (path: string, values?: Values): string => {
		const message = lookup(path)
		if (message === undefined) return path
		let format = formats.get(path)
		if (!format) {
			format = new IntlMessageFormat(message, locale)
			formats.set(path, format)
		}
		return String(format.format(values))
	}
	return Object.assign(translate, { has: (path: string) => lookup(path) !== undefined })
}

export type Translate = ReturnType<typeof createTranslator>
