import { MIN_PASSWORD_LENGTH } from './password-policy'

export { MIN_PASSWORD_LENGTH }

/** Sign-in only checks that a password was entered: older accounts may have shorter ones. */
export const SIGN_IN_MIN_PASSWORD_LENGTH = 1

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function emailProblem(value: string): 'emailRequired' | 'emailInvalid' | null {
	const trimmed = value.trim()
	if (!trimmed) return 'emailRequired'
	return EMAIL_PATTERN.test(trimmed) ? null : 'emailInvalid'
}

export function passwordProblem(
	value: string,
	minLength = MIN_PASSWORD_LENGTH,
): 'passwordRequired' | 'passwordTooShort' | null {
	if (!value) return 'passwordRequired'
	return value.length >= minLength ? null : 'passwordTooShort'
}
