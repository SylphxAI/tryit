/** @jsxImportSource solid-js */
import { MetaProvider } from '@solidjs/meta'
import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { Suspense } from 'solid-js'
import { AttributionCapture } from './features/analytics/solid/attribution-capture'
import { ThemeProvider } from './shared/solid/theme'
import './app/globals.css'
import './shared/solid/fonts.css'

export default function App() {
	return (
		<Router
			root={(props) => (
				<MetaProvider>
					<ThemeProvider>
						<AttributionCapture />
						<Suspense>{props.children}</Suspense>
					</ThemeProvider>
				</MetaProvider>
			)}
		>
			<FileRoutes />
		</Router>
	)
}
