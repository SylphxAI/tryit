/** @jsxImportSource solid-js */
import { MetaProvider } from '@solidjs/meta'
import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { Suspense } from 'solid-js'
import { ConsentRuntime } from './features/analytics/solid/consent-runtime'
import { CatalogueBoundary } from './lib/i18n/catalogue-boundary'
import { ThemeProvider } from './shared/solid/theme'
import './app/globals.css'
import './shared/solid/fonts.css'

export default function App() {
	return (
		<Router
			root={(props) => (
				<MetaProvider>
					<ThemeProvider>
						<ConsentRuntime />
						<Suspense>
							<CatalogueBoundary>{props.children}</CatalogueBoundary>
						</Suspense>
					</ThemeProvider>
				</MetaProvider>
			)}
		>
			<FileRoutes />
		</Router>
	)
}
