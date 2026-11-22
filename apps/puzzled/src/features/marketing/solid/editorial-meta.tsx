/** @jsxImportSource solid-js */
import { defaultLocale } from '@/lib/i18n/config'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { PageMeta } from '@/shared/solid/page-meta'

type EditorialSpec = {
	path: string
	metaTitle: string
	metaDescription: string
	eyebrow: string
}

export function EditorialMeta(props: {
	spec: EditorialSpec
	origin: string
	type?: 'website' | 'article'
	imageSubtitle: string
}) {
	return (
		<PageMeta
			value={pageMetadata({
				baseUrl: props.origin,
				locale: defaultLocale,
				englishOnly: true,
				path: props.spec.path,
				title: props.spec.metaTitle,
				description: props.spec.metaDescription,
				type: props.type,
				imagePath: ogImagePath({
					title: props.spec.metaTitle,
					subtitle: props.imageSubtitle,
					eyebrow: props.spec.eyebrow,
				}),
			})}
		/>
	)
}
