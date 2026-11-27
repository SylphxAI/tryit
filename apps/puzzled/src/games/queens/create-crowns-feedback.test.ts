import { beforeEach, expect, mock, test } from 'bun:test'

let enabled: boolean | undefined
const tap = mock(async () => {})
const toggle = mock(() => {})
const triggerHaptic = mock(() => true)
mock.module('@/games/word-guess/create-word-guess-sound', () => ({
	createWordGuessSound: () => ({ enabled: () => enabled, toggle, tap }),
}))
mock.module('@/shared/hooks/use-haptic', () => ({ triggerHaptic }))
const { createCrownsFeedback } = await import('./create-crowns-feedback')

let visibility = 'visible'
globalThis.document = {
	get visibilityState() {
		return visibility
	},
} as Document

const click = (init: { isTrusted?: boolean; detail?: number } = {}) =>
	({ isTrusted: true, detail: 1, ...init }) as MouseEvent
const keydown = (init: { isTrusted?: boolean; repeat?: boolean; key?: string } = {}) =>
	({ isTrusted: true, repeat: false, key: 'Delete', ...init }) as KeyboardEvent
const cues = () => {
	expect(triggerHaptic.mock.calls.length).toBe(tap.mock.calls.length)
	return tap.mock.calls.length
}

beforeEach(() => {
	enabled = true
	visibility = 'visible'
	tap.mockClear()
	triggerHaptic.mockClear()
})

test('stays silent and still while Sound is off or its preference is unreadable', () => {
	for (const value of [false, undefined]) {
		enabled = value
		const feedback = createCrownsFeedback()
		feedback.cue(click())
		feedback.cue(keydown())
	}
	expect(cues()).toBe(0)
})

test('gives exactly one light cue per trusted accepted edit when Sound is on', () => {
	const feedback = createCrownsFeedback()
	feedback.cue(click())
	expect(cues()).toBe(1)
	expect(triggerHaptic).toHaveBeenLastCalledWith('select')
	feedback.cue(keydown())
	expect(cues()).toBe(2)
})

test('ignores untrusted, hidden-page and repeated input', () => {
	const feedback = createCrownsFeedback()
	feedback.cue(click({ isTrusted: false }))
	feedback.cue(keydown({ isTrusted: false }))
	feedback.cue(keydown({ repeat: true }))
	visibility = 'hidden'
	feedback.cue(click())
	expect(cues()).toBe(0)
})

test('a held Enter key cues its first activation only, until the key is released', () => {
	const feedback = createCrownsFeedback()
	feedback.key(keydown({ key: 'Enter' }))
	feedback.cue(click({ detail: 0 }))
	feedback.key(keydown({ key: 'Enter', repeat: true }))
	feedback.cue(click({ detail: 0 }))
	feedback.cue(click({ detail: 0 }))
	// A pointer click during the hold is a fresh input.
	feedback.cue(click())
	expect(cues()).toBe(2)
	feedback.release()
	feedback.key(keydown({ key: 'Enter' }))
	feedback.cue(click({ detail: 0 }))
	expect(cues()).toBe(3)
})

test('exposes the shared Sound preference toggle unchanged', () => {
	expect(createCrownsFeedback().toggle).toBe(toggle)
})
