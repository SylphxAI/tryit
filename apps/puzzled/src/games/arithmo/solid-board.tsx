/** @jsxImportSource solid-js */
import { CornerDownLeft, Delete } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { gradeBoardGuess } from '@/games/shared/solid/grade-board-guess'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseArithmoClientPayload, parseGrade, updateKeyboardStatus } from './feedback'
import {
	type CharStatus,
	EQUATION_LENGTH,
	isValidEquation,
	MAX_ATTEMPTS,
	VALID_CHARS,
} from './types'

const tones: Record<CharStatus, string> = {
	empty: 'border-border bg-background',
	correct: 'border-correct bg-correct text-[#1a1712]',
	present: 'border-present bg-present text-[#1a1712]',
	absent: 'border-border bg-muted text-foreground',
}
const badges = { correct: '🟩', present: '🟨', absent: '⬛' }
const rows = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i)
const cols = Array.from({ length: EQUATION_LENGTH }, (_, i) => i)
const keys = ['1234567890', '+-*/=']
const glyph = (char: string) => ({ '*': '×', '/': '÷', '-': '−' })[char] ?? char
const keyStyle =
	'grid min-h-12 min-w-0 place-items-center rounded-md border px-1 font-bold active:translate-y-px disabled:opacity-60'
type GradedRow = { guess: string; tiles: NonNullable<ReturnType<typeof parseGrade>> }

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
	const finish = createBoardFinish(props, 'arithmo')
	const [graded, setGraded] = finish.draft.signal<GradedRow[]>('graded', [])
	const [keyboard, setKeyboard] = finish.draft.signal<Record<string, CharStatus>>('keyboard', {})
	const [draft, setDraft] = finish.draft.signal('draft', '')
	const [grading, setGrading] = createSignal(false)
	const [tileHelp, setTileHelp] = createSignal(false)
	const [error, setError] = createSignal<'notComplete' | 'invalid' | 'grade'>()
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const inactive = () => grading() || Boolean(outcome())
	let disposed = false
	onCleanup(() => {
		disposed = true
	})

	function edit(key: string) {
		if (inactive()) return
		setTileHelp(false)
		setError(undefined)
		if (key === 'Backspace') setDraft((guess) => guess.slice(0, -1))
		else if (VALID_CHARS.includes(key)) setDraft((guess) => (guess + key).slice(0, EQUATION_LENGTH))
	}

	async function grade() {
		if (inactive()) return
		setTileHelp(false)
		const guess = draft()
		if (!isValidEquation(guess)) {
			setError(guess.length < EQUATION_LENGTH ? 'notComplete' : 'invalid')
			triggerHaptic('error')
			return
		}
		setError(undefined)
		setGrading(true)
		triggerHaptic('submit')
		try {
			const reply = await gradeBoardGuess(props, 'arithmo', { equation: guess })
			if (disposed) return
			const tiles = parseGrade(reply)
			if (!tiles) throw new Error('invalid_arithmo_grade')
			const next = [...graded(), { guess, tiles }]
			setGraded(next)
			setKeyboard((previous) => updateKeyboardStatus(previous, guess, tiles))
			setDraft('')
			const status = tiles.every((tile) => tile === 'correct')
				? 'won'
				: next.length === MAX_ATTEMPTS
					? 'lost'
					: undefined
			if (status) {
				setOutcome(status)
				finish.finish({ guesses: next.map((row) => row.guess) }, { status, attempts: next.length })
			}
		} catch (cause) {
			if (!disposed) {
				if (props.mode !== 'practice' && isAlreadyPlayedError(cause)) props.onAlreadyPlayed()
				else {
					setError('grade')
					triggerHaptic('error')
				}
			}
		} finally {
			if (!disposed) setGrading(false)
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (
			inactive() ||
			event.defaultPrevented ||
			event.isComposing ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				target.closest('input, textarea, select, [role="textbox"], dialog, [role="dialog"]'))
		)
			return
		if (event.key === 'Enter') {
			if (
				target instanceof HTMLElement &&
				target.closest('button, a, summary, [role="button"]') &&
				!target.closest('[data-arithmo-keypad]')
			)
				return
			event.preventDefault()
			if (!event.repeat) void grade()
		} else if (event.key === 'Backspace' || VALID_CHARS.includes(event.key)) {
			event.preventDefault()
			edit(event.key)
		}
	}
	onMount(() => {
		window.addEventListener('keydown', onKeyDown)
		onCleanup(() => window.removeEventListener('keydown', onKeyDown))
	})

	const reveal = createMemo(() => {
		if (finish.state() !== 'accepted' || outcome() !== 'lost') return
		try {
			const value: unknown = JSON.parse(finish.revealJson() ?? 'null')
			if (
				value &&
				typeof value === 'object' &&
				'equation' in value &&
				typeof value.equation === 'string' &&
				isValidEquation(value.equation)
			)
				return value.equation
		} catch {
			/* Missing or malformed reveal: show only the accepted outcome. */
		}
	})
	const feedbackText = (tile: CharStatus) =>
		tile !== 'empty' ? text(`feedback.${tile}`) : undefined
	const shareText = () =>
		graded()
			.map((row) => row.tiles.map((tile) => badges[tile]).join(''))
			.join('\n')

	return (
		<div class="mx-auto flex w-full max-w-sm flex-col gap-3" data-arithmo-board>
			<ol
				aria-label={text('name')}
				class="grid list-none gap-1"
				dir="ltr"
				data-arithmo-grid
				onPointerUp={() => {
					if (!inactive()) setTileHelp(true)
				}}
			>
				<For each={rows}>
					{(row) => {
						const current = () => row === graded().length && !outcome()
						const attempt = () => graded()[row]
						return (
							<li class="grid grid-cols-8 gap-1" aria-current={current() ? 'step' : undefined}>
								<span class="sr-only">{t('common.cellRow', { index: row + 1 })}</span>
								<For each={cols}>
									{(col) => {
										const char = () => (attempt()?.guess ?? (current() ? draft() : ''))[col] ?? ''
										const tile = () => attempt()?.tiles[col] ?? 'empty'
										const activeSlot = () => current() && !grading() && col === draft().length
										const appearance = () =>
											activeSlot()
												? 'border-accent-warm bg-accent-warm-soft inset-ring-1 inset-ring-accent-warm/45'
												: `${tones[tile()]} ${current() && char() ? 'border-muted-foreground' : ''}`
										return (
											<span
												data-grade={tile()}
												data-active-slot={activeSlot() ? 'true' : undefined}
												class={`grid aspect-square place-items-center rounded-md border-2 font-display text-lg font-extrabold sm:text-xl ${appearance()}`}
											>
												{glyph(char())}
												<Show when={feedbackText(tile())}>
													{(label) => <span class="sr-only">: {label()}</span>}
												</Show>
											</span>
										)
									}}
								</For>
							</li>
						)
					}}
				</For>
			</ol>
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
			<div data-arithmo-keypad class="grid gap-1" dir="ltr">
				<For each={keys}>
					{(row, index) => (
						<div
							class={
								index() === 0
									? 'grid grid-cols-10 gap-1'
									: 'grid grid-cols-[1.5fr_repeat(5,minmax(0,1fr))_1.5fr] gap-1'
							}
						>
							<Show when={index() === 1}>
								<button
									type="button"
									class={`${keyStyle} bg-muted`}
									aria-label={text('keyboard.delete')}
									disabled={inactive()}
									onClick={() => edit('Backspace')}
								>
									<Delete size={20} aria-hidden="true" />
								</button>
							</Show>
							<For each={[...row]}>
								{(key) => (
									<button
										type="button"
										class={`${keyStyle} ${tones[keyboard()[key] ?? 'empty']}`}
										aria-description={feedbackText(keyboard()[key] ?? 'empty')}
										disabled={inactive()}
										onClick={() => edit(key)}
									>
										{glyph(key)}
									</button>
								)}
							</For>
							<Show when={index() === 1}>
								<button
									type="button"
									class={`${keyStyle} bg-primary text-primary-foreground`}
									aria-label={text('keyboard.enter')}
									disabled={inactive()}
									onClick={grade}
								>
									<CornerDownLeft size={20} aria-hidden="true" />
								</button>
							</Show>
						</div>
					)}
				</For>
			</div>
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
