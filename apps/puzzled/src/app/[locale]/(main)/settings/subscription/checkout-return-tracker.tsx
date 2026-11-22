'use client'

import { useEffect } from 'react'
import { reportCheckoutReturn } from '@/features/plus/lib/checkout-return'

export function CheckoutReturnTracker({
	sessionId,
	status,
	userId,
	planId,
	value,
	currency,
}: Parameters<typeof reportCheckoutReturn>[0]) {
	useEffect(
		() => reportCheckoutReturn({ sessionId, status, userId, planId, value, currency }),
		[sessionId, status, userId, planId, value, currency],
	)
	return null
}
