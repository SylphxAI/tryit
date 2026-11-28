import { createSignal, onCleanup, onMount } from 'solid-js'
import { SOUND_ENABLED_KEY } from '@/lib/storage-keys'

/** One short, low-volume tap; never queue sounds while waiting for the device. */
export function createWordGuessSound() {
	const [enabled, setEnabled] = createSignal<boolean>()
	let audio: AudioContext | undefined
	let output: GainNode | undefined
	let cue = 0

	function silence() {
		cue++
		output?.disconnect()
		output = undefined
	}

	onMount(() => {
		if (typeof window.AudioContext !== 'function') return
		try {
			setEnabled(localStorage.getItem(SOUND_ENABLED_KEY) === 'true')
		} catch {
			// With no readable preference, stay quiet.
		}
		document.addEventListener('visibilitychange', silence)
		onCleanup(() => {
			document.removeEventListener('visibilitychange', silence)
			silence()
			void audio?.close().catch(() => undefined)
		})
	})

	function toggle(event: MouseEvent) {
		if (!event.isTrusted || enabled() === undefined) return
		try {
			const next = !enabled()
			localStorage.setItem(SOUND_ENABLED_KEY, String(next))
			setEnabled(next)
		} catch {
			setEnabled(undefined)
		}
		if (!enabled()) silence()
	}

	// Called synchronously after a trusted, visible edit. Creating/resuming the
	// context from a reactive effect would lose the input's browser activation.
	async function tap() {
		if (!enabled()) return
		silence()
		const id = cue
		try {
			audio ??= new AudioContext()
			const context = audio
			if (context.state !== 'running') {
				const deadline = performance.now() + 100
				await context.resume()
				if (id !== cue || performance.now() > deadline) return
			}
			if (document.visibilityState !== 'visible') return
			const now = context.currentTime
			const end = now + 0.045
			const tone = context.createOscillator()
			const gain = context.createGain()
			output = gain
			tone.type = 'triangle'
			tone.frequency.setValueAtTime(620, now)
			tone.frequency.exponentialRampToValueAtTime(390, end)
			gain.gain.setValueAtTime(0, now)
			gain.gain.linearRampToValueAtTime(0.045, now + 0.004)
			gain.gain.exponentialRampToValueAtTime(0.001, end)
			tone.connect(gain).connect(context.destination)
			tone.start(now)
			tone.stop(end)
			tone.onended = () => {
				if (output !== gain) return
				gain.disconnect()
				output = undefined
			}
		} catch {
			// Disabled/blocked audio must not interfere with editing the board.
		}
	}

	return { enabled, toggle, tap }
}
