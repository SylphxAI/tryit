/** @jsxImportSource solid-js */
import { useLocation } from '@solidjs/router'
import { type Component, lazy, type ParentProps, Show } from 'solid-js'
import { prepareBrowserMessages } from './browser-catalogue'
import { defaultLocale, type Locale } from './config'
import { pageLocale } from './page-locale'

const boundaries = new Map<Locale, Component<ParentProps>>()
const ready: Component<ParentProps> = (props) => props.children

function localeBoundary(locale: Locale) {
	let boundary = boundaries.get(locale)
	if (!boundary) {
		boundary = lazy(async () => {
			if (!import.meta.env.SSR) await prepareBrowserMessages(locale)
			return { default: ready }
		})
		boundaries.set(locale, boundary)
	}
	return boundary
}

export function CatalogueBoundary(props: ParentProps) {
	const location = useLocation()
	return (
		<Show when={pageLocale(location.pathname)} keyed>
			{(locale) => {
				if (locale === defaultLocale) return props.children
				const Ready = localeBoundary(locale)
				return <Ready>{props.children}</Ready>
			}}
		</Show>
	)
}
