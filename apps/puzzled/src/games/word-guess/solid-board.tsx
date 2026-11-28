/** @jsxImportSource solid-js */
import { Volume2, VolumeX } from 'lucide-solid'
import { createMemo, Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createWordGuessPlay } from './create-word-guess-play'
import { type Feedback, wordKeyFeedback } from './feedback'
import { WordGuessGrid } from './word-guess-grid'
import { WordGuessKeyboard } from './word-guess-keyboard'

const tones: Record<Feedback, string> = {
	correct: 'border-correct bg-correct text-[#1a1712]',
	present: 'border-present bg-present text-[#1a1712]',
	absent: 'border-border bg-muted text-muted-foreground',
}
const badges: Record<Feedback, string> = { correct: '🟪', present: '🟧', absent: '⬛' }
const tone = (grade: Feedback | undefined, fallback: string) => (grade ? tones[grade] : fallback)

export default function WordGuessBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const {
		playable,
		finish,
		sound,
		rows,
		draft,
		pendingWord,
		grading,
		busy,
		inactive,
		error,
		showInputHint,
		outcome,
		showKeyboardHint,
		edit,
		grade,
	} = createWordGuessPlay(props, t)
	const keys = createMemo(() => wordKeyFeedback(rows()))
	const shareText = () =>
		rows()
			.map((row) => row.tiles.map((tile) => badges[tile]).join(''))
			.join('\n')
	const result = createMemo(() => {
		if (outcome() === 'won') return t('games.wordGuess.messages.correct')
		try {
			const { word } = JSON.parse(finish.revealJson() ?? '{}') as { word?: unknown }
			if (typeof word === 'string' && /^[a-z]{5}$/i.test(word)) {
				return t('games.wordGuess.messages.gameOver', { word: word.toUpperCase() })
			}
		} catch {
			// Do not guess at a reveal if the accepted response has no readable word.
		}
		return t('gameResult.gameOver')
	})
	const rules = (grade: Feedback) => t(`games.wordGuess.rules.${grade}`)

	return (
		<Show when={playable} fallback={<p role="status">{t('daily.unavailableTitle')}</p>}>
			<div class="mx-auto w-full max-w-md space-y-3">
				<WordGuessGrid
					t={t}
					rows={rows}
					draft={draft}
					pendingWord={pendingWord}
					outcome={outcome}
					inactive={inactive}
					busy={busy}
					tone={tone}
					rules={rules}
					onTileClick={showKeyboardHint}
				/>
				<Show when={!outcome()}>
					<WordGuessKeyboard
						t={t}
						keys={keys}
						busy={busy}
						tone={tone}
						rules={rules}
						edit={edit}
						grade={grade}
					/>
					<div class="flow-root min-h-12 text-center text-sm [&>p]:pt-3">
						<button
							type="button"
							aria-pressed={sound.enabled() === true}
							disabled={sound.enabled() === undefined}
							class="pressable float-right ml-2 inline-flex min-h-12 min-w-12 touch-manipulation items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 font-semibold text-foreground disabled:opacity-50 aria-pressed:bg-muted"
							onClick={sound.toggle}
						>
							<Show when={sound.enabled()} fallback={<VolumeX size={18} aria-hidden="true" />}>
								<Volume2 size={18} aria-hidden="true" />
							</Show>
							{t('games.wordGuess.sound')}
						</button>
						<p role="status">{showInputHint() ? t('games.wordGuess.messages.useKeyboard') : ''}</p>
						<Show when={grading()}>
							<p role="status">{t('common.syncing')}</p>
						</Show>
						<Show when={error()}>
							<p role="alert" class="text-error">
								{error()}
							</p>
						</Show>
					</div>
				</Show>
				<BoardFinish
					finish={finish}
					locale={props.locale}
					message={result()}
					practiceReveal={<p>{result()}</p>}
					shareTitle={t('games.wordGuess.name')}
					shareText={shareText()}
				/>
			</div>
		</Show>
	)
}
