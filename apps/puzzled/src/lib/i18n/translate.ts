import type { Locale } from './config'
import { messageCompiler, type Values } from './format-message'
import { loadMessages } from './messages'

const translators = new Map<Locale, Translate>()

export function createTranslator(locale: Locale): Translate {
	let translate = translators.get(locale)
	if (!translate) {
		translate = makeTranslator(locale, loadMessages(locale))
		translators.set(locale, translate)
	}
	return translate
}

function makeTranslator(locale: Locale, messages: Record<string, unknown>) {
	const compile = messageCompiler(locale)
	const formats = new Map<string, ReturnType<typeof compile>>()

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
		// Only messages with possible ICU syntax need compilation.
		if (!/[{}'<]/.test(message)) return message
		let format = formats.get(path)
		if (!format) {
			format = compile(message)
			formats.set(path, format)
		}
		return format(values)
	}
	return Object.assign(translate, { has: (path: string) => typeof raw(path) === 'string', raw })
}

export type Translate = ReturnType<typeof makeTranslator>
