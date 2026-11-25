/** @jsxImportSource solid-js */
import { AuthPage } from '@/features/identity/solid/auth-page'
import { authRoute } from '@/features/identity/solid/auth-route'

export const route = authRoute('sign-in')

export default function Page() {
	return <AuthPage kind="sign-in" />
}
