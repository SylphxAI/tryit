import type { Locale } from '@/lib/i18n/config'
import { createTranslator, type Translate } from '@/lib/i18n/translate'

export function statsTranslator(locale: Locale) {
	const full = createTranslator(locale)
	return Object.assign(
		(key: string, values?: Parameters<Translate>[1]) => full(`stats.${key}`, values),
		{ full },
	)
}
