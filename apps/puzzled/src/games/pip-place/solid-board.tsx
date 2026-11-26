/** @jsxImportSource solid-js */
import { createMemo, Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createPipPlacePlay } from './create-pip-place-play'
import { parsePipPlaceClientPayload } from './parse-client'
import { PipActions, PipTray } from './pip-controls'
import { PipGrid } from './pip-grid'
import type { PipPlacePuzzleData } from './types'

export default function PipPlaceBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parsePipPlaceClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <PipPlace {...props} data={data} />}
		</Show>
	)
}

function PipPlace(props: DailyBoardProps & { data: PipPlacePuzzleData }) {
	const t = createTranslator(props.locale)
	const play = createPipPlacePlay(props)
	const { finish, playing } = play

	return (
		<div class="play-split mx-auto flex w-full max-w-sm flex-col gap-4" data-pip-place-board>
			<div class="play-meta flex flex-wrap items-center justify-between gap-x-3 text-sm">
				<p>{t('games.pipPlace.name')}</p>
			</div>
			<Show when={playing()}>
				<PipActions play={play} t={t} />
			</Show>
			<PipGrid data={props.data} play={play} t={t} />
			<Show when={playing()}>
				<PipTray play={play} t={t} />
			</Show>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={t('games.pipPlace.complete')}
				shareTitle={t('games.pipPlace.name')}
			/>
		</div>
	)
}
