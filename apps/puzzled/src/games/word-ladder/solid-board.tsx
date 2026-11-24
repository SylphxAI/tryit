/** @jsxImportSource solid-js */
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js'
import { playButton } from '@/features/catalog/solid/game-landing'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { checkLadderStep } from './check-step'
import { parseWordLadderClientPayload } from './parse-client'
import type { WordLadderPuzzleData } from './types'

export default function WordLadderBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseWordLadderClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Ladder {...props} data={data} />}
		</Show>
	)
}

function Ladder(props: DailyBoardProps & { data: WordLadderPuzzleData }) {
	const t = createTranslator(props.locale)
	const { startWord, endWord, wordLength, minSteps } = props.data
	const finish = createBoardFinish(props, 'word-ladder')
	const [path, setPath] = createSignal([startWord])
	const [input, setInput] = createSignal('')
	const [error, setError] = createSignal<ReturnType<typeof checkLadderStep>>(null)
	const playing = () => finish.state() === 'playing'
	let field: HTMLInputElement | undefined
	const inputId = createUniqueId()

	function addStep(event: SubmitEvent) {
		event.preventDefault()
		const word = input()
		if (!playing() || !word) return
		const invalid = checkLadderStep(path(), word, wordLength)
		setError(invalid)
		if (invalid) {
			triggerHaptic('error')
			field?.focus()
			return
		}
		const next = [...path(), word]
		triggerHaptic('light')
		setPath(next)
		setInput('')
		if (word === endWord) finish.finish({ path: next }, { attempts: next.length - 1 })
		else field?.focus()
	}

	return (
		<div class="mx-auto flex w-full max-w-sm flex-col gap-4" data-ladder-board>
			<div class="flex flex-wrap items-center justify-between gap-x-3 text-sm">
				<p>
					{t('games.wordLadder.target')}{' '}
					<strong lang="en" class="font-display font-bold uppercase tracking-wide">
						{endWord}
					</strong>
				</p>
			</div>
			<ol
				aria-label={t('games.wordLadder.name')}
				class="grid list-none gap-2 rounded-2xl bg-muted p-3"
				data-ladder-path
			>
				<For each={path()}>
					{(word, index) => (
						<li
							class="rounded-xl border border-border bg-background font-display text-lg font-bold uppercase shadow-[0_2px_0_var(--tactile-soft-line)] data-current:border-foreground"
							data-current={index() === path().length - 1 || undefined}
							aria-current={index() === path().length - 1 ? 'step' : undefined}
						>
							<button
								type="button"
								class="block w-full rounded-xl px-3 py-2"
								aria-controls={playing() ? inputId : undefined}
								aria-description={playing() ? t('games.wordLadder.enterWord') : undefined}
								disabled={!playing()}
								onClick={() => field?.focus()}
							>
								<span class="sr-only" lang="en">
									{word}
								</span>
								<span aria-hidden="true" class="flex justify-center gap-1" dir="ltr">
									<For each={word.split('')}>
										{(letter, col) => (
											<span
												data-changed={
													(index() > 0 && path()[index() - 1][col()] !== letter) || undefined
												}
												class="grid size-8 place-items-center rounded-md data-changed:bg-muted data-changed:underline data-changed:underline-offset-4"
											>
												{letter}
											</span>
										)}
									</For>
								</span>
							</button>
						</li>
					)}
				</For>
			</ol>
			<p role="status" class="text-center text-sm tabular-nums text-muted-foreground">
				{t('games.wordLadder.steps', { count: path().length - 1, minimum: minSteps })}
			</p>
			<Show when={playing()}>
				<form class="flex gap-2" onSubmit={addStep}>
					<input
						ref={field}
						id={inputId}
						class="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base font-bold uppercase aria-invalid:border-destructive"
						aria-label={t('games.wordLadder.enterWord')}
						aria-invalid={error() ? true : undefined}
						aria-describedby={error() ? 'ladder-error' : undefined}
						placeholder={t('games.wordLadder.enterWord')}
						maxlength={wordLength}
						value={input()}
						lang="en"
						dir="ltr"
						autocapitalize="characters"
						autocomplete="off"
						spellcheck={false}
						onInput={(event) => {
							setInput(event.currentTarget.value.toLowerCase())
							setError(null)
						}}
					/>
					<button
						type="submit"
						class={`${playButton} shrink-0 !px-5 disabled:opacity-50`}
						disabled={!input()}
					>
						{t('games.wordLadder.submit')}
					</button>
				</form>
				<Show when={error()}>
					{(key) => (
						<p id="ladder-error" role="alert" class="text-sm text-destructive">
							{t(`games.wordLadder.messages.${key()}`, { number: wordLength })}
						</p>
					)}
				</Show>
				<button
					type="button"
					class="min-h-12 self-center rounded-xl border border-border px-5 font-semibold disabled:opacity-50"
					disabled={path().length <= 1}
					onClick={() => {
						setPath(path().slice(0, -1))
						setError(null)
						field?.focus()
					}}
				>
					{t('games.wordLadder.undo')}
				</button>
			</Show>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.wordLadder.complete')} />
		</div>
	)
}
