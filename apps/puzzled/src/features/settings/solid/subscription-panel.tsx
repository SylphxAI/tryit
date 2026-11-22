/** @jsxImportSource solid-js */
import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { cookieConsent, onConsentChange } from '@/features/analytics/lib/consent'
import { ConsoleCard } from '@/features/console/solid/console-chrome'
import { reportCheckoutReturn } from '@/features/plus/lib/checkout-return'
import {
	checkoutConfirmed,
	formatTrialEnd,
	isOneTimePassPlan,
	trialBannerEndMs,
} from '@/lib/billing/plus'
import type { Translate } from '@/lib/i18n/translate'
import { logger } from '@/lib/logger'
import { localizedPath } from '@/lib/seo/urls'
import { selectCopyText } from '@/shared/hooks/select-copy-text'
import type { MemberSubscriptionData } from './subscription-data'

const primary =
	'pressable inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60'
const secondary =
	'pressable inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/30 hover:text-primary disabled:opacity-60'

type Snapshot = Pick<MemberSubscriptionData, 'kind' | 'view' | 'conversion'>
type Props = {
	data: MemberSubscriptionData
	t: Translate
	refresh: () => Promise<Snapshot | { kind: 'signed-out'; href: string }>
}

export function SubscriptionPanel(props: Props) {
	const { locale, handoff, hasClaimCookie } = props.data
	const t = (key: string, values?: Record<string, string | number>) =>
		props.t(`plus.subscription.${key}`, values)
	const family = (key: string, values?: Record<string, string | number>) =>
		props.t(`plus.family.${key}`, values)
	const trial = (key: string, values: Record<string, string>) =>
		props.t(`plus.trial.${key}`, values)
	const date = (ms: number | null) => (ms ? formatTrialEnd(ms, locale) : '')
	const [snapshot, setSnapshot] = createSignal<Snapshot>(props.data)
	const view = () => snapshot().view
	const confirmed = () => checkoutConfirmed(view())
	const [busy, setBusy] = createSignal(false)
	const [confirming, setConfirming] = createSignal<'cancel' | 'leave' | null>(null)
	const [message, setMessage] = createSignal<{ text: string; error?: boolean }>()
	const [browser, setBrowser] = createSignal<{ origin: string; now: number }>()
	const [replacement, setReplacement] = createSignal<string>()
	const [copyResult, setCopyResult] = createSignal<{
		text: string
		status: 'pending' | 'copied' | 'failed'
	}>()
	let inviteRef: HTMLParagraphElement | undefined
	let mounted = false
	let reads = 0
	let copying = 0

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
		if (hasClaimCookie || (handoff.session && !confirmed())) {
			// Unlike the SSR claim, this direct same-origin call applies the RPC's Set-Cookie.
			void import('@/lib/connect/billing-client')
				.then(({ claimCheckout }) => claimCheckout(handoff.session ?? '', locale))
				.then((claimed) => {
					if (mounted && claimed && !confirmed() && !busy()) return refresh()
				})
				.catch(() => undefined)
		}
		if (!handoff.fromCheckout || confirmed()) return
		let attempts = 0
		let reading = false
		const timer = setInterval(() => {
			if (confirmed() || attempts >= 15) {
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
		if (!conversion) return
		if (cookieConsent().ready) {
			reportCheckoutReturn(conversion)
			return
		}
		// Wait for request-level privacy context, not for a later opt-in.
		let cancelled = false
		const stop = onConsentChange(() => {
			if (!cookieConsent().ready) return
			stop()
			queueMicrotask(() => {
				if (!cancelled) reportCheckoutReturn(conversion)
			})
		})
		onCleanup(() => {
			cancelled = true
			stop()
		})
	})

	const trialEnd = () => {
		const current = view()
		const now = browser()?.now
		return current && now ? trialBannerEndMs(current, now) : null
	}
	const inviteUrl = () => {
		const code = replacement() ?? view()?.family?.inviteCode
		const origin = browser()?.origin
		return code && origin ? `${origin}/family/join?${new URLSearchParams({ code })}` : ''
	}
	const copyState = () => {
		const result = copyResult()
		return result?.text === inviteUrl() ? result.status : undefined
	}
	async function copy() {
		const text = inviteUrl()
		if (!text || copyState() === 'pending') return
		const id = ++copying
		setCopyResult({ text, status: 'pending' })
		try {
			await navigator.clipboard.writeText(text)
			if (mounted && id === copying) setCopyResult({ text, status: 'copied' })
		} catch {
			if (mounted && id === copying && text === inviteUrl()) {
				setCopyResult({ text, status: 'failed' })
				selectCopyText(inviteRef ?? null)
			}
		}
	}

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

	return (
		<div class="space-y-6">
			<Show when={trialEnd()}>
				{(end) => (
					<output class="block rounded-xl bg-muted px-4 py-3 text-center text-sm">
						{trial('endingSoon', { date: date(end()) })}
					</output>
				)}
			</Show>
			<Show
				when={message()}
				fallback={
					handoff.fromCheckout ? (
						<output class="block rounded-xl bg-muted px-4 py-3 text-sm">
							{t(confirmed() ? 'checkoutSuccess' : 'checkoutPending')}
						</output>
					) : null
				}
			>
				{(notice) => (
					<output
						role={notice().error ? 'alert' : undefined}
						class="block rounded-xl bg-muted px-4 py-3 text-sm"
					>
						{notice().text}
					</output>
				)}
			</Show>
			<Show when={handoff.fromCheckout && confirmed() && handoff.callbackUrl}>
				{(path) => (
					<a href={path()} class={primary}>
						{t('returnToGame')}
					</a>
				)}
			</Show>
			<Show when={view()} fallback={<p role="alert">{t('error')}</p>}>
				{(current) => (
					<>
						<ConsoleCard title={t('title')} bodyClassName="space-y-4 text-sm">
							<Switch>
								<Match when={!current().salesOpen}>
									<p>{t('closed')}</p>
								</Match>
								<Match when={current().source === 'none' || current().source === 'trial'}>
									<p>
										{current().source === 'none'
											? t('free')
											: trial('endsOn', { date: date(current().trialEndsMs) })}
									</p>
									<a href={localizedPath(locale, '/pricing')} class={primary}>
										{props.t('plus.unlock.cta')}
									</a>
								</Match>
								<Match when={current().source === 'family'}>
									<p>{t('viaFamily')}</p>
								</Match>
								<Match when={current().source === 'plus'}>
									<p class="font-display text-lg">
										{current().planId ? t(`plan.${current().planId}`) : null}
									</p>
									<p>{t(`status.${statusKey(current().status)}`)}</p>
									<p class="text-muted-foreground">
										{t(
											current().cancelAtPeriodEnd || isOneTimePassPlan(current().planId)
												? 'ends'
												: 'renews',
											{ date: date(current().periodEndMs) },
										)}
									</p>
									<Show
										when={confirming() === 'cancel' && !isOneTimePassPlan(current().planId)}
										fallback={
											<div class="flex flex-wrap gap-2">
												<button
													type="button"
													class={secondary}
													disabled={busy()}
													onClick={() =>
														run(async ({ openPortal }) => {
															const url = await openPortal(locale)
															if (mounted) window.location.assign(url)
														})
													}
												>
													{t('manage')}
												</button>
												<Show when={!isOneTimePassPlan(current().planId)}>
													<Show
														when={current().cancelAtPeriodEnd}
														fallback={
															<button
																type="button"
																class={secondary}
																disabled={busy()}
																onClick={() => setConfirming('cancel')}
															>
																{t('cancel')}
															</button>
														}
													>
														<button
															type="button"
															class={primary}
															disabled={busy()}
															onClick={() =>
																run(async ({ resumeSubscription }) => {
																	await resumeSubscription()
																	return t('resumed')
																})
															}
														>
															{t('resume')}
														</button>
													</Show>
												</Show>
											</div>
										}
									>
										<div class="space-y-3 rounded-xl border border-border p-4">
											<p>{t('cancelPeriodConfirm', { date: date(current().periodEndMs) })}</p>
											<div class="flex flex-wrap gap-2">
												<button
													type="button"
													class={primary}
													disabled={busy()}
													onClick={() =>
														run(async ({ cancelSubscription }) => {
															const done = await cancelSubscription()
															return t('cancelledPeriod', { date: date(done.accessEndsAtMs) })
														})
													}
												>
													{t('cancel')}
												</button>
												<button
													type="button"
													class={secondary}
													disabled={busy()}
													onClick={() => setConfirming(null)}
												>
													{t('resume')}
												</button>
											</div>
										</div>
									</Show>
								</Match>
							</Switch>
						</ConsoleCard>
						<Show when={current().family}>
							{(group) => (
								<ConsoleCard title={family('title')} bodyClassName="space-y-4 text-sm">
									<Show when={group().role === 'owner' && inviteUrl()}>
										<div class="space-y-2">
											<p>{family('inviteBody', { count: group().maxMembers })}</p>
											<p
												ref={inviteRef}
												tabIndex={-1}
												class="select-all break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs"
											>
												{inviteUrl()}
											</p>
											<div class="flex flex-wrap gap-2">
												<button
													type="button"
													class={secondary}
													onClick={copy}
													disabled={copyState() === 'pending'}
													aria-busy={copyState() === 'pending'}
												>
													<span aria-live="polite">
														{copyState() === 'pending'
															? props.t('common.clipboard.pending')
															: family(copyState() === 'copied' ? 'copied' : 'copy')}
													</span>
												</button>
												<button
													type="button"
													class={secondary}
													disabled={busy()}
													title={family('newLinkHelp')}
													onClick={() =>
														run(async ({ resetFamilyInvite }) => {
															const code = await resetFamilyInvite()
															if (mounted) setReplacement(code)
															return family('newLinkHelp')
														})
													}
												>
													{family('newLink')}
												</button>
											</div>
											<Show when={copyState() === 'failed'}>
												<p role="alert" class="text-destructive">
													{props.t('common.clipboard.failed')}
												</p>
											</Show>
										</div>
									</Show>
									<div>
										<h3 class="font-semibold">{family('members')}</h3>
										<ul class="mt-2 divide-y divide-border">
											<For each={group().members}>
												{(member) => (
													<li class="flex min-h-11 items-center justify-between gap-3">
														<span>
															{member.displayName || family('unnamed')}{' '}
															<Show when={member.owner}>
																<span class="ml-2 text-muted-foreground">{family('owner')}</span>
															</Show>
														</span>
														<Show when={group().role === 'owner' && !member.owner}>
															<button
																type="button"
																class={secondary}
																disabled={busy()}
																onClick={() =>
																	run(({ removeFamilyMember }) => removeFamilyMember(member.userId))
																}
															>
																{family('remove')}
															</button>
														</Show>
													</li>
												)}
											</For>
										</ul>
									</div>
									<Show when={group().role === 'member'}>
										<Show
											when={confirming() === 'leave'}
											fallback={
												<button
													type="button"
													class={secondary}
													disabled={busy()}
													onClick={() => setConfirming('leave')}
												>
													{family('leave')}
												</button>
											}
										>
											<div class="space-y-3 rounded-xl border border-border p-4">
												<p>{family('leaveConfirm')}</p>
												<button
													type="button"
													class={primary}
													disabled={busy()}
													onClick={() => run(({ leaveFamily }) => leaveFamily())}
												>
													{family('leave')}
												</button>
											</div>
										</Show>
									</Show>
								</ConsoleCard>
							)}
						</Show>
					</>
				)}
			</Show>
		</div>
	)
}

function statusKey(status: string | null) {
	if (status === 'trialing') return 'active'
	return status === 'active' || status === 'past_due' || status === 'canceled' ? status : 'other'
}
