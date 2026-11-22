import { ConnectError, createClient } from '@connectrpc/connect'
import { PuzzleService } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { isPlusRequiredError } from '@/lib/billing/plus'
import { type LoadDailySnapshotInput, loadDailySnapshot } from '../lib/daily-fallback'

/** Passive request-local read: does not create a guest or claim a free pick. */
export async function readDailyLanding(headers: Headers, input: LoadDailySnapshotInput) {
	try {
		const snapshot = await loadDailySnapshot(
			input,
			createClient(PuzzleService, requestConnectTransport(headers)),
		)
		return snapshot.kind === 'unavailable' ? undefined : snapshot
	} catch (error) {
		// A failed SSR connection can be retried through the browser's edge route.
		if (isPlusRequiredError(ConnectError.from(error).rawMessage)) return { kind: 'locked' } as const
		return undefined
	}
}
