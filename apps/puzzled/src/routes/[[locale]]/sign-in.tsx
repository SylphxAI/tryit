/** @jsxImportSource solid-js */
import { AuthPage, authRoute } from '@/features/identity/solid/auth-page'

export const route = authRoute('sign-in')

export default function Page() {
	return <AuthPage kind="sign-in" />
}
