import { expect, test } from 'bun:test'
import { GET } from './consent-context'

test('returns validated Ads configuration on the private consent endpoint', async () => {
	const config = {
		GA_MEASUREMENT_ID: 'G-J5P11P794N',
		GOOGLE_ADS_ID: 'AW-18596053831',
		GOOGLE_ADS_PURCHASE_LABEL: 'didiCKiywr8dEMeGpaNF',
	}
	const before = Object.keys(config).map((key) => [key, process.env[key]] as const)
	Object.assign(process.env, config)
	try {
		const request = new Request('https://tryit.fun/api/consent-context', {
			headers: { 'CF-IPCountry': 'DE', 'Sec-GPC': '1' },
		})
		const response = GET({ request })
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(await response.json()).toMatchObject({
			region: 'EEA',
			gpc: true,
			ids: {
				ga: config.GA_MEASUREMENT_ID,
				ads: config.GOOGLE_ADS_ID,
				adsPurchaseLabel: config.GOOGLE_ADS_PURCHASE_LABEL,
			},
		})
		delete process.env.GOOGLE_ADS_ID
		expect((await GET({ request }).json()).ids).toEqual({
			ga: config.GA_MEASUREMENT_ID,
			ads: null,
			adsPurchaseLabel: null,
		})
	} finally {
		for (const [key, value] of before) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})
