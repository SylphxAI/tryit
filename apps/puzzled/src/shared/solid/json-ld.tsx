/** @jsxImportSource solid-js */

export function JsonLd(props: { value: object }) {
	// Prevent a string in the data from closing the script element.
	const data = () => JSON.stringify(props.value).replaceAll('<', '\u003c')
	return <script type="application/ld+json" innerHTML={data()} />
}
