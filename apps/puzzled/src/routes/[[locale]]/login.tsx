/** @jsxImportSource solid-js */
import { AuthPage, authRoute } from '@/features/identity/solid/auth-page'

export const route = authRoute('login')

export default function Page() {
	return <AuthPage kind="login" />
}
