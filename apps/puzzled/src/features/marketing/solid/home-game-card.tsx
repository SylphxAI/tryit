/** @jsxImportSource solid-js */
import type { lineupStatus } from '@/features/home/lib/home-day-copy'
import { gameFamilyColor, getGameColors } from '@/games/theme-colors'
import type { HomeDocument } from './home-data'
import styles from './home-game-card.module.css'

export function HomeGameCard(props: {
	game: HomeDocument['catalog'][number]
	status: ReturnType<typeof lineupStatus>
	href: string
	caption: string
}) {
	return (
		<li class={styles.slot}>
			<a
				class={styles.key}
				data-home-game={props.game.slug}
				data-home-status={props.status}
				href={props.href}
				data-start-intent={props.status === 'solved' ? undefined : props.game.slug}
			>
				<div class={`${styles.face} editorial-surface`}>
					<div
						class={`${styles.field} family-field ${gameFamilyColor[props.game.category]}`}
						style={{ '--game-paper': getGameColors(props.game.theme).hex }}
					>
						<img
							class={styles.motif}
							src={`/motifs/${props.game.slug}-zoom.svg`}
							alt=""
							width={132}
							height={84}
							decoding="async"
						/>
					</div>
					<div class="flex flex-1 flex-col gap-1 px-3 py-2.5">
						<strong class="game-tile-title break-words font-display text-[0.9375rem] leading-tight">
							{props.game.name}
						</strong>
						<span class="mt-auto text-xs leading-tight text-muted-foreground">{props.caption}</span>
					</div>
				</div>
			</a>
		</li>
	)
}
