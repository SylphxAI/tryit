/** @jsxImportSource solid-js */
import { useParams } from '@solidjs/router'
import type { JSX } from 'solid-js'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'

/** Editorial copy is English; its destination still honors the visitor's route locale. */
export function EditorialLink(
	props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
) {
	const params = useParams()
	const href = () => {
		const source = props.href
		if (!source.startsWith('/') || source.startsWith('//')) return source
		const locale = params.locale && isValidLocale(params.locale) ? params.locale : defaultLocale
		const boundary = source.search(/[?#]/)
		if (boundary === -1) return localizedPath(locale, source)
		return localizedPath(locale, source.slice(0, boundary)) + source.slice(boundary)
	}
	return <a {...props} href={href()} />
}
