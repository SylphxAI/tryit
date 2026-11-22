/** @jsxImportSource solid-js */
import {
	createContext,
	createSignal,
	onCleanup,
	onMount,
	type ParentProps,
	useContext,
} from 'solid-js'

export const themeChoices = ['system', 'light', 'dark'] as const
export type Theme = (typeof themeChoices)[number]

// Keep the existing next-themes storage key so migrating browsers keep their choice.
const THEME_KEY = 'theme'
const SYSTEM_DARK = '(prefers-color-scheme: dark)'
const themeValue = (value: string | null): Theme =>
	value === 'light' || value === 'dark' ? value : 'system'

// Static, nonced, before CSS: apply the stored/system theme on the first paint.
export const initialThemeScript = `(()=>{let t;try{t=localStorage.getItem('${THEME_KEY}')}catch{}const d=t==='dark'||(t!=='light'&&matchMedia('${SYSTEM_DARK}').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`

const ThemeContext = createContext<{
	choice: () => Theme | undefined
	choose: (theme: Theme) => void
}>()

export function ThemeProvider(props: ParentProps) {
	const [choice, setChoice] = createSignal<Theme>()

	function render(theme: Theme) {
		setChoice(theme)
		const dark = theme === 'dark' || (theme === 'system' && matchMedia(SYSTEM_DARK).matches)
		document.documentElement.classList.toggle('dark', dark)
		document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
	}

	onMount(() => {
		let stored: string | null = null
		try {
			stored = localStorage.getItem(THEME_KEY)
		} catch {
			// Storage can be blocked. System mode still works.
		}
		render(themeValue(stored))
		const system = matchMedia(SYSTEM_DARK)
		const followSystem = () => {
			if (choice() === 'system') render('system')
		}
		const sync = (event: StorageEvent) => {
			if (event.storageArea === localStorage && (event.key === THEME_KEY || event.key === null)) {
				render(themeValue(event.newValue))
			}
		}
		system.addEventListener('change', followSystem)
		window.addEventListener('storage', sync)
		onCleanup(() => {
			system.removeEventListener('change', followSystem)
			window.removeEventListener('storage', sync)
		})
	})

	return (
		<ThemeContext.Provider
			value={{
				choice,
				choose(theme) {
					render(theme)
					try {
						localStorage.setItem(THEME_KEY, theme)
					} catch {
						// A blocked write should not undo the active document theme.
					}
				},
			}}
		>
			{props.children}
		</ThemeContext.Provider>
	)
}

export function useTheme() {
	const context = useContext(ThemeContext)
	if (!context) throw new Error('ThemeProvider is missing')
	return context
}
