/** @jsxImportSource solid-js */
import { Check, RotateCcw } from 'lucide-solid'
import { createMemo, For, Show } from 'solid-js'
import { puzzleThemeLabel } from '@/games/shared/puzzle-theme-label'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { createWordSearchPlay } from './create-word-search-play'
import { parseWordSearchClientPayload, type WordSearchClientData } from './parse-client'
import zhTwThemes from './puzzle-themes.zh-TW.json'
import { WordSearchGrid } from './word-search-grid'

export default function WordSearchBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseWordSearchClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Board {...props} data={data} t={t} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { data: WordSearchClientData; t: Translate }) {
	const { t } = props
	const { grid, words, theme } = props.data
	const play = createWordSearchPlay(props, props.data)
	const { finish, found, invalid, locked, reset } = play
	let resetTouch: number | undefined

	return (
		<div class="mx-auto w-full max-w-sm space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="font-semibold">
					{puzzleThemeLabel(theme, props.locale, zhTwThemes, t('games.wordSearch.name'))}
				</span>
				<output class="tabular-nums" aria-live="polite">
					{found().size}/{words.length}
				</output>
				<button
					type="button"
					class="grid size-11 touch-manipulation place-items-center rounded-lg border border-border"
					aria-label={t('common.reset')}
					disabled={locked()}
					onPointerDown={(event) => {
						if (event.pointerType === 'touch' && event.isPrimary) resetTouch = event.pointerId
					}}
					onPointerCancel={(event) => {
						if (resetTouch === event.pointerId) resetTouch = undefined
					}}
					onPointerUp={(event) => {
						// Chromium can deliver the next tap's pointerup after a drag,
						// but suppress its click. Require a touch that began here and
						// still ends inside the button.
						if (event.pointerType !== 'touch' || resetTouch !== event.pointerId) return
						resetTouch = undefined
						if (
							event.currentTarget.contains(document.elementFromPoint(event.clientX, event.clientY))
						)
							reset()
					}}
					onClick={reset}
				>
					<RotateCcw size={16} aria-hidden="true" />
				</button>
			</div>
			<WordSearchGrid grid={grid} play={play} t={t} />
			<ul class="flex flex-wrap justify-center gap-2">
				<For each={words}>
					{(word) => (
						<li
							class="flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-sm data-found:bg-emerald-500/25 data-found:line-through"
							data-found={found().has(word) || undefined}
						>
							<Show when={found().has(word)}>
								<Check size={12} aria-hidden="true" />
							</Show>
							{word}
						</li>
					)}
				</For>
			</ul>
			<p role="status" class="min-h-5 text-center text-sm text-muted-foreground">
				{invalid() ? t('games.wordSearch.invalidSelection') : ''}
			</p>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.wordSearch.complete')} />
		</div>
	)
}
