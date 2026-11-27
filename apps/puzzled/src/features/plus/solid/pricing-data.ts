import { ARCHIVE_WINDOW_DAYS } from '@/features/daily/lib/archive-days'
import { resolvePricingCheckoutTrigger } from '@/features/plus-offer/lib/plus-offer'
import { PRACTICE_GAMES } from '@/features/practice/lib/practice'
import { getAllGameMetadata } from '@/games/registry'
import { readBillingPlans, requestBilling } from '@/lib/api/request-billing'
import { showsCurrentPlan } from '@/lib/billing/plus'
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

import { loadPricingPlans, selectPricingPlans } from '../lib/pricing-plans'
import { pricingBuyerFaq, pricingProductJsonLd } from '../lib/pricing-structured-data'

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
		translate(`plus.pricing.${key}`, { days: ARCHIVE_WINDOW_DAYS, ...values })
	const pricingPlans = loadPricingPlans((timeoutMs) => readBillingPlans(request.headers, timeoutMs))
	const billing = requestBilling(request.headers, pricingPlans)
	const user = withPresentationDeadline(requestUser(request), null)
	const [viewer, plans, access] = await Promise.all([
		user,
		pricingPlans,
		user.then((viewer) => withPresentationDeadline(billing.access(Boolean(viewer)), null)),
	])
	const { currencies, currency, cards, planState } = selectPricingPlans(
		plans,
		request.headers,
		locale,
	)
	const trigger = (fallback: string) =>
		resolvePricingCheckoutTrigger({
			trigger: search.get('trigger') ?? undefined,
			utmMedium: search.get('utm_medium') ?? undefined,
			entrySurface: search.get('entry_surface') ?? undefined,
			fallback,
		})
	const familyMax = plans?.familyMaxMembers || 4
	const meta = pageMetadata({
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
	})
	return {
		locale,
		planState,
		gameCount,
		practiceCount: PRACTICE_GAMES.length,
		freeSlug,
		freeName: translate(`games.${slugToCamelCase(freeSlug)}.name`),
		currencies,
		currency,
		cards,
		familyMax,
		plusMember: showsCurrentPlan(access),
		signedIn: Boolean(viewer),
		checkout: search.get('checkout'),
		plan: search.get('plan') ?? undefined,
		currencySwitch: search.has('quoteCurrency')
			? {
					currency: search.get('quoteCurrency'),
					plus: search.get('plusPlan'),
					family: search.get('familyPlan'),
				}
			: undefined,
		callbackUrl: safeCallbackPath(search.get('callbackUrl')) ?? undefined,
		plusCheckoutTrigger: trigger('pricing_card'),
		familyCheckoutTrigger: trigger('pricing_family_card'),
		shell: siteShellData(locale, '/pricing', translate, now),
		meta,
		buyerFaq: pricingBuyerFaq(translate, {
			gameCount,
			archiveDays: ARCHIVE_WINDOW_DAYS,
			passDays: cards.find((card) => card.id === 'individual_once')?.accessDays ?? 3,
			familyMax,
		}),
		productJsonLd: pricingProductJsonLd(translate, meta, planState, cards),
	}
}

export type PricingData = Awaited<ReturnType<typeof readPricingPage>>
