/** @jsxImportSource solid-js */
import { Copy, Download, Share2 } from 'lucide-solid'
import { Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { createResultShare, ShareSurface } from './result-share-state'

export function createResultShareControls(
	share: ReturnType<typeof createResultShare>,
	t: Translate,
) {
	const { feedback, nativeShareAvailable, pending, save, shareChallenge } = share
	const status = (surface: ShareSurface) => (
		<Show when={feedback()?.surface === surface && feedback()}>
			{(state) => (
				<div class="result-feedback">
					<p role="status">{t(state().message)}</p>
					<Show when={state().caption}>
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
			)}
		</Show>
	)
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
	return { copyButton, status, dialogActions }
}
