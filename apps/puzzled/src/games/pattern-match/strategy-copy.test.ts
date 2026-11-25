import { expect, test } from 'bun:test'
import { type Locale, locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'

const overlappingSetsTip: Record<Locale, string> = {
	'en-US': 'One card can belong to more than one valid trio.',
	'en-GB': 'One card can belong to more than one valid trio.',
	es: 'Una carta puede formar parte de más de un trío válido.',
	ja: '1 枚のカードが複数の有効な3枚組に入ることがあります。',
	'pt-BR': 'Uma carta pode fazer parte de mais de um trio válido.',
	'zh-CN': '同一张牌可以组成多组有效的组合。',
	'zh-HK': '同一張卡可以屬於多個有效組合。',
	'zh-TW': '同一張牌可以屬於多個有效組合。',
}

for (const locale of locales) {
	test(`Match explains that trios can overlap in ${locale}`, () => {
		const tips = createTranslator(locale).raw('catalog.game.pattern-match.tips')
		expect(tips).toEqual(
			expect.arrayContaining([expect.stringContaining(overlappingSetsTip[locale])]),
		)
	})
}
