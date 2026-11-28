/** @jsxImportSource solid-js */
import { useLocation } from '@solidjs/router'
import { type Component, createMemo, lazy, type ParentProps, Show } from 'solid-js'
import {
	prepareBrowserMessages,
	prepareExtendedBrowserMessages,
	prepareHomeBrowserMessages,
} from './browser-catalogue'
import { defaultLocale, type Locale } from './config'
import { localeFromPathname } from './page-locale'

const boundaries = new Map<string, Component<ParentProps>>()
const prepare = {
	home: prepareHomeBrowserMessages,
	core: prepareBrowserMessages,
	extended: prepareExtendedBrowserMessages,
}
const ready: Component<ParentProps> = (props) => props.children

function localeBoundary(locale: Locale, scope: keyof typeof prepare) {
	const key = `${locale}:${scope}`
	let boundary = boundaries.get(key)
	if (!boundary) {
		boundary = lazy(async () => {
			if (!import.meta.env.SSR) {
				await prepare[scope](locale)
			}
			return { default: ready }
		})
		boundaries.set(key, boundary)
	}
	return boundary
}

export function CatalogueBoundary(props: ParentProps) {
	const location = useLocation()
	const boundary = createMemo(() => {
		const pathname = location.pathname
		const prefix = localeFromPathname(pathname)
		const locale = prefix ?? defaultLocale
		const section = pathname.split('/')[prefix ? 2 : 1]?.toLowerCase()
		if (!section && locale === defaultLocale) return ready
		return localeBoundary(locale, !section ? 'home' : section === 'games' ? 'core' : 'extended')
	})
	return (
		<Show when={boundary()} keyed>
			{(Ready) => <Ready>{props.children}</Ready>}
		</Show>
	)
}
