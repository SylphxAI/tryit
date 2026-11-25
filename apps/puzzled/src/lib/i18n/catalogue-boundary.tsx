/** @jsxImportSource solid-js */
import { useLocation } from '@solidjs/router'
import { type Component, createMemo, lazy, type ParentProps, Show } from 'solid-js'
import { prepareBrowserMessages, prepareExtendedBrowserMessages } from './browser-catalogue'
import { defaultLocale, type Locale } from './config'
import { localeFromPathname } from './page-locale'

const boundaries = new Map<string, Component<ParentProps>>()
const ready: Component<ParentProps> = (props) => props.children

function localeBoundary(locale: Locale, extended: boolean) {
	const key = extended ? `${locale}:extended` : locale
	let boundary = boundaries.get(key)
	if (!boundary) {
		boundary = lazy(async () => {
			if (!import.meta.env.SSR) {
				await (extended ? prepareExtendedBrowserMessages(locale) : prepareBrowserMessages(locale))
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
		// The home, catalog and game boards need only the core catalogue.
		// All other routes retain access to the complete set of namespaces.
		const extended = Boolean(section && section !== 'games')
		return locale === defaultLocale && !extended ? ready : localeBoundary(locale, extended)
	})
	return (
		<Show when={boundary()} keyed>
			{(Ready) => <Ready>{props.children}</Ready>}
		</Show>
	)
}
