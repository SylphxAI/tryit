import { lazy } from 'solid-js'

export const gameBoards = new Map([
	['sudoku', lazy(() => import('@/games/sudoku/solid-board'))],
	['nonogram', lazy(() => import('@/games/nonogram/solid-board'))],
	['word-search', lazy(() => import('@/games/word-search/solid-board'))],
	['pattern-match', lazy(() => import('@/games/pattern-match/solid-board'))],
	['crowns', lazy(() => import('@/games/queens/solid-board'))],
	['duo', lazy(() => import('@/games/tango/solid-board'))],
	['number-path', lazy(() => import('@/games/number-path/solid-board'))],
	['word-groups', lazy(() => import('@/games/word-groups/solid-board'))],
	['killer-sudoku', lazy(() => import('@/games/killer-sudoku/solid-board'))],
	['word-ladder', lazy(() => import('@/games/word-ladder/solid-board'))],
	['word-guess', lazy(() => import('@/games/word-guess/solid-board'))],
	['cryptogram', lazy(() => import('@/games/cryptogram/solid-board'))],
	['word-box', lazy(() => import('@/games/word-box/solid-board'))],
	['arithmo', lazy(() => import('@/games/arithmo/solid-board'))],
	['block-slide', lazy(() => import('@/games/block-slide/solid-board'))],
	['crossword', lazy(() => import('@/games/crossword/solid-board'))],
	['pip-place', lazy(() => import('@/games/pip-place/solid-board'))],
	['quad-words', lazy(() => import('@/games/quad-words/solid-board'))],
	['word-hive', lazy(() => import('@/games/word-hive/solid-board'))],
])
