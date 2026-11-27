import { ConnectError } from '@connectrpc/connect'
import { createEffect, createResource, createSignal, onMount } from 'solid-js'
import { sendFunnel } from '@/features/analytics/lib/funnel'
import { trackGameStartStage } from '@/features/analytics/lib/signal-stages'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import type { PuzzleDifficulty } from '@/games/types'
import { isPlusRequiredError } from '@/lib/billing/plus'
import { getTodayProgress, startDaily } from '@/lib/connect/puzzle-client'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { classifyDailyResponse, type DailySnapshot, loadDailySnapshot } from '../lib/daily-fallback'
import { claimedDailyPicks } from '../lib/daily-picks'
import { rememberDailyLevel } from '../lib/daily-resume-path'
import type { GameDayRequest } from '../lib/day-request'
import { takeStartIntent } from '../lib/start-intent'
import { readPlayGuestStatus } from './play-analytics-context'
import { readPlayDraftScope } from './play-scope'

type Playable = Extract<DailySnapshot, { kind: 'playable' }> & { draftScope?: string | null }
type State = Exclude<DailySnapshot, { kind: 'playable' }> | Playable | { kind: 'locked' }

async function withDraftScope(snapshot: State, archive: boolean): Promise<State> {
	if (archive || snapshot.kind !== 'playable' || !snapshot.puzzleId) return snapshot
	const draftScope = await readPlayDraftScope()
	return { ...snapshot, draftScope: draftScope ?? null }
}

const failed = (error: unknown): State =>
	isPlusRequiredError(ConnectError.from(error).rawMessage)
		? { kind: 'locked' }
		: { kind: 'unavailable' }

export type DailyPlayProps = {
	data: GamePageData
	day: GameDayRequest
	todayKey: string
	resetAt: number
	onLocked: () => void
	difficulty?: PuzzleDifficulty
	started: boolean
	initial?: State
}

export function createDailyPlayState(
	props: DailyPlayProps,
	{
		slug,
		archive,
		choose,
		hasBoard,
	}: { slug: string; archive: boolean; choose: boolean; hasBoard: boolean },
) {
	const [starting, setStarting] = createSignal(false)
	const [entered, setEntered] = createSignal(false)
	const input = { gameSlug: slug, difficulty: props.difficulty, puzzleDate: props.day.puzzleDate }
	const [mounted, setMounted] = createSignal(false)
	const [state, { mutate, refetch }] = createResource(
		mounted,
		async (_, { refetching }): Promise<State> => {
			// Keep the SSR snapshot on hydration; only a fallback or explicit retry reads again.
			if (!refetching && props.initial) return withDraftScope(props.initial, archive)
			try {
				return await withDraftScope(await loadDailySnapshot(input), archive)
			} catch (error) {
				return failed(error)
			}
		},
		{ initialValue: props.initial, ssrLoadFrom: 'initial' },
	)
	onMount(() => setMounted(true))
	const [isGuest, { refetch: retryGuestStatus }] = createResource(mounted, () =>
		withPresentationDeadline(readPlayGuestStatus(), undefined),
	)
	const play = async (puzzleDate: string) => {
		if (starting() || !hasBoard) return
		setStarting(true)
		try {
			const next = await withDraftScope(
				classifyDailyResponse(await startDaily({ ...input, puzzleDate })),
				archive,
			)
			if (next.kind === 'playable') setEntered(true)
			mutate(next)
		} catch (error) {
			mutate(failed(error))
		} finally {
			setStarting(false)
		}
	}
	let handled = false
	createEffect(() => {
		const value = state()
		if (!value || handled || !props.started) return
		handled = true
		const intent = takeStartIntent(slug)
		if (intent && !archive && hasBoard && !choose && value.kind === 'startable')
			void play(value.puzzleDate)
	})
	const snapshot = <K extends State['kind']>(kind: K) => {
		const value = state.latest
		// Do not mount editable real boards until the scope read has settled.
		if (!archive && value?.kind === 'playable' && value.puzzleId && value.draftScope === undefined)
			return undefined
		return value?.kind === kind ? (value as Extract<State, { kind: K }>) : undefined
	}
	let seen = false
	createEffect(() => {
		const value = snapshot('playable')
		if (!value || seen || !hasBoard || choose) return
		seen = true
		sendFunnel({ event: 'game_start', game_slug: slug })
		trackGameStartStage(slug, archive ? 'archive' : 'daily')
		if (!archive) rememberDailyLevel(value.puzzleDate, slug, props.difficulty)
	})
	createEffect(() => {
		if (snapshot('locked')) props.onLocked()
	})
	const [claimedPicks] = createResource(
		() => mounted() && !archive && snapshot('playable')?.puzzleDate,
		async (dayKey) => {
			try {
				const claimed = claimedDailyPicks(await getTodayProgress([]), dayKey)
				return claimed?.includes(slug) ? claimed : null
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	const pickIndex = () => (claimedPicks.latest?.indexOf(slug) ?? -1) + 1
	return {
		state,
		refetch,
		isGuest,
		retryGuestStatus,
		starting,
		entered,
		play,
		snapshot,
		claimedPicks,
		pickIndex,
	}
}
