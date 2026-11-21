import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isValidLocale } from './config'
import { loadMessages } from './messages'

export default getRequestConfig(async ({ requestLocale }) => {
	const requested = await requestLocale
	const locale = requested && isValidLocale(requested) ? requested : defaultLocale
	return { locale, messages: loadMessages(locale) }
})
