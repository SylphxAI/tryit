/** @jsxImportSource solid-js */
import { type RouteDefinition, useParams, useSearchParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { CheckCircle, Gamepad2, Loader2, Mail, XCircle } from 'lucide-solid'
import { createEffect, createMemo, createSignal, Match, on, onCleanup, Switch } from 'solid-js'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

type Failure = 'missingToken' | 'invalidToken' | 'notFound' | 'failed' | 'network'
type State = { kind: 'idle' | 'loading' | 'success' } | { kind: 'error'; reason: Failure }

export const route: RouteDefinition = { matchFilters: { locale: isValidLocale } }

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value
}

const button =
	'inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground'

export default function UnsubscribePage() {
	const params = useParams()
	const [search] = useSearchParams()
	const locale = () => {
		const value = params.locale ?? defaultLocale
		return isValidLocale(value) ? value : defaultLocale
	}
	const translate = createMemo(() => createTranslator(locale()))
	const t = (key: string) => translate()(`auth.unsubscribe.${key}`)
	const token = () => first(search.token)
	const result = (): State => {
		if (first(search.success) === 'true') return { kind: 'success' }
		switch (first(search.error)) {
			case 'missing_token':
				return { kind: 'error', reason: 'missingToken' }
			case 'invalid_token':
				return { kind: 'error', reason: 'invalidToken' }
			case 'not_found':
				return { kind: 'error', reason: 'notFound' }
			case undefined:
			case '':
				return token() ? { kind: 'loading' } : { kind: 'idle' }
			default:
				return { kind: 'error', reason: 'failed' }
		}
	}
	const [outcome, setOutcome] = createSignal<{ token: string; state: State }>()
	const state = (): State => {
		const initial = result()
		const settled = outcome()
		return initial.kind === 'loading' && settled && settled.token === token()
			? settled.state
			: initial
	}
	const pending = () => (result().kind === 'loading' ? token() : undefined)
	createEffect(
		on(pending, (code) => {
			setOutcome(undefined)
			if (!code) return
			const controller = new AbortController()
			onCleanup(() => controller.abort())
			const update = (state: State) => {
				if (!controller.signal.aborted) setOutcome({ token: code, state })
			}
			void fetch('/api/email/unsubscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: code }),
				signal: controller.signal,
			})
				.then((response) => {
					update(
						response.ok
							? { kind: 'success' }
							: { kind: 'error', reason: response.status === 400 ? 'invalidToken' : 'failed' },
					)
				})
				.catch(() => update({ kind: 'error', reason: 'network' }))
		}),
	)
	const failure = () => {
		const current = state()
		return current.kind === 'error' ? t(`error.${current.reason}`) : ''
	}
	const home = () => localizedPath(locale())
	const settings = () => localizedPath(locale(), '/settings')
	return (
		<main class="flex min-h-screen flex-col items-center justify-center px-4">
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<HttpHeader name="Referrer-Policy" value="no-referrer" />
			<div class="w-full max-w-sm space-y-6 text-center">
				<h1 class="mb-2 flex items-center justify-center gap-2 text-2xl font-bold">
					<Gamepad2 size={28} class="text-primary" aria-hidden="true" />
					Tryit
				</h1>
				<Switch>
					<Match when={state().kind === 'loading'}>
						<div class="space-y-4" role="status">
							<Loader2 class="mx-auto h-12 w-12 animate-spin text-primary" aria-hidden="true" />
							<p class="text-muted-foreground">{t('processing')}</p>
						</div>
					</Match>
					<Match when={state().kind === 'success'}>
						<div class="space-y-4">
							<CheckCircle class="mx-auto h-12 w-12 text-correct" aria-hidden="true" />
							<div role="status">
								<h2 class="text-xl font-semibold">{t('successTitle')}</h2>
								<p class="text-muted-foreground">{t('successDescription')}</p>
							</div>
							<a class={button} href={home()}>
								{t('returnHome')}
							</a>
						</div>
					</Match>
					<Match when={state().kind === 'error'}>
						<div class="space-y-4">
							<XCircle class="mx-auto h-12 w-12 text-wrong" aria-hidden="true" />
							<div role="alert">
								<h2 class="text-xl font-semibold">{t('failedTitle')}</h2>
								<p class="text-muted-foreground">{failure()}</p>
							</div>
							<div class="space-y-2">
								<a class={button} href={settings()}>
									{t('managePreferences')}
								</a>
								<a
									class="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 font-semibold"
									href={home()}
								>
									{t('returnHome')}
								</a>
							</div>
						</div>
					</Match>
					<Match when={state().kind === 'idle'}>
						<div class="space-y-4">
							<Mail class="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
							<div>
								<h2 class="text-xl font-semibold">{t('idleTitle')}</h2>
								<p class="text-muted-foreground">{t('idleDescription')}</p>
							</div>
							<a class={button} href={settings()}>
								{t('goToSettings')}
							</a>
						</div>
					</Match>
				</Switch>
			</div>
		</main>
	)
}
