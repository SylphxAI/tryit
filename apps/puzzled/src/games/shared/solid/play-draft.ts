import { type Accessor, createSignal, onCleanup, onMount, untrack } from 'solid-js'
import { DAILY_PLAY_DRAFT_PREFIX } from '@/lib/storage-keys'

const MAX_DRAFT_CHARS = 512 * 1024

type Draft = { elapsedMs: number; fields: Record<string, unknown> }

// These are player-owned presentation values, not credentials or server facts.
// Some board reducers use Sets for notes and Maps for marked cells/keys.
function encode(value: unknown) {
	if (value instanceof Set) return { $set: [...value] }
	if (value instanceof Map) return { $map: [...value] }
	return value
}

function decode(value: unknown): unknown {
	if (value && typeof value === 'object' && Object.keys(value).length === 1) {
		if ('$set' in value && Array.isArray(value.$set)) return new Set(value.$set)
		if ('$map' in value && Array.isArray(value.$map)) return new Map(value.$map)
	}
	return value
}

/** A tab-local draft of the admitted daily board. Never used to open a board or accept a finish. */
export function createPlayDraft(
	identity:
		| { day: string; game: string; difficulty?: string; puzzleId: string; owner: string }
		| undefined,
	canWrite: Accessor<boolean>,
	onChange?: () => void,
) {
	const key =
		identity &&
		`${DAILY_PLAY_DRAFT_PREFIX}${identity.day}:${identity.game}:${identity.difficulty ?? 'default'}:${identity.puzzleId}:${identity.owner}`
	const fields = new Map<string, Accessor<unknown>>()
	let stored: Draft | undefined
	let changed = false
	let queued = false
	let discarded = false
	let elapsedBefore = 0
	const openedAt = Date.now()
	const elapsedMs = () => elapsedBefore + Math.max(0, Date.now() - openedAt)

	if (key && typeof window !== 'undefined') {
		try {
			const raw = sessionStorage.getItem(key)
			if (raw && raw.length <= MAX_DRAFT_CHARS) {
				const draft = JSON.parse(raw, (_, value) => decode(value)) as Partial<Draft> | null
				if (
					typeof draft?.elapsedMs === 'number' &&
					Number.isSafeInteger(draft.elapsedMs) &&
					draft.elapsedMs >= 0 &&
					draft.fields &&
					typeof draft.fields === 'object' &&
					!Array.isArray(draft.fields)
				) {
					stored = {
						fields: draft.fields,
						elapsedMs: draft.elapsedMs,
					}
					elapsedBefore = stored.elapsedMs
				}
			}
		} catch {
			// Invalid or blocked storage never stops play.
		}
	}

	function flush() {
		if (!key || discarded || (!changed && !stored) || !canWrite()) return
		try {
			const raw = JSON.stringify(
				{
					elapsedMs: elapsedMs(),
					fields: Object.fromEntries([...fields].map(([name, get]) => [name, get()])),
				},
				(_, value) => encode(value),
			)
			if (raw.length <= MAX_DRAFT_CHARS) {
				// Clear drafts from earlier product days, never other storage.
				const dayPrefix = `${DAILY_PLAY_DRAFT_PREFIX}${identity?.day}:`
				for (let index = sessionStorage.length - 1; index >= 0; index--) {
					const old = sessionStorage.key(index)
					if (old?.startsWith(DAILY_PLAY_DRAFT_PREFIX) && !old.startsWith(dayPrefix))
						sessionStorage.removeItem(old)
				}
				sessionStorage.setItem(key, raw)
			}
		} catch {
			// Quota/private-mode failures leave the current board playable.
		}
	}

	onMount(() => {
		if (key) window.addEventListener('pagehide', flush)
	})
	onCleanup(() => {
		if (key && typeof window !== 'undefined') {
			window.removeEventListener('pagehide', flush)
			flush()
		}
		discarded = true
	})

	return {
		elapsedMs,
		discard() {
			discarded = true
			try {
				if (key) sessionStorage.removeItem(key)
			} catch {
				// The server still owns completion if storage is unavailable.
			}
		},
		signal<T>(name: string, initial: T, restore?: (value: T) => T) {
			const [get, set] = createSignal(initial)
			if (key) {
				fields.set(name, get)
				// Apply the draft after hydration, not to the server-rendered markup.
				onMount(() => {
					if (stored && Object.hasOwn(stored.fields, name)) {
						const value = stored.fields[name] as T
						set(() => (restore ? restore(value) : value))
					}
				})
			}
			const update = (value: T | ((previous: T) => T)): T => {
				const previous = untrack(get)
				const next = typeof value === 'function' ? (value as (previous: T) => T)(previous) : value
				if (next !== previous) onChange?.()
				if (key && next !== previous) {
					changed = true
					// Coalesce the fields changed by one move; a terminal submission wins
					// over the draft and leaves the last nonterminal snapshot on failure.
					if (!queued) {
						queued = true
						queueMicrotask(() => {
							queued = false
							flush()
						})
					}
				}
				return set(() => next)
			}
			return [get, update] as const
		},
	}
}
