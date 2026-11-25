import 'server-only'

import { uuidv7 } from '@sylphx/sdk/runtime'
import { destIdentityCall } from './http'
import type { PolicyAcceptance } from './policy-consent'
import { identityDestAdmission } from './request-identity'

export function policyAcceptancePurpose(acceptance: PolicyAcceptance): string {
	return `policy_acceptance:terms=${acceptance.terms_version};privacy=${acceptance.privacy_version};surface=${acceptance.surface}`
}

export async function recordPolicyAcceptance(
	userId: string,
	acceptance: PolicyAcceptance,
): Promise<void> {
	const { credential, projectId } = identityDestAdmission()
	await destIdentityCall('/v1/consents', {
		method: 'POST',
		credential,
		signal: AbortSignal.timeout(5000),
		body: {
			idempotency_key: uuidv7(),
			project_id: projectId,
			principal_id: userId,
			purpose: policyAcceptancePurpose(acceptance),
			state: 'granted',
			legal_basis: 'consent',
			occurred_at_unix_seconds: Math.floor(Date.now() / 1000),
		},
	})
}
