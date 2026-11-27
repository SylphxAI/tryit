import { describe, expect, test } from 'bun:test'
import { PREVIOUS_PRIVACY_VERSION, PRIVACY_VERSION } from '@/lib/config/app'
import { isAcceptedPrivacyVersion, isPolicyAcceptance, POLICY_ACCEPTANCE } from './policy-consent'

describe('policy acceptance across a privacy revision', () => {
	test('accepts the current revision and, during rollover, the previous one', () => {
		expect(isPolicyAcceptance(POLICY_ACCEPTANCE)).toBe(true)
		expect(
			isPolicyAcceptance({ ...POLICY_ACCEPTANCE, privacy_version: PREVIOUS_PRIVACY_VERSION }),
		).toBe(true)
		expect(isAcceptedPrivacyVersion(PRIVACY_VERSION)).toBe(true)
		expect(isAcceptedPrivacyVersion(PREVIOUS_PRIVACY_VERSION)).toBe(true)
	})

	test('refuses any other revision, terms version, surface or extra field', () => {
		for (const value of [
			{ ...POLICY_ACCEPTANCE, privacy_version: '2020-01-01' },
			{ ...POLICY_ACCEPTANCE, terms_version: '2020-01-01' },
			{ ...POLICY_ACCEPTANCE, surface: 'unexpected_surface' },
			{ ...POLICY_ACCEPTANCE, terms_accepted: false },
			{ ...POLICY_ACCEPTANCE, extra: true },
			null,
		])
			expect(isPolicyAcceptance(value)).toBe(false)
		expect(isAcceptedPrivacyVersion('2020-01-01')).toBe(false)
	})
})
