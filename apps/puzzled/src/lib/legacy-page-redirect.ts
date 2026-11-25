import type { GameSlug } from '@/games/registry'
import { defaultLocale } from '@/lib/i18n/config'
import { localeFromPathname } from '@/lib/i18n/page-locale'
import { localizedPath } from '@/lib/seo/urls'

// These are historical page URLs, not aliases for gameplay or API slugs.
const LEGACY_PAGES = new Map<string, `/games/${GameSlug}` | '/games/quartet' | '/vs' | '/stats'>([
	['/games/threads', '/games/quartet'],
	['/games/word-groups', '/games/quartet'],
	['/games/tango', '/games/duo'],
	['/games/queens', '/games/crowns'],
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
	['/leaderboard', '/stats'],
])

// Match whole, retired namespaces without turning arbitrary 404s into redirects.
const RETIRED_BLOG = /^\/blog(?:\/|$)/
const RETIRED_CONTENT = /^\/(?:apps|memes|avatars|wallpapers|stickers)(?:\/|$)/
const RETIRED_OG_IMAGE = /\/opengraph-image\/?$/

export function retiredOpenGraphImage(request: Request): Response | undefined {
	if (RETIRED_OG_IMAGE.test(new URL(request.url).pathname)) {
		// This was an image URL, not a page alias. Never invoke the live /og
		// renderer or let page/locale redirects run for this endpoint.
		return new Response(null, { status: 404 })
	}
}

export function legacyPageRedirect(request: Request): Response | undefined {
	if (request.method !== 'GET' && request.method !== 'HEAD') return
	const { pathname, search } = new URL(request.url)
	if (RETIRED_OG_IMAGE.test(pathname)) return

	const locale = localeFromPathname(pathname)
	const path = locale ? pathname.slice(locale.length + 1) : pathname
	const exactTarget = LEGACY_PAGES.get(path.endsWith('/') ? path.slice(0, -1) : path)
	const oldLocale = locale ? undefined : /^\/(en|zh)(?=\/)/.exec(path)?.[1]
	const retiredPath = oldLocale ? path.slice(3) : path
	const target = exactTarget ?? retiredPageTarget(retiredPath)
	if (!target) return

	// Only a fixed target and a known locale set the path. The query is kept
	// verbatim for attribution and cannot change the origin.
	return new Response(null, {
		status: 301,
		headers: {
			Location: `${localizedPath(locale ?? (oldLocale === 'zh' ? 'zh-TW' : defaultLocale), target)}${search}`,
		},
	})
}

function retiredPageTarget(path: string) {
	if (RETIRED_BLOG.test(path)) return '/'
	if (RETIRED_CONTENT.test(path)) return '/games'
}
