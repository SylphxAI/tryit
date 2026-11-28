import { type GameMetadata, getAllGameMetadata } from '@/games/registry'
import { CONTACT_EMAIL } from '@/lib/config/app'
import { gamePath } from '@/lib/game-slug'
import { locales } from '@/lib/i18n/config'
import {
	FAMILY_SEATS,
	formatListPrice,
	listPrice,
	listPriceMinor,
	offerPrice,
} from './catalogue-prices'
import type { MarketingFaqItem } from './marketing-faq-item'

export type UseCaseCta = {
	label: string
	href: string
}

export type UseCaseGameLink = {
	label: string
	href: string
}

export type UseCaseWorkflowStep = {
	title: string
	body: string
	/** `links`, when present, renders the group as internal links to game pages. */
	groups?: readonly { heading: string; games: string; links?: readonly UseCaseGameLink[] }[]
}

export type UseCaseComparisonRow = {
	feature: string
	columns: readonly [string, string, string]
}

export type UseCaseOffer = {
	name: string
	price: string
	priceCurrency: string
}

export type UseCaseSpec = {
	slug:
		| 'daily-word-and-logic-puzzles-online'
		| 'family-brain-games-no-ads'
		| 'quick-brain-break-no-sign-up'
	path: `/use-cases/${UseCaseSpec['slug']}`
	/** One-line summary for `/llms.txt`. */
	llmsSummary: string
	metaTitle: string
	metaDescription: string
	eyebrow: string
	h1: string
	heroSubhead: string
	facts: readonly string[]
	primaryCta: UseCaseCta
	secondaryCta: UseCaseCta
	workflowTitle: string
	workflowSubtitle: string
	workflows: readonly UseCaseWorkflowStep[]
	comparisonTitle: string
	comparisonSubtitle: string
	comparisonHeaders: readonly [string, string, string, string]
	comparisonRows: readonly UseCaseComparisonRow[]
	faqTitle: string
	faqs: readonly MarketingFaqItem[]
	closingCta: {
		title: string
		body: string
		note: string
	}
	softwareName: string
	softwareDescription: string
	offers: readonly UseCaseOffer[]
}

const ALL_GAMES = getAllGameMetadata()
const TOTAL_GAMES = ALL_GAMES.length

const minutes = (game: GameMetadata) => game.display.durationMinutes
const SHORTEST = Math.min(...ALL_GAMES.map(minutes))
const LONGEST = Math.max(...ALL_GAMES.map(minutes))

/** Typical play-time bands, read from each game's registry estimate. */
const TIME_BANDS = [
	{ label: 'About 2–3 minutes', test: (m: number) => m <= 3 },
	{ label: 'About 4–5 minutes', test: (m: number) => m > 3 && m <= 5 },
	{ label: 'Up to 10 minutes', test: (m: number) => m > 5 },
] as const

const BREAK_FAMILIES = [
	{ heading: 'Words', categories: ['word'] },
	{ heading: 'Logic & numbers', categories: ['logic', 'math'] },
	{ heading: 'Spatial', categories: ['spatial'] },
] as const satisfies readonly { heading: string; categories: readonly GameMetadata['category'][] }[]

function gamesIn(
	categories: readonly GameMetadata['category'][],
	band?: (m: number) => boolean,
): GameMetadata[] {
	return ALL_GAMES.filter(
		(game) =>
			(categories as readonly string[]).includes(game.category) &&
			(band === undefined || band(minutes(game))),
	).sort((a, b) => minutes(a) - minutes(b) || a.sortOrder - b.sortOrder)
}

const nameList = (games: readonly GameMetadata[]) =>
	games.length === 0 ? '—' : games.map((game) => game.name).join(', ')

const QUICKEST = ALL_GAMES.filter((game) => minutes(game) <= 3)

const PASS = listPrice('puzzled_starter_unlock')
const PASS_GBP = listPrice('puzzled_starter_unlock', 'gbp')
const PLUS_MONTH = listPrice('plus_individual_monthly')
const PLUS_YEAR = listPrice('plus_individual_yearly')
const PLUS_MONTH_GBP = listPrice('plus_individual_monthly', 'gbp')
const PLUS_YEAR_GBP = listPrice('plus_individual_yearly', 'gbp')
const FAMILY_MONTH = listPrice('plus_family_monthly')
const FAMILY_YEAR = listPrice('plus_family_yearly')
const FAMILY_MONTH_GBP = listPrice('plus_family_monthly', 'gbp')
const FAMILY_YEAR_GBP = listPrice('plus_family_yearly', 'gbp')
const FAMILY_YEAR_PER_PERSON_MONTH = formatListPrice(
	Math.round(listPriceMinor('plus_family_yearly') / 12 / FAMILY_SEATS),
)
const PLUS_MONTH_TIMES_SEATS = formatListPrice(
	listPriceMinor('plus_individual_monthly') * FAMILY_SEATS,
)

export const USE_CASE_SPECS = {
	'daily-word-and-logic-puzzles-online': {
		slug: 'daily-word-and-logic-puzzles-online',
		path: '/use-cases/daily-word-and-logic-puzzles-online',
		llmsSummary: `${TOTAL_GAMES} daily games, any 3 free each day, a daily reset at 16:00 UTC, and full archive access with Plus.`,
		metaTitle: `${TOTAL_GAMES} Daily Word, Logic, Number & Spatial Puzzles Online`,
		metaDescription: `Play ${TOTAL_GAMES} daily word, logic, number, and spatial puzzles in one clean web suite. Pick any 3 to play free every day with no account; unlock all ${TOTAL_GAMES} games and the full archive with a ${PASS} 3-Day Pass or from ${PLUS_MONTH}/mo.`,
		eyebrow: `${TOTAL_GAMES} daily puzzles · Fresh set every day`,
		h1: 'One daily puzzle habit—word, logic, number, and spatial games under one roof.',
		heroSubhead: `Instead of hopping across five cluttered puzzle sites, play ${TOTAL_GAMES} handcrafted daily games in one fast web app. Everyone gets the same daily puzzle set at 16:00 UTC, you pick any 3 of today's ${TOTAL_GAMES} games to play free with no account, and every finished solve is server-verified so streaks and personal stats stay accurate.`,
		facts: [
			`${TOTAL_GAMES} handcrafted daily games`,
			'Any 3 games free every day, no account needed',
			'Zero ads on puzzle boards',
			'Daily reset at 16:00 UTC',
		],
		primaryCta: {
			label: 'Pick your 3 free games',
			href: '/?entry_surface=seo_daily-word-and-logic-puzzles-online',
		},
		secondaryCta: {
			label: `Unlock all ${TOTAL_GAMES} games + archive (${PASS} 3-Day Pass or ${PLUS_MONTH}/mo)`,
			href: '/pricing?entry_surface=seo_daily-word-and-logic-puzzles-online',
		},
		workflowTitle: 'How the daily suite fits together',
		workflowSubtitle:
			'Start free in your browser, move cleanly between puzzle genres, and catch up on missed days anytime.',
		workflows: [
			{
				title: 'Pick any 3 games to play free every day—no login wall',
				body: `Choose any 3 of today's ${TOTAL_GAMES} games and play them straight in your browser, no account needed. A game you pick stays open all day. Ads are never rendered while playing any puzzle board, and finished solves produce a spoiler-free share card.`,
			},
			{
				title: `Switch between ${TOTAL_GAMES} word, logic, number, and spatial challenges`,
				body: 'Every daily drop spans four distinct puzzle families with one global seed:',
				groups: [
					{
						heading: 'Word (9)',
						games: 'Five, Quartet, Hive, Mini Grid, Rungs, Frame, Quad, Cipher, Hunt.',
					},
					{
						heading: 'Logic (4)',
						games: 'Sudoku, Paint (nonogram), Crowns, Duo.',
					},
					{
						heading: 'Number (2)',
						games: 'Arithmo, Cage Sudoku.',
					},
					{
						heading: 'Spatial (4)',
						games: 'Match, Slides, Path, Spots.',
					},
				],
			},
			{
				title: 'Play any missed day in the archive and keep verified streaks',
				body: `Grab a 3-Day Pass (${PASS} / ${PASS_GBP} one-time, no auto-renewal) to test the whole suite, or join Tryit Plus (${PLUS_MONTH}/mo or ${PLUS_YEAR}/yr | ${PLUS_MONTH_GBP}/mo or ${PLUS_YEAR_GBP}/yr) to unlock all ${TOTAL_GAMES} daily games, the complete past-day archive, detailed stats, and zero ads anywhere on the site.`,
			},
		],
		comparisonTitle: 'How Tryit compares',
		comparisonSubtitle: 'Verified differences based on shipped Tryit plans and board rules.',
		comparisonHeaders: [
			'Feature',
			'Scattered Free Puzzle Sites',
			'Legacy Newspaper Subscriptions',
			'Tryit (tryit.fun)',
		],
		comparisonRows: [
			{
				feature: 'Game variety',
				columns: [
					'1 game per tab, clunky clones',
					'Word-heavy; separate paid tiers',
					`${TOTAL_GAMES} daily games across Word, Logic, Number & Spatial in one place`,
				],
			},
			{
				feature: 'Free daily play',
				columns: [
					'Aggressive pop-ups & redirects',
					'Hard paywall after a few puzzles',
					`Any 3 of ${TOTAL_GAMES} games free every day, zero account needed, zero board ads`,
				],
			},
			{
				feature: 'Verified results',
				columns: [
					'Client-side scores easily faked',
					'Basic completion ticks',
					'Server-verified finishes on a single global daily seed',
				],
			},
			{
				feature: 'Pricing',
				columns: [
					'Cluttered ad trackers',
					'$15–$25/mo bundles',
					`3-Day Pass ${PASS} · Plus ${PLUS_MONTH}/mo or ${PLUS_YEAR}/yr · Family (${FAMILY_SEATS} seats) ${FAMILY_MONTH}/mo`,
				],
			},
		],
		faqTitle: 'Frequently asked questions',
		faqs: [
			{
				question: 'Which puzzles are free on Tryit?',
				answer: `Any 3 of today's ${TOTAL_GAMES} games, chosen by you, are free every day with no account required. A game you pick stays open all day; Tryit Plus or a 3-Day Pass opens the rest and the archive.`,
			},
			{
				question: 'When do new daily puzzles reset?',
				answer: `All ${TOTAL_GAMES} daily puzzles refresh at 16:00 UTC with the same daily set for players worldwide.`,
			},
			{
				question: 'What does Tryit Plus unlock?',
				answer: `Tryit Plus unlocks all ${TOTAL_GAMES} daily games, the full archive of past days, per-game stats and streaks, and ad-free play everywhere for ${PLUS_MONTH}/month or ${PLUS_YEAR}/year (${PLUS_MONTH_GBP}/month or ${PLUS_YEAR_GBP}/year).`,
			},
			{
				question: `Can I try all ${TOTAL_GAMES} games without a recurring subscription?`,
				answer: `Yes. The 3-Day Pass gives 3 days of full Plus and archive access for a one-time payment of ${PASS} USD or ${PASS_GBP} GBP with no renewal.`,
			},
		],
		closingCta: {
			title: `Start with 3 free games today, or unlock all ${TOTAL_GAMES}`,
			body: 'No pop-ups on the puzzle board, server-verified daily streaks, and transparent VAT-inclusive plans.',
			note: `Questions? Email ${CONTACT_EMAIL}`,
		},
		softwareName: 'Tryit',
		softwareDescription: `${TOTAL_GAMES} daily word, logic, number, and spatial puzzles in one web suite with a shared daily reset at 16:00 UTC, server-verified streaks, and full past-day archive access.`,
		offers: [
			{ name: 'Free (any 3 games a day)', price: '0', priceCurrency: 'USD' },
			{ name: '3-Day Pass', price: offerPrice('puzzled_starter_unlock'), priceCurrency: 'USD' },
			{
				name: 'Tryit Plus (Monthly)',
				price: offerPrice('plus_individual_monthly'),
				priceCurrency: 'USD',
			},
			{
				name: 'Tryit Plus (Yearly)',
				price: offerPrice('plus_individual_yearly'),
				priceCurrency: 'USD',
			},
		],
	},
	'family-brain-games-no-ads': {
		slug: 'family-brain-games-no-ads',
		path: '/use-cases/family-brain-games-no-ads',
		llmsSummary: `Zero-distraction daily puzzles for up to ${FAMILY_SEATS} family accounts in ${locales.length} locales.`,
		metaTitle: 'Ad-Free Daily Brain Games for Families (4 Seats)',
		metaDescription: `Clean, distraction-free daily word, math, and logic puzzles for up to 4 family members—each with separate streaks and stats. Zero in-game ads, 8 languages. Family plan from ${FAMILY_MONTH}/mo or ${FAMILY_MONTH_GBP}/mo.`,
		eyebrow: 'Up to 4 family seats · Zero in-game ads',
		h1: 'Clean brain games the whole family can play—with separate streaks and zero distractions.',
		heroSubhead: `Most puzzle apps interrupt every round with loud video ads and dark-pattern timers. Tryit never shows an ad while you are solving a puzzle—and Tryit Family gives up to four people full, 100% ad-free access to all ${TOTAL_GAMES} daily games and past archives, each with their own stats, streaks, and preferred language.`,
		facts: [
			'4 individual accounts, 1 plan',
			'Zero ads while playing',
			'Zero ads anywhere on Plus Family',
			`${locales.length} UI languages per member`,
		],
		primaryCta: {
			label: 'Start Tryit Family (4 seats)',
			href: '/pricing?entry_surface=seo_family-brain-games-no-ads#family',
		},
		secondaryCta: {
			label: 'Play 3 free games first',
			href: '/?entry_surface=seo_family-brain-games-no-ads',
		},
		workflowTitle: 'Built for multi-person households',
		workflowSubtitle:
			'Separate streaks, eight UI languages, and zero interruptions on puzzle boards.',
		workflows: [
			{
				title: 'Zero interruptions while solving—for everyone',
				body: 'Even on the 3 free daily picks, Tryit never puts banners, pop-ups, or video ads on a puzzle board. Upgrade to Tryit Family and every screen—including the archive index and result cards—stays 100% ad-free.',
			},
			{
				title: 'One family plan covers 4 individual accounts',
				body: `Subscribe once (${FAMILY_MONTH}/mo or ${FAMILY_YEAR}/yr USD · ${FAMILY_MONTH_GBP}/mo or ${FAMILY_YEAR_GBP}/yr GBP—about ${FAMILY_YEAR_PER_PERSON_MONTH}/person/month on yearly) and invite up to 3 family members via an invite link. Everyone keeps their own login, streak, and solve history, and can compare spoiler-free result cards at the dinner table.`,
			},
			{
				title: 'Eight languages so grandparents, parents, and kids play comfortably',
				body: 'Each member sets their own interface language independently across English (US & UK), 繁體中文 (香港 & 台灣), 简体中文, 日本語, Español, and Português (Brasil).',
			},
		],
		comparisonTitle: 'Why households pick Tryit Family',
		comparisonSubtitle: 'One VAT-inclusive subscription replaces up to four individual plans.',
		comparisonHeaders: [
			'Feature',
			'Ad-Supported Puzzle Apps',
			'Individual Subscriptions × 4',
			'Tryit Family (tryit.fun)',
		],
		comparisonRows: [
			{
				feature: 'In-game distractions',
				columns: [
					'Video ads between rounds, coin shops',
					'Ad-free, but 4 separate bills',
					'Zero ads on boards or anywhere else',
				],
			},
			{
				feature: 'Seats & progress',
				columns: [
					'Shared tablet = overwritten stats',
					'$20+/mo for 4 accounts',
					'Up to 4 separate accounts, each with private streaks & stats',
				],
			},
			{
				feature: 'Language support',
				columns: [
					'Usually English-only',
					'Varies',
					'8 locales selectable per player (en-US, en-GB, zh-HK, zh-TW, zh-CN, ja, es, pt-BR)',
				],
			},
			{
				feature: 'Family price (VAT incl.)',
				columns: [
					'Free with data/ad trackers',
					`${FAMILY_SEATS} × ${PLUS_MONTH} = ${PLUS_MONTH_TIMES_SEATS}/mo`,
					`${FAMILY_MONTH}/mo or ${FAMILY_YEAR}/yr USD · ${FAMILY_MONTH_GBP}/mo or ${FAMILY_YEAR_GBP}/yr GBP`,
				],
			},
		],
		faqTitle: 'Frequently asked questions',
		faqs: [
			{
				question: 'Are there ads while playing Tryit?',
				answer:
					'No. Tryit never shows ads while a puzzle is being played, and Tryit Plus and Tryit Family accounts have zero ads anywhere on the site.',
			},
			{
				question: 'How many people does Tryit Family cover?',
				answer:
					'Tryit Family covers up to 4 people (the plan owner plus 3 invited members), each with their own account, streaks, and stats.',
			},
			{
				question: 'Can family members use different languages?',
				answer:
					'Yes. Each player can choose from 8 locales: en-US, en-GB, zh-HK, zh-TW, zh-CN, ja, es, and pt-BR.',
			},
			{
				question: 'How much does Tryit Family cost?',
				answer: `Tryit Family is ${FAMILY_MONTH}/month or ${FAMILY_YEAR}/year USD (${FAMILY_MONTH_GBP}/month or ${FAMILY_YEAR_GBP}/year GBP), VAT inclusive.`,
			},
		],
		closingCta: {
			title: 'One subscription, four separate daily streaks',
			body: `Share all ${TOTAL_GAMES} daily games, the full archive, and ad-free play across four family accounts.`,
			note: `Questions? Email ${CONTACT_EMAIL}`,
		},
		softwareName: 'Tryit Family',
		softwareDescription:
			'Ad-free daily word, logic, number, and spatial brain games for up to 4 family members, each with their own streaks, stats, and full archive access.',
		offers: [
			{
				name: 'Tryit Family (Monthly, 4 seats)',
				price: offerPrice('plus_family_monthly'),
				priceCurrency: 'USD',
			},
			{
				name: 'Tryit Family (Yearly, 4 seats)',
				price: offerPrice('plus_family_yearly'),
				priceCurrency: 'USD',
			},
			{
				name: 'Tryit Family (Yearly GBP, 4 seats)',
				price: offerPrice('plus_family_yearly', 'gbp'),
				priceCurrency: 'GBP',
			},
		],
	},
	'quick-brain-break-no-sign-up': {
		slug: 'quick-brain-break-no-sign-up',
		path: '/use-cases/quick-brain-break-no-sign-up',
		llmsSummary: `Short daily puzzles (about ${SHORTEST}–${LONGEST} minutes each) grouped by the time you have; any 3 free a day in the browser with no sign-up.`,
		metaTitle: `Quick Brain Break Games, No Sign-Up (${SHORTEST}–${LONGEST} Minutes)`,
		metaDescription: `Short daily word, logic, number and spatial puzzles you can finish in about ${SHORTEST} to ${LONGEST} minutes. Open the site, pick any 3 games free, and play in your browser with no account and no ads on the board.`,
		eyebrow: `Brain breaks · ${SHORTEST}–${LONGEST} minutes · No sign-up`,
		h1: 'A quick brain break that fits the time you actually have.',
		heroSubhead: `Every game here is one small daily puzzle with a clear finish, so a break ends instead of sprawling. Most take about ${SHORTEST} to 5 minutes; none needs an account, a download or a tutorial video. Pick any 3 of today's ${TOTAL_GAMES} games, play them free in your browser, and get back to your day.`,
		facts: [
			'No account, no download',
			`${QUICKEST.length} games take about ${SHORTEST}–3 minutes`,
			'One puzzle per game per day, with a clear finish',
			'No ads on the puzzle board',
		],
		primaryCta: {
			label: "Pick today's 3 free games",
			href: '/',
		},
		secondaryCta: {
			label: 'Browse every game',
			href: '/games',
		},
		workflowTitle: 'How a break works',
		workflowSubtitle: 'From first tap to finished in a few minutes, with nothing to set up.',
		workflows: [
			{
				title: 'Open and pick, with no sign-up',
				body: "Choose any 3 of today's games and start straight away in your browser. A game you pick stays open all day, so you can finish it on a later break.",
			},
			{
				title: 'Match the game to the break',
				body: 'Typical times per game; the puzzle is the same for everyone today.',
				groups: BREAK_FAMILIES.map((family) => {
					const games = gamesIn(family.categories)
					return {
						heading: family.heading,
						games: games.map((game) => `${game.name} (~${minutes(game)} min)`).join(', '),
						links: games.map((game) => ({
							label: `${game.name} (~${minutes(game)} min)`,
							href: gamePath(game.slug),
						})),
					}
				}),
			},
			{
				title: 'Finish, share if you like, and stop',
				body: 'Each game has one daily puzzle, so there is no endless next level. Share a spoiler-free result card if you want; a free account is optional and only keeps your streak and stats across devices.',
			},
		],
		comparisonTitle: 'Which games fit your break',
		comparisonSubtitle:
			'Typical times from each game’s own estimate. Your first try at a new game may take longer.',
		comparisonHeaders: ['Time you have', 'Words', 'Logic & numbers', 'Spatial'],
		comparisonRows: TIME_BANDS.map((band) => ({
			feature: band.label,
			columns: [
				nameList(gamesIn(BREAK_FAMILIES[0].categories, band.test)),
				nameList(gamesIn(BREAK_FAMILIES[1].categories, band.test)),
				nameList(gamesIn(BREAK_FAMILIES[2].categories, band.test)),
			],
		})),
		faqTitle: 'Frequently asked questions',
		faqs: [
			{
				question: 'Do I need an account to play?',
				answer: `No. Any 3 of today's ${TOTAL_GAMES} games are free every day without an account. An optional free account keeps your streak and stats across devices.`,
			},
			{
				question: 'What is the quickest game?',
				answer: `${nameList(ALL_GAMES.filter((game) => minutes(game) === SHORTEST))} usually takes about ${SHORTEST} minutes. ${nameList(QUICKEST.filter((game) => minutes(game) !== SHORTEST))} take about 3.`,
			},
			{
				question: 'Will a break turn into an hour?',
				answer:
					'Not by design. Each game has one puzzle a day with a clear finish, and there is no infinite feed of levels to pull you along.',
			},
			{
				question: 'When do new puzzles arrive?',
				answer: 'Every day at 16:00 UTC, with the same puzzles for everyone.',
			},
			{
				question: 'What if I want more than 3 games?',
				answer: `Tryit Plus or a one-time 3-Day Pass opens all ${TOTAL_GAMES} games and the archive of past days; current prices are on the pricing page.`,
			},
		],
		closingCta: {
			title: 'Take your break now',
			body: 'Three free puzzles, no sign-up, and a clear finish.',
			note: `Questions? Email ${CONTACT_EMAIL}`,
		},
		softwareName: 'Tryit',
		softwareDescription: `Short daily word, logic, number and spatial puzzles for a quick break, each about ${SHORTEST}–${LONGEST} minutes, playable in the browser with no account.`,
		offers: [{ name: 'Free (any 3 games a day)', price: '0', priceCurrency: 'USD' }],
	},
} as const satisfies Record<string, UseCaseSpec>

export type UseCaseSlug = keyof typeof USE_CASE_SPECS

/** What the SoftwareApplication + FAQPage graph reads; use cases and comparisons share it. */
export type LandingJsonLdSource = Pick<
	UseCaseSpec,
	'softwareName' | 'softwareDescription' | 'offers' | 'faqs'
> & { path: string }

export function buildUseCaseJsonLd(spec: LandingJsonLdSource, origin = 'https://tryit.fun') {
	const baseOrigin = origin.replace(/\/+$/, '')
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'SoftwareApplication',
				name: spec.softwareName,
				applicationCategory: 'GameApplication',
				operatingSystem: 'Web',
				inLanguage: [...locales],
				url: `${baseOrigin}${spec.path}`,
				description: spec.softwareDescription,
				offers: spec.offers.map((offer) => ({
					'@type': 'Offer',
					name: offer.name,
					price: offer.price,
					priceCurrency: offer.priceCurrency,
				})),
				publisher: {
					'@type': 'Organization',
					name: 'Sylphx Limited',
					url: 'https://sylphx.com',
					email: CONTACT_EMAIL,
				},
			},
			{
				'@type': 'FAQPage',
				mainEntity: spec.faqs.map((faq) => ({
					'@type': 'Question',
					name: faq.question,
					acceptedAnswer: {
						'@type': 'Answer',
						text: faq.answer,
					},
				})),
			},
		],
	}
}
