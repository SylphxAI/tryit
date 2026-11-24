import { POLICY_ACCEPTANCE } from './policy-consent'

export const OAUTH_PREFIX = '/api/identity/oauth'
export const OAUTH_ACCEPTANCE = {
	terms_version: POLICY_ACCEPTANCE.terms_version,
	privacy_version: POLICY_ACCEPTANCE.privacy_version,
} as const
