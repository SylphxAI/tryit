/** @jsxImportSource solid-js */
import { Bell } from 'lucide-solid'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { ConsoleCard } from '@/features/console/solid/console-chrome'
import {
	persistSubscription,
	pushRegistration,
	subscribeBrowser,
} from '@/features/push/lib/web-push'
import { updatePushPreferences } from '@/lib/connect/preferences-client'
import type { Translate } from '@/lib/i18n/translate'
import { SettingsTitle } from './settings-controls'
import type { MemberSettingsData } from './settings-data'

type Reminders = NonNullable<MemberSettingsData['reminders']>
type Device = 'loading' | 'unsupported' | 'unavailable' | { subscription: PushSubscription | null }
const button = 'pressable min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60'

function PushSettings(props: { initial: Reminders; t: Translate }) {
	const t = (key: string) => props.t(`settings.notifications.push.${key}`)
	const [device, setDevice] = createSignal<Device>('loading')
	const [draft, setDraft] = createSignal(props.initial)
	const [pending, setPending] = createSignal<'device' | 'save'>()
	const [failed, setFailed] = createSignal(false)
	const activationRequired = () => !draft().pushEnabled
	const subscription = () => {
		const current = device()
		return typeof current === 'object' ? current.subscription : null
	}
	let active = true
	onCleanup(() => {
		active = false
	})
	onMount(() => {
		if (!('Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator)) {
			setDevice('unsupported')
			return
		}
		void (async () => {
			try {
				const registration = await pushRegistration()
				const sub = await registration.pushManager.getSubscription()
				// Preserve registration for an existing device on this signed-in account.
				if (sub && active) await persistSubscription(sub)
				if (active) setDevice({ subscription: sub })
			} catch {
				if (active) setDevice('unavailable')
			}
		})()
	})

	async function toggleDevice() {
		if (pending() || typeof device() !== 'object') return
		setPending('device')
		setFailed(false)
		try {
			const current = subscription()
			if (current) {
				await persistSubscription(current, true)
				if (!(await current.unsubscribe())) throw new Error('push_unsubscribe_unavailable')
				setDevice({ subscription: null })
			} else {
				const sub = await subscribeBrowser()
				if (!sub) throw new Error('push_permission_not_granted')
				setDevice({ subscription: sub })
				setDraft(await updatePushPreferences({ pushEnabled: true, pushDailyReminder: true }))
			}
		} catch {
			setFailed(true)
		} finally {
			setPending(undefined)
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		if (!subscription() || pending()) return
		setPending('save')
		setFailed(false)
		try {
			const { pushDailyReminder, pushStreakAlert, pushNewGames, dailyReminderTime } = draft()
			setDraft(
				await updatePushPreferences({
					pushEnabled: activationRequired() ? true : undefined,
					pushDailyReminder,
					pushStreakAlert,
					pushNewGames,
					dailyReminderTime,
				}),
			)
		} catch {
			setFailed(true)
		} finally {
			setPending(undefined)
		}
	}

	return (
		<>
			<div class="flex items-start gap-3">
				<span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted">
					<Bell class="h-5 w-5" aria-hidden="true" />
				</span>
				<div class="min-w-0">
					<h3 class="font-semibold">{t('heading')}</h3>
					<p class="text-sm text-muted-foreground">{t('description')}</p>
				</div>
			</div>
			<Show when={device() === 'loading'}>
				<p class="mt-4 text-sm text-muted-foreground" role="status">
					{t('loading')}
				</p>
			</Show>
			<Show when={device() === 'unsupported'}>
				<p class="mt-4 text-sm text-muted-foreground">{t('unsupported')}</p>
			</Show>
			<Show when={device() === 'unavailable' || failed()}>
				<p class="mt-4 text-sm text-destructive" role="alert">
					{t('unavailable')}
				</p>
			</Show>
			<Show when={typeof device() === 'object'}>
				<div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
					<p class="text-sm text-muted-foreground" role="status">
						{t(
							subscription()
								? activationRequired()
									? 'unavailable'
									: 'inlineEnabled'
								: 'enablePrompt',
						)}
					</p>
					<button
						type="button"
						class={button}
						classList={{
							'border border-border': !!subscription(),
							'bg-primary text-primary-foreground': !subscription(),
						}}
						disabled={!!pending()}
						onClick={toggleDevice}
					>
						{t(subscription() ? 'disable' : 'enableNotifications')}
					</button>
				</div>
			</Show>
			<Show when={subscription()}>
				<form class="mt-5" onSubmit={save}>
					<fieldset disabled={!!pending()}>
						<legend class="text-sm font-semibold">{t('typesHeading')}</legend>
						<PreferenceItem
							label={t('dailyReminder')}
							detail={t('dailyReminderDescription')}
							checked={draft().pushDailyReminder}
							change={(checked) => setDraft({ ...draft(), pushDailyReminder: checked })}
						/>
						<label class="block py-2 text-sm font-medium">
							{t('reminderTime')}
							<input
								type="time"
								required
								value={draft().dailyReminderTime}
								class="mt-2 block min-h-11 rounded-lg border border-border bg-background px-3"
								onInput={(event) =>
									setDraft({ ...draft(), dailyReminderTime: event.currentTarget.value })
								}
							/>
						</label>
						<PreferenceItem
							label={t('streakAlert')}
							detail={t('streakAlertDescription')}
							checked={draft().pushStreakAlert}
							change={(checked) => setDraft({ ...draft(), pushStreakAlert: checked })}
						/>
						<PreferenceItem
							label={t('newGames')}
							detail={t('newGamesDescription')}
							checked={draft().pushNewGames}
							change={(checked) => setDraft({ ...draft(), pushNewGames: checked })}
						/>
						<button type="submit" class={`${button} mt-3 bg-primary text-primary-foreground`}>
							{t(pending() === 'save' ? 'saving' : 'save')}
						</button>
					</fieldset>
				</form>
			</Show>
		</>
	)
}

function PreferenceItem(props: {
	label: string
	detail: string
	checked: boolean
	change: (checked: boolean) => void
}) {
	return (
		<label class="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
			<input
				type="checkbox"
				class="mt-0.5 size-5 shrink-0 accent-primary"
				aria-label={props.label}
				checked={props.checked}
				onChange={(event) => props.change(event.currentTarget.checked)}
			/>
			<span>
				<span class="block font-medium">{props.label}</span>
				<span class="block text-xs text-muted-foreground">{props.detail}</span>
			</span>
		</label>
	)
}

export function NotificationSettings(props: { data: MemberSettingsData; t: Translate }) {
	const t = (key: string) => props.t(`settings.notifications.${key}`)
	return (
		<>
			<SettingsTitle t={props.t} section="notifications" />
			<ConsoleCard title={t('channelTitle')} description={t('channelDescription')}>
				<Show
					when={props.data.reminders}
					keyed
					fallback={
						<p class="text-sm text-destructive" role="alert">
							{t('loadError')}
						</p>
					}
				>
					{(initial) => <PushSettings initial={initial} t={props.t} />}
				</Show>
			</ConsoleCard>
		</>
	)
}
