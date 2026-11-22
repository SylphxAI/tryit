/** Preserve old entry links while giving all new links the same query contract. */
export const SIGN_IN_ALIASES = [
	'/login',
	'/signup',
	'/sign-up',
	'/register',
	'/forgot-password',
] as const

/** Follow only origin-relative paths, without browser-normalized authority or controls. */
export function safeReturnPath(raw: unknown): string | null {
	if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject controls in redirect destinations.
	if (/[\\\u0000-\u001f\u007f-\u009f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)) return null
	return raw
}

export function safeNext(raw: unknown): string {
	return safeReturnPath(raw) ?? '/'
}
