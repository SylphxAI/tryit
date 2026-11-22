/** @jsxImportSource solid-js */
import { Meta, Title } from '@solidjs/meta'
import { useLocation } from '@solidjs/router'
import { HttpStatusCode } from '@solidjs/start'
import { pageLocale } from '@/lib/i18n/page-locale'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

export default function NotFound() {
	const location = useLocation()
	const locale = () => pageLocale(location.pathname)
	const t = () => createTranslator(locale())
	return (
		<main class="page-shell-wide space-y-4 py-16">
			<HttpStatusCode code={404} />
			<Title>{t()('common.notFound.title')}</Title>
			<Meta name="robots" content="noindex, nofollow" />
			<p class="text-sm font-semibold text-muted-foreground">{t()('common.notFound.eyebrow')}</p>
			<h1 class="font-display text-3xl">{t()('common.notFound.title')}</h1>
			<p>{t()('common.notFound.description')}</p>
			<a
				class="inline-flex min-h-11 items-center underline"
				href={localizedPath(locale(), '/games')}
			>
				{t()('common.notFound.browseCta')}
			</a>
		</main>
	)
}
