import type { GameSlug } from '@/games/registry'
import { defaultLocale } from '@/lib/i18n/config'
import { localeFromPathname } from '@/lib/i18n/page-locale'
import { localizedPath } from '@/lib/seo/urls'

// These are historical public URLs, not aliases for gameplay or API slugs.
const LEGACY_PAGES = new Map<string, `/games/${GameSlug}` | '/vs'>([
	['/games/threads', '/games/word-groups'],
	['/games/paint', '/games/nonogram'],
	['/games/rungs', '/games/word-ladder'],
	['/games/hunt', '/games/word-search'],
	['/games/path', '/games/number-path'],
	['/games/five', '/games/word-guess'],
	['/games/quad', '/games/quad-words'],
	['/games/match', '/games/pattern-match'],
	['/games/spots', '/games/pip-place'],
	['/games/cage-sudoku', '/games/killer-sudoku'],
	['/games/slides', '/games/block-slide'],
	['/games/mini-grid', '/games/crossword'],
	['/games/cipher', '/games/cryptogram'],
	['/games/frame', '/games/word-box'],
	['/games/hive', '/games/word-hive'],
	['/games/spellbee', '/games/word-hive'],
	['/games/mini', '/games/crossword'],
	['/compare', '/vs'],
])

export function legacyPageRedirect(request: Request): Response | undefined {
	if (request.method !== 'GET' && request.method !== 'HEAD') return
	const { pathname, search } = new URL(request.url)
	const locale = localeFromPathname(pathname)
	const path = locale ? pathname.slice(locale.length + 1) : pathname
	const target = LEGACY_PAGES.get(path.endsWith('/') ? path.slice(0, -1) : path)
	if (!target) return
	// Only the fixed target and a known locale set the path. Keep the query
	// verbatim for shared games and attribution; it cannot change the origin.
	return new Response(null, {
		status: 301,
		headers: { Location: `${localizedPath(locale ?? defaultLocale, target)}${search}` },
	})
}
