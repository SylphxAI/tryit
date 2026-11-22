/** @jsxImportSource solid-js */
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { parsePatternMatchClientPayload } from './parse-client'
import { type Card, isValidSet, type PatternMatchClientData } from './types'

type Trio = [number, number, number]
const maxMistakes = 4 // Connect's PatternMatchSubmission limit.
const ink = { red: 'text-red-600', green: 'text-emerald-700', purple: 'text-violet-600' }
const glyph = {
	diamond: 'M20 5 35 30 20 55 5 30Z',
	oval: 'M20 6a15 24 0 1 0 0 48 15 24 0 1 0 0-48Z',
	squiggle: 'M10 10Q5 20 15 30T15 50Q10 55 20 55 35 55 30 45T30 25Q35 15 25 10T10 10Z',
}

function CardFace(props: { card: Card }) {
	const stripe = createUniqueId()
	const card = props.card
	return (
		<svg
			aria-hidden="true"
			viewBox={`0 0 ${40 * card.count} 60`}
			class={`h-10 w-auto max-w-full ${ink[card.color]}`}
		>
			<Show when={card.fill === 'striped'}>
				<defs>
					<pattern id={stripe} patternUnits="userSpaceOnUse" width="5" height="5">
						<path d="M0 2.5H5" stroke="currentColor" stroke-width="1.8" />
					</pattern>
				</defs>
			</Show>
			<For each={Array.from({ length: card.count }, (_, index) => index)}>
				{(index) => (
					<path
						d={glyph[card.shape]}
						transform={`translate(${40 * index} 0)`}
						stroke="currentColor"
						stroke-width="2.5"
						fill={
							card.fill === 'striped'
								? `url(#${stripe})`
								: card.fill === 'solid'
									? 'currentColor'
									: 'none'
						}
					/>
				)}
			</For>
		</svg>
	)
}

function cardLabel(card: Card, t: Translate) {
	const key = 'games.patternMatch.card'
	return t(`${key}.label`, {
		count: card.count,
		color: t(`${key}.${card.color}`),
		shape: t(`${key}.${card.shape}`),
		fill: t(`${key}.${card.fill}`),
	})
}

export default function MatchBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parsePatternMatchClientPayload(props.puzzle.puzzleData)
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

function Board(props: DailyBoardProps & { data: PatternMatchClientData }) {
	const t = createTranslator(props.locale)
	const mt = (key: string) => t(`games.patternMatch.${key}`)
	const { cards, totalSets } = props.data
	const [selected, setSelected] = createSignal<Card[]>([])
	const [foundSets, setFoundSets] = createSignal<Trio[]>([])
	const [mistakes, setMistakes] = createSignal(0)
	const [message, setMessage] = createSignal<'correct' | 'notASet' | 'alreadyFound'>()
	const finish = createBoardFinish(props, 'pattern-match')
	const locked = () => finish.state() !== 'playing'
	const complete = () => foundSets().length === totalSets
	const clear = () => {
		setSelected([])
		setMessage(undefined)
	}
	const submit = (status: 'won' | 'lost') => {
		clear()
		finish.finish(
			{ foundSets: foundSets(), mistakes: mistakes() },
			{ status, attempts: mistakes() },
		)
	}
	function toggle(card: Card) {
		if (locked()) return
		const current = selected()
		setMessage(undefined)
		if (current.includes(card)) {
			setSelected(current.filter((item) => item !== card))
			return
		}
		if (current.length !== 2) {
			setSelected([...current, card])
			return
		}
		const [first, second] = current
		setSelected([])
		if (!isValidSet(first, second, card)) {
			if (setMistakes((count) => count + 1) === maxMistakes) submit('lost')
			else setMessage('notASet')
			return
		}
		// A card may belong to multiple sets. Only the unordered trio is unique.
		const trio: Trio = [first.id, second.id, card.id]
		if (foundSets().some((set) => trio.every((id) => set.includes(id)))) {
			setMessage('alreadyFound')
			return
		}
		setFoundSets((sets) => [...sets, trio])
		if (complete()) submit('won')
		else setMessage('correct')
	}
	return (
		<div class="mx-auto w-full max-w-sm space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-x-3 text-sm">
				<span role="status">
					<strong class="tabular-nums">
						{foundSets().length}/{totalSets}
					</strong>{' '}
					{mt('setsFound')}
				</span>
				<span>
					{t('gameResult.mistakes')}: {mistakes()}/{maxMistakes}
				</span>
				<a class="inline-flex min-h-11 items-center underline" href="#rules">
					{t('common.help')}
				</a>
			</div>
			<fieldset class="min-w-0" disabled={locked()}>
				<legend class="sr-only">{mt('name')}</legend>
				<div class="grid grid-cols-3 gap-2">
					<For each={cards}>
						{(card) => (
							<button
								type="button"
								class="grid min-h-16 min-w-0 place-items-center rounded-xl border-2 border-border bg-background p-1.5 sm:min-h-20 hover:border-muted-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:ring-2 aria-pressed:ring-primary/30"
								data-match-card={card.id}
								aria-label={cardLabel(card, t)}
								aria-pressed={selected().includes(card)}
								onClick={() => toggle(card)}
							>
								<CardFace card={card} />
							</button>
						)}
					</For>
				</div>
			</fieldset>
			<Show when={!locked()}>
				<p class="min-h-10 text-sm text-muted-foreground" role="status">
					{message() ? mt(`messages.${message()}`) : mt('hint')}
				</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="min-h-11 rounded-lg border border-border px-4 disabled:opacity-50"
						disabled={!selected().length}
						onClick={clear}
					>
						{mt('clear')}
					</button>
					<button
						type="button"
						class="min-h-11 rounded-lg border border-border px-4"
						onClick={() => submit('lost')}
					>
						{mt('giveUp')}
					</button>
				</div>
			</Show>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={complete() ? mt('complete') : t('gameResult.gameOver')}
			/>
		</div>
	)
}
