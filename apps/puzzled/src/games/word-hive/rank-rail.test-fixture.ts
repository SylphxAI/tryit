import { createComponent, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { createTranslator } from '@/lib/i18n/translate'
import { createInitialState } from './play-state'
import { RankRail } from './solid-board'
import { getRankForScore } from './types'

export function mountRankRail(host: HTMLElement) {
	const initial = createInitialState({
		centerLetter: 'A',
		outerLetters: ['C', 'H', 'I', 'R', 'T', 'Y'],
		maxScore: 292,
		totalWords: 0,
		totalPangrams: 0,
	})
	const [score, setScore] = createSignal(0)
	const dispose = render(
		() =>
			createComponent(RankRail, {
				get state() {
					return { ...initial, score: score(), rank: getRankForScore(score(), initial.maxScore) }
				},
				t: createTranslator('en-US'),
			}),
		host,
	)
	return { setScore, dispose }
}
