/** @jsxImportSource solid-js */
import { createMemo, Index, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createHivePlay } from './create-hive-play'
import { FoundWords } from './found-words'
import { HexComb, HiveActions } from './hex-comb'
import { parseWordHiveClientPayload } from './parse-client'
import { RankRail, translateRank } from './rank-rail'
import type { SpellingBeeRank, WordHivePlayData } from './types'
import './hive.css'

export { RankRail } from './rank-rail'

const errorKeys = {
	too_short: 'tooShort',
	missing_center: 'missingCenter',
	invalid_letter: 'invalidLetter',
	already_found: 'alreadyFound',
	not_in_list: 'notInList',
} as const

export default function WordHiveBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseWordHiveClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Hive {...props} data={data} />}
		</Show>
	)
}

function Hive(props: DailyBoardProps & { data: WordHivePlayData }) {
	const t = createTranslator(props.locale)
	const { state, finish, error, lastFound, result, canPlay, edit, shuffle, submit } =
		createHivePlay(props)
	const rankLabel = (rank: SpellingBeeRank) => translateRank(t, rank)
	const errorMessage = () => {
		const key = error()
		if (!key) return ''
		return key === 'grade' ? t('common.error') : t(`games.wordHive.messages.${errorKeys[key]}`)
	}
	let pointerButton: HTMLElement | undefined
	const scoreLabel = (score: number) => `${t('gameResult.score')}: ${score}`

	function handleKey(event: KeyboardEvent) {
		if (
			!canPlay() ||
			event.defaultPrevented ||
			event.isComposing ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				target.closest('input, textarea, select, [contenteditable], [role="dialog"]'))
		)
			return
		if (event.key === 'Enter' || event.key === ' ') {
			if (
				target instanceof HTMLElement &&
				target.closest('button, a, summary') &&
				!(event.key === 'Enter' && target === pointerButton)
			)
				return
			event.preventDefault()
			if (event.repeat) return
			if (event.key === ' ') shuffle()
			else void submit()
		} else if (event.key === 'Backspace' || /^[a-z]$/i.test(event.key)) {
			event.preventDefault()
			edit(event.key === 'Backspace' ? event.key : event.key.toUpperCase())
		}
	}
	onMount(() => {
		window.addEventListener('keydown', handleKey)
		onCleanup(() => window.removeEventListener('keydown', handleKey))
	})

	return (
		<div
			class="mx-auto w-full max-w-sm space-y-2"
			data-hive-board
			onClick={(event) => {
				const button =
					event.target instanceof Element &&
					event.target.closest<HTMLButtonElement>('button[data-hive-key]')
				if (button && event.detail > 0) pointerButton = button
			}}
			onFocusOut={() => {
				pointerButton = undefined
			}}
		>
			<RankRail state={state()} t={t} />
			<div class="min-h-[3.25rem]">
				<div
					class="h-[3.25rem] rounded-xl border border-border bg-surface px-3 text-center"
					data-hive-draft
					data-play-control
				>
					<div
						class="h-full content-center overflow-y-auto py-2 font-display text-2xl leading-8 font-bold tracking-widest wrap-anywhere"
						aria-live="polite"
						lang="en"
						dir="ltr"
					>
						<Show
							when={state().currentWord}
							fallback={<span aria-hidden="true" class="hive-caret" />}
						>
							<Index each={state().currentWord.split('')}>
								{(letter) => (
									<span
										classList={{
											'text-accent-warm-foreground underline decoration-2 underline-offset-4':
												letter() === state().centerLetter,
										}}
									>
										{letter()}
									</span>
								)}
							</Index>
						</Show>
					</div>
				</div>
			</div>
			<div class="flex h-12 items-center justify-center gap-2 text-sm" data-hive-feedback>
				<p role="status" class="min-w-0 text-center font-semibold">
					<Show when={state().grading}>
						<span class="text-muted-foreground">{t('common.syncing')}</span>
					</Show>
					<Show when={lastFound()}>
						{(found) => (
							<span
								class="wrap-anywhere"
								classList={{ 'text-accent-warm-foreground': found().pangram }}
							>
								<Show when={found().pangram}>
									<span aria-hidden="true">✦ </span>
									{t('games.wordHive.pangram')}
									{' · '}
								</Show>
								<strong lang="en">{found().word}</strong>
								{' · '}
								<span class="tabular-nums">+{found().points}</span>
							</span>
						)}
					</Show>
				</p>
				<p role="alert" class="min-w-0 text-center font-semibold text-destructive">
					{errorMessage()}
				</p>
				<Show when={error() === 'grade'}>
					<button
						type="button"
						class="min-h-12 min-w-12 shrink-0 rounded-md px-2 font-semibold underline"
						onClick={submit}
					>
						{t('common.retry')}
					</button>
				</Show>
			</div>
			<HexComb
				centerLetter={state().centerLetter}
				outerLetters={state().outerLetters}
				grading={state().grading}
				disabled={!canPlay()}
				onEdit={edit}
				t={t}
			/>
			<HiveActions
				currentWord={state().currentWord}
				disabled={!canPlay()}
				onEdit={edit}
				onShuffle={shuffle}
				onSubmit={submit}
				t={t}
			/>
			<FoundWords state={state()} t={t} />
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={`${rankLabel(result()?.rank ?? 'beginner')} · ${scoreLabel(result()?.score ?? 0)}`}
			/>
		</div>
	)
}
