import { expect, test } from 'bun:test'
import plus from '@/messages/en-US/plus.json'
import { GET } from './llms-response'

test('/llms.txt states VAT in the same words as the pricing disclosure', async () => {
	const text = await GET().text()
	const disclosure = 'Prices include VAT where it applies.'
	expect(plus.pricing.sellerNote.startsWith(disclosure)).toBe(true)
	expect(text.split('\n')).toContain(disclosure)
	expect(text).not.toContain('Prices include VAT.\n')
})
