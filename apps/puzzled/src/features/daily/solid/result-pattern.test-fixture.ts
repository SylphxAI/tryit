import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { createTranslator } from '@/lib/i18n/translate'
import { buildResultCard, parseResultPattern, resultCardStringsFrom } from '../lib/result-card'
import { ResultPattern } from './result-pattern'

/** Mounts the real preview for one game's share grid with resolved locale copy. */
export function mountResultPattern(host: HTMLElement, gameSlug: string, shareText: string) {
	const t = createTranslator('en-US')
	const strings = resultCardStringsFrom((key) => String(t.raw(`share.card.${key}`)))
	const model = buildResultCard({
		origin: 'https://tryit.fun',
		gameSlug,
		gameName: 'Hive',
		theme: 'amber',
		mode: 'daily',
		status: 'won',
		locale: 'en-US',
		pattern: parseResultPattern(shareText, gameSlug),
	})
	return render(() => createComponent(ResultPattern, { model, strings }), host)
}
