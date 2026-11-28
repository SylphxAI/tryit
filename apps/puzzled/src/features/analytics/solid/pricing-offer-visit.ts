import { createContext, onCleanup, useContext } from 'solid-js'
import type { PlanId } from '@/lib/billing/plus'
import { trackGa4PricingOffer } from '../lib/ga4-pricing-offer'

/** Provided by the route, above keyed pricing data, so query refreshes are not visits. */
export const PricingOfferVisit = createContext<Set<'plus' | 'family'>>()

export function usePricingOfferVisibility() {
	const viewed = useContext(PricingOfferVisit)
	return (row: HTMLElement, card: 'plus' | 'family', plan: PlanId) => {
		if (!viewed || viewed.has(card) || typeof IntersectionObserver !== 'function') return
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry || entry.intersectionRatio < 0.5 || document.hidden || viewed.has(card)) return
				const { x, y, width, height } = entry.intersectionRect
				if (width <= 0 || height <= 0) return
				if (!row.contains(document.elementFromPoint(x + width / 2, y + height / 2))) return
				if (row.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false)
					return
				// Consume exposure regardless of consent or destination availability. Never replay it.
				viewed.add(card)
				observer.disconnect()
				trackGa4PricingOffer('plus_view', plan)
			},
			{ threshold: 0.5 },
		)
		const onVisible = () => {
			if (document.hidden || viewed.has(card)) return
			observer.unobserve(row)
			observer.observe(row)
		}
		observer.observe(row)
		document.addEventListener('visibilitychange', onVisible)
		onCleanup(() => {
			observer.disconnect()
			document.removeEventListener('visibilitychange', onVisible)
		})
	}
}
