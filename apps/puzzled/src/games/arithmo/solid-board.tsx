/** @jsxImportSource solid-js */
import { createMemo, Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { ArithmoGrid } from './arithmo-grid'
import { ArithmoKeypad } from './arithmo-keypad'
import { createArithmoPlay } from './create-arithmo-play'
import { parseArithmoClientPayload } from './feedback'
import type { CharStatus } from './types'

export default function ArithmoBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const playable = createMemo(() => parseArithmoClientPayload(props.puzzle.puzzleData))
	return (
		<Show when={playable()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			<Arithmo {...props} />
		</Show>
	)
}

function Arithmo(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const text = (key: string) => t(`games.arithmo.${key}`)
	const {
		finish,
		graded,
		keyboard,
		draft,
		grading,
		tileHelp,
		error,
		outcome,
		inactive,
		showTileHelp,
		edit,
		grade,
		reveal,
		shareText,
	} = createArithmoPlay(props)
	const feedbackText = (tile: CharStatus) =>
		tile !== 'empty' ? text(`feedback.${tile}`) : undefined

	return (
		<div class="mx-auto flex w-full max-w-sm flex-col gap-3" data-arithmo-board>
			<ArithmoGrid
				graded={graded}
				outcome={outcome}
				draft={draft}
				grading={grading}
				showTileHelp={showTileHelp}
				t={t}
				text={text}
				feedbackText={feedbackText}
			/>
			<Show when={tileHelp()}>
				<p role="status" class="text-sm">
					{text('messages.entryOrder')}
				</p>
			</Show>
			<Show when={grading()}>
				<p role="status" class="text-sm">
					{t('common.syncing')}
				</p>
			</Show>
			<Show when={error()}>
				{(kind) => (
					<p role="alert" class="text-sm text-destructive">
						{kind() === 'grade' ? t('common.error') : text(`messages.${kind()}`)}{' '}
						<Show when={kind() === 'grade'}>
							<button type="button" class="min-h-12 font-semibold underline" onClick={grade}>
								{t('common.retry')}
							</button>
						</Show>
					</p>
				)}
			</Show>
			<ArithmoKeypad
				keyboard={keyboard}
				inactive={inactive}
				edit={edit}
				grade={grade}
				text={text}
				feedbackText={feedbackText}
			/>
			<Show when={reveal()}>
				{(equation) => (
					<p role="status">{t('gameResult.srLostWithSolution', { word: equation() })}</p>
				)}
			</Show>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={
					outcome() === 'won'
						? t('gameResult.srWonWithAttempts', { attempts: graded().length })
						: t('gameResult.gameOver')
				}
				shareTitle={text('name')}
				shareText={shareText()}
			/>
		</div>
	)
}
