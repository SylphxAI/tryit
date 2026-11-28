/** @jsxImportSource solid-js */
import { Delete } from 'lucide-solid'
import { type Accessor, For } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { Feedback } from './feedback'
import { KEYBOARD_ROWS } from './types'

type WordGuessKeyboardProps = {
	t: Translate
	keys: Accessor<Partial<Record<string, Feedback>>>
	busy: Accessor<boolean>
	tone: (grade: Feedback | undefined, fallback: string) => string
	rules: (grade: Feedback) => string
	edit: (key: string, event: MouseEvent | KeyboardEvent) => void
	grade: (event: MouseEvent | KeyboardEvent) => Promise<void>
}

export function WordGuessKeyboard(props: WordGuessKeyboardProps) {
	const { t, keys, busy, tone, rules, edit, grade } = props
	const feedbackDescription = (grade: Feedback | undefined) => (grade ? rules(grade) : undefined)
	return (
		<fieldset
			data-play-control
			class="grid gap-1"
			aria-label={t('games.wordGuess.rules.rule2')}
			aria-busy={busy()}
		>
			<For each={KEYBOARD_ROWS}>
				{(row) => (
					<div class="flex justify-center gap-1">
						<For each={row}>
							{(key) => {
								const action = key === 'ENTER' || key === 'BACKSPACE'
								const label =
									key === 'ENTER'
										? t('games.wordGuess.keyboard.enter')
										: key === 'BACKSPACE'
											? t('games.wordGuess.keyboard.delete')
											: key
								const keyGrade = () => keys()[key]
								return (
									<button
										type="button"
										aria-label={label}
										aria-description={feedbackDescription(keyGrade())}
										data-grade={keyGrade()}
										aria-disabled={busy() || undefined}
										class={`flex min-h-12 min-w-0 items-center justify-center rounded-md border font-semibold touch-manipulation aria-disabled:opacity-60 ${action ? 'w-[14%] text-xs' : 'w-[9%] text-base'} ${tone(keyGrade(), 'border-border bg-key text-key-text')}`}
										onClick={(event) => (key === 'ENTER' ? void grade(event) : edit(key, event))}
										onKeyDown={(event) => {
											// Keep repeat edits without a second cue from a native click.
											if (event.key !== 'Enter' || !event.repeat) return
											event.preventDefault()
											if (key === 'ENTER') void grade(event)
											else edit(key, event)
										}}
									>
										{key === 'BACKSPACE' ? <Delete size={18} aria-hidden="true" /> : label}
									</button>
								)
							}}
						</For>
					</div>
				)}
			</For>
		</fieldset>
	)
}
