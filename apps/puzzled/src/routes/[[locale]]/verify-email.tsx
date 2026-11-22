/** @jsxImportSource solid-js */
import { AuthPage, authRoute } from '@/features/identity/solid/auth-page'

export const route = authRoute('verify-email')

export default function Page() {
	return <AuthPage kind="verify-email" />
}
