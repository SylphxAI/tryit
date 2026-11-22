import 'server-only'
import { consolePresentation } from '@/features/console/solid/read-context'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { type MemberSettingsSection, settingsPath } from './sections'

export async function readMemberSettings(
	locale: Locale,
	section: MemberSettingsSection,
	request: Request,
) {
	const user = await withPresentationDeadline(requestUser(request), null)
	if (!user) return null
	const t = createTranslator(locale)
	return {
		...consolePresentation({
			locale,
			path: settingsPath(section),
			t,
			title: t(section === 'overview' ? 'settings.title' : `settings.${section}.title`),
			description: t(
				section === 'overview' ? 'settings.subtitle' : `settings.${section}.description`,
			),
			eyebrow: t('settings.eyebrow'),
			request,
		}),
		name:
			section === 'overview' || section === 'profile' || section === 'account'
				? user.name?.trim() || null
				: null,
		email:
			section === 'overview' || section === 'profile' || section === 'account' ? user.email : null,
		account: section === 'account' ? { id: user.id, verified: user.emailVerified } : null,
	}
}

export type MemberSettingsData = NonNullable<Awaited<ReturnType<typeof readMemberSettings>>>
