import { expect, test } from 'bun:test'
import nonogramPatterns from '../../../../../crates/puzzled-core/src/capabilities/puzzle_play/generate/data/nonogram_patterns.json'
import nonogramLabels from '../nonogram/puzzle-themes.zh-TW.json'
import wordSearchLabels from '../word-search/puzzle-themes.zh-TW.json'
import { puzzleThemeLabel } from './puzzle-theme-label'

test('each Nonogram generator theme has its own Taiwan label; English keeps the payload', () => {
	const themes = nonogramPatterns.map(({ theme }) => theme)
	expect(Object.keys(nonogramLabels).sort()).toEqual([...themes].sort())
	const labels = themes.map((theme) => {
		expect(puzzleThemeLabel(theme, 'en-US', nonogramLabels, 'Paint')).toBe(theme)
		const label = puzzleThemeLabel(theme, 'zh-TW', nonogramLabels, '數繪')
		expect(label, theme).toMatch(/\p{Script=Han}/u)
		expect(label, theme).not.toBe('數繪')
		return label
	})
	expect(new Set(labels).size).toBe(themes.length)
	expect(puzzleThemeLabel('Star', 'zh-TW', nonogramLabels, '數繪')).toBe('星星')
	expect(puzzleThemeLabel('A', 'zh-TW', nonogramLabels, '數繪')).toBe('字母 A')
	expect(puzzleThemeLabel(undefined, 'zh-TW', nonogramLabels, '數繪')).toBe('數繪')
	expect(puzzleThemeLabel('Untranslated theme', 'zh-TW', nonogramLabels, '數繪')).toBe('數繪')
})

test('Word Search localizes the theme without changing the English board', () => {
	expect(puzzleThemeLabel('Music', 'zh-TW', wordSearchLabels, '字母尋詞')).toBe('音樂')
	expect(puzzleThemeLabel('Music', 'en-US', wordSearchLabels, 'Hunt')).toBe('Music')
})
