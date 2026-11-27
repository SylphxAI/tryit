import { PREVIOUS_PRIVACY_VERSION, PRIVACY_VERSION, TERMS_VERSION } from '@/lib/config/app'

export const POLICY_ACCEPTANCE = {
	terms_accepted: true,
	terms_version: TERMS_VERSION,
	privacy_version: PRIVACY_VERSION,
	surface: 'puzzled_web',
} as const
export type PolicyAcceptance = Omit<typeof POLICY_ACCEPTANCE, 'privacy_version'> & {
	privacy_version: typeof PRIVACY_VERSION | typeof PREVIOUS_PRIVACY_VERSION
}

/** A privacy revision a sign-in may accept: the current one or, during rollover, its predecessor. */
export function isAcceptedPrivacyVersion(value: unknown): boolean {
	return value === PRIVACY_VERSION || value === PREVIOUS_PRIVACY_VERSION
}

export function isPolicyAcceptance(value: unknown): value is PolicyAcceptance {
	if (!value || typeof value !== 'object') return false
	const body = value as Record<string, unknown>
	return (
		Object.keys(body).length === 4 &&
		isAcceptedPrivacyVersion(body.privacy_version) &&
		Object.entries(POLICY_ACCEPTANCE).every(
			([key, expected]) => key === 'privacy_version' || body[key] === expected,
		)
	)
}
