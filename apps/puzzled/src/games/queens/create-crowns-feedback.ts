import { createWordGuessSound } from '@/games/word-guess/create-word-guess-sound'
import { triggerHaptic } from '@/shared/hooks/use-haptic'

/**
 * Crowns board feedback: silent unless the player turned Sound on (the same
 * stored preference Five uses). Then each accepted, trusted cell edit gets one
 * short tap and, where the device supports it, one light vibration.
 */
export function createCrownsFeedback() {
	const sound = createWordGuessSound()
	// Held Enter repeats a button's click with no `repeat` flag, so track it here.
	let keyRepeating = false

	function key(event: KeyboardEvent) {
		keyRepeating = event.repeat
	}

	function release() {
		keyRepeating = false
	}

	/** Call only after the edit changed the board. */
	function cue(event: MouseEvent | KeyboardEvent) {
		if (!sound.enabled() || !event.isTrusted || document.visibilityState !== 'visible') return
		if ('repeat' in event ? event.repeat : event.detail === 0 && keyRepeating) return
		triggerHaptic('select')
		void sound.tap()
	}

	return { enabled: sound.enabled, toggle: sound.toggle, cue, key, release }
}
