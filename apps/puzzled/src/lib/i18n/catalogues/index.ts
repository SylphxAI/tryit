import type { Locale } from '../config'
import type { LocaleCatalogue } from '../resolve-messages'
import * as enGB from './en-GB'
import { messages as enGBExtended } from './en-GB-extended'
import * as enUS from './en-US'
import { messages as enUSExtended } from './en-US-extended'
import * as es from './es'
import { messages as esExtended } from './es-extended'
import * as ja from './ja'
import { messages as jaExtended } from './ja-extended'
import * as ptBR from './pt-BR'
import { messages as ptBRExtended } from './pt-BR-extended'
import * as zhCN from './zh-CN'
import { messages as zhCNExtended } from './zh-CN-extended'
import * as zhHK from './zh-HK'
import { messages as zhHKExtended } from './zh-HK-extended'
import * as zhTW from './zh-TW'
import { messages as zhTWExtended } from './zh-TW-extended'

export const catalogues: Record<Locale, LocaleCatalogue> = {
	'en-US': { games: enUS.games, messages: { ...enUS.messages, ...enUSExtended } },
	'en-GB': { games: enGB.games, messages: { ...enGB.messages, ...enGBExtended } },
	'zh-HK': { games: zhHK.games, messages: { ...zhHK.messages, ...zhHKExtended } },
	'zh-TW': { games: zhTW.games, messages: { ...zhTW.messages, ...zhTWExtended } },
	'zh-CN': { games: zhCN.games, messages: { ...zhCN.messages, ...zhCNExtended } },
	ja: { games: ja.games, messages: { ...ja.messages, ...jaExtended } },
	es: { games: es.games, messages: { ...es.messages, ...esExtended } },
	'pt-BR': { games: ptBR.games, messages: { ...ptBR.messages, ...ptBRExtended } },
}
