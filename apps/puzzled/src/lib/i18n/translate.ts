/// <reference types="vite/client" />
import { IntlMessageFormat } from 'intl-messageformat'
import { browserMessages } from './browser-catalogue'
import type { Locale } from './config'
import { loadMessages } from './messages'

type Values = Record<string, string | number | boolean | Date | null | undefined>

const translators = new Map<Locale, Translate>()

export function createTranslator(locale: Locale): Translate {
	let translate = translators.get(locale)
	if (!translate) {
		// Vite substitutes SSR at build time, so the browser never imports the
		// eager server registry. Bun also uses the synchronous server catalogue.
		const messages = import.meta.env?.SSR === false ? browserMessages(locale) : loadMessages(locale)
		translate = makeTranslator(locale, messages)
		translators.set(locale, translate)
	}
	return translate
}

function makeTranslator(locale: Locale, messages: Record<string, unknown>) {
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
		// Keep ICU arguments, quoting, and tags on the full parser.
		if (!/[{}'<]/.test(message)) return message
		let format = formats.get(path)
		if (!format) {
			format = new IntlMessageFormat(message, locale)
			formats.set(path, format)
		}
		return String(format.format(values))
	}
	return Object.assign(translate, { has: (path: string) => typeof raw(path) === 'string', raw })
}

export type Translate = ReturnType<typeof makeTranslator>
