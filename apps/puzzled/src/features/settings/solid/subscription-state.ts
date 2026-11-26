import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { cookieConsent, onConsentChange } from '@/features/analytics/lib/consent'
import { reportCheckoutReturn, reportCheckoutTrial } from '@/features/plus/lib/checkout-return'
import { checkoutConfirmed } from '@/lib/billing/plus'
import type { Translate } from '@/lib/i18n/translate'
import { logger } from '@/lib/logger'
import type { MemberSubscriptionData } from './subscription-data'

type Snapshot = Pick<MemberSubscriptionData, 'kind' | 'view' | 'conversion'>
export type SubscriptionPanelProps = {
	data: MemberSubscriptionData
	t: Translate
	refresh: () => Promise<Snapshot | { kind: 'signed-out'; href: string }>
}

export type SubscriptionCopy = (key: string, values?: Record<string, string | number>) => string

export function createSubscriptionState(
	props: SubscriptionPanelProps,
	t: SubscriptionCopy,
	family: SubscriptionCopy,
) {
	const { locale, handoff, hasClaimCookie } = props.data
	const [snapshot, setSnapshot] = createSignal<Snapshot>(props.data)
	const view = () => snapshot().view
	const confirmed = () =>
		checkoutConfirmed(view()) ||
		Boolean(snapshot().conversion && view()?.entitled && view()?.source === 'plus')
	const needsReadback = () => !confirmed() || Boolean(handoff.session && !snapshot().conversion)
	const [busy, setBusy] = createSignal(false)
	const [confirming, setConfirming] = createSignal<'cancel' | 'leave' | null>(null)
	const [message, setMessage] = createSignal<{ text: string; error?: boolean }>()
	const [browser, setBrowser] = createSignal<{ origin: string; now: number }>()
	const [replacement, setReplacement] = createSignal<string>()
	let mounted = false
	let reads = 0

	async function refresh() {
		const id = ++reads
		const next = await props.refresh()
		if (!mounted || id !== reads) return
		if (next.kind === 'signed-out') {
			setSnapshot({ kind: 'member', view: null, conversion: null })
			window.location.assign(next.href)
		} else {
			setSnapshot(next)
			if (next.view?.family?.inviteCode === replacement()) setReplacement(undefined)
		}
	}

	onMount(() => {
		mounted = true
		setBrowser({ origin: window.location.origin, now: Date.now() })
		if (hasClaimCookie || (handoff.session && needsReadback())) {
			// Unlike the SSR claim, this direct same-origin call applies the RPC's Set-Cookie.
			void import('@/lib/connect/billing-client')
				.then(({ claimCheckout }) => claimCheckout(handoff.session ?? '', locale))
				.then((claimed) => {
					if (mounted && claimed && needsReadback() && !busy()) return refresh()
				})
				.catch(() => undefined)
		}
		if (!handoff.fromCheckout || !needsReadback()) return
		let attempts = 0
		let reading = false
		const timer = setInterval(() => {
			if (!needsReadback() || attempts >= 15) {
				clearInterval(timer)
				return
			}
			if (busy() || reading) return
			attempts++
			reading = true
			void refresh()
				.catch(() => undefined)
				.finally(() => {
					reading = false
				})
		}, 2000)
		onCleanup(() => clearInterval(timer))
	})
	onCleanup(() => {
		mounted = false
	})
	createEffect(() => {
		const conversion = snapshot().conversion
		const trialSession =
			!conversion && confirmed() && view()?.status === 'trialing' && handoff.session
		if (!conversion && !trialSession) return
		const report = () => {
			if (conversion) reportCheckoutReturn(conversion)
			else if (trialSession) reportCheckoutTrial(trialSession)
		}
		if (cookieConsent().ready) {
			report()
			return
		}
		// Wait for request-level privacy context, not for a later opt-in.
		let cancelled = false
		const stop = onConsentChange(() => {
			if (!cookieConsent().ready) return
			stop()
			queueMicrotask(() => {
				if (!cancelled) report()
			})
		})
		onCleanup(() => {
			cancelled = true
			stop()
		})
	})

	async function run(
		action: (client: typeof import('@/lib/connect/billing-client')) => Promise<string | void>,
	) {
		if (busy()) return
		setBusy(true)
		setMessage(undefined)
		++reads // An earlier polling result must not restore pre-mutation state.
		try {
			const text = await action(await import('@/lib/connect/billing-client'))
			if (!mounted) return
			setConfirming(null)
			if (text) setMessage({ text })
			await refresh()
		} catch (error) {
			if (!mounted) return
			logger.error('plus.settings-action-failed', { error })
			const errors = props.t.raw('plus.family.errors')
			const failure = error instanceof Error ? error.message : ''
			const key =
				errors && typeof errors === 'object'
					? Object.keys(errors).find((code) => failure.includes(code))
					: undefined
			setMessage({ text: key ? family(`errors.${key}`) : t('error'), error: true })
		} finally {
			if (mounted) setBusy(false)
		}
	}

	return {
		view,
		confirmed,
		busy,
		confirming,
		setConfirming,
		message,
		browser,
		replacement,
		setReplacement,
		isMounted: () => mounted,
		run,
	}
}

export type SubscriptionView = NonNullable<Snapshot['view']>
export type SubscriptionActions = Pick<
	ReturnType<typeof createSubscriptionState>,
	'busy' | 'confirming' | 'setConfirming' | 'run' | 'isMounted'
>
