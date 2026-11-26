/** @jsxImportSource solid-js */
import { createMemo, Show } from 'solid-js'
import { puzzleThemeLabel } from '@/games/shared/puzzle-theme-label'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createNonogramPlay } from './create-nonogram-play'
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
	const play = createNonogramPlay(props.data, finish)
	return (
		<div class="play-split mx-auto w-full max-w-[30rem] space-y-3" data-nonogram-board>
			<div class="play-meta flex items-center justify-between gap-2 text-sm text-muted-foreground">
				<span>
					{finish.state() === 'accepted'
						? puzzleThemeLabel(theme, props.locale, zhTwThemes, t('games.nonogram.name'))
						: `${width}×${height}`}
				</span>
			</div>
			<NonogramGrid data={props.data} play={play} t={t} />
			<NonogramControls locale={props.locale} play={play} t={t} />
			<BoardFinish finish={finish} locale={props.locale} message={t('games.nonogram.complete')} />
		</div>
	)
}
