import 'server-only'
import { parseCookie } from 'cookie-es'
import { consolePresentation } from '@/features/console/solid/read-context'
import { requestBilling } from '@/lib/api/request-billing'
import { CHECKOUT_CLAIM_COOKIE } from '@/lib/billing/checkout-claim-cookie'
import { checkoutConfirmed, subscriptionView } from '@/lib/billing/plus'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { logger } from '@/lib/logger'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { subscriptionPath, subscriptionReturn } from './subscription-return'

export async function readSubscriptionPage(
	locale: Locale,
	request: Request,
	search: URLSearchParams,
	claimOnReturn: boolean,
) {
	const handoff = subscriptionReturn(search)
	const cookies = parseCookie(request.headers.get('cookie') ?? '')
	const hasClaimCookie = Boolean(cookies[CHECKOUT_CLAIM_COOKIE])
	const user = await withPresentationDeadline(requestUser(request), null)
	const t = createTranslator(locale)
	const presentation = consolePresentation({
		locale,
		path: subscriptionPath,
		t,
		title: t('plus.subscription.title'),
		description: t('plus.subscription.description'),
		eyebrow: t('settings.eyebrow'),
		request,
	})
	if (!user) {
		return {
			...presentation,
			handoff,
			kind: handoff.fromCheckout || hasClaimCookie ? ('claim' as const) : ('guest' as const),
		}
	}
	const billing = requestBilling(request.headers)
	if (claimOnReturn && (hasClaimCookie || handoff.session)) {
		// First resolve pending guest ownership (including cross-browser verified email).
		// Only the following Money read can confirm access. Browser claim clears HttpOnly state.
		await billing.claim(handoff.session ?? '', locale).catch((error) => {
			logger.warn('plus.checkout-claim-skipped', { error })
		})
	}
	const view = await billing
		.subscription(handoff.fromCheckout || hasClaimCookie)
		.then(subscriptionView)
		.catch((error) => {
			logger.warn('plus.subscription-page-read-failed', { error })
			return null
		})
	const sessionId = handoff.session
	const status =
		checkoutConfirmed(view) && sessionId
			? view?.status === 'trialing'
				? ('trialing' as const)
				: ('paid' as const)
			: null
	return {
		...presentation,
		kind: 'member' as const,
		handoff,
		hasClaimCookie,
		view,
		conversion: status && sessionId ? { status, sessionId, userId: user.id } : null,
	}
}

export type SubscriptionPageData = Awaited<ReturnType<typeof readSubscriptionPage>>
export type MemberSubscriptionData = Extract<SubscriptionPageData, { kind: 'member' }>
