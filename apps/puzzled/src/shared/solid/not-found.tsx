/** @jsxImportSource solid-js */
import { Meta, Title } from '@solidjs/meta'
import { HttpStatusCode } from '@solidjs/start'

/** Incomplete cutover routes must not be served as successful product pages. */
export default function NotFound() {
	return (
		<main>
			<HttpStatusCode code={404} />
			<Title>Page not found</Title>
			<Meta name="robots" content="noindex, nofollow" />
			<h1>Page not found</h1>
		</main>
	)
}
