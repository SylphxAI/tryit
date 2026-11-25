/** @jsxImportSource solid-js */
import { ArrowRight } from 'lucide-solid'
import { For, type JSX } from 'solid-js'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { DAILY_FREE_PICKS } from '../lib/daily-picks'
import { dailyResumePath } from '../lib/daily-resume-path'
import { markStartIntent } from '../lib/start-intent'
import { todayPlayPath } from '../lib/today-play-path'

export function DailyPickSteps(props: { count: number; class: string; filledClass?: string }) {
	return (
		<span class={props.class} aria-hidden="true">
			<For each={Array.from({ length: DAILY_FREE_PICKS })}>
				{(_, i) => (
					<span
						class={i() < props.count ? props.filledClass : undefined}
						data-filled={i() < props.count || undefined}
					/>
				)}
			</For>
		</span>
	)
}

export function DailyNextLink(props: {
	slug: string
	locale: Locale
	dayKey: string
	resume: boolean
	class: string
}) {
	const t = createTranslator(props.locale)
	const start: JSX.EventHandler<HTMLAnchorElement, MouseEvent> = (event) => {
		if (
			!event.defaultPrevented &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey
		) {
			markStartIntent(props.slug)
		}
	}
	return (
		<a
			class={props.class}
			href={localizedPath(
				props.locale,
				props.resume ? dailyResumePath(props.dayKey, props.slug) : todayPlayPath(props.slug),
			)}
			onClick={props.resume ? undefined : start}
		>
			{t(props.resume ? 'gameResult.resumeNext' : 'gameResult.playNext', {
				game: t(`games.${slugToCamelCase(props.slug)}.name`),
			})}
			<ArrowRight size={16} aria-hidden="true" />
		</a>
	)
}
