/** @jsxImportSource solid-js */
import { PolicyPage, policyRoute } from '@/features/marketing/solid/policy-page'

export const route = policyRoute('terms')

export default function Page() {
	return <PolicyPage kind="terms" />
}
