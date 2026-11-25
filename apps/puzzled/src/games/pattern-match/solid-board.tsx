/** @jsxImportSource solid-js */
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { parsePatternMatchClientPayload } from './parse-client'
import { type Card, isValidSet, type PatternMatchClientData } from './types'

type Trio = [number, number, number]
const maxMistakes = 4 // Connect's PatternMatchSubmission limit.
// Persisted card attributes stay unchanged; these are presentation names only.
const shape = { diamond: 'circle', oval: 'triangle', squiggle: 'hexagon' } as const
const color = { red: 'coral', green: 'teal', purple: 'indigo' } as const
const fill = { solid: 'solid', striped: 'dotted', empty: 'outline' } as const
const ink = {
	coral: 'text-[#aa3c27] dark:text-[#ff8a6b]',
	teal: 'text-[#006c65] dark:text-[#5ed9ca]',
	indigo: 'text-[#473ba5] dark:text-[#ada5ff]',
}
const glyph = {
	circle: 'M20 13a17 17 0 1 0 0 34 17 17 0 1 0 0-34Z',
	triangle: 'M20 11 38 46H2Z',
	hexagon: 'M11 14h18l9 16-9 16H11L2 30Z',
}

function CardFace(props: { card: Card }) {
	const dots = createUniqueId()
	const card = props.card
	return (
		<svg
			aria-hidden="true"
			viewBox={`0 0 ${40 * card.count} 60`}
			class={`h-10 w-auto max-w-full ${ink[color[card.color]]}`}
		>
			<Show when={card.fill === 'striped'}>
				<defs>
					<pattern id={dots} patternUnits="userSpaceOnUse" width="7" height="7">
						<circle cx="3.5" cy="3.5" r="1.55" fill="currentColor" />
					</pattern>
				</defs>
			</Show>
			<For each={Array.from({ length: card.count }, (_, index) => index)}>
				{(index) => (
					<path
						d={glyph[shape[card.shape]]}
						transform={`translate(${40 * index} 0)`}
						stroke="currentColor"
						stroke-width="2.5"
						fill={
							card.fill === 'striped'
								? `url(#${dots})`
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
		color: t(`${key}.${color[card.color]}`),
		shape: t(`${key}.${shape[card.shape]}`),
		fill: t(`${key}.${fill[card.fill]}`),
	})
}

/** Only the accepted practice loss may reveal the missing trios. */
function missingTrios(reveal: string | undefined, cards: readonly Card[], seen: readonly Trio[]) {
	if (!reveal) return []
	try {
		const ids: unknown = JSON.parse(reveal)?.validSets
		if (!Array.isArray(ids)) return []
		const byId = new Map(cards.map((card) => [card.id, card]))
		return ids.flatMap((trio: unknown) => {
			if (
				!Array.isArray(trio) ||
				trio.length !== 3 ||
				seen.some((set) => trio.every((id) => set.includes(id)))
			)
				return []
			const trioCards = trio.map((id) => byId.get(id))
			return trioCards.every((card) => card !== undefined) ? [trioCards] : []
		})
	} catch {
		return []
	}
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
	const finish = createBoardFinish(props, 'pattern-match')
	const [selected, setSelected] = finish.draft.signal<Card[]>('selected', [])
	const [foundSets, setFoundSets] = finish.draft.signal<Trio[]>('foundSets', [])
	const [mistakes, setMistakes] = finish.draft.signal('mistakes', 0)
	const [message, setMessage] = createSignal<'correct' | 'notASet' | 'alreadyFound'>()
	const missed = createMemo(() =>
		props.mode === 'practice' ? missingTrios(finish.revealJson(), cards, foundSets()) : [],
	)
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
		// A card may belong to multiple trios. Only the unordered trio is unique.
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
			</div>
			<fieldset class="min-w-0" disabled={locked()}>
				<legend class="sr-only">{mt('name')}</legend>
				<div class="grid grid-cols-3 gap-2">
					<For each={cards}>
						{(card) => (
							<button
								type="button"
								class="grid min-h-16 min-w-0 place-items-center rounded-xl border-2 border-border bg-background p-1.5 sm:min-h-20 hover:not-aria-pressed:border-muted-foreground aria-pressed:border-accent-warm aria-pressed:bg-accent-warm-soft aria-pressed:ring-2 aria-pressed:ring-accent-warm/45"
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
						class="chrome-control border border-hairline px-4"
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
				practiceReveal={
					<Show when={missed().length}>
						<p class="text-sm font-semibold">{t('gameResult.missedCategories')}</p>
						<ul class="mt-2 grid gap-2" data-practice-reveal>
							<For each={missed()}>
								{(trio) => (
									<li class="grid grid-cols-3 gap-2 rounded-xl bg-muted p-2">
										<For each={trio}>
											{(card) => (
												<div class="grid min-w-0 place-items-center rounded-lg bg-background p-1">
													<span class="sr-only">{cardLabel(card, t)}</span>
													<CardFace card={card} />
												</div>
											)}
										</For>
									</li>
								)}
							</For>
						</ul>
					</Show>
				}
			/>
		</div>
	)
}
