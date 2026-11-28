/** @jsxImportSource solid-js */
import { For } from 'solid-js'
import { playButton } from '@/features/catalog/solid/game-landing'
import type { Translate } from '@/lib/i18n/translate'
import type { CrosswordPlay } from './create-crossword-play'

const keyboard = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM⌫']

export function CrosswordEntry(props: {
	play: Pick<CrosswordPlay, 'playing' | 'enter' | 'check' | 'feedback'>
	t: Translate
}) {
	const { playing, enter, check, feedback } = props.play
	const { t } = props
	const incomplete = t('games.crossword.messages.incomplete')
	return (
		<>
			<div class="flex flex-col gap-1" dir="ltr" data-play-control>
				<For each={keyboard}>
					{(row) => (
						<div class="flex justify-center gap-1">
							<For each={row.split('')}>
								{(key) => (
									<button
										type="button"
										aria-label={key === '⌫' ? t('games.wordGuess.keyboard.delete') : key}
										disabled={!playing()}
										class="min-h-11 w-[9.5%] min-w-0 rounded-lg border border-border bg-card font-semibold inset-shadow-[0_-2px_var(--color-border)] enabled:hover:bg-accent-warm-soft enabled:active:bg-accent-warm enabled:active:text-on-accent enabled:active:inset-shadow-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-info"
										onClick={() => enter(key)}
									>
										{key}
									</button>
								)}
							</For>
						</div>
					)}
				</For>
			</div>
			<button
				type="button"
				data-play-control
				class={playButton}
				disabled={!playing()}
				onClick={check}
			>
				{t('games.crossword.check')}
			</button>
			{/* Reserve the wrapped height of the longest message without announcing it. */}
			<div class="grid min-h-6 text-sm text-destructive">
				<span aria-hidden="true" class="invisible col-start-1 row-start-1">
					{incomplete}
				</span>
				<p role="alert" class="col-start-1 row-start-1">
					{feedback() === 'incomplete'
						? incomplete
						: feedback()
							? t('games.crossword.messages.incorrect')
							: ''}
				</p>
			</div>
		</>
	)
}
