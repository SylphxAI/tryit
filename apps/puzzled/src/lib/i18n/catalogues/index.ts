import type { Locale } from '../config'
import type { LocaleCatalogue } from '../resolve-messages'
import * as enGB from './en-GB'
import * as enUS from './en-US'
import * as es from './es'
import * as ja from './ja'
import * as ptBR from './pt-BR'
import * as zhCN from './zh-CN'
import * as zhHK from './zh-HK'
import * as zhTW from './zh-TW'

export const catalogues: Record<Locale, LocaleCatalogue> = {
	'en-US': enUS,
	'en-GB': enGB,
	'zh-HK': zhHK,
	'zh-TW': zhTW,
	'zh-CN': zhCN,
	ja,
	es,
	'pt-BR': ptBR,
}
