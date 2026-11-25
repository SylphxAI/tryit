import { CATALOG_CATEGORIES } from '@/features/catalog/lib/catalog'
import { buildCheckoutOffer } from '@/features/plus/solid/checkout-offer-data'
import { selectOfferPrices } from '@/features/plus-offer/lib/plus-offer'
import { getAllGameMetadata } from '@/games/registry'
import { adsConfig, adsFor } from '@/lib/ads'
import { requestBilling } from '@/lib/api/request-billing'
import { OPEN_ACCESS } from '@/lib/billing/plus'
import { env } from '@/lib/env'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { productDayKey } from '@/lib/product-day'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import { siteShellData } from '@/shared/solid/site-shell-data'
import { ARCHIVE_WINDOW_DAYS, archiveDayKeys } from '../lib/archive-days'

export async function readArchivePage(locale: Locale, request: Request, now = new Date()) {
	const t = createTranslator(locale)
	const billing = requestBilling(request.headers)
	const signedIn = Boolean(await withPresentationDeadline(requestUser(request), null))
	const access = await withPresentationDeadline(billing.access(signedIn), OPEN_ACCESS)
	const locked = access.salesOpen && !access.entitled
	const plans = locked ? await withPresentationDeadline(billing.listPlans(), null) : null
	const offer = buildCheckoutOffer(locale, request.headers, plans)
	const prices = selectOfferPrices(offer.cards, offer.currency, locale)
	const title = t('archive.metaTitle')
	const description = t('archive.metaDescription', { days: ARCHIVE_WINDOW_DAYS })
	const games = getAllGameMetadata().map((game) => ({
		slug: game.slug,
		name: t(`games.${slugToCamelCase(game.slug)}.name`),
		theme: game.display.theme,
		category: game.category,
	}))
	return {
		locale,
		signedIn,
		games,
		categories: CATALOG_CATEGORIES.filter((category) =>
			games.some((game) => game.category === category),
		).map((value) => ({ value, label: t(`catalog.category.${value}`) })),
		days: archiveDayKeys(productDayKey(now)),
		locked,
		prices,
		ads: adsFor(adsConfig(env), access.entitled),
		shell: siteShellData(locale, '/archive', t, now),
		meta: pageMetadata({
			locale,
			path: '/archive',
			baseUrl: canonicalSiteOrigin(request.headers),
			title,
			description,
			imagePath: ogImagePath({ title, subtitle: description, eyebrow: t('archive.eyebrow') }),
		}),
	}
}

export type ArchivePageData = Awaited<ReturnType<typeof readArchivePage>>
