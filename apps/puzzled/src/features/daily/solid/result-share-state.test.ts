/**
 * The rail's one share gesture: the share sheet where the platform has one,
 * the clipboard otherwise, one counted tap per gesture, and a spoiler-free
 * caption the player can copy by hand when neither path lands.
 */
import { afterEach, beforeEach, expect, mock, test } from 'bun:test'

// Bun resolves solid-js to its server build, where onMount never runs.
const browserSolid = await import(
	import.meta.resolve('solid-js').replace(/server\.js$/, 'solid.js')
)
mock.module('solid-js', () => browserSolid)

type ShareCall = { gameSlug: string; puzzleDate?: string; tap?: boolean; action?: string }
const shareCalls: ShareCall[] = []
const shareResult = mock(async (input: ShareCall) => {
	shareCalls.push(input)
	return 'abc123'
})
const trackBehavioralEvent = mock(() => {})
mock.module('@/lib/connect/puzzle-client', () => ({ shareResult }))
mock.module('@/features/analytics/lib/behavioral-events', () => ({ trackBehavioralEvent }))

const { createRoot } = browserSolid as typeof import('solid-js')
const { createTranslator } = await import('@/lib/i18n/translate')
const { createResultShare } = await import('./result-share-state')

const SECRET = 'CHARM'
const facts = {
	gameSlug: 'word-guess',
	mode: 'daily',
	status: 'won',
	puzzleDate: '2026-11-27',
	todayKey: '2026-11-27',
	attempts: 2,
	score: null,
	timeSpentMs: 61_000,
} as const

type Nav = { share?: (data: ShareData) => Promise<void>; clipboard?: Clipboard }
const original = {
	share: Object.getOwnPropertyDescriptor(navigator, 'share'),
	clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
}
function setNavigator({ share, clipboard }: Nav) {
	Object.defineProperty(navigator, 'share', { configurable: true, value: share })
	Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
}
function clipboard(writeText: (text: string) => Promise<void>) {
	return { writeText: mock(writeText) } as unknown as Clipboard & {
		writeText: ReturnType<typeof mock>
	}
}

let dispose = () => {}
async function mountShare() {
	const share = createRoot((d) => {
		dispose = d
		return createResultShare(
			{ facts, locale: 'en-US', shareText: 'Five 2/6\n🟨⬛⬛⬛⬛\n🟩🟩🟩🟩🟩' },
			createTranslator('en-US'),
			() => false,
		)
	})
	// Let onMount and the share-id prefetch settle.
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(share.mounted()).toBe(true)
	return share
}
const taps = () => shareCalls.filter((call) => call.tap).map((call) => call.action)

beforeEach(() => {
	shareCalls.length = 0
})
afterEach(() => {
	dispose()
	for (const key of ['share', 'clipboard'] as const) {
		const descriptor = original[key]
		if (descriptor) Object.defineProperty(navigator, key, descriptor)
		else Reflect.deleteProperty(navigator, key)
	}
})

test('one rail tap opens the share sheet with a spoiler-free caption and counts once', async () => {
	const pending = Promise.withResolvers<void>()
	const share = mock((_: ShareData) => pending.promise)
	const copy = clipboard(async () => {})
	setNavigator({ share, clipboard: copy })
	const state = await mountShare()
	expect(state.nativeShareAvailable()).toBe(true)

	const first = state.sharePrimary('rail')
	// A second tap while the sheet is open is ignored: no second sheet, no second count.
	const second = state.sharePrimary('rail')
	expect(share).toHaveBeenCalledTimes(1)
	expect(state.pending()).toBe(true)
	pending.resolve()
	await Promise.all([first, second])

	expect(taps()).toEqual(['native_share'])
	expect(copy.writeText).not.toHaveBeenCalled()
	const text = share.mock.calls[0]?.[0].text ?? ''
	expect(text).toContain('🟩🟩🟩🟩🟩')
	expect(text).toContain('/r/abc123')
	expect(text).not.toContain(SECRET)
	expect(state.feedback()).toBeUndefined()
	expect(state.pending()).toBe(false)
})

test('cancelling the share sheet ends the gesture without copying or feedback', async () => {
	const copy = clipboard(async () => {})
	setNavigator({
		share: async () => {
			throw new DOMException('Cancelled', 'AbortError')
		},
		clipboard: copy,
	})
	const state = await mountShare()
	await state.sharePrimary('rail')
	expect(copy.writeText).not.toHaveBeenCalled()
	expect(state.feedback()).toBeUndefined()
	expect(taps()).toEqual(['native_share'])
	expect(state.pending()).toBe(false)
})

test('a refused share sheet still lands the tap on the clipboard', async () => {
	const copy = clipboard(async () => {})
	setNavigator({
		share: async () => {
			throw new DOMException('Denied', 'NotAllowedError')
		},
		clipboard: copy,
	})
	const state = await mountShare()
	await state.sharePrimary('rail')
	expect(copy.writeText).toHaveBeenCalledTimes(1)
	expect(state.feedback()).toEqual({ surface: 'rail', message: 'gameResult.challengeCopied' })
	expect(taps()).toEqual(['native_share'])
})

test('without a share sheet the same gesture copies the challenge', async () => {
	const copy = clipboard(async () => {})
	setNavigator({ clipboard: copy })
	const state = await mountShare()
	expect(state.nativeShareAvailable()).toBe(false)
	await state.sharePrimary('rail')
	expect(copy.writeText).toHaveBeenCalledTimes(1)
	expect(String(copy.writeText.mock.calls[0]?.[0])).not.toContain(SECRET)
	expect(state.feedback()).toEqual({ surface: 'rail', message: 'gameResult.challengeCopied' })
	expect(taps()).toEqual(['copy_challenge'])
})

for (const [name, copy] of [
	['denied', clipboard(async () => Promise.reject(new DOMException('Denied', 'NotAllowedError')))],
	['missing', undefined],
] as const) {
	test(`with no share sheet and a ${name} clipboard the caption is offered to copy by hand`, async () => {
		setNavigator({ clipboard: copy })
		const state = await mountShare()
		await state.sharePrimary('rail')
		const feedback = state.feedback()
		expect(feedback?.surface).toBe('rail')
		expect(feedback?.message).toBe('share.card.unavailable')
		expect(feedback?.caption).toContain('🟩🟩🟩🟩🟩')
		expect(feedback?.caption).not.toContain(SECRET)
		expect(taps()).toEqual(['copy_challenge'])
		expect(state.pending()).toBe(false)
	})
}

test('the dialog keeps explicit Copy even where a share sheet exists', async () => {
	const share = mock(async (_: ShareData) => {})
	const copy = clipboard(async () => {})
	setNavigator({ share, clipboard: copy })
	const state = await mountShare()
	await state.shareChallenge('dialog', 'copy_challenge')
	expect(share).not.toHaveBeenCalled()
	expect(copy.writeText).toHaveBeenCalledTimes(1)
	expect(state.feedback()).toEqual({ surface: 'dialog', message: 'gameResult.challengeCopied' })
	expect(taps()).toEqual(['copy_challenge'])
})
