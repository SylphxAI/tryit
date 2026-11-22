/** @jsxImportSource solid-js */
import { Crown, X } from 'lucide-solid'
import { createSignal, onMount, Show } from 'solid-js'
import {
	addDismissed,
	DISMISSED_COOKIE,
	parseDismissed,
	serializeDismissedCookie,
} from '@/features/announcements/lib/dismissed'
import { idsToRecord } from '@/features/plus-offer/lib/plus-offer'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

export function MilestonePrompt(props: {
	locale: Locale
	count: number
	milestone: { day: number; playedDays: number }
}) {
	const t = createTranslator(props.locale)
	const [open, setOpen] = createSignal(true)
	onMount(() => {
		try {
			const cookie = document.cookie
				.split('; ')
				.find((part) => part.startsWith(`${DISMISSED_COOKIE}=`))
			const seen = parseDismissed(cookie?.slice(DISMISSED_COOKIE.length + 1))
			const ids = idsToRecord(props.milestone.day).reduce(addDismissed, seen)
			// biome-ignore lint/suspicious/noDocumentCookie: persist a strictly necessary UI dismissal
			document.cookie = serializeDismissedCookie(ids, window.location.protocol === 'https:')
		} catch {
			// Blocked cookies should not prevent play or hide the offer.
		}
	})
	return (
		<Show when={open()}>
			<aside
				aria-labelledby="plus-milestone-title"
				class="fixed inset-x-4 bottom-24 z-toast mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 shadow-lg sm:left-auto sm:right-4 sm:mx-0"
			>
				<button
					type="button"
					onClick={() => setOpen(false)}
					aria-label={t('common.dismiss')}
					class="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
				>
					<X class="h-4 w-4" aria-hidden="true" />
				</button>
				<h2 id="plus-milestone-title" class="flex items-center gap-2 pr-10 font-display text-base">
					<Crown class="h-4 w-4 text-primary" aria-hidden="true" />
					{t(props.milestone.day >= 7 ? 'plus.offer.day7Title' : 'plus.offer.day3Title', {
						days: props.milestone.playedDays,
					})}
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					{t('plus.offer.milestoneBody', { count: props.count })}
				</p>
				<a
					href={localizedPath(
						props.locale,
						'/pricing?utm_source=tryit&utm_medium=milestone_prompt&entry_surface=milestone_prompt',
					)}
					class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-primary-foreground"
				>
					{t('plus.unlock.cta')}
				</a>
			</aside>
		</Show>
	)
}
