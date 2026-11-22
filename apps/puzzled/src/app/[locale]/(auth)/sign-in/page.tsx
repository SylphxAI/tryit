import { getTranslations } from 'next-intl/server'
import { safeNext } from '@/lib/identity/return-path'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { SignInForm } from './sign-in-form'

type Props = {
	params: Promise<{ locale: string }>
	searchParams: Promise<{ next?: string | string[]; error?: string }>
}

export async function generateMetadata({ params }: Props) {
	const { locale } = await params
	const t = await getTranslations({ locale, namespace: 'auth' })
	return buildPageMetadata({
		locale,
		path: '/sign-in',
		title: t('signInTitle'),
		description: t('signInDescription'),
		noindex: true,
		withAlternates: false,
	})
}

export default async function SignInPage({ searchParams }: Props) {
	const query = await searchParams
	return <SignInForm next={safeNext(query.next)} oauthFailed={query.error === 'oauth_failed'} />
}
