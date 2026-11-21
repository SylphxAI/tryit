import { parseCookie } from 'cookie-es'
import { resolvePricingCheckoutTrigger } from '@/features/plus-offer/lib/plus-offer'
import { getAllGameMetadata } from '@/games/registry'
import { requestBilling } from '@/lib/api/request-billing'
import {
	availableCurrencies,
	COUNTRY_HEADER,
	CURRENCY_COOKIE,
	chooseCurrency,
} from '@/lib/billing/currency'
import { planCards, showsCurrentPlan } from '@/lib/billing/plus'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { safeCallbackPath } from '@/lib/identity/after-sign-up'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import { siteShellData } from '@/shared/solid/site-shell-data'

export async function readPricingPage(
	locale: Locale,
	request: Request,
	search: URLSearchParams,
	now = new Date(),
) {
	const translate = createTranslator(locale)
	const gameCount = getAllGameMetadata().length
	const freeSlug = getTodaysFreeGame(now)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`plus.pricing.${key}`, values)
	const billing = requestBilling(request.headers)
	const user = withPresentationDeadline(requestUser(request), null)
	const [viewer, plans, access] = await Promise.all([
		user,
		withPresentationDeadline(billing.listPlans(), null),
		user.then((viewer) => withPresentationDeadline(billing.access(Boolean(viewer)), null)),
	])
	const currencies = plans?.salesOpen ? availableCurrencies(plans.plans) : []
	const currency = chooseCurrency({
		cookie: parseCookie(request.headers.get('cookie') ?? '')[CURRENCY_COOKIE],
		country: request.headers.get(COUNTRY_HEADER),
		locale,
		available: currencies,
	})
	const trigger = (fallback: string) =>
		resolvePricingCheckoutTrigger({
			trigger: search.get('trigger') ?? undefined,
			utmMedium: search.get('utm_medium') ?? undefined,
			entrySurface: search.get('entry_surface') ?? undefined,
			fallback,
		})
	return {
		locale,
		gameCount,
		freeSlug,
		freeName: translate(`games.${slugToCamelCase(freeSlug)}.name`),
		currencies,
		currency,
		cards: plans?.salesOpen ? planCards(plans.plans, currency) : [],
		familyMax: plans?.familyMaxMembers ?? 4,
		plusMember: showsCurrentPlan(access),
		signedIn: Boolean(viewer),
		checkout: search.get('checkout'),
		plan: search.get('plan') ?? undefined,
		callbackUrl: safeCallbackPath(search.get('callbackUrl')) ?? undefined,
		plusCheckoutTrigger: trigger('pricing_card'),
		familyCheckoutTrigger: trigger('pricing_family_card'),
		shell: siteShellData(locale, '/pricing', translate, now),
		meta: pageMetadata({
			locale,
			path: '/pricing',
			baseUrl: canonicalSiteOrigin(request.headers),
			title: t('metaTitle'),
			description: t('metaDescription'),
			imagePath: ogImagePath({
				title: t('metaTitle'),
				subtitle: t('lead', { count: gameCount }),
				eyebrow: translate('plus.name'),
			}),
		}),
	}
}

export type PricingData = Awaited<ReturnType<typeof readPricingPage>>
