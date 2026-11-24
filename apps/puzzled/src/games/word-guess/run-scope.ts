import { uuidv7 } from '@sylphx/sdk/runtime'
import { readPlayScope } from '@/features/daily/solid/play-scope'

let documentNonce: string | undefined

/** A pending guess belongs to its document, even when a draft can outlive it. */
export function readFiveRunScope(): Promise<string | undefined> {
	documentNonce ??= uuidv7()
	return readPlayScope(documentNonce)
}
