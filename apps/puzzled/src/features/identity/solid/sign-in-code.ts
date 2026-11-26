import { createSignal } from 'solid-js'
import { IdentityRefusal, postIdentity } from './form-actions'

const RESEND_MS = 30_000

export function createSignInCode(email: () => string, onSent: () => void) {
	const [code, setCode] = createSignal('')
	const [flow, setFlow] = createSignal('')
	const [clock, setClock] = createSignal(0)
	const [resendAt, setResendAt] = createSignal(0)
	const [expiresAt, setExpiresAt] = createSignal(0)
	const [sent, setSent] = createSignal(false)
	const remaining = () => Math.max(0, Math.ceil((resendAt() - clock()) / 1000))
	const expired = () => !!expiresAt() && clock() >= expiresAt()

	async function startCode() {
		if (remaining() > 0) return
		const now = Date.now()
		setClock(now)
		// A transport error may still have sent mail: don't immediately retry it.
		setResendAt(now + RESEND_MS)
		const result = await postIdentity('sign-in', { step: 'email-start', email: email().trim() })
		if (!result.ok) {
			if (result.retryAfter && /^\d{1,8}$/.test(result.retryAfter)) {
				setResendAt(Math.max(resendAt(), Date.now() + Number(result.retryAfter) * 1000))
			}
			throw new IdentityRefusal(String(result.body.error ?? 'sign_in_unavailable'))
		}
		const { flow: nextFlow, expiresIn } = result.body
		if (typeof nextFlow !== 'string' || typeof expiresIn !== 'number')
			throw new IdentityRefusal('sign_in_unavailable')
		setFlow(nextFlow)
		setCode('')
		setClock(Date.now())
		setExpiresAt(Date.now() + expiresIn * 1000)
		setResendAt(Date.now() + RESEND_MS)
		setSent(true)
		onSent()
	}

	function clearProof() {
		setFlow('')
		setCode('')
		setExpiresAt(0)
		setSent(false)
	}

	return {
		code,
		setCode,
		flow,
		sent,
		remaining,
		expired,
		startCode,
		clearProof,
		tick: () => setClock(Date.now()),
	}
}
