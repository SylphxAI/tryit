import { createEffect, onCleanup } from 'solid-js'
import { getPasskey } from './browser-passkey'
import { type createIdentityAction, IdentityRefusal } from './form-actions'

export function createSignInPasskey(options: {
	busy: () => boolean
	navigated: () => boolean
	conditionalEnabled: () => boolean
	clearInitialError: () => void
	run: ReturnType<typeof createIdentityAction>['run']
	finish: (proof: object) => Promise<void>
}) {
	let passkeyRequest: AbortController | undefined
	const abort = () => passkeyRequest?.abort()

	async function passkey(conditional = false) {
		if (options.busy() || options.navigated()) return
		abort()
		const request = new AbortController()
		passkeyRequest = request
		if (conditional) {
			try {
				const proof = await getPasskey(request.signal, true)
				// Conditional mediation returns proof only after the user chooses a passkey.
				if (proof && !request.signal.aborted && !options.busy()) {
					options.clearInitialError()
					await options.run(
						() => options.finish({ ...proof, step: 'passkey-verify' }),
						'passkey_unavailable',
					)
				}
			} catch {
				// Conditional autofill is optional; Continue must remain usable.
			}
			return
		}
		options.clearInitialError()
		await options.run(async () => {
			const proof = await getPasskey(request.signal)
			if (!proof) throw new IdentityRefusal('passkey_unavailable')
			await options.finish({ ...proof, step: 'passkey-verify' })
		}, 'passkey_unavailable')
	}

	function watchConditional() {
		createEffect(() => {
			if (!options.conditionalEnabled()) return
			let active = true
			void PublicKeyCredential.isConditionalMediationAvailable?.()
				.then((supported) => {
					if (supported && active) void passkey(true)
				})
				.catch(() => undefined)
			onCleanup(() => {
				active = false
				abort()
			})
		})
	}

	return { passkey, abort, watchConditional }
}
