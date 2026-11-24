/** @jsxImportSource solid-js */
import { createHandler, StartServer } from '@solidjs/start/server'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale } from '@/lib/i18n/config'
import { pageLocale } from '@/lib/i18n/page-locale'
import { initialThemeScript } from '@/shared/solid/theme'

export default createHandler(
	() => (
		<StartServer
			document={({ assets, children, scripts }) => {
				const event = getRequestEvent()
				const request = event?.request
				const nonce = event?.locals.cspNonce
				return (
					<html lang={request ? pageLocale(new URL(request.url).pathname) : defaultLocale}>
						<head>
							<meta charset="utf-8" />
							<meta
								name="viewport"
								content="width=device-width, initial-scale=1, viewport-fit=cover"
							/>
							<link rel="manifest" href="/manifest.webmanifest" />
							<script
								nonce={typeof nonce === 'string' ? nonce : undefined}
								innerHTML={initialThemeScript}
							/>
							{assets}
						</head>
						<body>
							<div id="app">{children}</div>
							{scripts}
						</body>
					</html>
				)
			}}
		/>
	),
	({ locals }) => ({ nonce: typeof locals.cspNonce === 'string' ? locals.cspNonce : undefined }),
)
