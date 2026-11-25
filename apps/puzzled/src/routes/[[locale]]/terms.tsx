/** @jsxImportSource solid-js */
import { PolicyPage } from '@/features/marketing/solid/policy-page'
import { policyRoute } from '@/features/marketing/solid/policy-route'

export const route = policyRoute('terms')

export default function Page() {
	return <PolicyPage kind="terms" />
}
