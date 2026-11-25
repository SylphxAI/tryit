/** @jsxImportSource solid-js */
import { Show } from 'solid-js'
import { formatTrialEnd, trialBannerEndMs } from '@/lib/billing/plus'
import { primary } from './subscription-buttons'
import { createFamilyInvite, SubscriptionFamily } from './subscription-family'
import { SubscriptionPlan } from './subscription-plan'
import { createSubscriptionState, type SubscriptionPanelProps } from './subscription-state'

export function SubscriptionPanel(props: SubscriptionPanelProps) {
	const { locale, handoff } = props.data
	const t = (key: string, values?: Record<string, string | number>) =>
		props.t(`plus.subscription.${key}`, values)
	const family = (key: string, values?: Record<string, string | number>) =>
		props.t(`plus.family.${key}`, values)
	const trial = (key: string, values: Record<string, string>) =>
		props.t(`plus.trial.${key}`, values)
	const date = (ms: number | null) => (ms ? formatTrialEnd(ms, locale) : '')
	const state = createSubscriptionState(props, t, family)
	const { view, confirmed, message, browser } = state
	const invite = createFamilyInvite(state)
	const trialEnd = () => {
		const current = view()
		const now = browser()?.now
		return current && now ? trialBannerEndMs(current, now) : null
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
						<SubscriptionPlan
							current={current}
							locale={locale}
							t={t}
							trial={trial}
							date={date}
							unlock={() => props.t('plus.unlock.cta')}
							actions={state}
						/>
						<Show when={current().family}>
							{(group) => (
								<SubscriptionFamily
									group={group}
									family={family}
									translate={(key, values) => props.t(key, values)}
									actions={state}
									invite={invite}
								/>
							)}
						</Show>
					</>
				)}
			</Show>
		</div>
	)
}
