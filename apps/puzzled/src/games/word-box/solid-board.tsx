/** @jsxImportSource solid-js */
import { Delete, RotateCcw } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { playButton } from '@/features/catalog/solid/game-landing'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { isFrameWord } from './dictionary'
import { parseWordBoxClientPayload } from './parse-client'
import {
	allLettersUsed,
	getUsedLetters,
	hasValidSideTransitions,
	type LetterBox,
	startsWithLastLetter,
	usesValidLetters,
} from './types'

const slug = 'word-box'
const sides = [
	{ key: 'top', position: 'col-start-2 row-start-1 flex-row' },
	{ key: 'right', position: 'col-start-3 row-start-2 flex-col' },
	{ key: 'bottom', position: 'col-start-2 row-start-3 flex-row' },
	{ key: 'left', position: 'col-start-1 row-start-2 flex-col' },
] as const

export default function WordBoxBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const data = createMemo(() => {
		try {
			return parseWordBoxClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={data()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(puzzle) => <Frame {...props} box={puzzle.box} />}
		</Show>
	)
}

function Frame(props: DailyBoardProps & { box: LetterBox }) {
	const t = createTranslator(props.locale)
	const copy = (key: string, values?: Record<string, string | number>) =>
		t(`games.wordBox.${key}`, values)
	const box = props.box
	const [words, setWords] = createSignal<string[]>([])
	const [current, setCurrent] = createSignal('')
	const [error, setError] = createSignal<
		| 'invalidLetter'
		| 'sameSide'
		| 'wrongStart'
		| 'tooShort'
		| 'notInWordList'
		| 'dictionaryUnavailable'
		| 'rejected'
	>()
	const [checking, setChecking] = createSignal(false)
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	const finish = createBoardFinish(props, slug, {
		onRejected() {
			const chain = words()
			setCurrent(chain.at(-1) ?? '')
			setWords(chain.slice(0, -1))
			setError('rejected')
		},
	})
	const used = createMemo(() => getUsedLetters(words()))
	const required = () => words().at(-1)?.slice(-1)
	const playable = () => finish.state() === 'playing' && !checking()
	const total = sides.reduce((count, side) => count + box[side.key].length, 0)

	function invalid(reason: NonNullable<ReturnType<typeof error>>) {
		triggerHaptic('error')
		setError(reason)
	}
	function add(letter: string) {
		if (!playable()) return
		const next = current() + letter
		if (!usesValidLetters(box, next)) return invalid('invalidLetter')
		if (!startsWithLastLetter(words().at(-1) ?? '', next)) return invalid('wrongStart')
		if (!hasValidSideTransitions(box, next)) return invalid('sameSide')
		setCurrent(next)
		setError(undefined)
		triggerHaptic('light')
	}
	function backspace() {
		if (!playable()) return
		setCurrent((value) => value.slice(0, -1))
		setError(undefined)
	}
	async function addWord() {
		if (!playable()) return
		const word = current()
		if (word.length < 3) return invalid('tooShort')
		setChecking(true)
		setError(undefined)
		try {
			const valid = await isFrameWord(word)
			if (disposed) return
			if (!valid) return invalid('notInWordList')
		} catch {
			if (!disposed) invalid('dictionaryUnavailable')
			return
		} finally {
			if (!disposed) setChecking(false)
		}
		const next = [...words(), word]
		setWords(next)
		setCurrent('')
		setError(undefined)
		// The shared letter/chain rules qualify a play; only SubmitGuess can save a win.
		if (allLettersUsed(box, getUsedLetters(next)))
			finish.finish({ words: next }, { attempts: next.length })
	}
	function undoWord() {
		if (!playable() || current() || !words().length) return
		setCurrent(words().at(-1) ?? '')
		setWords((chain) => chain.slice(0, -1))
		setError(undefined)
	}
	function reset() {
		if (!playable()) return
		setCurrent('')
		setWords([])
		setError(undefined)
	}
	function keyDown(event: KeyboardEvent) {
		if (
			!playable() ||
			event.defaultPrevented ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.isComposing
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				target.closest(
					'input:not(#frame-current), textarea, select, [role="textbox"], dialog, [role="dialog"]',
				))
		)
			return
		if (/^[a-z]$/i.test(event.key)) add(event.key.toUpperCase())
		else if (event.key === 'Backspace' || event.key === 'Delete') backspace()
		else if (
			event.key === 'Enter' &&
			!(
				target instanceof HTMLElement &&
				target.closest('button:not([data-box-letter]), a, summary, [role="button"]')
			)
		) {
			if (!event.repeat) void addWord()
		} else return
		event.preventDefault()
	}

	onMount(() => {
		window.addEventListener('keydown', keyDown)
		onCleanup(() => window.removeEventListener('keydown', keyDown))
	})

	return (
		<section
			class="mx-auto flex w-full max-w-md flex-col gap-3"
			aria-label={copy('name')}
			data-word-box-board
		>
			<div class="flex flex-wrap items-center justify-between gap-x-3 text-sm">
				<p aria-live="polite">{copy('progress', { used: used().size, total })}</p>
				<button
					type="button"
					class="min-h-11 px-2 font-semibold disabled:opacity-50"
					disabled={!playable()}
					onClick={reset}
				>
					<RotateCcw size={16} class="me-1 inline" aria-hidden="true" />
					{t('common.reset')}
				</button>
			</div>
			<fieldset class="space-y-3" aria-busy={checking()}>
				<legend class="sr-only">{copy('input')}</legend>
				<div
					class="mx-auto grid w-full max-w-64 grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-1"
					dir="ltr"
				>
					<div
						aria-hidden="true"
						class="col-start-2 row-start-2 rounded-xl border-2 border-primary bg-muted"
					/>
					<For each={sides}>
						{(side) => (
							<div class={`flex items-center justify-center gap-1 ${side.position}`}>
								<For each={box[side.key]}>
									{(letter) => (
										<button
											type="button"
											class="grid size-11 place-items-center rounded-full border border-border bg-background text-lg font-bold hover:bg-muted disabled:opacity-60 data-used:bg-primary data-used:text-primary-foreground"
											data-used={used().has(letter) || undefined}
											data-box-letter={letter}
											disabled={!playable()}
											onClick={() => add(letter)}
										>
											{letter}
										</button>
									)}
								</For>
							</div>
						)}
					</For>
				</div>
				<form
					class="flex flex-wrap items-center justify-center gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						void addWord()
					}}
				>
					<label class="sr-only" for="frame-current">
						{copy('input')}
					</label>
					<input
						id="frame-current"
						class="h-12 min-w-0 basis-40 rounded-lg border border-border bg-background px-3 text-center font-display text-xl font-bold tracking-wider"
						dir="ltr"
						value={current()}
						placeholder={required() ?? '_'}
						readOnly
						inputMode="none"
						disabled={!playable()}
						aria-describedby={required() ? 'frame-next-letter' : undefined}
					/>
					<button
						type="button"
						aria-label={copy('backspace')}
						class="grid size-11 place-items-center rounded-lg border border-border disabled:opacity-50"
						disabled={!playable() || !current()}
						onClick={backspace}
					>
						<Delete size={18} aria-hidden="true" />
					</button>
					<button
						type="submit"
						class={`${playButton} disabled:cursor-not-allowed disabled:opacity-50`}
						disabled={!playable() || current().length < 3}
					>
						{copy('enter')}
					</button>
				</form>
			</fieldset>
			<Show when={required()}>
				{(letter) => (
					<p id="frame-next-letter" class="text-center text-sm">
						{copy('nextLetter', { letter: letter() })}
					</p>
				)}
			</Show>
			<Show when={error()}>
				{(reason) => (
					<p role="status" class="text-center text-sm text-destructive">
						{copy(reason())}
					</p>
				)}
			</Show>
			<Show when={words().length}>
				<ol aria-label={copy('chain')} class="flex flex-wrap justify-center gap-2" dir="ltr">
					<For each={words()}>
						{(word) => <li class="rounded-lg bg-muted px-3 py-1 font-bold">{word}</li>}
					</For>
				</ol>
				<button
					type="button"
					class="min-h-11 self-center px-2 text-sm font-semibold underline disabled:opacity-50"
					disabled={!playable() || Boolean(current())}
					onClick={undoWord}
				>
					{copy('undo')}
				</button>
			</Show>
			<BoardFinish finish={finish} locale={props.locale} message={copy('complete')} />
		</section>
	)
}
