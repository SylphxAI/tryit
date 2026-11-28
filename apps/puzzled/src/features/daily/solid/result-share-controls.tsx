/** @jsxImportSource solid-js */
import { Copy, Download, Share2 } from 'lucide-solid'
import { Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { createResultShare, ShareSurface } from './result-share-state'

export function createResultShareControls(
	share: ReturnType<typeof createResultShare>,
	t: Translate,
) {
	const { feedback, nativeShareAvailable, pending, save, shareChallenge, sharePrimary } = share
	const status = (surface: ShareSurface) => {
		const state = () => {
			const current = feedback()
			return current?.surface === surface ? current : undefined
		}
		return (
			<div classList={{ 'result-feedback': !!state() }}>
				{/* The live region must exist before the action updates its text. */}
				<p role="status" aria-atomic="true">
					<Show when={state()?.message}>{(message) => t(message())}</Show>
				</p>
				<Show when={state()?.caption}>
					{(caption) => (
						<label>
							{t('share.card.caption')}
							<textarea
								rows={3}
								readOnly
								value={caption()}
								class="mt-1 w-full rounded-lg border border-border p-2"
								onFocus={(event) => event.currentTarget.select()}
							/>
						</label>
					)}
				</Show>
			</div>
		)
	}
	const copyButton = (surface: ShareSurface) => (
		<button
			type="button"
			class="result-button result-copy"
			aria-disabled={pending() || undefined}
			onClick={() => void shareChallenge(surface, 'copy_challenge')}
		>
			<Copy size={16} aria-hidden="true" />
			{t('gameResult.copyChallenge')}
		</button>
	)
	// One gesture shares the finish: the share sheet when the platform has one,
	// the same Copy challenge button otherwise. Copy and Save PNG stay in the dialog.
	const primaryButton = (surface: ShareSurface) => (
		<Show when={nativeShareAvailable()} fallback={copyButton(surface)}>
			<button
				type="button"
				class="result-button result-copy result-primary-share"
				aria-disabled={pending() || undefined}
				onClick={() => void sharePrimary(surface)}
			>
				<Share2 size={16} aria-hidden="true" />
				{t('gameResult.shareResult')}
			</button>
		</Show>
	)
	const dialogActions = () => (
		<div class="result-action-row">
			{copyButton('dialog')}
			<button
				type="button"
				class="result-button"
				aria-disabled={pending() || undefined}
				onClick={() => void save()}
			>
				<Download size={16} aria-hidden="true" />
				{t('gameResult.savePng')}
			</button>
			<Show when={nativeShareAvailable()}>
				<button
					type="button"
					class="result-button result-native-share"
					aria-disabled={pending() || undefined}
					onClick={() => void shareChallenge('dialog', 'native_share')}
				>
					<Share2 size={16} aria-hidden="true" />
					{t('gameResult.shareResult')}
				</button>
			</Show>
		</div>
	)
	return { primaryButton, status, dialogActions }
}
