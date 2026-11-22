/** @jsxImportSource solid-js */
import type { lineupStatus } from '@/features/home/lib/home-day-copy'
import { getGameColors } from '@/games/theme-colors'
import type { HomeDocument } from './home-data'
import styles from './home-game-card.module.css'

export function HomeGameCard(props: {
	game: HomeDocument['catalog'][number]
	index: number
	status: ReturnType<typeof lineupStatus>
	href: string
	caption: string
	onClick: (event: MouseEvent) => void
}) {
	return (
		<li class={styles.slot} style={{ '--lineup-delay': `${Math.min(props.index, 7) * 24}ms` }}>
			<a
				class={styles.key}
				data-home-game={props.game.slug}
				data-home-status={props.status}
				href={props.href}
				onClick={props.onClick}
			>
				<div class={styles.face}>
					<div class={`${styles.field} ${getGameColors(props.game.theme).bg}`}>
						<img
							class={styles.motif}
							src={`/motifs/${props.game.slug}-zoom.svg`}
							alt=""
							width={132}
							height={84}
							loading={props.index < 8 ? 'eager' : 'lazy'}
							decoding="async"
						/>
					</div>
					<div class="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
						<strong class="game-tile-title break-words font-display text-sm leading-tight">
							{props.game.name}
						</strong>
						<span class="mt-auto text-xs leading-tight text-muted-foreground">{props.caption}</span>
					</div>
				</div>
			</a>
		</li>
	)
}
