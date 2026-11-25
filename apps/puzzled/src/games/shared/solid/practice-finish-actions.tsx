/** @jsxImportSource solid-js */
import { Show } from 'solid-js'
import { gamePath } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

export function PracticeFinishActions(props: {
	locale: Locale
	gameSlug: string
	attempts: number
	score?: number
	reveal?: string
	onNewPractice?: () => void
}) {
	const t = createTranslator(props.locale)
	const number = new Intl.NumberFormat(props.locale)
	return (
		<div class="mt-3 grid gap-3" data-practice-finish>
			<Show when={props.reveal}>
				<p>{props.reveal}</p>
			</Show>
			<dl class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
				<div class="flex gap-2">
					<dt>{t('gameResult.attempts')}</dt>
					<dd class="font-bold tabular-nums">{number.format(props.attempts)}</dd>
				</div>
				<Show when={props.score !== undefined}>
					<div class="flex gap-2">
						<dt>{t('gameResult.score')}</dt>
						<dd class="font-bold tabular-nums">{number.format(props.score ?? 0)}</dd>
					</div>
				</Show>
			</dl>
			<Show when={props.onNewPractice}>
				<button
					type="button"
					class="chrome-control chrome-primary min-h-12 px-4 font-bold"
					onClick={props.onNewPractice}
				>
					{t('practice.newAfterFinish')}
				</button>
			</Show>
			<a
				class="chrome-control min-h-12 justify-self-start underline"
				href={localizedPath(props.locale, `${gamePath(props.gameSlug)}#play`)}
			>
				{t('practice.backToToday')}
			</a>
		</div>
	)
}
