// Server-only: Home's route imports this inside its server query, so the SVG
// text never enters the client bundle.
const motifs = import.meta.glob<string>('/public/motifs/*-zoom.svg', {
	query: '?raw',
	import: 'default',
	eager: true,
})

export function lineupMotifSvg(slug: string): string | undefined {
	return motifs[`/public/motifs/${slug}-zoom.svg`]
}
