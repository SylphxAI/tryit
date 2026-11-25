/** @jsxImportSource solid-js */
import { Check, Minus } from 'lucide-solid'
import { createSignal, type JSX, Show } from 'solid-js'
import { ResultActions } from '@/features/daily/solid/result-actions'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import type { createBoardFinish } from './board-finish-controller'
import { PracticeFinishActions } from './practice-finish-actions'

export { createBoardFinish, type DailyBoardProps } from './board-finish-controller'

export function BoardFinish(props: {
	finish: ReturnType<typeof createBoardFinish>
	locale: Locale
	message: string
	practiceReveal?: JSX.Element
	shareTitle?: string
	shareText?: string
}) {
	const t = createTranslator(props.locale)
	const [resultOpen, setResultOpen] = createSignal(false)
	return (
		<>
			<Show when={props.finish.state() === 'pending'}>
				<p class="completion-card" role="status">
					{t('common.syncing')}
				</p>
			</Show>
			<Show when={props.finish.state() === 'failed'}>
				<p class="completion-card" role="alert">
					{t('common.error')}{' '}
					<button
						type="button"
						class="min-h-11 font-semibold underline"
						onClick={props.finish.retry}
					>
						{t('common.retry')}
					</button>
				</p>
			</Show>
			<Show when={props.finish.result()}>
				{(result) => (
					<div
						class="completion-card"
						data-board-finished
						data-result-open={resultOpen() || undefined}
					>
						<div class="completion-heading" data-outcome={result().status}>
							<span class="completion-mark" aria-hidden="true">
								{result().status === 'won' ? <Check size={17} /> : <Minus size={17} />}
							</span>
							<h2 class="font-display" role="status">
								{result().mode === 'practice'
									? t(result().status === 'won' ? 'practice.won' : 'practice.lost')
									: props.message}
							</h2>
						</div>
						<Show
							when={result().mode === 'practice'}
							fallback={
								<ResultActions
									facts={{ ...result(), mode: result().mode === 'archive' ? 'archive' : 'daily' }}
									isGuest={props.finish.isGuest}
									freshWin
									onDetailsOpenChange={setResultOpen}
									locale={props.locale}
									shareTitle={props.shareTitle}
									shareText={props.shareText}
								/>
							}
						>
							<PracticeFinishActions
								locale={props.locale}
								gameSlug={result().gameSlug}
								attempts={result().attempts}
								score={result().score}
								reveal={
									result().status === 'lost' && props.finish.revealJson()
										? props.practiceReveal
										: undefined
								}
								onNewPractice={props.finish.onNewPractice}
							/>
						</Show>
					</div>
				)}
			</Show>
		</>
	)
}
