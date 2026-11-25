import { catalogues } from './catalogues'
import type { Locale } from './config'
import { type Messages, resolveMessages } from './resolve-messages'

const resolved = new Map<Locale, Messages>()

/** Load the resolved, shared catalogue. Translation data is static, not request state. */
export function loadMessages(locale: Locale): Messages {
	let messages = resolved.get(locale)
	if (!messages) {
		messages = resolveMessages(locale, (entry) => catalogues[entry])
		resolved.set(locale, messages)
	}
	return messages
}
