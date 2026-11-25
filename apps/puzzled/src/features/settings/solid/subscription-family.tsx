/** @jsxImportSource solid-js */
import { type Accessor, createSignal, For, Show } from 'solid-js'
import { ConsoleCard } from '@/features/console/solid/console-chrome'
import { selectCopyText } from '@/shared/hooks/select-copy-text'
import { primary, secondary } from './subscription-buttons'
import type {
	createSubscriptionState,
	SubscriptionActions,
	SubscriptionCopy,
	SubscriptionView,
} from './subscription-state'

// Keep clipboard state for the panel lifetime, even if a refresh hides the family card.
export function createFamilyInvite(
	state: Pick<
		ReturnType<typeof createSubscriptionState>,
		'view' | 'replacement' | 'setReplacement' | 'browser' | 'isMounted'
	>,
) {
	const { view, replacement, browser, isMounted, setReplacement } = state
	const [copyResult, setCopyResult] = createSignal<{
		text: string
		status: 'pending' | 'copied' | 'failed'
	}>()
	let inviteRef: HTMLParagraphElement | undefined
	let copying = 0

	const inviteUrl = () => {
		const code = replacement() ?? view()?.family?.inviteCode
		const origin = browser()?.origin
		return code && origin ? `${origin}/family/join?${new URLSearchParams({ code })}` : ''
	}
	const copyState = () => {
		const result = copyResult()
		return result?.text === inviteUrl() ? result.status : undefined
	}
	async function copy() {
		const text = inviteUrl()
		if (!text || copyState() === 'pending') return
		const id = ++copying
		setCopyResult({ text, status: 'pending' })
		try {
			await navigator.clipboard.writeText(text)
			if (isMounted() && id === copying) setCopyResult({ text, status: 'copied' })
		} catch {
			if (isMounted() && id === copying && text === inviteUrl()) {
				setCopyResult({ text, status: 'failed' })
				selectCopyText(inviteRef ?? null)
			}
		}
	}

	return {
		inviteUrl,
		copyState,
		copy,
		setInviteRef: (el: HTMLParagraphElement) => {
			inviteRef = el
		},
		replace: (code: string) => {
			if (isMounted()) setReplacement(code)
		},
	}
}

type Props = {
	group: Accessor<NonNullable<SubscriptionView['family']>>
	family: SubscriptionCopy
	translate: SubscriptionCopy
	actions: SubscriptionActions
	invite: ReturnType<typeof createFamilyInvite>
}

export function SubscriptionFamily(props: Props) {
	const { group, family } = props
	const { busy, confirming, setConfirming, run } = props.actions
	const { inviteUrl, copy, copyState, setInviteRef, replace } = props.invite
	return (
		<ConsoleCard title={family('title')} bodyClassName="space-y-4 text-sm">
			<Show when={group().role === 'owner' && inviteUrl()}>
				<div class="space-y-2">
					<p>{family('inviteBody', { count: group().maxMembers })}</p>
					<p
						ref={setInviteRef}
						tabIndex={-1}
						class="select-all break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs"
					>
						{inviteUrl()}
					</p>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class={secondary}
							onClick={copy}
							disabled={copyState() === 'pending'}
							aria-busy={copyState() === 'pending'}
						>
							<span aria-live="polite">
								{copyState() === 'pending'
									? props.translate('common.clipboard.pending')
									: family(copyState() === 'copied' ? 'copied' : 'copy')}
							</span>
						</button>
						<button
							type="button"
							class={secondary}
							disabled={busy()}
							title={family('newLinkHelp')}
							onClick={() =>
								run(async ({ resetFamilyInvite }) => {
									const code = await resetFamilyInvite()
									replace(code)
									return family('newLinkHelp')
								})
							}
						>
							{family('newLink')}
						</button>
					</div>
					<Show when={copyState() === 'failed'}>
						<p role="alert" class="text-destructive">
							{props.translate('common.clipboard.failed')}
						</p>
					</Show>
				</div>
			</Show>
			<div>
				<h3 class="font-semibold">{family('members')}</h3>
				<ul class="mt-2 divide-y divide-border">
					<For each={group().members}>
						{(member) => (
							<li class="flex min-h-11 items-center justify-between gap-3">
								<span>
									{member.displayName || family('unnamed')}{' '}
									<Show when={member.owner}>
										<span class="ml-2 text-muted-foreground">{family('owner')}</span>
									</Show>
								</span>
								<Show when={group().role === 'owner' && !member.owner}>
									<button
										type="button"
										class={secondary}
										disabled={busy()}
										onClick={() =>
											run(({ removeFamilyMember }) => removeFamilyMember(member.userId))
										}
									>
										{family('remove')}
									</button>
								</Show>
							</li>
						)}
					</For>
				</ul>
			</div>
			<Show when={group().role === 'member'}>
				<Show
					when={confirming() === 'leave'}
					fallback={
						<button
							type="button"
							class={secondary}
							disabled={busy()}
							onClick={() => setConfirming('leave')}
						>
							{family('leave')}
						</button>
					}
				>
					<div class="space-y-3 rounded-xl border border-border p-4">
						<p>{family('leaveConfirm')}</p>
						<button
							type="button"
							class={primary}
							disabled={busy()}
							onClick={() => run(({ leaveFamily }) => leaveFamily())}
						>
							{family('leave')}
						</button>
					</div>
				</Show>
			</Show>
		</ConsoleCard>
	)
}
