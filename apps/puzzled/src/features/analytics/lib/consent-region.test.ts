import { expect, test } from 'bun:test'
import { consentRegion } from './consent-region'

// Complete ISO 3166-1 alpha-2 snapshot, independently filtered by the opt-in policy.
const assigned = new Set(
	`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(
		' ',
	),
)
const optIn = new Set(
	'AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE GB CH AX GF GG GI GP IM JE MF MQ RE SJ YT'.split(
		' ',
	),
)

test('every alpha-2 combination matches assigned countries minus opt-in exceptions', () => {
	expect(assigned.size).toBe(249)
	expect(optIn.size).toBe(44)
	const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
	for (const a of letters)
		for (const b of letters) {
			const code = a + b
			expect(consentRegion(code)).toBe(assigned.has(code) && !optIn.has(code) ? 'non-eea' : 'eea')
		}
})

test.each([null, '', 'XX', 'T1', 'us', ' US', 'US ', 'US, CA', 'US,US', 'USA', 'UЅ'])(
	'fails closed for %s',
	(country) => {
		expect(consentRegion(country)).toBe('eea')
	},
)
