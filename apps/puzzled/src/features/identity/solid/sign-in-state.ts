import type { EntryConfig } from '@sylphx/auth/client'
import { createSignInController } from '@sylphx/auth-solid'
import { createSignal, onCleanup, onMount } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { afterSignUpDestination } from '@/lib/identity/after-sign-up'
import { emailProblem } from '@/lib/identity/form-validation'
import { OAUTH_ACCEPTANCE, OAUTH_PREFIX } from '@/lib/identity/oauth-contract'
import { POLICY_ACCEPTANCE } from '@/lib/identity/policy-consent'
import { localizedPath } from '@/lib/seo/urls'
import { supportsPasskeys } from './browser-passkey'
import {
	createIdentityAction,
	IdentityRefusal,
	postIdentity,
	recover,
	signIn,
} from './form-actions'
import { createSignInCode } from './sign-in-code'
import { createSignInPasskey } from './sign-in-passkey'

type Step = 'entry' | 'code' | 'password' | 'recovery' | 'recovery-sent'
export type SignInTranslate = (key: string, values?: Record<string, string | number>) => string

export function createSignInState(
	props: {
		locale: Locale
		entry: EntryConfig | null
		callback: string | null
		oauthFailed: boolean
		recovery: boolean
	},
	t: SignInTranslate,
	v: SignInTranslate,
) {
	const action = createIdentityAction()
	const [step, setStep] = createSignal<Step>(
		props.recovery && props.entry?.password && !props.entry.otp ? 'recovery' : 'entry',
	)
	const [email, setEmail] = createSignal('')
	const [password, setPassword] = createSignal('')
	const [emailFocused, setEmailFocused] = createSignal(false)
	const [attempted, setAttempted] = createSignal(false)
	const [availablePasskey, setAvailablePasskey] = createSignal(false)
	const [initialError, setInitialError] = createSignal(props.oauthFailed)
	const legacyRecovery = () => props.entry?.password && !props.entry.otp
	const emailPath = () => props.entry?.otp || props.entry?.password
	const destination = () => props.callback ?? localizedPath(props.locale)
	let emailInput: HTMLInputElement | undefined
	let proofInput: HTMLInputElement | undefined
	let navigated = false
	const [leaving, setLeaving] = createSignal(false)
	const oauth = createSignInController({
		get next() {
			return destination()
		},
		search: '',
		initialConfig: props.entry ?? {
			providers: [],
			otp: false,
			password: false,
			signup: false,
			passkey: false,
		},
		routePrefix: OAUTH_PREFIX,
		getAcceptance: () => OAUTH_ACCEPTANCE,
	})
	const busy = () => action.pending() || !!oauth.busy() || leaving()
	const emailError = () => {
		const problem = email().length > 320 ? 'emailInvalid' : emailProblem(email())
		return attempted() && problem ? t(problem) : undefined
	}
	const otp = createSignInCode(email, () => changeStep('code'))
	const passkeys = createSignInPasskey({
		busy,
		navigated: () => navigated,
		conditionalEnabled: () => step() === 'entry' && availablePasskey() && emailFocused(),
		clearInitialError: () => setInitialError(false),
		run: action.run,
		finish,
	})

	function changeStep(next: Step) {
		setAttempted(false)
		action.clearError()
		oauth.go('choose')
		setStep(next)
		queueMicrotask(() =>
			(next === 'entry' || next === 'recovery' ? emailInput : proofInput)?.focus(),
		)
	}

	function changeEmail() {
		passkeys.abort()
		setEmailFocused(false)
		otp.clearProof()
		setPassword('')
		changeStep('entry')
	}

	async function finish(proof: object) {
		const result = await postIdentity('sign-in', { ...proof, acceptance: POLICY_ACCEPTANCE })
		if (!result.ok || result.body.signedIn !== true)
			throw new IdentityRefusal(String(result.body.error ?? 'sign_in_unavailable'))
		navigated = true
		setLeaving(true)
		window.location.assign(
			result.body.newAccount === true ? afterSignUpDestination(destination()) : destination(),
		)
	}

	function verifyCode() {
		if (busy() || otp.expired() || !otp.flow() || !/^\d{6}$/.test(otp.code())) return
		void action.run(
			() => finish({ step: 'email-verify', flow: otp.flow(), code: otp.code() }),
			'sign_in_unavailable',
		)
	}

	onMount(() => {
		setAvailablePasskey(!!props.entry?.passkey && supportsPasskeys())
		const tick = window.setInterval(otp.tick, 250)
		onCleanup(() => {
			window.clearInterval(tick)
			passkeys.abort()
		})
	})
	passkeys.watchConditional()

	function submit(event: SubmitEvent) {
		event.preventDefault()
		if (busy()) return
		setInitialError(false)
		oauth.go('choose')
		if (step() === 'code') return verifyCode()
		if (step() === 'password') {
			setAttempted(true)
			if (!props.entry?.password || !password()) return
			void action.run(() => signIn(email().trim(), password(), destination()), 'sign_in_failed')
			return
		}
		setAttempted(true)
		if (emailProblem(email()) || email().length > 320) return
		passkeys.abort()
		if (step() === 'recovery' && legacyRecovery()) {
			void action.run(async () => {
				await recover(email().trim())
				changeStep('recovery-sent')
			}, 'recovery_failed')
		} else if (step() === 'entry') {
			if (props.entry?.otp) resendCode()
			else if (props.entry?.password) changeStep('password')
		}
	}

	const errorMessage = () => {
		const error = action.error()
		if (initialError() || (!error && step() === 'entry' && oauth.errorCode()))
			return v('googleError')
		if (!error) return null
		if (error === 'proof_rejected') return v(step() === 'code' ? 'invalidCode' : 'passkeyError')
		if (error === 'rate_limited') return v('rateLimited')
		if (error === 'sign_in_failed') return t('signInError')
		if (error === 'recovery_failed') return t('resetError')
		if (error === 'passkey_unavailable') return v('passkeyError')
		if (error === 'mfa_required') return v('mfaRequired')
		return v('unavailable')
	}

	function selectGoogle() {
		passkeys.abort()
		setInitialError(false)
		action.clearError()
		void oauth.social('google')
	}

	function resendCode() {
		void action.run(otp.startCode, 'sign_in_unavailable')
	}

	return {
		otp,
		step,
		email,
		password,
		busy,
		availablePasskey,
		legacyRecovery,
		emailPath,
		emailError,
		errorMessage,
		attempted,
		submit,
		changeStep,
		changeEmail,
		setPassword,
		selectGoogle,
		googleBusy: oauth.busy,
		resendCode,
		passkey: passkeys.passkey,
		setEmailInput: (el: HTMLInputElement) => {
			emailInput = el
		},
		setProofInput: (el: HTMLInputElement) => {
			proofInput = el
		},
		focusEmail: () => {
			if (step() === 'entry') setEmailFocused(true)
		},
		updateEmail: (value: string) => {
			setEmail(value)
			action.clearError()
		},
		updateCode: (value: string) => {
			otp.setCode(value)
			action.clearError()
			verifyCode()
		},
	}
}
