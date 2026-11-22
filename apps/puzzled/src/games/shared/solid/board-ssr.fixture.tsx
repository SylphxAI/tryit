/** @jsxImportSource solid-js */
import { createRoot } from 'solid-js'
import { Dynamic, renderToString } from 'solid-js/web'
import QuadWordsBoard from '@/games/quad-words/solid-board'
import WordGuessBoard from '@/games/word-guess/solid-board'
import WordHiveBoard from '@/games/word-hive/solid-board'
import type { DailyBoardProps } from './finish'

const boards = {
	'quad-words': QuadWordsBoard,
	'word-guess': WordGuessBoard,
	'word-hive': WordHiveBoard,
}

export function renderBoard(slug: keyof typeof boards, props: DailyBoardProps): string {
	let disposeBoard = () => {}
	try {
		return renderToString(() =>
			createRoot((dispose) => {
				disposeBoard = dispose
				return <Dynamic component={boards[slug]} {...props} />
			}),
		)
	} finally {
		// Dispose synchronously, without a DOM, as Solid also does when the SSR stream completes.
		disposeBoard()
	}
}
