import type { Locale } from '@/lib/i18n/config'

/** Translate stored theme labels at display time without changing puzzle payloads. */
export function puzzleThemeLabel(
	theme: string | undefined,
	locale: Locale,
	zhTwLabels: Readonly<Record<string, string>>,
	fallback: string,
): string {
	if (!theme) return fallback
	if (locale !== 'zh-TW') return theme
	// A stored theme with no translation still gets a localized game label.
	return Object.hasOwn(zhTwLabels, theme) ? zhTwLabels[theme] : fallback
}
