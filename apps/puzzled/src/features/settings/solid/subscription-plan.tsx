/** @jsxImportSource solid-js */
import { type Accessor, Match, Show, Switch } from 'solid-js'
import { ConsoleCard } from '@/features/console/solid/console-chrome'
import { isOneTimePassPlan } from '@/lib/billing/plus'
import { localizedPath } from '@/lib/seo/urls'
import { primary, secondary } from './subscription-buttons'
import type { SubscriptionActions, SubscriptionCopy, SubscriptionView } from './subscription-state'

type Props = {
	current: Accessor<SubscriptionView>
	locale: string
	t: SubscriptionCopy
	trial: (key: string, values: Record<string, string>) => string
	date: (ms: number | null) => string
	unlock: Accessor<string>
	actions: SubscriptionActions
}

export function SubscriptionPlan(props: Props) {
	const { current, locale, t, trial, date } = props
	const { busy, confirming, setConfirming, isMounted, run } = props.actions
	return (
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
						{props.unlock()}
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
											if (isMounted()) window.location.assign(url)
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
	)
}

function statusKey(status: string | null) {
	if (status === 'trialing') return 'active'
	return status === 'active' || status === 'past_due' || status === 'canceled' ? status : 'other'
}
