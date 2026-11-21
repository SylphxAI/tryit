/** @jsxImportSource solid-js */
import { ChevronDown } from 'lucide-solid'
import { createUniqueId, For, Show } from 'solid-js'
import { currencyOptionLabel, serializeCurrencyCookie } from '@/lib/billing/currency'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { cn } from '@/lib/utils'
import styles from './pricing.module.css'

type Props = {
	locale: Locale
	currencies: string[]
	current: string
	/** Compact inline selector for tight above-the-fold unlock cards. */
	compact?: boolean
}

/**
 * Switches the pricing currency among those the catalogue publishes. The choice
 * is a strictly necessary preference cookie (like language and theme), so the
 * server renders the right prices on the next request with no flash.
 */
export function CurrencySwitcher(props: Props) {
	const t = createTranslator(props.locale)
	const selectId = createUniqueId()

	const choose = (code: string) => {
		if (!props.currencies.includes(code) || code === props.current) return
		// biome-ignore lint/suspicious/noDocumentCookie: strictly necessary preference; the server reads it to render prices
		document.cookie = serializeCurrencyCookie(code, window.location.protocol === 'https:')
		window.location.reload()
	}

	return (
		<Show when={props.currencies.length > 1}>
			<fieldset
				class={cn(
					'flex min-w-0 max-w-full items-center border-0 p-0',
					props.compact ? 'shrink-0 gap-1.5' : 'gap-3',
					!props.compact && styles.currency,
				)}
			>
				<legend class="sr-only">{t('plus.pricing.currencyLabel')}</legend>
				<label
					for={selectId}
					class={props.compact ? 'sr-only' : 'shrink-0 text-sm text-muted-foreground'}
				>
					{t('plus.pricing.currencyLabel')}
				</label>
				<div class="relative min-w-0 max-w-full">
					<select
						id={selectId}
						value={props.current}
						onChange={(event) => choose(event.currentTarget.value)}
						class={cn(
							'cursor-pointer appearance-none truncate rounded-xl border border-border bg-card font-semibold text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
							props.compact
								? 'min-h-11 max-w-[10.5rem] py-1.5 pl-2.5 pr-8 text-xs'
								: 'min-h-12 w-full max-w-[min(18rem,calc(100vw-8.5rem))] py-2 pl-3.5 pr-9 text-sm',
						)}
					>
						<For each={props.currencies}>
							{(code) => (
								<option value={code} selected={code === props.current}>
									{currencyOptionLabel(code, props.locale)}
								</option>
							)}
						</For>
					</select>
					<ChevronDown
						aria-hidden="true"
						class={cn(
							'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground',
							props.compact ? 'right-2.5' : 'right-3',
						)}
					/>
				</div>
			</fieldset>
		</Show>
	)
}
