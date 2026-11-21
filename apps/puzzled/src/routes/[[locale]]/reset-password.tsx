/** @jsxImportSource solid-js */
import { AuthPage, authRoute } from '@/features/identity/solid/auth-page'

export const route = authRoute('reset-password')

export default function Page() {
	return <AuthPage kind="reset-password" />
}
