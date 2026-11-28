/** @jsxImportSource solid-js */
import { X } from 'lucide-solid'
import type { Translate } from '@/lib/i18n/translate'

export function FirstMoveCue(props: { t: Translate; dismiss: () => void }) {
	return (
		<div
			class="play-meta flex items-center gap-2 rounded-xl border border-accent-warm bg-accent-warm-soft ps-2 text-sm leading-tight sm:gap-3 sm:ps-3"
			data-cage-first-move
		>
			<div class="shrink-0 text-center">
				<span class="sr-only">{props.t('games.killerSudoku.firstMove.example')}: 3 + 5 = 8</span>
				<div aria-hidden="true" class="pb-0.5 text-[10px] font-semibold leading-none">
					{props.t('games.killerSudoku.firstMove.example')}
				</div>
				<div
					class="relative grid h-8 w-14 grid-cols-2 items-end rounded border border-dashed border-accent-warm-foreground bg-card pb-0.5 font-bold"
					aria-hidden="true"
				>
					<span class="absolute start-1 top-0.5 text-[11px] leading-none">8</span>
					<span class="border-e border-hairline">3</span>
					<span>5</span>
				</div>
			</div>
			<p class="min-w-0 flex-1 text-[13px] sm:text-sm" data-first-action>
				{props.t('games.killerSudoku.firstMove.sum')}
				<strong class="block">{props.t('games.killerSudoku.firstMove.action')}</strong>
			</p>
			<button
				type="button"
				class="grid size-12 shrink-0 place-items-center rounded-lg hover:bg-card"
				aria-label={props.t('common.dismiss')}
				onClick={props.dismiss}
			>
				<X size={18} aria-hidden="true" />
			</button>
		</div>
	)
}
