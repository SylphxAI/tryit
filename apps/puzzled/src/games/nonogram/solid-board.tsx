/** @jsxImportSource solid-js */
import { X } from 'lucide-solid'
import { createMemo, createSignal, onMount, Show } from 'solid-js'
import { puzzleThemeLabel } from '@/games/shared/puzzle-theme-label'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { PAINT_MODE_CUE_SEEN_DAY_KEY } from '@/lib/storage-keys'
import { createNonogramPlay } from './create-nonogram-play'
import { cueAfterMove, initialModeCue, type ModeCue } from './mode-cue'
import { NonogramControls } from './nonogram-controls'
import { NonogramGrid } from './nonogram-grid'
import { parseNonogramClientPayload } from './parse-client'
import zhTwThemes from './puzzle-themes.zh-TW.json'
import type { NonogramPuzzleData } from './types'

export default function NonogramBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseNonogramClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Board {...props} data={data} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { data: NonogramPuzzleData }) {
	const t = createTranslator(props.locale)
	const { width, height, theme } = props.data
	const finish = createBoardFinish(props, 'nonogram')
	const [cue, setCue] = createSignal<ModeCue>()
	const [reserveCue, setReserveCue] = createSignal(false)
	// Completed daily responses never mount a playable board. Keep archive/practice unchanged.
	onMount(() => {
		if ((props.mode ?? 'daily') !== 'daily' || props.puzzle.kind !== 'playable') return
		const day = props.puzzle.puzzleDate
		try {
			setCue(initialModeCue(day, localStorage.getItem(PAINT_MODE_CUE_SEEN_DAY_KEY)))
			if (cue()) localStorage.setItem(PAINT_MODE_CUE_SEEN_DAY_KEY, day)
		} catch {
			// If storage is blocked, still offer the cue on this visit.
			setCue(initialModeCue(day, null))
		}
		setReserveCue(Boolean(cue()))
	})
	const play = createNonogramPlay(props.data, finish, (before, after, edit) =>
		setCue((previous) => cueAfterMove(previous, before, after, props.data, edit)),
	)
	const modeLabel = () =>
		t(play.mode() === 'filled' ? 'games.nonogram.fillMode' : 'games.nonogram.markMode')
	return (
		<div class="play-split mx-auto w-full max-w-[30rem] space-y-3" data-nonogram-board>
			<div
				class="play-meta flex items-center justify-between gap-2 text-sm text-muted-foreground"
				classList={{ 'min-h-11': reserveCue() }}
			>
				<span>
					{finish.state() === 'accepted'
						? puzzleThemeLabel(theme, props.locale, zhTwThemes, t('games.nonogram.name'))
						: `${width}×${height}`}
				</span>
				<Show when={cue() && cue()?.phase !== 'quiet' && !play.locked()}>
					<div
						class="flex items-center gap-1 rounded-xl bg-surface-muted ps-3 text-foreground"
						data-paint-mode-cue
					>
						<div role="status" class="py-1 text-sm font-semibold leading-tight">
							{cue()?.phase === 'mark' && play.mode() === 'filled'
								? t('games.nonogram.switchToMark')
								: t('games.nonogram.currentMode', { mode: modeLabel() })}
						</div>
						<button
							type="button"
							class="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
							aria-label={t('common.dismiss')}
							onClick={() => setCue(undefined)}
						>
							<X size={16} aria-hidden="true" />
						</button>
					</div>
				</Show>
			</div>
			<NonogramGrid data={props.data} play={play} t={t} />
			<NonogramControls locale={props.locale} play={play} t={t} />
			<BoardFinish finish={finish} locale={props.locale} message={t('games.nonogram.complete')} />
		</div>
	)
}
