/** @jsxImportSource solid-js */
import { Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createQuadPlay } from './create-quad-play'
import { QuadGrid } from './quad-grid'
import { QuadKeyboard } from './quad-keyboard'
import { type LetterStatus, MAX_GUESSES } from './types'

export default function QuadWordsBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const { state, finish, canPlay, solvedCount, reveal, error, submit, press, clearGuess } =
		createQuadPlay(props)
	const feedback = (status: LetterStatus | undefined) =>
		status && status !== 'empty' ? t(`games.quadWords.keyboard.${status}`) : undefined
	const boardName = (index: number) => t('games.quadWords.board', { number: index + 1 })

	return (
		<div class="play-split mx-auto w-full max-w-[30rem] space-y-3" data-quad-board>
			<div class="play-meta flex min-h-12 items-center justify-between gap-x-3 text-sm">
				{/* A notice takes the progress line's place, so the boards and keys never move. */}
				<div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 leading-5">
					<p
						role="status"
						class="tabular-nums text-muted-foreground"
						classList={{ 'sr-only': Boolean(error()) }}
					>
						{solvedCount()}/4 · {t('gameResult.attempts')} {state().guessHistory.length}/
						{MAX_GUESSES}
					</p>
					<Show when={error()}>
						<p role="alert" class="font-semibold text-destructive">
							{error() === 'length'
								? t('games.quadWords.messages.notEnoughLetters')
								: error() === 'notInWordList'
									? t('games.wordGuess.messages.notInWordList')
									: t('common.error')}
						</p>
					</Show>
					<Show when={state().grading}>
						<p role="status">{t('common.syncing')}</p>
					</Show>
				</div>
				<Show when={error() === 'grade'}>
					<button type="button" class="min-h-12 shrink-0 font-semibold underline" onClick={submit}>
						{t('common.retry')}
					</button>
				</Show>
				{/* CheckGuess caps the served puzzle at nine; only ungraded input can be cleared. */}
				<button
					type="button"
					data-play-control
					class="min-h-12 shrink-0 font-semibold underline disabled:opacity-50"
					disabled={!canPlay() || !state().currentGuess}
					onClick={clearGuess}
				>
					{t('games.quadWords.clearGuess')}
				</button>
			</div>
			<QuadGrid
				state={state()}
				canPlay={canPlay()}
				reveal={reveal()}
				locale={props.locale}
				boardName={boardName}
				feedback={feedback}
			/>
			<QuadKeyboard
				state={state()}
				t={t}
				boardName={boardName}
				feedback={feedback}
				onPress={press}
			/>

			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={
					state().gameStatus === 'won' ? t('games.quadWords.complete') : t('gameResult.gameOver')
				}
				shareText={
					t('games.quadWords.name') +
					' ' +
					solvedCount() +
					'/4 · ' +
					state().guessHistory.length +
					'/' +
					MAX_GUESSES
				}
			/>
		</div>
	)
}
