/** @jsxImportSource solid-js */
import { useIsRouting, useNavigate } from '@solidjs/router'
import { For } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { cn } from '@/lib/utils'
import { LEADERBOARD_PERIODS, type LeaderboardPeriod } from '../lib/leaderboard-period'
import type { LeaderboardData } from './leaderboard-data'

export function boardHref(locale: Locale, period: LeaderboardPeriod, module: string) {
	return localizedPath(locale, `/leaderboard?${new URLSearchParams({ period, module })}`)
}

export function LeaderboardControls(props: { data: LeaderboardData; panelId: string }) {
	const t = (key: string) => createTranslator(props.data.locale)(`leaderboard.${key}`)
	const navigate = useNavigate()
	const pending = useIsRouting()
	const tabs: HTMLButtonElement[] = []
	function go(period: LeaderboardPeriod, module: string) {
		navigate(boardHref(props.data.locale, period, module), { replace: true, scroll: false })
	}
	function moveTab(event: KeyboardEvent, index: number) {
		const length = LEADERBOARD_PERIODS.length
		const target = {
			ArrowRight: (index + 1) % length,
			ArrowLeft: (index + length - 1) % length,
			Home: 0,
			End: length - 1,
		}
		if (!Object.hasOwn(target, event.key)) return
		event.preventDefault()
		tabs[target[event.key as keyof typeof target]]?.focus()
	}
	return (
		<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
			<div
				role="tablist"
				aria-label={t('scopeLabel')}
				class="flex w-full gap-1 rounded-2xl border border-border/70 bg-surface-muted/60 p-1 lg:w-auto"
			>
				<For each={LEADERBOARD_PERIODS}>
					{(value, index) => {
						const selected = () => value === props.data.period
						return (
							<button
								ref={(element) => {
									tabs[index()] = element
								}}
								type="button"
								role="tab"
								id={`board-tab-${value}`}
								aria-selected={selected()}
								aria-controls={props.panelId}
								tabIndex={selected() ? 0 : -1}
								onClick={() => go(value, props.data.moduleSlug)}
								onKeyDown={(event) => moveTab(event, index())}
								class={cn(
									'min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold transition-colors lg:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
									selected()
										? 'bg-background text-foreground shadow-sm'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground',
								)}
							>
								{t(`period.${value}`)}
							</button>
						)
					}}
				</For>
			</div>
			<div class="w-full lg:w-72">
				<label
					for="board-module"
					class="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
				>
					{t('moduleLabel')}
				</label>
				<select
					id="board-module"
					value={props.data.moduleSlug}
					onChange={(event) => go(props.data.period, event.currentTarget.value)}
					class="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<For each={props.data.modules}>
						{(module) => (
							<option value={module.slug} selected={module.slug === props.data.moduleSlug}>
								{module.name}
							</option>
						)}
					</For>
				</select>
			</div>
			<output aria-live="polite" class="sr-only">
				{pending() ? t('loadingBoard') : ''}
			</output>
		</div>
	)
}
