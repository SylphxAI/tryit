import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/config/app'

export const POLICY_ACCEPTANCE = {
	terms_accepted: true,
	terms_version: TERMS_VERSION,
	privacy_version: PRIVACY_VERSION,
	surface: 'puzzled_web',
} as const
export type PolicyAcceptance = typeof POLICY_ACCEPTANCE

export function isPolicyAcceptance(value: unknown): value is PolicyAcceptance {
	if (!value || typeof value !== 'object') return false
	const body = value as Record<string, unknown>
	return (
		Object.keys(body).length === 4 &&
		Object.entries(POLICY_ACCEPTANCE).every(([key, expected]) => body[key] === expected)
	)
}
