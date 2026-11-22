import 'server-only'
import { createClient } from '@connectrpc/connect'
import { consolePresentation } from '@/features/console/solid/read-context'
import { GamificationService } from '@/gen/connect/puzzled/v1/gamification_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { projectStreakInfo } from '@/lib/streak-info'
import { type MemberSettingsSection, settingsPath } from './sections'

async function readAutoFreeze(request: Request): Promise<boolean> {
	const client = createClient(GamificationService, requestConnectTransport(request.headers))
	return projectStreakInfo((await client.getStreakInfo({})).info).autoFreezeEnabled
}

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
		autoFreezeEnabled:
			section === 'preferences'
				? await withPresentationDeadline(readAutoFreeze(request), null)
				: null,
		account: section === 'account' ? { id: user.id, verified: user.emailVerified } : null,
	}
}

export type MemberSettingsData = NonNullable<Awaited<ReturnType<typeof readMemberSettings>>>
