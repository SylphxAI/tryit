import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { MarketingHero } from '@/features/marketing/components'
import { LegalDocument } from '@/features/marketing/components/legal-document'
import {
	TOKUSHOHO_LEAD as LEAD,
	TOKUSHOHO_TITLE as TITLE,
	TOKUSHOHO_SECTIONS,
} from '@/features/marketing/tokushoho-content'
import { buildPageMetadata } from '@/lib/seo/metadata'

type Props = {
	params: Promise<{ locale: string }>
}

/**
 * Japanese seller disclosure (特定商取引法に基づく表記). It is a Japan-market
 * legal page, so it exists only under /ja and is not part of the translated
 * catalogue or the hreflang sitemap.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await params
	return buildPageMetadata({ locale, path: '/tokushoho', title: TITLE, description: LEAD })
}

export default async function TokushohoPage({ params }: Props) {
	const { locale } = await params
	if (locale !== 'ja') notFound()
	setRequestLocale(locale)

	return (
		<main className="flex-1">
			<MarketingHero eyebrow="法的情報" title={TITLE} lead={LEAD} />
			<LegalDocument
				locale={locale}
				lastUpdatedLabel="最終更新日"
				tocTitle="目次"
				sections={TOKUSHOHO_SECTIONS}
			/>
		</main>
	)
}
