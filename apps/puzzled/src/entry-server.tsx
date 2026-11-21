/** @jsxImportSource solid-js */
import { createHandler, StartServer } from '@solidjs/start/server'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale } from '@/lib/i18n/config'
import { pageLocale } from '@/lib/i18n/page-locale'

export default createHandler(
	() => (
		<StartServer
			document={({ assets, children, scripts }) => {
				const request = getRequestEvent()?.request
				return (
					<html lang={request ? pageLocale(new URL(request.url).pathname) : defaultLocale}>
						<head>
							<meta charset="utf-8" />
							<meta name="viewport" content="width=device-width, initial-scale=1" />
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
