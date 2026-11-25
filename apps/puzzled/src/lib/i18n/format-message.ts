export type Values = Record<string, string | number | boolean | Date | null | undefined>

type Format = (values?: Values, count?: number) => string

export function messageCompiler(locale: string) {
	let number: Intl.NumberFormat | undefined
	let twoDigits: Intl.NumberFormat | undefined
	let plural: Intl.PluralRules | undefined
	const quantity = (value: number) => {
		number ??= new Intl.NumberFormat(locale)
		return number.format(value)
	}

	return function compile(message: string): Format {
		if (!/[{}'<]/.test(message)) return () => message
		let at = 0
		const fail = (): never => {
			throw new Error(`Unsupported ICU message: ${message}`)
		}
		function consume(pattern: RegExp) {
			const match = pattern.exec(message.slice(at))
			if (!match) return fail()
			at += match[0].length
			return match[0].trim()
		}
		function argument(): Format {
			at++ // {
			const key = consume(/^\s*[^\s,{}]+\s*/)
			const get = (values?: Values) => {
				if (!values || !(key in values)) throw new Error(`Missing ICU value: ${key}`)
				return values[key]
			}
			if (message[at] === '}') {
				at++
				return (values) => {
					const value = get(values)
					return value || typeof value === 'number' ? String(value) : ''
				}
			}
			consume(/^,\s*/)
			const kind = consume(/^(number|plural)\s*/)
			if (kind === 'number') {
				const padded = message[at] === ','
				consume(padded ? /^,\s*::00\s*\}/ : /^\}/)
				return (values) => {
					const value = Number(get(values))
					if (!padded) return quantity(value)
					twoDigits ??= new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 })
					return twoDigits.format(value)
				}
			}
			consume(/^,\s*/)
			const forms = new Map<string, Format>()
			while (message[at] !== '}') {
				const selector = consume(/^(?:=-?\d+|zero|one|two|few|many|other)\s*/)
				if (forms.has(selector)) fail()
				consume(/^\{/)
				forms.set(selector, sequence(true))
				consume(/^\}\s*/)
			}
			at++
			const other = forms.get('other') ?? fail()
			return (values) => {
				const raw = get(values)
				const count = Number(raw)
				plural ??= new Intl.PluralRules(locale)
				const format = forms.get(`=${raw}`) ?? forms.get(plural.select(count)) ?? other
				return format(values, count)
			}
		}

		function sequence(inPlural: boolean): Format {
			const parts: (string | Format)[] = []
			let text = ''
			while (at < message.length) {
				const ch = message[at]
				if (ch === '}' && inPlural) break
				if (ch === '{' || (ch === '#' && inPlural)) {
					if (text) parts.push(text)
					text = ''
					if (ch === '{') parts.push(argument())
					else {
						at++
						parts.push((_, value) => quantity(value as number))
					}
				} else if (ch === "'" && message[at + 1] === "'") {
					at += 2
					text += "'"
				} else if (
					(ch === "'" && /[{}<>]/.test(message[at + 1] ?? '')) ||
					(ch === "'" && inPlural && message[at + 1] === '#')
				) {
					at++
					while (at < message.length) {
						const literal = message[at++]
						if (literal === "'") {
							if (message[at] !== "'") break
							at++
						}
						text += literal
					}
				} else {
					// Rich consent copy is read through raw(), never interpolated.
					if (ch === '}' || (ch === '<' && /^<\/?[a-z]/i.test(message.slice(at)))) fail()
					text += ch
					at++
				}
			}
			if (text) parts.push(text)
			return (values, count) =>
				parts.map((part) => (typeof part === 'string' ? part : part(values, count))).join('')
		}

		return sequence(false)
	}
}
