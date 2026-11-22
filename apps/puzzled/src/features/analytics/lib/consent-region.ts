export type ConsentRegion = 'eea' | 'non-eea'

// Assigned ISO 3166-1 alpha-2 codes, excluding the EEA-30, GB, CH and
// AX GF GG GI GP IM JE MF MQ RE SJ YT. Unassigned, reserved and
// Cloudflare-specific codes must never enable opt-out defaults.
const OPT_OUT_COUNTRIES = new Set(
	`
AD AE AF AG AI AL AM AO AQ AR AS AU AW AZ BA BB BD BF BH BI BJ BL BM BN
BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CI CK CL CM CN CO CR CU CV CW
CX DJ DM DO DZ EC EG EH ER ET FJ FK FM FO GA GD GE GH GL GM GN GQ GS GT
GU GW GY HK HM HN HT ID IL IN IO IQ IR JM JO JP KE KG KH KI KM KN KP KR
KW KY KZ LA LB LC LK LR LS LY MA MC MD ME MG MH MK ML MM MN MO MP MR MS
MU MV MW MX MY MZ NA NC NE NF NG NI NP NR NU NZ OM PA PE PF PG PH PK PM
PN PR PS PW PY QA RS RU RW SA SB SC SD SG SH SL SM SN SO SR SS ST SV SX
SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE ZA ZM ZW
`
		.trim()
		.split(/\s+/),
)

export function consentRegion(country: string | null): ConsentRegion {
	return country !== null && OPT_OUT_COUNTRIES.has(country) ? 'non-eea' : 'eea'
}
