import { IntlMessageFormat } from 'intl-messageformat'
import type { Locale } from './config'
import { loadMessages } from './messages'

type Values = Record<string, string | number | boolean | Date | null | undefined>

export function createTranslator(locale: Locale) {
	const messages = loadMessages(locale)
	const formats = new Map<string, IntlMessageFormat>()

	function raw(path: string): unknown {
		let value: unknown = messages
		for (const key of path.split('.')) {
			if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined
			value = (value as Record<string, unknown>)[key]
		}
		return value
	}

	const translate = (path: string, values?: Values): string => {
		const message = raw(path)
		if (typeof message !== 'string') return path
		let format = formats.get(path)
		if (!format) {
			format = new IntlMessageFormat(message, locale)
			formats.set(path, format)
		}
		return String(format.format(values))
	}
	return Object.assign(translate, { has: (path: string) => typeof raw(path) === 'string', raw })
}

export type Translate = ReturnType<typeof createTranslator>
