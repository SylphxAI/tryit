/** @jsxImportSource solid-js */
import { createSignal, onMount, Show } from 'solid-js'
import { trialEndDate } from '@/lib/billing/plus'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'

/** Date is formatted after mount so the viewer's local date is not replaced by the server's date. */
export function TrialChargeLine(props: { days: number; price: string; locale: Locale }) {
	const t = createTranslator(props.locale)
	const [now, setNow] = createSignal<Date>()
	onMount(() => setNow(new Date()))
	return (
		<Show when={now()}>
			{(date) => (
				<p class="pt-1 text-sm font-semibold">
					{t('plus.pricing.trialLine', {
						days: props.days,
						price: props.price,
						date: trialEndDate(date(), props.days, props.locale),
					})}
				</p>
			)}
		</Show>
	)
}
