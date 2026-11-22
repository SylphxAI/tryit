/** @jsxImportSource solid-js */

import { getAllGameMetadata } from '@/games/registry'
import { COMPANY_PHONE, CONTACT_EMAIL } from '@/lib/config/app'
import catalogue from '../../../../../config/commercial/catalogue.json'
import { JsonLd } from './json-ld'

export function SiteSchema(props: { origin: string }) {
	const name = 'Tryit'
	const description = `Daily word, logic and number puzzles. Any 3 of ${getAllGameMetadata().length} puzzles free every day, no account needed.`
	return (
		<>
			<JsonLd
				value={{
					'@context': 'https://schema.org',
					'@type': 'Organization',
					name,
					description,
					url: props.origin,
					logo: `${props.origin}/icons/icon-512.png`,
					parentOrganization: {
						'@type': 'Organization',
						name: catalogue.seller.legal_name,
						url: 'https://sylphx.com',
						identifier: catalogue.seller.company_number,
					},
					contactPoint: {
						'@type': 'ContactPoint',
						email: CONTACT_EMAIL,
						telephone: COMPANY_PHONE.replace(/\s/g, ''),
						contactType: 'customer support',
					},
				}}
			/>
			<JsonLd
				value={{
					'@context': 'https://schema.org',
					'@type': 'WebSite',
					name,
					description,
					url: props.origin,
					potentialAction: {
						'@type': 'SearchAction',
						target: {
							'@type': 'EntryPoint',
							urlTemplate: `${props.origin}/games?q={search_term_string}`,
						},
						'query-input': 'required name=search_term_string',
					},
				}}
			/>
		</>
	)
}
