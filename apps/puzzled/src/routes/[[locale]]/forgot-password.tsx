/** @jsxImportSource solid-js */
import { AuthPage, authRoute } from '@/features/identity/solid/auth-page'

export const route = authRoute('forgot-password')

export default function Page() {
	return <AuthPage kind="forgot-password" />
}
