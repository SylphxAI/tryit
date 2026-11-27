import { Code, ConnectError } from '@connectrpc/connect'

/**
 * Lives apart from ./practice so pages that only link to practice (Home,
 * Catalog, game landings) do not download the Connect/protobuf runtime.
 */
export function practiceRefusal(error: unknown): 'guest' | 'free' | undefined {
	const { code, rawMessage } = ConnectError.from(error)
	if (code === Code.Unauthenticated) return 'guest'
	if (code === Code.PermissionDenied && rawMessage === 'plus_required_for_practice') return 'free'
}
