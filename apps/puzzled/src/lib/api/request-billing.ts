import { create } from '@bufbuild/protobuf'
import { createClient } from '@connectrpc/connect'
import { parseCookie } from 'cookie-es'
import {
	BillingService,
	ClaimCheckoutRequestSchema,
	GetSubscriptionRequestSchema,
	ListPlansRequestSchema,
} from '@/gen/connect/puzzled/v1/billing_pb'
import { CHECKOUT_CLAIM_COOKIE } from '@/lib/billing/checkout-claim-cookie'
import { OPEN_ACCESS, type PlusAccess } from '@/lib/billing/plus'
import { logger } from '@/lib/logger'
import { requestConnectTransport } from './request-connect'

/** Presentation reads stay request-local; Money remains the sole checkout and access authority. */
export function requestBilling(headers: Headers) {
	const client = () => createClient(BillingService, requestConnectTransport(headers))
	let plans: ReturnType<ReturnType<typeof client>['listPlans']> | undefined
	const listPlans = () =>
		(plans ??= Promise.resolve().then(() => client().listPlans(create(ListPlansRequestSchema))))
	const subscription = (refresh = false) =>
		client().getSubscription(create(GetSubscriptionRequestSchema, { refresh }))
	const claim = async (checkoutSessionId = '', locale = '') => {
		const response = await client().claimCheckout(
			create(ClaimCheckoutRequestSchema, { checkoutSessionId, locale }),
		)
		return response.claimed
	}

	async function access(signedIn: boolean): Promise<PlusAccess> {
		if (signedIn) {
			try {
				const pending = Boolean(parseCookie(headers.get('cookie') ?? '')[CHECKOUT_CLAIM_COOKIE])
				if (pending) {
					await claim().catch((error) => logger.warn('plus.auto-claim-failed', { error }))
				}
				const result = await subscription(pending)
				return {
					salesOpen: result.salesOpen,
					entitled: result.entitled,
					trialEndsMs: Number(result.trialEndsMs) || null,
				}
			} catch (error) {
				logger.warn('plus.subscription-read-failed', { error })
			}
		}
		try {
			return { salesOpen: (await listPlans()).salesOpen, entitled: false }
		} catch (error) {
			logger.warn('plus.plans-read-failed', { error })
			return OPEN_ACCESS
		}
	}

	return { listPlans, subscription, claim, access }
}
