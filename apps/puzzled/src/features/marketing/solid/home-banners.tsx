/** @jsxImportSource solid-js */
import { type Accessor, createSignal, For, Show, Suspense } from 'solid-js'
import {
	addDismissed,
	DISMISSED_COOKIE,
	parseDismissed,
	serializeDismissedCookie,
} from '@/features/announcements/lib/dismissed'
import { getGameColors } from '@/games/theme-colors'
import { formatTrialEnd } from '@/lib/billing/plus'
import type { Translate } from '@/lib/i18n/translate'
import { cn } from '@/lib/utils'
import type { HomeDocument, HomeFacts } from './home-data'
import { MilestonePrompt } from './milestone-prompt'

export function HomeBanners(props: {
	page: HomeDocument
	facts: Accessor<HomeFacts | undefined>
	t: Translate
	href: (path: string) => string
	now: Accessor<number>
	mounted: Accessor<boolean>
}) {
	const { page, t, href, now, mounted } = props
	const [dismissed, setDismissed] = createSignal<readonly string[]>([])
	const dismiss = (id: string) => {
		const raw = document.cookie
			.split('; ')
			.find((cookie) => cookie.startsWith(`${DISMISSED_COOKIE}=`))
			?.slice(DISMISSED_COOKIE.length + 1)
		const ids = addDismissed(parseDismissed(raw), id)
		// biome-ignore lint/suspicious/noDocumentCookie: shared dismissal state is read by the server on the next visit
		document.cookie = serializeDismissedCookie(ids, location.protocol === 'https:')
		setDismissed(ids)
	}
	return (
		<>
			<Show when={props.facts()?.milestone} keyed>
				{(milestone) => (
					<MilestonePrompt locale={page.locale} count={page.catalog.length} milestone={milestone} />
				)}
			</Show>
			<Show when={page.season}>
				{(season) => (
					<aside
						data-season={season().id}
						class={cn(
							'border-b border-foreground/10',
							getGameColors(season().accent).bg,
							getGameColors(season().accent).onField,
						)}
					>
						<p class="page-shell-wide flex justify-center gap-2 py-2 text-sm">
							<span aria-hidden="true">{season().glyph}</span>
							{t(`home.seasons.${season().id}`)}
						</p>
					</aside>
				)}
			</Show>
			<Suspense>
				<For each={props.facts()?.notices.filter((notice) => !dismissed().includes(notice.id))}>
					{(notice) => (
						<aside class="border-b border-hairline bg-accent">
							<div class="page-shell-wide flex items-center justify-between gap-4 py-2">
								<div>
									<strong>{notice.title}</strong>
									<p>{notice.body}</p>
								</div>
								<Show when={notice.dismissible}>
									<button
										type="button"
										class="min-h-11 underline"
										onClick={() => dismiss(notice.id)}
									>
										{t('common.dismiss')}
									</button>
								</Show>
							</div>
						</aside>
					)}
				</For>
				<Show when={mounted() && props.facts()?.trialEndsMs}>
					{(end) => (
						<Show when={end() > now() && end() - now() <= 3 * 86_400_000}>
							<div class="page-shell-wide pt-4 text-sm">
								{t('plus.trial.endingSoon', { date: formatTrialEnd(end(), page.locale) })}{' '}
								<a class="underline" href={href('/settings/subscription')}>
									{t('plus.pricing.manage')}
								</a>
							</div>
						</Show>
					)}
				</Show>
			</Suspense>
		</>
	)
}
