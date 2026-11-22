'use client'

import { Button, Input, OAuthIcons } from '@sylphx/ui'
import { useTranslations } from 'next-intl'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@/lib/i18n/routing'
import { POLICY_ACCEPTANCE } from '@/lib/identity/policy-consent'
import { AuthSubmit, Divider, FormAlert, PasswordField } from '../_components/auth-fields'

type Config = { google: boolean; password: boolean; emailOtp: boolean; passkey: boolean }
type EmailStep = { step: 'email_otp'; flow: string } | { step: 'password' }
type Challenge = {
	challengeId: string
	challenge: string
	rpId: string
	allowCredentials: string[]
}
type Method = 'google' | 'email' | 'password' | 'passkey'
const API = '/api/identity/sign-in'
const LAST_METHOD = 'tryit:last-sign-in-method'

class SignInError extends Error {
	constructor(
		readonly code: string,
		readonly retryAfter: number,
	) {
		super(code)
	}
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
	const response = await fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal,
	})
	const result = await response.json()
	if (!response.ok) {
		const header = response.headers.get('retry-after')
		const delay =
			header && !/^\d+$/.test(header) ? (Date.parse(header) - Date.now()) / 1000 : Number(header)
		throw new SignInError(result.error, Number.isFinite(delay) ? Math.max(0, Math.ceil(delay)) : 0)
	}
	return result as T
}

function maskEmail(email: string) {
	const at = email.lastIndexOf('@')
	return `${email.slice(0, 1)}•••${email.slice(at)}`
}

function remember(method: Method) {
	try {
		localStorage.setItem(LAST_METHOD, method)
	} catch {
		// Storage can be unavailable in privacy mode. Signing in still works.
	}
}

export function SignInForm({ next, oauthFailed }: { next: string; oauthFailed: boolean }) {
	const t = useTranslations('auth')
	const [config, setConfig] = useState<Config | null>(null)
	const [embedded, setEmbedded] = useState(false)
	const [last, setLast] = useState<string | null>(null)
	const [canUsePasskey, setCanUsePasskey] = useState(false)
	const [screen, setScreen] = useState<'email' | 'email_otp' | 'password' | 'passkey'>('email')
	const [email, setEmail] = useState('')
	const [code, setCode] = useState('')
	const [password, setPassword] = useState('')
	const [flow, setFlow] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState(oauthFailed ? 'googleError' : '')
	const [resendAt, setResendAt] = useState(0)
	const [now, setNow] = useState(0)
	const busy = useRef(false)
	const autofill = useRef<AbortController | null>(null)
	const activeField = useRef<HTMLInputElement | null>(null)
	const previousScreen = useRef(screen)

	const finish = useCallback(
		(method: Method) => {
			remember(method)
			window.location.assign(next)
		},
		[next],
	)

	const passkey = useCallback(
		async (hint: string, signal?: AbortSignal) => {
			const challenge = await post<Challenge>(API, { action: 'begin-passkey', email: hint }, signal)
			const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON({
				challenge: challenge.challenge,
				rpId: challenge.rpId,
				allowCredentials: challenge.allowCredentials.map((id) => ({ id, type: 'public-key' })),
				userVerification: 'preferred',
				timeout: 60_000,
			})
			const credential = (await navigator.credentials.get({
				publicKey,
				...(signal ? { mediation: 'conditional', signal } : {}),
			})) as PublicKeyCredential | null
			if (!credential || signal?.aborted) return
			const { id, response } = credential.toJSON()
			await post(
				API,
				{
					action: 'verify-passkey',
					challengeId: challenge.challengeId,
					credentialId: id,
					...response,
				},
				signal,
			)
			if (!signal?.aborted) finish('passkey')
		},
		[finish],
	)

	useEffect(() => {
		const controller = new AbortController()
		setEmbedded(/FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(navigator.userAgent))
		try {
			setLast(localStorage.getItem(LAST_METHOD))
		} catch {
			/* optional preference */
		}
		const capable =
			typeof PublicKeyCredential !== 'undefined' &&
			typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function' &&
			typeof PublicKeyCredential.prototype.toJSON === 'function'
		setCanUsePasskey(capable)
		fetch(API, { signal: controller.signal })
			.then(async (response) => {
				if (response.ok) setConfig(await response.json())
			})
			.catch(() => undefined)
		return () => controller.abort()
	}, [])

	useEffect(() => {
		if (screen !== 'email' || !config?.passkey || !canUsePasskey) return
		const controller = new AbortController()
		autofill.current = controller
		PublicKeyCredential.isConditionalMediationAvailable?.()
			.then((available) => {
				if (available && !controller.signal.aborted) return passkey('', controller.signal)
			})
			.catch(() => undefined)
		return () => controller.abort()
	}, [screen, config?.passkey, canUsePasskey, passkey])

	useEffect(() => {
		if (previousScreen.current === screen) return
		previousScreen.current = screen
		// Fields become focusable again after the preceding request settles.
		activeField.current?.focus()
	}, [screen])

	const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
	useEffect(() => {
		if (!resendAt || seconds === 0) return
		const timer = window.setInterval(() => setNow(Date.now()), 250)
		return () => window.clearInterval(timer)
	}, [resendAt, seconds])

	function cooldown(seconds: number) {
		const start = Date.now()
		setNow(start)
		setResendAt(start + seconds * 1000)
	}

	async function run(action: () => Promise<void>, genericError: string) {
		if (busy.current) return
		busy.current = true
		autofill.current?.abort()
		setPending(true)
		setError('')
		try {
			await action()
		} catch (error) {
			if (error instanceof SignInError && ['rate_limited', 'locked_out'].includes(error.code)) {
				cooldown(Math.max(30, error.retryAfter))
				setError('rateLimited')
			} else if (error instanceof SignInError && error.code === 'mfa_required') {
				setError('mfaRequired')
			} else {
				setError(genericError)
			}
		} finally {
			busy.current = false
			setPending(false)
		}
	}

	function startEmail(method?: 'email_otp') {
		return run(async () => {
			if (!method && config?.passkey && canUsePasskey && !config.emailOtp && !config.password) {
				setScreen('passkey')
				return
			}
			const result = await post<EmailStep>(API, { action: 'continue', email, method })
			if (result.step === 'email_otp') {
				setCode('')
				setFlow(result.flow)
				cooldown(30)
			}
			setScreen(result.step)
		}, 'startError')
	}

	function verifyCode(value: string) {
		return run(async () => {
			await post(API, { action: 'verify-code', flow, code: value })
			finish('email')
		}, 'codeError')
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (screen === 'email') void startEmail()
		if (screen === 'email_otp' && /^\d{6}$/.test(code)) void verifyCode(code)
		if (screen === 'password') {
			void run(async () => {
				await post('/api/identity/login', { email, password })
				finish('password')
			}, 'passwordError')
		}
	}

	function changeEmail() {
		setScreen('email')
		setCode('')
		setPassword('')
		setFlow('')
		setResendAt(0)
		setError('')
	}

	const showGoogle = !embedded && config?.google !== false
	const lastUsed = (method: Method) =>
		last === method ? (
			<span className="text-xs font-medium text-muted-foreground">{t('unified.lastUsed')}</span>
		) : null
	const actionClass = 'min-h-11 justify-start px-0 text-sm underline underline-offset-4'
	return (
		<section aria-labelledby="sign-in-title" className="space-y-5">
			<div className="space-y-2">
				<h1 id="sign-in-title" className="font-display text-4xl leading-tight tracking-tight">
					{t('signInTitle')}
				</h1>
				{screen === 'email' ? (
					<p className="text-muted-foreground">{t('signInDescription')}</p>
				) : (
					<p className="break-all text-muted-foreground">
						{screen === 'email_otp'
							? t('unified.sentTo', { email: maskEmail(email) })
							: t('unified.continuingAs', { email: maskEmail(email) })}
					</p>
				)}
			</div>
			{screen === 'email' && showGoogle && (
				<>
					<Button
						type="button"
						variant="outline"
						className="h-12 w-full gap-3 text-base font-medium"
						disabled={pending}
						onClick={() =>
							void run(async () => {
								const { authorizationUrl } = await post<{ authorizationUrl: string }>(
									'/api/identity/oidc/begin',
									{ provider: 'google', redirectUrl: next, acceptance: POLICY_ACCEPTANCE },
								)
								remember('google')
								window.location.assign(authorizationUrl)
							}, 'googleError')
						}
					>
						<OAuthIcons.google className="size-5" aria-hidden="true" />
						{t('continueWith', { provider: 'Google' })}
						{lastUsed('google')}
					</Button>
					<Divider label={t('unified.or')} />
				</>
			)}
			<form className="space-y-4" onSubmit={submit}>
				{screen === 'email' && (
					<div>
						<label className="mb-1.5 block text-sm font-semibold" htmlFor="sign-in-email">
							{t('unified.emailAddress')}
						</label>
						<Input
							ref={activeField}
							id="sign-in-email"
							name="email"
							type="email"
							inputMode="email"
							autoComplete="username webauthn"
							enterKeyHint="next"
							required
							maxLength={254}
							className="h-12"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							readOnly={pending}
						/>
					</div>
				)}
				{screen === 'email_otp' && (
					<div>
						<label className="mb-1.5 block text-sm font-semibold" htmlFor="sign-in-code">
							{t('unified.code')}
						</label>
						<Input
							ref={activeField}
							id="sign-in-code"
							name="code"
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="[0-9]{6}"
							required
							className="h-12 tracking-widest"
							value={code}
							readOnly={pending}
							onChange={(event) => {
								const value = event.target.value.replace(/\D/g, '').slice(0, 6)
								setCode(value)
								if (value.length === 6) void verifyCode(value)
							}}
						/>
					</div>
				)}
				{screen === 'password' && (
					<>
						<input
							name="username"
							type="email"
							autoComplete="username"
							value={email}
							readOnly
							hidden
						/>
						<PasswordField
							id="sign-in-password"
							label={t('unified.existingPassword')}
							value={password}
							onChange={setPassword}
							autoComplete="current-password"
							required
							disabled={pending}
						/>
					</>
				)}
				<FormAlert message={error ? t(`unified.${error}`) : null} />
				{screen !== 'passkey' && (
					<AuthSubmit
						label={t(screen === 'email' ? 'unified.continue' : 'unified.verify')}
						pendingLabel={t('unified.working')}
						pending={pending}
					/>
				)}
			</form>
			{screen !== 'email' && (
				<div className="flex flex-wrap gap-x-4">
					{config?.passkey && canUsePasskey && (
						<Button
							variant="ghost"
							className={actionClass}
							disabled={pending}
							onClick={() => void run(() => passkey(email), 'passkeyError')}
						>
							{t('unified.usePasskey')}
							{lastUsed('passkey')}
						</Button>
					)}
					{screen === 'email_otp' && (
						<Button
							variant="ghost"
							className={actionClass}
							disabled={pending || seconds > 0}
							onClick={() => void startEmail('email_otp')}
						>
							{seconds ? t('unified.resendIn', { seconds }) : t('unified.resend')}
						</Button>
					)}
					{screen === 'password' && config?.emailOtp && (
						<Button
							variant="ghost"
							className={actionClass}
							disabled={pending || seconds > 0}
							onClick={() => void startEmail('email_otp')}
						>
							{t('unified.useCode')}
							{lastUsed('email')}
						</Button>
					)}
					{screen === 'email_otp' && config?.password && (
						<Button
							variant="ghost"
							className={actionClass}
							disabled={pending}
							onClick={() => {
								setError('')
								setScreen('password')
							}}
						>
							{t('unified.existingPassword')}
							{lastUsed('password')}
						</Button>
					)}
					<Button variant="ghost" className={actionClass} disabled={pending} onClick={changeEmail}>
						{t('unified.changeEmail')}
					</Button>
				</div>
			)}
			<p className="text-sm leading-relaxed text-muted-foreground">
				{t.rich('unified.terms', {
					terms: (label) => (
						<Link className="underline underline-offset-4" href="/terms">
							{label}
						</Link>
					),
					privacy: (label) => (
						<Link className="underline underline-offset-4" href="/privacy">
							{label}
						</Link>
					),
				})}
			</p>
		</section>
	)
}
