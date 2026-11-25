import 'server-only'

import { uuidv7 } from '@sylphx/sdk/runtime'
import { destIdentityCall } from './http'
import { identityDestAdmission } from './request-identity'

export async function recordPolicyAcceptance(userId: string): Promise<void> {
	const { credential, projectId } = identityDestAdmission()
	await destIdentityCall('/v1/consents', {
		method: 'POST',
		credential,
		signal: AbortSignal.timeout(5000),
		body: {
			idempotency_key: uuidv7(),
			project_id: projectId,
			principal_id: userId,
			purpose: 'necessary',
			state: 'granted',
			legal_basis: 'consent',
			occurred_at_unix_seconds: Math.floor(Date.now() / 1000),
		},
	})
}
