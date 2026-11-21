import type { Metadata } from 'next'
import { getCanonicalSiteOrigin } from '@/lib/site-origin.server'
import { type BuildPageMetadataInput, pageMetadata } from './page-metadata'

export { type BuildPageMetadataInput, ogImagePath } from './page-metadata'
export { canonicalUrl, HREFLANG, hreflangLanguages, localizedPath } from './urls'

export async function buildPageMetadata(input: BuildPageMetadataInput): Promise<Metadata> {
	return pageMetadata({ ...input, baseUrl: input.baseUrl ?? (await getCanonicalSiteOrigin()) })
}
